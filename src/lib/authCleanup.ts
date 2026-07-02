import { clearPendingAttemptStorage } from './pendingAttempt'

/**
 * Local cleanup helpers shared by sign-out and account deletion.
 *
 * Extracted from useSignOut (hardening F6): the delete flow used to rely on a
 * single `signOut({scope:'local'})` that can reject at the storage layer,
 * landing the user on `/?account_deleted=1` with a live-looking token - the
 * signed-in welcome hero under a "your account has been deleted" toast.
 */

/**
 * Guaranteed credential sweep: remove every `sb-*-auth-token` key the app's
 * pre-paint auth detection scans for. An explicit logout or account deletion
 * must never leave a credential behind, even when supabase-js's own sign-out
 * fails (offline, revoked token, storage fault).
 */
export function sweepAuthTokens(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k)
    }
  } catch {
    // localStorage unavailable (private mode edge cases): nothing to clear
  }
}

/**
 * Erase app-owned local traces after account deletion (hardening F7).
 *
 * Without this, the surviving pending-attempt snapshot + resume marker can
 * rehydrate the deleted user's full results screen (score + domain breakdown)
 * for the next person in the SAME tab within 24h - directly contradicting the
 * just-shown "all your data have been deleted" message. Also prunes the
 * deleted uuid from the `cc_home_greeted` list so a re-signup gets a clean
 * first-login greeting. Device-scoped one-time-notice acks are deliberately
 * left alone: they are cosmetic and not the deleted user's data.
 */
export function eraseLocalTraces(userId?: string): void {
  clearPendingAttemptStorage()
  try {
    // Owned by _MockExam (RESUME_RESULTS_KEY): the guest results-resume marker.
    sessionStorage.removeItem('cc_resume_results')
  } catch {
    // sessionStorage unavailable: nothing to clear
  }
  if (userId) {
    try {
      const greeted = (localStorage.getItem('cc_home_greeted') || '').split(',').filter(Boolean)
      const next = greeted.filter(id => id !== userId)
      if (next.length !== greeted.length) {
        if (next.length > 0) localStorage.setItem('cc_home_greeted', next.join(','))
        else localStorage.removeItem('cc_home_greeted')
      }
    } catch {
      // localStorage unavailable: nothing to prune
    }
  }
}
