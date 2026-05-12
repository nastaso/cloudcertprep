interface PassFailBannerProps {
  passed: boolean
  scaledScore: number
  percent: number
}

/**
 * Result summary shown after submitting a Mock Exam.
 *
 * Design language matches the rest of the app: a plain `bg-bg-card` card
 * with a small uppercase status badge (same pattern as the ACTIVE/COMING SOON
 * badges in `Stats.tsx`) and a large neutral score (same treatment as the
 * Stats page metrics).
 *
 * No coloured accent strip, no full-bleed solid colour, no tinted icon
 * circle. Status colour is communicated entirely through the small badge,
 * keeping visual weight balanced and consistent across the app.
 *
 * Domain Practice's instant per-question red/green flash is intentionally
 * untouched: that is a micro-interaction, this is a persistent summary.
 */
export function PassFailBanner({ passed, scaledScore, percent }: PassFailBannerProps) {
  const badgeClasses = passed
    ? 'bg-success/20 text-success'
    : 'bg-danger/20 text-danger'
  const badgeLabel = passed ? 'PASSED' : 'FAILED'
  const subtitle = passed
    ? 'Congratulations! You passed the exam.'
    : 'Keep practicing. You can do this!'

  return (
    <div className="w-full bg-bg-card rounded-lg shadow-card p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span
            className={`inline-block px-2 py-1 rounded text-xs font-medium uppercase tracking-wide ${badgeClasses}`}
          >
            {badgeLabel}
          </span>
          <p className="text-sm text-text-muted mt-2">{subtitle}</p>
        </div>
        <div className="sm:text-right">
          <div className="text-3xl md:text-4xl font-bold text-text-primary leading-none">
            {scaledScore}
            <span className="text-base md:text-lg text-text-muted font-medium ml-1">
              /1000
            </span>
          </div>
          <div className="text-sm text-text-muted mt-1">
            {Math.round(percent)}% correct
          </div>
        </div>
      </div>
    </div>
  )
}
