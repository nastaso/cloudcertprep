#!/usr/bin/env node
/**
 * IndexNow ping (instant indexing for Bing + Yandex + Seznam; Google ignores
 * IndexNow). Submits the production indexable surface to the IndexNow API on a
 * `main` deploy so new or changed URLs are crawled within hours instead of
 * waiting for an organic recrawl. Google does NOT consume IndexNow, so this
 * complements (it does not replace) the Search Console sitemap submission.
 *
 * Zero dependencies: a bare `fetch`, mirroring scripts/monitor-sitemap.mjs.
 * Wired into .github/workflows/indexnow.yml (push to `main` + manual dispatch),
 * NOT into prebuild/postbuild: those run on every preview and local build and
 * would ping stale URLs against the wrong origin.
 *
 * The IndexNow key is PUBLIC by design, served at the site root as <key>.txt
 * (like robots.txt). The script discovers it from public/ via the IndexNow
 * file invariant: filename stem === file contents === the key.
 *
 * Usage: node scripts/ping-indexnow.mjs [origin]
 *   e.g. node scripts/ping-indexnow.mjs https://www.cloudcertprep.io
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '../public')
const ORIGIN = (process.argv[2] ?? 'https://www.cloudcertprep.io').replace(/\/$/, '')
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const UA = 'Mozilla/5.0 (compatible; CloudCertPrep-IndexNow/1.0)'

// Locate the IndexNow key file in public/. The IndexNow spec ties the three
// together: the file is named <key>.txt, lives at the site root, and contains
// exactly the key. So the key file is the one whose basename (minus .txt)
// equals its own trimmed contents. robots.txt / llms.txt never satisfy this.
function findKey() {
  for (const file of readdirSync(PUBLIC_DIR)) {
    if (!file.endsWith('.txt')) continue
    const stem = file.slice(0, -4)
    const content = readFileSync(resolve(PUBLIC_DIR, file), 'utf8').trim()
    if (stem === content && /^[a-zA-Z0-9-]{8,128}$/.test(content)) return content
  }
  return null
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  return { status: res.status, body: await res.text() }
}

async function main() {
  const key = findKey()
  if (!key) {
    console.error('✗ no IndexNow key file in public/ (expected <key>.txt whose contents equal its filename)')
    process.exit(1)
  }

  // Submit exactly the live indexable surface: parse the production sitemap so
  // the URL list tracks the sitemap automatically as it grows (the same source
  // scripts/monitor-sitemap.mjs reads). noindex / coming-soon pages are excluded
  // from the sitemap by generate-seo-assets.mjs, so they are never pinged.
  const { status, body } = await fetchText(`${ORIGIN}/sitemap.xml`)
  if (status !== 200) {
    console.error(`✗ sitemap.xml returned HTTP ${status} - nothing to submit`)
    process.exit(1)
  }
  const urlList = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
  if (urlList.length === 0) {
    console.error('✗ sitemap.xml contained no <loc> entries')
    process.exit(1)
  }

  const host = new URL(ORIGIN).host
  const payload = {
    host,
    key,
    keyLocation: `${ORIGIN}/${key}.txt`,
    urlList,
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': UA,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  })

  // IndexNow returns 200 (OK) or 202 (Accepted, key validation pending). Both
  // mean the submission was received; anything else is a real failure.
  if (res.status !== 200 && res.status !== 202) {
    const detail = await res.text().catch(() => '')
    console.error(`✗ IndexNow ${ENDPOINT} returned HTTP ${res.status}${detail ? ` - ${detail.slice(0, 200)}` : ''}`)
    process.exit(1)
  }

  console.log(`✓ IndexNow: submitted ${urlList.length} URL(s) for ${host} (HTTP ${res.status})`)
}

main().catch(e => {
  console.error('✗ ping-indexnow.mjs failed:', e.message)
  process.exit(1)
})
