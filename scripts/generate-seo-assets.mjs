// Regenerates public/sitemap.xml, src/lib/generated/question-counts.ts,
// public/llms.txt, public/_redirects, and public/manifest.json from the
// cert registry. Single source of truth: src/data/certifications.ts.
//
// Wired as a `prebuild` script in package.json so every production build
// ships fresh SEO assets, accurate question counts, and a redirects file
// pointing at the current default cert.

import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Run under `tsx` (see the `prebuild` script in package.json) so this
// generator can import the TypeScript citation source of truth directly.
// llms.txt's top-level `/` description is sourced from the SAME module that
// feeds the rendered home page, eliminating locked-phrase drift (R7.3, R16.14).
import {
  LOCKED_CITATION_PHRASES,
  HOME_H1,
  buildHomeMetaDescription,
} from '../src/lib/citation-content.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, '../public/sitemap.xml')
const CERT_REGISTRY_PATH = resolve(__dirname, '../src/data/certifications.ts')
const GENERATED_DIR = resolve(__dirname, '../src/lib/generated')
const QUESTION_COUNTS_PATH = resolve(GENERATED_DIR, 'question-counts.ts')
const LLMS_TXT_PATH = resolve(__dirname, '../public/llms.txt')
const REDIRECTS_PATH = resolve(__dirname, '../public/_redirects')
const MANIFEST_PATH = resolve(__dirname, '../public/manifest.json')

const SITE_URL = 'https://www.cloudcertprep.io'
const APEX_HOST = 'cloudcertprep.io'
const WWW_HOST = 'www.cloudcertprep.io'

/**
 * Lightweight parser that extracts cert metadata from `certifications.ts`
 * without importing TypeScript at build time. We grep each cert's body for
 * the fields we need. This is sufficient because the registry has a stable
 * shape (one object per cert) and avoids pulling in tsx/esbuild as a
 * build-script dependency.
 */
/** Cert code must be lowercase letters, digits, and hyphens only. */
const CERT_CODE_REGEX = /^[a-z]+-[a-z0-9]+$/
const LEVEL_LABELS = {
  foundational: 'Foundational Level',
  associate: 'Associate Level',
  professional: 'Professional Level',
  specialty: 'Specialty Level',
}
const LEVEL_ORDER = ['foundational', 'associate', 'professional', 'specialty']

function parseCertRegistry() {
  const source = readFileSync(CERT_REGISTRY_PATH, 'utf8')
  // Match each top-level cert object keyed by its lowercase code string.
  const objectRegex = /'([a-z0-9-]+)':\s*\{([\s\S]*?)\n\s*\},?/g
  const certs = []
  let match
  while ((match = objectRegex.exec(source)) !== null) {
    const [, code, body] = match
    if (!CERT_CODE_REGEX.test(code)) continue
    const provider = body.match(/provider:\s*'([a-z0-9-]+)'/)?.[1]
    const status = body.match(/status:\s*'([a-z-]+)'/)?.[1]
    const level = body.match(/level:\s*'([a-z-]+)'/)?.[1]
    const name = body.match(/name:\s*'([^']+)'/)?.[1]
    const shortName = body.match(/shortName:\s*'([^']+)'/)?.[1]
    const examQuestionCount = Number(body.match(/examQuestionCount:\s*(\d+)/)?.[1] ?? 0)
    // Match `examTimeSeconds: 90 * 60` and evaluate the literal product
    // safely (digits and stars only — guarded by the regex).
    const examTimeSecondsExpr = body.match(/examTimeSeconds:\s*([0-9 *]+)/)?.[1]
    const examTimeSeconds = examTimeSecondsExpr
      ? examTimeSecondsExpr
          .split('*')
          .map(part => Number(part.trim()))
          .reduce((product, n) => product * n, 1)
      : 0
    const passingScore = Number(body.match(/passingScore:\s*(\d+)/)?.[1] ?? 0)
    if (provider && status && level && name && shortName) {
      const domainEntryRegex = /\{\s*id:\s*\d+,\s*name:\s*'([^']+)',\s*questionCount:\s*(\d+),\s*examProportion:\s*[\d.]+[^}]*\}/g
      const domains = [...body.matchAll(domainEntryRegex)].map(m => ({
        name: m[1],
        questionCount: Number(m[2]),
      }))
      const totalQuestions = domains.reduce((s, d) => s + d.questionCount, 0)
      certs.push({
        code,
        provider,
        status,
        level,
        name,
        shortName,
        examQuestionCount,
        examTimeSeconds,
        passingScore,
        domains,
        totalQuestions,
      })
    }
  }
  return certs
}

