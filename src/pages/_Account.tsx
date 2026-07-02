import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { goToLogin } from '../lib/navigation'
import { useAuth } from '../hooks/useAuth'
import { useSEO } from '../hooks/useSEO'
import { getSupabase } from '../lib/supabase'
import { sweepAuthTokens, eraseLocalTraces } from '../lib/authCleanup'
import { logError } from '../lib/logger'
import { trackEvent } from '../lib/analytics'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { filterChipClass } from '../lib/buttonStyles'
import { Download, Trash2, UserCircle } from 'lucide-react'

const SUPPORT_EMAIL = 'alex@cloudcertprep.io'

// Optional, skippable exit-reason chips shown in the delete-confirmation
// modal (GROW M1). Purely a success/churn signal for retention analysis -
// never gates the Delete button, and only ever sent if the user opts in.
const DELETE_REASONS = [
  { value: 'passed_exam', label: 'Passed my exam' },
  { value: 'better_tool', label: 'Found a better tool' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'other', label: 'Other' },
] as const

/**
 * Account settings (signed-in only, noindex app route).
 *
 * GDPR controls:
 *   - Right to portability: "Download my data (JSON)" reads the user's own
 *     rows (RLS-scoped) and saves a JSON file entirely client-side.
 *   - Right to erasure: "Delete my account" invokes the `delete-account` Edge
 *     Function (RLS cannot remove an auth.users row from the client; only the
 *     service_role can). On success the local session is cleared and the user
 *     is sent home with ?account_deleted=1 (AuthLinkNotice acknowledges it). If
 *     the function is unreachable, the error copy falls back to the email path
 *     (still GDPR-compliant) rather than failing silently. The DB-side cascade
 *     (supabase/sql/delete-account-cascade.sql) guarantees all data rows go too.
 */
