import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useSEO } from '../hooks/useSEO'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { trackEvent } from '../lib/analytics'
import { CloudOff } from 'lucide-react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'

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

  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full">
          <Card padding="lg" className="text-center">
            <CloudOff className="w-16 h-16 md:w-20 md:h-20 text-brand mx-auto mb-4" />
            
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary mb-3">
              404: Page not found
            </h1>
            
            <p className="text-sm md:text-base text-text-muted mb-6">
              This page must have migrated to another region.
            </p>
            
            <Button variant="primary" fullWidth onClick={goHome}>
              Back to home
            </Button>
          </Card>
        </div>
    </div>
  )
}
