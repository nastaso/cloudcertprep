import { test, expect, type Page } from '@playwright/test'

/**
 * Core Web Vitals beacon contract (BaseLayout.astro, inline script, audit N7).
 *
 * The beacon watches LCP / CLS / INP via PerformanceObserver and reports ONCE
 * per page load, on `pagehide` (or `visibilitychange` -> hidden), through
 * `window.umami.track('web_vitals', data)`. It guards on
 * `window.umami && typeof window.umami.track === 'function'`, so the stub
 * below is installed via `addInitScript` - it must exist before any page
 * script runs, not just before we read it back.
 *
 * What this locks in:
 *  - exactly one `web_vitals` call per page lifetime (a `sent` flag no-ops
 *    every listener after the first fires - both pagehide AND
 *    visibilitychange point at the same `report()`),
 *  - `lcp` and `cls` are present and sane whenever they were actually
 *    measured,
 *  - metrics that never fired are OMITTED, not sent as 0/undefined - this
 *    spec never interacts with the page, so `inp` (interaction-timing based)
 *    must never appear in the payload. That omit-never-fired-metrics
 *    behavior is the whole point of the recent fix this spec exists to pin
 *    down.
 *
 * Capture convention mirrors e2e/delete-modal-exit-signals.spec.ts: stub
 * `window.umami` and push every call into a page-global sink so assertions
 * run against a plain array read back over CDP.
 */

type WebVitalsCall = [string, Record<string, unknown>]

declare global {
  interface Window {
    __wvCalls: WebVitalsCall[]
    __wvLcpSeen: number
  }
}

async function installUmamiStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { umami: unknown }).umami = {
      track: (name: string, data: Record<string, unknown>) => {
        ;(window as unknown as { __wvCalls: WebVitalsCall[] }).__wvCalls =
          (window as unknown as { __wvCalls: WebVitalsCall[] }).__wvCalls || []
        ;(window as unknown as { __wvCalls: WebVitalsCall[] }).__wvCalls.push([name, data])
      },
    }
  })
}

/**
 * A second, independent 'largest-contentful-paint' observer, installed
 * alongside the beacon's own (private, unreachable from the test) one, purely
 * as a test-side readiness signal.
 *
 * `performance.getEntriesByType('largest-contentful-paint')` polled from
 * outside after the fact is NOT a reliable readiness signal in headless
 * Chromium - the global Performance Timeline does not reliably retain/expose
 * LCP entries for retroactive query there, even though live
 * `PerformanceObserver` callbacks (the beacon's actual mechanism, via
 * `buffered: true`) do still fire correctly. So this mirrors the beacon's own
 * subscription approach instead of the timeline-query approach.
 */
async function installLcpReadinessProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { __wvLcpSeen: number }).__wvLcpSeen = 0
    try {
      const po = new PerformanceObserver((list) => {
        ;(window as unknown as { __wvLcpSeen: number }).__wvLcpSeen += list.getEntries().length
      })
      po.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      // PerformanceObserver / this entry type unsupported; the beacon itself
      // no-ops the same way, so leave __wvLcpSeen at 0.
    }
  })
}

test('web_vitals fires once, on pagehide, with measured-only metrics', async ({ page }) => {
  await installUmamiStub(page)
  await installLcpReadinessProbe(page)

  await page.goto('/')
  await page.waitForLoadState('load')

  // The largest-contentful-paint entry is delivered to the PerformanceObserver
  // asynchronously (a buffered observer flushes shortly after `load`, not
  // synchronously with it). Poll the readiness probe - not a fixed sleep -
  // until an LCP entry has actually landed, so the beacon's own (closured,
  // unreachable) `lcp` variable has had the same chance to update before we
  // trigger its report().
  await expect
    .poll(() => page.evaluate(() => window.__wvLcpSeen), { timeout: 5000 })
    .toBeGreaterThan(0)

  // No interaction happens in this spec, so `inp` must never be computed.
  // Trigger the beacon's report() synthetically rather than actually closing
  // the page (which would tear down the browser context before we could read
  // __wvCalls back).
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

  await expect.poll(() => page.evaluate(() => window.__wvCalls?.length ?? 0)).toBe(1)

  const calls = await page.evaluate(() => window.__wvCalls)
  expect(calls).toHaveLength(1)

  const [name, data] = calls[0]
  expect(name).toBe('web_vitals')

  expect(typeof data.lcp).toBe('number')
  expect(data.lcp as number).toBeGreaterThan(0)

  expect(typeof data.cls).toBe('number')
  expect(data.cls as number).toBeGreaterThanOrEqual(0)

  expect(data).not.toHaveProperty('inp')

  // Once-per-pageload: a second pagehide (e.g. visibilitychange firing after
  // pagehide already did, or a duplicate unload signal) must be a no-op
  // against the `sent` guard - the call count stays at 1.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect(await page.evaluate(() => window.__wvCalls.length)).toBe(1)
})
