import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCert } from '../hooks/useCert'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { useSEO } from '../hooks/useSEO'
import { getSupabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { AnswerButton } from '../components/AnswerButton'
import { OrderingInput } from '../components/OrderingInput'
import { MatchingInput } from '../components/MatchingInput'
import { ProgressBar } from '../components/ProgressBar'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { Modal } from '../components/Modal'
import { confirmExamLeave, isIntentionalLeave } from '../lib/examGuard'
import { UnlockCTA } from '../components/landing/UnlockCTA'
import { updateDomainProgress } from '../lib/supabaseUtils'
import { reviewCellClass } from '../lib/buttonStyles'
import { goToLogin } from '../lib/navigation'
import type { Question, OptionKey } from '../types'
import { loadDomainQuestions } from '../data/questions'
import { isAnswerCorrect, correctAnswerFor } from '../lib/scoring'
import { trackEvent, trackPageView } from '../lib/analytics'
import { useSpacedRepetition } from '../hooks/useSpacedRepetition'
import { shuffleAndMapQuestions, toggleMultiAnswer, getQuestionType, encodeAnswerForDb, type OptionKeyMap } from '../lib/utils'
import {
  MAX_MULTI_ANSWER,
  ANSWER_FEEDBACK_DELAY_MS,
  MIN_PRACTICE_QUESTIONS,
  MAX_PRACTICE_QUESTIONS,
  DEFAULT_PRACTICE_QUESTIONS,
  PRACTICE_QUESTION_STEP,
  buildGitHubIssueUrl,
} from '../lib/constants'
import { ArrowRight, Check, X } from 'lucide-react'

type Screen = 'selection' | 'config' | 'practice' | 'results'

/**
 * "Don't show again" flag for the practice leave-guard modal. Practice is
 * lower-stakes than the timed mock exam (whose guard intentionally has NO
 * opt-out), so users may permanently dismiss this one. Stored on confirm-leave
 * with the checkbox ticked; when set, both the in-app modal and the native
 * beforeunload warning are skipped.
 */
const PRACTICE_LEAVE_GUARD_KEY = 'cloudcertprep_practice_leave_guard'

function isLeaveGuardDismissed(): boolean {
  try {
    return localStorage.getItem(PRACTICE_LEAVE_GUARD_KEY) === 'dismissed'
  } catch {
    return false
  }
}

interface QuestionResult {
  question: Question
  userAnswer: string | string[]
  isCorrect: boolean
}

export function DomainPractice() {
  const navigate = useNavigate()
  const location = useLocation()
  const { goHome } = useCertNavigate()
  const { user, loading: authLoading } = useAuth()
  const cert = useCert()
  // `selectedDomain` is DERIVED from the URL (?domain=N), not state, so deep
  // links and browser Back/Forward stay in sync without a setState-in-effect.
  // `screen` only tracks the progression AFTER a domain is chosen
  // (config -> practice -> results). With no valid domain in the URL the
  // selection screen is shown regardless of `screen`.
  const urlDomainParam = Number(new URLSearchParams(location.search).get('domain'))
  const selectedDomain = (urlDomainParam && cert.domains.some(d => d.id === urlDomainParam))
    ? urlDomainParam
    : null
  const [screen, setScreen] = useState<Screen>('config')
  // The selection screen is shown whenever no domain is selected in the URL.
  // Once a domain is chosen, `screen` drives config -> practice -> results.
  // Guests practise too (unlocked 2026-06-13, matching the "free, no signup"
  // promise and the mock exam's guest mode): question selection falls back to
  // a random shuffle and nothing is persisted; the config/results screens say
  // so and carry the sign-in CTA.
  const effectiveScreen: Screen = selectedDomain === null ? 'selection' : screen
  const [questionCount, setQuestionCount] = useState(DEFAULT_PRACTICE_QUESTIONS)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState<string | string[] | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  // Shown when the user tries to submit a multi-answer question without picking
  // the required number (e.g. selected 1 of 2). Cleared on any selection change
  // and on moving to the next question.
  const [multiAnswerWarning, setMultiAnswerWarning] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0)
  const [optionKeyMaps, setOptionKeyMaps] = useState<Map<string, OptionKeyMap>>(new Map())
  const [loading, setLoading] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [pendingLeaveUrl, setPendingLeaveUrl] = useState<string | null>(null)
  const [dontShowLeaveGuard, setDontShowLeaveGuard] = useState(false)
  // Synchronous re-entrancy guard for finishPractice (mirrors _MockExam's
  // submittingRef). React state is async, so a rapid double-click on "Finish
  // session" would otherwise run the attempt_questions insert twice before the
  // screen swaps to results, inflating per-domain mastery.
  const finishingRef = useRef(false)
  const { selectQuestions, refreshMastery } = useSpacedRepetition(user?.id ?? null, selectedDomain, cert.code)

  const domains = Object.fromEntries(cert.domains.map(d => [d.id, d.name]))

  // Set dynamic page title based on screen and domain. Canonical is the
  // per-cert domain-practice URL so each cert ranks for its own keyword space
  // (e.g. "AIF-C01 domain practice" vs "CLF-C02 domain practice").
  const domainPracticePath = `/${cert.provider}/${cert.code}/domain-practice`
  const domainNames = cert.domains.map(d => d.name).join(', ')
  const pageTitle = effectiveScreen === 'practice' && selectedDomain !== null
    ? `${cert.shortName} · ${domains[selectedDomain] ?? ''} · CloudCertPrep`
    : effectiveScreen === 'results' ? `${cert.shortName} practice results · CloudCertPrep`
    : `${cert.shortName} Domain Practice with Spaced Repetition · CloudCertPrep`
  useSEO({
    title: pageTitle,
    description: `Practice ${cert.name} (${cert.shortName}) questions by exam domain. Instant feedback, explanations, adaptive spaced repetition. Domains: ${domainNames}.`,
    // NOTE: this route ships robots=noindex (set on the Astro shell), so it
    // must NOT emit a canonical — noindex+canonical is contradictory and a
    // noindex page accrues no indexing equity. BaseLayout omits the canonical
    // server-side; pass null so useSEO doesn't re-inject one on JS render. (M0d)
    canonical: null,
  })

  // Preload questions when domain is selected (before user clicks Start).
  // This hides network latency — the chunk will be cached by the time
  // they start. Runs for guests and signed-in users alike (both practice).
  useEffect(() => {
    if (selectedDomain) {
      loadDomainQuestions(cert.code, selectedDomain).catch(() => {
        // Silently fail - startPractice will retry if preload failed
      })
    }
  }, [selectedDomain, cert.code])

  // Leave-guard (mirrors the MockExam pattern): answers are only persisted at
  // finishPractice(), so leaving mid-session silently discards them. The
  // native beforeunload dialog is the last-resort net for browser-level exits
  // (tab close, refresh); confirmed in-app leaves set isIntentionalLeave() so
  // the net stays silent for them. Skipped entirely once the user has ticked
  // "don't show again".
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (effectiveScreen === 'practice' && questions.length > 0 && !isIntentionalLeave() && !isLeaveGuardDismissed()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [effectiveScreen, questions.length])

  // Intercept in-app anchor navigation during an active practice session (the
  // static header logo/nav, breadcrumb, footer links) and route it through the
  // custom "Leave practice?" modal instead of the native dialog. Same
  // delegated capture listener as MockExam: modified clicks and
  // new-tab/external links pass through untouched (they don't unload the
  // page).
  useEffect(() => {
    if (effectiveScreen !== 'practice' || questions.length === 0) return
    function onClickCapture(e: MouseEvent) {
      if (isLeaveGuardDismissed()) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || anchor.target === '_blank' || href.startsWith('#') || href.startsWith('mailto:')) return
      const url = new URL(href, window.location.origin)
      if (url.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      setPendingLeaveUrl(url.pathname + url.search)
    }
    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [effectiveScreen, questions.length])

  function confirmPracticeLeave() {
    if (!pendingLeaveUrl) return
    if (dontShowLeaveGuard) {
      try {
        localStorage.setItem(PRACTICE_LEAVE_GUARD_KEY, 'dismissed')
      } catch {
        // localStorage unavailable: the choice just doesn't persist
      }
    }
    confirmExamLeave(pendingLeaveUrl)
  }

  function selectDomain(domainId: number) {
    // Reflect the chosen domain in the URL (?domain=N) so it is deep-linkable
    // and browser Back returns to the selection screen. selectedDomain is then
    // derived from the URL on the next render. Reset the progression to the
    // config screen in case a previous session left it on practice/results.
    // Guests proceed like signed-in users (guest mode: random selection, no
    // persistence — communicated on the config screen).
    setScreen('config')
    navigate(`${domainPracticePath}?domain=${domainId}`)
  }

  // The `authLoading` skeleton stays as an early-return below since it must
  // run AFTER every hook so React's hook order remains consistent across
  // renders.
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <LoadingSpinner text="Loading..." />
      </div>
    )
  }

  async function startPractice() {
    setLoading(true)
    try {
      // Re-fetch mastery data so back-to-back sessions use fresh weights
      await refreshMastery()
      // Load only the selected domain's questions (separate chunk)
      const allDomainQuestions = await loadDomainQuestions(cert.code, selectedDomain!)

      // Use spaced repetition for authenticated users, random shuffle for guests
      const selectedQuestions = selectQuestions(allDomainQuestions, questionCount)

      // Shuffle answer options for each question
      const { questions: shuffled, keyMaps } = shuffleAndMapQuestions(selectedQuestions)
      setQuestions(shuffled)
      setOptionKeyMaps(keyMaps)
      setCurrentIndex(0)
      setUserAnswer(null)
      setShowFeedback(false)
      setMultiAnswerWarning(false)
      setResults([])
      setQuestionResults([])
      finishingRef.current = false // re-arm the dup-write guard for this fresh session
      setScreen('practice')
      window.scrollTo(0, 0)
      trackEvent('practice_started', { domain_id: selectedDomain, question_count: questionCount })
      // Keep the visitor "online" in Umami during the practice session by
      // emitting a virtual page view (see MockExam, task 13.10). (R15.5)
      trackPageView(`/${cert.provider}/${cert.code}/domain-practice/active`)
    } finally {
      setLoading(false)
    }
  }

  function handleAnswer(answer: string) {
    if (answering) return
    const current = questions[currentIndex]
    
    if (current.isMultiAnswer) {
      const currentAnswers = Array.isArray(userAnswer) ? userAnswer : []
      const newAnswers = toggleMultiAnswer(currentAnswers, answer, MAX_MULTI_ANSWER)
      setUserAnswer(newAnswers)
      setMultiAnswerWarning(false)
    } else {
      setAnswering(true)
      setUserAnswer(answer)
      setTimeout(() => checkAnswer(answer), ANSWER_FEEDBACK_DELAY_MS)
    }
  }

  function checkAnswer(answer?: string | string[]) {
    const current = questions[currentIndex]
    const type = getQuestionType(current)
    // Ordering/matching only reach here via the Submit button, which is gated on
    // interaction (ordering: reordered at least once; matching: every pair set),
    // so `userAnswer` already holds the answer. Single passes its key in directly.
    const answerToCheck: string | string[] = answer ?? userAnswer ?? (type === 'single' ? '' : [])
    const correct = isAnswerCorrect(answerToCheck, correctAnswerFor(current), type)

    // Functional updaters avoid stale closures if two checkAnswer calls
    // race in the same tick (e.g. rapid keyboard / re-render).
    setResults(prev => [...prev, correct])
    setQuestionResults(prev => [...prev, {
      question: current,
      userAnswer: answerToCheck,
      isCorrect: correct
    }])
    setAnswering(false)
    setShowFeedback(true)
    trackEvent('question_answered', {
      surface: 'practice',
      domain_id: selectedDomain,
      is_correct: correct,
    })
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setUserAnswer(null)
      setShowFeedback(false)
      setMultiAnswerWarning(false)
    } else {
      finishPractice()
    }
  }

  async function finishPractice() {
    if (finishingRef.current) return
    finishingRef.current = true
    // Only save to database if user is logged in
    if (user) {
      try {
        const supabase = await getSupabase()
        // Save each question result to attempt_questions table (without attempt_id for practice mode)
        const questionRecords = questions.map((q, idx) => {
          const keyMap = optionKeyMaps.get(q.id) || {}
          const type = getQuestionType(q)
          const ua = questionResults[idx]?.userAnswer ?? (type === 'single' ? '' : [])

          return {
            attempt_id: null, // Practice mode doesn't have an exam attempt
            user_id: user.id,
            question_id: q.id,
            user_answer: encodeAnswerForDb(ua, keyMap, type),
            correct_answer: encodeAnswerForDb(correctAnswerFor(q), keyMap, type),
            is_correct: results[idx] || false,
            was_flagged: false,
            domain_id: selectedDomain,
            cert_code: cert.code,
          }
        })

        // Insert practice question results
        const { error: questionsError } = await supabase
          .from('attempt_questions')
          .insert(questionRecords)

        if (questionsError) throw questionsError

        await updateDomainProgress(user.id, selectedDomain!, cert.code)
      } catch (error: unknown) {
        logError('DomainPractice.finishPractice', error)
      }
    }

    trackEvent('practice_completed', { domain_id: selectedDomain, correct: results.filter(r => r).length, total: questions.length })
    setScreen('results')
    window.scrollTo(0, 0)
  }

  const currentQuestion = questions[currentIndex]
  const correctCount = results.filter(r => r).length
  const currentType = currentQuestion ? getQuestionType(currentQuestion) : 'single'
  const isCorrect = showFeedback && currentQuestion && isAnswerCorrect(
    userAnswer ?? (currentType === 'single' ? '' : []),
    correctAnswerFor(currentQuestion),
    currentType,
  )

  if (effectiveScreen === 'selection') {
    return (
      <div className="p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3 md:mb-4">{cert.shortName} Domain Practice</h1>
            <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">Practice questions from a specific domain</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
              {cert.domains.map(domain => {
                return (
                  <button
                    key={domain.id}
                    onClick={() => selectDomain(domain.id)}
                    aria-label={`Practice ${domain.name}: ${domain.questionCount} questions`}
                    className="group bg-bg-dark hover:bg-bg-card-hover p-4 md:p-6 rounded-xl border border-border-hairline hover:border-text-muted/50 transition-[background-color,border-color] duration-gentle ease-out text-left flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      {/* Brand-tinted index chip; the digit is theme-aware text
                          (orange-on-peach read low-contrast in light mode). */}
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center font-mono text-lg md:text-xl font-semibold flex-shrink-0 bg-brand/15 text-text-primary">
                        {domain.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm md:text-base lg:text-lg font-semibold text-text-primary">
                          {domain.name}
                        </h3>
                        <p className="text-xs md:text-sm text-text-muted">{domain.questionCount} questions</p>
                      </div>
                    </div>
                    <ArrowRight
                      className="flex-shrink-0 w-4 h-4 md:w-5 md:h-5 text-text-muted/40 transition-[transform,color] duration-gentle group-hover:translate-x-0.5 group-hover:text-text-primary"
                      aria-hidden="true"
                    />
                  </button>
                )
              })}
            </div>

            {/* Lowest-priority action: a quiet centered ghost, not a full-width
                button competing with the domain grid above it. */}
            <div className="flex justify-center pt-1">
              <Button onClick={goHome} variant="ghost" size="sm">
                Back to home
              </Button>
            </div>
          </Card>

          {/* Guest-only sign-in nudge — rendered as a sibling card BELOW the
              selection card, matching the MockExam guest pattern. Domain
              practice is fully usable as a guest (random selection, nothing
              saved); this card states the trade-off and the sign-in upside. */}
          {!user && (
            <div className="mt-4 md:mt-6">
              <UnlockCTA
                onSignIn={() => goToLogin(navigate, location)}
                location="domain_practice_wall"
                title="Unlock spaced repetition and saved mastery"
                body="Practice free as a guest, no account needed. Sign in to save per-domain mastery and unlock spaced repetition, which repeats the questions you get wrong."
                ctaLabel="Sign in to save progress"
                noTopMargin
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (effectiveScreen === 'config') {
    return (
      <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold text-text-primary mb-2">
              {cert.shortName} · {domains[selectedDomain!]}
            </h1>
            <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">Configure your practice session</p>

            <div className="flex items-center justify-between mb-8">
              <span className="text-text-primary font-medium" id="question-count-label">
                Number of Questions:
              </span>
              <div className="flex items-center gap-3 md:gap-4" role="group" aria-labelledby="question-count-label">
                <button
                  onClick={() => setQuestionCount(Math.max(MIN_PRACTICE_QUESTIONS, questionCount - PRACTICE_QUESTION_STEP))}
                  disabled={questionCount <= MIN_PRACTICE_QUESTIONS}
                  aria-label="Decrease question count"
                  className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-full transition-[background-color,transform] duration-gentle ease-press active:scale-[0.97] active:duration-press disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  −
                </button>
                <span className="text-2xl md:text-3xl font-bold text-text-primary w-12 md:w-16 text-center">
                  {questionCount}
                </span>
                <button
                  onClick={() => setQuestionCount(Math.min(MAX_PRACTICE_QUESTIONS, questionCount + PRACTICE_QUESTION_STEP))}
                  disabled={questionCount >= MAX_PRACTICE_QUESTIONS}
                  aria-label="Increase question count"
                  className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-full transition-[background-color,transform] duration-gentle ease-press active:scale-[0.97] active:duration-press disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-bg-dark rounded-lg p-4 mb-8">
              {user ? (
                <p className="text-sm text-text-muted">
                  <span className="text-text-primary font-semibold">Smart Practice:</span> Questions you've gotten wrong will appear more frequently. Questions you consistently get right will appear less often.
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  <span className="text-text-primary font-semibold">Guest mode:</span> your results will not be saved. Sign in to save per-domain mastery and unlock spaced repetition, which repeats the questions you get wrong.
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => navigate(domainPracticePath)}
                disabled={loading}
                variant="secondary"
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={startPractice}
                variant="primary"
                className="flex-1"
                arrow
                loading={loading}
                loadingText="Loading questions..."
              >
                Start practice
              </Button>
            </div>
          </Card>
          </div>
        </div>
    )
  }

  if (effectiveScreen === 'results') {
    const currentResult = questionResults[selectedQuestionIndex]
    
    return (
      <div className="p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Summary Header */}
            <Card padding="md" className="text-center mb-4 animate-enter">
              <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3">Practice session complete!</h1>
              <p className="text-lg md:text-xl text-text-muted">
                You got <span className="text-success font-bold">{correctCount}/{results.length}</span> correct ({Math.round((correctCount / results.length) * 100)}%)
              </p>
            </Card>

            {/* Question Number Grid */}
            <Card padding="sm" className="mb-4">
              <h3 className="text-xs md:text-sm font-semibold text-text-muted mb-2 text-center">Questions:</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(32px,32px))] md:grid-cols-[repeat(auto-fit,minmax(36px,36px))] gap-0.5 md:gap-1 justify-center">
                {questionResults.map((result, idx) => {
                  const stateLabel = result.isCorrect ? 'correct' : 'incorrect'
                  const ariaLabel = `Question ${idx + 1}: ${stateLabel}`
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedQuestionIndex(idx)}
                      aria-label={ariaLabel}
                      aria-current={selectedQuestionIndex === idx ? 'true' : undefined}
                      className={reviewCellClass({
                        correct: result.isCorrect,
                        current: selectedQuestionIndex === idx,
                      })}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* Single Question View */}
            {currentResult && (
              <div className="mb-4">
                <QuestionReviewCard
                  question={currentResult.question}
                  userAnswer={currentResult.userAnswer}
                  isCorrect={currentResult.isCorrect}
                  questionNumber={selectedQuestionIndex + 1}
                  totalQuestions={questionResults.length}
                  certCode={cert.code}
                />
              </div>
            )}

            {/* Guest signup CTA at the highest-intent moment, mirroring the
                exam results screen: the session just ended and nothing was
                persisted, so say so and offer the save path. */}
            {!user && (
              <UnlockCTA
                onSignIn={() => goToLogin(navigate, location)}
                location="practice_results"
                title="Don't lose this progress"
                body="This session's results were not saved. Create a free account to track per-domain mastery and get spaced repetition focused on what you got wrong."
                ctaLabel="Sign in to save progress"
              />
            )}

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row gap-4 mt-6">
              <Button onClick={goHome} variant="secondary" className="flex-1">
                Back to home
              </Button>
              <Button onClick={() => selectDomain(selectedDomain!)} variant="primary" className="flex-1">
                Practice again
              </Button>
            </div>
          </div>
        </div>
    )
  }

  if (effectiveScreen === 'practice' && currentQuestion) {
    return (
      <div className="p-4 md:p-8">
          <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-center mb-6">
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-text-primary">
              {domains[selectedDomain!]}
            </h2>
          </div>

          {/* Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-muted text-sm">
                Question {currentIndex + 1} of {questions.length}
              </span>
            </div>
            {/* Advance when the current question is answered (showFeedback), so
                the bar reaches 100% on the final graded question instead of
                capping at (n-1)/n. Display-only; scoring is untouched. */}
            <ProgressBar percent={((currentIndex + (showFeedback ? 1 : 0)) / questions.length) * 100} showLabel={false} />
          </div>

          {/* Question */}
          <Card className="mb-3">
            <h3 className="text-base md:text-lg text-text-primary mb-4 md:mb-5">
              {currentQuestion.question}
              {currentType === 'multi' && (
                <span className="text-text-primary font-semibold ml-2">(Select {Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER})</span>
              )}
              {currentType === 'ordering' && (
                <span className="text-text-primary font-semibold ml-2">(Put in order)</span>
              )}
              {currentType === 'matching' && (
                <span className="text-text-primary font-semibold ml-2">(Match each item)</span>
              )}
            </h3>

            <div className="space-y-2.5 mb-4">
              {currentType === 'ordering' ? (
                <OrderingInput
                  mode={showFeedback ? 'result' : 'input'}
                  options={currentQuestion.options}
                  value={Array.isArray(userAnswer) ? userAnswer : null}
                  correctOrder={currentQuestion.correctOrder}
                  onChange={order => { setUserAnswer(order); setMultiAnswerWarning(false) }}
                />
              ) : currentType === 'matching' ? (
                <MatchingInput
                  mode={showFeedback ? 'result' : 'input'}
                  options={currentQuestion.options}
                  targets={currentQuestion.targets ?? {}}
                  value={Array.isArray(userAnswer) ? userAnswer : null}
                  correctMatches={currentQuestion.correctMatches}
                  onChange={tokens => { setUserAnswer(tokens); setMultiAnswerWarning(false) }}
                />
              ) : (
                Object.entries(currentQuestion.options).map(([key, value]) => {
                  const isSelected = currentQuestion.isMultiAnswer
                    ? Array.isArray(userAnswer) && userAnswer.includes(key)
                    : userAnswer === key

                  const requiredCount = Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER
                  const currentSelections = currentQuestion.isMultiAnswer && Array.isArray(userAnswer)
                    ? userAnswer.length
                    : 0
                  const isLimitReached = currentQuestion.isMultiAnswer && !isSelected && currentSelections >= requiredCount

                  let state: 'default' | 'selected' | 'correct' | 'wrong' = 'default'

                  if (showFeedback) {
                    const correctAnswers = Array.isArray(currentQuestion.answer) ? currentQuestion.answer : [currentQuestion.answer]
                    const isCorrectAnswer = correctAnswers.includes(key)

                    if (isCorrectAnswer) {
                      state = 'correct'
                    } else if (isSelected) {
                      state = 'wrong'
                    }
                  } else if (isSelected) {
                    state = 'selected'
                  }

                  return (
                    <AnswerButton
                      key={key}
                      label={key as OptionKey}
                      text={value}
                      state={state}
                      onClick={() => !showFeedback && !answering && handleAnswer(key)}
                      disabled={showFeedback || answering || isLimitReached}
                      compact={true}
                    />
                  )
                })
              )}
            </div>

            {currentQuestion.isMultiAnswer && !showFeedback && (() => {
              const requiredCount = Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER
              return (
                <div className="mb-3 text-xs md:text-sm text-text-muted">
                  {Array.isArray(userAnswer) && userAnswer.length > 0 ? (
                    <span className="text-text-primary font-medium" aria-live="polite" aria-atomic="true">
                      {userAnswer.length}/{requiredCount} answers selected
                    </span>
                  ) : (
                    <span>Select {requiredCount} answers</span>
                  )}
                </div>
              )
            })()}

            {currentQuestion.isMultiAnswer && !showFeedback && (() => {
              const requiredCount = Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER
              const selectedCount = Array.isArray(userAnswer) ? userAnswer.length : 0
              return (
                <>
                  {multiAnswerWarning && selectedCount < requiredCount && (
                    <Alert tone="warning" role="alert" className="mb-3 text-sm">
                      Select {requiredCount} answers to continue. You have {selectedCount} of {requiredCount} selected.
                    </Alert>
                  )}
                  {/* Enabled even when incomplete: a silently-disabled button left
                      users stuck with no idea why. Clicking under-selected shows
                      the warning above instead of grading a half-answer. */}
                  <Button
                    onClick={() => {
                      if (selectedCount < requiredCount) { setMultiAnswerWarning(true); return }
                      checkAnswer()
                    }}
                    variant="primary"
                    fullWidth
                  >
                    Submit answer
                  </Button>
                </>
              )
            })()}

            {(currentType === 'ordering' || currentType === 'matching') && !showFeedback && (() => {
              const leftCount = (Object.keys(currentQuestion.options) as OptionKey[]).filter(k => currentQuestion.options[k]).length
              const selectedCount = Array.isArray(userAnswer) ? userAnswer.length : 0
              // Both need interaction before grading. Ordering is unanswered
              // until the first reorder (userAnswer stays null until then,
              // matching the exam's unanswered model); matching needs every left
              // item paired.
              const touched = Array.isArray(userAnswer) && userAnswer.length > 0
              const complete = currentType === 'ordering' ? touched : selectedCount === leftCount
              return (
                <>
                  {currentType === 'matching' ? (
                    <div className="mb-3 text-xs md:text-sm text-text-muted">
                      {selectedCount > 0 ? (
                        <span className="text-text-primary font-medium" aria-live="polite" aria-atomic="true">
                          {selectedCount}/{leftCount} matched
                        </span>
                      ) : (
                        <span>Match all {leftCount} items</span>
                      )}
                    </div>
                  ) : !touched && (
                    <div className="mb-3 text-xs md:text-sm text-text-muted">Reorder the steps to set your answer.</div>
                  )}
                  {multiAnswerWarning && !complete && (
                    <Alert tone="warning" role="alert" className="mb-3 text-sm">
                      {currentType === 'matching'
                        ? `Match all ${leftCount} items to continue. You have ${selectedCount} of ${leftCount} matched.`
                        : 'Reorder the steps to set your answer before submitting.'}
                    </Alert>
                  )}
                  {/* Enabled even when incomplete (see the multi-answer note above):
                      clicking without finishing shows the warning instead of a
                      silently dead button. */}
                  <Button
                    onClick={() => {
                      if (!complete) { setMultiAnswerWarning(true); return }
                      checkAnswer()
                    }}
                    variant="primary"
                    fullWidth
                  >
                    Submit answer
                  </Button>
                </>
              )
            })()}

            {showFeedback && (
              <Alert tone={isCorrect ? 'success' : 'danger'} role="status" className="mt-4 p-4 animate-enter">
                <div className={`font-semibold mb-2 flex items-center gap-2 text-sm md:text-base ${isCorrect ? 'text-success' : 'text-danger'}`}>
                  {isCorrect ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <X className="w-4 h-4 md:w-5 md:h-5" />}
                  <p>{isCorrect ? 'Correct!' : 'Incorrect'}</p>
                </div>
                
                {/* Raw key echo only for single/multi. Ordering/matching show
                    their answer-vs-correct inline via the result-mode control
                    above, so a comma-joined key list would be redundant/cryptic. */}
                {!isCorrect && (currentType === 'single' || currentType === 'multi') && (
                  <div className="mb-2 text-xs md:text-sm">
                    <p className="text-danger font-medium mb-1">
                      Your answer: {currentQuestion.isMultiAnswer
                        ? (Array.isArray(userAnswer) ? userAnswer.join(', ') : '')
                        : userAnswer}
                    </p>
                    <p className="text-success font-medium">
                      Correct answer: {Array.isArray(currentQuestion.answer)
                        ? currentQuestion.answer.join(', ')
                        : currentQuestion.answer}
                    </p>
                  </div>
                )}
                
                {currentQuestion.explanation && (
                  <div className="border-t border-text-muted/20 pt-3 mt-3">
                    <p className="text-text-muted text-xs md:text-sm font-medium mb-1">Explanation:</p>
                    <div className="text-text-muted text-xs md:text-sm space-y-2 leading-relaxed">
                      {currentQuestion.explanation.split('\n').filter(Boolean).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </div>
                )}
              </Alert>
            )}

            {/* Question ID + Disclaimer */}
            <div className="mt-4 pt-3 border-t border-text-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <span className="text-xs text-text-muted font-mono">{currentQuestion.id}</span>
              <span className="text-[10px] text-text-muted">
                Found an error?{' '}
                <a 
                  href={buildGitHubIssueUrl(currentQuestion.id)}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-text-primary hover:text-text-primary/70 hover:underline"
                >
                  Report on GitHub
                </a>
              </span>
            </div>
          </Card>

          {showFeedback && (
            <Button onClick={nextQuestion} variant="primary" fullWidth>
              {currentIndex < questions.length - 1 ? 'Next question' : 'Finish session'}
            </Button>
          )}

          {/* Custom leave-confirm modal for intercepted in-app navigation.
              Unlike the mock-exam guard this one offers "don't show again":
              practice is low-stakes (a session, not a 65-question timed
              attempt), so a permanent opt-out is acceptable here. */}
          <Modal
            isOpen={pendingLeaveUrl !== null}
            title="Leave practice?"
            onClose={() => setPendingLeaveUrl(null)}
          >
            <div className="space-y-4">
              <p className="text-text-primary">
                Your practice session is still in progress. If you leave this
                page now, the answers from this session will not be saved.
              </p>
              <label className="flex items-center gap-2.5 text-sm text-text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowLeaveGuard}
                  onChange={e => setDontShowLeaveGuard(e.target.checked)}
                  className="w-4 h-4 rounded border-border-hairline accent-brand"
                />
                Don't ask me again
              </label>
              <div className="flex gap-4 mt-6">
                <Button onClick={() => setPendingLeaveUrl(null)} variant="secondary" className="flex-1">
                  Keep practicing
                </Button>
                <Button onClick={confirmPracticeLeave} variant="danger" className="flex-1">
                  Leave practice
                </Button>
              </div>
            </div>
          </Modal>
          </div>
        </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-text-muted">Something went wrong. Please refresh the page.</p>
    </div>
  )
}
