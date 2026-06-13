#!/usr/bin/env node
/**
 * Build_Time_Citation_Guard (R16.2, R16.3, R16.10) + production --url mode (R19.1)
 *
 * Default: reads dist/index.html after `astro build` and asserts every
 * Locked_Citation_Phrase from src/lib/citation-content.ts is present.
 *
 * With `--url <productionUrl>`: fetches the live production HTML over HTTPS
 * instead of reading dist/index.html, then runs the IDENTICAL assertion path.
 * The assertion logic is factored into a single shared function so the
 * build-time and production checks can never drift. (R19.1)
 *
 * - Strips ONLY <script> and <style> blocks (so JSON-LD / CSS can't satisfy
 *   the assertions), keeping <head> meta (title, meta description) AND body.
 * - Each LOCKED_CITATION_PHRASES literal must be present (String.includes).
 * - Each LOCKED_CITATION_REGEXES pattern must match (RegExp.test).
 * - The <h1> text must contain HOME_H1.
 * - Emits .astro/citation-phrase-report.json (dist mode only; .astro/ is
 *   gitignored and never deployed, so the internal QA report stays private).
 * - Exits non-zero with a per-violation report on any miss.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST_INDEX = resolve(ROOT, 'dist/index.html')
const CITATION_SRC = resolve(ROOT, 'src/lib/citation-content.ts')

function fail(msg) {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

// --- Parse the locked phrase/regex/H1 definitions from citation-content.ts ---
function parseCitationRules() {
  const src = readFileSync(CITATION_SRC, 'utf8')

  const h1Match = src.match(/HOME_H1\s*=\s*'([^']+)'/)
  if (!h1Match) fail('Could not parse HOME_H1 from citation-content.ts')
  const HOME_H1 = h1Match[1]

  const phrasesBlock = src.match(/LOCKED_CITATION_PHRASES\s*=\s*\[([\s\S]*?)\]\s*as const/)
  if (!phrasesBlock) fail('Could not parse LOCKED_CITATION_PHRASES from citation-content.ts')
  const LOCKED_CITATION_PHRASES = [...phrasesBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1])

  const regexBlock = src.match(/LOCKED_CITATION_REGEXES\s*=\s*\[([\s\S]*?)\]\s*as const/)
  const LOCKED_CITATION_REGEXES = regexBlock
    ? [...regexBlock[1].matchAll(/\/((?:[^/\\]|\\.)+)\/([a-z]*)/g)].map(m => new RegExp(m[1], m[2]))
    : []

  return { HOME_H1, LOCKED_CITATION_PHRASES, LOCKED_CITATION_REGEXES }
}

/**
 * Run every Locked_Citation_Phrase assertion against an HTML string. Shared by
 * the dist-file path and the --url production path so they cannot drift.
 * Returns { report, violations }.
 */
function assertCitations(html, rules) {
  const { HOME_H1, LOCKED_CITATION_PHRASES, LOCKED_CITATION_REGEXES } = rules

  const searchable = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  const headMatch = html.match(/<head[\s\S]*?<\/head>/i)
  const headText = (headMatch ? headMatch[0] : '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
  const bodyText = (bodyMatch ? bodyMatch[0] : searchable)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')

  const report = []
  const violations = []

  for (const phrase of LOCKED_CITATION_PHRASES) {
    const inHead = headText.includes(phrase)
    const inBody = bodyText.includes(phrase)
    const present = inHead || inBody
    const location = present ? (inBody ? 'visible-body' : 'head-meta') : null
    report.push({ phrase, kind: 'literal', present, location })
    if (present) console.log(`✅ literal: "${phrase}" (${location})`)
    else {
      console.error(`❌ MISSING literal: "${phrase}"`)
      violations.push(phrase)
    }
  }

  for (const re of LOCKED_CITATION_REGEXES) {
    const present = re.test(searchable)
    report.push({ phrase: re.source, kind: 'regex', present, location: present ? 'searchable' : null })
    if (present) console.log(`✅ regex: /${re.source}/`)
    else {
      console.error(`❌ MISSING regex: /${re.source}/`)
      violations.push(`/${re.source}/`)
    }
  }

  const pageH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1Text = pageH1 ? pageH1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
  const h1Ok = h1Text.includes(HOME_H1)
  report.push({ phrase: `H1 contains: ${HOME_H1}`, kind: 'h1', present: h1Ok, location: h1Ok ? 'visible-body' : null })
  if (h1Ok) console.log(`✅ H1 contains: "${HOME_H1}"`)
  else {
    console.error(`❌ H1 mismatch. Expected to contain "${HOME_H1}", got "${h1Text}"`)
    violations.push(`H1: ${HOME_H1}`)
  }

  return { report, violations }
}

async function main() {
  const args = process.argv.slice(2)
  const urlIdx = args.indexOf('--url')
  const liveUrl = urlIdx !== -1 ? args[urlIdx + 1] : null

  const rules = parseCitationRules()

  let html
  let source
  if (liveUrl) {
    source = liveUrl
    try {
      const res = await fetch(liveUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
      if (!res.ok) fail(`Fetch of ${liveUrl} returned HTTP ${res.status}`)
      html = await res.text()
    } catch (e) {
      fail(`Could not fetch ${liveUrl}: ${e.message}`)
    }
  } else {
    source = DIST_INDEX
    try {
      html = readFileSync(DIST_INDEX, 'utf8')
    } catch {
      fail(`Cannot read ${DIST_INDEX}. Run \`astro build\` first.`)
    }
  }

  const { report, violations } = assertCitations(html, rules)

  // The on-disk report only makes sense for the dist build.
  if (!liveUrl) {
    try {
      writeFileSync(resolve(ROOT, '.astro/citation-phrase-report.json'), JSON.stringify(report, null, 2))
    } catch (e) {
      console.warn(`⚠️  Could not write report: ${e.message}`)
    }
  }

  if (violations.length > 0) {
    fail(`Citation guard FAILED for ${source}: ${violations.length} missing phrase(s):\n   - ${violations.join('\n   - ')}`)
  }

  console.log(`\n✅ Citation guard PASSED: all ${report.length} checks present in ${source}`)
}

main()

