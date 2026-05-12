// Regenerates public/sitemap.xml with today's date as `lastmod` for every
// indexable route. Wired as a `prebuild` script in package.json so every
// production build ships a fresh sitemap.
//
// Why: Googlebot uses lastmod to prioritise crawl scheduling. Stale dates
// signal a dead site and crawl frequency drops. Auto-updating on build
// keeps the freshness signal accurate without manual maintenance.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, '../public/sitemap.xml')

const SITE_URL = 'https://www.cloudcertprep.io'

// Routes mirror src/lib/seo-data.ts ROUTE_SEO. /history is omitted because
// the guest view is noindex and the logged-in view is per-user content.
// /login and /reset-password are noindex and not listed.
const ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/practice-exam', changefreq: 'weekly', priority: '0.9' },
  { path: '/domain-practice', changefreq: 'weekly', priority: '0.9' },
  { path: '/stats', changefreq: 'daily', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
]

const today = new Date().toISOString().slice(0, 10)

const urls = ROUTES.map(
  ({ path, changefreq, priority }) =>
    `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

writeFileSync(OUTPUT_PATH, xml)
console.log(`✓ sitemap.xml regenerated with lastmod=${today} (${ROUTES.length} routes)`)
