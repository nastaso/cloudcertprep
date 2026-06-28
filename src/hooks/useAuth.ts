import { useSyncExternalStore } from 'react'
import { getSupabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { trackEvent } from '../lib/analytics'
import { maybeNotifyGoogleLink } from '../components/account-link'
import { flushPendingAttempt, hasPendingAttempt } from '../lib/pendingAttempt'
import type { User } from '@supabase/supabase-js'

/**
 * Auth as a module-level singleton.
 *
 * One supabase.auth.getSession() call per page, regardless of how many
 * islands subscribe (Header, CertDashboard, Stats, AppIsland body, etc.).
 * Replaces the per-island AuthProvider context that previously fired three
 * separate getSession() round-trips on a single page load.
 *
 * Subscribe via `useAuth()`. Sign out via `useSignOut()` (kept as its own
 * file because it composes router-aware redirects).
 */

interface AuthState {
  user: User | null
  loading: boolean
}

let state: AuthState = { user: null, loading: true }
const listeners = new Set<() => void>()
let initialised = false
let prevUser: User | null = null
// True once onAuthStateChange has delivered any event. The initial
// getSession().then resolves asynchronously and can land AFTER a fast
// auth-state change; if an event already wrote state, the getSession result
// is stale and must not clobber it. (M2)
let authEventLanded = false

function setState(next: AuthState) {
  state = next
  listeners.forEach(cb => cb())
}

function init() {
  if (initialised || typeof window === 'undefined') return
  initialised = true

  // Best-effort sync check for a persisted Supabase session token. If none,
  // resolve loading=false immediately so the logged-out chrome paints
  // without a placeholder. A stale token only briefly keeps loading=true
  // until getSession() confirms; never shows a logged-out user a flash.
  //
  // SYNC: same scan also lives at window.__ccHasSession (BaseLayout.astro
  // inline pre-paint script). The two implementations must stay in lockstep.
  // Inline scripts can't import TS modules, so this duplication is forced.
  let hasToken = false
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        hasToken = true
        break
      }
    }
  } catch { /* localStorage unavailable */ }

  // An OAuth / magic-link / recovery callback returns as `?code=...` on whatever
  // page `redirectTo` pointed at. For OAuth that is wherever the user started
  // (often a marketing page), not only /login or /reset-password. The PKCE
  // exchange runs when the Supabase client is constructed (detectSessionInUrl),
  // so we MUST load Supabase to complete sign-in even with no persisted token.
  const hasAuthCallback = /[?&]code=/.test(window.location.search)

  // Logged-out with nothing to exchange: paint the logged-out chrome and skip
  // loading the Supabase client entirely. This is what keeps ~53 KB gz of auth
  // JS off every marketing/blog/cert page for guests (the CWV win). The site is
  // an MPA — sign-in is always a full navigation to /login and back — so no
  // in-place onAuthStateChange is ever needed on a logged-out marketing page.
  if (!hasToken && !hasAuthCallback) {
    state = { user: null, loading: false }
    return
  }

  state = { user: null, loading: true }

  void getSupabase().then(supabase => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        // If an onAuthStateChange event already landed, it holds the freshest
        // state — don't overwrite it with this older getSession snapshot. (M2)
        if (authEventLanded) return
        const initialUser = session?.user ?? null
        prevUser = initialUser
        setState({ user: initialUser, loading: false })
        // No pending-attempt flush here: a persisted session resolving on load
        // is a PASSIVE transition (it may be a different person on a shared
        // device), so it must not adopt a stored guest attempt. The flush is
        // wired into onAuthStateChange below and gated on an explicit save
        // intent; INITIAL_SESSION delivers the same session through that path.
      })
      .catch((err: unknown) => {
        logError('useAuth.getSession', err)
        if (authEventLanded) return
        setState({ user: null, loading: false })
      })

    supabase.auth.onAuthStateChange((event, session) => {
      authEventLanded = true
      const newUser = session?.user ?? null

      // Refuse an OAuth sign-in that returned an unverified email. Google only
      // federates verified emails, so this is a guard for R5.5 rather than an
      // expected path. Scope to OAuth providers: email/password users legitimately
      // have email_verified === false when email confirmation is disabled, and
      // must not be force-signed-out here. Also covers INITIAL_SESSION so a
      // persisted unverified OAuth session is caught on reload, not only on the
      // live SIGNED_IN transition. The signOut() is deferred with setTimeout to
      // avoid the supabase-js documented deadlock when calling auth methods
      // synchronously inside the onAuthStateChange callback. (M1)
      const isOAuth = (newUser?.app_metadata?.provider ?? 'email') !== 'email'
      if (
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
        && newUser
        && isOAuth
        && newUser.user_metadata?.email_verified === false
      ) {
        setTimeout(() => {
          supabase.auth.signOut().finally(() => {
            window.location.assign('/login?error=email_unverified')
          })
        }, 0)
        return
      }

      // Detect the real "user just signed in" moment. Excludes
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION.
      if (
        event === 'SIGNED_IN'
        && prevUser === null
        && newUser !== null
      ) {
        trackEvent('sign_in', {
          method: newUser.app_metadata?.provider ?? 'email',
        })

        // First-link confirmation (R5.4): when Google was merged into a
        // pre-existing account (multiple identities incl. google), surface a
        // one-time notice. The helper self-guards via a localStorage ack flag,
        // so this is safe to call on every genuine sign-in.
        maybeNotifyGoogleLink(newUser)
      }

      prevUser = newUser
      setState({ user: newUser, loading: false })

      // Flush a pending guest exam attempt to the now-signed-in account (the
      // results-screen "Sign in to save this attempt" path). Deferred out of
      // the auth callback per the supabase-js deadlock caution. flushPendingAttempt
      // is the real guard: it writes ONLY when the guest set a matching save
      // intent, so a passive or unrelated sign-in adopts nothing. We additionally
      // skip bare TOKEN_REFRESHED / USER_UPDATED here so they never even attempt
      // it; SIGNED_IN is the genuine save flow and INITIAL_SESSION carries the
      // same intent-gated session for the in-tab return from /login. (P2 data-bleed)
      if (
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
        && newUser
        && hasPendingAttempt()
      ) {
        const userId = newUser.id
        setTimeout(() => { void flushPendingAttempt(userId) }, 0)
      }
    })
  }).catch((err: unknown) => {
    // Supabase chunk failed to load (offline / network). Resolve to logged-out
    // so the chrome is never stuck on the loading placeholder.
    logError('useAuth.init', err)
    if (authEventLanded) return
    setState({ user: null, loading: false })
  })
}

function subscribe(cb: () => void) {
  init()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): AuthState { return state }
function getServerSnapshot(): AuthState { return { user: null, loading: true } }

interface UseAuthValue {
  user: User | null
  loading: boolean
}

export function useAuth(): UseAuthValue {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { user: snap.user, loading: snap.loading }
}

