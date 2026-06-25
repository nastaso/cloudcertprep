import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'

// Dark+light screenshots of the UX-audit surfaces for owner visual review.
// Saved under .kiro/ (gitignored). Run after a build against the test backend.
test.use({ reducedMotion: 'reduce' })

const DIR = '.kiro/ux/audit-2026-06-24/qa-shots'
mkdirSync(DIR, { recursive: true })

let env: Record<string, string> = {}
try {
  env = Object.fromEntries(
    readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
  )
} catch { /* no .env.local (e.g. CI): the guard below skips these tests */ }
const HAS_CREDS = Boolean(env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
test.beforeEach(() => test.skip(!HAS_CREDS, 'requires cloudcertprep-test creds in .env.local'))
const admin = HAS_CREDS
  ? createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : (null as unknown as ReturnType<typeof createClient>)
const PW = 'Sup3rStr0ng-Pass-2026'

test.afterAll(async () => {
  if (!HAS_CREDS) return
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data.users) if (u.email?.startsWith('cc-e2e-')) await admin.auth.admin.deleteUser(u.id)
})

for (const theme of ['light', 'dark'] as const) {
  test(`shots/${theme}: public surfaces`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    const shot = async (name: string, ms = 700) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true }) }
    await page.goto('/'); await shot('home')
    await page.goto('/?verified=1'); await shot('verified-card')
    await page.goto('/?error=access_denied&error_code=otp_expired'); await shot('expired-banner')
    await page.goto('/login'); await shot('login', 1500)
    await page.goto('/about'); await shot('about-cta')
    await page.goto('/contribute'); await shot('contribute-cta')
    await page.goto('/aws/clf-c02'); await shot('cert-hub')
  })

  test(`shots/${theme}: signed-in dashboard`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    const email = `cc-e2e-shot-${theme}-${Date.now()}@example.com`
    await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(PW)
    const btn = page.locator('form button[type="submit"]')
    await expect(btn).toBeEnabled({ timeout: 25000 })
    await btn.click()
    await page.waitForURL('http://localhost:4321/', { timeout: 20000 })
    await page.goto('/aws/clf-c02')
    await expect(page.getByText('Your dashboard')).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${DIR}/dashboard-${theme}.png`, fullPage: true })
  })

  test(`shots/${theme}: signed-in practice menu (with Dashboard)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 1280, height: 820 })
    const email = `cc-e2e-shot-menu-${theme}-${Date.now()}@example.com`
    await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(PW)
    const btn = page.locator('form button[type="submit"]')
    await expect(btn).toBeEnabled({ timeout: 25000 })
    await btn.click()
    await page.waitForURL('http://localhost:4321/', { timeout: 20000 })
    const trigger = page.getByRole('button', { name: 'Practice', exact: true })
    await expect(async () => {
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
      await expect(page.locator('#site-header a[href="/aws/clf-c02"]')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${DIR}/practice-menu-signedin-${theme}.png` })
  })
}
