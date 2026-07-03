#!/usr/bin/env node
/**
 * SEO <head> snapshot guard (plan 27, step 4 - "Full <head> snapshot guard for
 * SEO").
 *
 * WHY: the existing locked-SEO guards pin only SPECIFIC things - citation
 * phrases (check-citation), the internal-link graph (check-graph), and the
 * platform WebSite/Organization/Person JSON-LD byte-for-byte (check-person-
 * graph). A refactor that silently moves a <title>, meta description, canonical,
 * robots directive, an Open Graph / Twitter card, or a PER-PAGE JSON-LD block
 * (BlogPosting, FAQPage, BreadcrumbList, Course, ...) on most pages trips NONE of
 * them; Lighthouse only checks a score threshold, not content. This guard closes
 * that gap: it snapshots the full SEO-critical <head> surface of every indexable
 * page from the built dist/ and diffs it against a committed baseline, so any
 * future PR that moves locked SEO output fails a VISIBLE test with a precise
 * diff, not a silent regression.
 *
 * DETERMINISTIC BY CONSTRUCTION: reads the static build output only - no browser,
 * no rendering, no network, no new dependency. Build- and environment-varying
 * tokens are normalized before snapshotting so builds match across machines and
 * CI (a local build with live Supabase creds vs a CI build on a placeholder URL
 * with the committed stats snapshot). Normalized (see `normalize` below):
 *   - hashed /_astro/ asset URLs (defensive; not in the head surface today),
 *   - ISO dates/datetimes (Course.dateModified is `new Date()` at build time),
 *   - Course.totalHistoricalEnrollment (live community stats: value changes
 *     every refresh and the field is omitted at 0, so presence varies too).
 *
 * SCOPE - which pages: exactly the INDEXABLE pages, detected self-containedly as
 * "not a redirect stub AND robots is not noindex". That is the same 18 pages the
 * internal-graph audit counts. noindex app routes (login, account, history,
 * /stats, practice-exam, ...) and the meta-refresh redirect stub are excluded on
 * purpose - they carry no indexing equity and some (e.g. /stats) embed live,
 * build-varying snapshot numbers.
 *
 * PREVIEW BUILDS: Cloudflare PR-preview deployments set PUBLIC_NOINDEX=true, which
 * forces every page to robots=noindex and suppresses canonicals (BaseLayout), so
 * the production SEO surface is neutralized. This guard SKIPS such builds
 * (detected by the env var or the `x-intended-robots` sentinel the preview emits);
 * the production-like CI build - which does not set PUBLIC_NOINDEX - is the gate.
 *
 * SCOPE - which fields: <title>, meta description, meta robots, meta keywords,
 * link rel=canonical, every og:* and twitter:* meta, and every PER-PAGE JSON-LD
 * block. The platform WebSite/Organization/Person JSON-LD nodes are DELIBERATELY
 * excluded here - check-person-graph already byte-locks them on every page, and
 * re-capturing them would just duplicate that contract (and its re-bless burden)
 * and bloat this baseline.
 *
 * INTENTIONAL-UPDATE PATH: when you deliberately change an indexable page's SEO
 * head (retitle a page, edit a meta description, add an FAQ, ...) this guard will
 * fail with a diff. Re-bless the baseline in the SAME commit as the change:
 *
 *     npm run build                 # produce the new dist/
 *     node scripts/check-seo-head.mjs --update    # rewrite the baseline
 *     git add scripts/seo-head-baseline.json      # commit alongside the change
 *
 * (Equivalently: UPDATE_SEO_HEAD_BASELINE=1 node scripts/check-seo-head.mjs.)
 * The baseline diff in code review is the point: the reviewer sees exactly which
 * SEO output moved. If you touch the platform graph (rare - e.g. a Person.sameAs
 * addition), you must also re-bless check-person-graph's SNAPSHOT.
 *
 * Runs in the postbuild chain, after astro build. Exits non-zero on any drift,
 * any new/removed indexable page, or a missing baseline.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
const BASELINE = resolve(__dirname, 'seo-head-baseline.json')
const UPDATE =
  process.argv.includes('--update') || process.env.UPDATE_SEO_HEAD_BASELINE === '1'

// Platform JSON-LD nodes locked by check-person-graph; excluded from this guard.
const PLATFORM_IDS = new Set([
  'https://www.cloudcertprep.io/#organization',
  'https://www.cloudcertprep.io/#author',
])

function fail(msg) {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

function walkHtml(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkHtml(full))
    else if (entry.endsWith('.html')) out.push(full)
  }
  return out
}

// Normalize build-varying tokens so the snapshot is stable across builds AND
// across environments (a local build with live Supabase creds vs a CI build
// with a placeholder URL and the committed stats snapshot).
function normalize(s) {
  return (
    s
      // Hashed Astro asset URLs (defensive; not in the head SEO surface today).
      .replace(/(\/_astro\/[^"'\s)]*?\.)[A-Za-z0-9_-]{8}(\.[a-z0-9]+)/g, '$1<HASH>$2')
      // Dates in JSON-LD. Course.dateModified is `new Date()` at BUILD time
      // ([cert].astro), so it drifts every day; blog datePublished/dateModified
      // come from frontmatter (stable) but are normalized too for uniformity.
      // Datetime first so the date half of an ISO datetime is not partly matched.
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<DATETIME>')
      .replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>')
      // Course.totalHistoricalEnrollment is LIVE community data from the stats
      // snapshot: its value changes every stats refresh AND the field is omitted
      // entirely when a cert has 0 completed attempts, so both value and presence
      // vary by build environment. Strip it (with its leading comma) so the guard
      // locks the SEO structure, not the live number. It only ever appears
      // mid-object (after dateModified), so a leading comma is always present.
      .replace(/,"totalHistoricalEnrollment":\d+/g, '')
  )
}

function headOf(html) {
  const m = html.match(/<head[\s\S]*?<\/head>/i)
  return m ? m[0] : html
}

function isRedirectStub(html) {
  return /<meta\s+http-equiv=["']refresh["']/i.test(html)
}

function getAttr(tag, attr) {
  const m = tag.match(new RegExp(`${attr}=["']([\\s\\S]*?)["']`, 'i'))
  return m ? m[1] : null
}

function extractTitle(head) {
  const m = head.match(/<title>([\s\S]*?)<\/title>/i)
  return m ? m[1].trim() : null
}

function extractCanonical(head) {
  const m = head.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i)
  return m ? getAttr(m[0], 'href') : null
}

// Collect the SEO meta tags into a key -> value(s) map. Key is the tag's `name`
// or `property`; we keep description, robots, keywords, and all og:*/twitter:*.
function extractMeta(head) {
  const meta = {}
  const re = /<meta\s+[^>]*>/gi
  let m
  while ((m = re.exec(head)) !== null) {
    const tag = m[0]
    const key = getAttr(tag, 'name') || getAttr(tag, 'property')
    if (!key) continue
    const lower = key.toLowerCase()
    const keep =
      lower === 'description' ||
      lower === 'robots' ||
      lower === 'keywords' ||
      lower.startsWith('og:') ||
      lower.startsWith('twitter:')
    if (!keep) continue
    const content = getAttr(tag, 'content')
    if (content == null) continue
    // Preserve every occurrence (e.g. multiple og:image) as an array; collapse
    // to a scalar for the common single-value case so the baseline stays terse.
    if (key in meta) {
      meta[key] = [].concat(meta[key], content)
    } else {
      meta[key] = content
    }
  }
  // Sort keys for a stable, diff-friendly serialization.
  return Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)))
}

