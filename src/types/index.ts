export interface Question {
  id: string
  domainId: DomainId
  question: string
  options: Record<OptionKey, string> & { E?: string }
  answer: string | string[]
  explanation: string
  isMultiAnswer: boolean
}

export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E'
export type DomainId = number

export interface ExamAttempt {
  id: string
  user_id: string
  cert_code: string
  attempted_at: string
  score_percent: number
  scaled_score: number
  passed: boolean
  time_taken_seconds: number
  total_questions: number
  correct_answers: number
  /**
   * Per-domain scores as JSONB. Keys are stringified domain IDs (Postgres JSONB
   * coerces keys to strings); values are 0-100 score percentages.
   * Supports any number of domains, set by the cert config in `data/certifications.ts`.
   * Example: { "1": 85, "2": 70, "3": 92, "4": 65 } for a 4-domain cert.
   */
  domain_scores: Record<string, number>
}

export interface DomainProgress {
  domain_id: number
  cert_code: string
  questions_attempted: number
  questions_correct: number
  mastery_percent: number
}
