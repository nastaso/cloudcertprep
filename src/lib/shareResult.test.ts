import { describe, it, expect } from 'vitest'
import { buildPassShareText, buildFailBreakdownText } from './shareResult'
import { SITE_URL } from './seo-data'

describe('buildPassShareText', () => {
  const text = buildPassShareText({
    certShortName: 'CLF-C02',
    scaledScore: 830,
    correctCount: 52,
    totalQuestions: 65,
  })

  it('matches the findings-doc share shape', () => {
    expect(text).toBe(
      `I scored 830/1000 on the CLF-C02 practice exam at CloudCertPrep (52/65 correct). Free + open source: ${SITE_URL}`
    )
  })

  it('links the bare site URL with no score data in params', () => {
    expect(text).toContain(SITE_URL)
    expect(text).not.toContain('?')
  })
})

describe('buildFailBreakdownText', () => {
  const text = buildFailBreakdownText({
    certShortName: 'CLF-C02',
    correctCount: 32,
    totalQuestions: 65,
    domains: [
      { name: 'Cloud Concepts', percent: 70 },
      { name: 'Security and Compliance', percent: 45 },
      { name: 'Cloud Technology and Services', percent: 0 },
    ],
  })

  it('lists every domain with its percent plus the overall line', () => {
    expect(text).toContain('CLF-C02 practice exam domain breakdown (CloudCertPrep):')
    expect(text).toContain('Cloud Concepts: 70%')
    expect(text).toContain('Security and Compliance: 45%')
    expect(text).toContain('Cloud Technology and Services: 0%')
    expect(text).toContain('Overall: 32/65 correct.')
  })

  it('never bakes pass/fail language, celebration, or a scaled score into a fail share', () => {
    expect(text).not.toMatch(/fail/i)
    expect(text).not.toMatch(/pass/i)
    expect(text).not.toMatch(/congrat/i)
    expect(text).not.toMatch(/\/1000/)
    expect(text).not.toMatch(/scored/i)
  })

  it('links the bare site URL with no score data in params', () => {
    expect(text).toContain(SITE_URL)
    expect(text).not.toContain('?')
  })
})
