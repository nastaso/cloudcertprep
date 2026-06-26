/**
 * DomainProgressStrip — logged-in personalization for a single Domain_Landing.
 *
 * The Domain_Landing (/aws/:cert/:domain) is prerendered SEO content (intro,
 * sample questions, FAQ) that stays visible for EVERYONE, guests included. This
 * island adds an authenticated-only strip at the top of the content sheet so a
 * signed-in visitor isn't dropped onto a page with no sense of their progress
 * and no route back to their dashboard (the gap the owner flagged).
 *
 * Mounted with `client:only="react"`. On mount:
 *   - Guests (and visitors still resolving auth without a pre-paint session)
 *     render NOTHING — the SEO page is untouched.
 *   - Returning users (pre-paint `cc-authed`) get a skeleton while the single
 *     domain_progress row loads, then this domain's mastery, a "practice this
 *     domain" CTA, and a link back to their cert dashboard.
 *
 * Navigation uses real hrefs: each Domain_Landing is its own prerendered Astro
 * document, not an SPA route.
 */
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { calculateDomainMastery } from '../lib/domainStats'
import { buttonClass } from '../lib/buttonStyles'
import { logError } from '../lib/logger'
import type { DomainProgress } from '../types'

export interface DomainProgressStripProps {
  certCode: string
  certShortName: string
  domainId: number
  domainName: string
  /** Total questions in this domain's bank (the mastery/coverage denominator). */
  questionCount: number
  /** Deep-link into domain practice for THIS domain (?domain=<id>). */
  domainPracticeHref: string
  /** The cert hub, which renders the signed-in dashboard. */
  certPath: string
  /** UI-accent hex for the progress fill (level color, light-surface tuned). */
  accentHex: string
}

/** Shared outer shell so the skeleton and the loaded strip line up exactly. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <aside className="mb-10 md:mb-14 rounded-2xl border border-border-hairline bg-bg-card shadow-card p-5 md:p-6">
      {children}
    </aside>
  )
}

function Skeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8" aria-hidden="true">
        <div className="min-w-0 flex-1 animate-pulse">
          <div className="h-3 w-28 rounded bg-text-muted/15" />
          <div className="mt-3 h-8 w-24 rounded bg-text-muted/15" />
          <div className="mt-3 h-1.5 w-full max-w-xs rounded-full bg-text-muted/10" />
          <div className="mt-3 h-3 w-40 rounded bg-text-muted/10" />
        </div>
        <div className="h-12 w-full rounded-full bg-text-muted/10 sm:w-44" />
      </div>
    </Shell>
  )
}

function Strip(props: DomainProgressStripProps) {
  const { certCode, certShortName, domainId, domainName, questionCount, domainPracticeHref, certPath, accentHex } = props
  const { user, loading: authLoading } = useAuth()
  // Pre-paint hint: BaseLayout adds `cc-authed` before first paint when a
  // session token exists. Read it synchronously so a returning user gets a
  // skeleton (not a flash of nothing) while auth resolves, while a guest never
  // sees the strip blink in and out on this SEO page.
  const [authedHint] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('cc-authed'))
  const [progress, setProgress] = useState<DomainProgress | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    void (async () => {
      const supabase = await getSupabase()
      if (cancelled) return
      const { data, error } = await supabase
        .from('domain_progress')
        .select('domain_id, cert_code, questions_attempted, questions_correct, mastery_percent')
        .eq('user_id', user.id)
        .eq('cert_code', certCode)
        .eq('domain_id', domainId)
        .maybeSingle()
      if (cancelled) return
      if (error) logError('DomainProgressStrip.load', error)
      else setProgress((data as DomainProgress | null) ?? null)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [authLoading, user, certCode, domainId])

  // Resolving auth: a returning user gets the skeleton; a guest gets nothing.
  if (authLoading) return authedHint ? <Skeleton /> : null
  if (!user) return null
  if (!loaded) return <Skeleton />

  // Cap to the live bank (stale rows can exceed it) and DERIVE mastery from the
  // capped `correct`, matching the cert dashboard's domain cards exactly.
  const attempted = Math.min(progress?.questions_attempted ?? 0, questionCount)
  const correct = Math.min(progress?.questions_correct ?? 0, attempted)
  const mastery = calculateDomainMastery(correct, domainId, certCode)
  const started = attempted > 0

  return (
    <Shell>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text-muted">
            {/* Brand DASH, not a colored dot (which reads as paused/status). */}
            <span className="h-0.5 w-[18px] rounded-full bg-brand" aria-hidden="true" />
            Your progress
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums leading-none text-text-primary">
              {mastery}<span className="text-lg text-text-muted">%</span>
            </span>
            <span className="text-sm text-text-muted">mastery</span>
          </div>
          <div
            className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-text-muted/15"
            role="progressbar"
            aria-valuenow={mastery}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${mastery}% mastery`}
            aria-label={`${domainName} mastery`}
          >
            <div
              className="h-full w-full origin-left transition-transform duration-settle ease-out"
              style={{ transform: `scaleX(${mastery / 100})`, backgroundColor: accentHex }}
            />
          </div>
          <p className="mt-2.5 font-mono text-[12px] text-text-muted">
            {started
              ? `${attempted} of ${questionCount} practiced · ${correct} correct`
              : `Not started yet · ${questionCount} questions in this domain`}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <a href={domainPracticeHref} className={`group ${buttonClass({ variant: 'brand', size: 'md' })}`}>
            {started ? 'Keep practicing' : 'Practice this domain'}
            <ArrowRight
              className="ml-1.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </a>
          <a
            href={certPath}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-text-muted transition-colors duration-200 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Your {certShortName} dashboard
          </a>
        </div>
      </div>
    </Shell>
  )
}

export default function DomainProgressStrip(props: DomainProgressStripProps) {
  return <Strip {...props} />
}
