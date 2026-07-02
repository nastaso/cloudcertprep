/**
 * Analytics tracking utilities.
 *
 * Two providers are wired up to run in parallel:
 *  - Umami (cookieless, GDPR-friendly, runs without consent): always loaded.
 *  - Google Analytics 4 (cookies, requires consent): loaded only after the user
 *    accepts cookies via the cookie consent banner.
 *
 * Note: GA4 is currently DORMANT (the consent banner is unmounted and
 * VITE_GA_MEASUREMENT_ID is unset), so only Umami actually runs; the gtag
 * dual-send path below is kept inert for a future re-enable.
 *
 * Both calls are silent no-ops if the corresponding script is not loaded
 * (e.g. local dev without a Umami script tag, or GA while dormant).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
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

/**
 * Every event name the platform fires, in one place. This is the authoritative
 * registry of the analytics namespace: dashboards, the conversion-event smoke
 * test, and llms/docs all key off this list. Keep it in sync with the
 * `trackEvent(...)` call sites. Grouped by surface for readability.
 */
export const KNOWN_EVENTS = [
  // Lifecycle / navigation
  'landing',            // one-shot UTM attribution on first paint
  'page_view',          // virtual page view on SPA route change
  'page_not_found',     // 404 page hit
  // Auth
  'sign_up',            // email sign-up submitted
  'sign_in_initiated',  // OAuth button clicked (method: github | google)
  'sign_in',            // unauth -> auth transition (fired once, any method)
  'sign_out',           // sign-out
  // Mock exam flow
  'exam_started',
  'exam_abandoned',     // beforeunload during an active exam
  'timer_expired',      // exam timer hit zero
  'exam_completed',
  // Practice + per-question (question_answered is fired by BOTH the domain
  // practice flow and the mock exam; the `surface` param disambiguates)
  'practice_started',
  'question_answered',
  'practice_completed',
  // Engagement
  'cta_start_practice_exam', // primary "Start Practice Exam" CTA
  'unlock_cta_clicked',      // guest sign-in nudge in practice/exam
  'share_result',            // results-screen share/copy (method: web_share | clipboard; outcome: pass | fail)
  'report_question_clicked',
  'donate_click',
  'github_click',
  'affiliate_click',    // reserved for the deferred affiliate iteration
] as const

export type KnownEvent = (typeof KNOWN_EVENTS)[number]

/** Fire a named Umami (and GA4, when re-enabled) event with optional parameters. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  gtag('event', name, params)
  if (typeof window.umami?.track === 'function') {
    window.umami.track(name, params)
  }
}
