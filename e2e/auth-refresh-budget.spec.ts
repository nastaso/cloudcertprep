import { test, expect } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * Regression guard for issue #159 (fixed by #160 / isRedundantTokenRefresh in
 * useAuth.ts).
 *
 * The bug: useAuth published a NEW `user` object on every onAuthStateChange
 * event, including a bare same-user TOKEN_REFRESHED. Every user-scoped island
 * (History, CertDashboard, Account, ...) keys its data-fetch effect on `user`,
 * so a token refresh -> new `user` reference -> effect re-fires -> a fresh
 * authenticated query -> supabase-js's getSession() refreshes again because
 * the (still near-expiry, in this test) session looks expired -> another
 * TOKEN_REFRESHED -> ad infinitum. That loop hammered the auth /token endpoint
 * until Supabase returned 429 and the session died - reported as "logged out
 * after 50+ requests on /history".
 *
 * This test seeds an ALREADY-EXPIRED session so supabase-js refreshes it on
 * init (igniting the loop on the pre-fix code), and stubs the refresh
 * response with a FRESH but near-expiry session so the loop can sustain
 * itself for the duration of the test. It then asserts both the auth-refresh
 * count and the exam_attempts query count stay bounded. On the pre-fix code
 * both counters ran into the hundreds/thousands within a few seconds; on the
 * fixed code they stay in the low single digits (the fix does not change how
 * often supabase-js itself refreshes a perpetually near-expiry token - it
 * only stops the app from turning each refresh into a fresh data fetch).
 */

test.use({ reducedMotion: 'reduce' })

/**
 * Mirrors `fakeJwt` in seededSession.ts: a structurally valid (unsigned) JWT
 * so any supabase-js path that decodes the access token finds a parseable
 * payload with the `exp` we want. The signature is never verified
 * client-side. Not imported from seededSession.ts because that helper is not
 * exported (kept private there); duplicated here rather than widening that
 * module's public surface for a single test.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2VlZA`
}

test('a token refresh on a user-scoped page (/history) stays bounded, never a request storm', async ({ page }) => {
  let tokenRefreshes = 0
  let examAttempts = 0

  // Seed a session that expired 60s ago. supabase-js's getSession()/
  // _recoverAndRefresh() treat anything within (or past) a 90s margin of
  // `expires_at` as needing a refresh, so this refreshes on init - the
  // trigger the pre-fix code needed to start looping.
  const user = await seedSession(page, {
    expiresInSec: -60,
    // Catch-all REST stub. Registered here (via seedSession) FIRST, so the
    // exam_attempts-specific route below - registered AFTER - takes
    // precedence for that path (Playwright routes are last-registered-wins).
    rest: route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  })

  await page.route('**/rest/v1/exam_attempts**', route => {
    examAttempts++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify([{
        id: 'seed-attempt-1',
        user_id: user.id,
        cert_code: 'clf-c02',
        attempted_at: new Date().toISOString(),
        passed: true,
        score_percent: 80,
        scaled_score: 800,
        time_taken_seconds: 600,
        total_questions: 10,
        correct_answers: 8,
        domain_scores: { '1': 80 },
      }]),
    })
  })

  await page.route('**/auth/v1/token**', route => {
    tokenRefreshes++
    const nowSec = Math.floor(Date.now() / 1000)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: fakeJwt({
          sub: user.id, email: user.email, role: 'authenticated',
          aud: 'authenticated', exp: nowSec + 1, iat: nowSec,
        }),
        refresh_token: 'seed-refresh-token',
        token_type: 'bearer',
        expires_in: 1, // near-expiry: sustains the loop on the pre-fix code
        user: {
          id: user.id,
          aud: 'authenticated',
          role: 'authenticated',
          email: user.email,
          email_confirmed_at: new Date(0).toISOString(),
          created_at: user.created_at,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: user.user_metadata,
          identities: [],
        },
      }),
    })
  })

  await page.goto('/history')
  await page.waitForTimeout(5000)

  // On the pre-fix code these ran into the hundreds/thousands within 5s; on
  // the fixed code (stable `user` reference across a redundant refresh) they
  // stay in the low single digits. See the PR description for the actual
  // before/after counts recorded while verifying this guard.
  expect(tokenRefreshes).toBeLessThanOrEqual(5)
  expect(examAttempts).toBeLessThanOrEqual(5)
})
