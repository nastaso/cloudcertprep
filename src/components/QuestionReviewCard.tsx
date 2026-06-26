import { AnswerButton } from './AnswerButton'
import { OrderingInput } from './OrderingInput'
import { MatchingInput } from './MatchingInput'
import type { Question, OptionKey } from '../types'
import { getCertDomains, DEFAULT_CERT_ID } from '../data/certifications'
import { buildGitHubIssueUrl } from '../lib/constants'
import { getQuestionType } from '../lib/utils'
import { trackEvent } from '../lib/analytics'
import { Flag, Check, X } from 'lucide-react'

interface QuestionReviewCardProps {
  question: Question
  userAnswer: string | string[]
  isCorrect: boolean
  wasFlagged?: boolean
  questionNumber: number
  totalQuestions: number
  certCode?: string
}

export function QuestionReviewCard({
  question,
  userAnswer,
  isCorrect,
  wasFlagged,
  questionNumber,
  totalQuestions,
  certCode = DEFAULT_CERT_ID,
}: QuestionReviewCardProps) {
  const qType = getQuestionType(question)
  // Decode the persisted answer string. History loads `user_answer` as a comma
  // joined string; in-session review passes the in-memory value. For ordering
  // the tokens are option keys; for matching they are `K:T` pair tokens (which
  // the old `.split(',') + includes(key)` membership test would mis-handle).
  const userAnswerArray = Array.isArray(userAnswer) ? userAnswer : userAnswer ? userAnswer.split(',') : []
  const correctAnswerArray = Array.isArray(question.answer) ? question.answer : [question.answer]

  return (
    <div className="bg-bg-card rounded-2xl p-4 md:p-5 shadow-card border border-border-hairline">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">
            Question {questionNumber} of {totalQuestions}
          </span>
          {wasFlagged && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning rounded text-xs font-medium">
              <Flag className="w-3 h-3 fill-warning" /> Flagged
            </span>
          )}
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold text-xs ${
          isCorrect ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
        }`}>
          {isCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
          <span>{isCorrect ? 'CORRECT' : 'INCORRECT'}</span>
        </div>
      </div>

      {/* Domain Badge */}
      <div className="mb-2">
        <span className="font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-bg-dark border border-border-hairline text-text-muted">
          {getCertDomains(certCode)[question.domainId] ?? `Domain ${question.domainId}`}
        </span>
      </div>

      {/* Question Text */}
      <h3 className="text-sm md:text-base text-text-primary mb-3">
        {question.question}
      </h3>

      {/* Answer Options / response */}
      <div className="space-y-1.5 mb-3">
        {qType === 'ordering' ? (
          <OrderingInput
            mode="result"
            options={question.options}
            value={userAnswerArray}
            correctOrder={question.correctOrder}
            compact={true}
          />
        ) : qType === 'matching' ? (
          <MatchingInput
            mode="result"
            options={question.options}
            targets={question.targets ?? {}}
            value={userAnswerArray}
            correctMatches={question.correctMatches}
            compact={true}
          />
        ) : (
          Object.entries(question.options).map(([key, value]) => {
            const isUserAnswer = userAnswerArray.includes(key)
            const isCorrectAnswer = correctAnswerArray.includes(key)

            let state: 'default' | 'selected' | 'correct' | 'wrong' = 'default'
            if (isCorrectAnswer) state = 'correct'
            else if (isUserAnswer) state = 'wrong'

            return (
              <AnswerButton
                key={key}
                label={key as OptionKey}
                text={value}
                state={state}
                disabled={true}
                compact={true}
              />
            )
          })
        )}
      </div>

      {/* Explanation */}
      {question.explanation && (
        <div className="bg-bg-dark rounded-lg p-3 border-l-4 border-brand">
          <h4 className="text-xs font-semibold text-text-primary mb-1">Explanation:</h4>
          <div className="text-xs md:text-sm text-text-muted space-y-2">
            {question.explanation.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {/* Question ID + Disclaimer */}
      <div className="mt-3 pt-2 border-t border-text-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
        <span className="text-xs text-text-muted font-mono">{question.id}</span>
        <span className="text-[10px] text-text-muted">
          Found an error?{' '}
          <a
            href={buildGitHubIssueUrl(question.id)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('report_question_clicked', { question_id: question.id })}
            className="text-text-primary underline underline-offset-2 hover:text-text-primary/70"
          >
            Report on GitHub
          </a>
        </span>
      </div>
    </div>
  )
}
