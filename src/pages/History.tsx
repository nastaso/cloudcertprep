import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCert } from '../hooks/useCert'
import { useSEO } from '../hooks/useSEO'
import { ROUTE_SEO } from '../lib/seo-data'
import { useNoIndex } from '../hooks/useNoIndex'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { Header } from '../components/Header'
import { LoadingSpinner } from '../components/LoadingSpinner'
import type { Question, ExamAttempt } from '../types'
import { formatDuration } from '../lib/scoring'
import { formatRelativeDate } from '../lib/formatting'
import { loadAllQuestions } from '../data/questions'
import { getCertDomains } from '../data/certifications'
import { Modal } from '../components/Modal'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { TrendingUp, Check, X, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '../components/Button'

interface AttemptQuestionRow {
  question_id: string
  user_answer: string | null
  correct_answer: string
  is_correct: boolean
  was_flagged: boolean
  domain_id: number
}

type ReviewFilter = 'all' | 'incorrect' | 'flagged'

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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                reviewFilter === f
                  ? 'bg-aws-orange text-white'
                  : isDisabled
                  ? 'bg-bg-dark text-text-muted opacity-50 cursor-not-allowed'
                  : 'bg-bg-dark text-text-muted hover:text-text-primary'
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            reviewDomainFilter === null ? 'bg-aws-orange text-white' : 'bg-bg-dark text-text-muted hover:text-text-primary'
          }`}
        >
          All Domains
        </button>
        {Object.entries(domains).map(([id, name]) => {
          const domainId = Number(id)
          return (
          <button
            key={domainId}
            onClick={() => { onDomainFilterChange(reviewDomainFilter === domainId ? null : domainId); onQuestionIndexChange(0) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              reviewDomainFilter === domainId ? 'bg-aws-orange text-white' : 'bg-bg-dark text-text-muted hover:text-text-primary'
            }`}
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
          return (
            <button
              key={idx}
              onClick={() => {
                const fIdx = filtered.findIndex(f => f.question_id === aq.question_id)
                if (fIdx !== -1) onQuestionIndexChange(fIdx)
              }}
              disabled={!isInFiltered}
              className={`w-8 h-8 md:w-9 md:h-9 rounded text-[10px] md:text-xs font-medium transition-all ${
                isCurrent ? 'ring-2 ring-aws-orange ring-offset-1 ring-offset-bg-card' : ''
              } ${!isInFiltered ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'} ${
                aq.is_correct ? 'bg-success text-white' : 'bg-danger text-white'
              } ${aq.was_flagged ? 'ring-2 ring-warning' : ''}`}
            >
              {idx + 1}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-success rounded"></span> Correct</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-danger rounded"></span> Incorrect</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-bg-dark rounded ring-2 ring-warning"></span> Flagged</span>
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
  const { user, loading: authLoading } = useAuth()
  const cert = useCert()
  const domains = getCertDomains(cert.code)
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState<ExamAttempt[]>([])

  useSEO({
    ...ROUTE_SEO['/history'],
    title: `${cert.shortName} exam history · CloudCertPrep`,
  })

  // The logged-out view of /history is a sign-in funnel page, not real content.
  // Mark it noindex so search engines don't index the thin "sign in to see X" view.
  useNoIndex(!user)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null)
  const [itemsPerPage, setItemsPerPage] = useState(3)
  const [currentPage, setCurrentPage] = useState(1)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  // Question review state
  const [questionBank, setQuestionBank] = useState<Question[]>([])
  const [attemptQuestions, setAttemptQuestions] = useState<Map<string, AttemptQuestionRow[]>>(new Map())
  const [reviewLoading, setReviewLoading] = useState<string | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incorrect' | 'flagged'>('all')
  const [reviewDomainFilter, setReviewDomainFilter] = useState<number | null>(null)
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0)

  async function loadHistory() {
    try {
      if (!user?.id) {
        setAttempts([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('exam_attempts')
        .select('*')
        .eq('user_id', user.id)
        .eq('cert_code', cert.code)
        .order('attempted_at', { ascending: false })

      if (error) throw error
      setAttempts(data || [])
    } catch (error: unknown) {
      logError('History.loadHistory', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) {
      loadHistory()
    }
  }, [user, authLoading, cert.code])

  async function handleExpandAttempt(attemptId: string) {
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

    setReviewLoading(attemptId)
    try {
      // Load question bank if not already loaded
      let bank = questionBank
      if (bank.length === 0) {
        bank = await loadAllQuestions(cert.code)
        setQuestionBank(bank)
      }

      // Fetch attempt questions from Supabase
      const { data, error } = await supabase
        .from('attempt_questions')
        .select('question_id, user_answer, correct_answer, is_correct, was_flagged, domain_id')
        .eq('attempt_id', attemptId)

      if (error) throw error

      setAttemptQuestions(prev => new Map(prev).set(attemptId, data || []))
    } catch (error: unknown) {
      logError('History.loadAttemptQuestions', error)
    } finally {
      setReviewLoading(null)
    }
  }

  async function handleResetProgress() {
    if (!user?.id) return
    setResetting(true)
    try {
      const { error: e1 } = await supabase
        .from('attempt_questions')
        .delete()
        .eq('user_id', user.id)
        .eq('cert_code', cert.code)
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('exam_attempts')
        .delete()
        .eq('user_id', user.id)
        .eq('cert_code', cert.code)
      if (e2) throw e2

      const { error: e3 } = await supabase
        .from('domain_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('cert_code', cert.code)
      if (e3) throw e3

      setAttempts([])
      setShowResetModal(false)
      setResetSuccess(true)
      setTimeout(() => setResetSuccess(false), 3000)
    } catch (error: unknown) {
      logError('History.handleResetHistory', error)
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="flex-1 flex items-center justify-center p-8">
          <LoadingSpinner text="Loading history..." />
        </div>
      </div>
    )
  }

  const filteredAttempts = attempts.filter(a => {
    if (filter === 'passed') return a.passed
    if (filter === 'failed') return !a.passed
    return true
  })

  // Pagination logic
  const totalPages = itemsPerPage === 999999 ? 1 : Math.ceil(filteredAttempts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = itemsPerPage === 999999 ? filteredAttempts.length : startIndex + itemsPerPage
  const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex)

  const passedAttempts = attempts.filter(a => a.passed).length


  return (
    <div className="bg-bg-dark flex flex-col">
      <Header showNav={true} />
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h1 className="text-xl md:text-2xl font-semibold text-text-primary">{cert.shortName} Exam History</h1>
            {user && attempts.length > 0 && (
              <Button
                onClick={() => setShowResetModal(true)}
                variant="secondary"
                size="sm"
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                <span className="hidden md:inline">Reset progress</span>
              </Button>
            )}
          </div>

          {/* Reset Success Banner */}
          {resetSuccess && (
            <div className="mb-4 bg-success/10 border border-success text-success px-4 py-3 rounded-lg text-sm">
              All progress has been reset successfully.
            </div>
          )}

        {/* Filter Tabs and Pagination Controls - Only show for logged in users */}
        {user && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-aws-orange text-white'
                  : 'bg-bg-card text-text-muted hover:text-text-primary'
              }`}
            >
              All ({attempts.length})
            </button>
            <button
              onClick={() => setFilter('passed')}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                filter === 'passed'
                  ? 'bg-aws-orange text-white'
                  : 'bg-bg-card text-text-muted hover:text-text-primary'
              }`}
            >
              Passed ({passedAttempts})
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                filter === 'failed'
                  ? 'bg-aws-orange text-white'
                  : 'bg-bg-card text-text-muted hover:text-text-primary'
              }`}
            >
              Failed ({attempts.length - passedAttempts})
            </button>
            </div>

            {/* Items per page dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-sm">Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="px-3 py-2 bg-bg-dark text-text-primary rounded-lg border border-text-muted/30 focus:border-aws-orange focus:outline-none transition-colors text-sm"
              >
                <option value={3}>3 per page</option>
                <option value={5}>5 per page</option>
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={999999}>All</option>
              </select>
            </div>
          </div>
        )}

        {/* Guest User: only sign-in CTA, no misleading empty-state card. */}
        {!user ? (
          <div className="p-6 bg-warning/10 border border-warning rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-warning" />
              <p className="text-warning font-semibold">Track your progress</p>
            </div>
            <p className="text-text-muted text-sm mb-4">
              Sign in to track your practice exam history and monitor your progress over time.
            </p>
            <Button onClick={() => navigate('/login')} variant="primary" size="sm">
              Sign in
            </Button>
          </div>
        ) : (
          <>
        {/* Showing counter */}
        {filteredAttempts.length > 0 && (
          <div className="mb-4 text-sm text-text-muted">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredAttempts.length)} of {filteredAttempts.length} attempts
          </div>
        )}

        {/* Attempts List */}
        {filteredAttempts.length === 0 ? (
          <div className="bg-bg-card rounded-lg p-12 text-center shadow-card">
            <p className="text-text-muted text-lg">
              {filter === 'all' 
                ? 'No exam attempts yet. Take your first practice exam!' 
                : `No ${filter} attempts yet.`}
            </p>
            {filter === 'all' && (
              <Button
                onClick={() => navigate('/practice-exam')}
                variant="primary"
                className="mt-6"
              >
                Start practice exam
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedAttempts.map(attempt => (
              <div key={attempt.id} className="bg-bg-card rounded-lg p-4 md:p-6 shadow-card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center ${attempt.passed ? 'bg-success/20' : 'bg-danger/20'}`}>
                      {attempt.passed ? (
                        <Check className="w-5 h-5 md:w-6 md:h-6 text-success" />
                      ) : (
                        <X className="w-5 h-5 md:w-6 md:h-6 text-danger" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm md:text-base font-semibold text-text-primary">
                          {attempt.passed ? 'Passed' : 'Failed'}
                        </h3>
                        <span className="text-text-muted text-xs">·</span>
                        <span className="text-text-muted text-xs">{formatRelativeDate(attempt.attempted_at)}</span>
                        <span className="text-text-muted text-xs">·</span>
                        <span className="text-text-muted text-xs">{formatDuration(attempt.time_taken_seconds)}</span>
                      </div>
                      <p className="text-text-muted text-xs md:text-sm mt-0.5">
                        {attempt.correct_answers}/{attempt.total_questions} correct ({Math.round(attempt.score_percent)}%)
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl md:text-2xl font-bold text-text-primary">{attempt.scaled_score}</p>
                    <p className="text-text-muted text-[10px]">/ 1000</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs md:text-sm font-semibold text-text-primary mb-2">Domain Breakdown</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(domains).map(([id, name]) => {
                      const domainId = Number(id)
                      const score = attempt.domain_scores?.[id] ?? 0
                      return (
                        <div key={domainId} className="flex items-center justify-between">
                          <span className="text-text-muted text-xs md:text-sm">
                            {name}
                          </span>
                          <span className="text-sm md:text-base font-bold text-aws-orange">
                            {score}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* View Details Button */}
                <div className="mt-3 pt-3 border-t border-text-muted/20">
                  <button
                    onClick={() => handleExpandAttempt(attempt.id)}
                    className="w-full px-4 py-2 bg-bg-dark hover:bg-bg-dark/70 text-aws-orange font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    {expandedAttempt === attempt.id ? '▼' : '▶'} View details
                  </button>
                  
                  {expandedAttempt === attempt.id && (
                    <div className="mt-3">
                      {reviewLoading === attempt.id ? (
                        <div className="flex items-center justify-center p-8">
                          <LoadingSpinner text="Loading questions..." />
                        </div>
                      ) : attemptQuestions.has(attempt.id) ? (
                        <AttemptReviewPanel
                          aqList={attemptQuestions.get(attempt.id)!}
                          questionBank={questionBank}
                          domains={domains}
                          certCode={cert.code}
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
              </div>
            ))}
          </div>
        )}

        {/* Page Navigation */}
        {filteredAttempts.length > 0 && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
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
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors text-sm ${
                      currentPage === pageNum
                        ? 'bg-aws-orange text-white'
                        : 'bg-bg-card hover:bg-bg-card-hover text-text-primary'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            
            <Button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
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

      {/* Reset Progress Confirmation Modal */}
      <Modal isOpen={showResetModal} title="Reset All Progress" onClose={() => setShowResetModal(false)}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger rounded-lg">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-text-primary text-sm font-medium mb-1">This action cannot be undone</p>
              <p className="text-text-muted text-sm">
                This will permanently delete all your exam history, question responses, and domain mastery progress. You will start fresh as if you just created your account.
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
              Reset everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
