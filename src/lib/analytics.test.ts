import { describe, it, expect } from 'vitest'
import { KNOWN_EVENTS } from './analytics'

describe('KNOWN_EVENTS registry', () => {
  it('has no duplicate event names', () => {
    // Dashboards, the conversion smoke test, and docs all key off this list;
    // a duplicated name would silently double-count or mask a typo.
    expect(new Set(KNOWN_EVENTS).size).toBe(KNOWN_EVENTS.length)
  })

  it('registers the load-bearing events (incl. production client_error)', () => {
    const names = KNOWN_EVENTS as readonly string[]
    for (const required of [
      'sign_in',
      'exam_started',
      'exam_completed',
      'question_answered',
      'client_error',
    ]) {
      expect(names, `KNOWN_EVENTS is missing "${required}"`).toContain(required)
    }
  })
})
