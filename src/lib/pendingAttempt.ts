/**
 * Guest exam attempts: persist, then flush after sign-in.
 *
 * A guest who completes a mock exam holds the results only in the exam
 * island's React memory, but the results screen invites them to "Sign in to
 * save this attempt". Navigating to /login unmounts the island, so without a
 * snapshot the promise is impossible to keep. storePendingAttempt() writes
 * the finished attempt to localStorage at submit time; flushPendingAttempt()
 * (wired into useAuth) writes it to Supabase once a user is signed in,
 * mirroring the logged-in save path in _MockExam.handleSubmitExam: same
 * tables, same compensating delete on a partial write.
 *
 * Rules mirrored from the live save path, plus pending-specific ones:
 * - only attempts that took >= MIN_VALID_EXAM_SECONDS are stored (the caller
 *   enforces this; a sub-minute exam is never a real attempt)
 * - one pending attempt at a time: a newer guest exam overwrites an older one
 * - pending attempts expire after 24 hours, so a stale guest score does not
 *   silently appear in an account created days later
 * - `attempted_at` is written from the guest finish time, not the flush time
 */
import { getSupabase } from './supabase'
import { updateDomainProgress } from './supabaseUtils'
import { logError } from './logger'

const PENDING_KEY = 'cloudcertprep_pending_attempt'
const SAVED_NOTICE_KEY = 'cloudcertprep_pending_attempt_saved'
const PENDING_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Fired after a successful flush. The exam island listens for it IN ADDITION
 * to the sessionStorage flag: the flush races the post-login redirect, so the
 * island may mount before (flag path) or after (event path) the save lands.
 */
export const PENDING_ATTEMPT_SAVED_EVENT = 'cc:pending-attempt-saved'

export interface PendingAttemptQuestion {
  question_id: string
  /** Original-key answers (display shuffle already reversed), comma-joined for multi-answer. */
  user_answer: string
  correct_answer: string
  is_correct: boolean
  was_flagged: boolean
  domain_id: number
}

export interface PendingAttempt {
  certCode: string
  /** Epoch ms when the guest submitted the exam. */
  finishedAt: number
  attempt: {
    score_percent: number
    scaled_score: number
    passed: boolean
    time_taken_seconds: number
    total_questions: number
    correct_answers: number
    domain_scores: Record<string, number>
  }
  questions: PendingAttemptQuestion[]
}

export function storePendingAttempt(pending: PendingAttempt): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // localStorage unavailable: the guest attempt just isn't recoverable.
  }
}

function readPendingAttempt(): PendingAttempt | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingAttempt
    const shapeOk =
      typeof parsed?.certCode === 'string'
      && typeof parsed?.finishedAt === 'number'
      && typeof parsed?.attempt === 'object'
      && parsed.attempt !== null
      && Array.isArray(parsed?.questions)
    if (!shapeOk || Date.now() - parsed.finishedAt > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY)
      return null
    }
    return parsed
  } catch {
    try { localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ }
    return null
  }
}

/** Cheap presence check so auth listeners can skip the async flush entirely. */
export function hasPendingAttempt(): boolean {
  return readPendingAttempt() !== null
}

/**
 * One-shot "your attempt was saved" notice. The flush usually completes while
 * the user is still on /login (the SIGNED_IN event), before the exam island
 * remounts, so a window event would be missed; a sessionStorage flag survives
 * the route change. Returns the cert code once, then clears.
 */
export function consumePendingAttemptSavedNotice(): string | null {
  try {
    const v = sessionStorage.getItem(SAVED_NOTICE_KEY)
    if (v) sessionStorage.removeItem(SAVED_NOTICE_KEY)
    return v
  } catch {
    return null
  }
}

let flushing = false

/**
 * Write the pending attempt to Supabase for `userId`. Self-guards against
 * concurrent calls and missing/expired payloads, so it is safe to call from
 * every auth transition. On a partial write the attempt row is deleted and
 * the pending copy is KEPT for a later retry. Returns true when a pending
 * attempt was fully saved.
 */
export async function flushPendingAttempt(userId: string): Promise<boolean> {
  if (flushing) return false
  const pending = readPendingAttempt()
  if (!pending) return false
  flushing = true
  try {
    const supabase = await getSupabase()
    const { data: attemptData, error: attemptError } = await supabase
      .from('exam_attempts')
      .insert({
        user_id: userId,
        cert_code: pending.certCode,
        attempted_at: new Date(pending.finishedAt).toISOString(),
        ...pending.attempt,
      })
      .select()
      .single()

    if (attemptError) throw attemptError

    const questionRecords = pending.questions.map(q => ({
      ...q,
      attempt_id: attemptData.id,
      user_id: userId,
      cert_code: pending.certCode,
    }))

    if (questionRecords.length > 0) {
      const { error: questionsError } = await supabase
        .from('attempt_questions')
        .insert(questionRecords)

      if (questionsError) {
        // Mirror the live save path (M0b): never leave a scored attempt with
        // zero reviewable questions.
        await supabase.from('exam_attempts').delete().eq('id', attemptData.id)
        throw questionsError
      }
    }

    const domainIds = [...new Set(pending.questions.map(q => q.domain_id))]
    for (const domainId of domainIds) {
      await updateDomainProgress(userId, domainId, pending.certCode)
    }

    localStorage.removeItem(PENDING_KEY)
    try { sessionStorage.setItem(SAVED_NOTICE_KEY, pending.certCode) } catch { /* ignore */ }
    window.dispatchEvent(new Event(PENDING_ATTEMPT_SAVED_EVENT))
    return true
  } catch (error: unknown) {
    logError('pendingAttempt.flush', error)
    return false
  } finally {
    flushing = false
  }
}
