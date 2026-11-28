import { describe, it, expect } from 'vitest'
import {
  selectQuestions,
  computeDueCounts,
  type MasteryRow,
  type DueCountRow,
} from './spacedRepetition'
import type { Question } from '../types'

const makeQuestion = (id: string): Question => ({
  id,
  domainId: 1,
  question: `Question ${id}`,
  options: {
    A: 'Option A',
    B: 'Option B',
    C: 'Option C',
    D: 'Option D',
    E: '',
  },
  answer: 'A',
  explanation: '',
  isMultiAnswer: false,
})

const makeMasteryRow = (
  questionId: string,
  weight: number | null,
  lastSeenAt = '2026-01-01T00:00:00Z',
): MasteryRow => ({
  question_id: questionId,
  correct_streak: 0,
  last_was_wrong: false,
  last_seen_at: lastSeenAt,
  is_mastered: false,
  in_exclusion_window: false,
  weight,
})

describe('selectQuestions', () => {
  it('returns a subset of the input for guest users', () => {
    const questions = [
      makeQuestion('q1'),
      makeQuestion('q2'),
      makeQuestion('q3'),
      makeQuestion('q4'),
    ]

    const result = selectQuestions(
      questions,
      2,
      new Map(),
      null,
    )

    expect(result).toHaveLength(2)

    for (const question of result) {
      expect(
        questions.some(q => q.id === question.id),
      ).toBe(true)
    }
  })

  it('reserves unseen questions when available', () => {
    const questions = [
      makeQuestion('q1'),
      makeQuestion('q2'),
      makeQuestion('q3'),
      makeQuestion('q4'),
      makeQuestion('q5'),
    ]

    const masteryMap = new Map<string, MasteryRow>([
      ['q1', makeMasteryRow('q1', 1)],
      ['q2', makeMasteryRow('q2', 1)],
      ['q3', makeMasteryRow('q3', 1)],
    ])

    const result = selectQuestions(
      questions,
      5,
      masteryMap,
      'user-1',
    )

    const unseenCount = result.filter(
      question => !masteryMap.has(question.id),
    ).length

    // ceil(5 * 0.2) = 1
    expect(unseenCount).toBeGreaterThanOrEqual(1)
  })

  it('uses excluded questions as backfill when active questions are insufficient', () => {
    const questions = [
      makeQuestion('q1'),
      makeQuestion('q2'),
      makeQuestion('q3'),
      makeQuestion('q4'),
    ]

    const masteryMap = new Map<string, MasteryRow>([
      ['q1', makeMasteryRow('q1', 1)],
      ['q2', makeMasteryRow('q2', 1)],
      ['q3', makeMasteryRow('q3', null, '2025-01-01T00:00:00Z')],
      ['q4', makeMasteryRow('q4', null, '2025-01-02T00:00:00Z')],
    ])

    const result = selectQuestions(
      questions,
      4,
      masteryMap,
      'user-1',
    )

    const ids = result.map(question => question.id)

    expect(ids).toContain('q3')
    expect(ids).toContain('q4')
    expect(result).toHaveLength(4)
  })

  it('never returns duplicate questions', () => {
    const questions = [
      makeQuestion('q1'),
      makeQuestion('q2'),
      makeQuestion('q3'),
      makeQuestion('q4'),
      makeQuestion('q5'),
    ]

    const masteryMap = new Map<string, MasteryRow>([
      ['q1', makeMasteryRow('q1', 1)],
      ['q2', makeMasteryRow('q2', 2)],
      ['q3', makeMasteryRow('q3', 3)],
    ])

    const result = selectQuestions(
      questions,
      5,
      masteryMap,
      'user-1',
    )

    const ids = result.map(question => question.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('computeDueCounts', () => {
  const row = (
    over: Partial<DueCountRow> = {},
  ): DueCountRow => ({
    is_mastered: false,
    last_was_wrong: false,
    in_exclusion_window: false,
    ...over,
  })

  it('returns zero for no rows (new user)', () => {
    expect(computeDueCounts([])).toEqual({
      dueForReview: 0,
      missedReadyToRetry: 0,
    })
  })

  it('counts a seen, un-mastered, cooled-down row as due', () => {
    expect(computeDueCounts([row()])).toEqual({
      dueForReview: 1,
      missedReadyToRetry: 0,
    })
  })

  it('excludes rows still in their cooldown (exclusion) window', () => {
    const counts = computeDueCounts([
      row({ in_exclusion_window: true }),
      row({ in_exclusion_window: true, last_was_wrong: true }),
    ])
    expect(counts).toEqual({ dueForReview: 0, missedReadyToRetry: 0 })
  })

  it('excludes mastered rows even when their last answer was wrong', () => {
    const counts = computeDueCounts([
      row({ is_mastered: true }),
      row({ is_mastered: true, last_was_wrong: true }),
    ])
    expect(counts).toEqual({ dueForReview: 0, missedReadyToRetry: 0 })
  })

  it('counts a last-wrong, cooled-down row as both due and missed', () => {
    expect(computeDueCounts([row({ last_was_wrong: true })])).toEqual({
      dueForReview: 1,
      missedReadyToRetry: 1,
    })
  })

  it('missedReadyToRetry is a subset of dueForReview on a mixed set', () => {
    const counts = computeDueCounts([
      row({ last_was_wrong: true }), // due + missed
      row(), // due only
      row({ last_was_wrong: true }), // due + missed
      row({ in_exclusion_window: true, last_was_wrong: true }), // cooling down
      row({ is_mastered: true }), // locked in
    ])
    expect(counts).toEqual({ dueForReview: 3, missedReadyToRetry: 2 })
    expect(counts.missedReadyToRetry).toBeLessThanOrEqual(counts.dueForReview)
  })

  it('accepts full MasteryRow shapes (extra columns ignored)', () => {
    const full: MasteryRow = {
      question_id: 'q1',
      correct_streak: 0,
      last_was_wrong: true,
      last_seen_at: '2026-01-01T00:00:00Z',
      is_mastered: false,
      in_exclusion_window: false,
      weight: 5,
    }
    expect(computeDueCounts([full])).toEqual({
      dueForReview: 1,
      missedReadyToRetry: 1,
    })
  })
})
