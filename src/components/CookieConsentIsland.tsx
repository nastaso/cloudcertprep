import { CookieConsent } from './CookieConsent'

/**
 * Thin island wrapper for mounting CookieConsent inside Astro pages.
 * CookieConsent does not use react-router or context providers, so
 * this is a simple re-export as a default export for Astro island usage.
 */
export default function CookieConsentIsland() {
  return <CookieConsent />
}
