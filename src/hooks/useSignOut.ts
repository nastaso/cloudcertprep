import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'

/**
 * Sign-out helper that:
 *   1. Emits a `sign_out` analytics event (was missing from the Header inline
 *      handlers).
 *   2. Calls Supabase Auth `signOut()` to clear the session.
 *   3. Redirects to `/login` after the session is cleared.
 *
 * Centralises the three call sites in `Header.tsx` (desktop + mobile drawer)
 * and any future sign-out trigger so analytics + redirect stay in lockstep.
 */
export function useSignOut(): () => Promise<void> {
  return useCallback(async () => {
    trackEvent('sign_out')
    await supabase.auth.signOut()
    // `/login` is a prerendered Astro document. The Header that triggers
    // sign-out renders both inside the static-page HeaderIsland (no route
    // table) and inside AppIsland, so a react-router push could land on a
    // router that cannot render `/login`. A real navigation works everywhere.
    window.location.assign('/login')
  }, [])
}
