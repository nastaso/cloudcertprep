/**
 * Analytics tracking utilities.
 *
 * Two providers run in parallel:
 *  - Umami (cookieless, GDPR-friendly, runs without consent): always loaded.
 *  - Google Analytics 4 (cookies, requires consent): loaded only after the user
 *    accepts cookies via the cookie consent banner.
 *
 * Both calls are silent no-ops if the corresponding script is not loaded
 * (e.g. local dev without a Umami script tag, or guest who rejected cookies).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    umami?: {
      track: (eventOrPath: string, dataOrParams?: Record<string, unknown>) => void
    }
  }
}

function gtag(...args: unknown[]): void {
  if (typeof window.gtag === 'function') {
    window.gtag(...args)
  }
}

/** Fire a virtual page view. Call on every route change. */
export function trackPageView(path: string): void {
  gtag('event', 'page_view', { page_path: path })
  // Umami tracks page views automatically on script load, but we also fire
  // explicit calls for SPA navigation so client-side route changes register.
  if (typeof window.umami?.track === 'function') {
    window.umami.track(path)
  }
}

/** Fire a named GA4/Umami event with optional parameters. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  gtag('event', name, params)
  if (typeof window.umami?.track === 'function') {
    window.umami.track(name, params)
  }
}
