import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the conversion-event smoke suite.
 *
 * The site is a static Astro build. `npm run preview` serves `dist/` on
 * http://localhost:4321 (Astro picks the next free port if 4321 is taken, but
 * we pin the expected URL here; `reuseExistingServer` lets a manually started
 * preview be reused during local iteration).
 *
 * Only chromium runs — these are deterministic analytics smoke tests, not a
 * cross-browser matrix. Browser binaries are installed via `npx playwright
 * install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
