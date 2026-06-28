import { test, expect } from '@playwright/test'
import { seedSession, getSeedRef } from './seededSession'

// Smoke coverage for the shared seeded-session harness (e2e/seededSession.ts).
// Runs in CI with NO secrets / NO backend / NO Turnstile. It proves the fixture
// end-to-end so the many logged-in specs that will build on it (TEST-BACKLOG
// Layer 2: items 3, 5, 10, 12, 14, 26-35, 43, 48, 50, 53, 56, 60-68, ...) have a
// trustworthy foundation. If THIS file fails, the ref derivation or token shape
// drifted - fix the fixture before chasing the dependent specs.

test('seeded session: useAuth().user resolves from the ref-matched token', async ({ page }) => {
  const user = await seedSession(page)
  await page.goto('/')

  // CSS-revealed (works with any sb-*-auth-token): the signed-in chrome paints
  // and the guest billboard is hidden.
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })
  await expect(page.locator('#home-guest-hero')).toBeHidden()

  // useAuth().user-gated (needs the REF-MATCHED token): the UserMenu email row
  // renders the seeded session's email. This is the real proof the fixture's
  // derived ref matches the build ref and supabase-js actually read the token.
  // Retry the open to tolerate header-island hydration lag under load.
  await expect(async () => {
    const trigger = page.getByRole('button', { name: 'Account menu' }).first()
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
    await expect(page.getByText(user.email, { exact: true })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
})

test('seeded session control: no seed => guest chrome (the seed is what flips it)', async ({ page }) => {
  // No seedSession() here: confirms the assertions above are driven by the seed,
  // not by something that is true for guests too.
  await page.goto('/')
  await expect(page.locator('#home-guest-hero')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0)
})

test('seeded session: getSeedRef derives a non-empty project ref', () => {
  // Guard the ref derivation directly so a bad VITE_SUPABASE_URL surfaces as an
  // obvious failure rather than a mystifying "user never resolves".
  expect(getSeedRef()).toMatch(/^[a-z0-9-]+$/i)
})
