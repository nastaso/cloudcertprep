import { test, expect } from '@playwright/test'

// Runtime-health guard: no UNEXPECTED console/page errors on any key surface.
// Network noise that cannot resolve from localhost in test (analytics, Supabase,
// Turnstile, CF insights, favicon) is filtered; real JS/React errors are not.
const ROUTES = [
  '/', '/login', '/about', '/contribute', '/blog',
  '/aws/clf-c02', '/aws/clf-c02/cloud-concepts',
  '/aws/clf-c02/practice-exam', '/aws/clf-c02/domain-practice',
  '/history', '/stats',
  '/?verified=1', '/?error=access_denied&error_code=otp_expired',
]
const NOISE = /umami|analytics|supabase|turnstile|challenges\.cloudflare|cloudflareinsights|favicon|net::ERR|Failed to load resource|ERR_BLOCKED|the server responded with a status|font-size:0|color:transparent/i

for (const route of ROUTES) {
  test(`no console errors on ${route}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))
    await page.goto(route)
    await page.waitForTimeout(1500)
    const real = errors.filter(e => !NOISE.test(e))
    expect(real, `unexpected console errors on ${route}:\n${real.join('\n---\n')}`).toEqual([])
  })
}
