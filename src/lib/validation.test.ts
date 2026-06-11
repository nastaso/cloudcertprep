import { describe, it, expect } from 'vitest'
import {
  validatePassword,
  isPasswordStrongEnough,
  scorePassword,
  MIN_PASSWORD_LENGTH,
} from './validation'

describe('validatePassword', () => {
  it('rejects mismatched confirm field', () => {
    expect(validatePassword('Mypassword1', 'Mypassword2')).toBe('Passwords do not match')
  })

  it('rejects passwords shorter than the minimum length', () => {
    const short = 'Aa1!'
    const result = validatePassword(short, short)
    expect(result).toBe(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  })

  it('rejects long-but-weak passwords (e.g. all lowercase)', () => {
    expect(validatePassword('passwordpassword', 'passwordpassword')).toBe(
      'Password is too weak. Add a number, symbol, or mix of letter cases.',
    )
  })

  it('accepts a Fair-or-better password matching its confirmation', () => {
    expect(validatePassword('Mypassword1', 'Mypassword1')).toBeNull()
  })

  it('accepts a Strong password', () => {
    expect(validatePassword('Mypassword1!', 'Mypassword1!')).toBeNull()
  })
})

describe('isPasswordStrongEnough', () => {
  it('returns false for empty input', () => {
    expect(isPasswordStrongEnough('')).toBe(false)
  })

  it('returns false for short input', () => {
    expect(isPasswordStrongEnough('Ab1!')).toBe(false)
  })

  it('returns false for length-only input (no case mix, digit, or symbol)', () => {
    expect(isPasswordStrongEnough('passwordp')).toBe(false)
  })

  it('returns true once length and one extra criterion are met', () => {
    expect(isPasswordStrongEnough('Password1')).toBe(true) // length + caseMix + digit
    expect(isPasswordStrongEnough('passworD1')).toBe(true) // length + caseMix + digit
    expect(isPasswordStrongEnough('password!')).toBe(true) // length + special
  })
})

describe('scorePassword', () => {
  it('returns Weak for empty input', () => {
    const result = scorePassword('')
    expect(result.score).toBe(0)
    expect(result.label).toBe('Weak')
    expect(result.checks.length).toBe(false)
  })

  it('returns Weak for length-only input', () => {
    const result = scorePassword('passwordp')
    expect(result.score).toBe(1)
    expect(result.label).toBe('Weak')
    expect(result.checks.length).toBe(true)
    expect(result.checks.caseMix).toBe(false)
    expect(result.checks.digit).toBe(false)
    expect(result.checks.special).toBe(false)
  })

  it('returns Fair when length plus exactly one extra is met', () => {
    const result = scorePassword('password1') // length + digit
    expect(result.score).toBe(2)
    expect(result.label).toBe('Fair')
  })

  it('returns Good when length plus two extras are met', () => {
    const result = scorePassword('Password1') // length + caseMix + digit
    expect(result.score).toBe(3)
    expect(result.label).toBe('Good')
  })

  it('returns Strong when all four criteria are met', () => {
    const result = scorePassword('Password1!') // length + caseMix + digit + special
    expect(result.score).toBe(4)
    expect(result.label).toBe('Strong')
    expect(result.checks).toEqual({
      length: true,
      caseMix: true,
      digit: true,
      special: true,
    })
  })

  it('caps at Strong even with very long, every-criteria-met passwords', () => {
    const result = scorePassword('Sup3rL0ngP@ssw0rdWith!Many!Symbols!')
    expect(result.score).toBe(4)
    expect(result.label).toBe('Strong')
  })
})
