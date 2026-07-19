import type { UserAscentDetail } from './dto'
import { ascentStatusByRoute } from './status'

export interface ProfileStats {
  /** Distinct days climbed. */
  daysOut: number
  /** Highest community grade among sent routes, or undefined when nothing is sent. */
  hardestGradeFk: number | undefined
  /** Distinct routes with a non-attempt tick. */
  sends: number
}

/** Headline numbers for the profile header, derived from a user's ascents. */
export function deriveStats(ascents: readonly UserAscentDetail[]): ProfileStats {
  const status = ascentStatusByRoute(ascents)
  const grades = routeGrades(ascents)
  const days = new Set<number>()
  for (const ascent of ascents) {
    if (ascent.dateTime != null) {
      days.add(ascent.dateTime)
    }
  }

  let sends = 0
  let hardestGradeFk: number | undefined
  for (const [routeFk, type] of status) {
    if (type === 'attempt') {
      continue
    }
    sends += 1
    const grade = grades.get(routeFk)
    // Grade ids run low → high, so the largest id is the hardest.
    if (grade != null && (hardestGradeFk == null || grade > hardestGradeFk)) {
      hardestGradeFk = grade
    }
  }

  return { daysOut: days.size, hardestGradeFk, sends }
}

/**
 * Route counts per community grade (grade id → count), one vote per route via its
 * best tick — the grade histogram's input. `flashOnly` narrows to routes flashed;
 * otherwise every sent route (any non-attempt tick) counts. Ungraded routes drop out.
 */
export function gradeCounts(ascents: readonly UserAscentDetail[], flashOnly: boolean): Map<number, number> {
  const status = ascentStatusByRoute(ascents)
  const grades = routeGrades(ascents)
  const counts = new Map<number, number>()
  for (const [routeFk, type] of status) {
    const counted = flashOnly ? type === 'flash' : type !== 'attempt'
    if (!counted) {
      continue
    }
    const grade = grades.get(routeFk)
    if (grade == null) {
      continue
    }
    counts.set(grade, (counts.get(grade) ?? 0) + 1)
  }
  return counts
}

/** First-seen community grade per route (`routeGradeFk`). */
function routeGrades(ascents: readonly UserAscentDetail[]): Map<number, number | undefined> {
  const byRoute = new Map<number, number | undefined>()
  for (const ascent of ascents) {
    if (!byRoute.has(ascent.routeFk)) {
      byRoute.set(ascent.routeFk, ascent.routeGradeFk)
    }
  }
  return byRoute
}
