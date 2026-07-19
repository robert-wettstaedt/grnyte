import type { UserAscentDetail } from './dto'

export interface AscentSession {
  ascents: UserAscentDetail[]
  /** Epoch millis of the session's day (the ascents' UTC-midnight `dateTime`). */
  day: number
}

/** Per-day ascent counts (day epoch millis → count), for the contribution calendar. */
export function dayCounts(sessions: readonly AscentSession[]): Map<number, number> {
  return new Map(sessions.map((session) => [session.day, session.ascents.length]))
}

/**
 * A climber's ascents grouped into sessions, one per calendar day. The pg `date`
 * column syncs as UTC-midnight millis, so every ascent on the same day shares the
 * exact `dateTime` value and groups cleanly. Newest day first; ascents with no
 * date are dropped (a session needs a day).
 */
export function groupSessions(ascents: readonly UserAscentDetail[]): AscentSession[] {
  const byDay = new Map<number, UserAscentDetail[]>()
  for (const ascent of ascents) {
    if (ascent.dateTime == null) {
      continue
    }
    const list = byDay.get(ascent.dateTime)
    if (list == null) {
      byDay.set(ascent.dateTime, [ascent])
    } else {
      list.push(ascent)
    }
  }

  return [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([day, dayAscents]) => ({ ascents: dayAscents, day }))
}
