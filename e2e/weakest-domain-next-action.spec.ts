import { test, expect, type Page, type Route } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * Growth Build 2: weakest-domain next action (H2 + M4 + M5).
 * Source: GROWTH-RETENTION-FINDINGS-2026-07-02.md section 3, Build 2.
 *
 * Covers:
 *  - dashboard NEXT UP card: weakest practiced domain (argmin over bank
 *    mastery, semantics in lib/domainStats.findNextDomainAction) with the
 *    ?domain= deep link into domain practice
 *  - unstarted-beats-weakest phrasing ("You have not practiced X yet",
 *    never "weakest" for a domain with zero attempts)
 *  - zero-data empty state: Best score N/A + baseline hint, NEXT UP points
 *    at the first domain
 *  - signed-in FAIL results: a "Practice your weakest domain" link into
 *    domain practice; guests keep UnlockCTA instead
 *
 * Seeded-session only (no real backend / Turnstile): domain_progress and
 * exam_attempts reads are stubbed per test.
 */

test.use({ reducedMotion: 'reduce' })

const CERT_URL = '/aws/clf-c02'
const EXAM_URL = '/aws/clf-c02/practice-exam'

function progressRow(domainId: number, attempted: number, correct: number) {
  return {
    user_id: 'seed-user-0000-0000-0000-000000000000',
    cert_code: 'clf-c02',
    domain_id: domainId,
    questions_attempted: attempted,
    questions_correct: correct,
    mastery_percent: 0, // stored value is ignored; the dashboard re-derives
    updated_at: new Date().toISOString(),
  }
}

/** Serve domain_progress from `rows`; every other REST read gets []. */
function restStub(rows: unknown[]) {
  return (route: Route) => {
    const url = route.request().url()
    const body = url.includes('domain_progress') ? JSON.stringify(rows) : '[]'
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  }
}

/** Start the exam and wait until the timed exam screen is active. */
async function startExam(page: Page) {
  await page.getByRole('button', { name: 'Start exam', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.examActive === 'true', { timeout: 25000 })
}

/** Submit the active exam (zero answers = guaranteed fail) -> results screen. */
async function submitExam(page: Page) {
  await page.getByRole('button', { name: 'Submit exam' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Ready to submit?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Submit for grading' }).click()
  await expect(page.getByRole('button', { name: 'Retake exam' })).toBeVisible({ timeout: 15000 })
}

test('dashboard NEXT UP names the weakest practiced domain with a deep link', async ({ page }) => {
  await seedSession(page, {
    rest: restStub([
      progressRow(1, 60, 50),
      progressRow(2, 50, 40),
      progressRow(3, 30, 1), // lowest bank mastery by far
      progressRow(4, 40, 30),
    ]),
  })
  await page.goto(CERT_URL)

  await expect(page.getByText('Weakest domain:')).toBeVisible({ timeout: 15000 })
  const cta = page.getByRole('link', { name: 'Practice this domain' })
  await expect(cta).toHaveAttribute('href', '/aws/clf-c02/domain-practice?domain=3')
})

test('an unstarted domain outranks a weak practiced one and is not called weakest', async ({ page }) => {
  await seedSession(page, {
    rest: restStub([
      progressRow(1, 30, 2), // weak, but practiced
      progressRow(2, 50, 40),
      progressRow(4, 40, 30),
      // domain 3 has no row at all -> unstarted
    ]),
  })
  await page.goto(CERT_URL)

  await expect(page.getByText('You have not practiced')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Weakest domain:')).toHaveCount(0)
  const cta = page.getByRole('link', { name: 'Practice this domain' })
  await expect(cta).toHaveAttribute('href', '/aws/clf-c02/domain-practice?domain=3')
})

test('zero-data dashboard: Best score N/A + baseline hint, NEXT UP points at the first domain', async ({ page }) => {
  await seedSession(page) // default stub: every REST read returns []
  await page.goto(CERT_URL)

  await expect(page.getByText('Take your first mock exam to set a baseline')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('N/A')).toBeVisible()
  await expect(page.getByText('You have not practiced')).toBeVisible()
  const cta = page.getByRole('link', { name: 'Practice this domain' })
  await expect(cta).toHaveAttribute('href', '/aws/clf-c02/domain-practice?domain=1')
})

test('signed-in FAIL results link "Practice your weakest domain" into domain practice', async ({ page }) => {
  await seedSession(page)
  await page.goto(EXAM_URL)
  // Auth must be resolved so the results screen sees a signed-in user.
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })

  await startExam(page)
  await submitExam(page) // zero answers -> fail

  const practiceCta = page.getByRole('link', { name: /Practice your weakest domain/ })
  await expect(practiceCta).toBeVisible()
  // All domains tie at 0% on an all-blank submit; the tiebreak is the first
  // domain in cert order.
  await expect(practiceCta).toHaveAttribute('href', '/aws/clf-c02/domain-practice?domain=1')
})

test('guest FAIL results keep UnlockCTA and do NOT show the weakest-domain link', async ({ page }) => {
  await page.goto(EXAM_URL)
  await startExam(page)
  await submitExam(page)

  await expect(page.getByRole('link', { name: /Practice your weakest domain/ })).toHaveCount(0)
  await expect(page.getByText('Sign in to target your weak domains')).toBeVisible()
})
