import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { goToLogin } from '../lib/navigation'
import { useAuth } from '../hooks/useAuth'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { useSEO } from '../hooks/useSEO'
import { getSupabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { Skeleton } from '../components/Skeleton'
import type { Question, ExamAttempt } from '../types'
import { formatDuration } from '../lib/scoring'
import { formatRelativeDate } from '../lib/formatting'
import { loadAllQuestions } from '../data/questions'
import { CERTIFICATIONS, getCertDomains } from '../data/certifications'
import { Modal } from '../components/Modal'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { TrendingUp, Check, X, Trash2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { filterChipClass, inputClass, reviewCellClass } from '../lib/buttonStyles'

interface AttemptQuestionRow {
  question_id: string
  user_answer: string | null
  is_correct: boolean
  was_flagged: boolean
  domain_id: number
}

type ReviewFilter = 'all' | 'incorrect' | 'flagged'
type ResultFilter = 'all' | 'passed' | 'failed'
/** Special value for the cert filter representing "all certifications". */
const CERT_FILTER_ALL = '__all__'

/** Sentinel for the "All" pagination size. Replaces the prior magic number. */
const PAGE_SIZE_ALL = Number.MAX_SAFE_INTEGER

function AttemptReviewPanel({
  aqList,
  questionBank,
  domains,
  certCode,
  reviewFilter,
  reviewDomainFilter,
  reviewQuestionIndex,
  onFilterChange,
  onDomainFilterChange,
  onQuestionIndexChange,
}: {
  aqList: AttemptQuestionRow[]
  questionBank: Question[]
  domains: Record<number, string>
  certCode: string
  reviewFilter: ReviewFilter
  reviewDomainFilter: number | null
  reviewQuestionIndex: number
  onFilterChange: (f: ReviewFilter) => void
  onDomainFilterChange: (d: number | null) => void
  onQuestionIndexChange: (i: number) => void
}) {
  const filtered = aqList.filter(aq => {
    if (reviewFilter === 'incorrect' && aq.is_correct) return false
    if (reviewFilter === 'flagged' && !aq.was_flagged) return false
    if (reviewDomainFilter !== null && aq.domain_id !== reviewDomainFilter) return false
    return true
  })
  const currentAq = filtered[reviewQuestionIndex]
  const originalQ = currentAq ? questionBank.find(q => q.id === currentAq.question_id) : null

  return (
    <div className="space-y-3">
      {/* Review Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'incorrect', 'flagged'] as const).map(f => {
          const count = f === 'all' ? aqList.length
            : f === 'incorrect' ? aqList.filter(q => !q.is_correct).length
            : aqList.filter(q => q.was_flagged).length
          const isDisabled = f !== 'all' && count === 0
          return (
            <button
              key={f}
              onClick={() => { if (!isDisabled) { onFilterChange(f); onQuestionIndexChange(0) } }}
              disabled={isDisabled}
              aria-pressed={reviewFilter === f}
              className={`${filterChipClass({ active: reviewFilter === f, surface: 'dark', size: 'sm' })} ${
                isDisabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {f === 'all' ? 'All' : f === 'incorrect' ? 'Incorrect' : 'Flagged'} ({count})
            </button>
          )
        })}
      </div>

      {/* Domain Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { onDomainFilterChange(null); onQuestionIndexChange(0) }}
          aria-pressed={reviewDomainFilter === null}
          className={filterChipClass({ active: reviewDomainFilter === null, surface: 'dark', size: 'sm' })}
        >
          All Domains
        </button>
        {Object.entries(domains).map(([id, name]) => {
          const domainId = Number(id)
          return (
            <button
              key={domainId}
              onClick={() => { onDomainFilterChange(reviewDomainFilter === domainId ? null : domainId); onQuestionIndexChange(0) }}
              aria-pressed={reviewDomainFilter === domainId}
              className={filterChipClass({ active: reviewDomainFilter === domainId, surface: 'dark', size: 'sm' })}
            >
              {name}
            </button>
          )
        })}
      </div>

      {/* Question Number Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(32px,32px))] md:grid-cols-[repeat(auto-fit,minmax(36px,36px))] gap-0.5 md:gap-1 justify-center">
        {aqList.map((aq, idx) => {
          const isInFiltered = filtered.some(f => f.question_id === aq.question_id)
          const isCurrent = currentAq?.question_id === aq.question_id
          const stateLabel = aq.is_correct ? 'correct' : 'incorrect'
          const flagLabel = aq.was_flagged ? ', flagged' : ''
          const ariaLabel = `Question ${idx + 1}: ${stateLabel}${flagLabel}`
          return (
            <button
              key={idx}
              onClick={() => {
                const fIdx = filtered.findIndex(f => f.question_id === aq.question_id)
                if (fIdx !== -1) onQuestionIndexChange(fIdx)
              }}
              disabled={!isInFiltered}
              aria-label={ariaLabel}
              aria-current={isCurrent ? 'true' : undefined}
              className={reviewCellClass({
                correct: aq.is_correct,
                current: isCurrent,
                flagged: aq.was_flagged,
                inSet: isInFiltered,
              })}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-success/15 border border-success/30"></span> Correct</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-danger/10 border border-danger/25"></span> Incorrect</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-bg-dark ring-2 ring-warning"></span> Flagged</span>
      </div>

      {/* Current Question Display */}
      {currentAq && originalQ ? (
        <QuestionReviewCard
          question={originalQ}
          userAnswer={currentAq.user_answer || ''}
          isCorrect={currentAq.is_correct}
          wasFlagged={currentAq.was_flagged}
          questionNumber={reviewQuestionIndex + 1}
          totalQuestions={filtered.length}
          certCode={certCode}
        />
      ) : filtered.length === 0 ? (
        <div className="bg-bg-dark rounded-lg p-4 text-center">
          <p className="text-text-muted text-sm">No questions match the selected filters.</p>
        </div>
      ) : null}
    </div>
  )
}

export function History() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { goCertExam } = useCertNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])

  // Multi-cert: no single "active" cert. Title and meta are platform-level.
  useSEO({
    title: 'Exam history · CloudCertPrep',
    description:
      'Track your practice exam history, scores, and domain mastery across every certification on CloudCertPrep.',
    // /history ships robots=noindex (R2.7); no canonical on a noindex page. (M0d)
    canonical: null,
  })

  // /history is per-user content (logged-out: sign-in funnel; logged-in:
  // private exam history). Neither variant adds canonical SEO value over
  // /aws/<cert> landings, so it is unconditionally noindex.

  const [filter, setFilter] = useState<ResultFilter>('all')
  const [certFilter, setCertFilter] = useState<string>(CERT_FILTER_ALL)
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState<number>(3)
  const [currentPage, setCurrentPage] = useState(1)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  // Question review state. The question bank is cached per cert so users with
  // attempts in multiple certs don't re-fetch the bank when they expand
  // attempts across cert boundaries.
  const [questionBanks, setQuestionBanks] = useState<Map<string, Question[]>>(new Map())
  const [attemptQuestions, setAttemptQuestions] = useState<Map<string, AttemptQuestionRow[]>>(new Map())
  const [reviewLoading, setReviewLoading] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [reviewDomainFilter, setReviewDomainFilter] = useState<number | null>(null)
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0)

  async function loadHistory() {
    try {
      setLoadError(false)
      if (!user?.id) {
        setAttempts([])
        setLoading(false)
        return
      }

      const supabase = await getSupabase()
      const { data, error } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('user_id', user.id)
        .order('attempted_at', { ascending: false })

      if (error) throw error
      setAttempts(data || [])
    } catch (error: unknown) {
      logError('History.loadHistory', error)
      // Surface the failure instead of falling through to the 'no attempts yet'
      // empty state, which would tell a returning user their history is gone.
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) {
      // loadHistory is async; setState happens after await, not synchronously
      // in the effect body. The lint rule's synchronous heuristic flags this
      // as a false positive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadHistory()
    }
    // We intentionally exclude `loadHistory` from deps; it would re-create
    // every render and re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  async function handleExpandAttempt(attemptId: string, certCode: string) {
    // Toggle collapse
    if (expandedAttempt === attemptId) {
      setExpandedAttempt(null)
      return
    }

    setExpandedAttempt(attemptId)
    setReviewFilter('all')
    setReviewDomainFilter(null)
    setReviewQuestionIndex(0)

    // Already fetched this attempt's questions
    if (attemptQuestions.has(attemptId)) return

    // Attempts are only listed for an authenticated user; guard so the
    // user-scoped query below is type-safe and never runs without a user.
    if (!user) return

    setReviewLoading(attemptId)
    try {
      const supabase = await getSupabase()
      // Load this cert's question bank if not already cached.
      if (!questionBanks.has(certCode)) {
        const bank = await loadAllQuestions(certCode)
        setQuestionBanks(prev => new Map(prev).set(certCode, bank))
      }

      // Fetch attempt questions from Supabase. The `user_id` filter is
      // defense-in-depth against IDOR: the SELECT RLS policy on
      // attempt_questions is the real boundary, but scoping the query by the
      // authenticated user means a guessed/enumerated attempt_id can never
      // return another user's answers even if that policy regresses. (security V4)
      const { data, error } = await supabase
        .from('attempt_questions')
        .select('question_id, user_answer, is_correct, was_flagged, domain_id')
        .eq('attempt_id', attemptId)
        .eq('user_id', user.id)

      if (error) throw error

      setAttemptQuestions(prev => new Map(prev).set(attemptId, data || []))
    } catch (error: unknown) {
      logError('History.loadAttemptQuestions', error)
    } finally {
      setReviewLoading(null)
    }
  }

  /**
   * Reset progress. When the cert filter is a specific cert, only that cert's
   * data is deleted. When the cert filter is "all certs", every cert's data is
   * wiped for this user. The modal copy reflects which scope is being reset.
   */
  async function handleResetProgress() {
    if (!user?.id) return
    setResetting(true)
    try {
      const supabase = await getSupabase()
      const scopedCert = certFilter !== CERT_FILTER_ALL ? certFilter : null

      const deleteExamAttempts = supabase
        .from('exam_attempts')
        .delete()
        .eq('user_id', user.id)
      const deleteDomainProgress = supabase
        .from('domain_progress')
        .delete()
        .eq('user_id', user.id)
      // Domain-practice writes attempt_questions rows with attempt_id: null
      // (no parent exam_attempt), so the exam_attempts ON DELETE CASCADE never
      // reaches them. Delete attempt_questions explicitly by user_id so a
      // "reset progress" actually removes practice history + the mastery it
      // feeds; otherwise deleted mastery resurrects on the next session and
      // user data the user asked to delete persists.
      const deleteAttemptQuestions = supabase
        .from('attempt_questions')
        .delete()
        .eq('user_id', user.id)

      const ea = scopedCert
        ? deleteExamAttempts.eq('cert_code', scopedCert)
        : deleteExamAttempts
      const dp = scopedCert
        ? deleteDomainProgress.eq('cert_code', scopedCert)
        : deleteDomainProgress
      const aq = scopedCert
        ? deleteAttemptQuestions.eq('cert_code', scopedCert)
        : deleteAttemptQuestions

      const { error: e1 } = await ea
      if (e1) throw e1
      const { error: e2 } = await dp
      if (e2) throw e2
      const { error: e3 } = await aq
      if (e3) throw e3

      // Drop the relevant attempts client-side. For a scoped reset we filter;
      // for a full reset we clear everything.
      setAttempts(prev => (scopedCert ? prev.filter(a => a.cert_code !== scopedCert) : []))
      setShowResetModal(false)
      setResetSuccess(true)
      setTimeout(() => setResetSuccess(false), 3000)
    } catch (error: unknown) {
      logError('History.handleResetHistory', error)
    } finally {
      setResetting(false)
    }
  }

  // Derive the list of certs the user has attempts in, in the same order as
  // they appear in CERTIFICATIONS, so the filter row stays stable across
  // re-renders.
  const certsWithAttempts = useMemo(() => {
    const codes = new Set<string>()
    for (const attempt of attempts) codes.add(attempt.cert_code)
    return Array.from(codes)
      .map(code => CERTIFICATIONS[code])
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
  }, [attempts])

  const filteredAttempts = useMemo(() => {
    return attempts.filter(a => {
      if (filter === 'passed' && !a.passed) return false
      if (filter === 'failed' && a.passed) return false
      if (certFilter !== CERT_FILTER_ALL && a.cert_code !== certFilter) return false
      return true
    })
  }, [attempts, filter, certFilter])

  if (loading) {
    // Skeleton shaped like the history list (matches the real wrapper, so the
    // page does not jump when data resolves). Reduced-motion-safe via Skeleton.
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto" aria-busy="true">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary mb-4 md:mb-6">Exam history</h1>
          <p className="sr-only" role="status">Loading your exam history</p>
          <div className="flex flex-wrap gap-2 mb-4" aria-hidden="true">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="bg-bg-card border border-border-hairline rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Skeleton className="h-6 w-14 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Pagination logic. PAGE_SIZE_ALL (Number.MAX_SAFE_INTEGER) is the "show
  // all" sentinel from the dropdown.
  //
  // P1-2: when the result set shrinks (e.g. user picks a cert filter that has
  // fewer attempts than the previously-selected page can render), clamp
  // currentPage in render so the visible page is always valid. We do not
  // setState here (which would require an effect with synchronous setState
  // and trigger the lint rule's false positive); we just compute the safe
  // page on every render. The user's stored `currentPage` stays as-is so
  // navigating back to a wider filter restores their previous position.
  const totalPages = itemsPerPage === PAGE_SIZE_ALL
    ? 1
    : Math.max(1, Math.ceil(filteredAttempts.length / itemsPerPage))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const startIndex = (safeCurrentPage - 1) * itemsPerPage
  const endIndex = itemsPerPage === PAGE_SIZE_ALL ? filteredAttempts.length : startIndex + itemsPerPage
  const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex)

  const passedAttempts = attempts.filter(a => a.passed).length

  const scopedCertConfig = certFilter !== CERT_FILTER_ALL ? CERTIFICATIONS[certFilter] : null
  const resetScopeLabel = scopedCertConfig ? scopedCertConfig.shortName : 'all certifications'

  return (
    <>
    <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary">Exam history</h1>
            {user && attempts.length > 0 && (
              <Button
                onClick={() => setShowResetModal(true)}
                variant="secondary"
                size="sm"
                leftIcon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                className="min-h-[44px]"
                aria-label="Reset progress"
              >
                <span className="hidden md:inline">Reset progress</span>
              </Button>
            )}
          </div>

          {resetSuccess && (
            <Alert tone="success" className="mb-4">
              Progress reset successfully.
            </Alert>
          )}

          {/* Cert filter row (logged-in only, shown whenever the user has any
              attempts). With a single cert it reads "All certs (N) · CLF-C02 (N)",
              signalling that history is cert-aware; the control stays put as
              attempt distribution changes rather than appearing only at 2+ certs. */}
          {user && certsWithAttempts.length >= 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-text-muted text-xs md:text-sm font-medium mr-1">
                Certification:
              </span>
              <button
                onClick={() => setCertFilter(CERT_FILTER_ALL)}
                aria-pressed={certFilter === CERT_FILTER_ALL}
                className={filterChipClass({ active: certFilter === CERT_FILTER_ALL })}
              >
                All certs ({attempts.length})
              </button>
              {certsWithAttempts.map(c => {
                const count = attempts.filter(a => a.cert_code === c.code).length
                return (
                  <button
                    key={c.code}
                    onClick={() => setCertFilter(c.code)}
                    aria-pressed={certFilter === c.code}
                    className={filterChipClass({ active: certFilter === c.code })}
                  >
                    {c.shortName} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Pass/fail filter and items-per-page (logged-in only). */}
          {user && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  aria-pressed={filter === 'all'}
                  className={filterChipClass({ active: filter === 'all' })}
                >
                  All ({attempts.length})
                </button>
                <button
                  onClick={() => setFilter('passed')}
                  aria-pressed={filter === 'passed'}
                  className={filterChipClass({ active: filter === 'passed' })}
                >
                  Passed ({passedAttempts})
                </button>
                <button
                  onClick={() => setFilter('failed')}
                  aria-pressed={filter === 'failed'}
                  className={filterChipClass({ active: filter === 'failed' })}
                >
                  Failed ({attempts.length - passedAttempts})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-text-muted text-sm">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className={inputClass({ className: 'w-auto px-3 py-2 text-sm' })}
                >
                  <option value={3}>3 per page</option>
                  <option value={5}>5 per page</option>
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={PAGE_SIZE_ALL}>All</option>
                </select>
              </div>
            </div>
          )}

          {/* Guest User: a calm neutral sign-in funnel (no warning styling —
              nothing is wrong, it's just gated). The CTA carries the action. */}
          {!user ? (
            <div className="bg-bg-card border border-border-hairline rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-bg-dark border border-border-hairline">
                  <TrendingUp className="w-4 h-4 text-text-primary" aria-hidden="true" />
                </span>
                <p className="text-text-primary font-semibold tracking-[-0.01em]">Track your progress</p>
              </div>
              <p className="text-text-muted text-sm mb-5 max-w-md">
                Sign in to track your practice exam history and see your domain mastery improve over time. Practicing as a guest works without an account.
              </p>
              <Button onClick={() => goToLogin(navigate, location)} variant="primary" size="md">
                Sign in
              </Button>
            </div>
          ) : (
            <>
              {filteredAttempts.length > 0 && (
                <div className="mb-4 text-sm text-text-muted">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredAttempts.length)} of {filteredAttempts.length} attempts
                </div>
              )}

              {loadError ? (
                <Card padding="lg" className="text-center !py-12">
                  <p className="text-text-primary font-medium">We could not load your exam history.</p>
                  <p className="mt-1 text-sm text-text-muted">Check your connection and try again.</p>
                  <Button
                    onClick={() => { setLoading(true); void loadHistory() }}
                    variant="secondary"
                    className="mt-6"
                  >
                    Try again
                  </Button>
                </Card>
              ) : filteredAttempts.length === 0 ? (
                <Card padding="lg" className="text-center !py-12">
                  <p className="text-text-muted text-lg">
                    {filter === 'all' && certFilter === CERT_FILTER_ALL
                      ? 'No exam attempts yet. Take your first practice exam!'
                      : `No matching attempts.`}
                  </p>
                  {filter === 'all' && certFilter === CERT_FILTER_ALL && (
                    <Button
                      onClick={() => goCertExam()}
                      variant="primary"
                      className="mt-6"
                      arrow
                    >
                      Start practice exam
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="space-y-3">
                  {paginatedAttempts.map(attempt => {
                    const attemptCert = CERTIFICATIONS[attempt.cert_code]
                    const attemptDomains = getCertDomains(attempt.cert_code)
                    return (
                      <Card key={attempt.id} padding="md">
                        <div className="flex items-start justify-between mb-3 gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center ${attempt.passed ? 'bg-success/15' : 'bg-danger/15'}`}>
                              {attempt.passed ? (
                                <Check className="w-5 h-5 md:w-6 md:h-6 text-success" />
                              ) : (
                                <X className="w-5 h-5 md:w-6 md:h-6 text-danger" />
                              )}
                            </div>
                            <div>
                              {/* Line 1: status + cert chip. Line 2: mono meta
                                  (date · duration) so middots never orphan at a
                                  wrapped line start on mobile. */}
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm md:text-base font-semibold text-text-primary">
                                  {attempt.passed ? 'Passed' : 'Failed'}
                                </h3>
                                {attemptCert && (
                                  <span className="px-2 py-0.5 rounded-full font-mono text-[10px] md:text-[11px] font-semibold bg-bg-dark border border-border-hairline text-text-muted uppercase tracking-wide">
                                    {attemptCert.shortName}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-mono text-[12px] text-text-muted">
                                {formatRelativeDate(attempt.attempted_at)} · {formatDuration(attempt.time_taken_seconds)}
                              </p>
                              <p className="text-text-muted text-xs md:text-sm mt-0.5">
                                {attempt.correct_answers}/{attempt.total_questions} correct ({Math.round(attempt.score_percent)}%)
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-mono text-xl md:text-2xl font-semibold tabular-nums text-text-primary">{attempt.scaled_score}</p>
                            <p className="font-mono text-text-muted text-[10px]">/ 1000</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs md:text-sm font-semibold text-text-primary mb-2">Domain breakdown</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(attemptDomains).map(([id, name]) => {
                              const domainId = Number(id)
                              const score = attempt.domain_scores?.[id] ?? 0
                              return (
                                <div key={domainId} className="flex items-center justify-between">
                                  <span className="text-text-muted text-xs md:text-sm">{name}</span>
                                  <span className="text-sm md:text-base font-bold text-text-primary">
                                    {score}%
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-text-muted/20">
                          <button
                            onClick={() => handleExpandAttempt(attempt.id, attempt.cert_code)}
                            aria-expanded={expandedAttempt === attempt.id}
                            aria-controls={`attempt-details-${attempt.id}`}
                            className="w-full px-4 py-2 bg-bg-dark hover:bg-bg-dark/70 text-text-primary font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                          >
                            {expandedAttempt === attempt.id
                              ? <ChevronDown className="w-4 h-4" aria-hidden="true" />
                              : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
                            View details
                          </button>

                          {expandedAttempt === attempt.id && (
                            <div id={`attempt-details-${attempt.id}`} className="mt-3">
                              {reviewLoading === attempt.id ? (
                                <div className="flex items-center justify-center p-8">
                                  <LoadingSpinner text="Loading questions..." />
                                </div>
                              ) : attemptQuestions.has(attempt.id) ? (
                                <AttemptReviewPanel
                                  aqList={attemptQuestions.get(attempt.id)!}
                                  questionBank={questionBanks.get(attempt.cert_code) ?? []}
                                  domains={attemptDomains}
                                  certCode={attempt.cert_code}
                                  reviewFilter={reviewFilter}
                                  reviewDomainFilter={reviewDomainFilter}
                                  reviewQuestionIndex={reviewQuestionIndex}
                                  onFilterChange={setReviewFilter}
                                  onDomainFilterChange={setReviewDomainFilter}
                                  onQuestionIndexChange={setReviewQuestionIndex}
                                />
                              ) : null}
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}

              {filteredAttempts.length > 0 && totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <Button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    variant="secondary"
                    size="sm"
                  >
                    Previous
                  </Button>

                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (safeCurrentPage <= 3) {
                        pageNum = i + 1
                      } else if (safeCurrentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = safeCurrentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          aria-label={`Go to page ${pageNum}`}
                          aria-current={safeCurrentPage === pageNum ? 'page' : undefined}
                          className={`w-11 h-11 rounded-full font-medium transition-[background-color,border-color,color] duration-200 active:scale-[0.97] text-sm border ${
                            safeCurrentPage === pageNum
                              ? 'bg-header-bg text-on-header border-header-bg'
                              : 'bg-bg-card hover:bg-bg-card-hover text-text-primary border-border-hairline'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <Button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    variant="secondary"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showResetModal}
        title={`Reset ${resetScopeLabel} progress`}
        onClose={() => setShowResetModal(false)}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger rounded-lg">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-text-primary text-sm font-medium mb-1">This action cannot be undone</p>
              <p className="text-text-muted text-sm">
                {scopedCertConfig
                  ? `This will permanently delete all your ${scopedCertConfig.shortName} exam history, question responses, and domain mastery progress. Other certifications are not affected. Switch the cert filter at the top of the page to scope the reset differently.`
                  : 'This will permanently delete your exam history, question responses, and domain mastery progress across every certification. To reset only one cert, switch the cert filter at the top of the page first.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setShowResetModal(false)}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetProgress}
              variant="danger"
              loading={resetting}
              loadingText="Resetting..."
              className="flex-1"
            >
              {scopedCertConfig ? `Reset ${scopedCertConfig.shortName}` : 'Reset everything'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
