// Auto error capture: console / pageerror / failed network (>=400 or
// requestfailed) / CSP violations / broken images / horizontal overflow.
//
// attachListeners() wires the page-event listeners and returns a sink object.
// installCspCollector() (an addInitScript) records securitypolicyviolation
// events into window.__cspViolations because Playwright has no page-level CSP
// event. auditPage() runs after load to read CSP violations + broken images +
// overflow from the page.

// Console/network noise that is third-party and not a site defect. We still
// record everything, but classify these as low severity in the report.
const THIRD_PARTY_HOSTS = [
  'challenges.cloudflare.com', // Turnstile
  'static.cloudflareinsights.com',
  'cloud.umami.is',
  'umami.is',
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'stats.g.doubleclick.net',
  'ko-fi.com',
]

export function isThirdParty(url) {
  return THIRD_PARTY_HOSTS.some((h) => url.includes(h))
}

// Init script: collect CSP violations the page raises into a global array.
export function installCspCollector() {
  return () => {
    const w = /** @type {any} */ (window)
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
  }
}

// Attach per-page listeners. Returns a sink the caller drains after the step.
export function attachListeners(page) {
  const sink = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    requestFailures: [],
  }

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    sink.consoleErrors.push({ text: msg.text(), location: msg.location() })
  })
  page.on('pageerror', (err) => {
    sink.pageErrors.push({ message: err.message, stack: (err.stack || '').split('\n').slice(0, 3).join(' ') })
  })
  page.on('response', (res) => {
    const status = res.status()
    if (status >= 400) {
      sink.failedRequests.push({ url: res.url(), status, method: res.request().method() })
    }
  })
  page.on('requestfailed', (req) => {
    // Aborted navigations / cancelled prefetches are not defects.
    const failure = req.failure()?.errorText || ''
    if (failure.includes('ERR_ABORTED')) return
    sink.requestFailures.push({ url: req.url(), failure, method: req.method() })
  })

  return sink
}

// After load, read CSP violations + broken images + horizontal overflow.
export async function auditPage(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window)
    const brokenImages = []
    for (const img of Array.from(document.images)) {
      // naturalWidth 0 after load => failed to decode. Skip lazy images not yet
      // in viewport that have not started loading.
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) {
        brokenImages.push({ src: img.currentSrc, alt: img.alt || '' })
      }
    }
    const scroller = document.scrollingElement || document.documentElement
    const overflowPx = scroller.scrollWidth - window.innerWidth
    // Identify the widest offending elements for triage when overflow occurs.
    let offenders = []
    if (overflowPx > 1) {
      const vw = window.innerWidth
      offenders = Array.from(document.body.querySelectorAll('*'))
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.right > vw + 1 && r.width > 0 && r.height > 0
        })
        .slice(0, 8)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString().slice(0, 60)) || '',
            right: Math.round(r.right),
            width: Math.round(r.width),
          }
        })
    }
    return {
      cspViolations: w.__cspViolations || [],
      brokenImages,
      overflowPx: Math.round(overflowPx),
      overflowOffenders: offenders,
      title: document.title,
      // The top row element should never be HTML/BODY (a sign of a layout break).
      topRowTag: (document.elementFromPoint(window.innerWidth / 2, 2) || {}).tagName || null,
    }
  })
}

// Roll a per-step audit + sink into a normalized list of findings.
export function collectFindings(ctx, sink, audit) {
  const findings = []
  const tag = (type, severity, detail) => findings.push({ ...ctx, type, severity, detail })

  for (const e of sink.consoleErrors) tag('console_error', 'medium', e)
  for (const e of sink.pageErrors) tag('page_error', 'high', e)
  for (const r of sink.failedRequests) {
    tag('failed_request', isThirdParty(r.url) ? 'low' : 'high', r)
  }
  for (const r of sink.requestFailures) {
    tag('request_failed', isThirdParty(r.url) ? 'low' : 'high', r)
  }
  for (const v of audit.cspViolations) tag('csp_violation', 'high', v)
  for (const b of audit.brokenImages) tag('broken_image', 'high', b)
  if (audit.overflowPx > 1) {
    tag('h_overflow', 'medium', { overflowPx: audit.overflowPx, offenders: audit.overflowOffenders })
  }
  return findings
}
