/**
 * For a date-only value (a pg `date` synced as UTC-midnight millis, e.g. an ascent's
 * `dateTime`): never finer than a calendar day. "today" / "yesterday" / "3 days ago"
 * within the last week, an absolute date beyond it.
 */
export function formatDay(timestamp: number, now: number, locale: string): string {
  const DAY = 86_400_000
  // The timestamp names a calendar date (UTC midnight); `now` is a moment in the
  // viewer's local day. Compare both as UTC midnights of their calendar dates, and
  // format the absolute date in UTC, so neither the time of day nor the timezone
  // can shift the label by a day.
  const local = new Date(now)
  const today = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())
  const days = Math.round((timestamp - today) / DAY)
  if (Math.abs(days) >= 7) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp)
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
}

/**
 * For a full timestamp (e.g. `createdAt`): sub-day units while the moment is fresh
 * ("5 minutes ago", "2 hours ago"), days within the last week, an absolute date
 * ("May 14, 2026") beyond it. For date-only values use `formatDay`; sub-day units
 * would misread a calendar date. `now` is injected so this stays pure and testable;
 * callers pass `Date.now()`.
 */
export function formatUploadedAt(timestamp: number, now: number, locale: string): string {
  const ms = timestamp - now // negative in the past
  const abs = Math.abs(ms)
  const DAY = 86_400_000

  if (abs >= 7 * DAY) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(timestamp)
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const MINUTE = 60_000
  const HOUR = 3_600_000
  if (abs < MINUTE) return rtf.format(Math.round(ms / 1000), 'second')
  if (abs < HOUR) return rtf.format(Math.round(ms / MINUTE), 'minute')
  if (abs < DAY) return rtf.format(Math.round(ms / HOUR), 'hour')
  return rtf.format(Math.round(ms / DAY), 'day')
}
