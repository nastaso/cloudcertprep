import { describe, it, expect, afterEach, vi } from 'vitest'
import type { User, UserIdentity } from '@supabase/supabase-js'
import {
  ACCOUNT_LINK_CONFIRMED_EVENT,
  isGoogleLinkedToExistingAccount,
  maybeNotifyGoogleLink,
} from './account-link'

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

function stubBrowserGlobals() {
  const values = new Map<string, string>()
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
  const windowTarget = new EventTarget()

  vi.stubGlobal('window', windowTarget)
  vi.stubGlobal('localStorage', storage)

  return { storage, windowTarget }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('maybeNotifyGoogleLink', () => {
  it('dispatches the confirmation event for the first merged Google user', () => {
    const { windowTarget } = stubBrowserGlobals()
    const listener = vi.fn()
    windowTarget.addEventListener(ACCOUNT_LINK_CONFIRMED_EVENT, listener)

    maybeNotifyGoogleLink(makeUser(['github', 'google']))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch again once the acknowledgement is stored', () => {
    const { storage, windowTarget } = stubBrowserGlobals()
    const listener = vi.fn()
    windowTarget.addEventListener(ACCOUNT_LINK_CONFIRMED_EVENT, listener)

    maybeNotifyGoogleLink(makeUser(['github', 'google']))
    maybeNotifyGoogleLink(makeUser(['github', 'google']))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('stays silent for a Google-only user', () => {
    const { storage, windowTarget } = stubBrowserGlobals()
    const listener = vi.fn()
    windowTarget.addEventListener(ACCOUNT_LINK_CONFIRMED_EVENT, listener)

    maybeNotifyGoogleLink(makeUser(['google']))

    expect(listener).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
