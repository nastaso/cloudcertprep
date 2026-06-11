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

/** True while a timed exam is running (mirrors the body dataset flag the exam island sets). */
export function isExamActive(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.examActive === 'true'
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
 * Ask to leave to `url`. If an exam is active and a handler is registered, the
 * confirm modal is shown and this returns true (caller must NOT navigate). If
 * no exam is active, returns false (caller navigates normally). Used by the
 * header's non-anchor navigations (e.g. the Sign in button).
 */
export function guardExamLeave(url: string): boolean {
  if (isExamActive() && leaveHandler) {
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
