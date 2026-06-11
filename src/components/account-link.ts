/**
 * Programmatic helpers for the Google account-linking confirmation notice
 * (R5.4). Split from the component file so `AccountLinkNotice.tsx` only exports
 * a React component (required by `react-refresh/only-export-components`), and
 * so the detection logic in `useAuth.ts` can dispatch the event without
 * importing the component.
 *
 * Background: Supabase's default account-linking behaviour merges a new Google
 * sign-in into any existing account that shares the same verified email
 * (merge-by-verified-email). When that merge happens the user silently ends up
 * with one account carrying multiple linked identities. R5.4 requires we
 * surface a one-time confirmation so the user understands their Google sign-in
 * was linked to a pre-existing CloudCertPrep account rather than creating a
 * duplicate.
 */
import type { User } from '@supabase/supabase-js'

/** Fired once when a Google sign-in is detected as linked to an existing account. */
export const ACCOUNT_LINK_CONFIRMED_EVENT = 'account-link:google-confirmed'

/** The copy shown in the confirmation notice. Single source of truth (R5.4). */
export const ACCOUNT_LINK_MESSAGE =
  'We linked your Google sign-in to your existing CloudCertPrep account.'

/**
 * One-time acknowledgement flag. Persisting in localStorage means the
 * confirmation shows exactly once per browser — on the FIRST link — and never
 * again on subsequent Google sign-ins from the same merged account.
 */
const GOOGLE_LINK_ACK_KEY = 'cloudcertprep_google_link_ack'

/**
 * Pure predicate: does this user's identity set indicate that a Google
 * sign-in was merged into a pre-existing CloudCertPrep account?
 *
 * True when the `identities` list both contains a `google` provider AND has
 * more than one entry (the second identity being the account Google merged
 * into). This is the merge-by-verified-email signal R5.4 wants to surface.
 * Has no DOM/localStorage dependency so it is unit-testable in isolation.
 */
export function isGoogleLinkedToExistingAccount(user: User | null): boolean {
  if (!user) return false
  const identities = user.identities ?? []
  const hasGoogle = identities.some((identity) => identity.provider === 'google')
  const isLinkedToExisting = identities.length > 1
  return hasGoogle && isLinkedToExisting
}

/**
 * Detect the first-link moment for a signed-in user and, if it has not been
 * acknowledged before, dispatch the confirmation event exactly once.
 *
 * Detection is pragmatic (precise server-side "this identity was just linked"
 * signal is not available client-side): see `isGoogleLinkedToExistingAccount`.
 * The localStorage ack flag guarantees the notice fires on the first such
 * observation only.
 *
 * Safe to call on every SIGNED_IN transition; it self-guards.
 */
export function maybeNotifyGoogleLink(user: User | null): void {
  if (typeof window === 'undefined' || !user) return

  if (!isGoogleLinkedToExistingAccount(user)) return

  try {
    if (localStorage.getItem(GOOGLE_LINK_ACK_KEY)) return
    localStorage.setItem(GOOGLE_LINK_ACK_KEY, new Date().toISOString())
  } catch {
    // localStorage unavailable (private mode / blocked). Without a durable
    // ack flag we cannot guarantee once-only, so stay silent rather than risk
    // re-showing on every sign-in.
    return
  }

  window.dispatchEvent(new Event(ACCOUNT_LINK_CONFIRMED_EVENT))
}
