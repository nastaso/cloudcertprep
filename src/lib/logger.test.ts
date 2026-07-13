import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logError } from './logger'

// import.meta.env.DEV / .PROD are typed as readonly booleans by Vite's
// client types. vi.stubEnv only accepts strings and, in this setup, does
// not reliably coerce 'true'/'false' back into real booleans (a stubbed
// 'false' string is truthy!). Casting once here lets us assign real
// booleans directly and avoids that footgun.
const env = import.meta.env as unknown as { DEV: boolean; PROD: boolean }

function setEnv(dev: boolean, prod: boolean) {
  env.DEV = dev
  env.PROD = prod
}

describe('logError', () => {
  const originalDev = env.DEV
  const originalProd = env.PROD

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // vitest.config.ts runs this suite under environment: 'node', so there
    // is no global `window` to begin with. Stub a fresh one per test rather
    // than referencing a bare `window` (which throws ReferenceError).
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    setEnv(originalDev, originalProd)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('logs to console in development', () => {
    // Arrange
    setEnv(true, false)
    const err = new Error('dev boom')

    // Act
    logError('DevContext', err)

    // Assert
    expect(console.error).toHaveBeenCalledWith('[DevContext]', err)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('sends errors to Sentry in production', () => {
    // Arrange
    setEnv(false, true)
    const captureException = vi.fn()
    window.Sentry = { captureException }
    const err = new Error('prod boom')

    // Act
    logError('ProdContext', err)

    // Assert
    expect(captureException).toHaveBeenCalledWith(err, { tags: { context: 'ProdContext' } })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('falls back to console when Sentry throws', () => {
    // Arrange
    setEnv(false, true)
    const sentryErr = new Error('sentry is down')
    window.Sentry = {
      captureException: vi.fn(() => {
        throw sentryErr
      }),
    }
    const err = new Error('prod boom')

    // Act
    logError('FallbackContext', err)

    // Assert
    expect(console.error).toHaveBeenNthCalledWith(1, '[Sentry Error]', sentryErr)
    expect(console.error).toHaveBeenNthCalledWith(2, '[FallbackContext]', err)
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('logs to console when Sentry is unavailable', () => {
    // Arrange
    setEnv(false, true)
    // window.Sentry left unset on the fresh stubbed window from beforeEach
    const err = new Error('no sentry boom')

    // Act
    logError('NoSentryContext', err)

    // Assert
    expect(console.error).toHaveBeenCalledWith('[NoSentryContext]', err)
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})