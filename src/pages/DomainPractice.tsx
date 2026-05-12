import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCert } from '../hooks/useCert'
import { useSEO } from '../hooks/useSEO'
import { ROUTE_SEO } from '../lib/seo-data'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import { Header } from '../components/Header'
import { AnswerButton } from '../components/AnswerButton'
import { ProgressBar } from '../components/ProgressBar'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { Button } from '../components/Button'
import { updateDomainProgress } from '../lib/supabaseUtils'
import type { Question, OptionKey } from '../types'
import { loadDomainQuestions } from '../data/questions'
import { isAnswerCorrect } from '../lib/scoring'
import { trackEvent } from '../lib/analytics'
import { useSpacedRepetition } from '../hooks/useSpacedRepetition'
import { shuffleAndMapQuestions, toOriginalAnswer, toggleMultiAnswer, type OptionKeyMap } from '../lib/utils'
import { MAX_MULTI_ANSWER, ANSWER_FEEDBACK_DELAY_MS, buildGitHubIssueUrl } from '../lib/constants'
import { Check, X } from 'lucide-react'

type Screen = 'selection' | 'config' | 'practice' | 'results'

interface QuestionResult {
  question: Question
  userAnswer: string | string[]
  isCorrect: boolean
}

export function DomainPractice() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const cert = useCert()
  const [screen, setScreen] = useState<Screen>('selection')
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null)
  const [questionCount, setQuestionCount] = useState(20)

  const domains = cert ? Object.fromEntries(cert.domains.map(d => [d.id, d.name])) : {}

  // Set dynamic page title based on screen and domain
  const pageTitle = screen === 'practice' && selectedDomain !== null
    ? `${cert.shortName} · ${domains[selectedDomain] ?? ''} · CloudCertPrep`
    : screen === 'results' ? `${cert.shortName} practice results · CloudCertPrep`
    : `${cert.shortName} domain practice · CloudCertPrep`
  useSEO({
    title: pageTitle,
    description: ROUTE_SEO['/domain-practice'].description,
    canonical: screen === 'selection' ? '/domain-practice' : null,
  })
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [userAnswer, setUserAnswer] = useState<string | string[] | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0)
  const [optionKeyMaps, setOptionKeyMaps] = useState<Map<string, OptionKeyMap>>(new Map())
  const [loading, setLoading] = useState(false)
  const { selectQuestions, refreshMastery } = useSpacedRepetition(user?.id ?? null, selectedDomain, cert.code)

  function selectDomain(domainId: number) {
    setSelectedDomain(domainId)
    setScreen('config')
  }

  // Preload questions when domain is selected (before user clicks Start)
  // This hides network latency - chunk will be cached by the time they start
  useEffect(() => {
    if (selectedDomain && cert) {
      loadDomainQuestions(cert.code, selectedDomain).catch(() => {
        // Silently fail - startPractice will retry if preload failed
      })
    }
  }, [selectedDomain, cert])

  async function startPractice() {
    if (!cert) return
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
    } finally {
      setLoading(false)
    }
  }

  function handleAnswer(answer: string) {
    const current = questions[currentIndex]
    
    if (current.isMultiAnswer) {
      const currentAnswers = Array.isArray(userAnswer) ? userAnswer : []
      const newAnswers = toggleMultiAnswer(currentAnswers, answer, MAX_MULTI_ANSWER)
      setUserAnswer(newAnswers)
    } else {
      setUserAnswer(answer)
      setTimeout(() => checkAnswer(answer), ANSWER_FEEDBACK_DELAY_MS)
    }
  }

  function checkAnswer(answer?: string | string[]) {
    const current = questions[currentIndex]
    const answerToCheck = answer || userAnswer
    const correct = isAnswerCorrect(answerToCheck!, current.answer, current.isMultiAnswer)
    
    setResults([...results, correct])
    setQuestionResults([...questionResults, {
      question: current,
      userAnswer: answerToCheck!,
      isCorrect: correct
    }])
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

  if (screen === 'selection') {
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto bg-bg-card rounded-lg p-4 md:p-6 lg:p-8 shadow-card">
          <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3 md:mb-4">{cert.shortName} Domain Practice</h1>
          <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">Practice questions from a specific domain</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
            {cert.domains.map(domain => {
              return (
                <button
                  key={domain.id}
                  onClick={() => selectDomain(domain.id)}
                  className="bg-bg-dark hover:bg-bg-card-hover p-4 md:p-6 rounded-lg border-2 border-transparent hover:border-aws-orange transition-all text-left"
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-xl md:text-2xl font-bold flex-shrink-0 bg-aws-orange/20 text-aws-orange">
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

          <Button onClick={() => navigate('/')} variant="secondary" fullWidth>
            Back to home
          </Button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'config') {
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="p-4 md:p-8">
          <div className="max-w-2xl mx-auto">
          <div className="bg-bg-card rounded-lg p-4 md:p-6 lg:p-8 shadow-card">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold text-text-primary mb-2">
              {cert.shortName} · {domains[selectedDomain!]}
            </h1>
            <p className="text-sm md:text-base text-text-muted mb-6 md:mb-8">Configure your practice session</p>

            <div className="flex items-center justify-between mb-8">
              <label className="text-text-primary font-medium">
                Number of Questions:
              </label>
              <div className="flex items-center gap-3 md:gap-4">
                <button
                  onClick={() => setQuestionCount(Math.max(10, questionCount - 5))}
                  disabled={questionCount <= 10}
                  className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="text-2xl md:text-3xl font-bold text-text-primary w-12 md:w-16 text-center">
                  {questionCount}
                </span>
                <button
                  onClick={() => setQuestionCount(Math.min(50, questionCount + 5))}
                  disabled={questionCount >= 50}
                  className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-bg-dark hover:bg-bg-card-hover text-text-primary text-xl md:text-2xl font-bold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            <div className="bg-bg-dark rounded-lg p-4 mb-8">
              <p className="text-sm text-text-muted">
                <span className="text-aws-orange font-semibold">Smart Practice:</span> Questions you've gotten wrong will appear more frequently. Questions you consistently get right will appear less often.
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => setScreen('selection')}
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
                loading={loading}
                loadingText="Loading questions..."
              >
                Start practice
              </Button>
            </div>
          </div>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'results') {
    const currentResult = questionResults[selectedQuestionIndex]
    
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
        <div className="p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Summary Header */}
            <div className="bg-bg-card rounded-lg p-4 md:p-5 text-center mb-4 shadow-card">
              <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-3">Practice session complete!</h1>
              <p className="text-lg md:text-xl text-text-muted">
                You got <span className="text-success font-bold">{correctCount}/{results.length}</span> correct ({Math.round((correctCount / results.length) * 100)}%)
              </p>
            </div>

            {/* Question Number Grid */}
            <div className="bg-bg-card rounded-lg p-3 md:p-4 mb-4 shadow-card">
              <h3 className="text-xs md:text-sm font-semibold text-text-muted mb-2 text-center">Questions:</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(32px,32px))] md:grid-cols-[repeat(auto-fit,minmax(36px,36px))] gap-0.5 md:gap-1 justify-center">
                {questionResults.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedQuestionIndex(idx)}
                    className={`w-8 h-8 md:w-9 md:h-9 rounded text-[10px] md:text-xs font-medium transition-all ${
                      selectedQuestionIndex === idx
                        ? 'ring-2 ring-aws-orange ring-offset-1 ring-offset-bg-card'
                        : ''
                    } ${
                      result.isCorrect
                        ? 'bg-success text-white hover:bg-success/80'
                        : 'bg-danger text-white hover:bg-danger/80'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

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
              <Button onClick={() => navigate('/')} variant="secondary" className="flex-1">
                Back to home
              </Button>
              <Button onClick={() => selectDomain(selectedDomain!)} variant="primary" className="flex-1">
                Practice again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'practice' && currentQuestion) {
    return (
      <div className="bg-bg-dark flex flex-col">
        <Header showNav={true} />
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
          <div className="bg-bg-card rounded-lg p-2.5 md:p-3 lg:p-4 mb-3 shadow-card">
            <h3 className="text-base md:text-lg text-text-primary mb-3 md:mb-4">
              {currentQuestion.question}
              {currentQuestion.isMultiAnswer && (
                <span className="text-aws-orange font-semibold ml-2">(Select 2)</span>
              )}
            </h3>

            <div className="space-y-1.5 mb-3">
              {Object.entries(currentQuestion.options).map(([key, value]) => {
                const isSelected = currentQuestion.isMultiAnswer
                  ? Array.isArray(userAnswer) && userAnswer.includes(key)
                  : userAnswer === key
                
                const currentSelections = currentQuestion.isMultiAnswer && Array.isArray(userAnswer) 
                  ? userAnswer.length 
                  : 0
                const isLimitReached = currentQuestion.isMultiAnswer && !isSelected && currentSelections >= MAX_MULTI_ANSWER
                
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
                    onClick={() => !showFeedback && handleAnswer(key)}
                    disabled={showFeedback || isLimitReached}
                    compact={true}
                  />
                )
              })}
            </div>

            {currentQuestion.isMultiAnswer && !showFeedback && (
              <div className="mb-3 text-xs md:text-sm text-text-muted">
                {Array.isArray(userAnswer) && userAnswer.length > 0 ? (
                  <span className="text-aws-orange font-medium">
                    {userAnswer.length}/2 answers selected
                  </span>
                ) : (
                  <span>Select 2 answers</span>
                )}
              </div>
            )}

            {currentQuestion.isMultiAnswer && !showFeedback && (
              <Button
                onClick={() => checkAnswer()}
                disabled={!userAnswer || (Array.isArray(userAnswer) && userAnswer.length === 0)}
                variant="primary"
                fullWidth
              >
                Submit answer
              </Button>
            )}

            {showFeedback && (
              <div className={`mt-3 p-2.5 md:p-3 rounded-lg ${isCorrect ? 'bg-success/10 border border-success' : 'bg-danger/10 border border-danger'}`}>
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
                  <div className="border-t border-text-muted/20 pt-2 mt-2">
                    <p className="text-text-muted text-xs md:text-sm font-medium mb-1">Explanation:</p>
                    <div className="text-text-muted text-xs md:text-sm space-y-2">
                      {currentQuestion.explanation.split('\n').filter(Boolean).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Question ID + Disclaimer */}
            <div className="mt-3 pt-2 border-t border-text-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <span className="text-xs text-text-muted/70 font-mono">{currentQuestion.id}</span>
              <span className="text-[10px] text-text-muted/60">
                Found an error?{' '}
                <a 
                  href={buildGitHubIssueUrl(currentQuestion.id)}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-aws-orange hover:text-aws-orange/80 hover:underline"
                >
                  Report on GitHub
                </a>
              </span>
            </div>
          </div>

          {showFeedback && (
            <Button onClick={nextQuestion} variant="primary" fullWidth>
              {currentIndex < questions.length - 1 ? 'Next question' : 'Finish session'}
            </Button>
          )}
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
