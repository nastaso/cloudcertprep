import { describe, it, expect } from 'vitest'
import {
  selectQuestions,
  type MasteryRow,
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
