import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSEO } from '../hooks/useSEO'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { trackEvent } from '../lib/analytics'
import { Button } from '../components/Button'

export function NotFound() {
  const location = useLocation()
  const { goHome } = useCertNavigate()
  useSEO({
    title: '404 · Page not found · CloudCertPrep',
    description: 'The page you were looking for does not exist.',
    canonical: null,
  })

  useEffect(() => {
    trackEvent('page_not_found', { path: location.pathname })
  }, [location.pathname])

  // Mirrors the static 404.astro exactly (mono number + 'Page not found' + the
  // same subline + 'Back to home'), so an in-app SPA miss and a static-host miss
  // are one consistent experience.
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <h1 className="font-mono text-7xl md:text-8xl font-bold tracking-tight text-text-primary mb-4">404</h1>
      <p className="text-xl font-semibold tracking-[-0.01em] text-text-primary mb-2">Page not found</p>
      <p className="text-text-muted mb-8 max-w-md">{"The page you're looking for doesn't exist or has been moved."}</p>
      <Button variant="primary" onClick={goHome}>Back to home</Button>
      <a href="/#certifications" className="mt-4 text-sm text-text-muted underline underline-offset-2 hover:text-text-primary transition-colors">
        Browse certifications
      </a>
    </div>
  )
}
