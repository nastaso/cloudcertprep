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

// Tab-scoped de-dupe for the `sign_in` event below. sessionStorage (not a
// module variable): this is an MPA that reinitializes the whole auth module
// (module state, incl. `prevUser`, resets to null) on every full page
// navigation, but sessionStorage survives across navigations within the same
// tab. See the long comment at the trackEvent('sign_in', ...) call for why
// this is needed.
const SIGN_IN_TRACKED_KEY = 'cc_sign_in_tracked'

function setState(next: AuthState) {
  state = next
  listeners.forEach(cb => cb())
}

/**
 * True when an onAuthStateChange event is a bare token refresh for the SAME
 * user that is already published - i.e. nothing a React consumer needs to see.
 *
 * A TOKEN_REFRESHED event rotates the JWT but does not change who is signed in;
 * supabase-js holds the new access token internally. Publishing a fresh `user`
 * object for it would change the object's identity on every refresh, re-running
 * every consumer effect keyed on `user` (History, CertDashboard, Account,
 * DomainProgressStrip, DomainPractice) and re-issuing an authenticated query.
 * Combined with supabase-js refreshing again around that query, that spun an
 * infinite refetch/refresh loop that hammered the auth /token endpoint until
 * Supabase returned 429 and the session died - reported as "logged out after
 * 50+ requests on /history" (issue #159). When this returns true the caller
 * keeps the existing reference (no setState), so no consumer effect re-fires.
 *
 * Returns false for every identity-changing event (SIGNED_IN, USER_UPDATED,
 * SIGNED_OUT, INITIAL_SESSION) and for a refresh that somehow changes the user
 * id or arrives before any user is established, so those still publish normally.
 * Exported for unit testing (see useAuth.test.ts).
 */
export function isRedundantTokenRefresh(
  event: string,
  newUser: User | null,
  currentUser: User | null,
): boolean {
  return (
    event === 'TOKEN_REFRESHED'
    && newUser !== null
    && currentUser !== null
    && newUser.id === currentUser.id
  )
}

// Best-effort sync check for a persisted Supabase session token.
//
// SYNC: same scan also lives at window.__ccHasSession (BaseLayout.astro
// inline pre-paint script). The two implementations must stay in lockstep.
// Inline scripts can't import TS modules, so this duplication is forced.
function hasStoredToken(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        return true
      }
    }
  } catch { /* localStorage unavailable */ }
  return false
}

function init() {
  if (initialised || typeof window === 'undefined') return
  initialised = true

  // If no token, resolve loading=false immediately so the logged-out chrome
  // paints without a placeholder. A stale token only briefly keeps
  // loading=true until getSession() confirms; never shows a logged-out user
  // a flash.
  const hasToken = hasStoredToken()

  // bfcache restore: a restored page keeps its frozen React heap, so a user
  // who signed out (or deleted their account) in another tab/page still
  // renders as signed in here even though the class-level chrome heals
  // (hardening F8). On restore, re-run the token scan and downgrade to guest
  // when no token remains - the same shape as _Login's bfcache loading reset
  // (#125). Upgrades are deliberately left to the next real navigation: a
  // bare token proves nothing without a getSession round-trip.
  window.addEventListener('pageshow', (e: PageTransitionEvent) => {
    if (!e.persisted) return
    if (!hasStoredToken() && state.user !== null) {
      prevUser = null
      setState({ user: null, loading: false })
    }
  })

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
      //
      // INVESTIGATED (2026-07, section-5 rider): the pre-ship baseline showed
      // ~3.6 `sign_in` events per Umami visit (2.31k events / 649 visits).
      // `prevUser === null` alone does not stop this, because the over-fire is
      // NOT tab focus or token refresh triggering this branch directly - it is
      // supabase-js itself. GoTrueClient's `_recoverAndRefresh()` (called from
      // `_initialize()` on every client construction, i.e. on every full page
      // load here, since this is an MPA that reinitializes the whole auth
      // module per navigation - see the CWV comment above) issues a genuine
      // `SIGNED_IN` broadcast whenever it finds a still-valid persisted
      // session, NOT the `INITIAL_SESSION` event the newer supabase-js API
      // added specifically to distinguish "recovered an existing session" from
      // "just signed in". Because `prevUser` resets to null on every fresh
      // navigation along with the rest of this module's state, that recovery
      // broadcast satisfies this gate on every page view for an
      // already-signed-in visitor, not only on a real sign-in - explaining the
      // ~3.6x. (The same function also reruns on tab-focus/visibility-change,
      // but that repeat is already deduped within one page's lifetime by
      // `prevUser` no longer being null by then.)
      //
      // Fix: a sessionStorage flag survives across full-page navigations
      // within the same tab (module state does not), so it catches exactly
      // the case module state cannot, without touching any other file.
      let alreadyTrackedThisTab = false
      try {
        alreadyTrackedThisTab = sessionStorage.getItem(SIGN_IN_TRACKED_KEY) === '1'
      } catch { /* private mode: fall back to the old (over-firing) behavior */ }

      if (
        event === 'SIGNED_IN'
        && prevUser === null
        && newUser !== null
        && !alreadyTrackedThisTab
      ) {
        // OAuth signup vs return (funnel step 5b): a brand-new account's
        // created_at lands within moments of this very sign-in event; a
        // returning user's created_at is far in the past. ~2 min is generous
        // enough to absorb the OAuth redirect round-trip without false
        // positives on a real return visit.
        const createdAtMs = Date.parse(newUser.created_at)
        const isNewUser = !Number.isNaN(createdAtMs) && Date.now() - createdAtMs < 2 * 60 * 1000

        trackEvent('sign_in', {
          method: newUser.app_metadata?.provider ?? 'email',
          new_user: isNewUser,
        })
        try { sessionStorage.setItem(SIGN_IN_TRACKED_KEY, '1') } catch { /* private mode */ }

        // First-link confirmation (R5.4): when Google was merged into a
        // pre-existing account (multiple identities incl. google), surface a
        // one-time notice. The helper self-guards via a localStorage ack flag,
        // so this is safe to call on every genuine sign-in.
        maybeNotifyGoogleLink(newUser)
      }

      // Clear the tab-scoped de-dupe flag on sign-out, so a genuine later
      // sign-in in the same tab (e.g. a different person on a shared device)
      // is tracked again instead of staying silently suppressed.
      if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem(SIGN_IN_TRACKED_KEY) } catch { /* private mode */ }
      }

      // Skip the state publish on a bare same-user token refresh so the `user`
      // reference stays stable and no consumer effect re-fires (see
      // isRedundantTokenRefresh for the full rationale / issue #159). prevUser
      // still advances so downstream identity checks stay correct.
      if (isRedundantTokenRefresh(event, newUser, state.user)) {
        prevUser = newUser
        return
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