function parseDefaultCertId() {
  const source = readFileSync(CERT_REGISTRY_PATH, 'utf8')
  return source.match(/DEFAULT_CERT_ID\s*=\s*'([a-z0-9-]+)'/)?.[1] ?? null
}

/**
 * Parse FAQ_ENTRIES out of `seo-data.ts`. We only need question + answer
 * strings for the llms.txt FAQ section; categories and certCode are
 * irrelevant for LLM consumption (LLMs read the full list and re-categorise
 * themselves). Most entries are single-quoted; one uses a template literal
 * with a runtime QUESTION_COUNTS substitution that we resolve here.
 *
 * Brittle? Yes, but no more than parseCertRegistry, and this avoids pulling
 * tsx/esbuild into the build-script chain.
 */
const SEO_DATA_PATH = resolve(__dirname, '../src/lib/seo-data.ts')

function parseFaqEntries(questionCountsByCert) {
  const source = readFileSync(SEO_DATA_PATH, 'utf8')
  // Locate the array body so we don't pick up unrelated string literals
  // elsewhere in the file. We anchor on `= [` rather than the first `[`
  // because the type annotation `FAQEntry[]` would otherwise match first.
  const arrayStart = source.indexOf('export const FAQ_ENTRIES')
  if (arrayStart === -1) return []
  const equalsIdx = source.indexOf('= [', arrayStart)
  if (equalsIdx === -1) return []
  const bodyStart = equalsIdx + 2
  // Match braces to find the array end (stop at first ']' that closes the
  // outer array; FAQ entries don't nest arrays).
  let depth = 0
  let bodyEnd = bodyStart
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }
  const body = source.slice(bodyStart, bodyEnd)

  const entries = []
  // Match each entry: a quoted question followed by a quoted-or-backtick answer.
  // We accept arbitrary whitespace and an optional `answer:` newline-break form.
  const entryRegex = /question:\s*'([^']+)',[\s\S]*?answer:\s*(?:'([\s\S]*?)'|`([\s\S]*?)`)\s*,/g
  let match
  while ((match = entryRegex.exec(body)) !== null) {
    const question = match[1]
    const rawSingle = match[2]
    const rawBackticked = match[3]
    let answer = rawSingle ?? rawBackticked ?? ''
    if (rawBackticked != null) {
      // Resolve the only template substitution shape we use today:
      //   ${(QUESTION_COUNTS['<cert>'] ?? <fallback>).toLocaleString()}
      answer = answer.replace(
        /\$\{\s*\(\s*QUESTION_COUNTS\['([a-z0-9-]+)'\]\s*\?\?\s*(\d+)\s*\)\.toLocaleString\(\)\s*\}/g,
        (_, certCode, fallback) => {
          const count = questionCountsByCert[certCode] ?? Number(fallback)
          return count.toLocaleString('en-GB')
        },
      )
      // Guard rail: if any template expression slipped through, drop the
      // entry rather than ship `${...}` into llms.txt.
      if (answer.includes('${')) continue
    }
    // Honour `excludeFromLlms: true` (seo-data.ts FAQEntry flag). The flag sits
    // after the answer in the object literal (and after any `steps:{...}` block,
    // which can be long), so scan from the end of this match up to the NEXT
    // entry's `question:` for it. Subjective/anecdotal/strategy answers render
    // on the site but are kept OUT of llms.txt so the file stays a
    // high-confidence factual signal for LLM browse-mode.
    const afterMatch = body.slice(match.index + match[0].length)
    const nextQ = afterMatch.indexOf('question:')
    const window = nextQ === -1 ? afterMatch : afterMatch.slice(0, nextQ)
    if (/excludeFromLlms:\s*true/.test(window)) continue
    entries.push({ question, answer })
  }
  return entries
}

const certs = parseCertRegistry()
const providers = Array.from(new Set(certs.map(c => c.provider)))

