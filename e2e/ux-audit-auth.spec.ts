import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// This spec creates and deletes REAL users via the service-role admin client, so
// it must run serially: playwright.config sets fullyParallel:true, and the
// afterAll cleanup below could otherwise race a sibling test that is still using
// its user. (TEST-BACKLOG 1E)
test.describe.configure({ mode: 'serial' })

// Auth/funnel e2e against the cloudcertprep-test Supabase project (Turnstile test
// key 1x...AA auto-passes on localhost). Reads creds from gitignored .env.local.
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

// Track every email this file mints so afterAll deletes ONLY our users, never a
// sibling/concurrent run's still-in-use `cc-e2e-` accounts. (TEST-BACKLOG 1E)
const createdEmails: string[] = []
const mk = (t: string) => {
  const email = `cc-e2e-${t}-${Date.now()}@example.com`
  createdEmails.push(email)
  return email
}

test.afterAll(async () => {
  if (!HAS_CREDS) return
  const mine = new Set(createdEmails.map(e => e.toLowerCase()))
  // listUsers default page is 50; this file mints a handful per run, so one page
  // covers our set. (If that ever grows, page through `data.users`.)
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data.users) {
    if (u.email && mine.has(u.email.toLowerCase())) await admin.auth.admin.deleteUser(u.id)
  }
})

async function submitForm(page: Page) {
  // The submit button is intentionally NOT gated on the Turnstile token (it stays
  // enabled so the CTA never looks broken on load - _Login.tsx:598), so an
  // "enabled" wait returns instantly and clicks BEFORE the token lands, tripping
  // the `if (hasCaptcha && !captchaToken)` guard. Instead wait for Cloudflare's
  // hidden input to carry a token, then a short settle: that input fills a beat
  // before React's onToken -> setCaptchaToken runs, and the submit handler reads
  // the React state, not the input. Then click the form submit once ("Sign in"
  // alone also matches the header button). (TEST-BACKLOG 1B)
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 25000 })
  await page.waitForTimeout(750)
  await page.locator('form button[type="submit"]').click()
}

test('sign in (confirmed user) lands authenticated + dashboard renders (P1-10 root)', async ({ page }) => {
  const email = mk('signin')
  const { error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  expect(error).toBeFalsy()

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await submitForm(page)

  // Sign-in success does window.location.assign(from='/'); wait for it so the
  // session is persisted before we navigate on (fixes the earlier race).
  await page.waitForURL('http://localhost:4321/', { timeout: 20000 })
  // Signed-in indicator is now the account/user menu avatar (Sign out moved
  // inside it).
  await expect(page.getByRole('button', { name: 'Account menu' }).first()).toBeVisible({ timeout: 15000 })

  await page.goto('/aws/clf-c02')
  await expect(page.getByText('Your dashboard')).toBeVisible({ timeout: 20000 })
  // P1-10: dashboard entrance root + halo on exactly the two practice cards.
  // Scope to :visible because the prerendered guest view (hidden via display:none)
  // also carries .stagger / .halo CTAs.
  await expect(page.locator('.stagger:visible')).toHaveCount(1)
  await expect(page.locator('a.halo:visible')).toHaveCount(2)
})

test('P0-1: signup shows Check-email card with resend + edit-email', async ({ page }) => {
  const email = mk('signup')
  await page.goto('/login')
  await page.getByRole('button', { name: /have an account\? Sign up/i }).click()
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await page.locator('#confirmPassword').fill(PW)
  await page.locator('#acceptedTerms').check()
  await submitForm(page)

  // The submit must always produce a HANDLED outcome: the "Check your email"
  // success card (when email quota is available) OR a handled, non-enumerating
  // error alert (e.g. the test project's 4-emails/hour limit). Never a crash.
  const card = page.getByRole('heading', { name: 'Check your email' })
  const alert = page.getByRole('alert')
  await expect(card.or(alert)).toBeVisible({ timeout: 25000 })

  if (await card.isVisible()) {
    // Full card verification (only reachable when a signup email actually sends).
    // bug 2: the resend cooldown starts at signup (the first email just sent), so
    // the button is in its countdown state immediately - not clickable yet, which
    // is what stops an instant resend from hitting Supabase's rate limit. bug 1:
    // no second Turnstile is rendered on the card upfront.
    await expect(page.getByRole('button', { name: /Resend in \d+s/ })).toBeVisible()
    await expect(page.getByText('Wrong email? Edit it')).toBeVisible()
    await page.getByText('Wrong email? Edit it').click()
    await expect(page.locator('#email')).toBeVisible()
  } else {
    // Rate-limited path: assert the copy is the non-enumerating handled message.
    await expect(alert).toContainText(/account|try again|wait/i)
  }
})

test('P0-2: confirming the signup link redirects to /?verified=1 welcome card', async ({ page }) => {
  const email = mk('verify')
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password: PW,
    options: { redirectTo: 'http://localhost:4321/?verified=1' },
  })
  expect(error).toBeFalsy()
  const link = data.properties?.action_link
  expect(link).toBeTruthy()

  await page.goto(link as string)
  await expect(page.getByText('Your email is confirmed')).toBeVisible({ timeout: 20000 })
})

// (Removed dead "P1-11: Turnstile pending helper" test: it asserted #captcha-pending,
// which is rendered nowhere in src, so it passed trivially via a count===0 escape
// hatch and counted as coverage it never provided. (TEST-BACKLOG 1H))

test('P1-7: in-exam Sign out routes through the leave modal, then completes', async ({ page }) => {
  const email = mk('signout')
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await submitForm(page)
  await page.waitForURL('http://localhost:4321/', { timeout: 20000 })

  await page.goto('/aws/clf-c02/practice-exam')
  await page.getByRole('button', { name: 'Start exam', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.examActive === 'true', { timeout: 25000 })

  // Sign out (inside the account menu) during the exam must open the leave
  // modal, NOT sign out immediately.
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Leave the exam?')).toBeVisible()

  // Stay keeps the attempt alive.
  await page.getByRole('button', { name: 'Stay in exam' }).click()
  await expect(page.getByText('Leave the exam?')).toBeHidden()
  expect(await page.evaluate(() => document.body.dataset.examActive)).toBe('true')

  // Confirming completes the sign-out (back on '/', signed out -> Sign in shows).
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Leave the exam?')).toBeVisible()
  await page.getByRole('button', { name: 'Leave exam' }).click()
  await page.waitForURL('http://localhost:4321/', { timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible({ timeout: 15000 })
})

test('Practice menu (signed in): includes a Dashboard link per active cert', async ({ page }) => {
  const email = mk('dashmenu')
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PW)
  await submitForm(page)
  await page.waitForURL('http://localhost:4321/', { timeout: 20000 })

  const trigger = page.getByRole('button', { name: 'Practice', exact: true })
  await expect(trigger).toBeVisible({ timeout: 10000 })
  await expect(async () => {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
    await expect(page.locator('#site-header a[href="/aws/clf-c02"]')).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  // one Dashboard link per active cert (the logged-out menu has none)
  await expect(page.locator('#site-header').getByRole('link', { name: 'Dashboard' })).toHaveCount(2)
})
