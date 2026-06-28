import { Check, X } from 'lucide-react'

interface AnswerButtonProps {
  label: 'A' | 'B' | 'C' | 'D' | 'E'
  text: string
  state: 'default' | 'selected' | 'correct' | 'wrong' | 'disabled'
  onClick?: () => void
  disabled?: boolean
  compact?: boolean
}

/**
 * Answer option row (DSv6): mirrors the ExamMockup chrome that sells the
 * product on the marketing pages — 12px radius, hairline border, mono option
 * letter, state carried by border + tint. Hover changes border/surface only;
 * press gives the 80ms scale answer (motion budget, DESIGN_SYSTEM_v6 §6).
 */
export function AnswerButton({ label, text, state, onClick, disabled, compact }: AnswerButtonProps) {
  const stateStyles = {
    default: 'border-text-muted/25 bg-bg-card hover:border-text-muted/50 hover:bg-bg-card-hover',
    selected: 'border-brand bg-brand/10',
    correct: 'border-success bg-success/10',
    wrong: 'border-danger bg-danger/10',
    disabled: 'border-border-hairline bg-bg-card opacity-50 cursor-not-allowed',
  }

  const labelStyles = {
    default: 'text-text-muted',
    selected: 'text-brand',
    correct: 'text-success',
    wrong: 'text-danger',
    disabled: 'text-text-muted',
  }

  // Only emit aria-pressed for actual toggle states. Once feedback resolves
  // (correct / wrong / disabled), the button is no longer a live toggle, so
  // SR users would otherwise hear "not pressed" on a question they answered.
  const isToggleState = state === 'default' || state === 'selected'

  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'disabled'}
      {...(isToggleState ? { 'aria-pressed': state === 'selected' } : {})}
      className={`w-full border rounded-xl transition-[border-color,background-color,transform] duration-gentle ease-press active:scale-[0.99] active:duration-press disabled:active:scale-100 text-left flex items-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark ${compact ? 'p-2.5 md:p-3 gap-2.5 text-xs md:text-sm' : 'min-h-[44px] p-3 md:p-4 gap-3 md:gap-3.5 text-sm md:text-base'} ${stateStyles[state]}`}
    >
      <span
        aria-hidden="true"
        className={`flex-shrink-0 font-mono font-semibold ${compact ? 'text-[11px] pt-[3px]' : 'text-[12px] md:text-[13px] pt-[3px] md:pt-1'} ${labelStyles[state]}`}
      >
        {label}
      </span>
      <div className={`flex-1 text-text-primary ${compact ? 'pt-0' : 'pt-0 md:pt-0.5'}`}>
        {text}
      </div>
      {/* Non-color cue for the graded states (color alone fails colorblind
          users): a check on the correct answer, an X on a wrong pick. */}
      {(state === 'correct' || state === 'wrong') && (
        <span
          className={`flex-shrink-0 ${compact ? 'pt-0.5' : 'pt-0.5 md:pt-1'} ${state === 'correct' ? 'text-success' : 'text-danger'}`}
        >
          {state === 'correct'
            ? <Check role="img" aria-label="Correct answer" className={compact ? 'w-4 h-4' : 'w-4 h-4 md:w-5 md:h-5'} />
            : <X role="img" aria-label="Your answer (incorrect)" className={compact ? 'w-4 h-4' : 'w-4 h-4 md:w-5 md:h-5'} />}
        </span>
      )}
    </button>
  )
}