// Distinct providers that have at least one *active* cert. Mirrors the
// `getActiveProviders()` helper in `src/data/certifications.ts` so the
// "is multi-provider?" decision is consistent between client code and
// build-time SEO assets.
const activeProviders = Array.from(
  new Set(certs.filter(c => c.status === 'active').map(c => c.provider)),
)
const isSingleProvider = activeProviders.length <= 1

// Cert-agnostic routes. /history is omitted (noindex/per-user), /login and
// /reset-password are noindex. /stats is temporarily noindex (community sample
// too small to publish yet), so it is excluded from the sitemap until re-enabled.
// Most recent commit date (YYYY-MM-DD) across the given repo-relative source
// paths, or null if git history is unavailable (e.g. a shallow CI clone), so
// the caller falls back to the build date. Gives each route a real
// content-change <lastmod> instead of bumping every URL to the build date on
// each deploy (which trains crawlers to ignore the field). (technical-SEO audit)
const REPO_ROOT = resolve(__dirname, '..')
function gitLastmod(...relPaths) {
  try {
    let latest = ''
    for (const rel of relPaths) {
      const out = execSync(`git log -1 --format=%cs -- "${rel}"`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (out && out > latest) latest = out
    }
    return latest || null
  } catch {
    return null
  }
}

const STATIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: gitLastmod('src/pages/index.astro', 'src/lib/citation-content.ts') },
  { path: '/about', changefreq: 'monthly', priority: '0.6', lastmod: gitLastmod('src/pages/about.astro') },
  { path: '/contribute', changefreq: 'monthly', priority: '0.5', lastmod: gitLastmod('src/pages/contribute.astro') },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3', lastmod: gitLastmod('src/pages/privacy.astro') },
  { path: '/terms', changefreq: 'yearly', priority: '0.3', lastmod: gitLastmod('src/pages/terms.astro') },
]

// Provider hubs: /aws, /azure, /gcp. While only one provider is active the
// hub is identical to `/`, so we 301-redirect /aws → / (in `_redirects`
// below) and skip it from the sitemap to avoid indexing a duplicate page.
// When a second provider ships, both `/` and `/aws` get distinct content
// and reappear here.
const PROVIDER_ROUTES = isSingleProvider
  ? []
  : providers.map(provider => ({
      path: `/${provider}`,
      changefreq: 'weekly',
      priority: '0.8',
    }))

// Cert codes whose bank is currently under manual re-review against the
// official exam guide. These remain `status: 'active'` so the UI keeps
// working for direct visitors, but they are excluded from the sitemap and
// noindexed at render time. Empty at squash: AIF-C01 ships GA and indexable
// on day one (R2.9). Re-populate this set only if a future cert ships
// unverified.
const CERTS_UNDER_REVIEW = new Set([])

// Cert landings: only emit *active* cert URLs. Coming-soon certs (e.g.
// SAA-C03) still render a /aws/<code> landing for direct visits ("watch on
// GitHub" CTA), but the URL is excluded from the sitemap and the page is
// noindexed at render time.
const CERT_LANDING_ROUTES = certs
  .filter(cert => cert.status === 'active' && !CERTS_UNDER_REVIEW.has(cert.code))
  .map(cert => ({
    path: `/${cert.provider}/${cert.code}`,
    changefreq: 'weekly',
    priority: '0.9',
    image: `/og/og-${cert.code}.png`,
    lastmod: gitLastmod(`src/data/${cert.code}`, 'src/data/certifications.ts'),
  }))

