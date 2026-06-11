#!/usr/bin/env node
/**
 * Hash-based CSP generator (Phase 12, security V2/V13).
 *
 * Removes `'unsafe-inline'` from the CSP `script-src` and replaces it with the
 * exhaustive set of `'sha256-<base64>'` hashes of every inline executable
 * <script> emitted into the built `dist/**\/*.html`. Because `output: 'static'`
 * makes every inline script enumerable at build time, this is complete by
 * construction: the script reads the SAME bytes Netlify will serve, so every
 * inline script the browser sees has a matching hash.
 *
 * What gets hashed:
 *   - inline classic scripts: `<script>...</script>` (no `src`)
 *   - inline module scripts:  `<script type="module">...</script>` (no `src`)
 * What does NOT (and must not) get hashed:
 *   - external scripts `<script src="...">` — allowed by host-source / 'self'
 *   - `<script type="application/ld+json">` — non-executable data; CSP
 *     `script-src` does not gate non-JS script types, so hashing them would be
 *     dead weight and would churn on every content edit.
 *
 * The CSP lives in `public/_headers` (source) which Astro copies verbatim to
 * `dist/_headers`. This script rewrites ONLY the `dist/_headers` copy at
 * postbuild time, so the committed source keeps the human-readable
 * `'unsafe-inline'` placeholder and the deploy artifact gets the locked-down
 * hashed policy. Run AFTER `astro build`.
 *
 * Exits non-zero if `dist/_headers` is missing, if the `script-src` directive
 * cannot be found, or if no inline scripts were found (which would mean the
 * extractor regex silently stopped matching — fail loud rather than ship a
 * policy that blocks every inline script).
 *
 * Wired as `npm run csp:hash` and into the postbuild chain.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
const HEADERS_PATH = join(DIST, '_headers')

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

/** Recursively collect every .html file under `dir`. */
function htmlFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...htmlFiles(p))
    else if (entry.endsWith('.html')) out.push(p)
  }
  return out
}

function isExecutableInline(attrs) {
  if (/\bsrc\s*=/.test(attrs)) return false
  // type absent, or type=module, or an explicit JS type => executable.
  // type=application/ld+json (or any non-JS type) => data, not gated by CSP.
  const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)
  if (!typeMatch) return true
  const type = typeMatch[1].trim().toLowerCase()
  return type === 'module' || type === 'text/javascript' || type === 'application/javascript'
}

function main() {
  if (!existsSync(DIST)) {
    console.error('✗ generate-csp-hashes: dist/ not found. Run `astro build` first.')
    process.exit(1)
  }
  if (!existsSync(HEADERS_PATH)) {
    console.error('✗ generate-csp-hashes: dist/_headers not found (expected Astro to copy public/_headers).')
    process.exit(1)
  }

  const hashes = new Set()
  let inlineCount = 0
  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, 'utf8')
    let m
    while ((m = SCRIPT_RE.exec(html)) !== null) {
      const attrs = m[1] || ''
      if (!isExecutableInline(attrs)) continue
      const body = m[2]
      inlineCount++
      const digest = createHash('sha256').update(body, 'utf8').digest('base64')
      hashes.add(`'sha256-${digest}'`)
    }
  }

  if (inlineCount === 0) {
    console.error('✗ generate-csp-hashes: found ZERO inline executable scripts. The extractor likely broke; refusing to ship a policy that would block all inline scripts.')
    process.exit(1)
  }

  const sortedHashes = [...hashes].sort()
  const hashList = sortedHashes.join(' ')

  let headers = readFileSync(HEADERS_PATH, 'utf8')

  // Find the script-src directive inside the CSP line and replace its
  // 'unsafe-inline' token with the hash set. Keep host-source allowlists
  // (googletagmanager / umami / cloudflare) intact — they cover dynamically
  // injected external scripts (GA loader, Umami, Turnstile).
  const scriptSrcRe = /(script-src )([^;]*)(;)/
  if (!scriptSrcRe.test(headers)) {
    console.error('✗ generate-csp-hashes: could not locate the `script-src` directive in dist/_headers.')
    process.exit(1)
  }

  headers = headers.replace(scriptSrcRe, (_full, prefix, body, semi) => {
    const cleaned = body.replace(/'unsafe-inline'\s*/g, '').trim().replace(/\s+/g, ' ')
    return `${prefix}${cleaned} ${hashList}${semi}`
  })

  writeFileSync(HEADERS_PATH, headers)
  console.log(`✓ CSP hashes: ${sortedHashes.length} unique inline-script hash(es) from ${inlineCount} inline script(s); 'unsafe-inline' removed from script-src in dist/_headers`)
}

main()
