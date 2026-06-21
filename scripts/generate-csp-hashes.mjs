#!/usr/bin/env node
/**
 * Hash-based CSP generator (Phase 12, security V2/V13).
 *
 * script-src: removes `'unsafe-inline'` and replaces it with the exhaustive
 * set of `'sha256-<base64>'` hashes of every inline executable <script>
 * emitted into the built `dist/**\/*.html`. Because `output: 'static'` makes
 * every inline script enumerable at build time, this is complete by
 * construction: the script reads the SAME bytes the host will serve, so every
 * inline script the browser sees has a matching hash.
 *
 * style-src: removes `'unsafe-inline'` and replaces it with
 * `'unsafe-hashes'` plus the exhaustive hash set of
 *   - every inline <style> ELEMENT body (Astro inlines the CSS bundle), and
 *   - every `style=""` ATTRIBUTE value (entity-decoded, exactly the string the
 *     HTML parser hands CSP) found in the built HTML.
 * `'unsafe-hashes'` is what lets hash-sources match attribute values
 * (Chrome 69+, Firefox 109+, Safari 15.4+). Browsers older than that ignore
 * the token and block the style ATTRIBUTES only — a cosmetic degradation
 * (halo colors / progress-bar widths), never functional. The
 * style-src-elem/-attr split was rejected: Safari shipped style-src-elem only
 * in 26.2, so most Safari users would fall back to style-src anyway.
 * Client-side React writes styles via CSSOM (el.style.*), which CSP does not
 * gate, so only the static HTML needs hashing — enumerable by construction.
 *
 * connect-src: pins the `https://*.supabase.co` and
 * `wss://*.supabase.co` wildcards to the exact project host derived from
 * VITE_SUPABASE_URL (process.env, falling back to .env.local / .env). The app
 * cannot build without that variable (vite inlines it into the islands), so a
 * missing value is a broken build environment: fail loud.
 *
 * What gets hashed in script-src:
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
 * `'unsafe-inline'` placeholders and the deploy artifact gets the locked-down
 * hashed policy. Run AFTER `astro build`.
 *
 * Exits non-zero if `dist/_headers` is missing, if a rewritten directive
 * cannot be found, if no inline scripts / no inline style elements were found
 * (which would mean an extractor regex silently stopped matching — fail loud
 * rather than ship a policy that blocks every inline script/style), or if
 * VITE_SUPABASE_URL cannot be resolved for connect-src pinning.
 *
 * Wired as `npm run csp:hash` and into the postbuild chain.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist')
const HEADERS_PATH = join(DIST, '_headers')

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const STYLE_EL_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
// Attribute must be preceded by whitespace so data-style= etc. never match.
const STYLE_ATTR_RE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

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

function sha256(value) {
  return `'sha256-${createHash('sha256').update(value, 'utf8').digest('base64')}'`
}

/**
 * CSP hashes attribute values as the HTML parser delivers them: AFTER entity
 * decoding. Decode the named/numeric entities that can legally appear inside
 * a quoted attribute value so our hash matches the browser's.
 */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Resolve VITE_SUPABASE_URL from the environment or the local env files. */
function resolveSupabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  for (const file of ['.env.local', '.env']) {
    const p = join(ROOT, file)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, '')
      if (v) return v
    }
  }
  return null
}

