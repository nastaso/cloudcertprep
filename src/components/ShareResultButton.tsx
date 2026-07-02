import { useEffect, useRef, useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { trackEvent } from '../lib/analytics'
import { copyText } from '../lib/clipboard'

interface ShareResultButtonProps {
  /** Full text to share/copy, prebuilt by the caller (lib/shareResult.ts). */
  text: string
  /** Idle label, e.g. "Share my result". */
  label: string
  /** Extra share_result params (cert/authed) for phase-2 gating. */
  analytics: Record<string, unknown>
}

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Quiet share/copy pill for the results screen (Growth Build 1, phase 1).
 * navigator.share where available (mobile), clipboard fallback with a
 * transient "Copied" state elsewhere. Deliberately low-key styling: for
 * guests it must stay visually secondary to UnlockCTA, whose sign-in is the
 * more valuable conversion.
 */
export function ShareResultButton({ text, label, analytics }: ShareResultButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  function flashState(state: 'copied' | 'failed') {
    setCopyState(state)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2000)
  }

  async function handleClick() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text })
        trackEvent('share_result', { ...analytics, method: 'web_share' })
        return
      } catch (err) {
        // AbortError = the user closed the share sheet: not a failure, not a
        // share. Anything else (unsupported payload) falls through to copy.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    const copied = await copyText(text)
    flashState(copied ? 'copied' : 'failed')
    if (copied) trackEvent('share_result', { ...analytics, method: 'clipboard' })
  }

  const Icon = copyState === 'copied' ? Check : Share2
  const shownLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Could not copy' : label

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border-hairline bg-bg-card px-5 text-sm font-medium text-text-primary transition-colors duration-200 hover:border-text-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-muted/40"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span aria-live="polite">{shownLabel}</span>
    </button>
  )
}
