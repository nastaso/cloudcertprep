import { getCertDomainCounts, DEFAULT_CERT_ID } from '../data/certifications'

/**
 * Calculate domain mastery as coverage percentage based on correct answers.
 * Mastery = (questionsCorrect / totalQuestionsInDomain) * 100
 */
export function calculateDomainMastery(
  questionsCorrect: number,
  domainId: number,
  certCode: string = DEFAULT_CERT_ID
): number {
  const counts = getCertDomainCounts(certCode)
  const total = counts[domainId]
  if (!total) return 0
  return Math.round((questionsCorrect / total) * 100)
}
