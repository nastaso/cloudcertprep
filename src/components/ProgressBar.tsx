interface ProgressBarProps {
  percent: number
  showLabel?: boolean
  label?: string
}

export function ProgressBar({ percent, showLabel = true, label }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div
        className="w-full h-3 bg-bg-dark rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `${Math.round(percent)}% complete`}
      >
        <div
          className="h-full transition-all duration-500 ease-out rounded-full bg-brand"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-right">
          <span className="text-sm font-medium text-text-primary">
            {Math.round(percent)}%
          </span>
        </div>
      )}
    </div>
  )
}
