interface AnswerButtonProps {
  label: 'A' | 'B' | 'C' | 'D' | 'E'
  text: string
  state: 'default' | 'selected' | 'correct' | 'wrong' | 'disabled'
  onClick?: () => void
  disabled?: boolean
  compact?: boolean
}

export function AnswerButton({ label, text, state, onClick, disabled, compact }: AnswerButtonProps) {
  const stateStyles = {
    default: 'border-text-muted/30 hover:border-text-muted/50 bg-bg-card hover:bg-bg-card-hover',
    selected: 'border-brand bg-brand/10',
    correct: 'border-success bg-success/10',
    wrong: 'border-danger bg-danger/10',
    disabled: 'border-text-muted/20 bg-bg-card opacity-50 cursor-not-allowed',
  }

  const labelStyles = {
    default: 'bg-bg-dark text-text-primary',
    selected: 'bg-brand text-on-brand',
    correct: 'bg-success text-on-brand',
    wrong: 'bg-danger text-on-brand',
    disabled: 'bg-bg-dark text-text-muted',
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
      className={`w-full border-2 rounded-lg transition-colors duration-200 text-left flex items-start ${compact ? 'p-2 md:p-2.5 gap-2 text-xs md:text-sm' : 'min-h-[44px] p-2.5 md:p-4 lg:p-5 gap-2.5 md:gap-3 lg:gap-4 text-sm md:text-base'} ${stateStyles[state]}`}
    >
      <div className={`flex-shrink-0 rounded-full flex items-center justify-center font-bold ${compact ? 'w-6 h-6 text-xs' : 'w-7 h-7 md:w-8 md:h-8 text-xs md:text-sm'} ${labelStyles[state]}`}>
        {label}
      </div>
      <div className={`flex-1 text-text-primary ${compact ? 'pt-0.5' : 'pt-0.5 md:pt-1'}`}>
        {text}
      </div>
    </button>
  )
}
