import { describe, it, expect } from 'vitest'
import { calculateDomainMastery, findNextDomainAction } from './domainStats'
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

describe('findNextDomainAction', () => {
  it('returns null for an empty list', () => {
    expect(findNextDomainAction([])).toBeNull()
  })

  it('points at the first unstarted domain, in input order', () => {
    expect(findNextDomainAction([
      { domainId: 1, percent: 40, practiced: true },
      { domainId: 2, percent: 0, practiced: false },
      { domainId: 3, percent: 0, practiced: false },
    ])).toEqual({ kind: 'unstarted', domainId: 2 })
  })

  it('never calls an unstarted domain weakest, even when a practiced one scores lower', () => {
    // Practiced domain 1 sits at 5%, below nothing-yet domain 4's implicit 0.
    // The unstarted domain still wins, with the unstarted phrasing.
    const next = findNextDomainAction([
      { domainId: 1, percent: 5, practiced: true },
      { domainId: 4, percent: 0, practiced: false },
    ])
    expect(next).toEqual({ kind: 'unstarted', domainId: 4 })
  })

  it('picks the lowest-percent domain once everything is practiced', () => {
    expect(findNextDomainAction([
      { domainId: 1, percent: 62, practiced: true },
      { domainId: 2, percent: 41, practiced: true },
      { domainId: 3, percent: 80, practiced: true },
      { domainId: 4, percent: 55, practiced: true },
      { domainId: 5, percent: 47, practiced: true },
    ])).toEqual({ kind: 'weakest', domainId: 2, percent: 41 })
  })

  it('breaks ties toward the first domain in input order', () => {
    expect(findNextDomainAction([
      { domainId: 1, percent: 50, practiced: true },
      { domainId: 2, percent: 50, practiced: true },
    ])).toEqual({ kind: 'weakest', domainId: 1, percent: 50 })
  })

  it('handles a fully-new user (all unstarted) by pointing at the first domain', () => {
    expect(findNextDomainAction([
      { domainId: 1, percent: 0, practiced: false },
      { domainId: 2, percent: 0, practiced: false },
    ])).toEqual({ kind: 'unstarted', domainId: 1 })
  })
})
