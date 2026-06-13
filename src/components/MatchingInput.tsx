import { useId } from 'react'
import { Check, X } from 'lucide-react'

interface MatchingInputProps {
  /** Left column: option key -> item text (already shuffled by the caller). */
  options: Record<string, string>
  /** Right column: target key ('1'..'5') -> target text. */
  targets: Record<string, string>
  /** User selections as `K:T` tokens, e.g. ['A:3', 'B:1']. `null` => untouched. */
  value: string[] | null
  /** Result mode only: correct pairing as { optionKey: targetKey }. */
  correctMatches?: Record<string, string>
  mode: 'input' | 'result'
  onChange?: (tokens: string[]) => void
  compact?: boolean
}

function leftKeys(options: Record<string, string>): string[] {
  return Object.keys(options).filter(k => options[k] !== undefined && options[k] !== '')
}

function targetKeys(targets: Record<string, string>): string[] {
  return Object.keys(targets)
    .filter(k => targets[k] !== undefined && targets[k] !== '')
    .sort()
}

/** Parse `K:T` tokens into an { optionKey: targetKey } map. */
function tokensToMap(tokens: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const t of tokens) {
    const [k, v] = t.split(':')
    if (k && v) map[k] = v
  }
  return map
}

/** Serialise a selection map to sorted `K:T` tokens (stable order). */
function mapToTokens(map: Record<string, string>): string[] {
  return Object.keys(map)
    .sort()
    .map(k => `${k}:${map[k]}`)
}

const rowGap = 'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3'

/**
 * Keyboard-accessible matching control: one native <select> of the right-column
 * targets per left item (no drag-and-drop, satisfying WCAG 2.5.7). Doubles as
 * the read-only result view for QuestionReviewCard and in-session feedback.
 */
export function MatchingInput({ options, targets, value, correctMatches, mode, onChange, compact }: MatchingInputProps) {
  // Called unconditionally (before any early return) to satisfy the Rules of Hooks.
  const uid = useId()
  const lefts = leftKeys(options)
  const rights = targetKeys(targets)
  const pad = compact ? 'p-2.5 text-xs md:text-sm' : 'p-3 md:p-3.5 text-sm md:text-base'

  if (mode === 'result') {
    const userMap = tokensToMap(value ?? [])
    return (
      <div className="space-y-2">
        {lefts.map(key => {
          const chosen = userMap[key]
          const correct = correctMatches?.[key]
          const isRight = chosen !== undefined && chosen === correct
          return (
            <div
              key={key}
              className={`${rowGap} w-full border rounded-xl ${pad} ${isRight ? 'border-success bg-success/10' : 'border-danger bg-danger/10'}`}
            >
              <span className="flex-1 text-text-primary font-medium">{options[key]}</span>
              <span className="flex-1 text-text-muted flex items-start gap-2">
                {isRight
                  ? <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" aria-label="correct match" />
                  : <X className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" aria-label="wrong match" />}
                <span>
                  <span className="text-text-primary">{chosen !== undefined ? (targets[chosen] ?? chosen) : 'Not answered'}</span>
                  {!isRight && correct !== undefined && (
                    <span className="block text-success mt-0.5">Correct: {targets[correct] ?? correct}</span>
                  )}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // --- input mode ---
  const selected = tokensToMap(value ?? [])

  function setMatch(optionKey: string, targetKey: string) {
    const next = { ...selected }
    if (targetKey === '') {
      delete next[optionKey]
    } else {
      next[optionKey] = targetKey
    }
    onChange?.(mapToTokens(next))
  }

  return (
    <ul className="space-y-2.5">
      {lefts.map(key => (
        <li key={key} className={`${rowGap} w-full border border-border-hairline bg-bg-card rounded-xl ${pad}`}>
          <label htmlFor={`${uid}-${key}`} className="flex-1 text-text-primary font-medium cursor-pointer">{options[key]}</label>
          <select
            id={`${uid}-${key}`}
            value={selected[key] ?? ''}
            onChange={e => setMatch(key, e.target.value)}
            aria-label={`Match for: ${options[key]}`}
            className="flex-1 min-h-[44px] bg-bg-dark border border-border-hairline rounded-lg px-3 py-2 text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="">Select a match...</option>
            {rights.map(tk => (
              <option key={tk} value={tk}>{targets[tk]}</option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  )
}
