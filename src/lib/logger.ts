/**
 * Centralized error logging.
 * - Development: logs to the console for debugging.
 * - Production: routes to Umami (cookieless, CSP-allowlisted) via the existing
 *   trackEvent('client_error', ...) pipeline, so client-side errors are visible
 *   instead of vanishing. (Umami was chosen over Sentry: it is already loaded,
 *   already CSP-allowlisted, and adds no dependency.)
 *
 * The payload carries the call-site `context` and a trimmed error `message`
 * only - never PII, tokens, or full stacks - so no user data leaves the client.
 */
import { trackEvent } from './analytics'

/** Max characters of an error message forwarded to analytics (keeps the event
 * payload lean and avoids dumping large strings into the events panel). */
const MAX_MESSAGE_LEN = 200

/** Reduce an unknown thrown value to a short, safe message string. */
function toMessage(err: unknown): string {
  let raw: string
  if (err instanceof Error) raw = err.message || err.name
  else if (typeof err === 'string') raw = err
  else {
    try {
      raw = String(err)
    } catch {
      raw = 'unstringifiable error'
    }
  }
  return raw.slice(0, MAX_MESSAGE_LEN)
}

export function logError(context: string, err: unknown): void {
  // Development: console for debugging (unchanged behavior).
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, err)
    return
  }

  // Production. Guard `window` so a call during prerender/SSR (no DOM) does not
  // throw a ReferenceError; fall back to console there so the error still shows
  // up in build logs.
  if (typeof window === 'undefined') {
    console.error(`[${context}]`, err)
    return
  }

  // Route to Umami. trackEvent is a no-op if the tracker is not loaded, and is
  // wrapped so telemetry can never itself throw and mask the original error.
  try {
    trackEvent('client_error', { context, message: toMessage(err) })
  } catch (trackErr) {
    console.error('[client_error tracking failed]', trackErr)
    console.error(`[${context}]`, err)
  }
}
