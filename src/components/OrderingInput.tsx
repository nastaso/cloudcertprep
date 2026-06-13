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
                    <span className={`flex-shrink-0 font-mono font-semibold ${compact ? 'text-[11px]' : 'text-xs md:text-sm'} ${isRight ? 'text-success' : 'text-danger'}`}>
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
                <span className={`flex-shrink-0 font-mono font-semibold ${compact ? 'text-[11px]' : 'text-xs md:text-sm'} text-success`}>
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
            <span className={`flex-shrink-0 font-mono font-semibold ${compact ? 'text-[11px]' : 'text-xs md:text-sm'} text-text-muted`} aria-hidden="true">
              {i + 1}
            </span>
            <span className="flex-1 text-text-primary">{options[key]}</span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label={`Move "${options[key]}" up`}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowUp className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === order.length - 1}
                aria-label={`Move "${options[key]}" down`}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowDown className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
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
