#!/usr/bin/env node
/**
 * Sitemap crawl monitor (R19.2). Fetches the production sitemap.xml, then
 * fetches every listed URL and asserts each returns HTTP 200 with a <title>,
 * a <link rel="canonical">, and at least one <script type="application/ld+json">
 * block. Exits non-zero on any failure so the scheduled workflow can alert.
 *
 * Usage: node scripts/monitor-sitemap.mjs <origin>
 *   e.g. node scripts/monitor-sitemap.mjs https://www.cloudcertprep.io
 */
const origin = (process.argv[2] ?? 'https://www.cloudcertprep.io').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  return { status: res.status, body: await res.text() }
}

async function main() {
  const { status, body } = await fetchText(`${origin}/sitemap.xml`)
  if (status !== 200) {
    console.error(`✗ sitemap.xml returned HTTP ${status}`)
    process.exit(1)
  }

  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
  if (locs.length === 0) {
    console.error('✗ sitemap.xml contained no <loc> entries')
    process.exit(1)
  }

  const failures = []
  for (const url of locs) {
    try {
      const { status, body } = await fetchText(url)
      const hasTitle = /<title>[^<]+<\/title>/i.test(body)
      const hasCanonical = /<link\s+rel=["']canonical["']/i.test(body)
      const hasJsonLd = /<script[^>]+application\/ld\+json/i.test(body)
      const problems = []
      if (status !== 200) problems.push(`HTTP ${status}`)
      if (!hasTitle) problems.push('no <title>')
      if (!hasCanonical) problems.push('no canonical')
      if (!hasJsonLd) problems.push('no JSON-LD')
      if (problems.length) failures.push(`${url}: ${problems.join(', ')}`)
    } catch (e) {
      failures.push(`${url}: fetch failed (${e.message})`)
    }
  }

  if (failures.length) {
    console.error(`✗ ${failures.length}/${locs.length} sitemap URL(s) failed:`)
    failures.forEach(f => console.error(`  - ${f}`))
    process.exit(1)
  }

  console.log(`✓ sitemap monitor: all ${locs.length} URLs return 200 with title, canonical, and JSON-LD`)
}

main().catch(e => {
  console.error('✗ monitor-sitemap.mjs failed:', e.message)
  process.exit(1)
})
