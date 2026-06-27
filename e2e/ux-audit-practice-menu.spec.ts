import { test, expect, type Page } from '@playwright/test'

const AXE = 'node_modules/axe-core/axe.min.js'
const SHOTS = '.kiro/ux/audit-2026-06-24/qa-shots'
const FIRST_LINK = '#site-header a[href="/aws/clf-c02/practice-exam"]'

// Open the desktop disclosure robustly: the trigger lives in the SSR'd header
// island, so under load the click can land before onClick attaches; retry until
// the panel's first link appears (idempotent - guard skips if already open).
async function openDesktopMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Practice', exact: true })
  await expect(trigger).toBeVisible({ timeout: 10000 })
  await expect(async () => {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
    await expect(page.locator(FIRST_LINK)).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  return trigger
}

async function openDrawer(page: Page) {
  const toggle = page.getByRole('button', { name: 'Toggle menu' })
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15000 })
  return page.getByRole('dialog', { name: 'Menu' })
}

test('desktop: opens, lists cert x mode links, Escape + outside-click close', async ({ page }) => {
  await page.goto('/')
  const trigger = await openDesktopMenu(page)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  const panel = page.locator('#site-header')
  await expect(panel.locator('a[href$="/practice-exam"]')).toHaveCount(2)
  await expect(panel.locator('a[href$="/domain-practice"]')).toHaveCount(2)
  await expect(panel.locator('a[href="/aws/clf-c02/practice-exam"]')).toBeVisible()
  await expect(panel.locator('a[href="/aws/aif-c01/domain-practice"]')).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Browse all certifications' })).toHaveAttribute('href', '/#certifications')

  // Escape closes and returns focus to the trigger (disclosure pattern)
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()

  // outside-click closes
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.mouse.click(3, 500)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('mobile: accordion expands to cert x mode links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const drawer = await openDrawer(page)
  const acc = drawer.getByRole('button', { name: 'Practice', exact: true })
  await expect(acc).toHaveAttribute('aria-expanded', 'false')
  await acc.click()
  await expect(acc).toHaveAttribute('aria-expanded', 'true')
  await expect(drawer.locator('a[href="/aws/clf-c02/practice-exam"]')).toBeVisible()
  await expect(drawer.locator('a[href="/aws/aif-c01/domain-practice"]')).toBeVisible()
})

test('logged-out: menu shows the two modes and NO Dashboard link', async ({ page }) => {
  await page.goto('/')
  await openDesktopMenu(page)
  const panel = page.locator('#site-header')
  await expect(panel.locator('a[href$="/practice-exam"]')).toHaveCount(2)
  await expect(panel.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)
})

test('mobile hamburger: available on the exam start screen AND during the active exam', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/aws/clf-c02/practice-exam')
  const burger = page.getByRole('button', { name: 'Toggle menu' })
  await expect(burger).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Start exam', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.examActive === 'true', { timeout: 25000 })
  // bug 13: the mobile menu affordance stays available DURING the active exam
  // (any nav routes through the leave-guard confirm); it used to be hidden.
  await expect(burger).toBeVisible()
})

test('mobile hamburger: available throughout domain practice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/aws/clf-c02/domain-practice')
  await expect(page.getByRole('button', { name: 'Toggle menu' })).toBeVisible({ timeout: 10000 })
})

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE })
  const results = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (results.violations as any[]).map(v => `${v.id} (${v.impact}): ${v.help} [${v.nodes[0]?.target?.join(' ')}]`)
}

for (const theme of ['light', 'dark'] as const) {
  test(`a11y (axe WCAG AA) desktop menu OPEN - ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.goto('/')
    await openDesktopMenu(page)
    const v = await axeViolations(page)
    expect(v, `violations:\n${v.join('\n')}`).toEqual([])
  })

  test(`a11y (axe WCAG AA) mobile accordion OPEN - ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const drawer = await openDrawer(page)
    await drawer.getByRole('button', { name: 'Practice', exact: true }).click()
    await expect(drawer.locator('a[href="/aws/clf-c02/practice-exam"]')).toBeVisible()
    const v = await axeViolations(page)
    expect(v, `violations:\n${v.join('\n')}`).toEqual([])
  })

  test(`shot: desktop menu open - ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.goto('/')
    await openDesktopMenu(page)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/practice-menu-desktop-${theme}.png` })
  })

  test(`shot: desktop menu open NARROW (md, overflow check) - ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 820, height: 800 })
    await page.goto('/')
    await openDesktopMenu(page)
    // the panel must not overflow the viewport on the right or left
    const box = await page.locator(FIRST_LINK).locator('xpath=ancestor::div[contains(@class,"absolute")]').first().boundingBox()
    expect(box, 'panel box').toBeTruthy()
    if (box) {
      expect(box.x, 'panel left within viewport').toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, 'panel right within viewport').toBeLessThanOrEqual(820)
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/practice-menu-desktop-md-${theme}.png` })
  })

  test(`shot: mobile accordion open - ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const drawer = await openDrawer(page)
    await drawer.getByRole('button', { name: 'Practice', exact: true }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/practice-menu-mobile-${theme}.png` })
  })
}
