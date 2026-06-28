/**
 * Safe localStorage wrappers. In private/cookies-disabled browsers, accessing
 * localStorage.getItem or .setItem throws a SecurityError. These helpers catch
 * that and degrade gracefully instead of crashing the calling hook or render.
 */

export function storageGet(key: string, fallback: string): string {
  try {
    if (typeof localStorage === 'undefined') return fallback
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
