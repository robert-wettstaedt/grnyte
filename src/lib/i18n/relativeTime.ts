/**
 * Intl formatters are costly to construct and free to reuse: on Node 24, building a
 * `RelativeTimeFormat` and formatting once measures ~9 µs against ~0.3 µs for a reused one, and the
 * `DateTimeFormat` variant ~27 µs. `state/now.svelte.ts` ticks a shared clock every minute and on
 * every `visibilitychange`, which re-runs every relative label in the feed, the logbook and the
 * inbox at once, so a screenful of them is milliseconds of main thread per tick on a phone.
 *
 * Keyed by locale rather than held as one module-level formatter because the locale is a runtime
 * value: paraglide can switch it mid-session, and a singleton built on the first reader's locale
 * would quietly format the second reader's labels in it.
 *
 * A cached formatter also pins the runtime timezone at construction. That is right for a session (a
 * device's zone does not move under a running page) but it means a test that swaps `process.env.TZ`
 * cannot expect the local-zone formatter below to follow it.
 */
const perLocale = <T>(create: (locale: string) => T): ((locale: string) => T) => {
  const cache = new Map<string, T>()
  return (locale) => {
    const cached = cache.get(locale)
    if (cached != null) {
      return cached
    }
    const created = create(locale)
    cache.set(locale, created)
    return created
  }
}

const utcDateFormat = perLocale((locale) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }))
const localDateFormat = perLocale((locale) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }))
const relativeFormat = perLocale((locale) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }))

/**
 * The local calendar day a moment falls on, as the UTC-midnight stamp every date-only value in
 * the app is stored and formatted as.
 *
 * One conversion, because getting it wrong is invisible until somebody reads the app from another
 * timezone: a moment formatted in UTC lands on the day before for every reader west of Greenwich,
 * and a date-only value compared as a distance in milliseconds is a day out on both sides of it.
 * The feed's dividers, the inbox's, the contribution calendar and a card's climb line all ask this
 * same question and each used to answer it in its own two lines.
 */
export function calendarDay(at: number): number {
  const local = new Date(at)
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate())
}

/**
 * The absolute form of a date-only value: "Aug 3, 2026".
 *
 * In UTC, because the value names a calendar date stored as UTC midnight; formatting it in the
 * viewer's zone shifts it a day for everyone west of Greenwich. Shared so the change list, the
 * card's climb line and {@link formatDay}'s own fallback cannot answer differently for one
 * stored value, which they did while each spelled the formatter out.
 */
export function formatDate(timestamp: number, locale: string): string {
  return utcDateFormat(locale).format(timestamp)
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
  const days = Math.round((timestamp - calendarDay(now)) / DAY)
  if (Math.abs(days) >= 7) {
    return formatDate(timestamp, locale)
  }
  return relativeFormat(locale).format(days, 'day')
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
    // The viewer's own zone, unlike `formatDate`: this one is a moment, not a stored calendar date.
    return localDateFormat(locale).format(timestamp)
  }

  const rtf = relativeFormat(locale)
  const MINUTE = 60_000
  const HOUR = 3_600_000
  if (abs < MINUTE) return rtf.format(Math.round(ms / 1000), 'second')
  if (abs < HOUR) return rtf.format(Math.round(ms / MINUTE), 'minute')
  if (abs < DAY) return rtf.format(Math.round(ms / HOUR), 'hour')
  return rtf.format(Math.round(ms / DAY), 'day')
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
 * A local calendar date as `yyyy-mm-dd`: the wire format of the app's pg `date` columns, and what a
 * native `<input type="date">` reads and writes.
 *
 * Spelled out rather than taken off `new Intl.DateTimeFormat('en-CA')`, whose short pattern happens
 * to be ISO today. ECMA-402 guarantees the API, never the pattern a locale resolves to, and this
 * value is compared for equality and written to the database rather than read by a person, so a CLDR
 * revision would break it silently. `toISOString().slice(0, 10)` is not the fix either: it converts
 * to UTC first, so a climber logging just after midnight in Berlin gets yesterday's date and one
 * logging at 20:00 in Denver gets tomorrow's.
 */
export function localIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
