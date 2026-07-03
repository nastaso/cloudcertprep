import { useEffect, useRef, useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { trackEvent } from '../lib/analytics'
import { copyText } from '../lib/clipboard'

interface BlogShareButtonProps {
  /** Post title, passed to navigator.share as the share sheet's title. */
  title: string
  /** Canonical post URL. Shared as-is, and the sole clipboard-fallback payload. */
  url: string
}

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Quiet share/copy-link row for blog posts (GROW M3 rider). Same
 * navigator.share-first, clipboard-fallback pattern as the results-screen
 * ShareResultButton, but its own component: this fires post_share_clicked
 * (a blog share is a different funnel moment than a results share) and the
 * payload is always the post title + canonical URL, never freeform text.
 */
export function BlogShareButton({ title, url }: BlogShareButtonProps) {
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
        await navigator.share({ title, url })
        trackEvent('post_share_clicked', { method: 'web_share' })
        return
      } catch (err) {
        // AbortError = the user closed the share sheet: not a failure, not a
        // share. Anything else (unsupported payload) falls through to copy.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    const copied = await copyText(url)
    flashState(copied ? 'copied' : 'failed')
    if (copied) trackEvent('post_share_clicked', { method: 'clipboard' })
  }

  const Icon = copyState === 'copied' ? Check : Share2
  const shownLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Could not copy' : 'Share'

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border-hairline bg-bg-card px-5 text-sm font-medium text-text-muted transition-colors duration-200 hover:border-text-muted/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-muted/40"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span aria-live="polite">{shownLabel}</span>
    </button>
  )
}
