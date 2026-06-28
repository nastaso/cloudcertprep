import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  storePendingAttempt,
  flushPendingAttempt,
  markPendingAttemptSaveIntent,
  hasPendingAttempt,
  type PendingAttempt,
} from './pendingAttempt'

/**
 * Regression guard for the guest -> wrong-account contamination bug
 * (EDGE-CASE-FINDINGS-2026-06-28: pending-attempt-cross-account-contamination /
 * rls-pending-attempt-cross-account-misattribution).
 *
 * flushPendingAttempt() used to write the stored guest attempt into WHATEVER
 * userId it was handed, so any sign-in on a shared device (incl. a different
 * person's passive INITIAL_SESSION) adopted the snapshot. The fix binds the
 * flush to an explicit, single-use "save this attempt" intent that only the
 * guest's results-screen CTA sets. These tests stub the Supabase client and the
 * storage globals (Vitest runs in node, so neither exists by default) and assert
 * the exam_attempts insert IS / IS NOT attempted.
 */

const mocks = vi.hoisted(() => ({
  examInsert: vi.fn(),
  questionsInsert: vi.fn(),
  examDelete: vi.fn(),
  updateDomainProgress: vi.fn(),
  logError: vi.fn(),
  // Tunable responses so a test can force the questions insert to fail, etc.
  attemptResult: { data: { id: 'attempt-1' } as { id: string } | null, error: null as unknown },
  questionsResult: { error: null as unknown },
}))

vi.mock('./supabase', () => ({
  getSupabase: () => Promise.resolve({
    from: (table: string) => {
      if (table === 'exam_attempts') {
        return {
          insert: (payload: unknown) => {
            mocks.examInsert(payload)
            return { select: () => ({ single: () => Promise.resolve(mocks.attemptResult) }) }
          },
          delete: () => ({
            eq: (...args: unknown[]) => { mocks.examDelete(...args); return Promise.resolve({ error: null }) },
          }),
        }
      }
      if (table === 'attempt_questions') {
        return {
          insert: (rows: unknown) => { mocks.questionsInsert(rows); return Promise.resolve(mocks.questionsResult) },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('./supabaseUtils', () => ({ updateDomainProgress: mocks.updateDomainProgress }))
vi.mock('./logger', () => ({ logError: mocks.logError }))

// --- storage + window stubs (node has none) -------------------------------

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
  } as Storage
}

function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.attemptResult = { data: { id: 'attempt-1' }, error: null }
  mocks.questionsResult = { error: null }
  defineGlobal('localStorage', memStorage())
  defineGlobal('sessionStorage', memStorage())
  // flushPendingAttempt dispatches a window Event on success.
  if (typeof (globalThis as { Event?: unknown }).Event === 'undefined') {
    defineGlobal('Event', class { constructor(public type: string) {} })
  }
  defineGlobal('window', { dispatchEvent: vi.fn() })
})

afterEach(() => {
  defineGlobal('localStorage', undefined)
  defineGlobal('sessionStorage', undefined)
  defineGlobal('window', undefined)
})

function makePending(certCode = 'clf-c02'): PendingAttempt {
  return {
    certCode,
    finishedAt: Date.now(),
    attempt: {
      score_percent: 80,
      scaled_score: 800,
      passed: true,
      time_taken_seconds: 1200,
      total_questions: 5,
      correct_answers: 4,
      domain_scores: { '1': 80, '2': 80 },
    },
    questions: [
      { question_id: 'q1', user_answer: 'A', correct_answer: 'A', is_correct: true, was_flagged: false, domain_id: 1 },
      { question_id: 'q2', user_answer: 'B', correct_answer: 'C', is_correct: false, was_flagged: true, domain_id: 2 },
    ],
  }
}

describe('flushPendingAttempt: save-intent gating', () => {
  it('does NOT flush a stored attempt when no save intent is set (passive / unrelated sign-in)', async () => {
    storePendingAttempt(makePending())

    const saved = await flushPendingAttempt('innocent-user-B')

    expect(saved).toBe(false)
    expect(mocks.examInsert).not.toHaveBeenCalled()
    expect(mocks.questionsInsert).not.toHaveBeenCalled()
    expect(mocks.updateDomainProgress).not.toHaveBeenCalled()
    // The snapshot must be LEFT intact so a later legitimate save flow can still
    // flush it; a no-intent sign-in must neither adopt nor destroy it.
    expect(hasPendingAttempt()).toBe(true)
  })

  it('flushes exactly once, for the intended user, when a matching save intent is set', async () => {
    storePendingAttempt(makePending('clf-c02'))
    markPendingAttemptSaveIntent('clf-c02')

    const saved = await flushPendingAttempt('intended-user-A')

    expect(saved).toBe(true)
    expect(mocks.examInsert).toHaveBeenCalledTimes(1)
    expect(mocks.examInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'intended-user-A', cert_code: 'clf-c02' }),
    )
    // Every attempt_questions row is stamped with the SAME intended user.
    const rows = mocks.questionsInsert.mock.calls[0][0] as Array<{ user_id: string }>
    expect(rows.every(r => r.user_id === 'intended-user-A')).toBe(true)
    // Consumed on success: nothing left to re-flush into a second account.
    expect(hasPendingAttempt()).toBe(false)
  })

  it('does NOT flush when the save intent names a different cert than the snapshot', async () => {
    storePendingAttempt(makePending('clf-c02'))
    markPendingAttemptSaveIntent('aif-c01')

    const saved = await flushPendingAttempt('intended-user-A')

    expect(saved).toBe(false)
    expect(mocks.examInsert).not.toHaveBeenCalled()
  })

  it('intent is single-use: it cannot be replayed into a second account', async () => {
    storePendingAttempt(makePending('clf-c02'))
    markPendingAttemptSaveIntent('clf-c02')

    // First (legitimate) sign-in consumes the intent and the snapshot.
    expect(await flushPendingAttempt('intended-user-A')).toBe(true)
    expect(mocks.examInsert).toHaveBeenCalledTimes(1)

    // A second person re-stores a snapshot (or the same one lingers) and signs
    // in: with the intent already consumed, no flush is attempted for them.
    storePendingAttempt(makePending('clf-c02'))
    const second = await flushPendingAttempt('innocent-user-B')

    expect(second).toBe(false)
    expect(mocks.examInsert).toHaveBeenCalledTimes(1)
  })

  it('is a no-op (no crash) when an intent is set but no snapshot exists', async () => {
    markPendingAttemptSaveIntent('clf-c02')

    const saved = await flushPendingAttempt('intended-user-A')

    expect(saved).toBe(false)
    expect(mocks.examInsert).not.toHaveBeenCalled()
  })
})
