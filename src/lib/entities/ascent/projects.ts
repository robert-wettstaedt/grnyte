import type { UserAscentDetail } from './dto'

/**
 * The three fields a project is derived from.
 *
 * Structural rather than the full `UserAscentDetail`, so the server can ask the same question of
 * plain rows it selected itself. The logbook passes its own richer rows and still type-checks;
 * what matters is that both get the same answer from one implementation, because a card claiming
 * "23 sessions" and a profile counting differently is the same bug on two screens.
 */
export type ProjectAscent = Pick<UserAscentDetail, 'dateTime' | 'routeFk' | 'type'>

export interface ProjectRoute {
  /** Recency sort key (epoch millis): the last attempt for open projects, the
   *  first send for completed ones (when it was actually completed). */
  lastSession: number
  routeFk: number
  /**
   * Sessions that count toward the project: every attempt for open projects, or
   * the initial run up to and including the first send for completed ones (later
   * repeat cycles don't count).
   *
   * A session is a DAY, counted the way `sessions.ts` counts one. One ascent row
   * per route per day is what the app expects and what a climber logs: nobody
   * records three rows on one route in one afternoon to mean "it took me three
   * goes", because the row already means "I went, and this is how it ended". Rows
   * that do share a route and a day are a mistake, so they fold into one session
   * rather than inflating the count. `date_time` is a pg `date`, so same day is
   * literally the same number and the fold is a dedupe.
   */
  sessions: number
}

/**
 * A climber's projects, derived from their ascents grouped by route and ordered
 * chronologically:
 * - `open`:      never sent — every ascent is an `attempt`. Once a route has any
 *                non-attempt ascent it can never be open again.
 * - `completed`: the run up to and including the first send spans more than two
 *                sessions. Only that initial run counts; any later attempt/repeat
 *                cycle is a separate event and ignored.
 * A route sent on the second visit, or worked and sent inside a single day, was
 * never a project: projecting means going back.
 */
export function deriveProjects(ascents: readonly ProjectAscent[]): {
  completed: ProjectRoute[]
  open: ProjectRoute[]
} {
  const open: ProjectRoute[] = []
  const completed: ProjectRoute[] = []

  for (const [routeFk, group] of groupByRoute(ascents)) {
    // Chronological order so "the first send" and the sessions before it are well
    // defined. Same-day ties keep insertion order, which no longer decides anything:
    // both rows land in the same session either way.
    const ordered = [...group].sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0))
    // First non-attempt = the send that ended the projecting run.
    const firstSend = ordered.findIndex((ascent) => ascent.type !== 'attempt')

    if (firstSend === -1) {
      const lastSession = ordered.reduce((max, ascent) => Math.max(max, ascent.dateTime ?? 0), 0)
      open.push({ lastSession, routeFk, sessions: countSessions(ordered) })
    } else {
      // The run, send included. Counted in days rather than rows, so the bar is two
      // visits that ended in failure before the one that did not, however many rows
      // happen to be sitting on those days.
      const sessions = countSessions(ordered.slice(0, firstSend + 1))

      if (sessions > 2) {
        completed.push({ lastSession: ordered[firstSend].dateTime ?? 0, routeFk, sessions })
      }
    }
  }

  const byRecency = (a: ProjectRoute, b: ProjectRoute): number => b.lastSession - a.lastSession
  open.sort(byRecency)
  completed.sort(byRecency)
  return { completed, open }
}

/** Distinct days, which is what a session is. See `ProjectRoute.sessions`. */
function countSessions(ascents: readonly ProjectAscent[]): number {
  return new Set(ascents.map((ascent) => ascent.dateTime ?? 0)).size
}

function groupByRoute(ascents: readonly ProjectAscent[]): Map<number, ProjectAscent[]> {
  const byRoute = new Map<number, ProjectAscent[]>()
  for (const ascent of ascents) {
    const list = byRoute.get(ascent.routeFk)
    if (list == null) {
      byRoute.set(ascent.routeFk, [ascent])
    } else {
      list.push(ascent)
    }
  }
  return byRoute
}
