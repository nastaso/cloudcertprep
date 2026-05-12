import { describe, it, expect } from 'vitest'
import {
  calculateScaledScore,
  isPassed,
  getDomainScore,
  formatTime,
  formatDuration,
  formatTotalTime,
  isAnswerCorrect,
  getExamDomainTargets,
} from './scoring'
import type { Certification } from '../data/certifications'

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

describe('formatDuration', () => {
  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0 seconds')
  })

  it('uses singular for 1 minute / 1 second', () => {
    expect(formatDuration(1)).toBe('1 second')
    expect(formatDuration(60)).toBe('1 minute')
    expect(formatDuration(61)).toBe('1 minute 1 second')
  })

  it('uses plural otherwise', () => {
    expect(formatDuration(45)).toBe('45 seconds')
    expect(formatDuration(120)).toBe('2 minutes')
    expect(formatDuration(125)).toBe('2 minutes 5 seconds')
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
})
