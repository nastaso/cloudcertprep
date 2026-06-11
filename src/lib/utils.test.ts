import { describe, it, expect } from 'vitest'
import {
  fisherYatesShuffle,
  toggleMultiAnswer,
  toOriginalAnswer,
  shuffleQuestionOptions,
} from './utils'
import type { Question } from '../types'

describe('fisherYatesShuffle', () => {
  it('preserves length', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = fisherYatesShuffle(arr)
    expect(shuffled).toHaveLength(arr.length)
  })

  it('preserves the set of elements (no loss, no duplication)', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = fisherYatesShuffle(arr)
    expect(shuffled.sort()).toEqual([...arr].sort())
  })

  it('does not mutate the input array', () => {
    const arr = [1, 2, 3, 4, 5]
    const snapshot = [...arr]
    fisherYatesShuffle(arr)
    expect(arr).toEqual(snapshot)
  })

  it('handles empty and single-element arrays', () => {
    expect(fisherYatesShuffle([])).toEqual([])
    expect(fisherYatesShuffle([42])).toEqual([42])
  })
})

describe('toggleMultiAnswer', () => {
  it('adds an unselected answer when below the limit', () => {
    expect(toggleMultiAnswer(['A'], 'B', 2)).toEqual(['A', 'B'])
  })

  it('removes a selected answer (toggle off)', () => {
    expect(toggleMultiAnswer(['A', 'B'], 'A', 2)).toEqual(['B'])
  })

  it('refuses to add when the maximum is reached', () => {
    expect(toggleMultiAnswer(['A', 'B'], 'C', 2)).toEqual(['A', 'B'])
  })

  it('still allows toggling off when at the maximum', () => {
    // Removing should always work, even when at limit.
    expect(toggleMultiAnswer(['A', 'B'], 'A', 2)).toEqual(['B'])
  })

  it('handles starting from an empty selection', () => {
    expect(toggleMultiAnswer([], 'A', 2)).toEqual(['A'])
  })
})

describe('toOriginalAnswer', () => {
  const keyMap = { A: 'C', B: 'A', C: 'B', D: 'D' }

  it('translates a single answer through the key map', () => {
    expect(toOriginalAnswer('A', keyMap)).toBe('C')
  })

  it('translates a multi-answer array through the key map', () => {
    expect(toOriginalAnswer(['A', 'B'], keyMap)).toEqual(['C', 'A'])
  })

  it('returns empty string for empty single answer', () => {
    expect(toOriginalAnswer('', keyMap)).toBe('')
  })

  it('falls through unmapped keys (defensive default)', () => {
    expect(toOriginalAnswer('Z', keyMap)).toBe('Z')
  })
})

describe('shuffleQuestionOptions', () => {
  const baseQuestion: Question = {
    id: 'q1',
    domainId: 1,
    question: 'Sample',
    // Question type requires all 5 OptionKey values; E is empty for 4-option
    // questions (validate-questions.mjs filters out empty options at runtime).
    options: { A: 'apple', B: 'banana', C: 'cherry', D: 'date', E: '' },
    answer: 'B',
    explanation: '',
    isMultiAnswer: false,
  }

  it('keeps the same set of non-empty option values, just possibly reordered', () => {
    const { question } = shuffleQuestionOptions(baseQuestion)
    // Filter out the empty E slot the Question type requires (see fixture comment).
    const values = Object.values(question.options).filter(v => v !== '').sort()
    expect(values).toEqual(['apple', 'banana', 'cherry', 'date'])
  })

  it('produces a key map that round-trips correctly', () => {
    const { question, keyMap } = shuffleQuestionOptions(baseQuestion)
    // The display answer points at the same value the user originally would pick.
    const displayAnswerKey = question.answer as string
    const originalKey = keyMap[displayAnswerKey]
    expect(baseQuestion.options[originalKey as keyof typeof baseQuestion.options]).toBe('banana')
  })

  it('handles multi-answer questions', () => {
    const multi: Question = {
      ...baseQuestion,
      answer: ['A', 'C'],
      isMultiAnswer: true,
    }
    const { question } = shuffleQuestionOptions(multi)
    expect(Array.isArray(question.answer)).toBe(true)
    expect((question.answer as string[]).length).toBe(2)
  })
})
