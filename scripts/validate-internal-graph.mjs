// Internal-link graph validator (topical hub-and-spoke audit).
//
// Builds the real internal-link graph from the BUILT `dist/` HTML (so it sees
// exactly what each page ships, including prerendered island markup) and
// enforces the high-signal SEO structure rules. Runs as a postbuild step.
//
// HARD FAILS (exit 1) — high signal, low false-positive:
//   1. ORPHAN: an indexable page with zero inbound internal links (excluding
//      the home page, which is the graph root).
//   2. DEAD-END: an indexable page with zero outbound internal links to other
//      indexable pages.
//   3. DEPTH: an indexable page whose shortest click-depth from `/` exceeds
//      MAX_CLICK_DEPTH.
//   4. CANONICAL: a page whose <link rel=canonical> points at a URL whose path
//      is not this page's own path (self-referencing canonical expected for
//      indexable pages).
//   5. HUB: a cert hub (/aws/<cert>) that links to fewer than MIN_HUB_SPOKES
//      of its own supporting pages (domain landings / practice flows).
//
// WARNINGS (do not fail the build) — fuzzier signals:
//   - GENERIC-ANCHOR: >50% of a page's internal anchors use generic text
//     ("here", "click here", "read more", "learn more", "this page", ...).
//   - NO-RELATED: a cert/domain page with no detectable "related / more"
//     cross-links beyond breadcrumb + primary CTA (heuristic).
//
// Only INDEXABLE pages (robots not containing "noindex") are subject to the
// hard rules; noindex app shells (login, history, practice-exam, etc.) are
// recorded as link sources/targets but never required to be in the cluster.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
const SITE_HOST = 'www.cloudcertprep.io'

const MAX_CLICK_DEPTH = 3
const MIN_HUB_SPOKES = 3
const GENERIC_ANCHOR_RATIO = 0.5

const GENERIC_ANCHORS = new Set([
  'here', 'click here', 'read more', 'learn more', 'this page', 'link',
  'this', 'more', 'click', 'go', 'see more', 'read', 'details',
])

const args = new Set(process.argv.slice(2))
const REPORT_ONLY = args.has('--report-only')

// --- Collect built HTML files and map them to routes ---
function walkHtml(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkHtml(full))
    else if (entry.endsWith('.html')) out.push(full)
  }
  return out
}

/** dist/foo/index.html -> /foo ; dist/index.html -> / ; dist/404.html -> /404 */
function fileToRoute(file) {
  let rel = relative(DIST, file).split(sep).join('/')
  rel = rel.replace(/index\.html$/, '').replace(/\.html$/, '')
  let route = '/' + rel
  if (route.length > 1) route = route.replace(/\/+$/, '')
  return route || '/'
}

function normalize(path) {
  let p = path.split('#')[0].split('?')[0]
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p
}

// --- Parse a page: robots, canonical, internal anchors (href + text) ---
function parsePage(html) {
  // On noindex previews (PUBLIC_NOINDEX=true), every page's robots meta is
  // force-set to noindex by the deployment gate. BaseLayout preserves the
  // page's real value in x-intended-robots so this audit can validate the
  // intended production structure instead of collapsing to "0 indexable"
  // (which broke every branch-deploy build on 2026-06-11).
  const intended = html.match(/<meta\s+name=["']x-intended-robots["']\s+content=["']([^"']+)["']/i)?.[1]
  const robots = (intended ?? (html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)?.[1] || '')).toLowerCase()
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] || null

  const anchors = []
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    let href = m[1]
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // Resolve same-origin absolute URLs to paths; keep root-relative as-is.
    if (/^https?:\/\//i.test(href)) {
      try {
        const u = new URL(href)
        if (u.host !== SITE_HOST) continue // external
        href = u.pathname + u.search + u.hash
      } catch { continue }
    } else if (href.startsWith('//') || /^[a-z]+:/i.test(href)) {
      continue // protocol-relative or mailto/tel/etc
    }
    if (!href.startsWith('/')) continue // relative or in-page only
    if (href.startsWith('#')) continue
    anchors.push({ to: normalize(href), text })
  }
  return { robots, canonical, anchors }
}

// --- Build the page table ---
const pages = new Map() // route -> { route, file, indexable, canonicalPath, anchors }
for (const file of walkHtml(DIST)) {
  const route = fileToRoute(file)
  const html = readFileSync(file, 'utf8')
  const { robots, canonical, anchors } = parsePage(html)
  let canonicalPath = null
  if (canonical) {
    try { canonicalPath = normalize(new URL(canonical).pathname) }
    catch { canonicalPath = normalize(canonical) }
  }
  pages.set(route, {
    route,
    indexable: !robots.includes('noindex'),
    canonicalPath,
    anchors,
  })
}

const routeSet = new Set(pages.keys())
const indexableRoutes = [...pages.values()].filter(p => p.indexable).map(p => p.route)

