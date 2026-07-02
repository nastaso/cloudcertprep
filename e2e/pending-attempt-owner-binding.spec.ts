import { test, expect, type Route } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * PR-3: guest pending exam attempt must bind to the account that explicitly
 * asked to save it, never to whatever account next signs in on the device.
 * Source: EDGE-CASE-FINDINGS-2026-06-28.md surfaces 1 + 4
 * (pending-attempt-cross-account-contamination /
 * rls-pending-attempt-cross-account-misattribution).
 *
 * Runs in CI with the seeded-session fixture (no real backend / Turnstile). A
 * seeded session resolves through useAuth's INITIAL_SESSION path - exactly the
 * passive transition a different person's restored session takes - so it is the
 * right shape to prove the negative case. The positive case approximates the
 * save-CTA flow by pre-setting the same save-intent the results-screen CTA sets.
 * The live SIGNED_IN save flow itself is real-creds only (Turnstile-gated).
 */

const PENDING_KEY = 'cloudcertprep_pending_attempt'
const INTENT_KEY = 'cloudcertprep_pending_attempt_intent'
const CERT = 'clf-c02'

/** A well-shaped, in-TTL guest snapshot, as storePendingAttempt would write it. */
function pendingPayload(finishedAt: number): string {
  return JSON.stringify({
    certCode: CERT,
    finishedAt,
    attempt: {
      score_percent: 80,
      scaled_score: 800,
      passed: true,
      time_taken_seconds: 1200,
      total_questions: 2,
      correct_answers: 1,
      domain_scores: { '1': 100, '2': 0 },
    },
    questions: [
      { question_id: 'q1', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 1 },
      { question_id: 'q2', user_answer: 'B', correct_answer: 'C', is_correct: false, was_flagged: false, domain_id: 2 },
    ],
  })
}

/** Record every REST request so we can assert an attempt write did / didn't fire. */
function makeRestRecorder() {
  const calls: { method: string; url: string }[] = []
  const handler = (route: Route) => {
    const req = route.request()
    calls.push({ method: req.method(), url: req.url() })
    // exam_attempts insert chains .select().single(), which expects ONE object.
    if (req.method() === 'POST' && req.url().includes('/exam_attempts')) {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'seed-attempt-1' }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  }
  const attemptWrites = () =>
    calls.filter(c => c.method === 'POST' && /\/(exam_attempts|attempt_questions)\b/.test(c.url))
  return { handler, attemptWrites }
}

test('passive sign-in with a pending guest attempt but NO save intent never writes it to the account', async ({ page }) => {
  const rec = makeRestRecorder()

  // A DIFFERENT person's session restores (INITIAL_SESSION) on a shared device.
  await seedSession(page, {
    user: { id: 'innocent-user-b', email: 'b@example.com' },
    rest: rec.handler,
  })
  // A guest left a finished attempt in localStorage but did NOT click "Sign in
  // to save this attempt", so there is no save intent.
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: PENDING_KEY, value: pendingPayload(Date.now()) },
  )

  await page.goto('/')

  // Wait until auth has fully resolved (signed-in chrome): useAuth has run and
  // the INITIAL_SESSION event has been delivered, so the flush decision is made.
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })
  // Settle past the deferred (setTimeout 0) flush attempt, had one been made.
  await page.waitForTimeout(1500)

  expect(
    rec.attemptWrites(),
    'no exam_attempts / attempt_questions write may fire for an account that did not ask to save the attempt',
  ).toEqual([])
})

test('the save-CTA intent flushes the pending attempt to the intended account', async ({ page }) => {
  const rec = makeRestRecorder()
  const now = Date.now()

  await seedSession(page, {
    user: { id: 'intended-user-a', email: 'a@example.com' },
    rest: rec.handler,
  })
  // The guest clicked "Sign in to save this attempt" (sets the matching intent)
  // and the intended account is now signing in.
  await page.addInitScript(
    ({ pendingKey, pendingValue, intentKey, intentValue }) => {
      localStorage.setItem(pendingKey, pendingValue)
      sessionStorage.setItem(intentKey, intentValue)
    },
    { pendingKey: PENDING_KEY, pendingValue: pendingPayload(now), intentKey: INTENT_KEY, intentValue: CERT },
  )

  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })

  // The flush must write the attempt for the intended account (proves both the
  // capture harness and the legitimate save path are reachable - so the negative
  // test above is not vacuous).
  await expect
    .poll(() => rec.attemptWrites().length, { timeout: 10000 })
    .toBeGreaterThan(0)
  expect(rec.attemptWrites().some(c => c.url.includes('/exam_attempts'))).toBe(true)
})
