/**
 * Caption timestamp: a relative phrase ("3 days ago") within the last week, an
 * absolute date ("May 14, 2026") beyond it. `now` is injected so this stays pure
 * and testable; callers pass `Date.now()`.
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
