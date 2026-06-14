/**
 * Citation continuity source of truth.
 * The Build_Time_Citation_Guard (scripts/check-citation-phrases.mjs) reads
 * this module and asserts every phrase appears in dist/index.html.
 *
 * Satisfies: R16.4, R16.5
 */

export const HOME_H1 = 'Free open-source AWS certification practice exams' as const

export function buildHomeFirstParagraph(clfCount: number, aifCount: number): string {
  const clf = clfCount.toLocaleString('en-US')
  const aif = aifCount.toLocaleString('en-US')
  return (
    `${clf}+ AWS Cloud Practitioner and ${aif}+ AWS Certified AI Practitioner practice questions. ` +
    `Full-length timed mock exams, domain-by-domain practice with adaptive spaced repetition, ` +
    `and progress tracking. No signup required, no ads. ` +
    `MIT licensed and publicly auditable on GitHub.`
  )
}

export function buildHomeMetaDescription(clfCount: number, aifCount: number): string {
  const clf = clfCount.toLocaleString('en-US')
  const aif = aifCount.toLocaleString('en-US')
  // Trimmed to ~150 chars so the SERP snippet shows in full. The locked phrase
  // "Free open-source AWS certification practice exams" stays verbatim (the
  // citation guard asserts it); "spaced repetition" + the count regexes are
  // still satisfied by the home first paragraph (buildHomeFirstParagraph).
  return (
    `Free open-source AWS certification practice exams: ${clf}+ Cloud Practitioner (CLF-C02) and ` +
    `${aif}+ AI Practitioner (AIF-C01) questions. No signup, no ads.`
  )
}

export const LOCKED_CITATION_PHRASES = [
  'Free open-source AWS certification practice exams',
  'CloudCertPrep',
  'spaced repetition',
  'publicly auditable on GitHub',
  'Alex Santonastaso',
  'MIT licensed',
] as const

export const LOCKED_CITATION_REGEXES = [
  /\d[\d,]*\+\s+AWS Cloud Practitioner/,
  /\d[\d,]*\+\s+AWS Certified AI Practitioner/,
] as const