export function Account() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useSEO({
    title: 'Account · CloudCertPrep',
    description: 'Manage your CloudCertPrep account: export your data or request account deletion.',
    canonical: null,
  })

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteReason, setDeleteReason] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Synchronous re-entrancy guard (note 1): setDeleting is async, so a
  // state-only check lets rapid double-clicks both reach the invoke. Same
  // idiom as _MockExam's submittingRef.
  const deletingRef = useRef(false)

  // If the session dies while the delete modal is open (cross-tab sign-out or
  // deletion), the Delete button would silently no-op on `!user?.id` (note 4).
  // Close the modal instead: the page behind it already swaps to the
  // signed-out card. Never mid-delete (the local sign-out inside handleDelete
  // must not close its own progress view before the redirect).
  useEffect(() => {
    if (!authLoading && !user && showDeleteModal && !deletingRef.current) {
      setShowDeleteModal(false)
    }
  }, [authLoading, user, showDeleteModal])

  async function handleExport() {
    if (!user?.id) return
    setExporting(true)
    setExportError(null)
    setExportDone(false)
    try {
      const supabase = await getSupabase()
      const userId = user.id
      // RLS scopes each table to the signed-in user; select('*') so the export
      // carries every column we hold (portability = the full record). Page each
      // table so a heavy user (attempt_questions grows one row per answered
      // question) gets the COMPLETE record, not a silently truncated first page
      // if the project ever sets a PostgREST max-rows cap.
      const fetchAll = async (table: string): Promise<unknown[]> => {
        const PAGE = 1000
        const rows: unknown[] = []
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', userId)
            .range(from, from + PAGE - 1)
          if (error) throw error
          if (!data?.length) break
          rows.push(...data)
          if (data.length < PAGE) break
        }
        return rows
      }
      const [attempts, progress, questions] = await Promise.all([
        fetchAll('exam_attempts'),
        fetchAll('domain_progress'),
        fetchAll('attempt_questions'),
      ])

      const payload = {
        exported_at: new Date().toISOString(),
        // The consent record (accepted_terms_at) is written to user_metadata at
        // sign-up, so include it - it is personal data we hold about the user.
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          user_metadata: user.user_metadata ?? {},
        },
        exam_attempts: attempts,
        domain_progress: progress,
        attempt_questions: questions,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cloudcertprep-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportDone(true)
    } catch (err: unknown) {
      logError('Account.export', err)
      setExportError('Could not export your data. Please try again, or email ' + SUPPORT_EMAIL + '.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!user?.id) return
    if (deletingRef.current) return
    deletingRef.current = true
    const userId = user.id
    setDeleting(true)
    setDeleteError(null)
    try {
      const supabase = await getSupabase()
      // Optional exit-reason signal (GROW M1): anonymous, opt-in only - never
      // gates deletion, and only sent if the user tapped a chip.
      if (deleteReason) {
        trackEvent('account_delete_reason', { reason: deleteReason })
      }
      // 30s race (note 3): functions.invoke never times out on its own, and
      // the modal is deliberately unclosable mid-delete - a hung request would
      // lock the user on the spinner forever. The deletion itself is
      // idempotent server-side, so timing out into the retry copy is safe.
      const { error } = await Promise.race([
        supabase.functions.invoke('delete-account', { method: 'POST' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('delete-account timed out after 30s')), 30000)),
      ])
      if (error) throw error
      // The account (and session) no longer exist; clear the local token and
      // leave the app. The home banner acknowledges the deletion. signOut can
      // itself reject at the storage layer, which used to land the user on
      // /?account_deleted=1 with a live-looking token (signed-in hero under
      // the "account deleted" toast) - the guaranteed sweep closes that (F6),
      // and the traces erase keeps the deleted user's pending-attempt results
      // from rehydrating for the next person in this tab (F7).
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      sweepAuthTokens()
      eraseLocalTraces(userId)
      window.location.assign('/?account_deleted=1')
    } catch (err: unknown) {
      // FunctionsHttpError.message is a fixed string; log the response
      // status/body too so a real failure is diagnosable (note 2).
      logError('Account.delete', err)
      const ctx = (err as { context?: unknown }).context
      if (ctx instanceof Response) {
        const body = await ctx.clone().text().catch(() => '')
        logError('Account.delete.context', { status: ctx.status, body: body.slice(0, 500) })
      }
      deletingRef.current = false
      setDeleting(false)
      // Retry-first copy (note 5): the operation is idempotent, so "try
      // again" is the accurate first suggestion; email stays the fallback.
      setDeleteError(
        `We could not delete your account. Please try again in a moment. If it keeps failing, email ${SUPPORT_EMAIL} and we will erase it within 30 days.`,
      )
    }
  }

  if (authLoading) {
    return (
      <div className="p-4 md:p-8 min-h-[320px]">
        <LoadingSpinner text="Loading your account..." />
      </div>
    )
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary mb-2">Account</h1>
        <p className="text-text-muted text-sm md:text-base mb-8">Manage your data and account.</p>

        {!user ? (
          <Card padding="lg">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-bg-dark border border-border-hairline">
                <UserCircle className="w-4 h-4 text-text-primary" aria-hidden="true" />
              </span>
              <p className="text-text-primary font-semibold tracking-[-0.01em]">Sign in to manage your account</p>
            </div>
            <p className="text-text-muted text-sm mb-5 max-w-md">
              Your account settings, data export, and deletion controls are available once you sign in.
            </p>
            <Button onClick={() => goToLogin(navigate, location)} variant="primary" size="md">
              Sign in
            </Button>
          </Card>
        ) : (
          <div className="space-y-6 md:space-y-8">
            {/* Account identity */}
            <Card padding="md">
              <h2 className="text-sm font-mono uppercase tracking-[0.16em] text-text-muted mb-3">Signed in as</h2>
              <p className="text-text-primary font-medium break-all">{user.email}</p>
              {memberSince && <p className="text-text-muted text-sm mt-1">Member since {memberSince}</p>}
            </Card>

            {/* Data export (GDPR portability) */}
            <Card padding="md">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary mb-1">Export your data</h2>
              <p className="text-text-muted text-sm mb-4 max-w-prose">
                Download everything we store for your account, including your exam attempts and domain progress, as a single JSON file.
              </p>
              {exportError && (
                <Alert tone="danger" role="alert" className="mb-4">{exportError}</Alert>
              )}
              {exportDone && (
                <Alert tone="success" role="status" className="mb-4">Your data has been downloaded.</Alert>
              )}
              <Button
                onClick={handleExport}
                disabled={exporting}
                variant="secondary"
                leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
              >
                {exporting ? 'Preparing...' : 'Download my data (JSON)'}
              </Button>
            </Card>

            {/* Danger zone (GDPR erasure) */}
            <Card padding="md" className="!border-danger/30">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-danger mb-1">Delete account</h2>
              <p className="text-text-muted text-sm mb-4 max-w-prose">
                Permanently delete your account and all your data: exam attempts, domain progress, and your sign-in. This cannot be undone.
              </p>
              <Button
                onClick={() => { setConfirmText(''); setDeleteError(null); setDeleteReason(null); setShowDeleteModal(true) }}
                variant="danger"
                leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
              >
                Delete my account
              </Button>
            </Card>
          </div>
        )}
      </div>

      <Modal
        isOpen={showDeleteModal}
        title="Delete your account?"
        onClose={() => { if (!deleting) setShowDeleteModal(false) }}
      >
        <div className="space-y-4">
          <p className="text-text-primary">
            This permanently erases your account, exam history, and progress. It cannot be undone.
          </p>
          <p className="text-sm text-text-muted">
            Want a copy first?{' '}
            <button
              type="button"
              onClick={() => { setShowDeleteModal(false); handleExport() }}
              disabled={deleting}
              className="text-text-primary underline underline-offset-2 hover:text-text-primary/70 transition-colors"
            >
              Download your data
            </button>
          </p>
          <div>
            <p className="text-sm text-text-muted mb-2">Mind sharing why? (optional)</p>
            <div className="flex flex-wrap gap-2">
              {DELETE_REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDeleteReason(prev => (prev === r.value ? null : r.value))}
                  aria-pressed={deleteReason === r.value}
                  disabled={deleting}
                  className={filterChipClass({ active: deleteReason === r.value, size: 'sm' })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-text-muted">
            Type <span className="font-mono font-semibold text-text-primary">DELETE</span> to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            aria-label="Type DELETE to confirm account deletion"
            placeholder="DELETE"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={deleting}
          />
          {deleteError && <Alert tone="danger" role="alert">{deleteError}</Alert>}
          {deleting ? (
            <div className="py-4">
              <LoadingSpinner text="Deleting your account..." />
            </div>
          ) : (
            <div className="flex gap-3 mt-2">
              <Button onClick={() => setShowDeleteModal(false)} variant="secondary" className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleDelete} disabled={confirmText !== 'DELETE'} variant="danger" className="flex-1">
                Delete account
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
