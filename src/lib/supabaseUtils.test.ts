import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateDomainProgress } from './supabaseUtils'
import { getCertDomainCounts } from '../data/certifications'

/**
 * Regression guard for the ">100% mastery" bug: historical
 * attempt_questions rows for questions later DELETED from the JSON banks must
 * not count toward domain progress. These tests seed exactly that stale-row
 * shape and assert the recomputed aggregates stay within the current bank.
 */

const mocks = vi.hoisted(() => ({
  selectResult: { data: [] as Array<{ question_id: string; is_correct: boolean }> | null, error: null as unknown },
  upsert: vi.fn(),
  loadDomainQuestions: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('./supabase', () => ({
  // getSupabase() is the lazy accessor; it resolves to the same mock client.
  getSupabase: () => Promise.resolve({
    from: (table: string) => {
      if (table === 'attempt_questions') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          // Awaiting the query builder resolves to the canned select result.
          then: (resolve: (v: typeof mocks.selectResult) => void) => resolve(mocks.selectResult),
        }
        return builder
      }
      return { upsert: mocks.upsert }
    },
  }),
}))

vi.mock('../data/questions', () => ({
  loadDomainQuestions: mocks.loadDomainQuestions,
}))

vi.mock('./logger', () => ({
  logError: mocks.logError,
}))

function bankOf(ids: string[]) {
  mocks.loadDomainQuestions.mockResolvedValue(ids.map(id => ({ id })))
}

function rows(data: Array<{ question_id: string; is_correct: boolean }>) {
  mocks.selectResult = { data, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.selectResult = { data: [], error: null }
  mocks.upsert.mockResolvedValue({ error: null })
  bankOf(['q1', 'q2', 'q3'])
})

describe('updateDomainProgress', () => {
  it('counts unique in-bank questions and upserts the aggregate', async () => {
    rows([
      { question_id: 'q1', is_correct: true },
      { question_id: 'q2', is_correct: false },
    ])
    await updateDomainProgress('user-1', 1, 'clf-c02')

    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    const [payload, options] = mocks.upsert.mock.calls[0]
    expect(payload).toMatchObject({
      user_id: 'user-1',
      domain_id: 1,
      cert_code: 'clf-c02',
      questions_attempted: 2,
      questions_correct: 1,
    })
    expect(options).toEqual({ onConflict: 'user_id,domain_id,cert_code' })
  })

  it('ignores stale rows for questions deleted from the bank (123% bug)', async () => {
    // Bank is q1-q3; the user also has 5 historical rows for deleted IDs.
    rows([
      { question_id: 'q1', is_correct: true },
      { question_id: 'q2', is_correct: true },
      { question_id: 'q3', is_correct: true },
      { question_id: 'deleted-1', is_correct: true },
      { question_id: 'deleted-2', is_correct: true },
      { question_id: 'deleted-3', is_correct: false },
      { question_id: 'deleted-4', is_correct: true },
      { question_id: 'deleted-5', is_correct: true },
    ])
    await updateDomainProgress('user-1', 1, 'clf-c02')

    const [payload] = mocks.upsert.mock.calls[0]
    // Without the bank filter this was attempted=8, correct=7 (numerator can
    // exceed the bank). With it, both are capped by what still exists.
    expect(payload.questions_attempted).toBe(3)
    expect(payload.questions_correct).toBe(3)
    expect(payload.mastery_percent).toBeLessThanOrEqual(100)
  })

  it('never produces mastery above 100 even when every stale row is correct', async () => {
    // Pathological seed: more correct rows than the entire current bank.
    const total = getCertDomainCounts('clf-c02')[1]
    const staleRows = Array.from({ length: total + 50 }, (_, i) => ({
      question_id: `gone-${i}`,
      is_correct: true,
    }))
    const liveRows = ['q1', 'q2', 'q3'].map(id => ({ question_id: id, is_correct: true }))
    rows([...liveRows, ...staleRows])
    await updateDomainProgress('user-1', 1, 'clf-c02')

    const [payload] = mocks.upsert.mock.calls[0]
    expect(payload.questions_attempted).toBe(3)
    expect(payload.questions_correct).toBe(3)
    expect(payload.mastery_percent).toBeLessThanOrEqual(100)
  })

  it('deduplicates repeat attempts of the same question', async () => {
    rows([
      { question_id: 'q1', is_correct: false },
      { question_id: 'q1', is_correct: true },
      { question_id: 'q1', is_correct: true },
    ])
    await updateDomainProgress('user-1', 1, 'clf-c02')

    const [payload] = mocks.upsert.mock.calls[0]
    expect(payload.questions_attempted).toBe(1)
    expect(payload.questions_correct).toBe(1)
  })

  it('writes zeros when the user has no attempts', async () => {
    rows([])
    await updateDomainProgress('user-1', 1, 'clf-c02')

    const [payload] = mocks.upsert.mock.calls[0]
    expect(payload).toMatchObject({
      questions_attempted: 0,
      questions_correct: 0,
      mastery_percent: 0,
    })
  })

  it('returns early without writing when the select fails', async () => {
    mocks.selectResult = { data: null, error: { message: 'rls denied' } }
    await updateDomainProgress('user-1', 1, 'clf-c02')

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledWith(
      'supabaseUtils.updateDomainProgress.select',
      expect.anything()
    )
  })

  it('returns early without writing when the bank cannot be loaded', async () => {
    mocks.loadDomainQuestions.mockRejectedValue(new Error('Unknown certification: nope'))
    await updateDomainProgress('user-1', 1, 'nope-c00')

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledWith(
      'supabaseUtils.updateDomainProgress.loadBank',
      expect.anything()
    )
  })

  it('logs but does not throw when the upsert fails', async () => {
    rows([{ question_id: 'q1', is_correct: true }])
    mocks.upsert.mockResolvedValue({ error: { message: 'conflict' } })

    await expect(updateDomainProgress('user-1', 1, 'clf-c02')).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(
      'supabaseUtils.updateDomainProgress',
      expect.anything()
    )
  })
})
