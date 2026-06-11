import { useState, useEffect } from 'react'
import { Cookie, X } from 'lucide-react'
import { Button } from './Button'
import { CONSENT_OPEN_EVENT } from './cookie-consent'

const CONSENT_KEY = 'cloudcertprep_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  // Auto-show on first visit when no choice has been recorded.
  useEffect(() => {
    if (localStorage.getItem(CONSENT_KEY)) return
    const t = setTimeout(() => setVisible(true), 1000)
    return () => clearTimeout(t)
  }, [])

  // Listen for explicit open requests from Footer or any other caller.
  useEffect(() => {
    const onOpen = () => setVisible(true)
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen)
  }, [])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')

    // Dynamically load GA4 without page reload
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID
    if (measurementId && !measurementId.startsWith('%')) {
      const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`)
      if (!existingScript) {
        const script = document.createElement('script')
        script.async = true
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
        document.head.appendChild(script)

        // dataLayer/gtag are augmented globally in `analytics.ts`.
        // gtag.js requires the literal `arguments` object to be pushed (it
        // inspects `arguments.length`/indices), NOT a packed array. Using a
        // rest-param array here would silently no-op every gtag call until the
        // next full page load.
        window.dataLayer = window.dataLayer || []
        window.gtag = function () {
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer!.push(arguments)
        }
        window.gtag('js', new Date())
        window.gtag('config', measurementId)
      }
    }

    setVisible(false)
  }

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'rejected')

    // Remove GA4 cookies if they exist. GA writes both a host-only cookie
    // (path=/) and a cookie scoped to the registrable domain
    // (domain=.cloudcertprep.io), and uses the _ga, _ga_<id>, _gid, _gat
    // families. A delete only succeeds when the expiry overwrite matches the
    // original cookie's path AND domain, so we clear each name against both
    // the host-only scope and every parent-domain scope.
    const domain = location.hostname
    const domainScopes = ['']
    const parts = domain.split('.')
    for (let i = 0; i < parts.length - 1; i++) {
      domainScopes.push(`; domain=.${parts.slice(i).join('.')}`)
    }
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.split('=')
      const trimmedName = name.trim()
      if (trimmedName.startsWith('_ga') || trimmedName === '_gid' || trimmedName === '_gat') {
        domainScopes.forEach(scope => {
          document.cookie = `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${scope}`
        })
      }
    })

    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Dismiss cookie banner"
        className="absolute inset-0 bg-black/40 pointer-events-auto cursor-default"
        onClick={handleReject}
      />

      {/* Banner */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-consent-title"
        className="relative w-full max-w-2xl bg-bg-card border border-text-muted/20 rounded-lg shadow-2xl p-4 md:p-6 pointer-events-auto animate-slide-up"
      >
        {/* Close button (44x44 touch target) */}
        <button
          onClick={handleReject}
          className="absolute top-2 right-2 w-11 h-11 inline-flex items-center justify-center text-text-muted hover:text-text-primary transition-colors rounded-md"
          aria-label="Close cookie banner"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 md:gap-4 mb-4 pr-8">
          <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-brand/20 flex items-center justify-center">
            <Cookie className="w-5 h-5 md:w-6 md:h-6 text-brand" aria-hidden="true" />
          </div>
          <div className="flex-1 pt-1">
            <h2 id="cookie-consent-title" className="text-base md:text-lg font-semibold text-text-primary mb-2">
              Help us improve
            </h2>
            <p className="text-text-muted text-xs md:text-sm leading-relaxed">
              Google Analytics helps us see which features people use, so we can improve them. Anonymous, never sold. Umami (cookieless) runs either way.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
          <Button onClick={handleAccept} variant="primary" className="flex-1">
            Accept
          </Button>
          <Button onClick={handleReject} variant="secondary" className="flex-1">
            Reject
          </Button>
        </div>

        {/* Privacy link */}
        <p className="text-text-muted text-xs text-center mt-3">
          Read our{' '}
          <a href="/privacy" className="text-text-primary hover:text-text-primary/70 underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  )
}
