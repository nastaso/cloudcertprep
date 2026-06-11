import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Flag, AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { filterChipClass } from '../lib/buttonStyles'
import { useTimer } from '../hooks/useTimer'
import { useAuth } from '../hooks/useAuth'
import { useSEO } from '../hooks/useSEO'
import { useCert } from '../hooks/useCert'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { AnswerButton } from '../components/AnswerButton'
import { Modal } from '../components/Modal'
import { PassFailBanner } from '../components/PassFailBanner'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { UnlockCTA } from '../components/landing/UnlockCTA'
import { selectExamQuestions, calculateScaledScore, isPassed, getDomainScore, formatTime, formatDuration, isAnswerCorrect, getExamDomainTargets } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { updateDomainProgress } from '../lib/supabaseUtils'
import { goToLogin } from '../lib/navigation'
import type { Question, OptionKey } from '../types'
import { loadAllQuestions } from '../data/questions'
import { shuffleAndMapQuestions, toOriginalAnswer, toggleMultiAnswer, type OptionKeyMap } from '../lib/utils'
import { trackEvent, trackPageView } from '../lib/analytics'
import { MIN_VALID_EXAM_SECONDS, MAX_MULTI_ANSWER, TIMER_PULSE_THRESHOLD } from '../lib/constants'
import { registerExamLeaveHandler, confirmExamLeave, isIntentionalLeave } from '../lib/examGuard'
import { getProviderLabel } from '../data/certifications'

type ExamScreen = 'start' | 'exam' | 'results' | 'review'

interface QuestionState {
  userAnswer: string | string[] | null
  flagged: boolean
}

function isQuestionAnswered(state: QuestionState | undefined): boolean {
  if (!state?.userAnswer) return false
  return Array.isArray(state.userAnswer) ? state.userAnswer.length > 0 : state.userAnswer !== ''
}

