import { Lock } from 'lucide-react'
import { Button } from '../Button'
import { trackEvent } from '../../lib/analytics'

/**
 * Where on the site this UnlockCTA panel is rendered. The string is sent
 * as a Umami event dimension (and GA4, when re-enabled) so we can split
 * sign-in conversion by placement and decide which deserve more prominence.
 */
export type UnlockCTALocation =
  | 'mock_exam_start'
  | 'exam_results'
  | 'domain_practice_wall'
  | 'practice_results'
  | 'header'

interface UnlockCTAProps {
  /** Click handler — typically `() => goToLogin(navigate, location)`. */
  onSignIn: () => void
  /** Analytics dimension: which placement of this panel was clicked. */
  location: UnlockCTALocation
  /** Override the default headline. */
  title?: string
  /** Override the default body copy. */
  body?: string
  /** Override the default button label. */
  ctaLabel?: string
  /** Drop the top margin when the panel is the first element in its parent. */
  noTopMargin?: boolean
}

/**
 * Sign-in CTA panel rendered for guests at multiple placements (home page
 * About card, cert landing About card, MockExam start screen, DomainPractice
 * selection screen). The `location` prop is required so analytics can
 * distinguish which placement is driving conversions.
 */
export function UnlockCTA({
  onSignIn,
  location,
  title = 'Unlock all features',
  body = 'Sign in to unlock domain practice, adaptive spaced repetition, and review your exam attempt history.',
  ctaLabel = 'Sign in / Sign up',
  noTopMargin = false,
}: UnlockCTAProps) {
  function handleClick() {
    trackEvent('unlock_cta_clicked', { location })
    onSignIn()
  }

  return (
    <div
      className={`${noTopMargin ? '' : 'mt-6 '}p-5 md:p-6 bg-brand/10 border border-brand/30 rounded-2xl`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-4 h-4 md:w-5 md:h-5 text-brand" />
        <p className="text-text-primary font-medium text-sm md:text-base">{title}</p>
      </div>
      <p className="text-text-muted text-xs md:text-sm mb-3">{body}</p>
      <Button onClick={handleClick} variant="primary" size="sm" fullWidth>
        {ctaLabel}
      </Button>
    </div>
  )
}
