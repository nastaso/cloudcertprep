#!/usr/bin/env node
/**
 * Indexing diagnostic (R2.1, R2.3)
 *
 * Issues a Googlebot-UA GET for each URL in the baseline and records whether
 * the prerendered HTML carries title, meta description, canonical, OG image,
 * robots meta, and JSON-LD — before any JavaScript runs.
 *
 * Emits dist/indexing-diagnostic.json and dist/indexing-diagnostic.md.
 *
 * Usage:
 *   node scripts/diagnose-indexing.mjs [--base <url>] [--strict]
 *
 * --base defaults to https://www.cloudcertprep.io; point it at a local preview
 *   (e.g. --base http://localhost:4321) for the pre-push one-shot run.
 * --strict exits non-zero if any URL is missing title/meta/canonical/JSON-LD.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const baseIdx = args.indexOf('--base')
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'https://www.cloudcertprep.io'
const STRICT = args.includes('--strict')

const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const PATHS = [
  '/',
  '/aws/clf-c02',
  '/aws/aif-c01',
  '/aws/clf-c02/security-and-compliance',
  '/about',
  '/privacy',
  '/terms',
]

function analyze(url, status, html) {
  const has_title = /<title>[^<]+<\/title>/i.test(html)
  const has_meta_description = /<meta\s+name=["']description["']\s+content=["'][^"']+["']/i.test(html)
  const has_canonical = /<link\s+rel=["']canonical["']\s+href=["'][^"']+["']/i.test(html)
  const has_og_image = /<meta\s+property=["']og:image["']\s+content=["'][^"']+["']/i.test(html)
  const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
  const has_robots_meta = !!robotsMatch
  const robots_meta_value = robotsMatch ? robotsMatch[1] : null
  const ldBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  const jsonld_types = []
  for (const b of ldBlocks) {
    const t = b[1].match(/"@type"\s*:\s*"([^"]+)"/g)
    if (t) t.forEach(x => jsonld_types.push(x.replace(/.*"([^"]+)"$/, '$1')))
  }
  const missing = []
  if (!has_title) missing.push('title')
  if (!has_meta_description) missing.push('meta description')
  if (!has_canonical) missing.push('canonical')
  if (ldBlocks.length === 0) missing.push('JSON-LD')
  const hypothesis = missing.length
    ? `Missing ${missing.join(', ')}; check the page renders prerendered HTML.`
    : ''
  return {
    url,
    status,
    has_title,
    has_meta_description,
    has_canonical,
    has_og_image,
    has_robots_meta,
    robots_meta_value,
    jsonld_count: ldBlocks.length,
    jsonld_types,
    hypothesis,
  }
}

async function main() {
  const results = []
  for (const path of PATHS) {
    const url = `${BASE}${path}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': GOOGLEBOT_UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })
      const html = await res.text()
      results.push(analyze(url, res.status, html))
    } catch (e) {
      results.push({
        url,
        status: 0,
        has_title: false,
        has_meta_description: false,
        has_canonical: false,
        has_og_image: false,
        has_robots_meta: false,
        robots_meta_value: null,
        jsonld_count: 0,
        jsonld_types: [],
        hypothesis: `Fetch failed: ${e.message}`,
      })
    }
  }

  mkdirSync(resolve(ROOT, 'dist'), { recursive: true })
  writeFileSync(resolve(ROOT, 'dist/indexing-diagnostic.json'), JSON.stringify(results, null, 2))

  const md = [
    `# Indexing diagnostic`,
    ``,
    `Base: ${BASE}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `| URL | Status | Title | Meta | Canonical | OG | Robots | JSON-LD |`,
    `|-----|--------|-------|------|-----------|----|--------|---------|`,
    ...results.map(r =>
      `| ${r.url.replace(BASE, '') || '/'} | ${r.status} | ${r.has_title ? '✓' : '✗'} | ${r.has_meta_description ? '✓' : '✗'} | ${r.has_canonical ? '✓' : '✗'} | ${r.has_og_image ? '✓' : '✗'} | ${r.robots_meta_value ?? '—'} | ${r.jsonld_count} (${r.jsonld_types.join(', ') || '—'}) |`,
    ),
    ``,
    ...results.filter(r => r.hypothesis).map(r => `- **${r.url}**: ${r.hypothesis}`),
  ].join('\n')
  writeFileSync(resolve(ROOT, 'dist/indexing-diagnostic.md'), md)

  console.log(md)

  const failed = results.filter(r => r.hypothesis)
  if (STRICT && failed.length > 0) {
    console.error(`\n❌ ${failed.length} URL(s) failed strict checks.`)
    process.exit(1)
  }
  console.log(`\n✅ Indexing diagnostic complete (${results.length} URLs checked).`)
}

main()
