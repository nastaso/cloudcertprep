import { useState, useEffect, useLayoutEffect } from 'react'
import { Skeleton } from '../components/Skeleton'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { getSupabase } from '../lib/supabase'
import { formatRelativeDate } from '../lib/formatting'
import { formatTime } from '../lib/scoring'
import { getSortedCerts, getCertTotalQuestions, getCertDomains, DEFAULT_CERT_ID } from '../data/certifications'
import { Trophy, TrendingUp, Clock, Check, RotateCw } from 'lucide-react'
import { logError } from '../lib/logger'

interface PublicTotals {
  total_users: number
  total_questions_answered: number
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

interface StatsProps {
  /** Suppress the first-load skeleton (the prerendered snapshot stands in). */
  hideInitialSkeleton?: boolean
  /** Fired once the first data load settles, so the host can swap the snapshot. */
  onLoaded?: () => void
}

export function Stats({ hideInitialSkeleton = false, onLoaded }: StatsProps = {}) {
  const [publicTotals, setPublicTotals] = useState<PublicTotals | null>(null)
  const [certStats, setCertStats] = useState<Record<string, CertStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // True once a fetch has actually succeeded. The prerendered snapshot is hidden
  // ONLY then (not on an errored settle), so a flaky first load keeps the real
  // cached numbers instead of swapping them for an error over empty placeholders.
  const [liveLoaded, setLiveLoaded] = useState(false)

  async function loadStats() {
    let ok = false
    try {
      setLoading(true)
      setError(null)
      // Reset the footer so a retry can never leave a stale totals line from a
      // prior success next to freshly retried cert stats; it only re-renders
      // from a fresh, validated RPC result below.
      setPublicTotals(null)

      const supabase = await getSupabase()
      // Load live totals via SECURITY DEFINER RPC (bypasses RLS on auth.users /
      // attempt_questions). Falls back silently if the function is not yet
      // deployed on this env - the footer just won't render rather than erroring.
      const { data: totalsData, error: totalsError } = await supabase
        .rpc('get_public_totals')

      if (totalsError) {
        logError('Stats.loadStats.publicTotals', totalsError)
      } else if (
        Number.isFinite(totalsData?.total_users) &&
        Number.isFinite(totalsData?.total_questions_answered) &&
        totalsData.total_users > 0
      ) {
        // Shape-validated before storing: a drifted return (missing/null field,
        // RETURNS TABLE array wrapping) must hide the footer, not throw in
        // render. Zero users hides it too instead of bragging about "0 users".
        setPublicTotals(totalsData)
      }

      // Load aggregate exam stats via SECURITY DEFINER RPC
      // (works for both logged-in and anonymous users without exposing exam_attempts rows)
      const { data: examStats, error: examStatsError } = await supabase
        .rpc('get_public_exam_stats')

      if (examStatsError) {
        // postgrest-js resolves almost every failure (rate limit, restart,
        // missing function) as {error} rather than throwing, so a resolved
        // error must fail the load too - otherwise the snapshot is swapped
        // for "Be the first" placeholders with no error UI and no retry.
        logError('Stats.loadStats.examStats', examStatsError)
        setError('Failed to load statistics')
      }

      if (examStats?.cert_stats) {
        const certStatsMap: Record<string, CertStats> = {}
        for (const cs of examStats.cert_stats) {
          certStatsMap[cs.cert_code] = cs
        }
        setCertStats(certStatsMap)
      }
      ok = !examStatsError

    } catch (err: unknown) {
      logError('Stats.loadStats', err)
      setError('Failed to load statistics')
    } finally {
      setLoading(false)
      // Hide the prerendered snapshot ONLY on a successful load (a single
      // forward swap to live numbers). On an errored first load we keep it, so
      // the real cached numbers stay on screen behind a compact retry. The
      // actual hide happens in the layout effect below, not here directly
      // (FLASH F3).
      if (ok) {
        setLiveLoaded(true)
      }
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats()
  }, [])

  // Calling onLoaded() (which hides the prerendered snapshot) directly inside
  // loadStats raced React's own commit: the snapshot's <h1> could be hidden
  // before the live view's <h1> had actually painted, producing a one-frame
  // gap where no heading was visible (FLASH F3). useLayoutEffect runs
  // synchronously after the DOM has been updated with the live content but
  // before the browser paints, so the snapshot-hide and the live-content-show
  // land in the same frame - there is never a frame with zero (or two) <h1>s.
  useLayoutEffect(() => {
    if (liveLoaded) onLoaded?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLoaded])

  // First-load phase: the prerendered snapshot is still standing in (it is
  // hidden only on a SUCCESSFUL load). Never replace it with a skeleton or the
  // empty-placeholder grid. While fetching, render nothing (the snapshot is the
  // loading state); on a flaky load, show a compact retry OVER the real cached
  // numbers instead of an error banner above wrong "Be the first" placeholders.
  if (hideInitialSkeleton && !liveLoaded) {
    if (error) {
      return (
        <div className="p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Alert tone="danger" role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing the latest saved figures. We could not refresh the live statistics.</span>
              <button
                type="button"
                onClick={() => loadStats()}
                className="inline-flex min-h-[44px] flex-shrink-0 items-center justify-center gap-2 rounded-full border border-danger/40 px-5 text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </Alert>
          </div>
        </div>
      )
    }
    return null
  }

  if (loading) {
    // A re-fetch after live data is already present: show the real skeleton
    // (the snapshot is gone), never null (which would blank the page).
    // Skeleton shaped like the stats page (header + cert cards), matching the
    // real wrapper so there is no jump when the live numbers resolve.
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8" aria-busy="true">
          <header className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary">Community statistics</h1>
            <p className="text-text-muted text-sm md:text-base">
              Aggregated, anonymous results from the CloudCertPrep community. Your individual scores stay private to your account.
            </p>
          </header>
          <p className="sr-only" role="status">Loading community statistics</p>
          {[0, 1].map(i => (
            <div key={i} className="bg-bg-card border border-border-hairline rounded-2xl p-4 md:p-6" aria-hidden="true">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {[0, 1, 2, 3, 4, 5].map(j => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
            <Alert tone="danger" role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>We could not load the community statistics. Check your connection and try again.</span>
              <button
                type="button"
                onClick={() => loadStats()}
                className="inline-flex min-h-[44px] flex-shrink-0 items-center justify-center gap-2 rounded-full border border-danger/40 px-5 text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </Alert>
          )}

          {/* Certification Sections. Same ordering as the home grid
              (UI-PERFECTION S1): getSortedCerts() puts active certs before
              coming-soon ones, then the flagship cert (DEFAULT_CERT_ID) leads
              the actives. This also matches the prerendered snapshot's cert
              order (stats.astro renders CERTIFICATIONS insertion order:
              CLF -> AIF), so the snapshot -> live swap never visibly reorders
              the certs. */}
          {[...getSortedCerts()].sort((a, b) =>
            a.code === DEFAULT_CERT_ID ? -1 : b.code === DEFAULT_CERT_ID ? 1 : 0,
          ).map(cert => {
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
                        {getCertTotalQuestions(cert.code).toLocaleString('en-US')} questions authored so far
                      </p>
                      <p className="text-text-muted text-xs md:text-sm">
                        Question bank in development. Community stats will appear here once users start taking exams.
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
                      <span className="px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold uppercase tracking-wide bg-success/15 text-success">Active</span>
                      <h2 className="text-lg md:text-xl font-semibold text-text-primary">{cert.shortName}</h2>
                    </div>
                    <p className="text-text-muted text-xs md:text-sm">{cert.name}</p>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{cs.total_attempts.toLocaleString('en-US')}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Total attempts</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{cs.total_passes.toLocaleString('en-US')}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Total passes</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">
                      {cs.total_attempts > 0 ? Math.round((cs.total_passes / cs.total_attempts) * 100) : 0}%
                    </p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Pass rate</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{Math.round(cs.avg_score)}</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Avg score (passed)</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">{Math.round(cs.avg_time_minutes)} min</p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Avg time (passed)</p>
                  </div>
                  <div>
                    <p className="font-mono text-2xl md:text-3xl font-semibold tabular-nums text-text-primary">
                      {cs.fastest_pass_seconds ? formatTime(cs.fastest_pass_seconds) : 'N/A'}
                    </p>
                    <p className="text-text-muted text-xs md:text-sm mt-1">Fastest pass</p>
                  </div>
                </div>

                {/* Domain Difficulty Ranking */}
                {cs.domain_stats && cs.domain_stats.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm md:text-base font-semibold text-text-primary mb-3">Domain difficulty (hardest first)</h3>
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
                          <div className="h-1.5 bg-text-muted/15 rounded-full overflow-hidden">
                            <div
                              className={`h-full w-full origin-left transition-transform duration-settle ease-out ${ds.avg_score < 60 ? 'bg-danger' : ds.avg_score < 75 ? 'bg-warning-fill' : 'bg-success'}`}
                              style={{ transform: `scaleX(${Math.min(100, ds.avg_score) / 100})` }}
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
                      Recent passes
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
                                    <span>·</span>
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

          {/* Platform Totals - live counts via get_public_totals() RPC */}
          {publicTotals && (
            <div className="border-t border-text-muted/10 pt-6">
              <p className="text-text-muted text-xs md:text-sm text-center">
                {publicTotals.total_users.toLocaleString('en-US')} users · {publicTotals.total_questions_answered.toLocaleString('en-US')} questions answered across all certifications
              </p>
            </div>
          )}
        </div>
    </div>
  )
}
