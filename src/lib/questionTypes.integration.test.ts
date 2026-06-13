import { describe, it, expect } from 'vitest'
import aifD1 from '../data/aif-c01/domain1.json'
import aifD2 from '../data/aif-c01/domain2.json'
import type { Question } from '../types'
import { shuffleQuestionOptions, encodeAnswerForDb, getQuestionType } from './utils'
import { isAnswerCorrect, correctAnswerFor } from './scoring'

// End-to-end round-trip on the REAL seeded AIF-C01 ordering/matching questions:
// shuffle (display-space remap) -> answer in display space -> grade -> encode to
// the persisted DB string -> assert it equals the original-bank-space encoding.
// This is the integration guard the shuffle/scoring/encode unit tests support.
const ordering = (aifD1 as unknown as Question[]).find(q => q.id === 'aif-q457')!
const matching = (aifD2 as unknown as Question[]).find(q => q.id === 'aif-q460')!

function matchTokens(matches: Record<string, string>): string[] {
  return Object.keys(matches).sort().map(k => `${k}:${matches[k]}`)
}

describe('ordering round-trip (real seed aif-q457)', () => {
  it('is well-formed seed data', () => {
    expect(getQuestionType(ordering)).toBe('ordering')
    expect(ordering.correctOrder).toBeDefined()
  })

  it('grades a correct display-space answer and encodes to the original DB string', () => {
    const { question: shuffled, keyMap } = shuffleQuestionOptions(ordering)
    const type = getQuestionType(shuffled)
    const userDisplay = [...shuffled.correctOrder!]

    expect(isAnswerCorrect(userDisplay, correctAnswerFor(shuffled), type)).toBe(true)

    const encUser = encodeAnswerForDb(userDisplay, keyMap, type)
    const encCorrect = encodeAnswerForDb(correctAnswerFor(shuffled), keyMap, type)
    expect(encUser).toBe(encCorrect)
    // The display-space answer decodes back to the original bank sequence.
    expect(encUser).toBe(ordering.correctOrder!.join(','))
  })

  it('grades a wrong order as incorrect (all-or-nothing)', () => {
    const { question: shuffled } = shuffleQuestionOptions(ordering)
    const wrong = [...shuffled.correctOrder!]
    ;[wrong[0], wrong[1]] = [wrong[1], wrong[0]]
    expect(isAnswerCorrect(wrong, correctAnswerFor(shuffled), 'ordering')).toBe(false)
  })
})

describe('matching round-trip (real seed aif-q460)', () => {
  it('is well-formed seed data', () => {
    expect(getQuestionType(matching)).toBe('matching')
    expect(matching.correctMatches).toBeDefined()
    expect(matching.targets).toBeDefined()
  })

  it('grades correct display-space matches and encodes to the original DB token string', () => {
    const { question: shuffled, keyMap } = shuffleQuestionOptions(matching)
    const type = getQuestionType(shuffled)
    const userTokens = matchTokens(shuffled.correctMatches!)

    expect(isAnswerCorrect(userTokens, correctAnswerFor(shuffled), type)).toBe(true)

    const encUser = encodeAnswerForDb(userTokens, keyMap, type)
    const encCorrect = encodeAnswerForDb(correctAnswerFor(shuffled), keyMap, type)
    expect(encUser).toBe(encCorrect)
    expect(encUser).toBe(matchTokens(matching.correctMatches!).join(','))
  })

  it('grades a wrong pairing as incorrect (all-or-nothing)', () => {
    const { question: shuffled } = shuffleQuestionOptions(matching)
    const tokens = matchTokens(shuffled.correctMatches!)
    const k0 = Object.keys(shuffled.correctMatches!).sort()[0]
    const wrongTarget = Object.keys(shuffled.targets!).find(t => t !== shuffled.correctMatches![k0])!
    const wrongTokens = tokens.map(tok => (tok.startsWith(`${k0}:`) ? `${k0}:${wrongTarget}` : tok))
    expect(isAnswerCorrect(wrongTokens, correctAnswerFor(shuffled), 'matching')).toBe(false)
  })

  it('grades an incomplete matching (missing pair) as incorrect', () => {
    const { question: shuffled } = shuffleQuestionOptions(matching)
    const tokens = matchTokens(shuffled.correctMatches!).slice(0, -1) // drop one pair
    expect(isAnswerCorrect(tokens, correctAnswerFor(shuffled), 'matching')).toBe(false)
  })
})
