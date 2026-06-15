// Validates blog internal links and image alt text (R4.11, R4.12).
//
// For every non-draft post in src/content/blog/*.md this script:
//   1. Extracts internal links (markdown + raw <a href>) whose href starts
//      with '/' and checks each one resolves to a real prerendered route.
//   2. Flags every markdown image / raw <img> that is missing alt text.
//
// The valid-route set is derived the same way the build derives it:
//   - static pages from src/pages/**/*.astro (non-dynamic files)
//   - cert landings /aws/<code> (active + coming-soon)
//   - per active cert: /aws/<code>/practice-exam, /aws/<code>/domain-practice,
//     and /aws/<code>/<domainSlug> for each domain
//   - blog posts /blog/<slug> for each non-draft post
//
// Wired into the `prebuild` chain so broken links fail the build.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BLOG_DIR = resolve(__dirname, '../src/content/blog')
const PAGES_DIR = resolve(__dirname, '../src/pages')
const CERT_REGISTRY_PATH = resolve(__dirname, '../src/data/certifications.ts')

// --- Cert registry parsing (lightweight, mirrors generate-seo-assets.mjs) ---
// We grep certifications.ts rather than importing TypeScript at build time.
const CERT_CODE_REGEX = /^[a-z]+-[a-z0-9]+$/

function parseCertRegistry() {
  const source = readFileSync(CERT_REGISTRY_PATH, 'utf8')
  const objectRegex = /'([a-z0-9-]+)':\s*\{([\s\S]*?)\n\s*\},?/g
  const certs = []
  let match
  while ((match = objectRegex.exec(source)) !== null) {
    const [, code, body] = match
    if (!CERT_CODE_REGEX.test(code)) continue
    const provider = body.match(/provider:\s*'([a-z0-9-]+)'/)?.[1]
    const status = body.match(/status:\s*'([a-z-]+)'/)?.[1]
    if (!provider || !status) continue
    // Match a domain object by its leading `id: <int>, name: '<name>'` and
    // capture the name, tolerating any trailing fields (questionCount,
    // examProportion, weight, taskRange, blurb, ...). Domain objects are
    // single-brace and contain no nested `}`, so `[^}]*` stops at this entry's
    // own close. Quoted-id objects (taskStatements) are excluded by the
    // unquoted `\d+` id requirement.
    const domainEntryRegex = /\{\s*id:\s*\d+,\s*name:\s*'([^']+)'[^}]*\}/g
    const domains = [...body.matchAll(domainEntryRegex)].map(m => ({ name: m[1] }))
    certs.push({ code, provider, status, domains })
  }
  return certs
}

// Same rule as getCertDomainSlug / slugifyDomain in the codebase.
function slugifyDomain(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// --- Static page route discovery ---
// Walk src/pages for .astro files. Skip `_`-prefixed files (Astro excludes
// them from routing) and dynamic-segment files (handled by enumeration of
// cert/domain/blog routes below).
function walkAstroFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walkAstroFiles(full))
    } else if (entry.endsWith('.astro')) {
      out.push(full)
    }
  }
  return out
}

function staticRoutesFromPages() {
  const routes = new Set()
  for (const file of walkAstroFiles(PAGES_DIR)) {
    const rel = relative(PAGES_DIR, file).split(sep).join('/')
    // Skip `_`-prefixed segments (non-routable) and dynamic segments.
    if (rel.split('/').some(seg => seg.startsWith('_'))) continue
    if (rel.includes('[')) continue
    // Map file path -> route.
    let route = '/' + rel.replace(/\.astro$/, '')
    route = route.replace(/\/index$/, '') // foo/index.astro -> /foo
    if (route === '') route = '/'
    routes.add(route)
  }
  return routes
}

// --- Blog frontmatter parsing ---
function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { frontmatter: '', body: raw }
  return { frontmatter: m[1], body: m[2] }
}

function isDraft(frontmatter) {
  return /^draft:\s*true\s*$/m.test(frontmatter)
}

