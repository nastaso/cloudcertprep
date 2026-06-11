/**
 * Format a date string into a human-readable relative date.
 *
 * Uses the platform `Intl.RelativeTimeFormat` API with `numeric: 'auto'`,
 * which renders "yesterday" / "tomorrow" naturally and is locale-aware.
 *
 * Calendar-day comparison handles the boundary case (a timestamp from
 * yesterday at 23:00 read at today 09:00 returns "yesterday", not
 * "10 hours ago"). Old dates fall back to a localised absolute date.
 */
const LOCALE = 'en-GB'
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
const absoluteDateFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()

  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute')
  if (diffHours < 24) return rtf.format(-diffHours, 'hour')

  // Calendar-day comparison from local midnight (handles 23:00 -> 09:00 case).
  const diffCalendarDays = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000,
  )

  if (diffCalendarDays === 1) return rtf.format(-1, 'day')
  if (diffCalendarDays < 7) return rtf.format(-diffCalendarDays, 'day')
  if (diffCalendarDays < 30) return rtf.format(-Math.floor(diffCalendarDays / 7), 'week')
  if (diffCalendarDays < 365) return rtf.format(-Math.floor(diffCalendarDays / 30), 'month')

  return absoluteDateFmt.format(date)
}
