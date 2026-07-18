import type { AscentType, UserAscent } from './dto'

/**
 * Display priority when a route has several ascents: a repeat outranks the
 * original send, and having sent outranks a later attempt on the same route.
 */
const PRIORITY: Record<AscentType, number> = { attempt: 1, flash: 3, repeat: 4, send: 2 }

/** The highest-priority ascent type per route — the tick a route row shows. */
export function ascentStatusByRoute(ascents: readonly UserAscent[]): Map<number, AscentType> {
  const byRoute = new Map<number, AscentType>()
  for (const ascent of ascents) {
    const current = byRoute.get(ascent.routeFk)
    if (current == null || PRIORITY[ascent.type] > PRIORITY[current]) {
      byRoute.set(ascent.routeFk, ascent.type)
    }
  }
  return byRoute
}
