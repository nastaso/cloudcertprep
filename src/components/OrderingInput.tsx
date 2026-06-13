import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, Check, X } from 'lucide-react'

interface OrderingInputProps {
  /** Display options: option key -> step text (already shuffled by the caller). */
  options: Record<string, string>
  /**
   * Current order as a list of option keys. `null` in input mode means the user
   * has not touched it yet (the initial option order is shown but the question
   * counts as unanswered). In result mode this is the user's submitted order.
   */
  value: string[] | null
  /** Result mode only: the correct sequence of option keys. */
  correctOrder?: string[]
  mode: 'input' | 'result'
  onChange?: (order: string[]) => void
  compact?: boolean
}

/** Non-empty option keys in their natural display order (A, B, C, ...). */
function defaultOrder(options: Record<string, string>): string[] {
  return Object.keys(options).filter(k => options[k] !== undefined && options[k] !== '')
}

const rowBase =
  'flex items-center gap-2 md:gap-3 w-full border rounded-xl text-left transition-[border-color,background-color] duration-200'

/**
 * Keyboard-accessible ordering control: a vertical list reordered with native
 * Move up / Move down buttons (no HTML5 drag-and-drop, which fails WCAG 2.5.7
 * Dragging Movements and is not keyboard-operable). Doubles as the read-only
 * result view used by QuestionReviewCard and the in-session feedback panels.
 */
export function OrderingInput({ options, value, correctOrder, mode, onChange, compact }: OrderingInputProps) {
  const [announcement, setAnnouncement] = useState('')
  // Reset the live region a moment after each move so the next move (even with
  // identical wording) is a genuine text change and re-announces. Cancelled on
  // a fresh move so the latest message is never cleared early.
  const clearTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(clearTimer.current), [])
  const pad = compact ? 'p-2.5 gap-2.5 text-xs md:text-sm' : 'p-3 md:p-3.5 text-sm md:text-base'
  // Numbered step badge (DSv6 numbered-row language, §7) — a chip, not a bare
  // digit, so the sequence reads as deliberate steps in both themes. Tint
  // carries the graded state in result mode; neutral well in input mode.
  const stepBadge = (tint: string) =>
    `flex-shrink-0 grid place-items-center font-mono font-semibold rounded-lg border ${compact ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-xs md:text-sm'} ${tint}`
  // Reorder controls read as real buttons (resting hairline well) instead of
  // floating icons. Hover = border-brighten + surface tier (Astro pattern) and
  // the sanctioned arrow slide (§6); press = 80ms scale. 44px touch target.
  const reorderBtn =
    'group w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-lg border border-border-hairline bg-bg-dark/40 text-text-muted hover:text-text-primary hover:border-text-muted/60 hover:bg-bg-card-hover transition-[color,border-color,background-color,transform] duration-200 ease-press active:scale-95 active:duration-[80ms] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-bg-dark/40 disabled:hover:border-border-hairline disabled:hover:text-text-muted disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand'

  if (mode === 'result') {
    const userOrder = value ?? []
    const answered = userOrder.length > 0
    return (
      <div className="space-y-3">
        {answered && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-muted">Your order</p>
            <ol className="space-y-1.5">
              {userOrder.map((key, i) => {
                const isRight = correctOrder?.[i] === key
                return (
                  <li
                    key={`${key}-${i}`}
                    className={`${rowBase} ${pad} ${isRight ? 'border-success bg-success/10' : 'border-danger bg-danger/10'}`}
                  >
                    <span aria-hidden="true" className={stepBadge(isRight ? 'bg-bg-card border-success/40 text-success' : 'bg-bg-card border-danger/40 text-danger')}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-text-primary">{options[key] ?? key}</span>
                    {isRight
                      ? <Check className="w-4 h-4 text-success flex-shrink-0" aria-label="correct position" />
                      : <X className="w-4 h-4 text-danger flex-shrink-0" aria-label="wrong position" />}
                  </li>
                )
              })}
            </ol>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-muted">{answered ? 'Correct order' : 'Not answered. Correct order'}</p>
          <ol className="space-y-1.5">
            {(correctOrder ?? defaultOrder(options)).map((key, i) => (
              <li key={`${key}-${i}`} className={`${rowBase} ${pad} border-success bg-success/10`}>
                <span aria-hidden="true" className={stepBadge('bg-bg-card border-success/40 text-success')}>
                  {i + 1}
                </span>
                <span className="flex-1 text-text-primary">{options[key] ?? key}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    )
  }

  // --- input mode ---
  const order = value ?? defaultOrder(options)

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setAnnouncement(`${options[moved]} moved to position ${to + 1} of ${order.length}`)
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setAnnouncement(''), 1000)
    onChange?.(next)
  }

  return (
    <div>
      <ul className="space-y-2">
        {order.map((key, i) => (
          <li key={key} className={`${rowBase} ${pad} border-border-hairline bg-bg-card`}>
            <span aria-hidden="true" className={stepBadge('bg-bg-dark border-border-hairline text-text-muted')}>
              {i + 1}
            </span>
            <span className="flex-1 text-text-primary">{options[key]}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move "${options[key]}" up`}
                className={reorderBtn}
              >
                <ArrowUp className="w-4 h-4 md:w-[18px] md:h-[18px] transition-transform duration-200 ease-press group-hover:-translate-y-0.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === order.length - 1}
                aria-label={`Move "${options[key]}" down`}
                className={reorderBtn}
              >
                <ArrowDown className="w-4 h-4 md:w-[18px] md:h-[18px] transition-transform duration-200 ease-press group-hover:translate-y-0.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
