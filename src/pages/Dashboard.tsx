import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCert, setActiveCert } from '../hooks/useCert'
import { useSEO } from '../hooks/useSEO'
import { ROUTE_SEO } from '../lib/seo-data'
import { FAQ } from '../components/FAQ'
import { Header } from '../components/Header'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { supabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import type { DomainProgress } from '../types'
import { formatDuration } from '../lib/scoring'
import { CERTIFICATION_LIST } from '../data/certifications'
import { FileText, Target, BarChart3, Lock, Check, X, ArrowRight, Github, Repeat } from 'lucide-react'
import { Button } from '../components/Button'
import { logError } from '../lib/logger'
import { GITHUB_REPO_URL } from '../lib/constants'

interface RecentAttempt {
  id: string
  attempted_at: string
  score_percent: number
  scaled_score: number
  passed: boolean
  time_taken_seconds: number
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const cert = useCert()

  // Cert-aware SEO for both states: title and meta description always include the
  // active cert's full name AND short code. This serves both 'AWS Cloud Practitioner'
  // and 'CLF-C02' search queries from a single landing page that scales to N certs.
  useSEO({
    title: user
      ? `${cert.shortName} practice · CloudCertPrep`
      : `Free ${cert.name} (${cert.shortName}) Practice Exams · CloudCertPrep`,
    description: user
      ? ROUTE_SEO['/'].description
      : `Free ${cert.name} (${cert.shortName}) practice exams. Timed mock exams, domain practice with adaptive spaced repetition. No signup, no ads, MIT licensed.`,
    canonical: '/',
  })

  const [domainProgress, setDomainProgress] = useState<DomainProgress[]>([])
  const [recentAttempts, setRecentAttempts] = useState<RecentAttempt[]>([])

  // Fetch dashboard data inline in the effect using a Promise chain.
  // setStates happen inside .then()/.catch() callbacks (async, not synchronous),
  // which satisfies react-hooks/set-state-in-effect. The `cancelled` flag
  // prevents setting state on an unmounted or stale-cert component.
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
        if (progressRes.error) {
          logError('Dashboard.loadDashboardData.progress', progressRes.error)
        }
        if (attemptsRes.error) {
          logError('Dashboard.loadDashboardData.attempts', attemptsRes.error)
        }
        if (progressRes.data) {
          setDomainProgress(progressRes.data)
        }
        if (attemptsRes.data) {
          setRecentAttempts(attemptsRes.data)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        logError('Dashboard.loadDashboardData', error)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, user, cert.code])

  if (authLoading) {
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="flex-1 flex items-center justify-center p-8">
          <LoadingSpinner text="Loading..." />
        </div>
      </div>
    )
  }

  // No cert param = landing page with cert selector
  const examMinutes = Math.round(cert.examTimeSeconds / 60)

  return (
    <div className="bg-bg-dark flex flex-col">
      <Header showNav={true} />
      <div className="p-4 md:p-8">
        <div className={user ? "max-w-7xl mx-auto" : "max-w-4xl mx-auto"}>
        <div className={user ? "grid grid-cols-1 lg:grid-cols-3 gap-8" : ""}>
          <div className={user ? "lg:col-span-2 space-y-8" : "space-y-8"}>
            {/* Hero Section - Logged Out Users Only */}
            {!user && (
              <div className="text-center py-4 md:py-8">
                {/* Cert toggle is shown only when 2+ certs are 'active'. While only
                    one cert is live, hiding the toggle keeps the hero clean. The
                    toggle re-appears automatically when a second cert flips its
                    status to 'active' in src/data/certifications.ts. */}
                {CERTIFICATION_LIST.filter(c => c.status === 'active').length > 1 && (
                  <div className="inline-flex items-center gap-1.5 p-1 bg-bg-card rounded-full border border-aws-orange/20 mb-6 md:mb-8">
                    {CERTIFICATION_LIST.map(c => (
                      <button
                        key={c.code}
                        onClick={() => setActiveCert(c.code)}
                        className={`px-3 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-colors ${
                          cert.code === c.code
                            ? 'bg-aws-orange text-white shadow-sm'
                            : c.status === 'coming-soon'
                            ? 'text-text-muted/60 cursor-not-allowed'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                        disabled={c.status === 'coming-soon'}
                        title={c.status === 'coming-soon' ? 'Coming soon' : c.name}
                      >
                        {c.shortName}
                        {c.status === 'coming-soon' && <span className="ml-1 text-[10px] opacity-70">soon</span>}
                      </button>
                    ))}
                  </div>
                )}

                <h1 className="text-3xl md:text-5xl font-bold text-text-primary mb-4 md:mb-6">
                  Free {cert.name} <span className="whitespace-nowrap">({cert.shortName})</span>
                  <span className="block text-aws-orange mt-2">Practice Exams</span>
                </h1>
                <p className="text-lg md:text-xl text-text-muted mb-6 md:mb-8 max-w-2xl mx-auto">
                  Practice realistic AWS exam questions with adaptive domain mastery, randomised exams, and unlimited free attempts.
                </p>

                {/* Single decisive CTA. Domain practice is discoverable via the
                    Header nav and the Spaced Repetition bullet in the About card. */}
                <div className="flex justify-center mb-4 md:mb-6">
                  <Link
                    to="/practice-exam"
                    className="inline-flex items-center justify-center px-8 md:px-10 py-3 md:py-4 bg-aws-orange hover:bg-aws-orange/90 text-white rounded-lg transition-colors text-base md:text-lg font-semibold shadow-lg hover:shadow-xl"
                  >
                    Start Practice Exam
                  </Link>
                </div>

                {/* Trust row - low visual weight credentials sitting under the
                    CTA. Supports the click decision rather than competing with
                    it. Question count is hardcoded for now - TODO has an entry
                    to derive it from the JSON files at build time. */}
                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-text-muted text-sm md:text-base mb-3 list-none p-0">
                  <li className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-aws-orange" aria-hidden="true" /> 100% Free</li>
                  <li className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-aws-orange" aria-hidden="true" /> Open Source</li>
                  <li className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-aws-orange" aria-hidden="true" /> No Ads</li>
                  <li className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-aws-orange" aria-hidden="true" /> 1,050+ Questions</li>
                </ul>

                {/* Roadmap signal - acknowledges the multi-cert future without
                    over-promising. Italic + muted = clearly secondary content. */}
                <p className="text-text-muted/70 text-xs md:text-sm italic">
                  Supporting additional AWS certifications soon.
                </p>
              </div>
            )}

            {/* Cert Toggle - logged-in users only (guests have it in the hero) */}
            {user && (
              <div>
                <div className="flex items-center gap-2">
                  {CERTIFICATION_LIST.map(c => (
                    <button
                      key={c.code}
                      onClick={() => setActiveCert(c.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        cert.code === c.code
                          ? 'bg-aws-orange text-white'
                          : c.status === 'coming-soon'
                          ? 'bg-bg-card text-text-muted/50 cursor-not-allowed'
                          : 'bg-bg-card text-text-muted hover:text-text-primary'
                      }`}
                      disabled={c.status === 'coming-soon'}
                      title={c.status === 'coming-soon' ? 'Coming soon' : c.name}
                    >
                      {c.shortName}
                      {c.status === 'coming-soon' && <span className="ml-1 text-[10px]">(soon)</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Practice Modes - logged-in users only (guests have hero CTAs) */}
            {user && (
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-text-primary mb-4">
                  {cert.shortName} Practice Modes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <Link
                    to="/practice-exam"
                    className="bg-bg-card hover:bg-bg-card-hover p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-aws-orange transition-all"
                  >
                    <FileText className="w-8 h-8 md:w-10 md:h-10 text-aws-orange mb-2" />
                    <h3 className="text-base md:text-lg font-semibold text-text-primary mb-1 md:mb-2">Practice Exam</h3>
                    <p className="text-text-muted text-xs md:text-sm">{cert.examQuestionCount} questions • {examMinutes} minutes • Pass at {cert.passingScore}/1000</p>
                  </Link>

                  <Link
                    to="/domain-practice"
                    className="bg-bg-card hover:bg-bg-card-hover p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-aws-orange transition-all"
                  >
                    <Target className="w-8 h-8 md:w-10 md:h-10 text-aws-orange mb-2" />
                    <h3 className="text-base md:text-lg font-semibold text-text-primary mb-1 md:mb-2">Domain Practice</h3>
                    <p className="text-text-muted text-xs md:text-sm">Practice by domain • Instant feedback</p>
                  </Link>
                </div>
              </div>
            )}

            {/* Recent Attempts */}
            {user && (
              <div className="hidden lg:block">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl md:text-2xl font-semibold text-text-primary">Recent Attempts</h2>
                  <Link to="/history" className="text-aws-orange hover:text-aws-orange/80 text-xs md:text-sm font-medium inline-flex items-center gap-1">
                    View All <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                
                {recentAttempts.length === 0 ? (
                  <div className="bg-bg-card rounded-lg p-8 text-center shadow-card">
                    <p className="text-text-muted">No exam attempts yet. Start with a practice exam!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAttempts.map(attempt => (
                      <div key={attempt.id} className="bg-bg-card rounded-lg p-4 flex items-center justify-between shadow-card">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${attempt.passed ? 'bg-success/20' : 'bg-danger/20'}`}>
                            {attempt.passed ? (
                              <Check className="w-6 h-6 text-success" />
                            ) : (
                              <X className="w-6 h-6 text-danger" />
                            )}
                          </div>
                          <div>
                            <p className="text-text-primary font-medium">
                              {attempt.passed ? 'Passed' : 'Failed'} • {attempt.scaled_score}/1000
                            </p>
                            <p className="text-text-muted text-sm">
                              {formatRelativeDate(attempt.attempted_at)} • {formatDuration(attempt.time_taken_seconds)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-text-primary">{Math.round(attempt.score_percent)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Guest welcome */}
            {!user && (
              <div className="space-y-6">
                {/* About CloudCertPrep - bullets restructured around present,
                    demonstrable FEATURES rather than commodity claims. Commodity
                    claims (free, open source, no ads, question count) live in
                    the hero trust row. This card goes deeper on what the
                    platform actually does today, with the cert-specific
                    'Multi-Certification' aspiration removed for Phase 1. */}
                <div>
                  <h2 className="text-xl md:text-2xl font-semibold text-text-primary mb-4">About CloudCertPrep</h2>
                  <div className="bg-bg-card rounded-lg p-4 md:p-6 shadow-card">
                    <div className="space-y-3 md:space-y-4">
                      <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 md:w-6 md:h-6 text-aws-orange flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-text-primary font-medium text-sm md:text-base">Realistic Exam Simulation</p>
                          <p className="text-text-muted text-xs md:text-sm">Full-length, timed mock exams that mirror the real AWS format: {cert.examQuestionCount} questions, {Math.round(cert.examTimeSeconds / 60)} minutes, scored 100 to 1000 (pass at {cert.passingScore}).</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Repeat className="w-5 h-5 md:w-6 md:h-6 text-aws-orange flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-text-primary font-medium text-sm md:text-base">Adaptive Spaced Repetition</p>
                          <p className="text-text-muted text-xs md:text-sm">Domain practice prioritises questions you've gotten wrong or haven't seen, weighted by your past performance.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-aws-orange flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-text-primary font-medium text-sm md:text-base">Domain Mastery Analytics</p>
                          <p className="text-text-muted text-xs md:text-sm">Track performance across every exam domain. Identify weak areas, focus practice where it matters most, and watch your scores climb over time.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Github className="w-5 h-5 md:w-6 md:h-6 text-aws-orange flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-text-primary font-medium text-sm md:text-base">100% Free & Open Source</p>
                          <p className="text-text-muted text-xs md:text-sm">
                            MIT licensed. No ads, no paywalls, no premium tiers. Codebase on{' '}
                            <a
                              href={GITHUB_REPO_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-aws-orange hover:text-aws-orange/80 underline"
                            >
                              GitHub
                            </a>.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Unlock all features CTA - the only action button on this card.
                        Mentions spaced repetition explicitly because it's the killer
                        feature that requires authentication (uses question_mastery view
                        keyed by user_id). */}
                    <div className="mt-6 p-3 md:p-4 bg-aws-orange/10 border border-aws-orange rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock className="w-4 h-4 md:w-5 md:h-5 text-aws-orange" />
                        <p className="text-aws-orange font-medium text-sm md:text-base">Unlock all features</p>
                      </div>
                      <p className="text-text-muted text-xs md:text-sm mb-3">
                        Sign in to unlock domain practice, adaptive spaced repetition, and review your exam attempt history.
                      </p>
                      <Button
                        onClick={() => navigate('/login')}
                        variant="primary"
                        size="sm"
                        fullWidth
                      >
                        Sign in / Sign up
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Community Statistics link temporarily hidden until we have more users
                    (matches Footer.tsx). Restore the <Link to="/stats"> block when ready. */}
              </div>
            )}
          </div>

          {/* Right Column - Domain Mastery */}
          {user && (
            <div>
              <h2 className="text-xl md:text-2xl font-semibold text-text-primary mb-4">Domain Mastery</h2>
              
              <div className="space-y-3 md:space-y-6">
                {cert.domains.map(domain => {
                  const progress = domainProgress.find(d => d.domain_id === domain.id)
                  const mastery = progress?.mastery_percent || 0
                  
                  return (
                    <div key={domain.id} className="bg-bg-card rounded-lg p-4 md:p-6 shadow-card">
                      <div className="flex items-center justify-between mb-3 md:mb-4">
                        <div className="flex-1 min-w-0 pr-3">
                          <h3 className="text-sm md:text-lg font-semibold text-text-primary mb-1 truncate">
                            {domain.name}
                          </h3>
                          <p className="text-text-muted text-xs md:text-sm">
                            {progress?.questions_attempted || 0}/{domain.questionCount} attempted • {progress?.questions_correct || 0} correct
                          </p>
                        </div>
                        <div 
                          className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-base md:text-xl font-bold flex-shrink-0 bg-aws-orange/20 text-aws-orange"
                        >
                          {Math.round(mastery)}%
                        </div>
                      </div>
                      <div className="w-full h-2 bg-bg-dark rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-500 bg-aws-orange"
                          style={{ width: `${mastery}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* FAQ section for guests: backs the FAQPage JSON-LD in index.html
            and adds substantial indexable content to the homepage. Pass
            cert.code so future SAA-C03-tagged entries get filtered correctly. */}
        {!user && <FAQ certCode={cert.code} />}
        </div>
      </div>
    </div>
  )
}