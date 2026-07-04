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

/**
 * Fire a virtual page view. Call on every route change. GA4 only: Umami
 * already auto-tracks every pageview itself via its own pushState hook
 * (verified against the deployed tracker), so a manual `window.umami.track(path)`
 * call here would be redundant and, worse, wrong - a bare string argument to
 * `umami.track()` records a custom EVENT named that string, not a pageview.
 * That bug used to log one junk event name per distinct SPA route (fixed
 * 2026-07, see B1 in the funnel-analytics findings). The GA branch stays
 * dormant as documented at the top of this file.
 */
export function trackPageView(path: string): void {
  gtag('event', 'page_view', { page_path: path })
}

/**
 * Every event name the platform fires, in one place. This is the authoritative
 * registry of the analytics namespace: dashboards, the conversion-event smoke
 * test, and llms/docs all key off this list. Keep it in sync with the
 * `trackEvent(...)` call sites. Grouped by surface for readability.
 */
export const KNOWN_EVENTS = [
  // Lifecycle / navigation
  'landing',            // one-shot UTM-only attribution on first paint; organic/
                         // direct landings rely on Umami's own auto-tracked pageview
  'page_view',          // GA4 only (dormant). Umami never receives this name - it
                         // auto-tracks pageviews itself, so this never appears in
                         // the Umami events panel
  'page_not_found',     // 404 page hit
  // Auth
  'sign_up',            // email sign-up submitted
  'email_verified',     // confirm link lands on ?verified=1 (one-shot, gated on the
                         // same localStorage ack as the welcome toast; refreshes
                         // do not refire)
  'sign_in_initiated',  // OAuth button clicked (method: github | google)
  'sign_in',            // unauth -> auth transition (params: method; new_user, true
                         // when user.created_at is within ~2 min of this event)
  'sign_out',           // sign-out
  'account_delete_reason', // optional exit-reason chip in the delete modal (anonymous; params: reason)
  // Mock exam flow. exam_started/exam_completed carry `guest: <bool>` (the
  // funnel's guest-vs-signed-in denominator).
  'exam_started',
  'exam_abandoned',     // beforeunload during an active exam
  'timer_expired',      // exam timer hit zero
  'exam_completed',
  // Practice + per-question (question_answered is fired by BOTH the domain
  // practice flow and the mock exam; the `surface` param disambiguates).
  // practice_started/practice_completed carry `guest: <bool>` like the exam
  // events above; question_answered deliberately does not, to keep that
  // high-volume payload lean.
  'practice_started',
  'question_answered',
  'practice_completed',
  // Engagement
  'cta_start_practice_exam', // primary "Start Practice Exam" CTA
  'unlock_cta_clicked',      // guest sign-in nudge in practice/exam/header
  'weakest_domain_cta_clicked', // "next up" CTA (surface: dashboard | exam_results;
                                 // variant: weakest | unstarted)
  'share_result',            // results-screen share, pass-only (method: web_share | clipboard; params: cert, authed)
  'post_share_clicked',      // blog post share/copy-link row (method: web_share | clipboard)
  'report_question_clicked',
  'donate_click',            // Ko-fi link activated (params: location: footer | mobile_drawer |
                              // floating | results - the four independent donate surfaces)
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
