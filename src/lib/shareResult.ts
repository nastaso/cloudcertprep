import { SITE_URL } from './seo-data'

/**
 * Share-text builders for the exam results screen (Growth Build 1, phase 1).
 * Pure and unit-tested. Two hard rules from the growth findings:
 *  - the shared link is always the bare site URL: score data never rides in
 *    URL params (keeps the citation-guard surface and cache behavior clean);
 *  - nothing celebratory, and no pass/fail language or scaled score, is ever
 *    built for a failed attempt. The fail variant is a neutral study-notes
 *    breakdown.
 */

export interface PassShareInput {
  certShortName: string
  scaledScore: number
  correctCount: number
  totalQuestions: number
}

/** Celebratory share text. Callers must gate on `passed`. */
export function buildPassShareText(input: PassShareInput): string {
  return (
    `I scored ${input.scaledScore}/1000 on the ${input.certShortName} practice exam ` +
    `at CloudCertPrep (${input.correctCount}/${input.totalQuestions} correct). ` +
    `Free + open source: ${SITE_URL}`
  )
}

export interface FailBreakdownInput {
  certShortName: string
  correctCount: number
  totalQuestions: number
  /** Domain name + this exam's per-domain percent, in display order. */
  domains: Array<{ name: string; percent: number }>
}

/**
 * Neutral per-domain breakdown for a failed attempt, meant as self-study
 * notes rather than a brag. Deliberately omits the scaled score and any
 * pass/fail wording.
 */
export function buildFailBreakdownText(input: FailBreakdownInput): string {
  const lines = input.domains.map(d => `${d.name}: ${d.percent}%`)
  return [
    `${input.certShortName} practice exam domain breakdown (CloudCertPrep):`,
    ...lines,
    `Overall: ${input.correctCount}/${input.totalQuestions} correct. Free practice: ${SITE_URL}`,
  ].join('\n')
}
