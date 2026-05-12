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

/** Build a URL that pre-fills the GitHub issue title with a question ID. */
export function buildGitHubIssueUrl(questionId: string): string {
  return `${GITHUB_ISSUES_URL}/new?title=${encodeURIComponent(`Question error: ${questionId}`)}`
}
