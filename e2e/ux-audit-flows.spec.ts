import { test, expect } from '@playwright/test'

// Guest + no-auth e2e for the UX-audit batch. No Supabase/email needed.

const PENDING = {
  certCode: 'clf-c02',
  finishedAt: Date.now(),
  attempt: {
    score_percent: 75, scaled_score: 760, passed: true,
    time_taken_seconds: 1200, total_questions: 4, correct_answers: 3,
    domain_scores: { '1': 100, '2': 50, '3': 100, '4': 0 },
  },
  questions: [
    { question_id: 'q1', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 1 },
    { question_id: 'q2', user_answer: 'B', correct_answer: 'C', is_correct: false, was_flagged: false, domain_id: 2 },
    { question_id: 'q3', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 3 },
    { question_id: 'q4', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 4 },
  ],
}

test('P0-3: expired-link banner shows, strips params, dismisses', async ({ page }) => {
  await page.goto('/?error=access_denied&error_code=otp_expired')
  await expect(page.getByText('That link has expired')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(400)
  expect(new URL(page.url()).searchParams.has('error')).toBeFalsy()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('That link has expired')).toBeHidden()
})

test('P0-3: email_unverified does NOT trigger the home banner', async ({ page }) => {
  await page.goto('/?error=email_unverified')
  await page.waitForTimeout(1500)
  await expect(page.getByText('That link has expired')).toHaveCount(0)
})

test('P0-2: verified=1 welcome card (direct, no auth)', async ({ page }) => {
  await page.goto('/?verified=1')
  await expect(page.getByText('Your email is confirmed')).toBeVisible({ timeout: 10000 })
})

test('P1-4: persistent Practice CTA in header on key routes', async ({ page }) => {
  for (const route of ['/', '/about', '/blog', '/aws/clf-c02']) {
    await page.goto(route)
    const practice = page.getByRole('link', { name: 'Practice', exact: true }).first()
    await expect(practice).toBeVisible({ timeout: 10000 })
    await expect(practice).toHaveAttribute('href', '/aws/clf-c02/practice-exam')
  }
})

test('P1-4: Practice is the first item in the mobile drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Toggle menu' }).click()
  const drawer = page.getByRole('dialog', { name: 'Menu' })
  await expect(drawer.getByRole('link', { name: 'Practice' })).toBeVisible()
})

test('P1-6: guest result rehydrates after the login round-trip (marker set)', async ({ page }) => {
  await page.addInitScript((p) => {
    localStorage.setItem('cloudcertprep_pending_attempt', JSON.stringify(p))
    sessionStorage.setItem('cc_resume_results', 'clf-c02')
  }, PENDING)
  await page.goto('/aws/clf-c02/practice-exam')
  // The info alert renders only inside the results screen for a guest with a
  // pending attempt, so it is a clean proof of rehydrate. Review is hidden.
  await expect(page.getByText('Your result is saved on this device for 24 hours')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Review questions' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Retake exam/i })).toBeVisible()
})

test('P1-6: fresh visit (no marker) shows START, not an old result', async ({ page }) => {
  await page.addInitScript((p) => {
    localStorage.setItem('cloudcertprep_pending_attempt', JSON.stringify(p))
    // deliberately NO cc_resume_results marker
  }, PENDING)
  await page.goto('/aws/clf-c02/practice-exam')
  await page.waitForTimeout(2500)
  // No rehydrate without the marker: the results-only info alert never appears.
  await expect(page.getByText('Your result is saved on this device for 24 hours')).toHaveCount(0)
})

test('P1-8: no British spelling in rendered funnel pages', async ({ page }) => {
  for (const route of ['/aws/clf-c02', '/about', '/contribute']) {
    await page.goto(route)
    const txt = await page.locator('body').innerText()
    expect(txt, `British spelling on ${route}`).not.toMatch(/practis|randomis|prioritis|memoris/i)
  }
})

test('P2-12: about + contribute closing CTA + #certifications anchor resolves', async ({ page }) => {
  for (const route of ['/about', '/contribute']) {
    await page.goto(route)
    await expect(page.getByRole('link', { name: /Start practicing free/i })).toBeVisible()
    const browse = page.getByRole('link', { name: /Browse certifications/i })
    await expect(browse).toBeVisible()
    await expect(browse).toHaveAttribute('href', '/#certifications')
  }
  await page.goto('/')
  await expect(page.locator('#certifications')).toHaveCount(1)
})
