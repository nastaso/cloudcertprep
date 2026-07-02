/**
 * examGuard — coordinates "leave the exam?" confirmation between the header
 * island and the exam island (separate React roots that can't share context).
 *
 * While an exam is in progress the user can still navigate anywhere, but any
 * in-app navigation is intercepted and routed through a custom confirm modal
 * (owned by the exam island) instead of the browser's un-stylable native
 * `beforeunload` dialog. The native dialog is kept ONLY as the last-resort net
 * for true browser-level exits (tab close, refresh) that JS cannot intercept.
 *
 * Exam state lives in the exam island's React memory, so leaving really does
 * discard the in-progress attempt — the modal copy says so. This module just
 * brokers the handoff; it holds no exam data.
 */

let leaveHandler: ((url: string) => void) | null = null
let intentionalLeave = false

/**
 * Reserved leave target meaning "sign the user out" rather than navigate to a
 * URL. Passed through the same guardExamLeave / leaveHandler string channel so
 * this module stays framework-agnostic; the exam island branches on it (P1-7).
 */
export const SIGN_OUT_SENTINEL = '__signout__'

/** True while a timed exam is running (mirrors the body dataset flag the exam island sets). */
export function isExamActive(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.examActive === 'true'
}

/**
 * True while a domain-practice session is in progress (mirrors the body dataset
 * flag the practice island sets). Practice deliberately does NOT set
 * `examActive`, so it carries its own flag; the leave broker treats both the same.
 */
export function isPracticeActive(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.practiceActive === 'true'
}

/**
 * The exam island registers how to confirm a leave (open its modal). Returns a
 * cleanup that clears the handler so a stale closure can't fire after unmount.
 */
export function registerExamLeaveHandler(fn: (url: string) => void): () => void {
  leaveHandler = fn
  return () => {
    if (leaveHandler === fn) leaveHandler = null
  }
}

/**
 * Ask to leave to `url`. If an exam OR a practice session is active and a
 * handler is registered, the confirm modal is shown and this returns true
 * (caller must NOT navigate / sign out). Otherwise returns false (caller
 * proceeds normally). Used by the header's non-anchor actions (the Sign in /
 * Sign out buttons), which the islands' anchor-capture listeners can't catch.
 */
export function guardExamLeave(url: string): boolean {
  if ((isExamActive() || isPracticeActive()) && leaveHandler) {
    leaveHandler(url)
    return true
  }
  return false
}

/**
 * Perform a user-confirmed leave. Marks the next unload as intentional so the
 * `beforeunload` net stays silent for this navigation, then navigates.
 */
export function confirmExamLeave(url: string): void {
  intentionalLeave = true
  window.location.assign(url)
}

/** True when the current unload was triggered by a confirmed in-app leave. */
export function isIntentionalLeave(): boolean {
  return intentionalLeave
}

/**
 * Mark the next unload intentional WITHOUT navigating. Used when the confirmed
 * action performs its own redirect (e.g. sign-out calls window.location.assign),
 * so the beforeunload net stays silent for that navigation (P1-7).
 */
export function markIntentionalLeave(): void {
  intentionalLeave = true
}
