import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCert } from '../hooks/useCert'
import { useCertNavigate } from '../hooks/useCertNavigate'
import { useSEO } from '../hooks/useSEO'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { AnswerButton } from '../components/AnswerButton'
import { ProgressBar } from '../components/ProgressBar'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { UnlockCTA } from '../components/landing/UnlockCTA'
import { updateDomainProgress } from '../lib/supabaseUtils'
import { goToLogin } from '../lib/navigation'
import type { Question, OptionKey } from '../types'
import { loadDomainQuestions } from '../data/questions'
import { isAnswerCorrect } from '../lib/scoring'
import { trackEvent, trackPageView } from '../lib/analytics'
import { useSpacedRepetition } from '../hooks/useSpacedRepetition'
import { shuffleAndMapQuestions, toOriginalAnswer, toggleMultiAnswer, type OptionKeyMap } from '../lib/utils'
import {
  MAX_MULTI_ANSWER,
  ANSWER_FEEDBACK_DELAY_MS,
  MIN_PRACTICE_QUESTIONS,
  MAX_PRACTICE_QUESTIONS,
  DEFAULT_PRACTICE_QUESTIONS,
  PRACTICE_QUESTION_STEP,
  buildGitHubIssueUrl,
} from '../lib/constants'
import { Check, X } from 'lucide-react'

