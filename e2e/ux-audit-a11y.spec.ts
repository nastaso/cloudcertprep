import { test, expect } from '@playwright/test'

// Run axe with reduced motion so animated opacity (e.g. the LoadingSpinner /
// skeleton `.animate-pulse`) is neutralized to its resting state. axe's
// color-contrast check asserts the readable resting contrast; scanning a
// mid-animation low-opacity frame is a transient false positive, not a WCAG
// failure. Also matches the screenshot-harness convention (AGENTS.md).
test.use({ reducedMotion: 'reduce' })

// WCAG 2.1 A + AA audit (axe-core, injected from the local transitive dep - no new
// npm dependency) across the UX-audit surfaces in BOTH themes.
const AXE = 'node_modules/axe-core/axe.min.js'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const SURFACES = [
  '/', '/login', '/about', '/contribute', '/blog',
  '/aws/clf-c02', '/aws/clf-c02/cloud-concepts',
  '/aws/clf-c02/practice-exam', '/aws/clf-c02/domain-practice',
  '/history', '/stats', '/account',
  '/?verified=1', '/?error=access_denied&error_code=otp_expired',
]

for (const theme of ['light', 'dark'] as const) {
  for (const route of SURFACES) {
    test(`a11y ${theme} ${route}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('cloudcertprep_theme', t), theme)
      await page.goto(route)
      await page.waitForTimeout(1000)
      await page.addScriptTag({ path: AXE })
      const results = await page.evaluate(async (tags) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (window as any).axe.run(document, { runOnly: { type: 'tag', values: tags } })
      }, TAGS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const violations = (results.violations as any[]).map(
        v => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help} [${v.nodes[0]?.target?.join(' ')}]`,
      )
      expect(violations, `WCAG violations on ${theme} ${route}:\n${violations.join('\n')}`).toEqual([])
    })
  }
}
