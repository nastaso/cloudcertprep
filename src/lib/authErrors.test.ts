import { describe, it, expect } from 'vitest'
import { authErrorMessage } from './authErrors'

describe('authErrorMessage', () => {
  it('hides account existence on sign-in (invalid credentials)', () => {
    const msg = authErrorMessage(new Error('Invalid login credentials'), 'sign-in')
    expect(msg).toMatch(/incorrect email or password/i)
    expect(msg).not.toMatch(/invalid login credentials/i)
  })

  it('hides confirmation state on sign-in (email not confirmed)', () => {
    const confirmed = authErrorMessage(new Error('Invalid login credentials'), 'sign-in')
    const unconfirmed = authErrorMessage(new Error('Email not confirmed'), 'sign-in')
    // The non-enumeration property: both cases read identically.
    expect(unconfirmed).toBe(confirmed)
  })

  it('hides existing registration on sign-up', () => {
    const msg = authErrorMessage(new Error('User already registered'), 'sign-up')
    expect(msg).not.toMatch(/already registered/i)
    const unknown = authErrorMessage(new Error('Database error saving new user'), 'sign-up')
    expect(msg).toBe(unknown)
  })

  it('keeps captcha errors actionable', () => {
    expect(
      authErrorMessage(new Error('captcha verification process failed'), 'sign-in'),
    ).toMatch(/verification challenge/i)
  })

  it('keeps rate-limit errors actionable', () => {
    expect(authErrorMessage(new Error('Email rate limit exceeded'), 'sign-up')).toMatch(
      /too many attempts/i,
    )
    expect(
      authErrorMessage(
        new Error('For security purposes, you can only request this after 60 seconds.'),
        'sign-in',
      ),
    ).toMatch(/too many attempts/i)
  })

  it('keeps network errors actionable', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'), 'sign-in')).toMatch(
      /network error/i,
    )
  })

  it('passes through server password-policy feedback on sign-up only', () => {
    const policy = 'Password should be at least 6 characters.'
    expect(authErrorMessage(new Error(policy), 'sign-up')).toBe(policy)
    expect(authErrorMessage(new Error(policy), 'sign-in')).toMatch(
      /incorrect email or password/i,
    )
  })

  it('falls back to generic copy for unknown values', () => {
    expect(authErrorMessage('not-an-error', 'sign-in')).toMatch(/incorrect email or password/i)
    expect(authErrorMessage(undefined, 'sign-up')).toMatch(/could not create an account/i)
  })
})
