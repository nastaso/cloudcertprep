import { describe, it, expect } from 'vitest'
import {
  calculateScaledScore,
  isPassed,
  getDomainScore,
  formatTime,
  formatTotalTime,
  isAnswerCorrect,
  correctAnswerFor,
  getExamDomainTargets,
  computeExamTiming,
} from './scoring'
import { MIN_VALID_EXAM_SECONDS } from './constants'
import type { Certification } from '../data/certifications'
import type { Question } from '../types'

describe('calculateScaledScore', () => {
  it('returns 100 when no questions are answered correctly', () => {
    expect(calculateScaledScore(0, 65)).toBe(100)
  })

  it('returns 1000 when all questions are answered correctly', () => {
    expect(calculateScaledScore(65, 65)).toBe(1000)
  })

  it('scales linearly between 100 and 1000', () => {
    // 50% correct -> roughly midpoint of the 100-1000 scale
    expect(calculateScaledScore(33, 65)).toBeCloseTo(557, 0)
  })

  it('clamps to 100 floor even with negative inputs (defensive)', () => {
    expect(calculateScaledScore(-5, 65)).toBe(100)
  })

  it('clamps to 1000 ceiling even with overflowing inputs (defensive)', () => {
    expect(calculateScaledScore(70, 65)).toBe(1000)
  })
})

describe('isPassed', () => {
  it('passes at exactly the CLF-C02 threshold (700)', () => {
    expect(isPassed(700, 700)).toBe(true)
  })

  it('fails one point below the CLF-C02 threshold', () => {
    expect(isPassed(699, 700)).toBe(false)
  })

  it('respects cert-specific thresholds (SAA-C03 = 720)', () => {
    expect(isPassed(700, 720)).toBe(false)
    expect(isPassed(720, 720)).toBe(true)
    expect(isPassed(721, 720)).toBe(true)
  })
})

describe('getDomainScore', () => {
  it('returns 0 when no questions exist for the domain', () => {
    expect(getDomainScore([], 1)).toBe(0)
    expect(getDomainScore([{ domainId: 2, isCorrect: true }], 1)).toBe(0)
  })

  it('returns the percentage of correct answers within the domain', () => {
    const results = [
      { domainId: 1, isCorrect: true },
      { domainId: 1, isCorrect: false },
      { domainId: 1, isCorrect: true },
      { domainId: 1, isCorrect: true },
      { domainId: 2, isCorrect: false }, // unrelated domain, must be ignored
    ]
    expect(getDomainScore(results, 1)).toBe(75)
  })

  it('returns 100 when all domain answers are correct', () => {
    const results = [
      { domainId: 3, isCorrect: true },
      { domainId: 3, isCorrect: true },
    ]
    expect(getDomainScore(results, 3)).toBe(100)
  })
})

describe('getExamDomainTargets', () => {
  it('respects examProportion and guarantees the exact total', () => {
    const cert: Certification = {
      code: 'test',
      name: 'Test cert',
      shortName: 'TEST',
      status: 'active',
      examQuestionCount: 65,
      examTimeSeconds: 90 * 60,
      passingScore: 700,
      domains: [
        { id: 1, name: 'D1', examProportion: 0.24, questionCount: 100 },
        { id: 2, name: 'D2', examProportion: 0.30, questionCount: 100 },
        { id: 3, name: 'D3', examProportion: 0.34, questionCount: 100 },
        { id: 4, name: 'D4', examProportion: 0.12, questionCount: 100 },
      ],
    }
    const targets = getExamDomainTargets(cert)
    const sum = Object.values(targets).reduce((a, b) => a + b, 0)
    expect(sum).toBe(65) // never drifts because last domain absorbs remainder
    expect(targets[1]).toBe(16) // round(65 * 0.24)
    expect(targets[2]).toBe(20) // round(65 * 0.30)
    expect(targets[3]).toBe(22) // round(65 * 0.34)
    expect(targets[4]).toBe(7) // remainder = 65 - 16 - 20 - 22
  })
})

describe('formatTime', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(5)).toBe('00:05')
    expect(formatTime(65)).toBe('01:05')
    expect(formatTime(3599)).toBe('59:59')
  })

  it('handles long durations (over an hour) without overflow logic', () => {
    // The mock exam tops out at 90:00; formatter just keeps counting minutes.
    expect(formatTime(3600)).toBe('60:00')
    expect(formatTime(5400)).toBe('90:00')
  })
})

describe('formatTotalTime', () => {
  it('shows minutes only under an hour', () => {
    expect(formatTotalTime(0)).toBe('0m')
    expect(formatTotalTime(45)).toBe('45m')
    expect(formatTotalTime(59)).toBe('59m')
  })

  it('shows hours only on exact-hour values', () => {
    expect(formatTotalTime(60)).toBe('1h')
    expect(formatTotalTime(120)).toBe('2h')
  })

  it('combines hours and minutes', () => {
    expect(formatTotalTime(75)).toBe('1h 15m')
    expect(formatTotalTime(135)).toBe('2h 15m')
  })
})

