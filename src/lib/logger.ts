/**
 * Centralized error logging.
 * - Development: Logs to console for debugging
 * - Production: Sends to Sentry if VITE_SENTRY_DSN is configured
 * 
 * To enable Sentry:
 * 1. Add @sentry/react to package.json
 * 2. Set VITE_SENTRY_DSN in .env
 * 3. Initialize Sentry in main.tsx before rendering
 */

interface SentryLike {
  captureException(err: unknown, context?: { tags?: Record<string, string> }): void
}

declare global {
  interface Window {
    Sentry?: SentryLike
  }
}

export function logError(context: string, err: unknown): void {
  // Always log to console in development
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, err)
  }
  
  // Send to Sentry in production if configured. Guard `window` so a call
  // during prerender/SSR (no DOM) does not throw a ReferenceError.
  if (import.meta.env.PROD && typeof window !== 'undefined' && window.Sentry) {
    try {
      window.Sentry.captureException(err, { tags: { context } })
    } catch (sentryErr) {
      // Fallback to console if Sentry fails
      console.error('[Sentry Error]', sentryErr)
      console.error(`[${context}]`, err)
    }
  } else if (import.meta.env.PROD) {
    // Production without Sentry: at least log to console
    console.error(`[${context}]`, err)
  }
}
