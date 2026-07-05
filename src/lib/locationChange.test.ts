import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { subscribeLocationChange, LOCATION_CHANGE_EVENT } from './locationChange'

/**
 * These tests run in the `node` vitest environment (no jsdom), so there is no
 * real `window`/`history`. We stub the minimum surface `locationChange.ts`
 * touches:
 *  - `globalThis.window` as a real `EventTarget` so `addEventListener` /
 *    `removeEventListener` / `dispatchEvent` behave for real.
 *  - `globalThis.history` as a plain object with `pushState`/`replaceState`
 *    spies, matching the module's own `typeof history === 'undefined'` guard.
 *
 * The module patches `history` (installing its notifier) only ONCE per
 * process, guarded by an internal `installed` flag - so the stubs are set up
 * a single time for the whole suite and the module is imported once. Do not
 * swap `globalThis.history` out mid-suite expecting a re-patch.
 */

let origPushSpy: ReturnType<typeof vi.fn>
let origReplaceSpy: ReturnType<typeof vi.fn>
let fakeWindow: EventTarget

beforeAll(() => {
  fakeWindow = new EventTarget()
  origPushSpy = vi.fn()
  origReplaceSpy = vi.fn()

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'history', {
    value: { pushState: origPushSpy, replaceState: origReplaceSpy },
    writable: true,
    configurable: true,
  })
})

afterAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: undefined,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'history', {
    value: undefined,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  origPushSpy.mockClear()
  origReplaceSpy.mockClear()
})

describe('subscribeLocationChange', () => {
  it('fires cb when history.pushState is called (M3 fix: script-driven navigation bypasses popstate)', () => {
    const cb = vi.fn()
    const rawEvents: Event[] = []
    const rawListener = (e: Event) => rawEvents.push(e)
    window.addEventListener(LOCATION_CHANGE_EVENT, rawListener)

    const unsubscribe = subscribeLocationChange(cb)
    history.pushState({ a: 1 }, '', '/foo')

    expect(cb).toHaveBeenCalledTimes(1)
    // the notifier dispatches the named custom event, not just "something"
    expect(rawEvents).toHaveLength(1)
    expect(rawEvents[0]?.type).toBe(LOCATION_CHANGE_EVENT)

    unsubscribe()
    window.removeEventListener(LOCATION_CHANGE_EVENT, rawListener)
  })

  it('still invokes the ORIGINAL history.pushState with the original args (navigation is not swallowed)', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    history.pushState({ a: 1 }, '', '/foo')

    expect(origPushSpy).toHaveBeenCalledTimes(1)
    expect(origPushSpy).toHaveBeenCalledWith({ a: 1 }, '', '/foo')

    unsubscribe()
  })

  it('fires cb when history.replaceState is called', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    history.replaceState({ b: 2 }, '', '/bar')

    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('still invokes the ORIGINAL history.replaceState with the original args', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    history.replaceState({ b: 2 }, '', '/bar')

    expect(origReplaceSpy).toHaveBeenCalledTimes(1)
    expect(origReplaceSpy).toHaveBeenCalledWith({ b: 2 }, '', '/bar')

    unsubscribe()
  })

  it('fires cb on a popstate event (browser back/forward)', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    window.dispatchEvent(new Event('popstate'))

    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('returns an unsubscribe fn; after calling it, pushState and popstate no longer fire cb', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    unsubscribe()

    history.pushState({}, '', '/baz')
    window.dispatchEvent(new Event('popstate'))

    expect(cb).not.toHaveBeenCalled()
  })

  it('fires cb exactly once per pushState call (patch is not double-applied)', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeLocationChange(cb)

    history.pushState({}, '', '/once')

    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('re-subscribing a fresh cb after unsubscribe still fires exactly once (no accumulated double-patch)', () => {
    const cbA = vi.fn()
    const unsubA = subscribeLocationChange(cbA)
    unsubA()

    const cbB = vi.fn()
    const unsubB = subscribeLocationChange(cbB)

    history.pushState({}, '', '/fresh')

    expect(cbB).toHaveBeenCalledTimes(1)
    expect(cbA).not.toHaveBeenCalled()

    unsubB()
  })

  it('is SSR-safe: returns a no-op unsubscribe and never registers cb when window is undefined', () => {
    const previousWindow = globalThis.window

    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const cb = vi.fn()
    let unsubscribe: () => void = () => {
      throw new Error('should have been reassigned')
    }

    expect(() => {
      unsubscribe = subscribeLocationChange(cb)
    }).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()

    // restore the real window and confirm cb was never wired up against it
    Object.defineProperty(globalThis, 'window', {
      value: previousWindow,
      writable: true,
      configurable: true,
    })

    history.pushState({}, '', '/after-ssr-check')
    expect(cb).not.toHaveBeenCalled()
  })
})