type Screen = 'selection' | 'config' | 'practice' | 'results'

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
  // Guests are ALWAYS held on the selection screen: a `?domain=N` deep link
  // would otherwise set effectiveScreen to 'config' and let a signed-out user
  // start practice, bypassing the auth wall enforced in `selectDomain`.
  const effectiveScreen: Screen = (selectedDomain === null || !user) ? 'selection' : screen
  const [questionCount, setQuestionCount] = useState(DEFAULT_PRACTICE_QUESTIONS)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState<string | string[] | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0)
  const [optionKeyMaps, setOptionKeyMaps] = useState<Map<string, OptionKeyMap>>(new Map())
  const [loading, setLoading] = useState(false)
  const [answering, setAnswering] = useState(false)
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
    // Canonical stays on the URL for both guests and authed users so the
    // page accumulates the same SEO equity whether the visitor sees the
    // auth wall or the actual practice flow.
    // NOTE: this route ships robots=noindex (set on the Astro shell), so it
    // must NOT emit a canonical — noindex+canonical is contradictory and a
    // noindex page accrues no indexing equity. BaseLayout omits the canonical
    // server-side; pass null so useSEO doesn't re-inject one on JS render. (M0d)
    canonical: null,
  })

  // Preload questions when domain is selected (before user clicks Start).
  // This hides network latency — the chunk will be cached by the time
  // they start. Only authed users reach this hook in any meaningful way
  // (guests are blocked by the auth wall below) but the hook itself is
  // always called to keep hook order consistent across renders.
  useEffect(() => {
    if (selectedDomain) {
      loadDomainQuestions(cert.code, selectedDomain).catch(() => {
        // Silently fail - startPractice will retry if preload failed
      })
    }
  }, [selectedDomain, cert.code])

  function selectDomain(domainId: number) {
    // Guests can see the selection screen for SEO/transparency but cannot
    // proceed — clicking a domain card kicks them into the sign-in flow.
    // `goToLogin` preserves the current URL as the `from` redirect target
    // so they land back on this same DomainPractice page after sign-in and
    // can re-click the domain they wanted. Domain id is logged as an extra
    // analytics dimension so we can see if any specific domain card drives
    // more sign-ins than others.
    if (!user) {
      trackEvent('unlock_cta_clicked', {
        location: 'domain_practice_card',
        domain_id: domainId,
      })
      goToLogin(navigate, location)
      return
    }
    // Reflect the chosen domain in the URL (?domain=N) so it is deep-linkable
    // and browser Back returns to the selection screen. selectedDomain is then
    // derived from the URL on the next render. Reset the progression to the
    // config screen in case a previous session left it on practice/results.
    setScreen('config')
    navigate(`${domainPracticePath}?domain=${domainId}`)
  }

  // Guests and signed-in users see the same selection screen (domain
  // card grid + Back to home button) for visual consistency and SEO —
  // crawlers see real cert-specific content rather than a thin gate.
  // The gate itself is enforced inside `selectDomain` above: clicking
  // a card as a guest triggers `goToLogin` instead of advancing screens.
  // A sibling `UnlockCTA` card below the selection card explains the
  // gating before the user clicks. The `authLoading` skeleton stays as
  // an early-return below since it must run AFTER every hook so React's
  // hook order remains consistent across renders.
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
      setResults([])
      setQuestionResults([])
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
    } else {
      setAnswering(true)
      setUserAnswer(answer)
      setTimeout(() => checkAnswer(answer), ANSWER_FEEDBACK_DELAY_MS)
    }
  }

  function checkAnswer(answer?: string | string[]) {
    const current = questions[currentIndex]
    const answerToCheck = answer || userAnswer
    const correct = isAnswerCorrect(answerToCheck!, current.answer, current.isMultiAnswer)

    // Functional updaters avoid stale closures if two checkAnswer calls
    // race in the same tick (e.g. rapid keyboard / re-render).
    setResults(prev => [...prev, correct])
    setQuestionResults(prev => [...prev, {
      question: current,
      userAnswer: answerToCheck!,
      isCorrect: correct
    }])
    setAnswering(false)
    setShowFeedback(true)    
    trackEvent('question_answered', {
      domain_id: selectedDomain,
      question_id: current.id,
      is_correct: correct,
      mode: 'practice',
      question_number: currentIndex + 1,
      total_questions: questions.length
    })
  }

  function nextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setUserAnswer(null)
      setShowFeedback(false)
    } else {
      finishPractice()
    }
  }

  async function finishPractice() {
    // Only save to database if user is logged in
    if (user) {
      try {
        // Save each question result to attempt_questions table (without attempt_id for practice mode)
        const questionRecords = questions.map((q, idx) => {
          const keyMap = optionKeyMaps.get(q.id) || {}
          const ua = questionResults[idx]?.userAnswer
          const originalUserAnswer = toOriginalAnswer(ua || '', keyMap)
          const originalCorrectAnswer = toOriginalAnswer(q.answer, keyMap)

          return {
            attempt_id: null, // Practice mode doesn't have an exam attempt
            user_id: user.id,
            question_id: q.id,
            user_answer: Array.isArray(originalUserAnswer) ? originalUserAnswer.join(',') : originalUserAnswer,
            correct_answer: Array.isArray(originalCorrectAnswer) ? originalCorrectAnswer.join(',') : originalCorrectAnswer,
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
  const isCorrect = showFeedback && currentQuestion && isAnswerCorrect(userAnswer!, currentQuestion.answer, currentQuestion.isMultiAnswer)

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
                    className="bg-bg-dark hover:bg-bg-card-hover p-4 md:p-6 rounded-xl border-2 border-transparent hover:border-brand transition-all text-left lift"
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-xl md:text-2xl font-bold flex-shrink-0 bg-brand text-on-brand">
                        {domain.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm md:text-base lg:text-lg font-semibold text-text-primary">
                          {domain.name}
                        </h3>
                        <p className="text-xs md:text-sm text-text-muted">{domain.questionCount} questions</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <Button onClick={goHome} variant="secondary" fullWidth>
              Back to home
            </Button>
          </Card>

          {/* Guest-only sign-in nudge — rendered as a sibling card BELOW
              the selection card, matching the MockExam guest pattern. The
              domain cards above are visually identical to the signed-in
              experience; clicking any of them triggers the sign-in flow
              via `selectDomain`. This sibling card explains the gating
              ahead of time so the redirect isn't a surprise. */}
          {!user && (
            <div className="mt-4 md:mt-6">
              <UnlockCTA
                onSignIn={() => goToLogin(navigate, location)}
                location="domain_practice_wall"
                title="Sign in to unlock domain practice"
                body="Domain practice tracks per-domain mastery, prioritises questions you have gotten wrong, and saves your progress across sessions."
                ctaLabel="Sign in to unlock domain practice"
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
                  className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-full transition-all duration-150 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
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
                  className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-full transition-all duration-150 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-bg-dark rounded-lg p-4 mb-8">
              <p className="text-sm text-text-muted">
                <span className="text-text-primary font-semibold">Smart Practice:</span> Questions you've gotten wrong will appear more frequently. Questions you consistently get right will appear less often.
              </p>
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
                      className={`w-8 h-8 md:w-9 md:h-9 rounded text-[10px] md:text-xs font-medium transition-colors ${
                        selectedQuestionIndex === idx
                          ? 'ring-2 ring-brand ring-offset-1 ring-offset-bg-card'
                          : ''
                      } ${
                        result.isCorrect
                          ? 'bg-success text-on-brand hover:bg-success/80'
                          : 'bg-danger text-on-brand hover:bg-danger/80'
                      }`}
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
            <ProgressBar percent={(currentIndex / questions.length) * 100} showLabel={false} />
          </div>

          {/* Question */}
          <Card className="mb-3">
            <h3 className="text-base md:text-lg text-text-primary mb-4 md:mb-5">
              {currentQuestion.question}
              {currentQuestion.isMultiAnswer && (
                <span className="text-text-primary font-semibold ml-2">(Select {Array.isArray(currentQuestion.answer) ? currentQuestion.answer.length : MAX_MULTI_ANSWER})</span>
              )}
            </h3>

            <div className="space-y-2.5 mb-4">
              {Object.entries(currentQuestion.options).map(([key, value]) => {
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
              })}
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
                <Button
                  onClick={() => checkAnswer()}
                  disabled={selectedCount !== requiredCount}
                  variant="primary"
                  fullWidth
                >
                  Submit answer
                </Button>
              )
            })()}

            {showFeedback && (
              <Alert tone={isCorrect ? 'success' : 'danger'} className="mt-4 p-4 animate-enter">
                <div className={`font-semibold mb-2 flex items-center gap-2 text-sm md:text-base ${isCorrect ? 'text-success' : 'text-danger'}`}>
                  {isCorrect ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <X className="w-4 h-4 md:w-5 md:h-5" />}
                  <p>{isCorrect ? 'Correct!' : 'Incorrect'}</p>
                </div>
                
                {!isCorrect && (
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
              <span className="text-xs text-text-muted/70 font-mono">{currentQuestion.id}</span>
              <span className="text-[10px] text-text-muted/60">
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
