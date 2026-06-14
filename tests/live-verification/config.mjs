// Live-verification suite configuration.
//
// Reusable across deploys: everything is parameterized by environment so the
// same suite runs against the dev branch-deploy preview or production by only
// changing BASE_URL. No new npm deps (Playwright is already in the repo). System
// fonts only. No em or en dashes anywhere in this suite or its output.
//
// Env contract (all optional except where noted):
//   BASE_URL                     target site, e.g. https://www.cloudcertprep.io (required to run)
//   SUPABASE_URL                 falls back to VITE_SUPABASE_URL in .env.local
//   SUPABASE_ANON_KEY            falls back to VITE_SUPABASE_ANON_KEY in .env.local
//   SUPABASE_SERVICE_ROLE_KEY    LIVE service_role; enables the logged-in matrix + write flows.
//                                Pass inline at run time only. NEVER commit or write to .env.
//   TEST_EMAIL                   throwaway account email for the logged-in session
//   RUN_DIR                      override the screenshot output dir

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..', '..')

// Parse .env.local once so SUPABASE_URL / ANON have a local fallback. We never
// read service_role from here; it must come from the process env at run time.
function loadEnvLocal() {
  const p = resolve(REPO_ROOT, '.env.local')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}
const envLocal = loadEnvLocal()

export const BASE_URL = (process.env.BASE_URL || 'https://www.cloudcertprep.io').replace(/\/$/, '')
export const SUPABASE_URL = process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || envLocal.VITE_SUPABASE_ANON_KEY || ''
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
export const TEST_EMAIL = process.env.TEST_EMAIL || 'hcqrpbxqnqytbrzpwm@vtmpj.net'

// Supabase persists the session under sb-<project-ref>-auth-token in localStorage.
export const SUPABASE_REF = (SUPABASE_URL.match(/^https:\/\/([^.]+)\./) || [])[1] || ''
export const SESSION_STORAGE_KEY = SUPABASE_REF ? `sb-${SUPABASE_REF}-auth-token` : ''

// Theme is a localStorage key read by a pre-paint inline script; dark adds a
// `dark` class to <html>. We set both before first paint.
export const THEME_KEY = 'cloudcertprep_theme'

// Cookie-consent banner: a first-visit overlay whose backdrop intercepts clicks
// (it would block the practice/exam start buttons). Pre-accept it so the banner
// never blocks automation. Value confirmed against prod: 'accepted'.
export const CONSENT_KEY = 'cloudcertprep_cookie_consent'
export const CONSENT_VALUE = 'accepted'

const ALL_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]
const ALL_THEMES = ['light', 'dark']

// Optional quick-run knobs (for fast re-runs / pre-flight smoke). Unset = full.
//   LV_VIEWPORTS=desktop        comma list to restrict viewports
//   LV_THEMES=light             comma list to restrict themes
//   LV_MAX_PAGES=5              cap static pages per matrix cell
//   LV_SKIP_EXAM=1              skip the (slow) mock-exam flows
//   LV_SKIP_FLOWS=1             skip all flows (static matrix only)
const csv = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null)
export const VIEWPORTS = csv(process.env.LV_VIEWPORTS)
  ? ALL_VIEWPORTS.filter((v) => csv(process.env.LV_VIEWPORTS).includes(v.name))
  : ALL_VIEWPORTS
export const THEMES = csv(process.env.LV_THEMES) || ALL_THEMES
export const MAX_PAGES = process.env.LV_MAX_PAGES ? parseInt(process.env.LV_MAX_PAGES, 10) : Infinity
export const SKIP_EXAM = process.env.LV_SKIP_EXAM === '1'
export const SKIP_FLOWS = process.env.LV_SKIP_FLOWS === '1'
//   LV_AUTH=in                 restrict static matrix to these auth states (csv: out,in)
//   LV_SKIP_GUEST_FLOWS=1      skip the guest flows (for a logged-in-only follow-up run)
export const AUTH_STATES = csv(process.env.LV_AUTH)
export const SKIP_GUEST_FLOWS = process.env.LV_SKIP_GUEST_FLOWS === '1'

// Certs in the live sitemap.
export const CERTS = ['clf-c02', 'aif-c01']

// App / noindex routes are not in the sitemap; enumerate them explicitly.
// `auth` lists which auth states to capture: 'out' (logged-out), 'in' (logged-in).
// `wait` overrides the default load wait for pages that never reach networkidle
// (the login page mounts a Turnstile widget that keeps a connection warm).
export const APP_ROUTES = [
  { path: '/login', auth: ['out'], wait: 'domcontentloaded', note: 'Turnstile widget' },
  { path: '/reset-password', auth: ['out'], note: 'UI only; never trigger a real reset email' },
  { path: '/stats', auth: ['out', 'in'] },
  { path: '/history', auth: ['out', 'in'], note: 'logged-out is expected to redirect to /login' },
  { path: '/aws/clf-c02/domain-practice', auth: ['out', 'in'], note: 'practice config screen' },
  { path: '/aws/aif-c01/domain-practice', auth: ['out', 'in'], note: 'practice config screen' },
  { path: '/aws/clf-c02/practice-exam', auth: ['out', 'in'], note: 'exam start screen' },
  { path: '/aws/aif-c01/practice-exam', auth: ['out', 'in'], note: 'exam start screen' },
]

// Public sitemap pages are captured logged-out always; these few are also
// captured logged-in to confirm the authenticated header / dashboard state.
export const ALSO_LOGGED_IN_PUBLIC = new Set([
  '/',
  '/aws/clf-c02',
  '/aws/aif-c01',
])

// Settle delay (ms) after load/networkidle before auditing + screenshotting.
export const SETTLE_MS = 500
