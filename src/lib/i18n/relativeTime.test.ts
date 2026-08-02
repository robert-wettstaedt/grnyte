import { describe, expect, it } from 'vitest'
import { formatDay, formatUploadedAt } from './relativeTime'

const now = Date.UTC(2026, 4, 21, 12, 0, 0) // 2026-05-21T12:00Z

describe('formatUploadedAt', () => {
  it('seconds', () => expect(formatUploadedAt(now - 5_000, now, 'en')).toBe('5 seconds ago'))
  it('minutes', () => expect(formatUploadedAt(now - 3 * 60_000, now, 'en')).toBe('3 minutes ago'))
  it('hours', () => expect(formatUploadedAt(now - 2 * 3_600_000, now, 'en')).toBe('2 hours ago'))
  it('yesterday (numeric auto)', () => expect(formatUploadedAt(now - 26 * 3_600_000, now, 'en')).toBe('yesterday'))
  it('days', () => expect(formatUploadedAt(now - 3 * 86_400_000, now, 'en')).toBe('3 days ago'))
  it('absolute beyond a week', () => expect(formatUploadedAt(now - 30 * 86_400_000, now, 'en')).toBe('Apr 21, 2026'))

  // The feed's clock ticks once a minute, so a row that just landed is routinely "newer"
  // than the `now` it renders against. "in 8 seconds" for something already logged is a
  // clock artefact, never a fact.
  it('never reads as the future', () => expect(formatUploadedAt(now + 8_000, now, 'en')).toBe('now'))
})

describe('formatDay', () => {
  // Ascent dates are pg `date` values synced as UTC midnight; `now` is any moment
  // during the local day. The label must follow calendar days, not 24h windows.
  const noon = new Date(2026, 6, 12, 12, 0).getTime()
  const utcDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

  it('today', () => expect(formatDay(utcDay('2026-07-12'), noon, 'en')).toBe('today'))
  it('yesterday', () => expect(formatDay(utcDay('2026-07-11'), noon, 'en')).toBe('yesterday'))
  it('recent days', () => expect(formatDay(utcDay('2026-07-08'), noon, 'en')).toBe('4 days ago'))
  it('absolute beyond a week', () => expect(formatDay(utcDay('2026-06-27'), noon, 'en')).toBe('Jun 27, 2026'))

  // vite.config.ts pins the suite to TZ=UTC, which once masked two real bugs:
  // absolute dates shifting a day west of UTC, and "today" reading as "tomorrow"
  // at UTC+12. Swap the zone per test so the calendar-day math stays honest.
  const withTZ = (tz: string, fn: () => void) => {
    const prev = process.env.TZ
    process.env.TZ = tz
    try {
      fn()
    } finally {
      process.env.TZ = prev
    }
  }

  it('west of UTC keeps the calendar date', () =>
    withTZ('America/New_York', () => {
      const localNoon = new Date(2026, 6, 12, 12, 0).getTime()
      expect(formatDay(utcDay('2026-07-12'), localNoon, 'en')).toBe('today')
      expect(formatDay(utcDay('2026-06-27'), localNoon, 'en')).toBe('Jun 27, 2026')
    }))
  it('at UTC+12 today stays today', () =>
    withTZ('Pacific/Auckland', () => {
      const localNoon = new Date(2026, 6, 12, 12, 0).getTime()
      expect(formatDay(utcDay('2026-07-12'), localNoon, 'en')).toBe('today')
      expect(formatDay(utcDay('2026-07-11'), localNoon, 'en')).toBe('yesterday')
    }))
})
