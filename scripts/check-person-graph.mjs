#!/usr/bin/env node
/**
 * Person/Organization/WebSite graph invariance guard (Property 5
 * PERSON-ENTITY-INVARIANCE — R16.9, R18.1).
 *
 * The platform-level JSON-LD graph (WebSite + Organization + Person) is the
 * cross-property E-E-A-T / LLM-trust anchor. It is emitted on EVERY prerendered
 * page via BaseLayout, sourced from the single source of truth in
 * `src/lib/base-graph.ts`. This guard runs AFTER `astro build` and asserts that
 * the graph emitted into every `dist/**\/*.html` <head> is BYTE-IDENTICAL to
 * the committed pre-migration snapshot below.
 *
 * Why a hardcoded snapshot (not derived from base-graph.ts): the snapshot is an
 * INDEPENDENT record of the pre-migration `index.html` graph. Deriving the
 * expectation from the same module the pages render from would only prove the
 * pages are self-consistent — it could not detect a regression where someone
 * changed the Person `@id` or reordered/edited `sameAs[]` in the source. Pinning
 * the bytes here means any drift in the live graph fails the build.
 *
 * INVARIANCE CONTRACT:
 *   - Person `@id` MUST stay `https://www.cloudcertprep.io/#author`.
 *   - Person `sameAs[]` MUST be preserved verbatim (the Credly badge URL is now
 *     part of the locked list). Additive entity enrichments applied in the
 *     entity-head bundle (Organization.logo/foundingDate/contactPoint,
 *     Person.worksFor/hasCredential, and the knowsAbout Thing objects) are part
 *     of the snapshot below. Any further edit MUST update BOTH
 *     `src/lib/base-graph.ts` AND the matching snapshot string below in the same
 *     commit; any other drift is a build-failing regression.
 *
 * Exits non-zero (fails the build) on any drift or any page missing a node.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')

// --- Pre-migration snapshot: the exact <script> bodies emitted for the three
// base-graph nodes. Serialized by JSON.stringify (no whitespace), matching the
// SchemaOrgJsonLd.astro emitter. These bytes are the contract. ---
const SNAPSHOT = Object.freeze({
  WebSite:
    '{"@context":"https://schema.org","@type":"WebSite","name":"CloudCertPrep","alternateName":"Free open-source AWS certification practice exams","url":"https://www.cloudcertprep.io/","description":"Free, open-source AWS certification practice exams with full-length mock exams, domain practice, adaptive spaced repetition, and progress tracking. MIT licensed.","inLanguage":"en","author":{"@id":"https://www.cloudcertprep.io/#author"},"publisher":{"@id":"https://www.cloudcertprep.io/#organization"}}',
  Organization:
    '{"@context":"https://schema.org","@type":"Organization","@id":"https://www.cloudcertprep.io/#organization","name":"CloudCertPrep","url":"https://www.cloudcertprep.io/","description":"Free, open-source cloud certification practice exam platform. MIT licensed, no ads, no paywalls.","foundingDate":"2026","logo":{"@type":"ImageObject","url":"https://www.cloudcertprep.io/icon-512.png","width":512,"height":512},"founder":{"@id":"https://www.cloudcertprep.io/#author"},"contactPoint":{"@type":"ContactPoint","contactType":"customer support","email":"alex@cloudcertprep.io"},"sameAs":["https://github.com/nastaso/cloudcertprep","https://ko-fi.com/alexsantonastaso"]}',
  Person:
    '{"@context":"https://schema.org","@type":"Person","@id":"https://www.cloudcertprep.io/#author","name":"Alex Santonastaso","url":"https://santonastaso.me","jobTitle":"Software Engineer","worksFor":{"@id":"https://www.cloudcertprep.io/#organization"},"sameAs":["https://santonastaso.me","https://github.com/nastaso","https://ko-fi.com/alexsantonastaso","https://www.credly.com/badges/a67cce3e-4833-4682-8e9e-314454333667"],"hasCredential":{"@type":"EducationalOccupationalCredential","name":"AWS Certified Cloud Practitioner","credentialCategory":"certification","url":"https://www.credly.com/badges/a67cce3e-4833-4682-8e9e-314454333667"},"knowsAbout":[{"@type":"Thing","name":"AWS Certified Cloud Practitioner (CLF-C02)"},{"@type":"Thing","name":"AWS Certified AI Practitioner (AIF-C01)"},{"@type":"Thing","name":"Amazon Web Services","sameAs":"https://en.wikipedia.org/wiki/Amazon_Web_Services"},{"@type":"Thing","name":"Cloud computing","sameAs":"https://en.wikipedia.org/wiki/Cloud_computing"},{"@type":"Thing","name":"Certification exam preparation"}]}',
})

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

let files
try {
  files = walkHtml(DIST)
} catch {
  fail(`Cannot read ${DIST}. Run \`astro build\` first.`)
}

if (files.length === 0) fail(`No HTML files found under ${DIST}.`)

// Extract every JSON-LD <script> body from a page's <head>.
function headJsonLdBodies(html) {
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i)
  const head = headMatch ? headMatch[0] : html
  const bodies = []
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(head)) !== null) bodies.push(m[1])
  return bodies
}

// Redirect stubs (e.g. /aws → / via meta-refresh, emitted by Astro `redirect`
// routes) are noindex shells with no <head> graph by design — the sister
// internal-graph linter exempts them for the same reason. They carry no
// content and are not subject to the invariance contract.
function isRedirectStub(html) {
  return /<meta\s+http-equiv=["']refresh["']/i.test(html)
}

const violations = []
let checked = 0
let skipped = 0

for (const file of files) {
  const route = '/' + relative(DIST, file).split(sep).join('/')
  const html = readFileSync(file, 'utf8')
  if (isRedirectStub(html)) {
    skipped++
    continue
  }
  const bodies = headJsonLdBodies(html)
  checked++

  for (const [node, expected] of Object.entries(SNAPSHOT)) {
    if (!bodies.includes(expected)) {
      // Surface the closest same-type block to make drift obvious in the log.
      const typeTag = `"@type":"${node}"`
      const drifted = bodies.find((b) => b.includes(typeTag))
      if (drifted) {
        violations.push(
          `${route}: ${node} graph DRIFTED from snapshot.\n      expected: ${expected}\n      actual:   ${drifted}`,
        )
      } else {
        violations.push(`${route}: ${node} graph MISSING from <head>.`)
      }
    }
  }
}

if (violations.length > 0) {
  fail(
    `Person-graph invariance FAILED (Property 5): ${violations.length} violation(s):\n   - ${violations.join('\n   - ')}\n\n` +
      `The platform JSON-LD graph must be byte-identical to the pre-migration snapshot on every page.\n` +
      `If this change is intentional (e.g. the Credly badge addition in task 7.4), update both\n` +
      `src/lib/base-graph.ts and the SNAPSHOT in scripts/check-person-graph.mjs in the same commit.`,
  )
}

console.log(
  `\n✅ Person-graph invariance PASSED: WebSite + Organization + Person byte-identical to snapshot across all ${checked} prerendered page(s)` +
    (skipped ? ` (${skipped} redirect stub(s) skipped).` : '.'),
)
