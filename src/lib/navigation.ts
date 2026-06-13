import type { NavigateFunction, Location } from 'react-router-dom'

/**
 * Navigate to /login, preserving the current pathname+search+hash as `from`
 * state so the user is returned there after sign-in. Replaces 5 identical
 * `navigate('/login')` call-sites across the codebase.
 */
export function goToLogin(navigate: NavigateFunction, location: Location): void {
  const from = location.pathname + location.search + location.hash
  navigate('/login', { state: { from } })
}

/**
 * Returns a safe redirect path from an untrusted `from` value.
 *
 * Allows only same-origin paths (must start with `/` but NOT `//` or `\`).
 * Falls back to `/` for anything that looks like an external URL or is
 * otherwise untrusted, preventing open-redirect attacks.
 *
 * Examples:
 *   safeFrom('/aws/clf-c02#faq') === '/aws/clf-c02#faq'  ✅
 *   safeFrom('//evil.com')       === '/'                  ✅
 *   safeFrom('\\evil')           === '/'                  ✅
 *   safeFrom('https://bad.com')  === '/'                  ✅
 *   safeFrom(undefined)          === '/'                  ✅
 */
export function safeFrom(from: string | undefined | null, fallback = '/'): string {
  if (!from) return fallback
  // Must start with exactly one `/` and not be followed by another `/` or `\`
  if (/^\/(?![/\\])/.test(from)) return from
  return fallback
}
