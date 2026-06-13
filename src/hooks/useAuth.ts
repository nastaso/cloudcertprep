import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
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

  state = { user: null, loading: hasToken }

  supabase.auth.getSession()
    .then(({ data: { session } }) => {
      // If an onAuthStateChange event already landed, it holds the freshest
      // state — don't overwrite it with this older getSession snapshot. (M2)
      if (authEventLanded) return
      const initialUser = session?.user ?? null
      prevUser = initialUser
      setState({ user: initialUser, loading: false })
      // A guest exam attempt stored before this session resolved (e.g. the
      // flush failed offline last visit) is retried on any signed-in load.
      if (initialUser && hasPendingAttempt()) {
        void flushPendingAttempt(initialUser.id)
      }
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
    // the auth callback per the supabase-js deadlock caution; the flush
    // self-guards against re-entry and missing payloads, so firing on any
    // signed-in transition (incl. INITIAL_SESSION / TOKEN_REFRESHED) is safe.
    if (newUser && hasPendingAttempt()) {
      const userId = newUser.id
      setTimeout(() => { void flushPendingAttempt(userId) }, 0)
    }
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

