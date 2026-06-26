import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { KOFI_URL } from '../lib/constants'
import { trackEvent } from '../lib/analytics'

interface DonateButtonProps {
  isExamActive: boolean
  /** Current path, passed from Astro (Astro.url.pathname). Needed because this
   *  island is SSR'd (client:idle), where `window` is undefined - reading the
   *  path from `window` would skip the check on the server and bake the pill
   *  into the static HTML. */
  pathname?: string
}

/**
 * Floating "Support this project" affordance - bottom-left, desktop only.
 *
 * Visual: a small neutral surface PILL with a red heart icon and a visible
 * label (it used to be a heart that only revealed its label on hover, which
 * made it easy to miss). The heart carries the meaning; the surface is solid
 * `bg-bg-card` so it reads clearly without competing with the body CTAs that
 * own the brand orange. Hidden during a timed exam.
 */
export function DonateButton({ isExamActive, pathname }: DonateButtonProps) {
  // Hide the floating pill while the footer is on screen: the footer has its
  // own "Support this project" link, and a fixed bottom-left pill otherwise
  // sits ON TOP of the footer's first column on short pages. (Hooks run before
  // the isExamActive early-return so hook order stays stable.)
  const [nearFooter, setNearFooter] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    let io: IntersectionObserver | undefined
    const attach = () => {
      const footer = document.querySelector('footer')
      if (!footer) return false
      io = new IntersectionObserver(([e]) => setNearFooter(e.isIntersecting))
      io.observe(footer)
      return true
    }
    // The footer is a client:idle island and may hydrate a beat after this one.
    if (attach()) return () => io?.disconnect()
    const t = window.setTimeout(attach, 800)
    return () => { window.clearTimeout(t); io?.disconnect() }
  }, [])

  if (isExamActive) return null
  // Don't float the donate pill over the user's OWN data pages (stats / history
  // / account): on common desktop widths the fixed bottom-left pill overlaps the
  // left edge of the wide content cards, and a donate prompt over personal data
  // reads as nagging. The footer 'Support this project' link still carries the
  // ask on those pages. Uses the Astro-provided pathname (falls back to window
  // for safety) so the check holds during SSR, not just after hydration.
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  // Robust to the route in any form: '/stats' (dev), '/stats/' (trailing slash),
  // and '/stats.html' (the static `format: 'file'` build emits Astro.url.pathname
  // with the extension). The delimiter after the route name ('/', '.', or end)
  // also prevents false matches like '/statistics'.
  if (/^\/(stats|history|account)(\/|\.|$)/.test(path)) return null

  return (
    // Mounts on client:idle (after hydration), so it appears a beat after the
    // page. Fade it in rather than snapping into place. Reduced-motion users get
    // it instantly (global override neutralizes the animation).
    <div
      className={`hidden lg:block fixed bottom-6 left-6 z-40 group animate-fade-in transition-[opacity,transform] duration-gentle ease-out ${nearFooter ? 'pointer-events-none translate-y-3 opacity-0' : 'opacity-100'}`}
    >
      <a
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden={nearFooter}
        tabIndex={nearFooter ? -1 : undefined}
        onClick={() => trackEvent('donate_click', { location: 'floating' })}
        className="flex items-center gap-2 bg-bg-card text-text-primary rounded-full pl-3 pr-4 py-2 shadow-card hover:shadow-card-hover border border-border-hairline hover:border-text-muted/40 transition-[box-shadow,transform,border-color] duration-gentle ease-out hover:-translate-y-0.5 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark"
      >
        <Heart
          className="w-[18px] h-[18px] shrink-0 text-danger group-hover:scale-110 transition-transform duration-gentle ease-out"
          fill="currentColor"
          aria-hidden="true"
        />
        <span className="whitespace-nowrap font-medium text-sm">Support this project</span>
      </a>
    </div>
  )
}