// Domain_Landings: one indexable page per (active cert, domain). Practice flow
// routes (practice-exam, domain-practice) are NOT in the sitemap — they are
// interactive React-island shells served with robots=noindex. (R6.14, R2.9)
function slugifyDomain(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const DOMAIN_LANDING_ROUTES = certs
  .filter(cert => cert.status === 'active' && !CERTS_UNDER_REVIEW.has(cert.code))
  .flatMap(cert =>
    cert.domains.map(domain => ({
      path: `/${cert.provider}/${cert.code}/${slugifyDomain(domain.name)}`,
      changefreq: 'weekly',
      priority: '0.7',
      image: `/og/og-${cert.code}-${slugifyDomain(domain.name)}.png`,
      lastmod: gitLastmod(`src/data/${cert.code}/domain${domain.id}.json`, 'src/data/certifications.ts'),
    })),
  )

const ROUTES = [
  ...STATIC_ROUTES,
  ...PROVIDER_ROUTES,
  ...CERT_LANDING_ROUTES,
  ...DOMAIN_LANDING_ROUTES,
]

const today = new Date().toISOString().slice(0, 10)

// --- Blog routes (the /blog index + one URL per non-draft post) ---------
// Post <lastmod> comes from the post's own frontmatter (`updated ?? date`),
// NOT the build timestamp (R4.18). The /blog index uses the build date.
const BLOG_DIR = resolve(__dirname, '../src/content/blog')

function parseBlogFrontmatter(raw) {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return null
  const body = fm[1]
  const get = (key) => body.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  return {
    slug: get('slug'),
    date: get('date'),
    updated: get('updated'),
    draft: /^draft:\s*true\s*$/m.test(body),
  }
}

let blogRoutes = []
try {
  const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'))
  blogRoutes = files
    .map(f => parseBlogFrontmatter(readFileSync(resolve(BLOG_DIR, f), 'utf8')))
    .filter(p => p && p.slug && !p.draft)
    .map(p => ({
      path: `/blog/${p.slug}`,
      changefreq: 'monthly',
      priority: '0.6',
      lastmod: (p.updated ?? p.date ?? today).slice(0, 10),
      image: '/og/og-blog.png',
    }))
  if (blogRoutes.length > 0) {
    ROUTES.push({ path: '/blog', changefreq: 'weekly', priority: '0.7' })
    ROUTES.push(...blogRoutes)
  }
} catch {
  // No blog directory yet — skip blog routes.
}

const urls = ROUTES.map(
  ({ path, changefreq, priority, lastmod, image }) =>
    `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${lastmod ?? today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${image ? `
    <image:image>
      <image:loc>${SITE_URL}${image}</image:loc>
    </image:image>` : ''}
  </url>`,
).join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`

writeFileSync(OUTPUT_PATH, xml)
console.log(`✓ sitemap.xml regenerated with lastmod=${today} (${ROUTES.length} routes, ${certs.length} certs)`)

// --- Emit src/lib/generated/question-counts.ts ---
mkdirSync(GENERATED_DIR, { recursive: true })
const activeCerts = certs.filter(c => c.status === 'active')
const countsEntries = activeCerts.map(c => `  '${c.code}': ${c.totalQuestions},`).join('\n')
const totalActive = activeCerts.reduce((s, c) => s + c.totalQuestions, 0)
const questionCountsTs = `// AUTO-GENERATED by scripts/generate-seo-assets.mjs - do not edit manually.
// Re-run via \`npm run prebuild\` or \`npm run build\`.

export const QUESTION_COUNTS: Record<string, number> = {
${countsEntries}
}

export const TOTAL_ACTIVE_QUESTIONS = ${totalActive}
`
writeFileSync(QUESTION_COUNTS_PATH, questionCountsTs)
console.log(`✓ question-counts.ts emitted (${activeCerts.length} active certs, ${totalActive} total Q)`)

// --- Rewrite public/llms.txt ---
// Group active certs by level so the file mirrors the natural learning path
// (foundational → associate → professional → specialty). Coming-soon certs
// get a single trailing section so LLMs see them as planned coverage.
const activeByLevel = LEVEL_ORDER.map(level => ({
  level,
  certs: activeCerts.filter(c => c.level === level),
})).filter(g => g.certs.length > 0)
const comingSoonCerts = certs.filter(c => c.status === 'coming-soon')

function formatActiveCertBlock(cert) {
  const minutes = Math.round(cert.examTimeSeconds / 60)
  const domainNames = cert.domains.map(d => d.name).join(', ')
  // Business-driver phrases (R23.13). `cert.shortName` is the uppercase exam
  // code (e.g. CLF-C02) used on the official AWS exam guide.
  const driverLine =
    `- Why practise here: realistic exam simulation, detailed explanations for every question, ` +
    `aligned to the current ${cert.shortName} exam guide.`
  // One indexable Domain_Landing bullet per active domain (R6.14). The
  // noindex practice-flow shells (practice-exam, domain-practice) are
  // intentionally NOT linked here — they are robots=noindex React islands,
  // so llms.txt points at the crawlable Domain_Landings instead (audit E1).
  const domainLines = cert.domains.map(domain =>
    `- [${domain.name}](${SITE_URL}/${cert.provider}/${cert.code}/${slugifyDomain(domain.name)}): ` +
    `${domain.name} free practice questions with explanations`,
  )
  return [
    `**${cert.name} (${cert.shortName})**`,
    `- [Certification Home](${SITE_URL}/${cert.provider}/${cert.code}): ${cert.examQuestionCount} questions, ${minutes} minutes, scaled scoring (${cert.passingScore}/1000 to pass)`,
    driverLine,
    ...domainLines,
    `- Question Bank: ${cert.totalQuestions} questions across ${cert.domains.length} domains (${domainNames})`,
  ].join('\n')
}

// Provider-hub bullets in llms.txt. Suppressed while single-provider because
// `/aws` 301s to `/` in that mode — including the link would point LLMs at a
// redirect target (technically fine, just noisy). Returns automatically when
// a second provider gains an active cert. Newline is included inside the
// expression so the template reads cleanly when providerSections is empty.
const providerSections = isSingleProvider
  ? ''
  : Array.from(new Set(activeCerts.map(c => c.provider)))
      .sort()
      .map(p => `- [${p.toUpperCase()} Certifications](${SITE_URL}/${p}): all ${p.toUpperCase()} certification tracks`)
      .join('\n') + '\n'

const certLevelSections = activeByLevel
  .map(group => {
    const heading = LEVEL_LABELS[group.level] ?? group.level
    const blocks = group.certs.map(formatActiveCertBlock).join('\n\n')
    return `### ${heading}\n\n${blocks}`
  })
  .join('\n\n')

