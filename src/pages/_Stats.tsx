import { useState, useEffect } from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { getSupabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import { formatTime } from '../lib/scoring'
import { CERTIFICATION_LIST, getCertTotalQuestions, getCertDomains } from '../data/certifications'
import { Trophy, TrendingUp, Clock, Check } from 'lucide-react'
import { logError } from '../lib/logger'

interface PlatformStats {
  total_users: number
  total_questions_answered: number
  total_exams_attempted: number
  total_exams_passed: number
}

interface RecentWin {
  passed_at: string
  scaled_score: number
  cert_code?: string
  time_taken_seconds?: number
}

interface CertStats {
  cert_code: string
  total_attempts: number
  total_passes: number
  avg_score: number
  avg_time_minutes: number
  fastest_pass_seconds: number | null
  domain_stats: DomainStat[]
  recent_passes: RecentWin[]
}

interface DomainStat {
  domain_id: number
  avg_score: number
}

export function Stats() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [certStats, setCertStats] = useState<Record<string, CertStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadStats() {
    try {
      setLoading(true)
      setError(null)

      const supabase = await getSupabase()
      // Load platform stats from singleton table
      const { data: statsData, error: statsError } = await supabase
        .from('platform_stats')
        .select('*')
        .eq('id', 'singleton')
        .single()

      if (statsError && statsError.code !== 'PGRST116') {
        logError('Stats.loadStats.platformStats', statsError)
      }

      if (statsData) {
        setStats(statsData)
      }

      // Load aggregate exam stats via SECURITY DEFINER RPC
      // (works for both logged-in and anonymous users without exposing exam_attempts rows)
      const { data: examStats, error: examStatsError } = await supabase
        .rpc('get_public_exam_stats')

      if (examStatsError) {
        logError('Stats.loadStats.examStats', examStatsError)
      }

      if (examStats?.cert_stats) {
        const certStatsMap: Record<string, CertStats> = {}
        for (const cs of examStats.cert_stats) {
          certStatsMap[cs.cert_code] = cs
        }
        setCertStats(certStatsMap)
      }

    } catch (err: unknown) {
      logError('Stats.loadStats', err)
      setError('Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Async setState (inside loadStats) is allowed by the rule's intent;
    // disabling the synchronous heuristic explicitly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <LoadingSpinner text="Loading stats..." />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Dataset JSON-LD and per-page metadata are emitted by the Astro
              shell (stats.astro) at build time, so the prerendered surface is
              authoritative. This island only renders live numbers; it never
              touches <head> or schema. */}

          {/* Header — MUST match the prerendered shell (stats.astro) H1 string,
              size, and weight exactly, with no breadcrumb, so swapping the
              snapshot for the live island causes no layout shift or flash on
              hydration (a11y finding 2 / Property 6 unaffected). */}
          <header className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary">Community statistics</h1>
            <p className="text-text-muted text-sm md:text-base">
              Aggregated, anonymous results from the CloudCertPrep community. Your individual scores stay private to your account.
            </p>
          </header>

          {error && (
            <Alert tone="danger" role="alert" className="text-danger">
              <p className="text-danger text-sm">{error}</p>
            </Alert>
          )}

          {/* Certification Sections */}
          {CERTIFICATION_LIST.map(cert => {
            const cs = certStats[cert.code]

            if (cert.status === 'coming-soon') {
              return (
                <div key={cert.code} className="bg-bg-card border border-border-hairline rounded-2xl p-4 md:p-6 shadow-card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold uppercase tracking-wide bg-warning/15 text-warning">Coming soon</span>
                        <h2 className="text-lg md:text-xl font-semibold tracking-[-0.01em] text-text-primary">{cert.shortName}</h2>
                      </div>
                      <p className="text-text-muted text-xs md:text-sm">{cert.name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-text-muted flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-text-primary text-sm md:text-base mb-1">
                        {getCertTotalQuestions(cert.code).toLocaleString()} practice questions available
                      </p>
                      <p className="text-text-muted text-xs md:text-sm">
                        Community stats will appear here once users start taking exams.
                      </p>
                    </div>
                  </div>
                </div>
              )
            }

            if (!cs) {
              // Active cert with no live snapshot/RPC row yet (e.g. AIF-C01
              // before its first completed attempt). The prerendered shell
              // (stats.astro) renders a "Not enough attempts yet" card for this
              // cert, so the island MUST render the same card — otherwise the
              // cert is visible on first paint then vanishes on hydration (CLS +
              // shell/island inconsistency, audit R2/24.26). Mirrors the shell's
              // empty-state contract.
              return (
                <Card key={cert.code} padding="md">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold uppercase tracking-wide bg-success/15 text-success">Active</span>
                    <h2 className="text-lg md:text-xl font-semibold tracking-[-0.01em] text-text-primary">{cert.shortName}</h2>
                  </div>
                  <p className="text-text-muted text-sm">
                    Not enough attempts yet. Be the first to set the community benchmark.{' '}
                    <a href={`/aws/${cert.code}/practice-exam`} className="text-text-primary hover:text-text-primary/70 underline">
                      Start practicing →
                    </a>
                  </p>
                </Card>
              )
            }

            return (
              <Card key={cert.code} padding="md">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-success/20 text-success">ACTIVE</span>
                      <h2 className="text-lg md:text-xl font-semibold text-text-primary">{cert.shortName}</h2>
                    </div>
                    <p className="text-text-muted text-xs md:text-sm">{cert.name}</p>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{cs.total_attempts.toLocaleString()}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Total Attempts</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{cs.total_passes.toLocaleString()}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Total Passes</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">
                      {cs.total_attempts > 0 ? Math.round((cs.total_passes / cs.total_attempts) * 100) : 0}%
                    </p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Pass Rate</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{Math.round(cs.avg_score)}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Avg Score (Passed)</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{Math.round(cs.avg_time_minutes)} min</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Avg Time (Passed)</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">
                      {cs.fastest_pass_seconds ? formatTime(cs.fastest_pass_seconds) : 'N/A'}
                    </p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Fastest Pass</p>
                  </div>
                </div>

                {/* Domain Difficulty Ranking */}
                {cs.domain_stats && cs.domain_stats.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm md:text-base font-semibold text-text-primary mb-3">Domain Difficulty (Hardest First)</h3>
                    <div className="space-y-3">
                      {(() => {
                        const certDomainNames = getCertDomains(cs.cert_code)
                        return cs.domain_stats.map((ds, index) => {
                          const domainName = certDomainNames[ds.domain_id] ?? `Domain ${ds.domain_id}`
                          return (
                        <div key={ds.domain_id}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-text-muted text-xs font-medium">#{index + 1}</span>
                              <p className="text-text-primary text-xs md:text-sm font-medium">{domainName}</p>
                            </div>
                            <p className="font-mono text-xs md:text-sm text-text-muted tabular-nums">{Math.round(ds.avg_score)}% avg</p>
                          </div>
                          <div className="h-1.5 bg-bg-dark rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${ds.avg_score < 60 ? 'bg-danger' : ds.avg_score < 75 ? 'bg-warning' : 'bg-success'}`}
                              style={{ width: `${Math.min(100, ds.avg_score)}%` }}
                            />
                          </div>
                        </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {/* Recent Passes */}
                {cs.recent_passes && cs.recent_passes.length > 0 && (
                  <div>
                    <h3 className="text-sm md:text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-success" />
                      Recent Passes
                    </h3>
                    <div className="space-y-2">
                      {cs.recent_passes.map((pass, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-bg-dark rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                              <Check className="w-4 h-4 text-success" />
                            </div>
                            <div>
                              <p className="font-mono text-text-primary font-semibold text-sm md:text-base tabular-nums">{pass.scaled_score}/1000</p>
                              <div className="flex items-center gap-2 text-text-muted text-xs">
                                <span>{formatRelativeDate(pass.passed_at)}</span>
                                {pass.time_taken_seconds && (
                                  <>
                                    <span>•</span>
                                    <Clock className="w-3 h-3 inline" />
                                    <span>{formatTime(pass.time_taken_seconds)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}

          {/* Platform Totals */}
          {stats && (
            <div className="border-t border-text-muted/10 pt-6">
              <p className="text-text-muted text-xs md:text-sm text-center">
                {stats.total_users.toLocaleString()} users • {stats.total_questions_answered.toLocaleString()} questions answered across all certifications
              </p>
            </div>
          )}
        </div>
    </div>
  )
}
