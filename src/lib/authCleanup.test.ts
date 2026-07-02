import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sweepAuthTokens, eraseLocalTraces } from './authCleanup'

/** Minimal Storage stub backed by a Map (node env has no Web Storage). */
function makeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

function stub(name: 'localStorage' | 'sessionStorage', value: Storage | undefined): void {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
}

beforeEach(() => {
  stub('localStorage', makeStorage())
  stub('sessionStorage', makeStorage())
})

afterEach(() => {
  stub('localStorage', undefined)
  stub('sessionStorage', undefined)
})

describe('sweepAuthTokens', () => {
  it('removes every sb-*-auth-token key and nothing else', () => {
    localStorage.setItem('sb-abc-auth-token', '{}')
    localStorage.setItem('sb-xyz-auth-token', '{}')
    localStorage.setItem('sb-abc-auth-token-code-verifier', 'v') // not a token key
    localStorage.setItem('cloudcertprep_theme', 'dark')
    sweepAuthTokens()
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(localStorage.getItem('sb-xyz-auth-token')).toBeNull()
    expect(localStorage.getItem('sb-abc-auth-token-code-verifier')).toBe('v')
    expect(localStorage.getItem('cloudcertprep_theme')).toBe('dark')
  })

  it('does not throw when localStorage is unavailable', () => {
    stub('localStorage', undefined)
    expect(() => sweepAuthTokens()).not.toThrow()
  })
})

describe('eraseLocalTraces', () => {
  it('clears the pending-attempt snapshot, session markers, and saved notice', () => {
    localStorage.setItem('cloudcertprep_pending_attempt', '{"certCode":"clf-c02"}')
    sessionStorage.setItem('cloudcertprep_pending_attempt_intent', 'clf-c02')
    sessionStorage.setItem('cloudcertprep_pending_attempt_saved', 'clf-c02|123')
    sessionStorage.setItem('cc_resume_results', 'clf-c02')
    eraseLocalTraces()
    expect(localStorage.getItem('cloudcertprep_pending_attempt')).toBeNull()
    expect(sessionStorage.getItem('cloudcertprep_pending_attempt_intent')).toBeNull()
    expect(sessionStorage.getItem('cloudcertprep_pending_attempt_saved')).toBeNull()
    expect(sessionStorage.getItem('cc_resume_results')).toBeNull()
  })

  it('prunes only the deleted uuid from cc_home_greeted', () => {
    localStorage.setItem('cc_home_greeted', 'user-a,user-b,user-c')
    eraseLocalTraces('user-b')
    expect(localStorage.getItem('cc_home_greeted')).toBe('user-a,user-c')
  })

  it('removes cc_home_greeted entirely when the deleted uuid was the only entry', () => {
    localStorage.setItem('cc_home_greeted', 'user-a')
    eraseLocalTraces('user-a')
    expect(localStorage.getItem('cc_home_greeted')).toBeNull()
  })

  it('leaves cc_home_greeted alone without a userId and leaves device acks alone always', () => {
    localStorage.setItem('cc_home_greeted', 'user-a')
    localStorage.setItem('cloudcertprep_verified_welcome_ack', '2026-01-01')
    localStorage.setItem('cloudcertprep_google_link_ack', '1')
    eraseLocalTraces()
    expect(localStorage.getItem('cc_home_greeted')).toBe('user-a')
    expect(localStorage.getItem('cloudcertprep_verified_welcome_ack')).toBe('2026-01-01')
    expect(localStorage.getItem('cloudcertprep_google_link_ack')).toBe('1')
  })

  it('does not throw when storage is unavailable', () => {
    stub('localStorage', undefined)
    stub('sessionStorage', undefined)
    expect(() => eraseLocalTraces('user-a')).not.toThrow()
  })
})
