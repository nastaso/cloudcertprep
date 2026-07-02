import { describe, it, expect, afterEach } from 'vitest'
import { storageGet, storageSet } from './storage'

function stubStorage(impl: Partial<Storage>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: impl,
    writable: true,
    configurable: true,
  })
}

function removeStorage(): void {
  // Restore undefined (node default - no localStorage)
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true,
  })
}

afterEach(removeStorage)

describe('storageGet', () => {
  it('returns fallback when localStorage is undefined (node / no-storage env)', () => {
    expect(storageGet('k', 'fb')).toBe('fb')
  })

  it('returns stored value when localStorage is accessible', () => {
    stubStorage({ getItem: () => 'stored' })
    expect(storageGet('k', 'fb')).toBe('stored')
  })

  it('returns fallback when getItem returns null (key absent)', () => {
    stubStorage({ getItem: () => null })
    expect(storageGet('k', 'fb')).toBe('fb')
  })

  it('returns fallback when localStorage.getItem throws (storage blocked)', () => {
    stubStorage({ getItem: () => { throw new Error('SecurityError: blocked') } })
    expect(() => storageGet('k', 'fb')).not.toThrow()
    expect(storageGet('k', 'fb')).toBe('fb')
  })
})

describe('storageSet', () => {
  it('returns false when localStorage is undefined', () => {
    expect(storageSet('k', 'v')).toBe(false)
  })

  it('returns true and calls setItem when localStorage is accessible', () => {
    const calls: Array<[string, string]> = []
    stubStorage({ setItem: (k: string, v: string) => { calls.push([k, v]) } })
    expect(storageSet('k', 'v')).toBe(true)
    expect(calls).toEqual([['k', 'v']])
  })

  it('returns false when localStorage.setItem throws (storage blocked)', () => {
    stubStorage({ setItem: () => { throw new Error('SecurityError: blocked') } })
    expect(() => storageSet('k', 'v')).not.toThrow()
    expect(storageSet('k', 'v')).toBe(false)
  })
})
