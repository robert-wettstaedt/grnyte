import type { RouteAscent } from './dto'

/**
 * Newest-first split of a route's ascents into the signed-in climber's own and
 * everyone else's. The single source for the sort order and the ownership rule,
 * shared by the route detail preview and the full ascent list.
 */
export function splitAscents(
  ascents: readonly RouteAscent[],
  userId: number | undefined,
): { mine: RouteAscent[]; community: RouteAscent[] } {
  const mine: RouteAscent[] = []
  const community: RouteAscent[] = []
  const sorted = [...ascents].sort((a, b) => (b.dateTime ?? 0) - (a.dateTime ?? 0))
  for (const ascent of sorted) {
    ;(userId != null && ascent.createdBy === userId ? mine : community).push(ascent)
  }
  return { mine, community }
}
