import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Conversion-event smoke suite (Phase 2, task 15.2).
 *
 * How event capture works
 * ------------------------
 * Every analytics call funnels through `trackEvent` (src/lib/analytics.ts),
 * which forwards to `window.umami.track(name, params)` and `window.gtag(...)`.
 * `AnalyticsBootstrap` (client:load) also assigns `window.trackEvent = trackEvent`
 * so inline scripts (e.g. the 404 page) can fire events directly.
 *
 * To capture events deterministically we install an init script BEFORE every
 * navigation that:
 *   - defines `window.__events` as a collecting array, and
 *   - stubs `window.umami.track` to push `{ name, params }` into it.
 *
 * Because `trackEvent` calls `window.umami.track` whenever it exists, stubbing
 * umami captures both island-fired events (landing, github_click) and
 * inline-script events (page_not_found) without needing a real Umami script.
 * We also stub `window.trackEvent` as a fallback so the inline 404 script's
 * `if (window.trackEvent)` branch records too — both paths converge on
 * `window.__events`.
 *
 * What is NOT covered here
 * ------------------------
 * Auth events (sign_up, sign_in, sign_in_initiated, sign_out) and the full
 * exam/practice lifecycle (exam_started/completed/abandoned,
 * practice_started/completed, question_answered, report_question_clicked,
 * cta_start_practice_exam behind auth) require a live Supabase test project and
 * a seeded test user. Those are scaffolded below as `test.fixme` with pointers
 * to docs/playwright-test-supabase.md. We do NOT fabricate passing assertions
 * for flows that need real auth.
 */

interface CapturedEvent {
  name: string
  params?: Record<string, unknown>
}

declare global {
  interface Window {
    __events: CapturedEvent[]
  }
}

/**
 * Install the umami/trackEvent stub before any page script runs. Persists
 * across the navigations triggered within a single test via addInitScript.
 */
async function installEventCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sink: CapturedEvent[] = []
    ;(window as unknown as { __events: CapturedEvent[] }).__events = sink

    const umamiStub = {
      track: (name: string, params?: Record<string, unknown>) => {
        sink.push({ name, params })
      },
    }
    Object.defineProperty(window, 'umami', {
      configurable: true,
      get: () => umamiStub,
      set: () => {
        /* swallow the real Umami loader so our stub stays in place */
      },
    })

    // Fallback path for inline scripts that call window.trackEvent directly
    // (e.g. the 404 page). Mirrors events into the same sink so a single
    // assertion surface covers both code paths.
    ;(window as unknown as { trackEvent: (n: string, p?: Record<string, unknown>) => void }).trackEvent =
      (name: string, params?: Record<string, unknown>) => {
        sink.push({ name, params })
      }
  })
}

function eventNames(events: CapturedEvent[]): string[] {
  return events.map((e) => e.name)
}

test.describe('conversion events — anonymous, no-auth flows', () => {
  test('landing event fires with UTM params on first paint', async ({ page }) => {
    await installEventCapture(page)
    await page.goto('/?utm_source=test&utm_medium=ci&utm_campaign=smoke')

    // AnalyticsBootstrap mounts client:load and fires the one-shot landing
    // event from a useEffect, so poll until it lands.
    await expect
      .poll(async () => eventNames(await page.evaluate(() => window.__events)))
      .toContain('landing')

    const events = await page.evaluate(() => window.__events)
    const landing = events.find((e) => e.name === 'landing')
    expect(landing?.params).toMatchObject({
      utm_source: 'test',
      utm_medium: 'ci',
      utm_campaign: 'smoke',
    })
  })

  test('page_not_found fires on an unknown route', async ({ page }) => {
    await installEventCapture(page)
    await page.goto('/foo-bar-404')

    // 404.astro runs an inline script that calls window.trackEvent on load,
    // and the _NotFound island also fires it. Either path records into __events.
    await expect
      .poll(async () => eventNames(await page.evaluate(() => window.__events)))
      .toContain('page_not_found')
  })

  test('github_click fires when the header GitHub link is activated', async ({ page, context }) => {
    await installEventCapture(page)

    // Record when the header island finishes hydrating. HeaderInteractive is a
    // `client:idle` island (see Header.astro), so the React onClick that fires
    // github_click is attached only once requestIdleCallback runs - NOT at first
    // paint. Under full-suite parallelism that idle callback can land well after
    // the server-rendered link is already visible, so asserting visibility and
    // clicking immediately raced hydration: the click hit the static <a> before
    // its handler existed and no event fired (the flake). The island dispatches
    // `cc:session-resolved` from a mount effect once auth resolves (guest
    // included) - i.e. AFTER React has committed and wired the onClick - so it is
    // the app's own "this island is live" signal. No arbitrary sleep.
    await page.addInitScript(() => {
      ;(window as unknown as { __ccHeaderHydrated: boolean }).__ccHeaderHydrated = false
      window.addEventListener(
        'cc:session-resolved',
        () => {
          ;(window as unknown as { __ccHeaderHydrated: boolean }).__ccHeaderHydrated = true
        },
        { once: true },
      )
    })

    await page.goto('/')

    const githubLink = page.getByRole('link', { name: 'View source on GitHub' }).first()
    await expect(githubLink).toBeVisible()

    // Gate the click on hydration, not just visibility: wait until the island has
    // wired its handlers before clicking.
    await page.waitForFunction(
      () => (window as unknown as { __ccHeaderHydrated?: boolean }).__ccHeaderHydrated === true,
      undefined,
      { timeout: 15000 },
    )

    // The link is target="_blank"; clicking opens a new tab. The onClick fires
    // trackEvent synchronously before the navigation, so the event is recorded
    // on the original page regardless of the popup. Intercept the popup so the
    // external request never actually leaves the test environment.
    context.on('page', (popup) => popup.close().catch(() => {}))

    await githubLink.click({ modifiers: [] })

    await expect
      .poll(async () => eventNames(await page.evaluate(() => window.__events)))
      .toContain('github_click')

    const events = await page.evaluate(() => window.__events)
    const click = events.find((e) => e.name === 'github_click')
    expect(click?.params).toMatchObject({ location: 'header' })
  })
})

