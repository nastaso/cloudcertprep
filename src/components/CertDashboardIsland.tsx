/**
 * CertDashboardIsland — authenticated dashboard for a single Cert_Landing.
 *
 * The Cert_Landing prerenders the GUEST SEO view as static Astro markup
 * (hero, bullets, AboutCard, FAQ). This island is mounted with
 * `client:only="react"` AFTER that static guest view. On mount:
 *
 *   - If the visitor is NOT logged in, the island renders nothing and leaves
 *     the static guest view (#cert-guest-view) visible — crawlers and
 *     logged-out users keep the prerendered SEO content.
 *   - If the visitor IS logged in, the island hides the static guest view and
 *     renders the authenticated dashboard (Practice Modes, Recent Attempts,
 *     Domain Mastery), ported from the original CertLanding component
 *     with identical Tailwind classes.
 *
 * Navigation uses real hrefs / window.location.assign because each Cert_Landing
 * is a separate prerendered Astro document, not an SPA route.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  FileText,
  RotateCw,
  Target,
} from 'lucide-react'
import { Alert } from './Alert'
import { useAuth } from '../hooks/useAuth'
import { getSupabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import { formatDuration } from '../lib/scoring'
import { logError } from '../lib/logger'
import { CERTIFICATIONS } from '../data/certifications'
import { LEVEL_ACCENT_UI_HEX, LEVEL_ACCENT_UI_RGB } from '../lib/levelAccent'
import { calculateDomainMastery } from '../lib/domainStats'
import type { DomainProgress } from '../types'

/** Minimal domain shape needed by the dashboard sidebar. */
interface CertDomainProp {
  id: number
  name: string
  questionCount: number
  /** URL slug for the per-domain landing (/{provider}/{code}/{slug}). */
  slug: string
}

/** Serialised cert fields passed from the Astro page. */
export interface CertDashboardCert {
  code: string
  name: string
  shortName: string
  provider: string
  examQuestionCount: number
  examTimeSeconds: number
  passingScore: number
  domains: CertDomainProp[]
}

interface RecentAttempt {
  id: string
  attempted_at: string
  score_percent: number
  scaled_score: number
  passed: boolean
  time_taken_seconds: number
}

const GUEST_VIEW_ID = 'cert-guest-view'

/** Compact stat tile for the dashboard summary strip. */
function StatTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-bg-card border border-border-hairline rounded-2xl p-4 md:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl md:text-4xl font-semibold tabular-nums tracking-tight text-text-primary leading-none">
        {value}
        {suffix && <span className="ml-1 text-lg md:text-xl text-text-muted font-medium">{suffix}</span>}
      </p>
    </div>
  )
}

// Loading placeholder for a StatTile: keeps the (static) label, swaps the value
// for a pulsing bar so a returning user never sees a flash of "0" before their
// real numbers resolve. The pulse is neutralized under prefers-reduced-motion
// by the global block in index.css.
function SkeletonStatTile({ label }: { label: string }) {
  return (
    <div className="bg-bg-card border border-border-hairline rounded-2xl p-4 md:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <div className="mt-3 h-8 w-16 rounded bg-text-muted/15 animate-pulse" aria-hidden="true" />
    </div>
  )
}

function setGuestViewHidden(hidden: boolean) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(GUEST_VIEW_ID)
  if (el) el.style.display = hidden ? 'none' : ''
}

