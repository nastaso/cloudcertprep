import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'

// Matches playwright.config.ts's own PORT/BASE_URL derivation: with PW_PORT unset
// this is byte-identical to the old hardcoded localhost:4321, but under the
// documented isolated-port recipe (PW_PORT=4399 ...) it follows the server this
// spec's own baseURL actually points at.
const BASE_URL = `http://localhost:${Number(process.env.PW_PORT) || 4321}`

// Dark+light screenshots of the UX-audit surfaces for owner visual review.
// Saved under .kiro/ (gitignored). Run after a build against the test backend.
test.use({ reducedMotion: 'reduce' })

// Serial: the signed-in shots create real users and sign in on the one shared
// test project; concurrent sign-ins flake under load (same reason as the auth
// spec). (TEST-BACKLOG 1E)
test.describe.configure({ mode: 'serial' })

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

// Track + delete only the users this file mints, never a sibling run's still-in-use
// cc-e2e- accounts. (TEST-BACKLOG 1E)
const createdEmails: string[] = []
async function makeUser(tag: string): Promise<string> {
  const email = `cc-e2e-shot-${tag}-${Date.now()}@example.com`
  createdEmails.push(email)
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  return email
}

test.afterAll(async () => {
  if (!HAS_CREDS) return
  const mine = new Set(createdEmails.map(e => e.toLowerCase()))
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data.users) if (u.email && mine.has(u.email.toLowerCase())) await admin.auth.admin.deleteUser(u.id)
})

// Sign in via the form, waiting for the Turnstile token (the submit button is NOT
// token-gated, so "enabled" is not a readiness proxy - it would click before the
// token lands). Mirrors ux-audit-auth.spec.ts submitForm. (TEST-BACKLOG 1B)
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 25000 })
  await page.waitForTimeout(750)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 })
}

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
    await signIn(page, await makeUser(theme))
    await page.goto('/aws/clf-c02')
    // Match the "<level> . Your dashboard" kicker, not a bare "Your dashboard"
    // (which also matches the transient sr-only "Loading your dashboard" status and
    // races into a strict-mode violation). See ux-audit-auth.spec.ts.
    await expect(page.getByText(/·\s*Your dashboard/)).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${DIR}/dashboard-${theme}.png`, fullPage: true })
  })

  test(`shots/${theme}: signed-in practice menu (with Dashboard)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 1280, height: 820 })
    await signIn(page, await makeUser(`menu-${theme}`))
    const trigger = page.getByRole('button', { name: 'Practice', exact: true })
    await expect(async () => {
      if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
      await expect(page.locator('#site-header a[href="/aws/clf-c02"]')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${DIR}/practice-menu-signedin-${theme}.png` })
  })
}
