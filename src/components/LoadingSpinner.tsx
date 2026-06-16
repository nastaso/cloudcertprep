interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  /** Delay appearance ~250ms so fast loads don't flash a spinner (route fallbacks). */
  delayed?: boolean
}

export function LoadingSpinner({ size = 'md', text, delayed = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${delayed ? 'animate-delayed-fade' : 'animate-fade-in'}`}
      role="status"
      aria-live="polite"
      aria-label={text ?? "Loading"}
    >
      {/* Monochrome ring (track + single rotating head in the primary text
          colour, theme-aware). The brand orange is reserved for CTAs/active
          state across the design system, so a neutral spinner reads as premium
          and coherent rather than a loud accent flash on every island mount. */}
      <div className={`${sizeClasses[size]} relative`}>
        <div className="absolute inset-0 border-[3px] border-text-muted/20 rounded-full" />
        <div className="absolute inset-0 border-[3px] border-transparent border-t-text-primary/80 rounded-full animate-spin" />
      </div>
      {text && (
        <p className="text-text-muted text-sm animate-pulse">{text}</p>
      )}
    </div>
  )
}
