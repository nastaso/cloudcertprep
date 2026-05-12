import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cloud, Check, Flag, AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '../components/Button'
import { useTimer } from '../hooks/useTimer'
import { useAuth } from '../hooks/useAuth'
import { useSEO } from '../hooks/useSEO'
import { ROUTE_SEO } from '../lib/seo-data'
import { useCert } from '../hooks/useCert'
import { Header } from '../components/Header'
import { AnswerButton } from '../components/AnswerButton'
import { Modal } from '../components/Modal'
import { PassFailBanner } from '../components/PassFailBanner'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { selectExamQuestions, calculateScaledScore, isPassed, getDomainScore, formatTime, formatDuration, isAnswerCorrect, getExamDomainTargets } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { updateDomainProgress } from '../lib/supabaseUtils'
import type { Question, OptionKey } from '../types'
import { loadAllQuestions } from '../data/questions'
import { shuffleAndMapQuestions, toOriginalAnswer, toggleMultiAnswer, type OptionKeyMap } from '../lib/utils'
import { trackEvent } from '../lib/analytics'
import { MIN_VALID_EXAM_SECONDS, MAX_MULTI_ANSWER, TIMER_PULSE_THRESHOLD } from '../lib/constants'

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
                ? 'bg-aws-orange text-white'
                : isAnswered
                ? 'bg-aws-orange/30 text-text-primary hover:bg-aws-orange/50'
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
  const { user } = useAuth()
  const cert = useCert()
  const [screen, setScreen] = useState<ExamScreen>('start')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<number, QuestionState>>(new Map())
  const [showEndModal, setShowEndModal] = useState(false)
  const [showQuestionNav, setShowQuestionNav] = useState(false)
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

  // Title varies by screen. Only the start screen is canonical-eligible;
  // exam-in-progress and results are transient and shouldn't be indexed
  // separately from the entry point.
  const isStartScreen = screen === 'start'
  const pageTitle = screen === 'exam'
    ? `Question ${currentIndex + 1} of ${cert.examQuestionCount} · CloudCertPrep`
    : screen === 'results' ? 'Exam results · CloudCertPrep'
    : screen === 'review' ? 'Review exam · CloudCertPrep'
    : `${cert.shortName} practice exam · CloudCertPrep`
  useSEO({
    title: pageTitle,
    description: ROUTE_SEO['/practice-exam'].description,
    canonical: isStartScreen ? '/practice-exam' : null,
  })

  // Track exam abandonment - fires when user leaves during active exam
  useEffect(() => {
    function handleBeforeUnload() {
      if (screen === 'exam' && questions.length > 0) {
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
      timer.start()
      document.body.dataset.examActive = 'true'
      trackEvent('exam_started')
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
    
    if (current.isMultiAnswer) {
      const currentAnswers = Array.isArray(currentState.userAnswer) ? currentState.userAnswer : []
      const newAnswers = toggleMultiAnswer(currentAnswers, answer, MAX_MULTI_ANSWER)
      setAnswers(prev => new Map(prev).set(currentIndex, { ...currentState, userAnswer: newAnswers }))
    } else {
      setAnswers(prev => new Map(prev).set(currentIndex, { ...currentState, userAnswer: answer }))
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
    setLoading(true)
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
      if (!isGuest && !isTooShort) {
        const { data: attemptData, error: attemptError } = await supabase
        .from('exam_attempts')
        .insert({
          user_id: user?.id,
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
        user_id: user?.id,
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

        if (questionsError) throw questionsError
      }

      // Update domain progress for all domains
      for (const domain of cert.domains) {
        const domainResults = results.filter(r => r.domainId === domain.id)
        if (domainResults.length > 0) {
          await updateDomainProgress(user!.id, domain.id, cert.code)
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
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto bg-bg-card rounded-lg p-4 md:p-6 lg:p-8 shadow-card">
          <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3 md:mb-4">{cert.shortName} Practice Exam</h1>
          <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">{cert.examQuestionCount} questions, {Math.round(cert.examTimeSeconds / 60)} minutes. No answer feedback during exam.</p>
          
          <div className="bg-bg-dark rounded-lg p-4 md:p-6 mb-6 md:mb-8">
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

          <div className="bg-warning/10 border border-warning rounded-lg p-3 md:p-4 mb-6 md:mb-8">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-warning flex-shrink-0" />
              <p className="text-sm md:text-base text-warning font-medium">Once started, the timer cannot be paused</p>
            </div>
          </div>

          {loadError && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3 md:p-4 mb-4 md:mb-6 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-danger flex-shrink-0 mt-0.5" />
              <p className="text-sm md:text-base text-danger">{loadError}</p>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <Button
              onClick={() => navigate('/')}
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
              loading={loading}
              loadingText="Loading questions..."
            >
              Start exam
            </Button>
          </div>
        </div>
      </div>
    </div>
    )
  }

  if (screen === 'results') return (
    <div className="min-h-screen bg-bg-dark flex flex-col">
      <Header showNav={true} />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-2xl w-full space-y-6">
          <PassFailBanner
            passed={results!.passed}
            scaledScore={results!.scaledScore}
            percent={results!.percentScore}
          />

          {submitError && (
            <div className="bg-warning/10 border border-warning text-warning px-4 py-3 rounded-lg text-sm">
              {submitError}
            </div>
          )}

          <div className="bg-bg-card p-6 md:p-8 rounded-lg shadow-card space-y-6">
            <div className="bg-aws-orange/10 border border-aws-orange/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-text-muted">
                <span className="font-semibold text-aws-orange">AWS Scaled Scoring:</span> Scores range from 100-1000, where 100 is the minimum (0% correct) and 1000 is the maximum (100% correct). You need {cert.passingScore}+ to pass.
              </p>
            </div>

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
                      <span className="text-2xl font-bold text-aws-orange">
                        {score}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

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
              <Button onClick={() => navigate('/')} variant="secondary" className="flex-1">
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
    </div>
    )

  if (screen === 'exam' && currentQuestion) {
    return (
      <div className="bg-bg-dark">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-aws-orange to-aws-orange-end shadow-lg z-40">
          <div className="max-w-7xl mx-auto px-4 py-2 md:py-4 lg:py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 lg:w-14 md:h-12 lg:h-14 bg-white rounded-lg flex items-center justify-center shadow-md relative">
                  <Cloud className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-aws-orange" fill="currentColor" />
                  <Check className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white absolute" strokeWidth={3} />
                </div>
                <div>
                  <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-tight block">CloudCertPrep</span>
                  <p className="text-xs md:text-sm text-white/90 font-medium hidden lg:block">
                    {cert.name} Exam Prep
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4">
                <div
                  aria-live="polite"
                  aria-label={`Time remaining: ${formatTime(timer.seconds)}`}
                  className={`text-lg md:text-xl lg:text-2xl font-mono font-bold text-white ${timer.seconds < TIMER_PULSE_THRESHOLD ? 'animate-pulse' : ''}`}
                >
                  {formatTime(timer.seconds)}
                </div>
                <button
                  onClick={() => setShowEndModal(true)}
                  className="px-4 py-2 md:px-6 md:py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold rounded-lg transition-colors text-sm md:text-base"
                >
                  End exam
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-24 md:pt-28 lg:pt-32 pb-6 px-4 md:px-8">
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

            <div className="bg-bg-card rounded-lg p-2.5 md:p-3 lg:p-4 mb-3 shadow-card">
              <div className="hidden lg:flex items-center justify-end mb-2">
                <span className="text-text-muted text-xs md:text-sm">Question {currentIndex + 1} of {questions.length}</span>
              </div>

              <h2 className="text-base md:text-lg text-text-primary mb-3 md:mb-4">
                {currentQuestion.question}
                {currentQuestion.isMultiAnswer && (
                  <span className="text-aws-orange font-semibold ml-2">(Select 2)</span>
                )}
              </h2>

              <div className="space-y-2 md:space-y-3 mb-4">
                {Object.entries(currentQuestion.options).map(([key, value]) => {
                  const isSelected = currentQuestion.isMultiAnswer
                    ? Array.isArray(currentState?.userAnswer) && currentState.userAnswer.includes(key)
                    : currentState?.userAnswer === key
                  
                  const currentSelections = currentQuestion.isMultiAnswer && Array.isArray(currentState?.userAnswer) 
                    ? currentState.userAnswer.length 
                    : 0
                  const isDisabled = currentQuestion.isMultiAnswer && !isSelected && currentSelections >= MAX_MULTI_ANSWER
                  
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

              {currentQuestion.isMultiAnswer && (
                <div className="mb-3 text-xs md:text-sm text-text-muted">
                  {Array.isArray(currentState?.userAnswer) && currentState.userAnswer.length > 0 ? (
                    <span className="text-aws-orange font-medium">
                      {currentState.userAnswer.length}/2 answers selected
                    </span>
                  ) : (
                    <span>Select 2 answers</span>
                  )}
                </div>
              )}

              <button
                onClick={toggleFlag}
                className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg transition-colors text-sm ${
                  currentState?.flagged
                    ? 'bg-warning/20 text-warning border border-warning'
                    : 'bg-bg-dark text-text-muted hover:text-text-primary'
                }`}
              >
                <Flag className={`w-4 h-4 md:w-5 md:h-5 ${currentState?.flagged ? 'fill-warning' : ''}`} />
                <span className="font-medium text-xs md:text-sm">{currentState?.flagged ? 'Flagged for review' : 'Flag for review'}</span>
              </button>
            </div>

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
            <div className="sticky top-24 bg-bg-card rounded-lg p-4 shadow-card">
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
        <div className="bg-bg-dark flex flex-col min-h-screen">
          <Header showNav={true} />
          <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
              <div className="bg-bg-card rounded-lg p-8 text-center shadow-card">
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
              </div>
            </div>
          </div>
        </div>
      )
    }

    const currentReviewQuestion = filteredQuestions[reviewQuestionIndex]
    const originalQuestion = questions.find(q => q.id === currentReviewQuestion.questionId)!

    return (
      <div className="bg-bg-dark flex flex-col min-h-screen">
        <Header showNav={true} />
        <div className="p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Filter Controls */}
            <div className="bg-bg-card rounded-lg p-4 mb-4 shadow-card">
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
                      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        reviewFilter === 'all'
                          ? 'bg-aws-orange text-white'
                          : 'bg-bg-dark text-text-muted hover:text-text-primary'
                      }`}
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
                      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        reviewFilter === 'incorrect'
                          ? 'bg-aws-orange text-white'
                          : incorrectCount === 0
                          ? 'bg-bg-dark text-text-muted opacity-50 cursor-not-allowed'
                          : 'bg-bg-dark text-text-muted hover:text-text-primary'
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
                      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        reviewFilter === 'flagged'
                          ? 'bg-aws-orange text-white'
                          : flaggedReviewCount === 0
                          ? 'bg-bg-dark text-text-muted opacity-50 cursor-not-allowed'
                          : 'bg-bg-dark text-text-muted hover:text-text-primary'
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
                      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                        reviewDomainFilter === null
                          ? 'bg-aws-orange text-white'
                          : 'bg-bg-dark text-text-muted hover:text-text-primary'
                      }`}
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
                        className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                          reviewDomainFilter === domain.id
                            ? 'bg-aws-orange text-white'
                            : 'bg-bg-dark text-text-muted hover:text-text-primary'
                        }`}
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
                          className={`w-8 h-8 md:w-9 md:h-9 rounded text-[10px] md:text-xs font-medium transition-all ${
                            isCurrentQuestion
                              ? 'ring-2 ring-aws-orange ring-offset-1 ring-offset-bg-card'
                              : ''
                          } ${
                            !isInFilteredSet
                              ? 'opacity-30 cursor-not-allowed'
                              : 'hover:scale-110'
                          } ${
                            result.isCorrect
                              ? 'bg-success text-white'
                              : 'bg-danger text-white'
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
            </div>

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
