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
 * - OWNER BINDING: the flush writes to an account ONLY when the guest set an
 *   explicit, matching "save this attempt" intent (the results-screen CTA). A
 *   passive or unrelated sign-in on a shared device never adopts the snapshot,
 *   so a stranger's account is never polluted with someone else's attempt.
 */
import { getSupabase } from './supabase'
import { updateDomainProgress } from './supabaseUtils'
import { logError } from './logger'

const PENDING_KEY = 'cloudcertprep_pending_attempt'
const SAVED_NOTICE_KEY = 'cloudcertprep_pending_attempt_saved'
// Explicit "save this attempt" intent, set ONLY when the guest clicks the
// results-screen save CTA (markPendingAttemptSaveIntent). flushPendingAttempt
// refuses to write to any account without a matching intent, so a passive or
// unrelated sign-in on a shared device never adopts the snapshot. sessionStorage
// (per-tab, not localStorage) so the intent cannot leak into a different
// person's later session; it still survives the /login (and OAuth) round-trip in
// the same tab, exactly like RESUME_RESULTS_KEY / SAVED_NOTICE_KEY.
const SAVE_INTENT_KEY = 'cloudcertprep_pending_attempt_intent'
const PENDING_TTL_MS = 24 * 60 * 60 * 1000
// Freshness window for the "attempt saved" notice. A successful flush lands a
// second or two before the exam island remounts (the post-login redirect), so
// the notice only needs to survive that brief gap. Bounding it stops a notice
// set while NO exam island was mounted (a header sign-in that lands on home, or
// a failed-flush retry on a marketing page) from lingering in the tab's
// sessionStorage and later hijacking a deliberate mock-exam start with a bounce
// to /history. (EDGE-CASE stale-pending-saved-notice-bounces-to-history)
const SAVED_NOTICE_TTL_MS = 60 * 1000

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
 * Read the stored guest attempt for read-only re-display WITHOUT consuming it.
 * Used by the exam island to rehydrate a just-finished attempt after a /login
 * round-trip (P1-6). Already TTL- and shape-validated by readPendingAttempt and
 * does NOT delete on success, so a later sign-in still flushes the same snapshot.
 */
export function peekPendingAttempt(): PendingAttempt | null {
  return readPendingAttempt()
}

/**
 * One-shot "your attempt was saved" notice. The flush usually completes while
 * the user is still on /login (the SIGNED_IN event), before the exam island
 * remounts, so a window event would be missed; a sessionStorage flag survives
 * the route change. Returns the cert code once, then clears.
 *
 * The notice is stored as `${certCode}|${flushEpochMs}` and only honored within
 * SAVED_NOTICE_TTL_MS: a notice set while no exam island was mounted (header
 * sign-in -> home, or a failed-flush retry on a non-exam page) is read-and-
 * cleared but treated as expired, so it cannot bounce a deliberate later
 * exam-start to /history. A legacy notice with no timestamp is likewise ignored
 * (and cleared).
 */
export function consumePendingAttemptSavedNotice(): string | null {
  try {
    const v = sessionStorage.getItem(SAVED_NOTICE_KEY)
    if (!v) return null
    // Always clear on read - the notice is one-shot regardless of freshness.
    sessionStorage.removeItem(SAVED_NOTICE_KEY)
    const sep = v.lastIndexOf('|')
    if (sep === -1) return null
    const ts = Number(v.slice(sep + 1))
    if (!Number.isFinite(ts) || Date.now() - ts > SAVED_NOTICE_TTL_MS) return null
    return v.slice(0, sep)
  } catch {
    return null
  }
}

/**
 * Record that the guest explicitly asked to save THIS attempt, by clicking the
 * results-screen "Sign in to save this attempt" CTA. flushPendingAttempt only
 * writes the snapshot to an account when this intent is present AND names the
 * same cert, so a passive INITIAL_SESSION / TOKEN_REFRESHED or an unrelated
 * person's sign-in on a shared device can never adopt it.
 */
export function markPendingAttemptSaveIntent(certCode: string): void {
  try {
    sessionStorage.setItem(SAVE_INTENT_KEY, certCode)
  } catch {
    // sessionStorage unavailable: the attempt just won't auto-save on sign-in.
  }
}

/**
 * True when a save intent is currently set, WITHOUT consuming it. The exam
 * island reads this to decide whether to show its "Saving your attempt..."
 * loader: PR-3 gated the actual flush on the intent, so a stale, no-intent
 * pending attempt no longer saves and must not show a spurious spinner either.
 * Peek-only so this read never disarms the real flush. (item 4b)
 */
export function hasPendingAttemptSaveIntent(): boolean {
  try {
    return sessionStorage.getItem(SAVE_INTENT_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Read-and-clear the save intent. Single-use by construction: consumed before
 * the flush writes anything, so the same intent can never be replayed into a
 * second account (and a concurrent flush call finds nothing to act on).
 */
function consumeSaveIntent(): string | null {
  try {
    const v = sessionStorage.getItem(SAVE_INTENT_KEY)
    if (v) sessionStorage.removeItem(SAVE_INTENT_KEY)
    return v
  } catch {
    return null
  }
}

let flushing = false

/**
 * Write the pending attempt to Supabase for `userId`. Self-guards against
 * concurrent calls, missing/expired payloads, AND the absence of an explicit,
 * matching save intent, so it is safe to call from every auth transition: a
 * passive or unrelated sign-in (no save CTA click) leaves the snapshot
 * untouched. On a partial write the attempt row is deleted and the pending copy
 * is KEPT (but the single-use intent is already gone). Returns true when a
 * pending attempt was fully saved.
 */
export async function flushPendingAttempt(userId: string): Promise<boolean> {
  if (flushing) return false
  const pending = readPendingAttempt()
  if (!pending) return false
  // Owner binding: only flush when the guest explicitly asked to save THIS
  // attempt (the results-screen CTA set a matching intent). Consumed up front so
  // it is strictly single-use - it can never be replayed into a second account,
  // and only the account that completes the save flow adopts the snapshot.
  const intent = consumeSaveIntent()
  if (intent !== pending.certCode) return false
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
    // Stamp the notice with the flush time so a stale one (set on a non-exam
    // page) cannot bounce a deliberate later exam start to /history. (item 4)
    try { sessionStorage.setItem(SAVED_NOTICE_KEY, `${pending.certCode}|${Date.now()}`) } catch { /* ignore */ }
    window.dispatchEvent(new Event(PENDING_ATTEMPT_SAVED_EVENT))
    return true
  } catch (error: unknown) {
    logError('pendingAttempt.flush', error)
    return false
  } finally {
    flushing = false
  }
}

/**
 * Remove every pending-attempt artifact this module owns: the snapshot, the
 * save intent, and the saved notice. Called on account deletion (hardening
 * F7) so a deleted user's guest results can never rehydrate or flush for the
 * next person in the same tab.
 */
export function clearPendingAttemptStorage(): void {
  try { localStorage.removeItem(PENDING_KEY) } catch { /* ignore */ }
  try {
    sessionStorage.removeItem(SAVE_INTENT_KEY)
    sessionStorage.removeItem(SAVED_NOTICE_KEY)
  } catch { /* ignore */ }
}
