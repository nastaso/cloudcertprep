import { describe, expect, it } from 'vitest'
import {
  fixKeywordInitialisms,
  getSampleKeywordTerms,
  titleCaseKeyword,
} from './keyword-clusters'

describe('titleCaseKeyword', () => {
  it('keeps known initialisms and hyphenated certification codes uppercase', () => {
    expect(titleCaseKeyword('aws practice for aif-c01 and clf-c02')).toBe(
      'AWS Practice for AIF-C01 and CLF-C02',
    )
  })

  it('lowercases function words in the middle of a title', () => {
    expect(titleCaseKeyword('security and compliance for the cloud')).toBe(
      'Security and Compliance for the Cloud',
    )
  })

  it('capitalizes a function word when it is the first word', () => {
    expect(titleCaseKeyword('for aws and the cloud')).toBe('For AWS and the Cloud')
  })
})

describe('fixKeywordInitialisms', () => {
  it('uppercases official certification codes without title-casing other words', () => {
    expect(fixKeywordInitialisms('aif-c01 and clf-c02 practice questions')).toBe(
      'AIF-C01 and CLF-C02 practice questions',
    )
  })
})

describe('getSampleKeywordTerms', () => {
  it('removes generic exam-prep tokens', () => {
    expect(getSampleKeywordTerms('clf-c02', 1)).toEqual(['cloud', 'concepts'])
  })

  it('removes tokens shorter than three characters', () => {
    expect(getSampleKeywordTerms('aif-c01', 1)).toEqual(['fundamentals'])
  })

  it('preserves first-seen order while removing duplicate tokens', () => {
    expect(getSampleKeywordTerms('aif-c01', 3)).toEqual([
      'foundation',
      'models',
      'applications',
    ])
  })
})