const comingSoonSection = comingSoonCerts.length > 0
  ? `\n\n### Coming Soon\n\n` + comingSoonCerts
      .map(c => `**${c.name} (${c.shortName})** - Coming Soon\n- [Certification Home](${SITE_URL}/${c.provider}/${c.code})`)
      .join('\n\n')
  : ''

// Build the FAQ section. LLM browse-mode (ChatGPT, Perplexity, Gemini) reads
// llms.txt during research, so flat Q&A here directly seeds answers like
// "where do I report a bad CloudCertPrep question?" with our own copy.
const questionCountsByCert = Object.fromEntries(
  activeCerts.map(c => [c.code, c.totalQuestions]),
)
const faqEntries = parseFaqEntries(questionCountsByCert)
const faqSection = faqEntries.length > 0
  ? '\n\n## FAQ\n\n' +
    faqEntries
      .map(e => `### ${e.question}\n\n${e.answer}`)
      .join('\n\n')
  : ''

// Top-level `/` description block. Sourced from src/lib/citation-content.ts
// (the SAME module the rendered home page uses) so the Locked_Citation_Phrases
// can never drift between the home page and llms.txt (R7.3, R16.14). We build
// the home meta description from the live CLF/AIF counts, then append a
// continuity sentence that carries the remaining Locked_Citation_Phrases
// (author attribution, GitHub auditability, MIT license, spaced repetition).
const clfCount = questionCountsByCert['clf-c02'] ?? 0
const aifCount = questionCountsByCert['aif-c01'] ?? 0
const homeDescription = [
  buildHomeMetaDescription(clfCount, aifCount),
  `Maintained by Alex Santonastaso, CloudCertPrep keeps every question bank ` +
    `MIT licensed and publicly auditable on GitHub, with domain-by-domain ` +
    `practice driven by adaptive spaced repetition.`,
].join(' ')

// Defensive guard: assert every Locked_Citation_Phrase literally appears in
// the home description so a future copy edit can't silently break the
// Build_Time_Citation_Guard contract. Build fails loudly if one is missing.
// HOME_H1 is reused so the guard also covers the home page's anchor phrase.
const homeDescriptionPhrases = [...LOCKED_CITATION_PHRASES, HOME_H1]
const missingPhrases = homeDescriptionPhrases.filter(
  phrase => !homeDescription.includes(phrase),
)
if (missingPhrases.length > 0) {
  throw new Error(
    `llms.txt home description is missing Locked_Citation_Phrases: ${missingPhrases.join(', ')}`,
  )
}

