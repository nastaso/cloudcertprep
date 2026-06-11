export interface Question {
  id: string
  domainId: DomainId
  question: string
  options: Record<OptionKey, string> & { E?: string }
  answer: string | string[]
  explanation: string
  isMultiAnswer: boolean
  /**
   * Optional task-statement ID matching the AWS exam guide breakdown
   * (e.g. '1.1', '3.4'). Present only for certs whose `Certification`
   * registry entry defines a `taskStatements` list. Used for fine-grained
   * coverage reports and (eventually) practice-by-task-statement filters.
   */
  taskStatement?: string
  /**
   * Optional ISO date (`YYYY-MM-DD`) recording the last manual verification
   * of this question against the official exam guide. Surfaced by the
   * coverage / staleness tooling so the bank can be re-checked when AWS
   * publishes a new revision of the exam guide.
   */
  lastVerified?: string
  /**
   * Optional list of AWS services this question substantively tests. Use the
   * canonical service name from the cert registry's `services` vocabulary
   * (e.g. `'Amazon Bedrock'`, not `'Bedrock'`). Conceptual questions that
   * don't reference a specific service can omit this field. Used for
   * coverage analytics, SageMaker-style rename refactors, and (eventually)
   * service-scoped practice mode.
   */
  services?: string[]
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
