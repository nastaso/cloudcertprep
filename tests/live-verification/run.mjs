// Live-verification orchestrator.
//
// Drives the full screenshot matrix + scripted flows against BASE_URL, auto
// captures errors, and writes a triage report. Reusable on every deploy:
//
//   BASE_URL=https://www.cloudcertprep.io \
//   [SUPABASE_SERVICE_ROLE_KEY=<live service_role>] \
//   node tests/live-verification/run.mjs
//
// With the service_role present it also runs the logged-in matrix + write flows
// against the throwaway account. Without it, only logged-out + guest flows run.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REPO_ROOT, BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  TEST_EMAIL, SESSION_STORAGE_KEY, THEME_KEY, CONSENT_KEY, CONSENT_VALUE,
  VIEWPORTS, THEMES, APP_ROUTES, ALSO_LOGGED_IN_PUBLIC, SETTLE_MS,
  MAX_PAGES, SKIP_EXAM, SKIP_FLOWS, AUTH_STATES, SKIP_GUEST_FLOWS,
} from './config.mjs'
import { attachListeners, auditPage, collectFindings } from './capture.mjs'
import { mintSession } from './auth.mjs'
import { runDomainPractice, runMockExam, runInteractiveSamples } from './flows.mjs'

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const RUN_DIR = process.env.RUN_DIR || resolve(REPO_ROOT, '.kiro/ship-v2/live-verification', stamp)
const SHOTS_DIR = resolve(RUN_DIR, 'screenshots')
mkdirSync(SHOTS_DIR, { recursive: true })

const sanitize = (s) => s.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 120) || 'root'

