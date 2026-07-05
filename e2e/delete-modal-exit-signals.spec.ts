import { test, expect, type Page } from '@playwright/test'
import { seedSession, getSeedRef } from './seededSession'

/**
 * Delete-modal exit signals (GROW M1): optional reason chips + export pointer.
 *
 * Everything here runs against the seeded-session harness with the
 * `delete-account` Edge Function route STUBBED, so no real backend (and no
 * real deletion) is ever touched - safe in CI with the placeholder Supabase
 * URL and locally against a live project.
 *
 * The binding anti-dark-pattern contract under test:
 *  - the reason is optional and skippable (never gates the Delete button),
 *  - deletion stays exactly one click after DELETE is typed,
 *  - the `account_delete_reason` event fires ONLY when a chip was selected.
 * Plus the #138 behaviors these additions must not break: retry-first error
 * copy on failure, and cross-tab session death auto-closing the modal.
 */

interface CapturedEvent {
  name: string
  params?: Record<string, unknown>
}

/**
 * Stub window.umami so every trackEvent is relayed off-page via
 * navigator.sendBeacon, and capture those beacons Node-side. A plain
 * window.__events sink does not survive the post-delete hard navigation
 * (window.location.assign wipes page globals); sendBeacon is designed to
 * keep delivering during unload, and page.route observes it reliably even
 * across that navigation.
 */
async function installEventCapture(page: Page): Promise<CapturedEvent[]> {
  const events: CapturedEvent[] = []
  await page.route('**/__evt', async route => {
    const body = route.request().postData()
    if (body) {
      try {
        events.push(JSON.parse(body) as CapturedEvent)
      } catch {
        // ignore malformed beacon bodies
      }
    }
    await route.fulfill({ status: 204, body: '' })
  })
  await page.addInitScript(() => {
    ;(window as unknown as { umami: unknown }).umami = {
      track: (name: string, params?: Record<string, unknown>) => {
        navigator.sendBeacon('/__evt', JSON.stringify({ name, params }))
      },
    }
  })
  return events
}

/**
 * Stub the delete-account Edge Function. `delayMs` holds the response open so
 * assertions can observe the "Deleting your account..." spinner before the
 * success path redirects away.
 */
async function stubDeleteFunction(page: Page, opts: { status: number; delayMs?: number }): Promise<void> {
  await page.route('**/functions/v1/delete-account', async route => {
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
    await route.fulfill({
      status: opts.status,
      contentType: 'application/json',
      body: opts.status === 200 ? '{"ok":true}' : '{"error":"boom"}',
    })
  })
}

async function openDeleteModal(page: Page): Promise<void> {
  await page.goto('/account')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('chips are optional and toggleable; Delete enables on typed DELETE alone', async ({ page }) => {
  await seedSession(page)
  await openDeleteModal(page)

  const chip = page.getByRole('button', { name: 'Passed my exam' })
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')

  // One click after DELETE is typed, no chip required.
  const deleteBtn = page.getByRole('button', { name: 'Delete account' })
  await expect(deleteBtn).toBeDisabled()
  await page.getByPlaceholder('DELETE').fill('DELETE')
  await expect(deleteBtn).toBeEnabled()
})

test('no chip selected: deletion proceeds and account_delete_reason does NOT fire', async ({ page }) => {
  const events = await installEventCapture(page)
  await seedSession(page)
  await stubDeleteFunction(page, { status: 200, delayMs: 1200 })
  await openDeleteModal(page)

  await page.getByPlaceholder('DELETE').fill('DELETE')
  await page.getByRole('button', { name: 'Delete account' }).click()

  // The stub holds the response open long enough to observe the spinner.
  await expect(page.getByText('Deleting your account...')).toBeVisible()

  // trackEvent (if any) fires just before the hard navigation away; assert
  // against the Node-side capture after the redirect lands, once the
  // beacon (if any) has had a chance to arrive.
  await page.waitForURL('**/?account_deleted=1')
  await expect.poll(() => events.filter(e => e.name === 'account_delete_reason').length).toBe(0)
})

test('chip selected: account_delete_reason fires once, anonymously, at deletion time', async ({ page }) => {
  const events = await installEventCapture(page)
  await seedSession(page)
  await stubDeleteFunction(page, { status: 200, delayMs: 1200 })
  await openDeleteModal(page)

  await page.getByRole('button', { name: 'Found a better tool' }).click()
  await page.getByPlaceholder('DELETE').fill('DELETE')
  await page.getByRole('button', { name: 'Delete account' }).click()

  await expect(page.getByText('Deleting your account...')).toBeVisible()

  // The event fires right before the success redirect; wait for the
  // redirect, then assert against the Node-side beacon capture (which
  // survives the navigation, unlike an in-page window.__events sink).
  await page.waitForURL('**/?account_deleted=1')
  const reasonEvents = () => events.filter(e => e.name === 'account_delete_reason')
  await expect.poll(() => reasonEvents().length).toBe(1)
  // Anonymous: the payload is the reason slug and nothing else.
  expect(reasonEvents()[0].params).toEqual({ reason: 'better_tool' })
})

test('export pointer closes the modal and runs the existing export', async ({ page }) => {
  await seedSession(page)
  await openDeleteModal(page)

  await page.getByRole('button', { name: 'Download your data' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  // handleExport runs against the seeded REST stub and saves the JSON file.
  await expect(page.getByText('Your data has been downloaded.')).toBeVisible()
})

test('#138 regression: failed delete keeps retry-first copy; chip + typed confirm survive', async ({ page }) => {
  await installEventCapture(page)
  await seedSession(page)
  await stubDeleteFunction(page, { status: 500 })
  await openDeleteModal(page)

  await page.getByRole('button', { name: 'Privacy' }).click()
  await page.getByPlaceholder('DELETE').fill('DELETE')
  await page.getByRole('button', { name: 'Delete account' }).click()

  await expect(page.getByRole('alert')).toContainText(/could not delete your account/i)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Privacy' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder('DELETE')).toHaveValue('DELETE')
})

test('#138 regression: cross-tab sign-out still auto-closes the modal', async ({ page }) => {
  await seedSession(page)
  await openDeleteModal(page)

  // auth-js delivers cross-tab auth events over a BroadcastChannel named
  // after the storage key; a SIGNED_OUT message is exactly what signOut in
  // another tab broadcasts. Post it from a second page (a channel never
  // delivers to its own context).
  const tabB = await page.context().newPage()
  await tabB.goto('/404')
  await tabB.evaluate(ref => {
    new BroadcastChannel(`sb-${ref}-auth-token`).postMessage({ event: 'SIGNED_OUT', session: null })
  }, getSeedRef())
  await tabB.close()

  await expect(page.getByRole('dialog')).toBeHidden()
})
