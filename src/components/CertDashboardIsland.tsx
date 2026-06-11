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
  Check,
  FileText,
  Target,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import { formatDuration } from '../lib/scoring'
import { logError } from '../lib/logger'
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

function setGuestViewHidden(hidden: boolean) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(GUEST_VIEW_ID)
  if (el) el.style.display = hidden ? 'none' : ''
}

function CertDashboard({ cert }: { cert: CertDashboardCert }) {
  const { user, loading: authLoading } = useAuth()
  const [domainProgress, setDomainProgress] = useState<DomainProgress[]>([])
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([])

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
        .select('*')
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

  return (
    <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="md:col-span-2 space-y-8">
            {/* Practice Modes */}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-6">
                {cert.name} ({cert.shortName})
              </h1>
              <h2 className="text-xl md:text-2xl font-semibold text-text-primary mb-4">
                Practice Modes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <a
                  href={`${certPath}/practice-exam`}
                  className="bg-bg-card hover:bg-bg-card-hover p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-brand transition-all text-left block"
                >
                  <FileText className="w-8 h-8 md:w-10 md:h-10 text-brand mb-2" />
                  <h3 className="text-base md:text-lg font-semibold text-text-primary mb-1 md:mb-2">
                    Practice Exam
                  </h3>
                  <p className="text-text-muted text-xs md:text-sm">
                    {cert.examQuestionCount} questions, {examMinutes} minutes, pass
                    at {cert.passingScore}/1000
                  </p>
                </a>

                <a
                  href={`${certPath}/domain-practice`}
                  className="bg-bg-card hover:bg-bg-card-hover p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-brand transition-all text-left block"
                >
                  <Target className="w-8 h-8 md:w-10 md:h-10 text-brand mb-2" />
                  <h3 className="text-base md:text-lg font-semibold text-text-primary mb-1 md:mb-2">
                    Domain Practice
                  </h3>
                  <p className="text-text-muted text-xs md:text-sm">
                    Practice by domain, instant feedback
                  </p>
                </a>
              </div>
            </div>

            {/* Recent Attempts */}
            <div className="hidden md:block">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl md:text-2xl font-semibold text-text-primary">
                  Recent Attempts
                </h2>
                <a
                  href="/history"
                  className="text-text-primary hover:text-text-primary/70 text-xs md:text-sm font-medium inline-flex items-center gap-1"
                >
                  View All <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              {recentAttempts.length === 0 ? (
                <div className="bg-bg-card rounded-lg p-8 text-center shadow-card">
                  <p className="text-text-muted">
                    No exam attempts yet. Start with a practice exam!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentAttempts.map(attempt => (
                    <div
                      key={attempt.id}
                      className="bg-bg-card rounded-lg p-4 flex items-center justify-between shadow-card"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center ${attempt.passed ? 'bg-success/20' : 'bg-danger/20'}`}
                        >
                          {attempt.passed ? (
                            <Check className="w-6 h-6 text-success" />
                          ) : (
                            <X className="w-6 h-6 text-danger" />
                          )}
                        </div>
                        <div>
                          <p className="text-text-primary font-medium">
                            {attempt.passed ? 'Passed' : 'Failed'} ·{' '}
                            {attempt.scaled_score}/1000
                          </p>
                          <p className="text-text-muted text-sm">
                            {formatRelativeDate(attempt.attempted_at)} ·{' '}
                            {formatDuration(attempt.time_taken_seconds)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-text-primary">
                          {Math.round(attempt.score_percent)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Domain Mastery sidebar */}
          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-text-primary mb-4">
              Domain Mastery
            </h2>
            <div className="space-y-3 md:space-y-6">
              {cert.domains.map(domain => {
                const progress = domainProgress.find(d => d.domain_id === domain.id)
                const mastery = progress?.mastery_percent || 0
                return (
                  <div
                    key={domain.id}
                    className="bg-bg-card rounded-lg p-4 md:p-6 shadow-card"
                  >
                    <div className="flex items-center justify-between mb-3 md:mb-4">
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="text-sm md:text-lg font-semibold text-text-primary mb-1 leading-tight text-balance">
                          {domain.name}
                        </h3>
                        <p className="text-text-muted text-xs md:text-sm">
                          {progress?.questions_attempted || 0}/{domain.questionCount}{' '}
                          attempted, {progress?.questions_correct || 0} correct
                        </p>
                      </div>
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-base md:text-xl font-bold flex-shrink-0 bg-brand text-on-brand">
                        {Math.round(mastery)}%
                      </div>
                    </div>
                    <div className="w-full h-2 bg-bg-dark rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-500 bg-brand"
                        style={{ width: `${mastery}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
    </div>
  )
}

export default function CertDashboardIsland({ cert }: { cert: CertDashboardCert }) {
  return <CertDashboard cert={cert} />
}
