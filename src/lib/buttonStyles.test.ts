import { describe, expect, it } from 'vitest'

import { filterChipClass, reviewCellClass } from './buttonStyles'

describe('filterChipClass', () => {
  it('uses inverted selection classes when active', () => {
    const classes = filterChipClass({ active: true })

    expect(classes).toContain('bg-text-primary')
    expect(classes).toContain('text-bg-dark')
  })

  it('uses the card surface classes when inactive', () => {
    const classes = filterChipClass({ active: false, surface: 'card' })

    expect(classes).toContain('bg-bg-card')
    expect(classes).toContain('text-text-muted')
    expect(classes).toContain('border-border-hairline')
  })

  it('uses different inactive classes for the dark surface', () => {
    const cardClasses = filterChipClass({ active: false, surface: 'card' })
    const darkClasses = filterChipClass({ active: false, surface: 'dark' })

    expect(darkClasses).toContain('bg-bg-dark')
    expect(darkClasses).toContain('text-text-muted')
    expect(darkClasses).toContain('border-border-hairline')
    expect(darkClasses).not.toBe(cardClasses)
  })
})

describe('reviewCellClass', () => {
  it('uses success and danger text classes for answer correctness', () => {
    expect(reviewCellClass({ correct: true })).toContain('text-success')
    expect(reviewCellClass({ correct: false })).toContain('text-danger')
  })

  it('adds the brand ring only to the current cell', () => {
    expect(reviewCellClass({ correct: true, current: true })).toContain('ring-brand')
    expect(reviewCellClass({ correct: true, current: false })).not.toContain('ring-brand')
  })

  it('adds the warning ring only to flagged cells', () => {
    expect(reviewCellClass({ correct: true, flagged: true })).toContain('ring-warning')
    expect(reviewCellClass({ correct: true, flagged: false })).not.toContain('ring-warning')
  })

  it('dims only cells outside the active set', () => {
    expect(reviewCellClass({ correct: true, inSet: false })).toContain('opacity-40')
    expect(reviewCellClass({ correct: true, inSet: true })).not.toContain('opacity-40')
  })
})
