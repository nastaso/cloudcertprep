import { test, expect } from '@playwright/test'

// Edge cases for the UX-audit batch (all no-auth; run against any build).

const PENDING = (over: Record<string, unknown> = {}) => ({
  certCode: 'clf-c02', finishedAt: Date.now(),
  attempt: { score_percent: 75, scaled_score: 760, passed: true, time_taken_seconds: 1200, total_questions: 4, correct_answers: 3, domain_scores: { '1': 100, '2': 50, '3': 100, '4': 0 } },
  questions: [
    { question_id: 'q1', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 1 },
    { question_id: 'q2', user_answer: 'B', correct_answer: 'C', is_correct: false, was_flagged: false, domain_id: 2 },
  ],
  ...over,
})
const INFO = 'Your result is saved on this device for 24 hours'

async function seed(page: import('@playwright/test').Page, pending: unknown, marker = 'clf-c02') {
  await page.addInitScript((args) => {
    localStorage.setItem('cloudcertprep_pending_attempt', JSON.stringify((args as { p: unknown }).p))
    sessionStorage.setItem('cc_resume_results', (args as { m: string }).m)
  }, { p: pending, m: marker })
}

test('P0-2 edge: welcome card shows once, then the ack flag suppresses it', async ({ page }) => {
  await page.goto('/?verified=1')
  await expect(page.getByText('Your email is confirmed')).toBeVisible({ timeout: 10000 })
  await page.goto('/?verified=1') // ack now set
  await page.waitForTimeout(1200)
  await expect(page.getByText('Your email is confirmed')).toHaveCount(0)
})

test('P0-2 edge: welcome card dismiss hides it', async ({ page }) => {
  await page.goto('/?verified=1')
  await expect(page.getByText('Your email is confirmed')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Your email is confirmed')).toBeHidden()
})

test('P0-3 edge: otp_expired alone (no error param) shows the banner', async ({ page }) => {
  await page.goto('/?error_code=otp_expired')
  await expect(page.getByText('That link has expired')).toBeVisible({ timeout: 10000 })
})

test('P0-3 edge: access_denied alone shows the banner', async ({ page }) => {
  await page.goto('/?error=access_denied')
  await expect(page.getByText('That link has expired')).toBeVisible({ timeout: 10000 })
})

test('P1-6 edge: cert mismatch does NOT rehydrate', async ({ page }) => {
  await seed(page, PENDING(), 'clf-c02')
  await page.goto('/aws/aif-c01/practice-exam') // marker cert != this cert
  await page.waitForTimeout(2500)
  await expect(page.getByText(INFO)).toHaveCount(0)
})

test('P1-6 edge: expired pending (>24h) does NOT rehydrate', async ({ page }) => {
  await seed(page, PENDING({ finishedAt: Date.now() - 25 * 3600 * 1000 }), 'clf-c02')
  await page.goto('/aws/clf-c02/practice-exam')
  await page.waitForTimeout(2500)
  await expect(page.getByText(INFO)).toHaveCount(0)
})

test('P1-4 edge: clicking Practice during an exam opens the leave modal', async ({ page }) => {
  await page.goto('/aws/clf-c02/practice-exam')
  await page.getByRole('button', { name: 'Start exam', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.examActive === 'true', { timeout: 25000 })
  await page.getByRole('link', { name: 'Practice', exact: true }).first().click()
  await expect(page.getByText('Leave the exam?')).toBeVisible()
  await page.getByRole('button', { name: 'Stay in exam' }).click()
})

test('P1-5: progress bar advances when the current question is answered', async ({ page }) => {
  await page.goto('/aws/clf-c02/domain-practice')
  await page.getByRole('button', { name: /Practice .+: \d+ questions/ }).first().click()
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  const bar = page.getByRole('progressbar').first()
  await expect(bar).toBeVisible({ timeout: 20000 })
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBe(0) // Q1 unanswered
  // AnswerButtons are the only buttons carrying aria-pressed.
  await page.locator('button[aria-pressed]').first().click()
  const submit = page.getByRole('button', { name: /^Submit/i })
  if (await submit.isVisible().catch(() => false)) await submit.click()
  // Advances on answer (the off-by-one fix); old code stayed at 0 until "Next".
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
})

test('P1-8 edge: no British spelling on the domain landing or history', async ({ page }) => {
  for (const route of ['/aws/clf-c02/cloud-concepts', '/history']) {
    await page.goto(route)
    await page.waitForTimeout(800)
    const txt = await page.locator('body').innerText()
    expect(txt, `British spelling on ${route}`).not.toMatch(/practis|randomis|prioritis|memoris/i)
  }
})
