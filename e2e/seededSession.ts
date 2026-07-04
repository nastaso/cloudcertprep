import { readFileSync } from 'node:fs'
import type { Page, Route } from '@playwright/test'

/**
 * Shared seeded-session fixture - render the full signed-in UI in CI with NO
 * real backend, NO Turnstile, and NO unpaused Supabase project.
 *
 * HOW IT WORKS
 * The app reads auth from localStorage. `@supabase/supabase-js` `getSession()`
 * (and the `_recoverAndRefresh` it runs on init) trusts a stored session whose
 * `expires_at` is in the future WITHOUT a network call and WITHOUT verifying the
 * JWT signature client-side. So writing a well-shaped `sb-<ref>-auth-token`
 * BEFORE the islands hydrate makes `useAuth().user` resolve to our fake user and
 * the `cc-authed` pre-paint class flip - exactly as a real login would.
 *
 * GOTCHAS (each silently breaks the harness if ignored)
 *
 * 1. REF MUST MATCH THE BUILD. supabase.ts:34 calls `createClient` with NO
 *    `storageKey`, so supabase-js derives the localStorage key from the host of
 *    `VITE_SUPABASE_URL` *frozen into the build* (`sb-<first-subdomain>-auth-token`).
 *    If the seeded ref differs from the build ref, the client reads a different
 *    key, finds nothing, and `useAuth().user` stays null. `getSeedRef()` derives
 *    the ref with the SAME precedence Vite uses (process.env wins over .env
 *    files, override:false): `process.env.VITE_SUPABASE_URL` -> `.env.local` ->
 *    the `https://placeholder.supabase.co` fallback that ci.yml/this repo build
 *    uses when no secrets are present. Keep CI's build step and the e2e step on
 *    the SAME `VITE_SUPABASE_URL` (set it at job level) or they diverge.
 *
 * 2. CSS-revealed vs user-gated. Pieces gated only by CSS (`cc-auth-in` /
 *    `cc-auth-out`, e.g. the Account-menu avatar, the hidden guest hero, the
 *    welcome hero, the first-login greeting) flip on ANY `sb-*-auth-token`
 *    because BaseLayout's pre-paint script key-scans for any such key. Pieces
 *    gated on `useAuth().user` (the UserMenu email row, the Practice "Dashboard"
 *    link, the drawer History/Account rows, all dashboard data) need the
 *    REF-MATCHED token above AND, if they fetch, a `/rest/v1/` route stub.
 *
 * 3. This tests CLIENT + RENDER only, never RLS or schema. The unsigned token
 *    proves nothing about cross-user isolation - that is realcreds-only
 *    (ux-audit-auth.spec.ts, TEST-BACKLOG item 6/21).
 */

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'

function readEnvLocal(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter(l => l.includes('='))
        .map(l => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

/** The Supabase URL the build froze into the bundle (mirrors Vite's precedence). */
export function getSeedSupabaseUrl(): string {
  return process.env.VITE_SUPABASE_URL || readEnvLocal().VITE_SUPABASE_URL || PLACEHOLDER_URL
}

/** Project ref -> the `sb-<ref>-auth-token` localStorage key supabase-js reads. */
export function getSeedRef(): string {
  try {
    return new URL(getSeedSupabaseUrl()).hostname.split('.')[0]
  } catch {
    return 'placeholder'
  }
}

export interface SeededUser {
  id: string
  email: string
  /** ISO string. Recent (~now) => first-login greeting; old => "Welcome back". */
  created_at: string
  user_metadata: Record<string, unknown>
}

const DEFAULT_USER: SeededUser = {
  id: 'seed-user-0000-0000-0000-000000000000',
  email: 'seed@example.com',
  // Epoch => an old account, so the home greeting reads "Welcome back" by
  // default. Override with a recent `created_at` to exercise the first-login swap.
  created_at: new Date(0).toISOString(),
  user_metadata: {},
}

export interface SeedOptions {
  /** Override the seeded user fields (id / email / created_at / user_metadata). */
  user?: Partial<SeededUser>
  /**
   * REST (`/rest/v1/` route) stubbing:
   *  - omitted (default): fulfill every REST read with `[]` (empty + deterministic)
   *  - a Playwright route handler: full control (per-table routing, counters, 500s)
   *  - null: install NO route (let requests hit other routes / the network)
   */
  rest?: ((route: Route) => unknown) | null
  /**
   * Seconds from now for the seeded access token's `expires_at` (and JWT `exp`).
   * Default 3600 (safely valid - supabase-js never refreshes on init). Pass a
   * small or negative value to seed a near-expiry/expired session so
   * supabase-js's `getSession()` refreshes it on init - needed to exercise the
   * TOKEN_REFRESHED path (see auth-refresh-budget.spec.ts, issue #159).
   */
  expiresInSec?: number
}

// Build a structurally valid (unsigned) JWT so any supabase-js path that decodes
// the access token finds a parseable payload with a future `exp`. The signature
// is never verified client-side.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2VlZA`
}

/**
 * Seed a fake signed-in session into `page` BEFORE the islands hydrate, and (by
 * default) stub all REST reads. Returns the seeded user so callers can assert
 * against its email/id.
 *
 * Call this BEFORE `page.goto(...)`. Safe to combine with other `addInitScript`
 * calls (theme, pending-attempt, etc.).
 */
export async function seedSession(page: Page, opts: SeedOptions = {}): Promise<SeededUser> {
  const user: SeededUser = { ...DEFAULT_USER, ...opts.user }
  const ref = getSeedRef()
  const nowSec = Math.floor(Date.now() / 1000)
  const expiresAt = nowSec + (opts.expiresInSec ?? 3600)

  const session = {
    access_token: fakeJwt({
      sub: user.id, email: user.email, role: 'authenticated',
      aud: 'authenticated', exp: expiresAt, iat: nowSec,
    }),
    refresh_token: 'seed-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: new Date(0).toISOString(),
      created_at: user.created_at,
      // provider 'email' so useAuth's OAuth-unverified-email force-signout
      // (useAuth.ts:117) never fires for the seeded user.
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: user.user_metadata,
      identities: [],
    },
  }

  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: `sb-${ref}-auth-token`, value: JSON.stringify(session) },
  )

  if (opts.rest !== null) {
    const handler = opts.rest
      ?? ((route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('**/rest/v1/**', handler)
  }

  return user
}