// ---- enumerate pages from the live sitemap + the app routes -----------------
async function enumeratePages() {
  const res = await fetch(`${BASE_URL}/sitemap.xml`)
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`)
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const sitemapPaths = locs
    .filter((u) => u.startsWith(BASE_URL))
    .map((u) => u.slice(BASE_URL.length) || '/')

  const pages = []
  for (const path of sitemapPaths) {
    const auth = ['out']
    if (ALSO_LOGGED_IN_PUBLIC.has(path)) auth.push('in')
    pages.push({ path, indexable: true, auth, wait: 'networkidle' })
  }
  for (const r of APP_ROUTES) {
    pages.push({ path: r.path, indexable: false, auth: r.auth, wait: r.wait || 'networkidle', note: r.note })
  }
  return pages
}

// Combined init script (runs before first paint on every navigation): set the
// theme pre-paint, inject the session for logged-in contexts, and install the
// CSP-violation collector inline. No eval / new Function so nothing trips the
// site's strict hash-based CSP.
function initScript() {
  return ({ themeKey, theme, sessionKey, sessionVal, consentKey, consentVal }) => {
    // Set ALL localStorage first. This runs at document_start where
    // document.documentElement is null, so we must NOT touch the DOM before the
    // setItem calls or a throw would skip them. The site's own pre-paint inline
    // script reads `themeKey` and applies the `dark` class, so we do not need to.
    try {
      localStorage.setItem(themeKey, theme)
      if (consentKey && consentVal) localStorage.setItem(consentKey, consentVal)
      if (sessionKey && sessionVal) localStorage.setItem(sessionKey, sessionVal)
    } catch (e) {
      /* cross-origin frame (e.g. Turnstile) has no storage access; ignore */
    }
    try {
      const w = window
      w.__cspViolations = []
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
        })
      })
    } catch (e) { /* ignore */ }
  }
}

async function makeContext(browser, viewport, theme, auth, session, { consent = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'reduce',
    colorScheme: theme,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: false,
  })
  await ctx.addInitScript(initScript(), {
    themeKey: THEME_KEY,
    theme,
    consentKey: consent ? CONSENT_KEY : '',
    consentVal: consent ? CONSENT_VALUE : '',
    sessionKey: auth === 'in' ? SESSION_STORAGE_KEY : '',
    sessionVal: auth === 'in' && session ? session.storageValue : '',
  })
  return ctx
}

async function settle(page, wait) {
  if (wait === 'networkidle') {
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
  }
  await page.waitForTimeout(SETTLE_MS)
}

// ---- main -------------------------------------------------------------------
const findings = []
const pageRecords = []
const flowResults = []
const warnings = []

const browser = await chromium.launch()
const startedAt = Date.now()

let session = null
let authMode = 'logged-out only'
if (SUPABASE_SERVICE_ROLE_KEY) {
  try {
    session = await mintSession({
      url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY,
      serviceRole: SUPABASE_SERVICE_ROLE_KEY, email: TEST_EMAIL,
    })
    authMode = `logged-out + logged-in (${session.email})`
    console.log(`[auth] minted session for ${session.email} (expires_at=${session.expiresAt})`)
  } catch (e) {
    warnings.push(`Session mint FAILED: ${e.message}. Logged-in matrix + write flows SKIPPED.`)
    console.error(`[auth] ${e.message}`)
  }
} else {
  warnings.push('SUPABASE_SERVICE_ROLE_KEY not provided: logged-in matrix + write flows SKIPPED.')
}

const pages = await enumeratePages()
console.log(`[enumerate] ${pages.length} pages; auth mode: ${authMode}`)

// snapshot a single static page within a context
async function capturePage(ctx, route, meta) {
  const page = await ctx.newPage()
  const sink = attachListeners(page)
  const label = `${meta.viewport}_${meta.theme}_${meta.auth}__${sanitize(route.path)}`
  const shot = resolve(SHOTS_DIR, `${label}.png`)
  let finalUrl = route.path
  let status = null
  let title = ''
  try {
    const resp = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    status = resp?.status() ?? null
    await settle(page, route.wait)
    finalUrl = page.url().replace(BASE_URL, '') || '/'
    const audit = await auditPage(page)
    title = audit.title
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    const ctxMeta = { ...meta, page: route.path, finalUrl, shot: shot.replace(RUN_DIR + '/', ''), indexable: route.indexable }
    findings.push(...collectFindings(ctxMeta, sink, audit))
    pageRecords.push({ ...meta, page: route.path, status, finalUrl, title, redirected: finalUrl !== route.path, shot: shot.replace(RUN_DIR + '/', '') })
  } catch (e) {
    findings.push({ ...meta, page: route.path, type: 'navigation_error', severity: 'high', detail: { message: String(e?.message || e) }, shot: null })
    pageRecords.push({ ...meta, page: route.path, status, finalUrl, title, error: String(e?.message || e) })
  } finally {
    await page.close().catch(() => {})
  }
}

// recorder injected into flows
function makeRecorder(meta) {
  return {
    baseUrl: BASE_URL,
    meta,
    async snap(page, sink, label) {
      await settle(page, 'networkidle')
      const audit = await auditPage(page).catch(() => ({ cspViolations: [], brokenImages: [], overflowPx: 0, overflowOffenders: [], title: '' }))
      const shot = resolve(SHOTS_DIR, `flow__${sanitize(label)}.png`)
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
      const ctxMeta = { ...meta, step: label, shot: shot.replace(RUN_DIR + '/', '') }
      const f = collectFindings(ctxMeta, sink, audit)
      findings.push(...f)
      // drain the sink so the next step only sees new events
      sink.consoleErrors.length = 0; sink.pageErrors.length = 0
      sink.failedRequests.length = 0; sink.requestFailures.length = 0
      return { findings: f, shotPath: shot.replace(RUN_DIR + '/', '') }
    },
  }
}

// (Removed) The first-visit cookie-consent banner capture: the banner is now
// hidden (cookieless Umami, GA disabled), so there is no overlay to screenshot.
// makeContext still defaults to seeding the consent key as a harmless no-op.

// ---- run the static page matrix --------------------------------------------
for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const authStates = (session ? ['out', 'in'] : ['out']).filter((a) => !AUTH_STATES || AUTH_STATES.includes(a))
    for (const auth of authStates) {
      const ctx = await makeContext(browser, viewport, theme, auth, session)
      const meta = { viewport: viewport.name, theme, auth }
      const toCapture = pages.filter((p) => p.auth.includes(auth)).slice(0, MAX_PAGES)
      for (const route of toCapture) {
        await capturePage(ctx, route, meta)
      }
      console.log(`[matrix] ${viewport.name}/${theme}/${auth}: ${toCapture.length} pages`)
      await ctx.close()
    }
  }
}

// ---- run flows --------------------------------------------------------------
// Use the widest configured viewport for flows (desktop unless restricted).
const DESKTOP_VP = VIEWPORTS.find((v) => v.name === 'desktop') || VIEWPORTS[VIEWPORTS.length - 1]
const MOBILE_VP = VIEWPORTS.find((v) => v.name === 'mobile') || VIEWPORTS[0]

// Guest flows: desktop (primary) + a mobile practice pass for mobile-only
// overflow. Zero DB writes, safe on prod.
if (!SKIP_FLOWS && !SKIP_GUEST_FLOWS) {
  const ctxD = await makeContext(browser, DESKTOP_VP, 'light', 'out', null)
  const recD = makeRecorder({ viewport: DESKTOP_VP.name, theme: 'light', auth: 'guest' })
  flowResults.push(await runDomainPractice({ ctx: ctxD, recorder: recD, cert: 'clf-c02', domain: 1, count: 5, label: 'guest-practice:clf-d1' }))
  flowResults.push(...await runInteractiveSamples({ ctx: ctxD, recorder: recD }))
  if (!SKIP_EXAM) flowResults.push(await runMockExam({ ctx: ctxD, recorder: recD, cert: 'clf-c02', label: 'guest-exam:clf' }))
  await ctxD.close()

  const ctxM = await makeContext(browser, MOBILE_VP, 'dark', 'out', null)
  const recM = makeRecorder({ viewport: MOBILE_VP.name, theme: 'dark', auth: 'guest' })
  flowResults.push(await runDomainPractice({ ctx: ctxM, recorder: recM, cert: 'aif-c01', domain: 1, count: 4, label: 'guest-practice:aif-d1-mobile' }))
  await ctxM.close()
}

// Logged-in write flows: only with a real session. Touch ONLY the throwaway
// account. Pace the exam past the 60s persistence floor so the DB insert +
// domain_progress upsert actually fire (incl. the AIF domain-5 constraint path).
if (session && !SKIP_FLOWS) {
  const ctxL = await makeContext(browser, DESKTOP_VP, 'light', 'in', session)
  const recL = makeRecorder({ viewport: DESKTOP_VP.name, theme: 'light', auth: 'logged-in' })
  flowResults.push(await runDomainPractice({ ctx: ctxL, recorder: recL, cert: 'aif-c01', domain: 5, count: 5, label: 'loggedin-practice:aif-d5' }))
  if (!SKIP_EXAM) flowResults.push(await runMockExam({ ctx: ctxL, recorder: recL, cert: 'clf-c02', label: 'loggedin-exam:clf', minDurationMs: 65000 }))
  await ctxL.close()
}

await browser.close()
const durationS = Math.round((Date.now() - startedAt) / 1000)

// ---- write outputs ----------------------------------------------------------
const manifest = { baseUrl: BASE_URL, stamp, durationS, authMode, pageCount: pages.length, screenshots: pageRecords.length, flows: flowResults.map((f) => ({ name: f.name, ok: f.ok, error: f.error, steps: f.steps, total: f.total })), warnings }
writeFileSync(resolve(RUN_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(resolve(RUN_DIR, 'findings.json'), JSON.stringify(findings, null, 2))
writeFileSync(resolve(RUN_DIR, 'page-records.json'), JSON.stringify(pageRecords, null, 2))

// hand off to the report writer
const { writeReport } = await import('./report.mjs')
const reportPaths = writeReport({ manifest, findings, pageRecords, flowResults, RUN_DIR, REPO_ROOT })
console.log(`[report] ${reportPaths.perRun}${reportPaths.canonical ? ` (+ canonical ${reportPaths.canonical})` : ' (canonical NOT written; set LV_WRITE_CANONICAL=1 to write it)'}`)

console.log(`\n[done] ${durationS}s | findings: ${findings.length} | screenshots: ${pageRecords.length} | run dir: ${RUN_DIR}`)
const high = findings.filter((f) => f.severity === 'high').length
console.log(high ? `[verdict] ${high} HIGH-severity finding(s) - see report` : '[verdict] no high-severity findings')
