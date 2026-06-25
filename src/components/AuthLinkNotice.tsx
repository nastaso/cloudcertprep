import { useState, type ReactNode } from 'react'
import { CheckCircle, AlertTriangle, X } from 'lucide-react'
import { buttonClass } from '../lib/buttonStyles'
import { useAuth } from '../hooks/useAuth'

/**
 * Non-modal top notice: a dismissible toast pinned just below the header,
 * centered, above the fold. The fixed wrapper has pointer-events-none so the
 * empty gutters pass clicks through to the page (it never blocks like a modal);
 * only the card itself is interactive. `animate-enter` is reduced-motion-safe.
 */
function TopNotice({ role, borderClass, children }: { role: string; borderClass: string; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-16 z-[60] flex justify-center px-3 pointer-events-none">
      <div
        role={role}
        className={`pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-bg-card p-3.5 shadow-card-hover animate-enter ${borderClass}`}
      >
        {children}
      </div>
    </div>
  )
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

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
export default function AuthLinkNotice() {
  const [notice, setNotice] = useState<Notice>(readNoticeOnce)
  // Reflect the REAL session, not the URL marker: a confirm link can land here
  // without an established session (confirmed on another device, cookie not
  // persisted), in which case asserting "You are signed in" is a lie that sends
  // the user off thinking they are logged in. Resolve before claiming it.
  const { user, loading: authLoading } = useAuth()
  if (!notice) return null

  if (notice.kind === 'expired') {
    return (
      <TopNotice role="alert" borderClass="border-warning/40">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm text-text-primary">
          That link has expired or was already used.{' '}
          <a href="/login" className="font-semibold underline">Request a new one</a>.
        </span>
        <DismissButton onClick={() => setNotice(null)} />
      </TopNotice>
    )
  }

  if (notice.kind === 'deleted') {
    return (
      <TopNotice role="status" borderClass="border-success/30">
        <CheckCircle className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm text-text-primary">
          Your account and all your data have been deleted. Thanks for trying CloudCertPrep.
        </span>
        <DismissButton onClick={() => setNotice(null)} />
      </TopNotice>
    )
  }

  // Verified case. A just-verified user who IS signed in already gets the
  // returning-user welcome hero on the home page (HomeWelcome), so a toast on
  // top of it is redundant and, on small screens, overlaps that hero's heading.
  // So only show the verified toast when the session did NOT establish - the
  // one case where there is no welcome hero and the user must still sign in.
  // Wait for auth to resolve before deciding (avoids a flash either way).
  if (authLoading) return null
  if (user) return null

  return (
    <TopNotice role="status" borderClass="border-success/30">
      <CheckCircle className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-primary">Your email is confirmed.</span>
      <a href="/login" className={`${buttonClass({ variant: 'brand', size: 'sm' })} shrink-0`}>
        Sign in
      </a>
      <DismissButton onClick={() => setNotice(null)} />
    </TopNotice>
  )
}
