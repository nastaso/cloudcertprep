import { useState, useEffect } from 'react'
import { Cookie, X } from 'lucide-react'
import { Button } from './Button'

const CONSENT_KEY = 'cloudcertprep_cookie_consent'

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setIsVisible(false)
    
    // Dynamically load GA4 without page reload
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID
    if (measurementId && !measurementId.startsWith('%')) {
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
      document.head.appendChild(script)
      
      // Initialize GA4 dataLayer
      const w = window as typeof window & { dataLayer: unknown[] }
      w.dataLayer = w.dataLayer || []
      w.gtag = function(...args: unknown[]) { w.dataLayer.push(args) }
      w.gtag('js', new Date())
      w.gtag('config', measurementId)
    }
  }

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'rejected')
    setIsVisible(false)
  }

  const handleDismiss = () => {
    // Just hide for this session, will show again on next visit
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={handleDismiss} />
      
      {/* Banner */}
      <div className="relative w-full max-w-2xl bg-bg-card border border-text-muted/20 rounded-lg shadow-2xl p-4 md:p-6 pointer-events-auto animate-slide-up">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-text-muted hover:text-text-primary transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 md:gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-aws-orange/20 flex items-center justify-center">
            <Cookie className="w-5 h-5 md:w-6 md:h-6 text-aws-orange" />
          </div>
          <div className="flex-1 pt-1">
            <h2 className="text-base md:text-lg font-semibold text-text-primary mb-2">
              Help us improve
            </h2>
            <p className="text-text-muted text-xs md:text-sm leading-relaxed">
              We use analytics cookies to see how you use the site and make it better. All data is anonymous and never sold.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
          <Button onClick={handleAccept} variant="primary" className="flex-1">
            Accept
          </Button>
          <button
            onClick={handleReject}
            className="flex-1 bg-bg-dark hover:bg-bg-card-hover text-text-primary font-medium py-3 rounded-lg transition-colors"
          >
            Reject
          </button>
        </div>

        {/* Privacy link */}
        <p className="text-text-muted text-xs text-center mt-3">
          Read our{' '}
          <a href="/privacy" className="text-aws-orange hover:text-aws-orange/80 underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  )
}
