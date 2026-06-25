import { Heart } from 'lucide-react'
import { KOFI_URL } from '../lib/constants'
import { trackEvent } from '../lib/analytics'

interface DonateButtonProps {
  isExamActive: boolean
}

/**
 * Floating "support the developer" affordance — bottom-left, desktop only.
 *
 * Visual: a small neutral surface PILL with a red heart icon and a visible
 * label (it used to be a heart that only revealed its label on hover, which
 * made it easy to miss). The heart carries the meaning; the surface is solid
 * `bg-bg-card` so it reads clearly without competing with the body CTAs that
 * own the brand orange. Hidden during a timed exam.
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
        className="flex items-center gap-2 bg-bg-card text-text-primary rounded-full pl-3 pr-4 py-2 shadow-card hover:shadow-card-hover border border-border-hairline hover:border-text-muted/40 transition-[box-shadow,transform,border-color] duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
      >
        <Heart
          className="w-[18px] h-[18px] shrink-0 text-danger group-hover:scale-110 transition-transform duration-300 ease-out"
          fill="currentColor"
          aria-hidden="true"
        />
        <span className="whitespace-nowrap font-medium text-sm">Support this project</span>
      </a>
    </div>
  )
}
