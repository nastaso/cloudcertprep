#!/usr/bin/env node
/**
 * Blog frontmatter validator (Phase 8).
 *
 * Reads every src/content/blog/*.md, parses its YAML frontmatter with a small
 * hand-rolled parser (no new npm deps), and for every NON-DRAFT post asserts:
 *   - required fields present: title, slug, description, date
 *   - slug is unique across the collection
 *   - slug matches /^[a-z0-9-]+$/
 *   - date is not in the future
 *   - description length is 50-160
 *   - title length is 10-80
 *   - if ogImage is set, the referenced file exists under public/
 *   - tags include at least one recognized cert-code tag (G5 tag taxonomy,
 *     see the `tags` comment in src/content.config.ts) - domain-slug tags
 *     are conditional per post, so they are documented but not enforced here
 *   - N1 citations: at least 2 outbound links in the post BODY (not
 *     frontmatter) point at an authority-allowlisted host (AWS docs, NIST,
 *     named labor-market sources - see AUTHORITY_ALLOWLIST below). Opt out
 *     per post with `citationsExempt: true`.
 *
 * Exits non-zero with a per-violation report on failure; prints a success
 * summary on pass. Run via `npm run prebuild` (appended to the chain).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog')
const PUBLIC_DIR = join(ROOT, 'public')
const CERT_REGISTRY_PATH = join(ROOT, 'src', 'data', 'certifications.ts')

/**
 * Known cert codes (e.g. 'clf-c02', 'aif-c01'), parsed out of the registry's
 * `code: '...'` fields with a small regex - same lightweight-parse approach
 * scripts/generate-seo-assets.mjs already uses to read this file at build
 * time, kept here as its own tiny pass so this validator stays plain `node`
 * (no tsx) rather than importing the .ts registry.
 */
// Cert code must be lowercase letters, digits, and hyphens only (same shape
// as scripts/generate-seo-assets.mjs's CERT_CODE_REGEX). This also excludes
// the PROVIDERS registry's bare `code: 'aws'/'azure'/'gcp'` entries, which
// match the raw `code: '...'` regex but aren't real cert-page tags.
const CERT_CODE_REGEX = /^[a-z]+-[a-z0-9]+$/
function knownCertCodes() {
  const source = readFileSync(CERT_REGISTRY_PATH, 'utf8')
  const codes = new Set()
  const re = /code:\s*'([a-z0-9-]+)'/g
  let m
  while ((m = re.exec(source)) !== null) {
    if (CERT_CODE_REGEX.test(m[1])) codes.add(m[1])
  }
  return codes
}

const violations = []
function violation(file, msg) {
  violations.push(`${file}: ${msg}`)
}

/**
 * N1 outbound-citation allowlist (GEO/AI-citation content-quality gate).
 * Hosts that count as an "authority citation" - keep in sync with the
 * canonical sources in .kiro/content/blog-sources.md (AWS official
 * docs/exam guides, NIST). Add a named labor-market source here ONLY once a
 * post actually links to it (no source is cited yet as of this check's
 * introduction - see the PR that added this list for the current state).
 * Easy to edit: add/remove a string; '*.example.com' matches any subdomain.
 */
const AUTHORITY_ALLOWLIST = [
  'aws.amazon.com',
  'docs.aws.amazon.com',
  'nist.gov',
  'www.nist.gov',
  'bls.gov', // US Bureau of Labor Statistics - authority source for salary/labor-market posts
  'www.bls.gov',
]

function isAuthorityHost(hostname) {
  const host = hostname.toLowerCase()
  return AUTHORITY_ALLOWLIST.some((entry) =>
    entry.startsWith('*.') ? host.endsWith(entry.slice(1)) : host === entry,
  )
}

// Same link-extraction patterns as scripts/validate-internal-links.mjs, so
// the two scripts can't drift on what counts as a link in the post body.
const mdLinkRegex = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const htmlAnchorRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi

function bodyOf(raw) {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
  return m ? m[1] : raw
}

