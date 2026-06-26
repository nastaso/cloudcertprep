import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Alert } from './Alert'
import { ACCOUNT_LINK_CONFIRMED_EVENT, ACCOUNT_LINK_MESSAGE } from './account-link'

/**
 * One-time confirmation notice for the Google account-linking edge case
 * (R5.4). Listens for the ACCOUNT_LINK_CONFIRMED_EVENT dispatched from
 * `useAuth.ts` when a Google sign-in is detected as merged into a pre-existing
 * CloudCertPrep account (Supabase merge-by-verified-email). Renders the shared
 * `Alert` (success tone) as a dismissible toast pinned to the bottom of the
 * viewport — matching the existing transient-message pattern (Alert) and the
 * fixed-overlay placement used by CookieConsent, without introducing a new
 * notification system.
 *
 * The once-only guarantee lives in the localStorage ack flag set by
 * `maybeNotifyGoogleLink`; this component only renders when the event fires.
 */
export function AccountLinkNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onConfirmed = () => setVisible(true)
    window.addEventListener(ACCOUNT_LINK_CONFIRMED_EVENT, onConfirmed)
    return () => window.removeEventListener(ACCOUNT_LINK_CONFIRMED_EVENT, onConfirmed)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pointer-events-none">
      <Alert
        tone="success"
        role="status"
        className="relative w-full max-w-md pr-10 shadow-2xl pointer-events-auto animate-slide-up"
      >
        {ACCOUNT_LINK_MESSAGE}
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute top-0.5 right-0.5 w-11 h-11 inline-flex items-center justify-center text-success hover:text-success/70 transition-colors rounded-md"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </Alert>
    </div>
  )
}
