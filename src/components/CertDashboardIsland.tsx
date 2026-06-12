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
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  FileText,
  Target,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import { formatDuration } from '../lib/scoring'
import { logError } from '../lib/logger'
import { CERTIFICATIONS } from '../data/certifications'
import { LEVEL_ACCENT_HEX } from '../lib/levelAccent'
import type { DomainProgress } from '../types'

/** Minimal domain shape needed by the dashboard sidebar. */
interface CertDomainProp {
  id: number
  name: string
  questionCount: number
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

    Promise.all([
      supabase
        .from('domain_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('cert_code', cert.code),
      supabase
        .from('exam_attempts')
        .select('*', { count: 'exact' })
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
      })
      .catch((error: unknown) => {
        if (cancelled) return
        logError('CertDashboard.loadDashboardData', error)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, user, cert.code])

  // Logged-out (or still resolving): render nothing. The static guest view
  // stays visible.
  if (authLoading || !user) return null

  // Level accent ties the signed-in dashboard to the cert's identity (same
  // hue as the guest hero's blueprint panel and the OG tile art).
  const level = CERTIFICATIONS[cert.code]?.level
  const levelAccent = level ? LEVEL_ACCENT_HEX[level] : '#FF9900'
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
    <div className="max-w-6xl mx-auto pt-6 md:pt-10 pb-16 md:pb-24 space-y-8 md:space-y-10">
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

        {/* Stat strip: honest, beautified big-number summary. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatTile label="Questions practiced" value={questionsPracticed.toLocaleString()} />
          <StatTile label="Accuracy" value={String(accuracy)} suffix="%" />
          <StatTile label="Mock exams" value={String(examCount)} />
          <StatTile label="Best score" value={bestScore > 0 ? String(bestScore) : '0'} suffix={bestScore > 0 ? '/1000' : undefined} />
        </div>

        {/* Practice Modes: the two primary actions, full-width prominent cards. */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-4">
            Start practising
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href={`${certPath}/practice-exam`}
              className="group bg-bg-card hover:bg-bg-card-hover p-6 md:p-7 rounded-2xl border border-border-hairline hover:border-text-muted/50 transition-[background-color,border-color] duration-200 text-left block"
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
              className="group bg-bg-card hover:bg-bg-card-hover p-6 md:p-7 rounded-2xl border border-border-hairline hover:border-text-muted/50 transition-[background-color,border-color] duration-200 text-left block"
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
            scales with the domain count). */}
        <section>
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-4">
            Domain mastery
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {cert.domains.map(domain => {
              const progress = domainProgress.find(d => d.domain_id === domain.id)
              // Clamp every displayed figure to the current bank: a stale
              // domain_progress row (written before a bank trim) must never
              // render >100% mastery or "91 of 78 practised".
              const mastery = Math.min(100, Math.round(progress?.mastery_percent || 0))
              const attempted = Math.min(progress?.questions_attempted || 0, domain.questionCount)
              const correct = Math.min(progress?.questions_correct || 0, attempted)
              return (
                <div key={domain.id} className="bg-bg-card border border-border-hairline rounded-2xl p-5 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-semibold tracking-[-0.01em] leading-snug text-text-primary">
                      {domain.name}
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
                    aria-label={`${domain.name} mastery`}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${mastery}%`, backgroundColor: levelAccent }}
                    />
                  </div>
                  <p className="mt-2.5 font-mono text-[12px] text-text-muted">
                    {attempted} of {domain.questionCount} practised · {correct} correct
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Recent Attempts: hairline list, mono scores. */}
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

          {recentAttempts.length === 0 ? (
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
    </div>
  )
}

export default function CertDashboardIsland({ cert }: { cert: CertDashboardCert }) {
  return <CertDashboard cert={cert} />
}
