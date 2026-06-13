import { describe, it, expect } from 'vitest'
import { calculateDomainMastery } from './domainStats'
import { getCertDomainCounts } from '../data/certifications'

describe('calculateDomainMastery', () => {
  const clfDomain1Total = getCertDomainCounts('clf-c02')[1]

  it('returns 0 when nothing is correct', () => {
    expect(calculateDomainMastery(0, 1, 'clf-c02')).toBe(0)
  })

  it('returns 100 when the whole domain is correct', () => {
    expect(calculateDomainMastery(clfDomain1Total, 1, 'clf-c02')).toBe(100)
  })

  it('rounds intermediate coverage', () => {
    expect(calculateDomainMastery(Math.round(clfDomain1Total / 2), 1, 'clf-c02'))
      .toBe(Math.round((Math.round(clfDomain1Total / 2) / clfDomain1Total) * 100))
  })

  it('clamps to 100 when stale rows push correct past the current bank (123% bug)', () => {
    // 91 correct vs a 74-question bank used to render 123%; any oversized
    // numerator must cap at 100.
    expect(calculateDomainMastery(clfDomain1Total + 40, 1, 'clf-c02')).toBe(100)
    expect(calculateDomainMastery(clfDomain1Total * 10, 1, 'clf-c02')).toBe(100)
  })

  it('returns 0 for an unknown domain', () => {
    expect(calculateDomainMastery(10, 99, 'clf-c02')).toBe(0)
  })

  it('returns 0 for an unknown certification', () => {
    expect(calculateDomainMastery(10, 1, 'nope-c00')).toBe(0)
  })
})
