import type { Question, QuestionType } from '../types'
import type { Certification } from '../data/certifications'
import { fisherYatesShuffle, getQuestionType, matchesToTokens } from './utils'
import { MIN_VALID_EXAM_SECONDS } from './constants'

/**
 * Calculate AWS scaled score (100-1000 range)
 * AWS uses a scaled scoring system where:
 * - Minimum score: 100
 * - Maximum score: 1000
 * The passing threshold is per-cert (see `Certification.passingScore`); use
 * `isPassed` to test against it.
 */
export function calculateScaledScore(correct: number, total: number): number {
  const rawPercent = correct / total
  const scaled = Math.round(100 + rawPercent * 900)
  return Math.min(1000, Math.max(100, scaled))
}

/**
 * Determine if the exam was passed
 * Pass threshold varies by certification (CLF-C02: 700, AIF-C01: 700, SAA-C03: 720)
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
 * The correct-answer value to compare a user's answer against, in whatever key
 * space `q` is currently in (original bank keys, or shuffled display keys if it
 * went through `shuffleQuestionOptions`). Single/multi use `answer`; ordering
 * uses `correctOrder`; matching is encoded to comparable `K:T` tokens. Pair with
 * `getQuestionType(q)` when calling `isAnswerCorrect`.
 */
export function correctAnswerFor(q: Question): string | string[] {
  switch (getQuestionType(q)) {
    case 'ordering':
      return q.correctOrder ?? []
    case 'matching':
      return matchesToTokens(q.correctMatches ?? {})
    default:
      return q.answer
  }
}

/**
 * All-or-nothing correctness across every question format (AWS grades these
 * formats with no partial credit, matching the boolean `is_correct` model that
 * scaled score + domain mastery derive from).
 *
 * The third argument accepts a `boolean` (legacy `isMultiAnswer`, kept so the
 * single/multi call sites and their tests need no change) OR an explicit
 * `QuestionType`. Comparison by type:
 * - single   : strict string equality.
 * - multi    : set equality (order-independent).
 * - matching : set equality over `K:T` tokens (order-independent, same logic as multi).
 * - ordering : positional array equality (order-DEPENDENT).
 */
export function isAnswerCorrect(
  userAnswer: string | string[],
  correctAnswer: string | string[],
  typeOrMulti: boolean | QuestionType
): boolean {
  const type: QuestionType = typeof typeOrMulti === 'boolean'
    ? (typeOrMulti ? 'multi' : 'single')
    : typeOrMulti

  if (type === 'ordering') {
    // Order-dependent: same elements in the same positions.
    if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) return false
    if (userAnswer.length !== correctAnswer.length) return false
    return userAnswer.every((ans, idx) => ans === correctAnswer[idx])
  }

  if (type === 'multi' || type === 'matching') {
    // Set equality. Matching tokens (`A:3`) bind left to right, so order of the
    // tokens does not matter, exactly like a multi-answer selection set.
    if (!Array.isArray(userAnswer) || !Array.isArray(correctAnswer)) return false
    if (userAnswer.length !== correctAnswer.length) return false
    const sortedUser = [...userAnswer].sort()
    const sortedCorrect = [...correctAnswer].sort()
    return sortedUser.every((ans, idx) => ans === sortedCorrect[idx])
  }

  // Single answer: simple string comparison.
  return userAnswer === correctAnswer
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

/**
 * Derive the persisted/displayed exam duration and the "too short to save" flag
 * from wall-clock timestamps, defended against a non-monotonic `Date.now()`
 * (device sleep/suspend, NTP or manual clock jumps) corrupting the result.
 *
 * - `timeTaken` is clamped to `[0, examTimeSeconds]`, so a FORWARD jump (waking a
 *   suspended laptop) can no longer inflate the saved/shown time past the exam
 *   length, and a BACKWARD jump can no longer go negative.
 * - `isTooShort` is true only for a genuine sub-minute run (raw elapsed in
 *   `[0, MIN_VALID_EXAM_SECONDS)`). A NEGATIVE raw elapsed signals the clock
 *   moved backward on an otherwise-complete attempt, so it is NOT classified as
 *   too short - the attempt is still saved rather than silently discarded.
 *
 * See EDGE-CASE-FINDINGS-2026-06-28: exam-timer-wallclock-sleep-clockjump.
 */
export function computeExamTiming(
  startTimeMs: number,
  nowMs: number,
  examTimeSeconds: number,
): { timeTaken: number; isTooShort: boolean } {
  const rawElapsed = Math.floor((nowMs - startTimeMs) / 1000)
  const timeTaken = Math.min(Math.max(0, rawElapsed), examTimeSeconds)
  const isTooShort = rawElapsed >= 0 && rawElapsed < MIN_VALID_EXAM_SECONDS
  return { timeTaken, isTooShort }
}
