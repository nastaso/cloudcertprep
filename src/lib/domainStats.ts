import { getCertDomainCounts, DEFAULT_CERT_ID } from '../data/certifications'

/**
 * Calculate domain mastery as coverage percentage based on correct answers.
 * Mastery = (questionsCorrect / totalQuestionsInDomain) * 100
 *
 * Clamped to 100: historical attempt rows can reference questions that were
 * later removed from the bank, so a stale numerator must never render >100%.
 * The clamp is defensive; the real fix is the bank intersection in
 * updateDomainProgress.
 */
export function calculateDomainMastery(
  questionsCorrect: number,
  domainId: number,
  certCode: string = DEFAULT_CERT_ID
): number {
  const counts = getCertDomainCounts(certCode)
  const total = counts[domainId]
  if (!total) return 0
  return Math.min(100, Math.round((questionsCorrect / total) * 100))
}
