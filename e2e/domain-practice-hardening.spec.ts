import { test, expect, type Page } from '@playwright/test'

/**
 * PR-4b: domain-practice flow hardening.
 * Source: EDGE-CASE-FINDINGS-2026-06-28.md surface 5.
 *
 *  - browser/device Back during practice silently discards answers (item 5)
 *  - the mobile cert-switcher bypasses the "Leave practice?" confirm (item 6)
 *  - startPractice has no catch, so a failed chunk fetch dead-ends Start (item 7)
 *
 * All guest-compatible (domain practice runs without an account).
 */

test.use({ reducedMotion: 'reduce' })

const PRACTICE_URL = '/aws/clf-c02/domain-practice'

/** From the selection screen: pick the first domain, start, wait until active. */
async function startFirstDomainSession(page: Page) {
  await page.getByRole('button', { name: /^Practice .+questions$/ }).first().click()
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.practiceActive === 'true', { timeout: 25000 })
  // The question screen is up (proves the session mounted).
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible()
}

test('browser Back during practice asks to confirm instead of discarding the session', async ({ page }) => {
  await page.goto(PRACTICE_URL)
  await startFirstDomainSession(page)

  // Device/browser Back. Pre-fix this pops ?domain= and silently drops the
  // session to the selection screen.
  await page.evaluate(() => window.history.back())

  await expect(page.getByRole('dialog', { name: 'Leave practice?' })).toBeVisible()
  // The in-progress session is still mounted (not discarded) behind the confirm.
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible()

  // "Keep practicing" dismisses and leaves the user mid-session.
  await page.getByRole('button', { name: 'Keep practicing' }).click()
  await expect(page.getByRole('dialog', { name: 'Leave practice?' })).toHaveCount(0)
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible()

  // A second Back, this time confirmed, discards the session and lands on the
  // domain-selection screen (no ?domain in the URL).
  await page.evaluate(() => window.history.back())
  await expect(page.getByRole('dialog', { name: 'Leave practice?' })).toBeVisible()
  await page.getByRole('button', { name: 'Leave practice' }).click()
  await expect(page.getByRole('heading', { name: /Domain Practice/ })).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/domain-practice$/)
})

test('mobile cert-switcher routes through the "Leave practice?" confirm', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PRACTICE_URL)
  await startFirstDomainSession(page)

  // Open the drawer and pick the OTHER cert from the mobile cert-switcher. Its
  // entries are <button>s (not anchors), so the islands' anchor-capture leave
  // guard never sees them - selectCert must route through guardExamLeave itself.
  const toggle = page.getByRole('button', { name: 'Toggle menu' })
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  const drawer = page.getByRole('dialog', { name: 'Menu' })
  await drawer.getByRole('button', { name: /AIF-C01/ }).click()

  await expect(page.getByRole('dialog', { name: 'Leave practice?' })).toBeVisible()
})

test('a failed question-chunk fetch surfaces a retryable error instead of a dead Start button', async ({ page }) => {
  // Force the domain-1 question chunk to fail (offline / network error).
  await page.route(/domain1\.[^/]*\.js(\?|$)/, route => route.abort())

  await page.goto(PRACTICE_URL)
  await page.getByRole('button', { name: /^Practice .+questions$/ }).first().click()
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()

  // The catch surfaces the error on the config screen, and Start is re-enabled.
  await expect(page.getByText(/Could not start practice\./)).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeEnabled()
})