function countAuthorityLinks(body) {
  const found = new Set()
  const collect = (href) => {
    if (!/^https?:\/\//i.test(href)) return
    try {
      if (isAuthorityHost(new URL(href).hostname)) found.add(href)
    } catch {
      // Malformed URL - not a citation either way.
    }
  }

  mdLinkRegex.lastIndex = 0
  let m
  while ((m = mdLinkRegex.exec(body)) !== null) {
    if (m[1] === '!') continue // skip images
    collect(m[2])
  }
  htmlAnchorRegex.lastIndex = 0
  while ((m = htmlAnchorRegex.exec(body)) !== null) collect(m[1])

  return found.size
}

/**
 * Extract the frontmatter block (between the first pair of `---` fences) and
 * parse a flat subset of YAML: scalars, quoted strings, inline arrays
 * (`[a, b]`), and dashed-list arrays. Sufficient for the blog schema fields.
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const body = match[1]
  const lines = body.split(/\r?\n/)
  const data = {}
  let currentListKey = null

  for (const line of lines) {
    if (line.trim() === '') continue

    // Dashed list item belonging to the previous key.
    const listItem = line.match(/^\s*-\s+(.*)$/)
    if (listItem && currentListKey) {
      data[currentListKey].push(stripQuotes(listItem[1].trim()))
      continue
    }

    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    let value = kv[2].trim()
    currentListKey = null

    if (value === '') {
      // Possible start of a dashed list on subsequent lines.
      currentListKey = key
      data[key] = []
      continue
    }

    // Inline array: [a, b, c]
    const inlineArray = value.match(/^\[(.*)\]$/)
    if (inlineArray) {
      const inner = inlineArray[1].trim()
      data[key] = inner === ''
        ? []
        : inner.split(',').map((s) => stripQuotes(s.trim())).filter((s) => s !== '')
      continue
    }

    data[key] = stripQuotes(value)
  }
  return data
}

function stripQuotes(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1)
  }
  return s
}

function isFutureDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  // Compare against end of today (UTC) so a same-day date is never "future".
  const now = new Date()
  return d.getTime() > now.getTime()
}

if (!existsSync(BLOG_DIR)) {
  console.error(`\n❌ Blog directory not found: ${BLOG_DIR}`)
  process.exit(1)
}

const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))
const seenSlugs = new Map()
const CERT_CODES = knownCertCodes()
let nonDraftCount = 0

for (const file of files) {
  const raw = readFileSync(join(BLOG_DIR, file), 'utf8')
  const fm = parseFrontmatter(raw)
  if (!fm) {
    violation(file, 'no parseable frontmatter block found')
    continue
  }

  const isDraft = String(fm.draft).toLowerCase() === 'true'

  // Slug uniqueness is checked across the whole collection (drafts included),
  // since drafts share the same URL namespace once published.
  if (fm.slug) {
    if (seenSlugs.has(fm.slug)) {
      violation(file, `duplicate slug "${fm.slug}" (also in ${seenSlugs.get(fm.slug)})`)
    } else {
      seenSlugs.set(fm.slug, file)
    }
  }

  if (isDraft) continue
  nonDraftCount++

  // Required fields
  for (const field of ['title', 'slug', 'description', 'date']) {
    if (fm[field] === undefined || fm[field] === '') {
      violation(file, `missing required field "${field}"`)
    }
  }

  if (fm.slug && !/^[a-z0-9-]+$/.test(fm.slug)) {
    violation(file, `slug "${fm.slug}" does not match /^[a-z0-9-]+$/`)
  }

  if (fm.date && isFutureDate(fm.date)) {
    violation(file, `date "${fm.date}" is in the future`)
  }

  if (fm.description !== undefined) {
    const len = fm.description.length
    if (len < 50 || len > 160) {
      violation(file, `description length ${len} out of range (50-160)`)
    }
  }

  if (fm.title !== undefined) {
    const len = fm.title.length
    if (len < 10 || len > 80) {
      violation(file, `title length ${len} out of range (10-80)`)
    }
  }

  // Character allowlist on fields that flow into inline JSON-LD
  // (BlogPosting/breadcrumb). Defense-in-depth alongside the `<`-escaping
  // serializer (security V6): reject angle brackets outright so a contributor
  // PR cannot smuggle markup into the structured-data sinks. (security V6)
  for (const field of ['title', 'description']) {
    if (typeof fm[field] === 'string' && /[<>]/.test(fm[field])) {
      violation(file, `field "${field}" contains disallowed characters (< or >)`)
    }
  }
  if (Array.isArray(fm.tags)) {
    for (const tag of fm.tags) {
      if (/[<>]/.test(tag)) {
        violation(file, `tag "${tag}" contains disallowed characters (< or >)`)
      }
    }
  }

  // Tag taxonomy (G5 content-scale pre-flight): every non-draft post must
  // carry at least one recognized cert-code tag (see the `tags` comment in
  // src/content.config.ts) so it always surfaces on that cert's domain
  // landings, even before a domain-slug tag is added. Domain-slug tags are
  // conditional per post, so they are documented but not enforced here.
  if (!Array.isArray(fm.tags) || !fm.tags.some((tag) => CERT_CODES.has(tag))) {
    violation(
      file,
      `tags [${Array.isArray(fm.tags) ? fm.tags.join(', ') : ''}] do not include a recognized cert-code tag (one of: ${[...CERT_CODES].join(', ')})`,
    )
  }

  if (fm.ogImage) {
    const rel = fm.ogImage.startsWith('/') ? fm.ogImage.slice(1) : fm.ogImage
    const ogPath = join(PUBLIC_DIR, rel)
    if (!existsSync(ogPath)) {
      violation(file, `ogImage "${fm.ogImage}" not found under public/ (${ogPath})`)
    }
  }

  // N1 citations: every non-draft post needs >=2 outbound links (in the
  // body, not frontmatter) to an authority-allowlisted host - the cheapest
  // AI-citation/GEO lever (see .kiro/content/BLOG-PUBLISHING-AND-SEO-CHECKS).
  // `citationsExempt: true` grandfathers a post that legitimately has none
  // yet (e.g. published before this check existed); remove the flag once
  // real citations are added.
  const citationsExempt = String(fm.citationsExempt).toLowerCase() === 'true'
  if (!citationsExempt) {
    const authorityLinkCount = countAuthorityLinks(bodyOf(raw))
    if (authorityLinkCount < 2) {
      violation(
        file,
        `only ${authorityLinkCount} outbound authority citation(s) found, need >=2 (allowlist: ${AUTHORITY_ALLOWLIST.join(', ')}) - add citations or set citationsExempt: true`,
      )
    }
  }
}

console.log('')
console.log('Blog frontmatter validation:')
console.log(`  ${files.length} post file(s), ${nonDraftCount} non-draft`)

if (violations.length > 0) {
  console.error('')
  console.error(`FAILED with ${violations.length} violation(s):`)
  for (const v of violations) console.error(`  - ${v}`)
  process.exit(1)
}

console.log('  All non-draft posts valid.')
process.exit(0)