// Per-page JSON-LD block bodies, platform nodes removed, order preserved.
function extractJsonLd(head) {
  const bodies = []
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(head)) !== null) {
    const body = m[1].trim()
    let node
    try {
      node = JSON.parse(body)
    } catch {
      bodies.push(body) // malformed: keep raw so drift is still caught
      continue
    }
    const type = node && node['@type']
    const id = node && node['@id']
    const isPlatform = type === 'WebSite' || (typeof id === 'string' && PLATFORM_IDS.has(id))
    if (isPlatform) continue
    bodies.push(body)
  }
  return bodies
}

function snapshotPage(html) {
  const head = normalize(headOf(html))
  return {
    title: extractTitle(head),
    canonical: extractCanonical(head),
    meta: extractMeta(head),
    jsonld: extractJsonLd(head),
  }
}

// --- Build the current snapshot over indexable pages ---
let files
try {
  files = walkHtml(DIST)
} catch {
  fail(`Cannot read ${DIST}. Run \`npm run build\` first.`)
}
if (files.length === 0) fail(`No HTML files found under ${DIST}.`)

// Skip on a noindex-preview build. Cloudflare PR-preview deployments set
// PUBLIC_NOINDEX=true, which forces EVERY page to robots=noindex, suppresses
// canonicals, and emits an `x-intended-robots` meta with the real value instead
// (BaseLayout). The production SEO surface this guard locks is intentionally
// neutralized there, so there is nothing to compare - every page would look like
// a robots/canonical drift. The authoritative gate stays the production-like CI
// build (which does not set PUBLIC_NOINDEX). Detect via the env var OR, as a
// self-contained backup, the `x-intended-robots` sentinel the preview emits.
const htmlByFile = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))
const isNoindexPreview =
  process.env.PUBLIC_NOINDEX === 'true' ||
  [...htmlByFile.values()].some((h) => /name=["']x-intended-robots["']/i.test(h))
if (isNoindexPreview) {
  console.log(
    '\nℹ️  SEO <head> snapshot SKIPPED: noindex-preview build detected ' +
      '(PUBLIC_NOINDEX / x-intended-robots). The production-like CI build is the gate.',
  )
  process.exit(0)
}

const current = {}
for (const file of files) {
  const html = htmlByFile.get(file)
  if (isRedirectStub(html)) continue
  const head = headOf(html)
  const robots = (head.match(/<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i) || [])[1] || ''
  if (/noindex/i.test(robots)) continue
  const route = relative(DIST, file).split(sep).join('/')
  current[route] = snapshotPage(html)
}

const currentKeys = Object.keys(current).sort()
const currentSorted = Object.fromEntries(currentKeys.map((k) => [k, current[k]]))

// --- Update mode: rewrite the baseline and exit ---
if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(currentSorted, null, 2) + '\n')
  console.log(
    `\n✅ SEO <head> baseline updated: ${currentKeys.length} indexable page(s) written to\n   ${relative(resolve(__dirname, '..'), BASELINE)}`,
  )
  process.exit(0)
}