function ExamQuestionGrid({
  questions,
  answers,
  currentIndex,
  onSelect,
  variant = 'sidebar',
}: {
  questions: Question[]
  answers: Map<number, QuestionState>
  currentIndex: number
  onSelect: (idx: number) => void
  variant?: 'sidebar' | 'modal'
}) {
  return (
    <div className={`grid grid-cols-5 gap-2${variant === 'modal' ? ' max-h-96 overflow-y-auto' : ''}`}>
      {questions.map((_, idx) => {
        const state = answers.get(idx)
        const isAnswered = isQuestionAnswered(state)
        const isFlagged = state?.flagged || false
        const isCurrent = idx === currentIndex
        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`relative ${variant === 'sidebar' ? 'w-10 h-10' : 'w-full aspect-square'} rounded text-sm font-medium transition-colors ${
              isCurrent
                ? 'bg-brand text-on-brand'
                : isAnswered
                ? 'bg-brand/30 text-text-primary hover:bg-brand/50'
                : 'bg-bg-dark text-text-muted hover:bg-bg-card-hover'
            }`}
          >
            {idx + 1}
            {isFlagged && (
              <Flag className="absolute -top-1 -right-1 w-3 h-3 text-warning fill-warning" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function MockExam() {
  const navigate = useNavigate()
  const location = useLocation()
  const { goHome } = useCertNavigate()
  const { user } = useAuth()
  const cert = useCert()
  const [screen, setScreen] = useState<ExamScreen>('start')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<number, QuestionState>>(new Map())
  const [showEndModal, setShowEndModal] = useState(false)
  const [showQuestionNav, setShowQuestionNav] = useState(false)
  // Pending in-app leave target. When set, the custom "Leave the exam?" modal
  // is shown (replacing the un-stylable native dialog for intercepted nav).
  const [pendingLeaveUrl, setPendingLeaveUrl] = useState<string | null>(null)
  const [results, setResults] = useState<{
    scaledScore: number
    percentScore: number
    passed: boolean
    correctCount: number
    totalQuestions: number
    timeTaken: number
    /** Per-domain scores keyed by stringified domain ID (matches the JSONB shape). */
    domainScores: Record<string, number>
    questionResults: Array<{
      questionId: string
      domainId: number
      userAnswer: string | string[]
      correctAnswer: string | string[]
      isCorrect: boolean
      wasFlagged: boolean
    }>
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number>(0)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incorrect' | 'flagged'>('all')
  const [reviewDomainFilter, setReviewDomainFilter] = useState<number | null>(null)
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0)
  const [optionKeyMaps, setOptionKeyMaps] = useState<Map<string, OptionKeyMap>>(new Map())

  const timer = useTimer({
    initialSeconds: cert.examTimeSeconds,
    onComplete: handleTimeUp,
  })

  // Title varies by screen. All practice-exam screens are noindex (see the
  // canonical note below), so none is canonical-eligible.
  const examMinutes = Math.round(cert.examTimeSeconds / 60)
  const pageTitle = screen === 'exam'
    ? `Question ${currentIndex + 1} of ${cert.examQuestionCount} · CloudCertPrep`
    : screen === 'results' ? 'Exam results · CloudCertPrep'
    : screen === 'review' ? 'Review exam · CloudCertPrep'
    : `${cert.shortName} Mock Exam · ${cert.examQuestionCount} Questions, ${examMinutes} Min, Free · CloudCertPrep`
  // Per-cert canonical so each cert's practice exam ranks for its own
  // keyword space (e.g. /aws/aif-c01/practice-exam vs /aws/clf-c02/practice-exam).
  // NOTE: this route ships robots=noindex (set on the Astro shell), so it must
  // NOT emit a canonical — a noindex page accrues no indexing equity and
  // noindex+canonical is contradictory signalling. BaseLayout already omits the
  // canonical server-side; pass null here so useSEO doesn't re-inject one when
  // Google renders the island JS. (M0d)
  useSEO({
    title: pageTitle,
    description: `Free ${cert.examQuestionCount}-question ${cert.shortName} mock exam, ${examMinutes}-minute timer, scaled scoring (${cert.passingScore}/1000 to pass), exact ${cert.shortName} exam format. Open-source MIT-licensed alternative to paid AWS practice platforms. No signup needed.`,
    canonical: null,
  })

  // Cleanup dataset flag when the component unmounts (e.g. user navigates
  // away mid-exam via the router). Ensures Footer/CertSwitcher are restored.
  useEffect(() => () => { delete document.body.dataset.examActive }, [])

  // Track exam abandonment - fires when user leaves during active exam.
  // Also triggers the native "Leave site?" dialog while exam is in progress.
  // The native dialog is the last-resort net for browser-level exits (tab
  // close, refresh); confirmed in-app leaves set `isIntentionalLeave()` so we
  // stay silent and let the custom modal own that flow.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (screen === 'exam' && questions.length > 0 && !isIntentionalLeave()) {
        e.preventDefault()
        e.returnValue = ''
        const answeredCount = Array.from(answers.values()).filter(isQuestionAnswered).length
        trackEvent('exam_abandoned', {
          questions_answered: answeredCount,
          total_questions: questions.length,
          time_elapsed: Math.floor((Date.now() - startTime) / 1000)
        })
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [screen, questions.length, answers, startTime])

  // Register the custom leave-confirm handler while the exam screen is active,
  // so header links (and the Sign in button) route their navigation through
  // our modal instead of the native dialog. Cleared when leaving the exam
  // screen so non-exam navigations are never intercepted.
  useEffect(() => {
    if (screen !== 'exam') return
    return registerExamLeaveHandler((url: string) => setPendingLeaveUrl(url))
  }, [screen])

  // Intercept in-app anchor navigation during the exam (the static header logo,
  // nav links, cert switcher, footer links — anything that's a same-origin
  // link). One delegated capture listener covers them all DRY-ly, with no
  // per-link wiring. Modified clicks and new-tab/external links pass through
  // untouched (they don't unload the exam page).
  useEffect(() => {
    if (screen !== 'exam') return
    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || anchor.target === '_blank' || href.startsWith('#') || href.startsWith('mailto:')) return
      // Same-origin in-app navigation only; external links open without
      // unloading via target handling above, but guard absolute externals too.
      const url = new URL(href, window.location.origin)
      if (url.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      setPendingLeaveUrl(url.pathname + url.search)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [screen])

  function handleTimeUp() {
    const answeredCount = Array.from(answers.values()).filter(isQuestionAnswered).length
    trackEvent('timer_expired', {
      questions_answered: answeredCount,
      total_questions: questions.length
    })
    handleSubmitExam()
  }

  async function startExam() {
    setLoading(true)
    setLoadError(null)
    try {
      const allQuestions = await loadAllQuestions(cert.code)
      const selectedQuestions = selectExamQuestions(allQuestions, cert)
      const { questions: shuffled, keyMaps } = shuffleAndMapQuestions(selectedQuestions)
      setQuestions(shuffled)
      setOptionKeyMaps(keyMaps)
      setAnswers(new Map())
      setCurrentIndex(0)
      setScreen('exam')
      setStartTime(Date.now())
      // Rebase the timer to the full exam duration before starting. Without
      // this, a retake after expiry would start from seconds=0 (instant
      // auto-submit on the next tick) and a retake after a manual submit would
      // inherit whatever time was left on the previous attempt.
      timer.reset()
      timer.start()
      document.body.dataset.examActive = 'true'
      trackEvent('exam_started')
      // Keep the visitor visible in Umami's active-visitor count during the
      // long (up to 90-min) exam session by emitting a virtual page view; a
      // timed exam otherwise fires no page views and drops off "online" after
      // ~5 min. (R15.5, task 13.10)
      trackPageView(`/${cert.provider}/${cert.code}/practice-exam/active`)
      window.scrollTo(0, 0)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load questions'
      setLoadError(`Could not start the exam. ${msg}. Please check your connection and try again.`)
      logError('MockExam.startExam', err)
    } finally {
      setLoading(false)
    }
  }

  function handleAnswer(answer: string) {
    const current = questions[currentIndex]
    const currentState = answers.get(currentIndex) || { userAnswer: null, flagged: false }

    // Per-question analytics: fire `question_answered` exactly once per
    // question, on the transition from "unanswered" to "answered". Subsequent
    // toggles (multi-answer) or answer changes (single-answer) do not refire,
    // so event volume scales with question count, not click count. Uses the
    // same `question_answered` name as DomainPractice to preserve Umami
    // dashboard continuity (the live baseline event); the `surface: 'exam'`
    // param distinguishes exam answers from domain-practice answers.
    const wasUnanswered = !isQuestionAnswered(currentState)

    if (current.isMultiAnswer) {
      const currentAnswers = Array.isArray(currentState.userAnswer) ? currentState.userAnswer : []
      const newAnswers = toggleMultiAnswer(currentAnswers, answer, MAX_MULTI_ANSWER)
      setAnswers(prev => new Map(prev).set(currentIndex, { ...currentState, userAnswer: newAnswers }))
      if (wasUnanswered && newAnswers.length > 0) {
        trackEvent('question_answered', {
          surface: 'exam',
          question_index: currentIndex,
          question_id: current.id,
          domain_id: current.domainId,
          is_multi_answer: true,
        })
      }
    } else {
      setAnswers(prev => new Map(prev).set(currentIndex, { ...currentState, userAnswer: answer }))
      if (wasUnanswered) {
        trackEvent('question_answered', {
          surface: 'exam',
          question_index: currentIndex,
          question_id: current.id,
          domain_id: current.domainId,
          is_multi_answer: false,
        })
      }
    }
  }

  function toggleFlag() {
    const currentState = answers.get(currentIndex) || { userAnswer: null, flagged: false }
    setAnswers(prev => new Map(prev).set(currentIndex, { ...currentState, flagged: !currentState.flagged }))
  }

  function goToQuestion(index: number) {
    setCurrentIndex(index)
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  function previousQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  async function handleSubmitExam() {
    if (loading || screen === 'results') return
    setLoading(true)
    // Clear any stale submit error from a previous attempt so a later
    // successful save doesn't keep showing "could not be saved". (M0b)
    setSubmitError(null)
    timer.pause()

    const timeTaken = Math.floor((Date.now() - startTime) / 1000)
    const isGuest = !user
    const isTooShort = timeTaken < MIN_VALID_EXAM_SECONDS
    
    const results = questions.map((q, idx) => {
      const state = answers.get(idx)
      const userAnswer = state?.userAnswer || (q.isMultiAnswer ? [] : '')
      const correct = isAnswerCorrect(userAnswer, q.answer, q.isMultiAnswer)
      
      // Convert display keys back to original keys for DB storage
      const keyMap = optionKeyMaps.get(q.id) || {}
      const originalUserAnswer = toOriginalAnswer(userAnswer, keyMap)
      const originalCorrectAnswer = toOriginalAnswer(q.answer, keyMap)

      return {
        questionId: q.id,
        domainId: q.domainId,
        userAnswer,
        correctAnswer: q.answer,
        originalUserAnswer,
        originalCorrectAnswer,
        isCorrect: correct,
        wasFlagged: state?.flagged || false,
      }
    })

    const correctCount = results.filter(r => r.isCorrect).length
    const scaledScore = calculateScaledScore(correctCount, questions.length)
    const passed = isPassed(scaledScore, cert.passingScore)
    const percentScore = (correctCount / questions.length) * 100

    // Build per-domain scores keyed by string domain ID. Works for any number of domains.
    const domainScores: Record<string, number> = {}
    for (const domain of cert.domains) {
      domainScores[String(domain.id)] = getDomainScore(results, domain.id)
    }

    try {
      // Only save to database if user is logged in AND exam took at least 60 seconds
      if (!isGuest && user && !isTooShort) {
        const userId = user.id
        const { data: attemptData, error: attemptError } = await supabase
          .from('exam_attempts')
          .insert({
            user_id: userId,
            cert_code: cert.code,
            score_percent: percentScore,
            scaled_score: scaledScore,
            passed,
            time_taken_seconds: timeTaken,
            total_questions: questions.length,
            correct_answers: correctCount,
            domain_scores: domainScores,
          })
          .select()
          .single()

        if (attemptError) throw attemptError

        // Save ALL questions (answered and unanswered) so history review shows the full exam
        const questionRecords = results.map(r => ({
          attempt_id: attemptData.id,
          user_id: userId,
          question_id: r.questionId,
          user_answer: Array.isArray(r.originalUserAnswer) ? r.originalUserAnswer.join(',') : r.originalUserAnswer,
          correct_answer: Array.isArray(r.originalCorrectAnswer) ? r.originalCorrectAnswer.join(',') : r.originalCorrectAnswer,
          is_correct: r.isCorrect,
          was_flagged: r.wasFlagged,
          domain_id: r.domainId,
          cert_code: cert.code,
        }))

        if (questionRecords.length > 0) {
          const { error: questionsError } = await supabase
            .from('attempt_questions')
            .insert(questionRecords)

          if (questionsError) {
            // The exam_attempts row already landed but its questions did not.
            // Best-effort delete the now-orphaned attempt so history doesn't
            // show a scored attempt with zero reviewable questions. (M0b)
            await supabase.from('exam_attempts').delete().eq('id', attemptData.id)
            throw questionsError
          }
        }

        // Update domain progress for all domains
        for (const domain of cert.domains) {
          const domainResults = results.filter(r => r.domainId === domain.id)
          if (domainResults.length > 0) {
            await updateDomainProgress(userId, domain.id, cert.code)
          }
        }
      }
    } catch (error: unknown) {
      logError('MockExam.submitExam', error)
      setSubmitError('Your results could not be saved. You can still review your answers.')
    }

    // Always show results even if save failed
    setResults({
      scaledScore,
      percentScore,
      passed,
      correctCount,
      totalQuestions: questions.length,
      timeTaken,
      domainScores,
      questionResults: results,
    })

    setScreen('results')
    delete document.body.dataset.examActive
    window.scrollTo(0, 0)
    trackEvent('exam_completed', { passed, scaled_score: scaledScore, score_percent: Math.round(percentScore) })
    setLoading(false)
  }

  const currentQuestion = questions[currentIndex]
  const currentState = answers.get(currentIndex)
  const answeredCount = Array.from(answers.values()).filter(isQuestionAnswered).length
  const flaggedCount = Array.from(answers.values()).filter(s => s.flagged).length

  if (screen === 'start') {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3 md:mb-4">{cert.shortName} Practice Exam</h1>
            <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">{cert.examQuestionCount} questions, {Math.round(cert.examTimeSeconds / 60)} minutes. No answer feedback during exam.</p>

            <div className="bg-bg-dark rounded-xl p-4 md:p-6 mb-6 md:mb-8">
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3 md:mb-4">Domain Breakdown</h2>
              <div className="space-y-1.5 md:space-y-2 text-sm md:text-base text-text-muted">
                {(() => {
                  const targets = getExamDomainTargets(cert)
                  return cert.domains.map(d => (
                    <p key={d.id}>- {targets[d.id]} {d.name} ({Math.round(d.examProportion * 100)}%)</p>
                  ))
                })()}
              </div>
            </div>

            <Alert tone="warning" className="mb-6 md:mb-8">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-warning flex-shrink-0" />
                <p className="text-sm md:text-base text-warning font-medium">Once started, the timer cannot be paused</p>
              </div>
            </Alert>

            {loadError && (
              <Alert tone="danger" className="mb-4 md:mb-6 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-danger flex-shrink-0 mt-0.5" />
                <p className="text-sm md:text-base text-danger">{loadError}</p>
              </Alert>
            )}

            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
              <Button
                onClick={goHome}
                disabled={loading}
                variant="secondary"
                size="lg"
                className="flex-1"
              >
                Back to home
              </Button>
              <Button
                onClick={startExam}
                variant="primary"
                size="lg"
                className="flex-1"
                arrow
                loading={loading}
                loadingText="Loading questions..."
              >
                Start exam
              </Button>
            </div>
          </Card>

          {/* Guest-only sign-in nudge — rendered as a sibling card BELOW
              the start card so a guest who just wants to take the exam
              hits the Start button without scrolling past a sign-in
              prompt. The nudge is still visible (one short scroll away),
              just out of the primary action path. Copy is non-blocking:
              guest mode works fine, this is purely the upside of signing
              in. `safeFrom` in `goToLogin` returns the user to this exam
              page after sign-in so friction is minimal. */}
          {!user && (
            <div className="mt-4 md:mt-6">
              <UnlockCTA
                onSignIn={() => goToLogin(navigate, location)}
                location="mock_exam_start"
                title="Sign in to save this attempt"
                body="Guest mode is fully functional, but your score, time, and per-domain breakdown will not be saved to your history."
                ctaLabel="Sign in to save this attempt"
                noTopMargin
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'results') return (
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-2xl w-full space-y-6 animate-enter">
          <PassFailBanner
            passed={results!.passed}
            scaledScore={results!.scaledScore}
            percent={results!.percentScore}
          />

          {submitError && (
            <Alert tone="warning">
              {submitError}
            </Alert>
          )}

          <Card padding="lg" className="space-y-6">
            <Alert tone="info" className="mb-6">
              <p className="text-sm text-text-muted">
                <span className="font-semibold text-text-primary">{getProviderLabel(cert.provider)} Scaled Scoring:</span> Scores range from 100-1000, where 100 is the minimum (0% correct) and 1000 is the maximum (100% correct). You need {cert.passingScore}+ to pass.
              </p>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-text-muted text-sm mb-1">Pass Mark</p>
                <p className="text-2xl font-bold text-text-primary">{cert.passingScore}/1000</p>
              </div>
              <div>
                <p className="text-text-muted text-sm mb-1">Time Taken</p>
                <p className="text-2xl font-bold text-text-primary">{formatDuration(results!.timeTaken)}</p>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-text-primary mb-4">Domain Breakdown</h3>
            <div className="space-y-4">
              {cert.domains.map(domain => {
                const score = results!.domainScores[String(domain.id)] ?? 0
                const domainQuestions = results!.questionResults.filter(r => r.domainId === domain.id)
                const correct = domainQuestions.filter(r => r.isCorrect).length
                
                return (
                  <div key={domain.id} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-text-primary font-medium">{domain.name}</p>
                      <p className="text-text-muted text-sm">{correct}/{domainQuestions.length} correct</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-brand">
                        {score}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Guest signup CTA at the highest-intent moment — right after a
              completed exam (audit A1). Guests only; the message leads with the
              improvement angle on a fail and the save-your-win angle on a pass.
              Reuses the permitted `unlock_cta_clicked` event via location. */}
          {!user && (
            <UnlockCTA
              onSignIn={() => goToLogin(navigate, location)}
              location="exam_results"
              title={results!.passed ? 'Sign in to save this win' : 'Sign in to target your weak domains'}
              body={
                results!.passed
                  ? 'Create a free account to save this attempt, track your score over time, and keep your per-domain breakdown.'
                  : 'Create a free account to save this attempt and get adaptive practice focused on the domains you scored lowest in.'
              }
              ctaLabel="Sign in to save this attempt"
            />
          )}

          <div className="mt-6 space-y-3">
            <Button
              onClick={() => {
                setReviewFilter('all')
                setReviewDomainFilter(null)
                setReviewQuestionIndex(0)
                window.scrollTo(0, 0)
                setScreen('review')
              }}
              variant="primary"
              fullWidth
            >
              Review questions
            </Button>
            <div className="flex gap-4">
              <Button onClick={goHome} variant="secondary" className="flex-1">
                Back to home
              </Button>
              <Button
                onClick={() => {
                  setScreen('start')
                  setResults(null)
                }}
                variant="secondary"
                className="flex-1"
              >
                Retake exam
              </Button>
            </div>
          </div>
        </div>
      </div>
    )

  if (screen === 'exam' && currentQuestion) {
    return (
      <div className="bg-bg-dark">
        {/* In-page exam toolbar: slim, neutral (NOT a second orange gradient),
            so it reads as a subordinate toolbar under the site header rather
            than a second heavy header bar. Sticks to the top while scrolling.
            Carries question position, a thin answered-progress bar, the timer,
            and the End exam action. */}
        <div className="sticky top-0 z-30 bg-bg-card/95 backdrop-blur-sm border-b border-text-muted/15 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-text-primary text-sm md:text-base font-medium whitespace-nowrap">
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span className="text-text-muted text-xs hidden sm:inline whitespace-nowrap">
                {answeredCount} answered
              </span>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
              <div
                aria-hidden="true"
                className={`text-lg md:text-xl font-mono font-bold tabular-nums ${
                  timer.seconds < TIMER_PULSE_THRESHOLD ? 'text-warning animate-pulse' : 'text-text-primary'
                }`}
              >
                {formatTime(timer.seconds)}
              </div>
              <TimerAnnouncer seconds={timer.seconds} />
              <Button onClick={() => setShowEndModal(true)} variant="secondary" size="sm">
                End exam
              </Button>
            </div>
          </div>
          {/* Answered-progress indicator */}
          <div className="h-1 bg-bg-dark" role="presentation">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="pt-6 pb-6 px-4 md:px-8">
          <div className="max-w-7xl mx-auto flex gap-6">
            {/* Main Content */}
            <div className="flex-1">
            {/* Mobile Question Navigation Button */}
            <Button
              onClick={() => setShowQuestionNav(true)}
              variant="primary"
              size="sm"
              fullWidth
              className="lg:hidden mb-4 !justify-between"
            >
              <span>Question {currentIndex + 1} of {questions.length}</span>
              <span className="flex items-center gap-1 text-sm">View all questions <ArrowRight className="w-4 h-4" /></span>
            </Button>

            <Card className="mb-3">
              <div className="hidden lg:flex items-center justify-end mb-2">
                <span className="text-text-muted text-xs md:text-sm">Question {currentIndex + 1} of {questions.length}</span>
              </div>

              <h2 className="text-base md:text-lg text-text-primary mb-4 md:mb-5">
                {currentQuestion.question}
                {currentQuestion.isMultiAnswer && (
                  <span className="text-text-primary font-semibold ml-2">(Select {Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER})</span>
                )}
              </h2>

              <div className="space-y-2.5 md:space-y-3 mb-4">
                {Object.entries(currentQuestion.options).map(([key, value]) => {
                  const isSelected = currentQuestion.isMultiAnswer
                    ? Array.isArray(currentState?.userAnswer) && currentState.userAnswer.includes(key)
                    : currentState?.userAnswer === key

                  const requiredCount = Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER
                  const currentSelections = currentQuestion.isMultiAnswer && Array.isArray(currentState?.userAnswer)
                    ? currentState.userAnswer.length
                    : 0
                  const isDisabled = currentQuestion.isMultiAnswer && !isSelected && currentSelections >= requiredCount
                  
                  return (
                    <AnswerButton
                      key={key}
                      label={key as OptionKey}
                      text={value}
                      state={isSelected ? 'selected' : 'default'}
                      onClick={() => handleAnswer(key)}
                      disabled={isDisabled}
                    />
                  )
                })}
              </div>

              {currentQuestion.isMultiAnswer && (() => {
                const requiredCount = Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER
                return (
                  <div className="mb-3 text-xs md:text-sm text-text-muted">
                    {Array.isArray(currentState?.userAnswer) && currentState.userAnswer.length > 0 ? (
                      <span className="text-text-primary font-medium">
                        {currentState.userAnswer.length}/{requiredCount} answers selected
                      </span>
                    ) : (
                      <span>Select {requiredCount} answers</span>
                    )}
                  </div>
                )
              })()}

              <button
                onClick={toggleFlag}
                aria-pressed={!!currentState?.flagged}
                className={`flex items-center gap-2 min-h-[44px] px-4 py-2 md:py-2.5 rounded-lg transition-colors text-sm ${
                  currentState?.flagged
                    ? 'bg-warning/20 text-warning border border-warning'
                    : 'bg-bg-dark text-text-muted hover:text-text-primary'
                }`}
              >
                <Flag className={`w-4 h-4 md:w-5 md:h-5 ${currentState?.flagged ? 'fill-warning' : ''}`} aria-hidden="true" />
                <span className="font-medium text-xs md:text-sm">{currentState?.flagged ? 'Flagged for review' : 'Flag for review'}</span>
              </button>
            </Card>

            <div className="flex gap-4">
              <Button
                onClick={previousQuestion}
                disabled={currentIndex === 0}
                variant="secondary"
                className="flex-1"
              >
                Previous
              </Button>
              {currentIndex === questions.length - 1 ? (
                <Button onClick={() => setShowEndModal(true)} variant="primary" className="flex-1">
                  End exam
                </Button>
              ) : (
                <Button onClick={nextQuestion} variant="secondary" className="flex-1">
                  Next
                </Button>
              )}
            </div>
            </div>

            {/* Question Grid Sidebar */}
            <div className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24 bg-bg-card rounded-xl p-4 shadow-card">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Questions</h3>
              <ExamQuestionGrid
                questions={questions}
                answers={answers}
                currentIndex={currentIndex}
                onSelect={goToQuestion}
              />
            </div>
            </div>
          </div>
        </div>

        {/* Question Navigation Modal (Mobile/Tablet) */}
        <Modal isOpen={showQuestionNav} title="Questions" onClose={() => setShowQuestionNav(false)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-text-muted mb-4">
              <span>Answered: {answeredCount}/{questions.length}</span>
              <span>Flagged: {flaggedCount}</span>
            </div>
            <ExamQuestionGrid
              questions={questions}
              answers={answers}
              currentIndex={currentIndex}
              onSelect={(idx) => { goToQuestion(idx); setShowQuestionNav(false) }}
              variant="modal"
            />
          </div>
        </Modal>

        {/* End Exam Modal */}
        <Modal isOpen={showEndModal} title="End exam" onClose={() => setShowEndModal(false)}>
          <div className="space-y-4">
            <p className="text-text-primary">You have answered <span className="font-bold">{answeredCount}</span> of {questions.length} questions.</p>
            <p className="text-text-primary"><span className="font-bold">{flaggedCount}</span> questions are flagged for review.</p>
            {answeredCount < questions.length && (
              <p className="text-warning text-sm" role="alert">
                <span className="font-semibold">{questions.length - answeredCount} unanswered</span> {questions.length - answeredCount === 1 ? 'question is' : 'questions are'} marked incorrect on submit.
              </p>
            )}
            {loading ? (
              <div className="py-8">
                <LoadingSpinner text="Submitting exam..." />
              </div>
            ) : (
              <div className="flex gap-4 mt-6">
                <Button onClick={() => setShowEndModal(false)} variant="secondary" className="flex-1">
                  Go back
                </Button>
                <Button onClick={handleSubmitExam} variant="primary" className="flex-1">
                  Submit exam
                </Button>
              </div>
            )}
          </div>
        </Modal>

        {/* Custom leave-confirm modal — replaces the native beforeunload dialog
            for intercepted in-app navigation. Leaving discards the in-progress
            attempt (exam state lives in this island's memory), so this is a real
            confirm, not just a heads-up. */}
        <Modal
          isOpen={pendingLeaveUrl !== null}
          title="Leave the exam?"
          onClose={() => setPendingLeaveUrl(null)}
        >
          <div className="space-y-4">
            <p className="text-text-primary">
              Your exam is still in progress. If you leave this page now, your
              current answers and timer will be lost and this attempt will not be saved.
            </p>
            <div className="flex gap-4 mt-6">
              <Button onClick={() => setPendingLeaveUrl(null)} variant="secondary" className="flex-1">
                Stay in exam
              </Button>
              <Button
                onClick={() => { if (pendingLeaveUrl) confirmExamLeave(pendingLeaveUrl) }}
                variant="danger"
                className="flex-1"
              >
                Leave exam
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  // Review screen
  if (screen === 'review' && results) {
    const filteredQuestions = results.questionResults.filter(result => {
      // Apply filters
      if (reviewFilter === 'incorrect' && result.isCorrect) return false
      if (reviewFilter === 'flagged' && !result.wasFlagged) return false
      if (reviewDomainFilter !== null && result.domainId !== reviewDomainFilter) return false
      return true
    })

    const incorrectCount = results.questionResults.filter(r => !r.isCorrect).length
    const flaggedReviewCount = results.questionResults.filter(r => r.wasFlagged).length

    if (filteredQuestions.length === 0) {
      return (
        <div className="flex-1">
          <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
              <Card padding="lg" className="text-center">
                <p className="text-text-muted text-lg mb-6">No questions match the selected filters.</p>
                <Button
                  onClick={() => {
                    setReviewFilter('all')
                    setReviewDomainFilter(null)
                  }}
                  variant="primary"
                >
                  Clear filters
                </Button>
              </Card>
            </div>
          </div>
        </div>
      )
    }

    const currentReviewQuestion = filteredQuestions[reviewQuestionIndex]
    const originalQuestion = questions.find(q => q.id === currentReviewQuestion.questionId)!

    return (
      <div className="flex-1">
        <div className="p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Filter Controls */}
            <Card padding="sm" className="mb-4">
              <div className="space-y-3">
                {/* Filter Buttons */}
                <div>
                  <span className="text-text-muted text-xs md:text-sm font-medium mb-2 block">Filter:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setReviewFilter('all')
                        setReviewQuestionIndex(0)
                      }}
                      aria-pressed={reviewFilter === 'all'}
                      className={filterChipClass({ active: reviewFilter === 'all', surface: 'dark' })}
                    >
                      All ({results.questionResults.length})
                    </button>
                    <button
                      onClick={() => {
                        if (incorrectCount > 0) {
                          setReviewFilter('incorrect')
                          setReviewQuestionIndex(0)
                        }
                      }}
                      disabled={incorrectCount === 0}
                      aria-pressed={reviewFilter === 'incorrect'}
                      className={`${filterChipClass({ active: reviewFilter === 'incorrect', surface: 'dark' })} ${
                        incorrectCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Incorrect ({incorrectCount})
                    </button>
                    <button
                      onClick={() => {
                        if (flaggedReviewCount > 0) {
                          setReviewFilter('flagged')
                          setReviewQuestionIndex(0)
                        }
                      }}
                      disabled={flaggedReviewCount === 0}
                      aria-pressed={reviewFilter === 'flagged'}
                      className={`${filterChipClass({ active: reviewFilter === 'flagged', surface: 'dark' })} ${
                        flaggedReviewCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Flagged ({flaggedReviewCount})
                    </button>
                  </div>
                </div>

                {/* Domain Filter Buttons */}
                <div>
                  <span className="text-text-muted text-xs md:text-sm font-medium mb-2 block">Domain:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setReviewDomainFilter(null)
                        setReviewQuestionIndex(0)
                      }}
                      aria-pressed={reviewDomainFilter === null}
                      className={filterChipClass({ active: reviewDomainFilter === null, surface: 'dark' })}
                    >
                      All Domains
                    </button>
                    {cert.domains.map(domain => (
                      <button
                        key={domain.id}
                        onClick={() => {
                          setReviewDomainFilter(reviewDomainFilter === domain.id ? null : domain.id)
                          setReviewQuestionIndex(0)
                        }}
                        aria-pressed={reviewDomainFilter === domain.id}
                        className={filterChipClass({ active: reviewDomainFilter === domain.id, surface: 'dark' })}
                      >
                        {domain.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question Number Grid */}
                <div>
                  <h3 className="text-xs md:text-sm font-semibold text-text-muted mb-2 text-center">Questions:</h3>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(32px,32px))] md:grid-cols-[repeat(auto-fit,minmax(36px,36px))] gap-0.5 md:gap-1 justify-center">
                    {results.questionResults.map((result, idx) => {
                      const isCurrentQuestion = filteredQuestions[reviewQuestionIndex]?.questionId === result.questionId
                      const isInFilteredSet = filteredQuestions.some(fq => fq.questionId === result.questionId)
                      const stateLabel = result.isCorrect ? 'correct' : 'incorrect'
                      const flagLabel = result.wasFlagged ? ', flagged' : ''
                      const ariaLabel = `Question ${idx + 1}: ${stateLabel}${flagLabel}`

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            const filteredIdx = filteredQuestions.findIndex(fq => fq.questionId === result.questionId)
                            if (filteredIdx !== -1) {
                              setReviewQuestionIndex(filteredIdx)
                            }
                          }}
                          disabled={!isInFilteredSet}
                          aria-label={ariaLabel}
                          aria-current={isCurrentQuestion ? 'true' : undefined}
                          className={`w-8 h-8 md:w-9 md:h-9 rounded text-[10px] md:text-xs font-medium transition-all ${
                            isCurrentQuestion
                              ? 'ring-2 ring-brand ring-offset-1 ring-offset-bg-card'
                              : ''
                          } ${
                            !isInFilteredSet
                              ? 'opacity-30 cursor-not-allowed'
                              : 'hover:scale-110'
                          } ${
                            result.isCorrect
                              ? 'bg-success text-on-brand'
                              : 'bg-danger text-on-brand'
                          } ${
                            result.wasFlagged
                              ? 'ring-2 ring-warning'
                              : ''
                          }`}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-4 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-success rounded"></span> Correct
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-danger rounded"></span> Incorrect
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-bg-dark rounded ring-2 ring-warning"></span> Flagged
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Question Display */}
            <div className="mb-4">
              <QuestionReviewCard
                question={originalQuestion}
                userAnswer={currentReviewQuestion.userAnswer}
                isCorrect={currentReviewQuestion.isCorrect}
                wasFlagged={currentReviewQuestion.wasFlagged}
                questionNumber={reviewQuestionIndex + 1}
                totalQuestions={filteredQuestions.length}
                certCode={cert.code}
              />
            </div>

            <Button onClick={() => setScreen('results')} variant="secondary" fullWidth>
              Back to results
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center">
      <p className="text-text-muted">Something went wrong. Please refresh the page.</p>
    </div>
  )
}

const ANNOUNCE_THRESHOLDS = [15 * 60, 10 * 60, 5 * 60, 2 * 60, 60, 30]

function TimerAnnouncer({ seconds }: { seconds: number }) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (ANNOUNCE_THRESHOLDS.includes(seconds)) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      // setState is intentional here for accessibility announcements at specific
      // time thresholds. The effect depends on seconds and updates message state
      // to trigger screen reader announcements via aria-live.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage(
        mins > 0
          ? `${mins} minute${mins > 1 ? 's' : ''} remaining`
          : `${secs} seconds remaining`,
      )
    }
  }, [seconds])

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </span>
  )
}