function frontmatterSlug(frontmatter) {
  return frontmatter
    .match(/^slug:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
}

// --- Build the valid route set ---
const certs = parseCertRegistry()
const validRoutes = staticRoutesFromPages()

for (const cert of certs) {
  // Landing renders for both active and coming-soon certs.
  validRoutes.add(`/${cert.provider}/${cert.code}`)
  if (cert.status === 'active') {
    validRoutes.add(`/${cert.provider}/${cert.code}/practice-exam`)
    validRoutes.add(`/${cert.provider}/${cert.code}/domain-practice`)
    for (const domain of cert.domains) {
      validRoutes.add(`/${cert.provider}/${cert.code}/${slugifyDomain(domain.name)}`)
    }
  }
}

// Non-draft blog posts + collect them for scanning.
const blogFiles = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
const posts = []
for (const file of blogFiles) {
  const raw = readFileSync(resolve(BLOG_DIR, file), 'utf8')
  const { frontmatter, body } = splitFrontmatter(raw)
  if (isDraft(frontmatter)) continue
  const slug = frontmatterSlug(frontmatter)
  if (slug) validRoutes.add(`/blog/${slug}`)
  posts.push({ file, body })
}

// Normalise a route for comparison: drop query/fragment, strip trailing slash.
function normalizeRoute(path) {
  let p = path.split('#')[0].split('?')[0]
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p
}

const normalizedValid = new Set([...validRoutes].map(normalizeRoute))

// --- Scan posts for internal links + image alt text ---
const violations = []
let totalLinks = 0
let totalImages = 0

// Markdown links: [text](href) — but NOT images (which are ![text](src)).
const mdLinkRegex = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
// Raw HTML anchors.
const htmlAnchorRegex = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
// Markdown images.
const mdImageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
// Raw HTML images.
const htmlImageRegex = /<img\b[^>]*>/gi

function isInternal(href) {
  return href.startsWith('/') && !href.startsWith('//')
}

function checkLink(file, href) {
  if (/^(https?:)?\/\//i.test(href)) return // external
  if (/^mailto:/i.test(href)) return
  if (href.startsWith('#')) return // pure anchor
  if (!isInternal(href)) return // relative / protocol-relative handled above
  totalLinks++
  const normalized = normalizeRoute(href)
  if (!normalizedValid.has(normalized)) {
    violations.push({ file, link: href, reason: 'broken internal link' })
  }
}

for (const { file, body } of posts) {
  let m

  // Markdown links (skip images — they start with '!').
  mdLinkRegex.lastIndex = 0
  while ((m = mdLinkRegex.exec(body)) !== null) {
    const isImage = m[1] === '!'
    if (isImage) continue
    checkLink(file, m[2])
  }

  // Raw HTML anchors.
  htmlAnchorRegex.lastIndex = 0
  while ((m = htmlAnchorRegex.exec(body)) !== null) {
    checkLink(file, m[1])
  }

  // Markdown images.
  mdImageRegex.lastIndex = 0
  while ((m = mdImageRegex.exec(body)) !== null) {
    totalImages++
    const alt = m[1].trim()
    if (!alt) {
      violations.push({ file, image: m[2], reason: 'missing alt text' })
    }
  }

  // Raw HTML images.
  htmlImageRegex.lastIndex = 0
  while ((m = htmlImageRegex.exec(body)) !== null) {
    totalImages++
    const tag = m[0]
    const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i)
    const src = srcMatch?.[1] ?? tag
    if (!altMatch || !altMatch[1].trim()) {
      violations.push({ file, image: src, reason: 'missing alt text' })
    }
  }
}

// --- Report ---
if (violations.length > 0) {
  console.error(`✗ internal-links: ${violations.length} violation(s) found across ${posts.length} post(s):\n`)
  for (const v of violations) {
    if (v.reason === 'broken internal link') {
      console.error(`  [broken internal link] ${v.file}: ${v.link}`)
    } else {
      console.error(`  [missing alt text]     ${v.file}: ${v.image}`)
    }
  }
  process.exit(1)
}

console.log(
  `✓ internal-links: ${posts.length} posts, ${totalLinks} links, ${totalImages} images — all valid`,
)
