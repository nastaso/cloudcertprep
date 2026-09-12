import { test, expect, type Route } from '@playwright/test'
import { seedSession } from './seededSession'

/**
 * Chrome's Google Translate replaces text nodes with nested <font> elements.
 * React can otherwise retain a stale reference to the original text node when
 * a component later swaps a conditional label.
 */
async function emulateGoogleTranslate(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('body').evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []

    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeValue?.trim()) textNodes.push(node as Text)
    }

    for (const textNode of textNodes) {
      const outerFont = document.createElement('font')
      const innerFont = document.createElement('font')
      innerFont.textContent = textNode.nodeValue
      outerFont.append(innerFont)
      textNode.parentNode?.replaceChild(outerFont, textNode)
    }
  })
}

/**
 * PR-2: localStorage crash safety + stuck dashboard error state.
 * Runs in CI with the seeded-session fixture (no real backend / Turnstile).
 * Source: EDGE-CASE-FINDINGS-2026-06-28.md, surfaces 3 + 7.
 */

// ---------------------------------------------------------------------------
// Storage crash safety: theme toggle with localStorage blocked
// ---------------------------------------------------------------------------

test('footer theme toggle survives Google Translate DOM changes', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))

  await page.goto('/')

  const toggle = page.getByRole('button', { name: 'Switch to dark mode' })
  await expect(toggle).toBeVisible({ timeout: 15000 })
  await emulateGoogleTranslate(page)

  await toggle.click()

  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('practice exam starts and advances after Google Translate DOM changes', async ({ page }) => {
  await page.goto('/aws/clf-c02/practice-exam')

  const startExam = page.getByRole('button', { name: 'Start exam' })
  await expect(startExam).toBeVisible({ timeout: 15000 })

  // Starting the exam swaps the button label for its loading state. Without a
  // stable label wrapper, React tries to remove the text node that Translate
  // already replaced and the app ErrorBoundary takes over.
  await emulateGoogleTranslate(page)
  await startExam.click()
  await expect(page.getByText('Question 1 of 65', { exact: true })).toBeVisible({ timeout: 15000 })

  // Translate also processes the freshly-rendered question and answer text.
  // Moving to the next question must replace those values rather than leaving
  // the previous question visible inside nested <font> elements.
  await emulateGoogleTranslate(page)
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByText('Question 2 of 65', { exact: true })).toBeVisible()
  await expect(page.locator('h2.cc-question-stem')).toContainText('A company has users across multiple geographic regions')
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
})

test('useTheme: theme toggles without crashing when localStorage is blocked', async ({ page }) => {
  // Proxy localStorage so setItem throws a SecurityError (storage-blocked browser).
  await page.addInitScript(() => {
    const orig = window.localStorage
    const proxy = new Proxy(orig, {
      get(target, prop) {
        if (prop === 'setItem') {
          return () => { throw new DOMException('SecurityError: storage blocked', 'SecurityError') }
        }
        const val = target[prop as keyof Storage]
        return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val
      },
    })
    Object.defineProperty(window, 'localStorage', { get: () => proxy, configurable: true })
  })

  await page.goto('/')

  // Theme toggle must be present and interactable
  const toggle = page.getByRole('button', { name: /toggle.*theme|switch.*theme|dark|light/i }).first()
  await expect(toggle).toBeVisible({ timeout: 15000 })

  // Click should not crash - if it did, the no-transition class would be stuck
  // (killing all site transitions) and a second click would fail silently.
  await toggle.click()

  // Double-rAF takes <50ms; wait a bit then verify no-transition was removed.
  await page.waitForTimeout(200)

  const hasNoTransition = await page.evaluate(
    () => document.documentElement.classList.contains('no-transition'),
  )
  expect(
    hasNoTransition,
    '.no-transition must be removed after toggle even when localStorage throws',
  ).toBe(false)

  // A second toggle must also work (state is not jammed).
  await toggle.click()
  await page.waitForTimeout(200)
  const stillStuck = await page.evaluate(
    () => document.documentElement.classList.contains('no-transition'),
  )
  expect(stillStuck, 'second toggle must also clean up no-transition').toBe(false)
})

// ---------------------------------------------------------------------------
// useCert: exam page renders when localStorage.getItem is blocked (surface 7)
// ---------------------------------------------------------------------------

test('useCert: practice-exam renders without crashing when localStorage.getItem is blocked', async ({ page }) => {
  // Block localStorage.getItem to simulate a storage-disabled / sandboxed browser.
  // This is the exact condition that made getStored() throw during render, causing
  // the AppIsland ErrorBoundary to catch it and show "Something went wrong."
  await page.addInitScript(() => {
    const orig = window.localStorage
    const proxy = new Proxy(orig, {
      get(target, prop) {
        if (prop === 'getItem') {
          return () => { throw new DOMException('SecurityError', 'SecurityError') }
        }
        const val = target[prop as keyof Storage]
        return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val
      },
    })
    Object.defineProperty(window, 'localStorage', { get: () => proxy, configurable: true })
  })

  await page.goto('/aws/clf-c02/practice-exam')

  // The ErrorBoundary must NOT fire.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0)

  // The exam start screen must render (useCert fell back to DEFAULT_CERT_ID,
  // not an uncaught SecurityError that crashes the island).
  await expect(page.getByRole('button', { name: 'Start exam' })).toBeVisible({ timeout: 15000 })
})

// ---------------------------------------------------------------------------
// Dashboard: error clears on successful re-fetch (surface 7)
// ---------------------------------------------------------------------------

test('CertDashboard: error alert clears when a re-fetch succeeds', async ({ page }) => {
  // Use a closure flag so the route handler switches from fail -> succeed once
  // the test is ready to click "Try again".
  let shouldFail = true

  await seedSession(page, {
    rest: (route: Route) => {
      if (shouldFail) {
        // Abort (network error): caught by the .catch() in CertDashboard, sets dataError=true.
        return route.abort()
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
        headers: { 'Content-Range': '0-0/0' },
      })
    },
  })

  await page.goto('/aws/clf-c02')

  // Wait for auth to resolve and the dashboard kicker to appear (proves
  // useAuth().user resolved from the seeded token). The middot separator
  // distinguishes the kicker from the sr-only "Loading your dashboard" status.
  await expect(page.getByText(/·\s*your dashboard/i)).toBeVisible({ timeout: 15000 })

  // With both REST queries aborted, the dashboard must show the error alert.
  await expect(
    page.getByText(/could not load your latest progress/i),
  ).toBeVisible({ timeout: 10000 })

  // Switch the route handler to succeed, then trigger a re-fetch via "Try again".
  shouldFail = false
  await page.getByRole('button', { name: /try again/i }).click()

  // The error alert must disappear (dataError cleared by the success path).
  await expect(
    page.getByText(/could not load your latest progress/i),
  ).toBeHidden({ timeout: 10000 })

  // "Domain mastery" heading is only rendered when !dataError (the section is
  // conditionally removed, not just hidden), so its presence confirms the error
  // state was fully resolved, not merely styled away.
  await expect(
    page.getByRole('heading', { name: 'Domain mastery', exact: true }),
  ).toBeVisible({ timeout: 5000 })
})
