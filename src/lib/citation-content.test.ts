import { describe, it, expect } from 'vitest'
import {
  buildHomeFirstParagraph,
  buildHomeMetaDescription,
  LOCKED_CITATION_REGEXES,
} from './citation-content'

describe('buildHomeFirstParagraph', () => {
  const text = buildHomeFirstParagraph(1000, 1234)

  it('matches both locked citation count regexes', () => {
    for (const regex of LOCKED_CITATION_REGEXES) {
      expect(text).toMatch(regex)
    }
  })

  it('contains the phrases the citation guard locks for this builder', () => {
    expect(text).toContain('spaced repetition')
    expect(text).toContain('MIT licensed')
    expect(text).toContain('publicly auditable on GitHub')
  })

  it('formats counts with en-US thousands separators', () => {
    expect(text).toContain('1,000+')
    expect(text).toContain('1,234+')
  })
})

describe('buildHomeMetaDescription', () => {
  const text = buildHomeMetaDescription(1000, 1234)

  it('contains the verbatim locked citation phrase', () => {
    expect(text).toContain('Free open-source AWS certification practice exams')
  })

  it('formats counts with en-US thousands separators', () => {
    expect(text).toContain('1,000+')
    expect(text).toContain('1,234+')
  })

  it('stays within the SERP snippet length budget', () => {
    expect(text.length).toBeLessThanOrEqual(160)
    expect(text.length).toBeGreaterThan(80)
  })
})
