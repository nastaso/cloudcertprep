/**
 * check-readability.mjs — Flesch-Kincaid grade gate for learner-facing prose.
 *
 * Scores the reading intro of every prerendered domain landing page in dist/
 * (the `<section>` between the hero and the task-statement card) plus each
 * page's FAQ answers. Learner copy should sit at or below roughly a US
 * grade-9 reading level: short sentences, common words, active voice. The
 * syllable counter is a heuristic (vowel groups, silent trailing e), which is
 * standard for FK implementations and stable enough to gate on.
 *
 * No dependencies (project rule: no new deps). Run via `npm run check:readability`
 * after a build. Exits 1 when any page exceeds MAX_GRADE.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/aws'
const MAX_GRADE = 9.5

if (!existsSync(DIST)) {
  console.error(`check-readability: ${DIST} not found. Run \`npm run build\` first.`)
  process.exit(1)
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, groups ? groups.length : 1)
}

function fkGrade(text) {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.split(/\s+/).filter(Boolean).length > 1)
  const words = text.split(/\s+/).filter(w => /[a-zA-Z]/.test(w))
  if (sentences.length === 0 || words.length === 0) return null
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Collect every prerendered HTML page under dist/aws (build.format may emit
// either <name>.html or <name>/index.html); the intro-section regex below
// filters to domain landings.
const pages = []
function walk(dir, routeBase) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, `${routeBase}/${entry}`)
    } else if (entry.endsWith('.html')) {
      const route = entry === 'index.html' ? routeBase : `${routeBase}/${entry.replace(/\.html$/, '')}`
      pages.push({ route, file: full })
    }
  }
}
walk(DIST, '/aws')

let failed = false
let checked = 0

for (const { route, file } of pages) {
  const html = readFileSync(file, 'utf8')
  // The domain-landing intro section (prose bump classes are its signature).
  const intro = html.match(/<section class="space-y-4 text-text-muted[^"]*"[\s\S]*?<\/section>/)
  if (!intro) continue
  checked++

  const introGrade = fkGrade(stripTags(intro[0]))
  const faqAnswers = [...html.matchAll(/<details[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g)]
    .map(m => stripTags(m[1]))
    .join(' ')
  const faqGrade = faqAnswers ? fkGrade(faqAnswers) : null

  const parts = [`intro FK ${introGrade.toFixed(1)}`]
  if (faqGrade !== null) parts.push(`faq FK ${faqGrade.toFixed(1)}`)
  const worst = Math.max(introGrade, faqGrade ?? 0)
  const ok = worst <= MAX_GRADE
  if (!ok) failed = true
  console.log(`${ok ? '✓' : '✗'} ${route}: ${parts.join(', ')}${ok ? '' : ` (max ${MAX_GRADE})`}`)
}

if (checked === 0) {
  console.error('check-readability: no domain landing intros found in dist (selector drift?)')
  process.exit(1)
}

if (failed) {
  console.error(`\n✗ readability: at least one page exceeds FK grade ${MAX_GRADE}. Shorten sentences / simplify words.`)
  process.exit(1)
}
console.log(`\n✓ readability: ${checked} domain pages at or below FK grade ${MAX_GRADE}`)
