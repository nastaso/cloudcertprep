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

/** One domain's standing, fed to `findNextDomainAction`. */
export interface DomainStanding {
  domainId: number
  /** Display percent for this domain (bank mastery or exam accuracy). */
  percent: number
  /** False when the user has never answered a question in this domain. */
  practiced: boolean
}

export type NextDomainAction =
  | { kind: 'unstarted'; domainId: number }
  | { kind: 'weakest'; domainId: number; percent: number }

/**
 * Pick the single next domain to practice (Growth Build 2 / H2).
 * The semantics live here, in one tested place, because mastery is bank
 * coverage: every untouched domain scores 0, so a naive argmin would always
 * point at whatever the user has not started and call it "weakest". Rules:
 * an unstarted domain (first in input order) wins and must be phrased
 * "you have not practiced X yet", never "weakest"; otherwise the
 * lowest-percent practiced domain is the honest weakest (first wins ties).
 */
export function findNextDomainAction(standings: DomainStanding[]): NextDomainAction | null {
  if (standings.length === 0) return null
  const unstarted = standings.find(s => !s.practiced)
  if (unstarted) return { kind: 'unstarted', domainId: unstarted.domainId }
  let weakest = standings[0]
  for (const s of standings) {
    if (s.percent < weakest.percent) weakest = s
  }
  return { kind: 'weakest', domainId: weakest.domainId, percent: weakest.percent }
}
