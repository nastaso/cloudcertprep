import { describe, it, expect } from 'vitest'
import { canonicalFor, SITE_URL } from './seo-data'
import { buildGitHubIssueUrl, GITHUB_ISSUES_URL } from './constants'

describe('canonicalFor', () => {
  it('maps the root path to a trailing-slash canonical', () => {
    expect(canonicalFor('/')).toBe(`${SITE_URL}/`)
  })

  it('treats the empty string as the root path', () => {
    expect(canonicalFor('')).toBe(`${SITE_URL}/`)
  })

  it('appends an absolute path unchanged', () => {
    expect(canonicalFor('/about')).toBe(`${SITE_URL}/about`)
  })

  it('normalizes a path missing its leading slash', () => {
    expect(canonicalFor('about')).toBe(`${SITE_URL}/about`)
  })

  it('handles nested cert-scoped paths', () => {
    expect(canonicalFor('/aws/clf-c02/practice-exam')).toBe(
      `${SITE_URL}/aws/clf-c02/practice-exam`,
    )
  })
})

describe('buildGitHubIssueUrl', () => {
  it('targets the report-question-error issue form', () => {
    const url = buildGitHubIssueUrl('clf-q001')
    expect(url.startsWith(`${GITHUB_ISSUES_URL}/new?`)).toBe(true)
    expect(new URL(url).searchParams.get('template')).toBe('report-question-error.yml')
  })

  it('includes the question id in both the id field and the title', () => {
    const url = buildGitHubIssueUrl('clf-q001')
    const params = new URL(url).searchParams
    expect(params.get('question_id')).toBe('clf-q001')
    expect(params.get('title')).toBe('Question error: clf-q001')
  })

  it('encodes an id containing a space (no raw space in the query, round-trips on parse)', () => {
    const url = buildGitHubIssueUrl('clf q001')
    // URLSearchParams form-encodes spaces as '+', so the raw URL carries no literal space.
    expect(url).not.toContain(' ')
    expect(url).toContain('question_id=clf+q001')
    // Parsing the query back yields the original id, '+' decoded to a space.
    expect(new URL(url).searchParams.get('question_id')).toBe('clf q001')
  })
})