const llmsTxt = `# CloudCertPrep

> ${homeDescription}

## Pages

- [Home](${SITE_URL}/): platform overview and certification catalog
- [About](${SITE_URL}/about): who maintains CloudCertPrep, the question-writing methodology, and the free open-source rationale
${providerSections}- [Blog](${SITE_URL}/blog): AWS certification study guides, exam strategy, and career articles
- [Contribute](${SITE_URL}/contribute): how to add questions, fix errors, or propose a new certification via GitHub
- [Privacy Policy](${SITE_URL}/privacy): GDPR-compliant data practices, EU hosting, no data selling
- [Terms of Service](${SITE_URL}/terms): MIT license, trademark notices, no warranty disclaimer

## Certifications

${certLevelSections}${comingSoonSection}${faqSection}

## Resources

- [GitHub repository](https://github.com/nastaso/cloudcertprep)
- [Report a question error](https://github.com/nastaso/cloudcertprep/issues/new?title=Question+error)
- [Author portfolio](https://santonastaso.me)
`
writeFileSync(LLMS_TXT_PATH, llmsTxt)
console.log(`✓ llms.txt rewritten (${activeCerts.length} active, ${comingSoonCerts.length} coming-soon, ${faqEntries.length} FAQ entries)`)

// --- Rewrite public/_redirects ---
// Legacy single-cert URLs map to the *current default cert's* practice flows.
// Flipping DEFAULT_CERT_ID in the registry automatically updates these
// targets on the next build.
const defaultCertId = parseDefaultCertId()
const defaultCert = certs.find(c => c.code === defaultCertId)
const legacyRedirects = defaultCert
  ? [
      // Target the INDEXABLE cert landing, not the noindex practice shells:
      // a 301 into a noindex page forfeits any link equity the legacy URLs
      // carry. Users land one click from the exam; crawlers land on a real page.
      `/mock-exam           /${defaultCert.provider}/${defaultCert.code}        301`,
      `/practice-exam       /${defaultCert.provider}/${defaultCert.code}        301`,
      `/domain-practice     /${defaultCert.provider}/${defaultCert.code}        301`,
    ].join('\n')
  : '# No DEFAULT_CERT_ID resolved — legacy single-cert redirects omitted.'

// While only one provider is active, the provider hub is identical content
// to `/`. 301 it so search engines consolidate signal at `/` and users
// landing on `/aws` get the canonical home immediately. A plain `301` is used
// (not `301!`): Cloudflare Pages always follows a redirect even when a static
// asset matches the path, so the rule takes precedence over the `/aws/index.html`
// that Astro emits from `src/pages/aws/index.astro` without a force suffix
// (which CF rejects). When a second provider ships, this section becomes empty
// (multi-provider gets the real hub back). The bare path matches `/aws` exactly;
// cert-scoped routes like `/aws/clf-c02` are not affected and fall through.
const providerHubRedirects = isSingleProvider && activeProviders.length === 1
  ? `/${activeProviders[0]}    /    301`
  : '# Multiple providers active; provider hubs render distinct content.'

const redirects = `# AUTO-GENERATED by scripts/generate-seo-assets.mjs - do not edit manually.
# Re-run via \`npm run prebuild\` or \`npm run build\`.

# Apex -> www (permanent)
https://${APEX_HOST}/*   https://${WWW_HOST}/:splat   301!

# Legacy route redirects (301 permanent), targeting DEFAULT_CERT_ID
${legacyRedirects}

# Provider hub collapse while single-provider (auto-disabled when 2nd
# provider ships).
${providerHubRedirects}

`
writeFileSync(REDIRECTS_PATH, redirects)
console.log(`✓ _redirects regenerated (default cert: ${defaultCertId ?? 'unresolved'}, single-provider: ${isSingleProvider})`)

// --- Rewrite public/manifest.json ---
// Manifest copy is cert-agnostic: the same PWA serves every cert, and a CLF-
// C02-specific blurb in the manifest competes with the per-cert SEO injected
// by `useSEO`. Question count reads the platform total so adding/removing
// active certs updates the install card with no further edits.
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
manifest.name = 'CloudCertPrep · Free Cloud Certification Practice Exams'
manifest.description = `Free cloud certification practice exams across ${activeCerts.length} active ${activeCerts.length === 1 ? 'certification' : 'certifications'} (${totalActive.toLocaleString('en-GB')}+ questions). Timed mock exams, domain practice with adaptive spaced repetition, and progress tracking. No signup, no ads.`
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
console.log(`✓ manifest.json name + description updated`)