// --- Compare against the committed baseline ---
if (!existsSync(BASELINE)) {
  fail(
    `No baseline at ${BASELINE}.\n   Generate it once with:  node scripts/check-seo-head.mjs --update`,
  )
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const baselineKeys = Object.keys(baseline).sort()

const problems = []

// Page set changes.
for (const route of currentKeys) {
  if (!(route in baseline)) problems.push(`NEW indexable page not in baseline: ${route}`)
}
for (const route of baselineKeys) {
  if (!(route in current)) problems.push(`indexable page MISSING from build: ${route}`)
}

// Field-level drift for pages present in both.
function diffField(route, field, expected, actual) {
  const e = JSON.stringify(expected)
  const a = JSON.stringify(actual)
  if (e !== a) {
    problems.push(`${route} > ${field} DRIFTED\n      expected: ${e}\n      actual:   ${a}`)
  }
}
for (const route of currentKeys) {
  if (!(route in baseline)) continue
  const cur = current[route]
  const base = baseline[route]
  diffField(route, 'title', base.title, cur.title)
  diffField(route, 'canonical', base.canonical, cur.canonical)
  // Per-meta-key diff so the failure names the exact tag that moved.
  const metaKeys = new Set([...Object.keys(base.meta || {}), ...Object.keys(cur.meta || {})])
  for (const k of [...metaKeys].sort()) {
    diffField(route, `meta[${k}]`, (base.meta || {})[k] ?? null, (cur.meta || {})[k] ?? null)
  }
  diffField(route, 'jsonld', base.jsonld, cur.jsonld)
}

if (problems.length > 0) {
  fail(
    `SEO <head> snapshot DRIFTED: ${problems.length} change(s) vs baseline:\n   - ${problems.join('\n   - ')}\n\n` +
      `If this SEO change is INTENTIONAL, re-bless the baseline in the same commit:\n` +
      `   npm run build && node scripts/check-seo-head.mjs --update && git add scripts/seo-head-baseline.json`,
  )
}

console.log(
  `\n✅ SEO <head> snapshot PASSED: title / description / canonical / robots / og / twitter / ` +
    `per-page JSON-LD byte-identical to baseline across all ${currentKeys.length} indexable page(s).`,
)