// App-shell routes are noindex by design and are reached via in-app flows or
// auth funnels, not the topical cluster — they are NOT required to be linked
// from the crawl graph. Everything else (including coming-soon cert hubs that
// are noindex but ARE real destinations with a "watch on GitHub" funnel) must
// still be reachable.
const APP_SHELL_SUFFIXES = ['practice-exam', 'domain-practice']
const APP_SHELL_EXACT = new Set(['/login', '/reset-password', '/history', '/404'])
function isAppShell(route) {
  if (APP_SHELL_EXACT.has(route)) return true
  const last = route.split('/').filter(Boolean).pop()
  return APP_SHELL_SUFFIXES.includes(last)
}
function isCertHubRoute(route) {
  const segs = route.split('/').filter(Boolean)
  return segs.length === 2 && /^[a-z]+$/.test(segs[0]) && /^[a-z]+-[a-z0-9]+$/.test(segs[1])
}
// Pages subject to reachability/orphan checks: all indexable pages PLUS any
// noindex page that is a real destination (e.g. coming-soon cert hubs), minus
// genuine app shells and the /aws provider hub (which 301-redirects to / and
// is intentionally not a standalone destination).
const reachabilityRoutes = [...pages.values()]
  .filter(p => {
    if (p.route === '/aws') return false // 301 → / by design
    if (p.indexable) return true
    return isCertHubRoute(p.route) && !isAppShell(p.route)
  })
  .map(p => p.route)

// --- Inbound/outbound maps (only edges between known pages) ---
const inbound = new Map([...routeSet].map(r => [r, new Set()]))
const outbound = new Map([...routeSet].map(r => [r, new Set()]))
for (const page of pages.values()) {
  for (const { to } of page.anchors) {
    if (!routeSet.has(to) || to === page.route) continue
    outbound.get(page.route).add(to)
    inbound.get(to).add(page.route)
  }
}

// --- Click depth via BFS from '/' ---
const depth = new Map([['/', 0]])
const queue = ['/']
while (queue.length) {
  const cur = queue.shift()
  const d = depth.get(cur)
  for (const next of outbound.get(cur) || []) {
    if (!depth.has(next)) { depth.set(next, d + 1); queue.push(next) }
  }
}

// --- Cert hub spoke helper (/<provider>/<certCode> hubs detected via
// isCertHubRoute defined above). ---
function isSpokeOf(hub, route) {
  return route !== hub && route.startsWith(hub + '/')
}

// --- Evaluate rules ---
const fails = []
const warnings = []

// Reachability + orphan + dead-end + depth: applies to all real destinations
// (indexable pages + coming-soon cert hubs), not just indexable.
for (const route of reachabilityRoutes) {
  // 1. ORPHAN (home is the root, exempt)
  if (route !== '/' && inbound.get(route).size === 0) {
    fails.push(`ORPHAN: ${route} has zero inbound internal links`)
  }

  // 2. DEAD-END (must link out to at least one other reachable page)
  const outToReachable = [...outbound.get(route)].filter(r =>
    pages.get(r)?.indexable || isCertHubRoute(r))
  if (outToReachable.length === 0) {
    fails.push(`DEAD-END: ${route} has no outbound links to other content pages`)
  }

  // 3. DEPTH / reachability from home
  const d = depth.get(route)
  if (d === undefined) {
    fails.push(`UNREACHABLE: ${route} is not reachable from / via internal links`)
  } else if (d > MAX_CLICK_DEPTH) {
    fails.push(`DEPTH: ${route} is ${d} clicks from / (max ${MAX_CLICK_DEPTH})`)
  }
}

// Canonical + hub-spoke + generic-anchor: SEO-signal checks, indexable only.
for (const route of indexableRoutes) {
  const page = pages.get(route)

  // 4. CANONICAL (self-referential path expected)
  if (page.canonicalPath && page.canonicalPath !== route) {
    fails.push(`CANONICAL: ${route} canonical points to ${page.canonicalPath}`)
  }

  // 5. HUB spokes
  if (isCertHubRoute(route)) {
    const spokes = [...outbound.get(route)].filter(r => isSpokeOf(route, r))
    if (spokes.length < MIN_HUB_SPOKES) {
      fails.push(`HUB: ${route} links to only ${spokes.length} supporting page(s) (min ${MIN_HUB_SPOKES})`)
    }
  }

  // WARN: generic anchor ratio (internal anchors only)
  const internalAnchors = page.anchors.filter(a => routeSet.has(a.to) && a.to !== route)
  if (internalAnchors.length >= 4) {
    const generic = internalAnchors.filter(a => GENERIC_ANCHORS.has(a.text.toLowerCase())).length
    const ratio = generic / internalAnchors.length
    if (ratio > GENERIC_ANCHOR_RATIO) {
      warnings.push(`GENERIC-ANCHOR: ${route} has ${Math.round(ratio * 100)}% generic anchor text (${generic}/${internalAnchors.length})`)
    }
  }
}

// --- Report ---
const indexableCount = indexableRoutes.length
const totalPages = pages.size
console.log(`\nInternal-link graph audit: ${totalPages} pages (${indexableCount} indexable)\n`)

// Cluster summary
const hubs = indexableRoutes.filter(isCertHubRoute)
for (const hub of hubs) {
  const spokes = [...outbound.get(hub)].filter(r => isSpokeOf(hub, r))
  console.log(`  hub ${hub}: ${spokes.length} spokes, ${inbound.get(hub).size} inbound, depth ${depth.get(hub) ?? '∞'}`)
}

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`)
  for (const w of warnings) console.log(`  - ${w}`)
}

if (fails.length) {
  console.error(`\n✗ internal-graph: ${fails.length} structural violation(s):`)
  for (const f of fails) console.error(`  - ${f}`)
  if (!REPORT_ONLY) process.exit(1)
  console.log('\n(report-only mode: not failing the build)')
} else {
  console.log(`\n✓ internal-graph: hub-and-spoke structure valid (0 violations)`)
}
