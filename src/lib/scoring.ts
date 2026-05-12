import type { Question } from '../types'
import type { Certification } from '../data/certifications'
import { fisherYatesShuffle } from './utils'

/**
 * Calculate AWS scaled score (100-1000 range)
 * AWS uses a scaled scoring system where:
 * - Minimum score: 100
 * - Maximum score: 1000
 * - Passing score: 700
 */
export function calculateScaledScore(correct: number, total: number): number {
  const rawPercent = correct / total
  const scaled = Math.round(100 + rawPercent * 900)
  return Math.min(1000, Math.max(100, scaled))
}

/**
 * Determine if the exam was passed
 * Pass threshold varies by certification (CLF-C02: 700, SAA-C03: 720)
 */
export function isPassed(scaledScore: number, passingScore: number): boolean {
  return scaledScore >= passingScore
}

/**
 * Calculate score for a specific domain
 */
export function getDomainScore(
  results: { domainId: number; isCorrect: boolean }[],
  domainId: number
): number {
  const domainQs = results.filter(q => q.domainId === domainId)
  if (domainQs.length === 0) return 0
  const correct = domainQs.filter(q => q.isCorrect).length
  return Math.round((correct / domainQs.length) * 100)
}

/**
 * Calculate per-domain question targets for an exam.
 * Uses remainder algorithm to guarantee exact total (e.g., 65 questions).
 * Returns a map of domain ID to question count.
 */
export function getExamDomainTargets(cert: Certification): Record<number, number> {
  const targets: Record<number, number> = {}
  let assigned = 0

  cert.domains.forEach((domain, i) => {
    if (i === cert.domains.length - 1) {
      // Last domain gets the remainder to guarantee exact total
      targets[domain.id] = cert.examQuestionCount - assigned
    } else {
      const count = Math.round(cert.examQuestionCount * domain.examProportion)
      targets[domain.id] = count
      assigned += count
    }
  })

  return targets
}

/**
 * Select questions for a mock exam based on the certification's domain proportions.
 * Domain breakdown is derived from cert config (no hardcoded values).
 */
export function selectExamQuestions(allQuestions: Question[], cert: Certification): Question[] {
  const targets = getExamDomainTargets(cert)
  const selected: Question[] = []

  for (const [domainId, count] of Object.entries(targets)) {
    const domainQs = fisherYatesShuffle(
      allQuestions.filter(q => q.domainId === Number(domainId))
    ).slice(0, count)

    selected.push(...domainQs)
  }

  return fisherYatesShuffle(selected)
}

/**
 * Format seconds into MM:SS format
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Format seconds into human-readable duration
 * e.g., "45 minutes 30 seconds"
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`
  }
  
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }
  
  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`
}

export function isAnswerCorrect(
  userAnswer: string | string[],
  correctAnswer: string | string[],
  isMultiAnswer: boolean
): boolean {
  if (isMultiAnswer) {
    // Multi-answer: both arrays must match (order doesn't matter)
    if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) {
      return false
    }
    
    if (userAnswer.length !== correctAnswer.length) {
      return false
    }
    
    const sortedUser = [...userAnswer].sort()
    const sortedCorrect = [...correctAnswer].sort()
    
    return sortedUser.every((ans, idx) => ans === sortedCorrect[idx])
  } else {
    // Single answer: simple string comparison
    return userAnswer === correctAnswer
  }
}

/**
 * Format total minutes into compact "Xh Ym" display
 */
export function formatTotalTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}