/** Replace a directive's body inside the CSP line; exit if it is missing. */
function rewriteDirective(headers, name, rewriteBody) {
  const re = new RegExp(`(${name} )([^;]*)(;)`)
  if (!re.test(headers)) {
    console.error(`✗ generate-csp-hashes: could not locate the \`${name}\` directive in dist/_headers.`)
    process.exit(1)
  }
  return headers.replace(re, (_full, prefix, body, semi) => `${prefix}${rewriteBody(body)}${semi}`)
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

  const scriptHashes = new Set()
  const styleElHashes = new Set()
  const styleAttrHashes = new Set()
  let inlineScriptCount = 0
  let styleElCount = 0
  let styleAttrCount = 0

  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, 'utf8')
    let m
    while ((m = SCRIPT_RE.exec(html)) !== null) {
      if (!isExecutableInline(m[1] || '')) continue
      inlineScriptCount++
      scriptHashes.add(sha256(m[2]))
    }
    while ((m = STYLE_EL_RE.exec(html)) !== null) {
      styleElCount++
      styleElHashes.add(sha256(m[1]))
    }
    while ((m = STYLE_ATTR_RE.exec(html)) !== null) {
      styleAttrCount++
      styleAttrHashes.add(sha256(decodeEntities(m[1] ?? m[2] ?? '')))
    }
  }

  if (inlineScriptCount === 0) {
    console.error('✗ generate-csp-hashes: found ZERO inline executable scripts. The extractor likely broke; refusing to ship a policy that would block all inline scripts.')
    process.exit(1)
  }
  if (styleElCount === 0) {
    console.error('✗ generate-csp-hashes: found ZERO inline <style> elements. With inlined stylesheets that means the extractor broke; refusing to ship a policy that would block all page CSS.')
    process.exit(1)
  }

  const supabaseUrl = resolveSupabaseUrl()
  if (!supabaseUrl) {
    console.error('✗ generate-csp-hashes: VITE_SUPABASE_URL not found in env, .env.local or .env — cannot pin connect-src. The app cannot build without it, so this environment is broken.')
    process.exit(1)
  }
  const supabaseHost = new URL(supabaseUrl).host

  let headers = readFileSync(HEADERS_PATH, 'utf8')

  // script-src: 'unsafe-inline' -> inline-script hashes. Keep the host-source
  // allowlists (umami / cloudflare / cloudflareinsights) intact; they cover the
  // dynamically injected external scripts (Umami, Turnstile, and the Cloudflare
  // Web Analytics beacon). GA hosts (googletagmanager / google-analytics) are
  // intentionally omitted while GA is disabled.
  const scriptList = [...scriptHashes].sort().join(' ')
  headers = rewriteDirective(headers, 'script-src', (body) => {
    const cleaned = body.replace(/'unsafe-inline'\s*/g, '').trim().replace(/\s+/g, ' ')
    return `${cleaned} ${scriptList}`
  })

  // style-src: 'unsafe-inline' -> 'unsafe-hashes' + element & attribute hashes.
  // If a future refactor removes every style attribute, drop 'unsafe-hashes'
  // cleanly instead of failing (element hashes alone need no token).
  const styleTokens = [
    ...(styleAttrHashes.size > 0 ? ["'unsafe-hashes'"] : []),
    ...[...new Set([...styleElHashes, ...styleAttrHashes])].sort(),
  ].join(' ')
  headers = rewriteDirective(headers, 'style-src', (body) => {
    const cleaned = body.replace(/'unsafe-inline'\s*/g, '').trim().replace(/\s+/g, ' ')
    return `${cleaned} ${styleTokens}`
  })

  // connect-src: pin the Supabase wildcards to the exact project host.
  headers = rewriteDirective(headers, 'connect-src', (body) =>
    body
      .replace(/https:\/\/\*\.supabase\.co/g, `https://${supabaseHost}`)
      .replace(/wss:\/\/\*\.supabase\.co/g, `wss://${supabaseHost}`)
      .trim()
      .replace(/\s+/g, ' ')
  )

  writeFileSync(HEADERS_PATH, headers)
  console.log(
    `✓ CSP: script-src ${scriptHashes.size} hash(es) from ${inlineScriptCount} inline script(s); ` +
    `style-src ${styleElHashes.size} element + ${styleAttrHashes.size} attribute hash(es) from ` +
    `${styleElCount}/${styleAttrCount} occurrences ('unsafe-inline' removed from both); ` +
    `connect-src pinned to ${supabaseHost} in dist/_headers`
  )
}

main()
