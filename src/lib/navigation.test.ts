import { describe, it, expect } from 'vitest'
import { safeFrom } from './navigation'

describe('safeFrom', () => {
  it('allows a same-origin path with search and hash', () => {
    expect(safeFrom('/aws/clf-c02#faq')).toBe('/aws/clf-c02#faq')
    expect(safeFrom('/login?from=%2Fstats')).toBe('/login?from=%2Fstats')
  })

  it('allows the root path', () => {
    expect(safeFrom('/')).toBe('/')
  })

  it('rejects protocol-relative URLs (//host)', () => {
    expect(safeFrom('//evil.com')).toBe('/')
  })

  it('rejects backslash-prefixed paths that browsers normalise to //', () => {
    expect(safeFrom('/\\evil')).toBe('/')
    expect(safeFrom('\\evil')).toBe('/')
  })

  it('rejects absolute external URLs', () => {
    expect(safeFrom('https://bad.com')).toBe('/')
    expect(safeFrom('http://bad.com/path')).toBe('/')
  })

  it('rejects values not starting with a slash', () => {
    expect(safeFrom('evil.com')).toBe('/')
    expect(safeFrom('javascript:alert(1)')).toBe('/')
  })

  it('falls back to / for empty, null, or undefined input', () => {
    expect(safeFrom('')).toBe('/')
    expect(safeFrom(null)).toBe('/')
    expect(safeFrom(undefined)).toBe('/')
  })

  it('honours a custom fallback when the input is untrusted', () => {
    expect(safeFrom('//evil.com', '/login')).toBe('/login')
    expect(safeFrom(undefined, '/login')).toBe('/login')
  })

  it('ignores the fallback when the input is a safe path', () => {
    expect(safeFrom('/stats', '/login')).toBe('/stats')
  })
})
