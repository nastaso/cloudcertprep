import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the conversion-event smoke suite.
 *
 * The site is a static Astro build. `npm run preview` serves `dist/` on
 * http://localhost:4321 by default. Both the port and whether an
 * already-running preview is reused are env-overridable so an automated agent
 * (or CI-alike) can drive an ISOLATED server it owns instead of colliding with
 * a human's dev/preview session on 4321:
 *
 *   PW_PORT           - port to build the baseURL / preview on (default 4321)
 *   PW_REUSE_SERVER   - set to 0/false/no to force a fresh preview and never
 *                       reuse a foreign server (default: reuse, matching the
 *                       old hardcoded behavior for local human iteration)
 *
 * Defaults reproduce the previous behavior exactly (port 4321, reuse on), so
 * nothing changes for humans running `npm run e2e`. Agents should always set an
 * isolated port, e.g. `PW_PORT=4399 PW_REUSE_SERVER=0 npm run e2e`.
 *
 * Only chromium runs — these are deterministic analytics smoke tests, not a
 * cross-browser matrix. Browser binaries are installed via `npx playwright
 * install chromium`.
 */
const PORT = Number(process.env.PW_PORT) || 4321
const BASE_URL = `http://localhost:${PORT}`
const REUSE_SERVER = !['0', 'false', 'no'].includes(
  (process.env.PW_REUSE_SERVER ?? '').toLowerCase(),
)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: REUSE_SERVER,
    timeout: 120000,
  },
})
