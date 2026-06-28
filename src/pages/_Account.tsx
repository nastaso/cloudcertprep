import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { goToLogin } from '../lib/navigation'
import { useAuth } from '../hooks/useAuth'
import { useSEO } from '../hooks/useSEO'
import { getSupabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { Download, Trash2, UserCircle } from 'lucide-react'

const SUPPORT_EMAIL = 'alex@cloudcertprep.io'

/**
 * Account settings (signed-in only, noindex app route).
 *
 * GDPR controls:
 *   - Right to portability: "Download my data (JSON)" reads the user's own
 *     rows (RLS-scoped) and saves a JSON file entirely client-side.
 *   - Right to erasure: handled via an email request for now. In-app
 *     self-service deletion (the `delete-account` Edge Function) is deferred
 *     until that function is deployed and its table list is audited against
 *     the live schema. See .kiro/ux/audit-2026-06-24/DEFERRED-delete-account.md.
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

            {/* Danger zone (GDPR erasure). In-app self-service deletion is
                deferred until the delete-account Edge Function is deployed and
                its table list audited; erasure is handled via an email request
                meanwhile. See .kiro/ux/audit-2026-06-24/DEFERRED-delete-account.md. */}
            <Card padding="md" className="!border-danger/30">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-danger mb-1">Delete account</h2>
              <p className="text-text-muted text-sm mb-4 max-w-prose">
                To permanently delete your account and all your data (exam attempts, domain progress, and your sign-in), email us from your account address and we will erase everything within 30 days. This cannot be undone.
              </p>
              <Button
                onClick={() => {
                  window.location.href =
                    `mailto:${SUPPORT_EMAIL}` +
                    `?subject=${encodeURIComponent('Account deletion request')}` +
                    `&body=${encodeURIComponent(`Please delete my CloudCertPrep account and all associated data.\n\nAccount email: ${user.email ?? ''}`)}`
                }}
                variant="secondary"
                leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
              >
                Email a deletion request
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
