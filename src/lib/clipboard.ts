/**
 * Clipboard helper (Growth Build 1: the repo's first share affordance).
 * The async Clipboard API needs a secure context and a user gesture, so call
 * this from click handlers only. Returns false instead of throwing so callers
 * can render a quiet failure state.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
