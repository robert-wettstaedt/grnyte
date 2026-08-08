/**
 * The absolute form of a date-only value: "Aug 3, 2026".
 *
 * In UTC, because the value names a calendar date stored as UTC midnight; formatting it in the
 * viewer's zone shifts it a day for everyone west of Greenwich. Shared so the change list, the
 * card's climb line and {@link formatDay}'s own fallback cannot answer differently for one
 * stored value, which they did while each spelled the formatter out.
 */
export function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp)
}

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
    return formatDate(timestamp, locale)
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
}

/**
 * Whether {@link formatUploadedAt} will render this moment as a date rather than as "N days ago".
 *
 * Exported because a sentence that embeds the result has to agree with it: "Updated 3 days ago"
 * takes no preposition and "Updated on 3 Aug 2026" does, and German makes the same split with
 * "vor" against "am". A caller picking its wording off its own copy of the boundary would drift
 * from the formatter the first time either moved.
 */
export function isDatedMoment(timestamp: number, now: number): boolean {
  return Math.abs(Math.min(0, timestamp - now)) >= 7 * 86_400_000
}

/**
 * For a full timestamp (e.g. `createdAt`): sub-day units while the moment is fresh
 * ("5 minutes ago", "2 hours ago"), days within the last week, an absolute date
 * ("May 14, 2026") beyond it. For date-only values use `formatDay`; sub-day units
 * would misread a calendar date. `now` is injected so this stays pure and testable;
 * callers pass `Date.now()`.
 */
export function formatUploadedAt(timestamp: number, now: number, locale: string): string {
  // Clamped to the past: these timestamps are all things that have already happened, so a
  // positive difference means the clock the caller passed is behind (`now()` ticks once a
  // minute, and a client's clock can trail the server's outright), not that a photo will be
  // uploaded in eight seconds.
  const ms = Math.min(0, timestamp - now)
  const abs = Math.abs(ms)
  const DAY = 86_400_000

  if (isDatedMoment(timestamp, now)) {
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