describe('isAnswerCorrect', () => {
  describe('single-answer', () => {
    it('returns true when keys match', () => {
      expect(isAnswerCorrect('A', 'A', false)).toBe(true)
    })

    it('returns false when keys differ', () => {
      expect(isAnswerCorrect('A', 'B', false)).toBe(false)
    })
  })

  describe('multi-answer', () => {
    it('returns true regardless of selection order', () => {
      expect(isAnswerCorrect(['A', 'B'], ['B', 'A'], true)).toBe(true)
    })

    it('returns false when selections are missing', () => {
      expect(isAnswerCorrect(['A'], ['A', 'B'], true)).toBe(false)
    })

    it('returns false when extra selections are present', () => {
      expect(isAnswerCorrect(['A', 'B', 'C'], ['A', 'B'], true)).toBe(false)
    })

    it('returns false if user/correct types are mismatched', () => {
      expect(isAnswerCorrect('A', ['A'], true)).toBe(false)
      expect(isAnswerCorrect(['A'], 'A', true)).toBe(false)
    })
  })

  describe('ordering (order-dependent)', () => {
    it('returns true only when the sequence matches positionally', () => {
      expect(isAnswerCorrect(['B', 'C', 'D', 'A'], ['B', 'C', 'D', 'A'], 'ordering')).toBe(true)
    })

    it('returns false when the same elements are in the wrong order', () => {
      expect(isAnswerCorrect(['C', 'B', 'D', 'A'], ['B', 'C', 'D', 'A'], 'ordering')).toBe(false)
    })

    it('returns false on a length mismatch (incomplete order)', () => {
      expect(isAnswerCorrect(['B', 'C'], ['B', 'C', 'D', 'A'], 'ordering')).toBe(false)
    })

    it('returns false when the user value is not an array', () => {
      expect(isAnswerCorrect('', ['B', 'C', 'D', 'A'], 'ordering')).toBe(false)
    })
  })

  describe('matching (token set equality)', () => {
    it('returns true regardless of token order', () => {
      expect(isAnswerCorrect(['C:1', 'A:3', 'B:2'], ['A:3', 'B:2', 'C:1'], 'matching')).toBe(true)
    })

    it('returns false when any pairing is wrong', () => {
      expect(isAnswerCorrect(['A:3', 'B:1', 'C:2'], ['A:3', 'B:2', 'C:1'], 'matching')).toBe(false)
    })

    it('returns false when a pairing is missing (incomplete)', () => {
      expect(isAnswerCorrect(['A:3', 'B:2'], ['A:3', 'B:2', 'C:1'], 'matching')).toBe(false)
    })
  })
})

describe('correctAnswerFor', () => {
  const base: Question = {
    id: 'q1', domainId: 1, question: 'Q',
    options: { A: 'a', B: 'b', C: 'c', D: 'd', E: '' },
    answer: '', explanation: '', isMultiAnswer: false,
  }

  it('returns the answer string for single questions', () => {
    expect(correctAnswerFor({ ...base, answer: 'B' })).toBe('B')
  })

  it('returns the answer array for multi questions', () => {
    expect(correctAnswerFor({ ...base, isMultiAnswer: true, answer: ['A', 'C'] })).toEqual(['A', 'C'])
  })

  it('returns correctOrder for ordering questions', () => {
    expect(correctAnswerFor({ ...base, type: 'ordering', correctOrder: ['B', 'A', 'C', 'D'] }))
      .toEqual(['B', 'A', 'C', 'D'])
  })

  it('returns sorted K:T tokens for matching questions', () => {
    expect(correctAnswerFor({ ...base, type: 'matching', correctMatches: { B: '2', A: '3', C: '1' } }))
      .toEqual(['A:3', 'B:2', 'C:1'])
  })
})

describe('computeExamTiming', () => {
  // 90-minute exam, like CLF-C02.
  const EXAM_SECONDS = 90 * 60

  it('reports the real elapsed time for a normal full-length attempt', () => {
    const start = 1_000_000
    const now = start + 45 * 60 * 1000 // 45 minutes later
    expect(computeExamTiming(start, now, EXAM_SECONDS)).toEqual({
      timeTaken: 45 * 60,
      isTooShort: false,
    })
  })

  it('flags a genuine sub-minute attempt as too short', () => {
    const start = 1_000_000
    const now = start + 30 * 1000 // 30 seconds
    const { timeTaken, isTooShort } = computeExamTiming(start, now, EXAM_SECONDS)
    expect(timeTaken).toBe(30)
    expect(timeTaken).toBeLessThan(MIN_VALID_EXAM_SECONDS)
    expect(isTooShort).toBe(true)
  })

  it('treats exactly MIN_VALID_EXAM_SECONDS as long enough (boundary)', () => {
    const start = 1_000_000
    const now = start + MIN_VALID_EXAM_SECONDS * 1000
    expect(computeExamTiming(start, now, EXAM_SECONDS).isTooShort).toBe(false)
  })

  it('clamps a forward clock jump / device sleep to the exam length (no inflated time)', () => {
    // Laptop slept for ~3.5h mid-exam, then woke past the deadline.
    const start = 1_000_000
    const now = start + 3.5 * 60 * 60 * 1000
    const { timeTaken, isTooShort } = computeExamTiming(start, now, EXAM_SECONDS)
    expect(timeTaken).toBe(EXAM_SECONDS) // capped, not 3h30m
    expect(isTooShort).toBe(false)
  })

  it('does NOT discard a completed attempt when the clock jumps backward (negative elapsed)', () => {
    // NTP / manual correction moved the wall clock back during the exam.
    const start = 1_000_000
    const now = start - 5 * 60 * 1000 // "now" is before start
    const { timeTaken, isTooShort } = computeExamTiming(start, now, EXAM_SECONDS)
    expect(timeTaken).toBe(0) // floored, never negative
    // The completed attempt must NOT be classified as a sub-minute throwaway.
    expect(isTooShort).toBe(false)
  })
})