test.describe('reserved analytics names', () => {
  // `affiliate_click` is a reserved-but-not-yet-wired event name. It is never
  // fired in the browser, so there is nothing to capture at runtime. Instead we
  // assert the name is reserved in the analytics source so the namespace stays
  // stable for the deferred affiliate iteration. This is a Node-side file read,
  // not a browser assertion — honest and minimal.
  test('affiliate_click is reserved in src/lib/analytics.ts KNOWN_EVENTS', () => {
    const analyticsPath = fileURLToPath(new URL('../src/lib/analytics.ts', import.meta.url))
    const source = readFileSync(analyticsPath, 'utf8')
    expect(source).toContain("'affiliate_click'")
  })
})

/**
 * Auth + exam-flow events — scaffolded, intentionally skipped.
 *
 * These require a throwaway Supabase test project (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY) and a seeded test user. See
 * docs/playwright-test-supabase.md for the setup needed to un-skip them.
 *
 * Marked `test.fixme` so they appear in the report as pending work rather than
 * silently passing or failing against real auth.
 */
test.describe('auth + exam-flow events (require Supabase test project)', () => {
  test.fixme('sign_up fires after email registration', async () => {
    // Setup: docs/playwright-test-supabase.md — seed a unique email, complete
    // the sign-up form on /<cert>/login, assert __events contains 'sign_up'.
  })

  test.fixme('sign_in_initiated fires when starting GitHub OAuth', async () => {
    // Setup: docs/playwright-test-supabase.md — click the GitHub OAuth button,
    // assert 'sign_in_initiated' before the external redirect.
  })

  test.fixme('sign_in fires after successful email/password login', async () => {
    // Setup: docs/playwright-test-supabase.md — log in as the seeded test user,
    // assert __events contains 'sign_in'.
  })

  test.fixme('sign_out fires from the authenticated header', async () => {
    // Setup: docs/playwright-test-supabase.md — authenticate, click "Sign out",
    // assert __events contains 'sign_out'.
  })

  test.fixme('cta_start_practice_exam fires from the cert dashboard CTA', async () => {
    // Setup: docs/playwright-test-supabase.md — authenticated dashboard exposes
    // the practice-exam CTA; assert 'cta_start_practice_exam'.
  })

  test.fixme('exam lifecycle: exam_started / question_answered / exam_completed', async () => {
    // Setup: docs/playwright-test-supabase.md — start a mock exam, answer
    // questions, finish; assert exam_started, the per-question answered event,
    // and exam_completed are captured.
  })

  test.fixme('exam_abandoned fires when leaving an in-progress exam', async () => {
    // Setup: docs/playwright-test-supabase.md — start an exam, navigate away,
    // assert 'exam_abandoned'.
  })

  test.fixme('practice lifecycle: practice_started / practice_completed', async () => {
    // Setup: docs/playwright-test-supabase.md — run a domain practice session
    // end to end; assert practice_started and practice_completed.
  })

  test.fixme('report_question_clicked fires from the question review card', async () => {
    // Setup: docs/playwright-test-supabase.md — open a completed exam review,
    // click "report question", assert 'report_question_clicked'.
  })
})
