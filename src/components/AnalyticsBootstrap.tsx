import { useEffect } from 'react'
import { trackEvent } from '../lib/analytics'
import { logError } from '../lib/logger'
import { ErrorBoundary } from './ErrorBoundary'

declare global {
  interface Window {
    trackEvent?: typeof trackEvent
  }
}

/**
 * Analytics bootstrap island. Mounted with `client:load` in BaseLayout.astro.
 *
 * Responsibilities:
 * 1. Exposes `trackEvent` on the global `window` object so inline scripts
 *    and other islands can call it without importing the module directly.
 * 2. Fires a one-shot `landing` event with UTM parameters (if present in the
 *    URL) on first paint so analytics dashboards can attribute traffic sources.
 *
 * Renders nothing visible.
 */
export default function AnalyticsBootstrap() {
  useEffect(() => {
    // Expose trackEvent globally for inline scripts and other islands
    window.trackEvent = trackEvent

    // One-shot UTM landing event
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
    for (const key of keys) {
      const value = params.get(key)
      if (value) utm[key] = value
    }
    if (Object.keys(utm).length > 0) {
      trackEvent('landing', utm)
    }

    // Delegated conversion tracking for prerendered (static Astro) CTAs.
    // Static `<a>` buttons can't carry React onClick handlers, so they opt in
    // with `data-cc-event="<name>"` (plus optional `data-cc-param-*` params)
    // and a single document-level listener fires the event before navigation.
    // This restores `cta_start_practice_exam` (and any future static CTA
    // event) without a per-button island.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const el = target?.closest<HTMLElement>('[data-cc-event]')
      if (!el) return
      const name = el.dataset.ccEvent
      if (!name) return
      const eventParams: Record<string, string> = {}
      for (const [key, value] of Object.entries(el.dataset)) {
        // data-cc-param-location -> "location"
        if (key.startsWith('ccParam') && value != null) {
          eventParams[key.slice('ccParam'.length).toLowerCase()] = value
        }
      }
      trackEvent(name, eventParams)
    }
    document.addEventListener('click', onClick)

    // Global error funnel -> logError -> client_error (production observability).
    // Uncaught errors and unhandled promise rejections previously vanished in
    // production (logError only tried a never-installed window.Sentry). Route
    // them through logError so they land in Umami. THROTTLED: a render/refresh
    // loop (the #159 incident class) could otherwise fire thousands of events,
    // so cap forwarding to MAX_ERRORS_PER_WINDOW per rolling window; overflow is
    // dropped (still logged to console in dev via logError itself).
    const MAX_ERRORS_PER_WINDOW = 10
    const WINDOW_MS = 60_000
    let windowStart = Date.now()
    let windowCount = 0
    const overThrottle = (): boolean => {
      const now = Date.now()
      if (now - windowStart > WINDOW_MS) {
        windowStart = now
        windowCount = 0
      }
      windowCount += 1
      return windowCount > MAX_ERRORS_PER_WINDOW
    }
    const onError = (e: ErrorEvent) => {
      if (overThrottle()) return
      logError('window.onerror', e.error ?? e.message)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      if (overThrottle()) return
      logError('unhandledrejection', e.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return <ErrorBoundary>{null}</ErrorBoundary>
}
