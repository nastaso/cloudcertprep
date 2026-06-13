import { useEffect } from 'react'
import { trackEvent } from '../lib/analytics'

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
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
