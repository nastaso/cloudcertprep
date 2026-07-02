import { SITE_URL } from './seo-data'

/**
 * Share-text builder for the exam results screen (Growth Build 1, phase 1).
 * Pure and unit-tested. Hard rule from the growth findings: the shared link
 * is always the bare site URL, score data never rides in URL params (keeps
 * the citation-guard surface and cache behavior clean).
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
