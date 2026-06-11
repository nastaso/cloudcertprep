import { describe, it, expect } from 'vitest'
import type { User, UserIdentity } from '@supabase/supabase-js'
import { isGoogleLinkedToExistingAccount } from './account-link'

function makeUser(providers: string[]): User {
  const identities: UserIdentity[] = providers.map((provider, i) => ({
    id: `id-${i}`,
    identity_id: `iid-${i}`,
    user_id: 'user-1',
    provider,
    identity_data: {},
    created_at: '2024-01-01T00:00:00Z',
    last_sign_in_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }))
  return {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    identities,
  } as User
}

describe('isGoogleLinkedToExistingAccount', () => {
  it('returns false for a null user', () => {
    expect(isGoogleLinkedToExistingAccount(null)).toBe(false)
  })

  it('returns false for a Google-only account (fresh sign-up, single identity)', () => {
    expect(isGoogleLinkedToExistingAccount(makeUser(['google']))).toBe(false)
  })

  it('returns true when Google is merged into a pre-existing account (google + another identity)', () => {
    expect(isGoogleLinkedToExistingAccount(makeUser(['github', 'google']))).toBe(true)
  })

  it('returns true regardless of identity order', () => {
    expect(isGoogleLinkedToExistingAccount(makeUser(['google', 'email']))).toBe(true)
  })

  it('returns false when multiple identities exist but none is Google', () => {
    expect(isGoogleLinkedToExistingAccount(makeUser(['github', 'email']))).toBe(false)
  })

  it('returns false when the identities array is missing', () => {
    const user = { id: 'u', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } as User
    expect(isGoogleLinkedToExistingAccount(user)).toBe(false)
  })
})
