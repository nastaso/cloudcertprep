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
    >
      <div className={`${sizeClasses[size]} relative`}>
        <div className="absolute inset-0 border-4 border-text-muted/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-brand rounded-full animate-spin" />
      </div>
      {text && (
        <p className="text-text-muted text-sm animate-pulse">{text}</p>
      )}
    </div>
  )
}
