import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'

/**
 * Sign-out helper that:
 *   1. Emits a `sign_out` analytics event.
 *   2. Calls Supabase Auth `signOut()` to clear the session (with a guaranteed
 *      local cleanup fallback).
 *   3. Redirects to the HOME page after the session is cleared.
 *
 * Home (not `/login`): every page works in guest mode, so dropping a
 * just-signed-out user onto a login wall reads as "you must authenticate to
 * continue", which is false here. Landing on `/` keeps them in the product as a
 * guest, which is the honest, lower-friction outcome.
 *
 * Centralises the three call sites in `Header.tsx` (desktop + mobile drawer)
 * and any future sign-out trigger so analytics + redirect stay in lockstep.
 */
export function useSignOut(): () => Promise<void> {
  return useCallback(async () => {
    trackEvent('sign_out')
    // Global sign-out revokes the refresh token server-side. If that call
    // fails (offline, already-revoked token -> 403, 5xx), supabase-js can leave
    // the local session in storage, which would land the user back on a page
    // still reading as "logged in". Belt and suspenders: try global, then a
    // `scope: 'local'` clear (no network call), then a guaranteed sweep of the
    // `sb-*-auth-token` keys the app's pre-paint auth detection looks for. An
    // explicit logout must never leave a credential behind.
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore: cleanup below is the guarantee
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k)
      }
    } catch {
      // localStorage unavailable (private mode edge cases): nothing to clear
    }
    // `/` is a prerendered Astro document. The Header that triggers sign-out
    // renders both inside the static-page HeaderIsland (no route table) and
    // inside AppIsland, so a react-router push could land on a router that
    // cannot render it. A real navigation works everywhere.
    window.location.assign('/')
  }, [])
}
