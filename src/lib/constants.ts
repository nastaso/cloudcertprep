// App-wide constants - single source of truth for repeated values.
// Cert-specific values (question count, time, pass score) live in data/certifications.ts.

export const APP_NAME = 'CloudCertPrep'

export const MIN_VALID_EXAM_SECONDS = 60
export const MAX_MULTI_ANSWER = 2
export const ANSWER_FEEDBACK_DELAY_MS = 300
export const TIMER_PULSE_THRESHOLD = 600

export const KOFI_URL = 'https://ko-fi.com/alexsantonastaso'
export const GITHUB_REPO_URL = 'https://github.com/nastaso/cloudcertprep'
export const GITHUB_ISSUES_URL = 'https://github.com/nastaso/cloudcertprep/issues'

/**
 * Build a URL that opens the GitHub "Report a question error" issue form
 * with the question ID and a sensible title pre-filled.
 *
 * Template lives at `.github/ISSUE_TEMPLATE/report-question-error.yml`.
 * The URL parameter names must match the form field `id`s exactly.
 */
export function buildGitHubIssueUrl(questionId: string): string {
  const params = new URLSearchParams({
    template: 'report-question-error.yml',
    title: `Question error: ${questionId}`,
    'question_id': questionId,
  })
  return `${GITHUB_ISSUES_URL}/new?${params.toString()}`
}
