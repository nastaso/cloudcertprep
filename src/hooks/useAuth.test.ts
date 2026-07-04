import { describe, it, expect } from 'vitest'
import { isRedundantTokenRefresh } from './useAuth'
import type { User } from '@supabase/supabase-js'

// The predicate only reads `id`; a minimal stub is enough. `userAAgain` is a
// DIFFERENT object with the SAME id - exactly what supabase-js hands us on a
// token refresh, and the reference churn that caused issue #159.
const userA = { id: 'user-a' } as User
const userAAgain = { id: 'user-a' } as User
const userB = { id: 'user-b' } as User

describe('isRedundantTokenRefresh (issue #159 auth-refresh loop guard)', () => {
  it('is TRUE for a same-user TOKEN_REFRESHED, so useAuth keeps the reference stable', () => {
    // This is the case that must NOT publish a new `user` object: doing so
    // re-runs every consumer effect keyed on `user` and re-issues a query,
    // which looped against the auth /token endpoint until a 429.
    expect(isRedundantTokenRefresh('TOKEN_REFRESHED', userAAgain, userA)).toBe(true)
  })

  it('is FALSE for a TOKEN_REFRESHED that changes the user id (must publish)', () => {
    expect(isRedundantTokenRefresh('TOKEN_REFRESHED', userB, userA)).toBe(false)
  })

  it('is FALSE for identity-changing events so they still publish normally', () => {
    for (const event of ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED', 'SIGNED_OUT']) {
      expect(isRedundantTokenRefresh(event, userAAgain, userA)).toBe(false)
    }
  })

  it('is FALSE before a user is established or when the session dropped', () => {
    expect(isRedundantTokenRefresh('TOKEN_REFRESHED', userA, null)).toBe(false)
    expect(isRedundantTokenRefresh('TOKEN_REFRESHED', null, userA)).toBe(false)
    expect(isRedundantTokenRefresh('TOKEN_REFRESHED', null, null)).toBe(false)
  })
})
