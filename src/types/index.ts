/**
 * Question response format.
 * - `single`  : one correct option (string `answer`).
 * - `multi`   : 2+ correct options, order-independent (`answer` is `string[]`).
 * - `ordering`: arrange the options into a sequence (`correctOrder`).
 * - `matching`: pair each left option (A-E) with a right target (1-5) (`correctMatches`).
 *
 * `type` is optional for back-compat: when absent it is inferred as
 * `isMultiAnswer ? 'multi' : 'single'` (see `getQuestionType` in lib/utils).
 * AIF-C01 (exam guide v1.1) is the first cert to use ordering + matching.
 */
export type QuestionType = 'single' | 'multi' | 'ordering' | 'matching'

export interface Question {
  id: string
  domainId: DomainId
  question: string
  options: Record<OptionKey, string> & { E?: string }
  /**
   * Correct option key(s) for `single` (string) / `multi` (string[]) questions.
   * Unused by `ordering` / `matching` (which carry their own correct-answer
   * fields below); seed those with an empty string so the field stays present.
   */
  answer: string | string[]
  explanation: string
  isMultiAnswer: boolean
  /** Response format. Absent => inferred from `isMultiAnswer` (single/multi). */
  type?: QuestionType
  /**
   * `ordering` only: the option keys in their correct first-to-last order.
   * Must be a permutation of every non-empty option key (validator-enforced).
   */
  correctOrder?: string[]
  /**
   * `matching` only: the right-hand column. Keys are `'1'..'5'` (stringified to
   * mirror the A-E option keys); values are the target texts to pair against.
   */
  targets?: Record<string, string>
  /**
   * `matching` only: the correct pairing as `{ optionKey: targetKey }`, e.g.
   * `{ A: '3', B: '2', C: '1' }`. Every non-empty option key must appear, and
   * every value must be a valid `targets` key (validator-enforced).
   */
  correctMatches?: Record<string, string>
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
