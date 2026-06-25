import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { buttonClass } from '../lib/buttonStyles'

const GUEST_HERO_ID = 'home-guest-hero'

function setGuestHeroHidden(hidden: boolean) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(GUEST_HERO_ID)
  if (el) el.style.display = hidden ? 'none' : ''
}

interface HomeWelcomeProps {
  /** Default cert's dashboard (/{provider}/{code}) for the primary CTA. */
  dashboardHref: string
  /** Default cert short name, e.g. "CLF-C02", for the CTA label. */
  certShortName: string
}

/**
 * Returning-user home hero.
 *
 * The static guest billboard (`#home-guest-hero`, which carries the locked
 * HOME_H1) stays in the DOM for crawlers and logged-out users; a synchronous
 * pre-paint script in index.astro hides it before paint when a session token
 * exists (reusing `window.__ccHasSession`), so a signed-in visitor never sees
 * the guest marketing pitch flash. This client-only island is the
 * authoritative correction once getSession() resolves: it renders a calm
 * "welcome back" hero for a real session and re-shows the guest billboard for
 * everyone else (stale-token self-heal), mirroring CertDashboardIsland's
 * guest-view contract on the cert pages.
 */
export default function HomeWelcome({ dashboardHref, certShortName }: HomeWelcomeProps) {
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    setGuestHeroHidden(Boolean(user))
    return () => setGuestHeroHidden(false)
  }, [authLoading, user])

  // Logged-out (or still resolving): render nothing and leave the static guest
  // billboard visible. The pre-paint script handles the no-flash case.
  if (authLoading || !user) return null

  return (
    <section className="pt-10 md:pt-14 pb-12 md:pb-16">
      {/* No entrance animation: this island mounts AFTER auth resolves (the
          guest hero is already pre-hidden), so a .stagger fade-rise here reads
          as a flash on the post-login redirect. Appear cleanly instead. */}
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <p className="flex items-center gap-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-text-muted">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          Welcome back
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.025em] text-text-primary">
          Ready when you are.
        </h1>
        <p className="mt-4 max-w-2xl text-base md:text-lg text-text-muted leading-relaxed">
          Pick up your prep where you left off. Head to your dashboard, or choose a certification below.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={dashboardHref} className={buttonClass({ variant: 'brand', size: 'md' })}>
            Go to your {certShortName} dashboard
          </a>
          <a href="#certifications" className={buttonClass({ variant: 'ghost', size: 'md' })}>
            Browse certifications
          </a>
        </div>
      </div>
    </section>
  )
}