function CertDashboard({ cert }: { cert: CertDashboardCert }) {
  const { user, loading: authLoading } = useAuth()
  const [domainProgress, setDomainProgress] = useState<DomainProgress[]>([])
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([])
  const [examCount, setExamCount] = useState(0)
  // Data-fetch status for the data-dependent sections (stat strip, domain
  // mastery, recent attempts). While loading, they render a skeleton instead
  // of a flash of all-zeros (which reads as a wiped account to a returning
  // user); on a hard failure they render an inline error with retry instead of
  // a silently-empty dashboard. `reloadKey` re-runs the fetch without remount.
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const examMinutes = Math.round(cert.examTimeSeconds / 60)
  const certPath = `/${cert.provider}/${cert.code}`

  // Show/hide the static prerendered guest view based on resolved auth state.
  // A synchronous inline script in the cert page already pre-hides the guest
  // view before paint when a session token exists (avoids the flash on load
  // and bfcache Back); this effect is the authoritative correction once
  // getSession() resolves (re-shows on stale token, hides for real users).
  useEffect(() => {
    if (authLoading) return
    setGuestViewHidden(!!user)
    return () => setGuestViewHidden(false)
  }, [authLoading, user])

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    void (async () => {
      const supabase = await getSupabase()
      if (cancelled) return
      await Promise.all([
        supabase
          .from('domain_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('cert_code', cert.code),
        supabase
          .from('exam_attempts')
          // Only the columns RecentAttempt renders — keeps the domain_scores
          // JSONB out of the list-view egress.
          .select('id, attempted_at, score_percent, scaled_score, passed, time_taken_seconds', { count: 'exact' })
          .eq('user_id', user.id)
          .eq('cert_code', cert.code)
          .order('attempted_at', { ascending: false })
          .limit(5),
      ])
        .then(([progressRes, attemptsRes]) => {
          if (cancelled) return
          if (progressRes.error) logError('CertDashboard.loadProgress', progressRes.error)
          if (attemptsRes.error) logError('CertDashboard.loadAttempts', attemptsRes.error)
          if (progressRes.data) setDomainProgress(progressRes.data as DomainProgress[])
          if (attemptsRes.data) setRecentAttempts(attemptsRes.data as RecentAttempt[])
          if (typeof attemptsRes.count === 'number') setExamCount(attemptsRes.count)
          // Surface an error only when BOTH queries failed; a partial failure
          // still has useful data to show. Either way the skeleton resolves.
          if (progressRes.error && attemptsRes.error) setDataError(true)
          setDataLoading(false)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          logError('CertDashboard.loadDashboardData', error)
          setDataError(true)
          setDataLoading(false)
        })
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, cert.code, reloadKey])

  // Logged-out (or still resolving): render nothing. The static guest view
  // stays visible.
  if (authLoading || !user) return null

  // Level accent ties the signed-in dashboard to the cert's identity (same
  // hue as the guest hero's blueprint panel and the OG tile art).
  const level = CERTIFICATIONS[cert.code]?.level
  // UI-accent variant (not the pale badge color): Foundational's silver reads
  // washed-out on the light dashboard, so the dot/halo/bars use a darker slate.
  const levelAccent = level ? LEVEL_ACCENT_UI_HEX[level] : '#FF9900'
  // RGB triplet (not hex) for the .halo --halo-color custom property, so the
  // primary practice cards bloom in the cert's level hue (P1-10).
  const levelAccentRgb = level ? LEVEL_ACCENT_UI_RGB[level] : '255 153 0'
  const levelLabel = level ? level.charAt(0).toUpperCase() + level.slice(1) : ''

  // Honest aggregates from the complete domain_progress rows (not the capped
  // recent-attempts list): total questions practiced and overall accuracy.
  // Each row is capped at its domain's current bank size: stale rows written
  // before a bank trim can carry counts above the live total (the >100% bug).
  const domainCap = new Map(cert.domains.map(d => [d.id, d.questionCount]))
  const questionsPracticed = domainProgress.reduce(
    (sum, d) => sum + Math.min(d.questions_attempted || 0, domainCap.get(d.domain_id) ?? Infinity), 0)
  const questionsCorrect = domainProgress.reduce(
    (sum, d) => sum + Math.min(d.questions_correct || 0, domainCap.get(d.domain_id) ?? Infinity), 0)
  const accuracy = questionsPracticed > 0 ? Math.round((questionsCorrect / questionsPracticed) * 100) : 0
  const bestScore = recentAttempts.reduce((max, a) => Math.max(max, a.scaled_score), 0)

  return (
    <div className="max-w-6xl mx-auto pt-6 md:pt-10 pb-16 md:pb-24 space-y-8 md:space-y-10 stagger" aria-busy={dataLoading}>
        {/* Page header: mono kicker + tracked h1 (DSv6 ladder, hero-scale) */}
        <header>
          <p className="flex items-center gap-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-text-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: levelAccent }}
              aria-hidden="true"
            />
            {levelLabel ? `${levelLabel} · ` : ''}Your dashboard
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-[-0.025em] text-text-primary">
            {cert.name} <span className="text-text-muted">({cert.shortName})</span>
          </h1>
        </header>

        {/* Stat strip: honest, beautified big-number summary. While the fetch
            is in flight, show a skeleton (never a flash of all-zeros); on a
            hard failure, an inline error with retry instead of false zeros. */}
        {dataError ? (
          <Alert
            tone="danger"
            role="alert"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>We could not load your latest progress. Check your connection and try again.</span>
            <button
              type="button"
              onClick={() => { setDataError(false); setDataLoading(true); setReloadKey(k => k + 1) }}
              className="inline-flex min-h-[44px] flex-shrink-0 items-center justify-center gap-2 rounded-full border border-danger/40 px-5 text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {dataLoading ? (
              <>
                <SkeletonStatTile label="Questions practiced" />
                <SkeletonStatTile label="Accuracy" />
                <SkeletonStatTile label="Mock exams" />
                <SkeletonStatTile label="Best score" />
              </>
            ) : (
              <>
                <StatTile label="Questions practiced" value={questionsPracticed.toLocaleString()} />
                <StatTile label="Accuracy" value={String(accuracy)} suffix="%" />
                <StatTile label="Mock exams" value={String(examCount)} />
                <StatTile label="Best score" value={bestScore > 0 ? String(bestScore) : '0'} suffix={bestScore > 0 ? '/1000' : undefined} />
              </>
            )}
          </div>
        )}

        {/* Practice Modes: the two primary actions, full-width prominent cards. */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-4">
            Start practicing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href={`${certPath}/practice-exam`}
              style={{ '--halo-color': levelAccentRgb } as CSSProperties}
              className="halo group bg-bg-card hover:bg-bg-card-hover p-6 md:p-7 rounded-2xl border border-border-hairline hover:border-text-muted/50 transition-[background-color,border-color] duration-200 text-left block"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-bg-dark border border-border-hairline">
                <FileText className="w-5 h-5 text-text-primary" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg md:text-xl font-semibold tracking-[-0.01em] text-text-primary">
                Mock exam
                <ArrowRight
                  className="ml-1.5 inline-block w-4 h-4 align-[-2px] text-text-muted transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </h3>
              <p className="mt-2 text-sm text-text-muted leading-relaxed">
                Full-length, timed, scored exactly like the real exam.
              </p>
              <p className="mt-3 font-mono text-[12px] tracking-wide text-text-muted">
                {cert.examQuestionCount} questions · {examMinutes} min · pass {cert.passingScore}/1000
              </p>
            </a>

            <a
              href={`${certPath}/domain-practice`}
              style={{ '--halo-color': levelAccentRgb } as CSSProperties}
              className="halo group bg-bg-card hover:bg-bg-card-hover p-6 md:p-7 rounded-2xl border border-border-hairline hover:border-text-muted/50 transition-[background-color,border-color] duration-200 text-left block"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-bg-dark border border-border-hairline">
                <Target className="w-5 h-5 text-text-primary" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg md:text-xl font-semibold tracking-[-0.01em] text-text-primary">
                Domain practice
                <ArrowRight
                  className="ml-1.5 inline-block w-4 h-4 align-[-2px] text-text-muted transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </h3>
              <p className="mt-2 text-sm text-text-muted leading-relaxed">
                One domain at a time, with instant feedback and explanations.
              </p>
              <p className="mt-3 font-mono text-[12px] tracking-wide text-text-muted">
                spaced repetition · targets your weak areas
              </p>
            </a>
          </div>
        </section>

        {/* Domain Mastery: full-width grid of domain cards (fills the page and
            scales with the domain count). Hidden on a hard fetch error (the
            stat-strip alert covers it); skeleton cards while loading. */}
        {!dataError && (
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-4">
            Domain mastery
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {dataLoading
              ? cert.domains.map(domain => (
                  <div
                    key={domain.id}
                    className="rounded-2xl border border-border-hairline bg-bg-card p-5 md:p-6 animate-pulse"
                    aria-hidden="true"
                  >
                    <div className="h-4 w-2/3 rounded bg-text-muted/15" />
                    <div className="mt-5 h-1.5 w-full rounded-full bg-text-muted/15" />
                    <div className="mt-4 h-3 w-1/2 rounded bg-text-muted/10" />
                  </div>
                ))
              : cert.domains.map(domain => {
              const progress = domainProgress.find(d => d.domain_id === domain.id)
              // Cap displayed figures to the current bank, and DERIVE mastery from
              // the bank-capped `correct` below rather than the stored mastery_percent.
              // The stored value goes stale when the bank changes (questions added/
              // moved/removed) and, once clamped, would render a misleading e.g. 100%
              // next to "81 of 133 correct". updateDomainProgress rewrites the stored
              // value correctly on the next practice session; the one-time cleanup
              // (08/22) fixes existing rows in bulk.
              const attempted = Math.min(progress?.questions_attempted || 0, domain.questionCount)
              const correct = Math.min(progress?.questions_correct || 0, attempted)
              const mastery = calculateDomainMastery(correct, domain.id, cert.code)
              return (
                <a
                  key={domain.id}
                  href={`${certPath}/${domain.slug}`}
                  aria-label={`Practice ${domain.name} (${mastery}% mastery)`}
                  className="group block bg-bg-card border border-border-hairline rounded-2xl p-5 md:p-6 transition-[background-color,border-color] duration-200 hover:bg-bg-card-hover hover:border-text-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-semibold tracking-[-0.01em] leading-snug text-text-primary">
                      {domain.name}
                      <ArrowRight
                        className="ml-1.5 inline-block w-4 h-4 align-[-2px] text-text-muted transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </h3>
                    <span className="font-mono text-2xl font-semibold tabular-nums leading-none text-text-primary">
                      {mastery}<span className="text-base text-text-muted">%</span>
                    </span>
                  </div>
                  <div
                    className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-bg-dark"
                    role="progressbar"
                    aria-valuenow={mastery}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`${mastery}% mastery`}
                    aria-label={`${domain.name} mastery`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${mastery}%`, backgroundColor: levelAccent }}
                    />
                  </div>
                  <p className="mt-2.5 font-mono text-[12px] text-text-muted">
                    {attempted} of {domain.questionCount} practiced · {correct} correct
                  </p>
                </a>
              )
            })}
          </div>
        </section>
        )}

        {/* Recent Attempts: hairline list, mono scores. Hidden on a hard fetch
            error; skeleton rows while loading. */}
        {!dataError && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary">
              Recent attempts
            </h2>
            {recentAttempts.length > 0 && (
              <a
                href="/history"
                className="group text-text-primary hover:text-text-primary/70 text-xs md:text-sm font-medium inline-flex items-center gap-1"
              >
                View all{' '}
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </a>
            )}
          </div>

          {dataLoading ? (
            <div className="bg-bg-card rounded-2xl border border-border-hairline shadow-card divide-y divide-border-hairline/60">
              {[0, 1, 2].map(i => (
                <div key={i} className="px-5 py-4 flex items-center justify-between gap-4 animate-pulse" aria-hidden="true">
                  <div className="flex items-center gap-4">
                    <div className="h-5 w-12 rounded-full bg-text-muted/15" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-20 rounded bg-text-muted/15" />
                      <div className="h-3 w-28 rounded bg-text-muted/10" />
                    </div>
                  </div>
                  <div className="h-5 w-10 rounded bg-text-muted/15" />
                </div>
              ))}
            </div>
          ) : recentAttempts.length === 0 ? (
            <div className="bg-bg-card rounded-2xl border border-border-hairline p-8 md:p-10 text-center">
              <p className="text-text-primary font-medium">No attempts yet</p>
              <p className="mt-1 text-sm text-text-muted">Take your first mock exam to start tracking your progress.</p>
              <a
                href={`${certPath}/practice-exam`}
                className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-cta px-6 text-sm font-medium text-on-cta transition-colors duration-200 hover:bg-cta-hover"
              >
                Start a mock exam
              </a>
            </div>
          ) : (
            <div className="bg-bg-card rounded-2xl border border-border-hairline shadow-card divide-y divide-border-hairline/60">
              {recentAttempts.map(attempt => (
                <a
                  key={attempt.id}
                  href="/history"
                  className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-bg-card-hover transition-colors duration-200 first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${attempt.passed ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
                    >
                      {attempt.passed ? 'Pass' : 'Fail'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-text-primary tabular-nums">
                        {attempt.scaled_score}<span className="text-text-muted">/1000</span>
                      </p>
                      <p className="font-mono text-[12px] text-text-muted">
                        {formatRelativeDate(attempt.attempted_at)} ·{' '}
                        {formatDuration(attempt.time_taken_seconds)}
                      </p>
                    </div>
                  </div>
                  <p className="font-mono text-lg md:text-xl font-semibold text-text-primary tabular-nums">
                    {Math.round(attempt.score_percent)}<span className="text-sm text-text-muted">%</span>
                  </p>
                </a>
              ))}
            </div>
          )}
        </section>
        )}
    </div>
  )
}

export default function CertDashboardIsland({ cert }: { cert: CertDashboardCert }) {
  return <CertDashboard cert={cert} />
}
