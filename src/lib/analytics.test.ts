import { describe, it, expect, afterEach, vi } from 'vitest'
import { trackPageView, trackEvent, KNOWN_EVENTS } from './analytics'

function stubWindow(impl: Record<string, unknown>): void {
  Object.defineProperty(globalThis, 'window', {
    value: impl,
    writable: true,
    configurable: true,
  })
}

function removeWindow(): void {
  // Restore undefined (node default - no window)
  Object.defineProperty(globalThis, 'window', {
    value: undefined,
    writable: true,
    configurable: true,
  })
}

afterEach(removeWindow)

describe('trackPageView', () => {
  // Regression guard for B1 (fixed 2026-07): a bare-string window.umami.track(path)
  // call used to record a junk custom EVENT named after the route path, because
  // Umami already auto-tracks pageviews itself via its own pushState hook.
  // trackPageView must only ever drive the GA4 gtag page_view event.
  it('B1 regression: fires only gtag page_view and never touches window.umami', () => {
    const gtag = vi.fn()
    const umamiTrack = vi.fn()
    stubWindow({ gtag, umami: { track: umamiTrack } })

    trackPageView('/some/path')

    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/some/path' })
    expect(umamiTrack).not.toHaveBeenCalled()
  })

  it('does not throw when window.gtag is absent', () => {
    stubWindow({})
    expect(() => trackPageView('/no-gtag')).not.toThrow()
  })
})

describe('trackEvent', () => {
  it('dual-sends to both gtag and umami.track with matching name and params', () => {
    const gtag = vi.fn()
    const umamiTrack = vi.fn()
    stubWindow({ gtag, umami: { track: umamiTrack } })

    trackEvent('share_result', { method: 'web_share', cert: 'CLF-C02' })

    expect(gtag).toHaveBeenCalledWith('event', 'share_result', { method: 'web_share', cert: 'CLF-C02' })
    expect(umamiTrack).toHaveBeenCalledWith('share_result', { method: 'web_share', cert: 'CLF-C02' })
  })

  it('is a silent no-op when both providers are absent', () => {
    stubWindow({})
    expect(() => trackEvent('exam_completed', { guest: false })).not.toThrow()
  })

  it('is a silent no-op when only window.gtag is present (umami missing)', () => {
    stubWindow({ gtag: vi.fn() })
    expect(() => trackEvent('exam_completed', { guest: false })).not.toThrow()
  })

  it('is a silent no-op when only window.umami is present (gtag missing)', () => {
    stubWindow({ umami: { track: vi.fn() } })
    expect(() => trackEvent('exam_completed', { guest: false })).not.toThrow()
  })
})

describe('KNOWN_EVENTS', () => {
  it('is non-empty and has no duplicate event names', () => {
    expect(KNOWN_EVENTS.length).toBeGreaterThan(0)
    expect(new Set(KNOWN_EVENTS).size).toBe(KNOWN_EVENTS.length)
  })

  it('includes the load-bearing events (incl. production client_error)', () => {
    // exam_completed/share_result were guarded by #166; sign_in/exam_started/
    // question_answered/client_error fold in the #181 assertion (client_error is
    // fired by the freshness-observability logger routing). A missing name here
    // means an event a call site still fires was dropped from the registry.
    for (const required of [
      'sign_in',
      'exam_started',
      'exam_completed',
      'question_answered',
      'share_result',
      'client_error',
    ]) {
      expect(KNOWN_EVENTS, `KNOWN_EVENTS is missing "${required}"`).toContain(required)
    }
  })
})
