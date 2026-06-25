import { useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { Card } from './Card'
import { Alert } from './Alert'
import { buttonClass } from '../lib/buttonStyles'
import { useAuth } from '../hooks/useAuth'

const ACK_KEY = 'cloudcertprep_verified_welcome_ack'

type Notice = { kind: 'verified' } | { kind: 'expired' } | { kind: 'deleted' } | null

/**
 * Read the auth redirect markers from the URL exactly once on mount, then strip
 * them so a refresh is clean and the notice cannot replay from the URL. Two
 * cases land on home (the Supabase Site URL):
 *   - ?verified=1                              -> post-confirm welcome (P0-2)
 *   - ?error=...&error_code=otp_expired (or access_denied) -> dead link (P0-3)
 * `email_unverified` is the OAuth refusal handled on /login, so it is ignored
 * here. Bails before touching history/localStorage for the ~99.9% of visits
 * with no auth param, so normal traffic pays effectively nothing.
 */
function readNoticeOnce(): Notice {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const verified = params.get('verified') === '1'
  const deleted = params.get('account_deleted') === '1'
  const errorCode = params.get('error_code') || ''
  const errorVal = params.get('error') || ''
  const isExpired =
    errorCode === 'otp_expired'
    || errorVal === 'access_denied'
    || (errorVal !== '' && errorVal !== 'email_unverified')

  if (!verified && !deleted && !isExpired) return null

  // Strip every auth param so a refresh is clean (mirror _Login.tsx read-once).
  ;['verified', 'account_deleted', 'error', 'error_code', 'error_description'].forEach(k => params.delete(k))
  const qs = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)

  if (isExpired) return { kind: 'expired' } // the actionable failure wins
  if (deleted) return { kind: 'deleted' } // post-deletion acknowledgement
  try {
    if (localStorage.getItem(ACK_KEY)) return null
    localStorage.setItem(ACK_KEY, new Date().toISOString())
  } catch { /* private mode: still show once for this view */ }
  return { kind: 'verified' }
}

/**
 * Home-side safety net for the two auth redirects that previously dead-ended on
 * the marketing home with no signal. Renders null for normal traffic.
 */
export default function AuthLinkNotice({ practiceHref }: { practiceHref: string }) {
  const [notice, setNotice] = useState<Notice>(readNoticeOnce)
  // Reflect the REAL session, not the URL marker: a confirm link can land here
  // without an established session (confirmed on another device, cookie not
  // persisted), in which case asserting "You are signed in" is a lie that sends
  // the user off thinking they are logged in. Resolve before claiming it.
  const { user, loading: authLoading } = useAuth()
  if (!notice) return null

  if (notice.kind === 'expired') {
    return (
      <div className="mb-10 md:mb-12">
        <Alert tone="warning" role="alert" className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">
            That link has expired or was already used.{' '}
            <a href="/login" className="font-semibold underline">Request a new one</a>.
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-sm underline shrink-0">
            Dismiss
          </button>
        </Alert>
      </div>
    )
  }

  if (notice.kind === 'deleted') {
    return (
      <div className="mb-10 md:mb-12">
        <Alert tone="success" role="status" className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">Your account and all your data have been deleted. Thanks for trying CloudCertPrep.</span>
          <button type="button" onClick={() => setNotice(null)} className="text-sm underline shrink-0">
            Dismiss
          </button>
        </Alert>
      </div>
    )
  }

  // Only claim "signed in" once auth has resolved AND a session exists.
  const signedIn = !authLoading && Boolean(user)

  return (
    <div className="mb-10 md:mb-12">
      <Card padding="md" className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10">
          <CheckCircle className="w-6 h-6 text-success" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">
            {signedIn ? 'Your email is confirmed. You are signed in.' : 'Your email is confirmed.'}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {signedIn || authLoading
              ? 'Pick up where you left off and start your first exam.'
              : 'Sign in to save your progress, or jump straight into a practice exam.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!authLoading && !signedIn && (
            <a href="/login" className={buttonClass({ variant: 'brand', size: 'md' })}>
              Sign in
            </a>
          )}
          <a
            href={practiceHref}
            className={buttonClass({ variant: signedIn || authLoading ? 'brand' : 'ghost', size: 'md' })}
          >
            Start practice exam
          </a>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className={buttonClass({ variant: 'ghost', size: 'md' })}
          >
            Dismiss
          </button>
        </div>
      </Card>
    </div>
  )
}
