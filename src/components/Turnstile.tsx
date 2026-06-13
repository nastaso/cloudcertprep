import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'

/**
 * Cloudflare Turnstile widget for the auth flow.
 *
 * The Turnstile SITE key (public) is read from VITE_TURNSTILE_SITE_KEY and
 * rendered client-side. The token this widget produces is passed to Supabase
 * Auth as `options.captchaToken`; Supabase validates it server-side using the
 * SECRET key configured in the Supabase Dashboard (Authentication -> Settings
 * -> Bot and Abuse Protection). The secret never touches this codebase.
 *
 * Because the site is statically prerendered with no backend of our own, this
 * Supabase-native CAPTCHA integration is the correct place for verification:
 * there is no server route here to validate a token against the secret.
 *
 * Loads the Turnstile script on demand (once per page) and renders an explicit
 * widget so we control reset between auth attempts (a token is single-use, so
 * it must be reset after every submit, success or failure).
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
      appearance?: 'always' | 'execute' | 'interaction-only'
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onloadTurnstileCallback?: () => void
  }
}

let scriptPromise: Promise<void> | null = null

/** Load the Turnstile script once; resolve when window.turnstile is ready. */
function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface TurnstileHandle {
  /** Clear the current token and re-arm the widget (tokens are single-use). */
  reset: () => void
}

interface TurnstileProps {
  /** Fired with the solved token, or null when it expires / errors. */
  onToken: (token: string | null) => void
  /**
   * Widget color theme. Pass the app's resolved theme ('light' | 'dark') so the
   * widget matches the in-app theme toggle rather than only the OS scheme.
   * Changing this re-renders the widget (the effect depends on `theme`).
   */
  theme?: 'auto' | 'light' | 'dark'
}

/**
 * Renders nothing when no site key is configured (e.g. local dev without a
 * Turnstile key) so the auth form stays usable; Supabase only enforces the
 * captcha when CAPTCHA protection is enabled on the project.
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(
  function Turnstile({ onToken, theme = 'auto' }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      reset() {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current)
          onToken(null)
        }
      },
    }), [onToken])

    useEffect(() => {
      if (!SITE_KEY) return
      let cancelled = false

      loadTurnstile()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return
          // Guard against a double render in React 18/19 strict mode.
          if (widgetIdRef.current) return
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            theme,
            callback: (token: string) => onToken(token),
            'expired-callback': () => onToken(null),
            'error-callback': () => onToken(null),
          })
        })
        .catch(() => {
          // Script blocked (ad-blocker/offline). Leave token null; Supabase
          // rejects captcha-less auth only when protection is enabled.
          if (!cancelled) onToken(null)
        })

      return () => {
        cancelled = true
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
        }
      }
    }, [onToken, theme])

    if (!SITE_KEY) return null

    // Reserve the widget height (~65px, Cloudflare's default) so the login card
    // does not grow/reflow when the iframe mounts, on theme switch, or on reset
    // (audit R1). Only applied when a site key is configured — with no key the
    // component returns null above, so this never renders an empty gap.
    return <div ref={containerRef} className="flex justify-center my-2 min-h-[65px]" />
  },
)
