/**
 * Programmatic helpers for the cookie consent banner. Split from the
 * component file so `CookieConsent.tsx` only exports a React component
 * (required by `react-refresh/only-export-components`).
 */

export const CONSENT_OPEN_EVENT = 'cookie-consent:open'

/** Imperatively open the cookie consent banner from anywhere (e.g. Footer). */
export function openCookieConsent() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
