/**
 * Per-domain keyword helpers for the 9 Domain_Landing pages.
 *
 * Each Domain_Landing targets a primary keyword woven into its title, meta
 * description, H1, first paragraph, and at least one H2. This module derives
 * that keyword from the domain NAME (e.g. "Cloud Concepts" ->
 * "cloud concepts practice questions") and provides the title/sentence casing
 * helpers the templates use.
 *
 * NOTE: the hand-tuned, Semrush-derived keyword targeting strategy and the
 * competitor-brand denylist are intentionally NOT in this repository. They are
 * maintainer-only and live outside the build (see `.kiro/seo/`, gitignored).
 * The public build is fully self-contained and deterministic: it depends on
 * nothing private and derives every keyword from the certification registry.
 */

import { CERTIFICATIONS } from './certifications'

export interface KeywordCluster {
  /** The single primary keyword to target in title, meta, H1, intro, an H2. */
  primary: string
  /** Secondary keywords to weave into body copy and H2s. */
  secondary: string[]
  /**
   * Supporting terms allowed in BODY COPY ONLY — never in title/meta. The
   * template never reads this for head metadata.
   */
  body: string[]
}

/**
 * Resolve the keyword cluster for a `(certCode, domainId)` pair. The primary
 * keyword is derived from the domain name; secondary and body lists are empty
 * by default. (The maintainer's tuned strategy is applied out-of-band; see the
 * module header.)
 */
export function getKeywordCluster(certCode: string, domainId: number): KeywordCluster {
  const domainName = CERTIFICATIONS[certCode]?.domains.find(d => d.id === domainId)?.name
  const base = domainName ? domainName.toLowerCase() : 'aws certification'
  return {
    primary: `${base} practice questions`,
    secondary: [],
    body: [],
  }
}

/**
 * Generic exam-prep filler stripped when deriving topical match-tokens from a
 * keyword cluster. These words appear in almost every keyword and carry no
 * topical signal, so they are excluded from the sample-question keyword match.
 */
const GENERIC_KEYWORD_TOKENS = new Set([
  'aws', 'practice', 'questions', 'question', 'exam', 'exams', 'sample', 'samples',
  'test', 'tests', 'certified', 'practitioner', 'certification', 'free', 'cheat',
  'sheet', 'clf', 'c02', 'aif', 'c01', 'saa', 'c03', 'and', 'or', 'the', 'of', 'for', 'to', 'a',
  'in', 'with', 'vs', 'your', 'study',
])

/**
 * Topical keyword tokens for a `(certCode, domainId)` pair, derived from this
 * domain's keyword cluster (primary + secondary + body) plus the domain name.
 * Generic exam-prep filler is stripped so only the topical terms remain (e.g.
 * 'security', 'compliance', 'pricing', 'generative', 'foundation'). Used by the
 * Domain_Landing to pick sample questions that reinforce the page's target
 * keyword. Returns lowercased single-word tokens (length >= 3).
 */
export function getSampleKeywordTerms(certCode: string, domainId: number): string[] {
  const cluster = getKeywordCluster(certCode, domainId)
  const domainName = CERTIFICATIONS[certCode]?.domains.find(d => d.id === domainId)?.name ?? ''
  const phrases = [cluster.primary, ...cluster.secondary, ...cluster.body, domainName]
  const tokens = new Set<string>()
  for (const phrase of phrases) {
    for (const raw of phrase.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 3) continue
      if (GENERIC_KEYWORD_TOKENS.has(raw)) continue
      tokens.add(raw)
    }
  }
  return [...tokens]
}

/**
 * Title-case a keyword for display in a heading or title tag. Lower-cases
 * known initialisms back to upper-case after the naive capitalisation so
 * "aws"/"ai"/"ml"/"aif"/"clf" read correctly. Used by the Domain_Landing
 * template to render a primary keyword inside the H1/title without manual
 * per-entry casing.
 */
const UPPERCASE_TOKENS = new Set(['aws', 'ai', 'ml', 'aif', 'clf', 'c01', 'c02', 'saa', 'c03', 'nacl', 'vpc', 'iam', 'kms'])

/**
 * Lowercase function words that should NOT be capitalised mid-title (standard
 * title-case convention), unless they are the first word.
 */
const LOWERCASE_TITLE_WORDS = new Set([
  'and', 'or', 'the', 'of', 'for', 'to', 'a', 'an', 'in', 'on', 'with', 'vs', 'at', 'by',
])

export function titleCaseKeyword(keyword: string): string {
  // Title-case a single hyphen-joined part, upper-casing known initialisms
  // (so "aif-c01" -> "AIF-C01", "clf-c02" -> "CLF-C02").
  const caseHyphenated = (word: string): string =>
    word
      .split('-')
      .map(part => {
        const lower = part.toLowerCase()
        if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase()
        return part.charAt(0).toUpperCase() + part.slice(1)
      })
      .join('-')

  return keyword
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase()
      // Function words stay lowercase unless they lead the title.
      if (i > 0 && LOWERCASE_TITLE_WORDS.has(lower)) return lower
      if (word.includes('-')) return caseHyphenated(word)
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Fix only the initialisms in a keyword for natural MID-SENTENCE use, leaving
 * every other word lowercase. So "aws cloud concepts practice questions" stays
 * "AWS cloud concepts practice questions" and "aif-c01 questions" becomes
 * "AIF-C01 questions" — correct inside a running sentence where Title Case
 * would look wrong. Used by the Domain_Landing body copy + H2.
 */
export function fixKeywordInitialisms(keyword: string): string {
  const fixToken = (token: string): string => {
    const lower = token.toLowerCase()
    if (UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase()
    return token
  }
  return keyword
    .split(' ')
    .map(word =>
      word.includes('-')
        ? word.split('-').map(fixToken).join('-')
        : fixToken(word),
    )
    .join(' ')
}
