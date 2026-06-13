import { Heart } from 'lucide-react'
import { KOFI_URL } from '../lib/constants'
import { trackEvent } from '../lib/analytics'

interface DonateButtonProps {
  isExamActive: boolean
}

/**
 * Floating "support the developer" affordance — bottom-left, desktop only.
 *
 * Visual: a small neutral surface card with a red heart icon. The heart
 * carries the meaning ("love / support"); the surface is the same
 * `bg-bg-card` as every other card on the page, so the float doesn't
 * compete with body CTAs that own the brand orange. Hover reveals the
 * tooltip text. Hidden during a timed exam.
 */
export function DonateButton({ isExamActive }: DonateButtonProps) {
  if (isExamActive) return null

  return (
    <div className="hidden lg:block fixed bottom-6 left-6 z-40 group">
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('donate_click', { location: 'floating' })}
        className="flex items-center bg-bg-card/90 backdrop-blur-md text-text-primary rounded-full shadow-card hover:shadow-card-hover border border-border-hairline hover:border-text-muted/40 transition-[box-shadow,transform,border-color] duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
        aria-label="Support CloudCertPrep"
      >
        <div className="w-10 h-10 flex items-center justify-center">
          <Heart
            className="w-[18px] h-[18px] text-danger group-hover:scale-110 transition-transform duration-300 ease-out"
            fill="currentColor"
            aria-hidden="true"
          />
        </div>
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:pr-4 transition-all duration-300 ease-out font-medium text-sm">
          Support the developer
        </span>
      </a>
    </div>
  )
}
