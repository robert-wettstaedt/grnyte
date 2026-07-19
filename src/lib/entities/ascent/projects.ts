import type { UserAscentDetail } from './dto'

export interface ProjectRoute {
  /** Recency sort key (epoch millis): the last attempt for open projects, the
   *  first send for completed ones (when it was actually completed). */
  lastSession: number
  routeFk: number
  /** Sessions that count toward the project (one ascent = one session): every
   *  attempt for open projects, or the initial run up to and including the first
   *  send for completed ones (later repeat cycles don't count). */
  sessions: number
}

/**
 * A climber's projects, derived from their ascents grouped by route and ordered
 * chronologically:
 * - `open`:      never sent — every ascent is an `attempt`. Once a route has any
 *                non-attempt ascent it can never be open again.
 * - `completed`: the first send was preceded by more than one attempt. Only that
 *                initial run counts (attempts up to and including the first send);
 *                any later attempt/repeat cycle is a separate event and ignored.
 * A route sent with at most one prior attempt was never a project.
 */
export function deriveProjects(ascents: readonly UserAscentDetail[]): {
  completed: ProjectRoute[]
  open: ProjectRoute[]
} {
  const open: ProjectRoute[] = []
  const completed: ProjectRoute[] = []

  for (const [routeFk, group] of groupByRoute(ascents)) {
    // Chronological order so "the first send" and the attempts before it are well
    // defined. ponytail: same-day ties keep insertion order (1 ascent per day in
    // practice, so ties don't arise).
    const ordered = [...group].sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0))
    // First non-attempt = the send that ended the projecting run. Everything before
    // it is an attempt (it's the first non-attempt), so its index is the attempt count.
    const firstSend = ordered.findIndex((ascent) => ascent.type !== 'attempt')

    if (firstSend === -1) {
      const lastSession = ordered.reduce((max, ascent) => Math.max(max, ascent.dateTime ?? 0), 0)
      open.push({ lastSession, routeFk, sessions: ordered.length })
    } else if (firstSend > 1) {
      completed.push({ lastSession: ordered[firstSend].dateTime ?? 0, routeFk, sessions: firstSend + 1 })
    }
  }

  const byRecency = (a: ProjectRoute, b: ProjectRoute): number => b.lastSession - a.lastSession
  open.sort(byRecency)
  completed.sort(byRecency)
  return { completed, open }
}

function groupByRoute(ascents: readonly UserAscentDetail[]): Map<number, UserAscentDetail[]> {
  const byRoute = new Map<number, UserAscentDetail[]>()
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
