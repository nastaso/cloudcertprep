import { test, expect, type Page } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * PR-4a: mock-exam flow hardening.
 * Source: EDGE-CASE-FINDINGS-2026-06-28.md surface 1.
 *
 * Covers the user-visible flow defects:
 *  - retake re-opens the stale "Ready to submit?" modal over question 1 (item 1)
 *  - a signed-in sub-60s submit is silently not saved, with no notice (item 2)
 *  - a stale "attempt saved" notice bounces a deliberate exam start to /history (item 4)
 *  - the "Saving your attempt..." loader fires with no save intent (item 4b)
 *
 * The pure timing clamp (item 3) is covered by scoring.test.ts (computeExamTiming);
 * it needs clock control that is cleaner as a node unit test.
 *
 * Guest tests need no backend; the signed-in tests use the seeded-session fixture
 * (no real Supabase / Turnstile).
 */

test.use({ reducedMotion: 'reduce' })

const EXAM_URL = '/aws/clf-c02/practice-exam'
const PENDING_KEY = 'cloudcertprep_pending_attempt'
const INTENT_KEY = 'cloudcertprep_pending_attempt_intent'
const SAVED_NOTICE_KEY = 'cloudcertprep_pending_attempt_saved'

/** Start the exam and wait until the timed exam screen is active. */
async function startExam(page: Page) {
  await page.getByRole('button', { name: 'Start exam', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.examActive === 'true', { timeout: 25000 })
}

/** Submit the active exam through the confirm modal -> results screen. */
async function submitExam(page: Page) {
  await page.getByRole('button', { name: 'Submit exam' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Ready to submit?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Submit for grading' }).click()
  await expect(page.getByRole('button', { name: 'Retake exam' })).toBeVisible({ timeout: 15000 })
}

test('retake does not re-open the "Ready to submit?" modal over question 1', async ({ page }) => {
  await page.goto(EXAM_URL)
  await startExam(page)
  await submitExam(page) // manual submit path leaves showEndModal=true (pre-fix)

  await page.getByRole('button', { name: 'Retake exam' }).click()
  await startExam(page) // mounts the exam screen again

  // The stale confirm modal must NOT be open on the fresh attempt, and the user
  // should land on a clean question 1.
  await expect(page.getByRole('dialog', { name: 'Ready to submit?' })).toHaveCount(0)
  await expect(page.getByText('Question 1 of', { exact: false })).toBeVisible()
})

test('signed-in sub-60s submit shows an explicit "not saved" notice', async ({ page }) => {
  await seedSession(page)
  await page.goto(EXAM_URL)
  // Confirm auth has resolved so handleSubmitExam sees a logged-in user.
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })

  await startExam(page)
  await submitExam(page) // well under 60s -> too short -> not persisted

  await expect(
    page.getByText('This attempt was too short to be saved to your history.'),
  ).toBeVisible()
})

test('a stale "attempt saved" notice does NOT bounce a deliberate exam start to /history', async ({ page }) => {
  await seedSession(page)
  // A notice left over from a flush that happened on a non-exam page, older than
  // the freshness window. Pre-fix this redirects the start screen to /history.
  await page.addInitScript(
    ({ key, value }) => sessionStorage.setItem(key, value),
    { key: SAVED_NOTICE_KEY, value: `clf-c02|${Date.now() - 5 * 60 * 1000}` },
  )

  await page.goto(EXAM_URL)

  // Stays on the exam start screen instead of bouncing to /history.
  await expect(page.getByRole('button', { name: 'Start exam', exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/practice-exam$/)
})

test('no "Saving your attempt..." loader for a pending attempt with no save intent', async ({ page }) => {
  await seedSession(page)
  // A pending attempt lingers, but the guest never clicked "Sign in to save" so
  // there is no intent. PR-3 makes the flush a no-op here; the loader must agree.
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: PENDING_KEY,
      value: JSON.stringify({
        certCode: 'clf-c02',
        finishedAt: Date.now(),
        attempt: {
          score_percent: 80, scaled_score: 800, passed: true, time_taken_seconds: 1200,
          total_questions: 2, correct_answers: 1, domain_scores: { '1': 100, '2': 0 },
        },
        questions: [
          { question_id: 'q1', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 1 },
        ],
      }),
    },
  )

  await page.goto(EXAM_URL)

  // The loader effect is gated on `user`, so the pre-fix spinner can only appear
  // AFTER auth resolves. Wait for the signed-in chrome, then let the gated effect
  // (setTimeout 0) settle - pre-fix this is exactly when "Saving your attempt..."
  // would replace the start screen for up to 8s.
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(500)

  await expect(page.getByText('Saving your attempt...')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start exam', exact: true })).toBeVisible()
  // Sanity: intent really is absent (this is what gates the loader).
  expect(await page.evaluate((k) => sessionStorage.getItem(k), INTENT_KEY)).toBeNull()
})
