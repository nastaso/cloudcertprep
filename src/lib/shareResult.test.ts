import { describe, it, expect } from 'vitest'
import { buildPassShareText } from './shareResult'
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
