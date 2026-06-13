import { describe, it, expect } from 'vitest'
import {
  fisherYatesShuffle,
  toggleMultiAnswer,
  toOriginalAnswer,
  shuffleQuestionOptions,
  getQuestionType,
  matchesToTokens,
  toOriginalMatchTokens,
  encodeAnswerForDb,
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

  it('remaps an ordering correctOrder so the step-text sequence is preserved', () => {
    const ordering: Question = {
      ...baseQuestion,
      answer: '',
      type: 'ordering',
      options: { A: 'first', B: 'second', C: 'third', D: 'fourth', E: '' },
      correctOrder: ['A', 'B', 'C', 'D'],
    }
    const { question } = shuffleQuestionOptions(ordering)
    // Reading correctOrder against the shuffled options must yield the same
    // ordered list of step texts as the original.
    const originalTexts = ordering.correctOrder!.map(k => ordering.options[k as keyof typeof ordering.options])
    const shuffledTexts = question.correctOrder!.map(k => question.options[k as keyof typeof question.options])
    expect(shuffledTexts).toEqual(originalTexts)
  })

  it('remaps matching correctMatches keys so each left keeps its correct target', () => {
    const matching: Question = {
      ...baseQuestion,
      answer: '',
      type: 'matching',
      options: { A: 'left-a', B: 'left-b', C: 'left-c', D: '', E: '' },
      targets: { '1': 'r1', '2': 'r2', '3': 'r3' },
      correctMatches: { A: '2', B: '3', C: '1' },
    }
    const { question } = shuffleQuestionOptions(matching)
    // Targets are not shuffled; each left text must still map to its target key.
    for (const [origKey, targetKey] of Object.entries(matching.correctMatches!)) {
      const leftText = matching.options[origKey as keyof typeof matching.options]
      const displayKey = Object.keys(question.options).find(
        k => question.options[k as keyof typeof question.options] === leftText,
      )!
      expect(question.correctMatches![displayKey]).toBe(targetKey)
    }
  })
})

describe('getQuestionType', () => {
  it('infers single/multi from isMultiAnswer when type is absent', () => {
    expect(getQuestionType({ isMultiAnswer: false })).toBe('single')
    expect(getQuestionType({ isMultiAnswer: true })).toBe('multi')
  })

  it('uses the explicit type when present', () => {
    expect(getQuestionType({ isMultiAnswer: false, type: 'ordering' })).toBe('ordering')
    expect(getQuestionType({ isMultiAnswer: false, type: 'matching' })).toBe('matching')
  })
})

describe('matchesToTokens', () => {
  it('serialises a match map to sorted K:T tokens', () => {
    expect(matchesToTokens({ B: '2', A: '3', C: '1' })).toEqual(['A:3', 'B:2', 'C:1'])
  })
})

describe('toOriginalMatchTokens', () => {
  const keyMap = { A: 'C', B: 'A', C: 'B' } // display -> original

  it('remaps only the left option key, keeping the target key', () => {
    expect(toOriginalMatchTokens(['A:3', 'B:2', 'C:1'], keyMap)).toEqual(['A:2', 'B:1', 'C:3'])
  })
})

describe('encodeAnswerForDb', () => {
  const keyMap = { A: 'C', B: 'A', C: 'B', D: 'D' } // display -> original

  it('encodes a single answer', () => {
    expect(encodeAnswerForDb('A', keyMap, 'single')).toBe('C')
  })

  it('encodes a multi answer as a comma list', () => {
    expect(encodeAnswerForDb(['A', 'B'], keyMap, 'multi')).toBe('C,A')
  })

  it('encodes an ordering sequence as a comma list', () => {
    expect(encodeAnswerForDb(['A', 'B', 'C', 'D'], keyMap, 'ordering')).toBe('C,A,B,D')
  })

  it('encodes matching tokens, remapping only left keys', () => {
    expect(encodeAnswerForDb(['A:3', 'B:2'], keyMap, 'matching')).toBe('A:2,C:3')
  })

  it('encodes a null/empty answer to an empty string', () => {
    expect(encodeAnswerForDb(null, keyMap, 'single')).toBe('')
    expect(encodeAnswerForDb(null, keyMap, 'matching')).toBe('')
  })
})
