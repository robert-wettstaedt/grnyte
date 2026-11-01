import type { RouteListFilter } from '$lib/entities/route/resources.svelte'
import type { ParsedRouteFilter } from './filter'

type Counts = { gradeCountByBlock: Map<number, Map<number, number>>; routeCountByBlock: Map<number, number> }
type GradeRange = Pick<RouteListFilter, 'maxGrade' | 'minGrade'>

const isRanged = (range: GradeRange) => range.minGrade != null || range.maxGrade != null
const inRange = (range: GradeRange, grade: number) =>
  (range.minGrade == null || grade >= range.minGrade) && (range.maxGrade == null || grade <= range.maxGrade)

interface SummaryBlock {
  gradeCounts: Map<number, number>
  id: number
  routeCount: number
}

/** Whether the blocks' grade summaries alone answer this filter: none, a grade range, and "not sent yet" (the
 *  summary minus the reader's own sends, see {@link withoutRoutes}). */
export function answersFromSummary(parsed: ParsedRouteFilter): boolean {
  if ((parsed.ascentStatus !== undefined && parsed.ascentStatus !== 'todo') || parsed.favoritesOnly) return false
  return Object.entries(parsed.filter).every(
    ([key, value]) => value === undefined || key === 'minGrade' || key === 'maxGrade',
  )
}

/** The map's per-block counts from the summaries, the shape `createExploreMapData` built from route rows.
 *  A block with nothing to count is absent, which is how the narrowing reads "holds no matching route". */
export function countsFromSummary(blocks: readonly SummaryBlock[], range: GradeRange): Counts {
  const ranged = isRanged(range)
  const gradeCountByBlock = new Map<number, Map<number, number>>()
  const routeCountByBlock = new Map<number, number>()
  for (const block of blocks) {
    const grades = ranged
      ? new Map([...block.gradeCounts].filter(([grade]) => inRange(range, grade)))
      : block.gradeCounts
    // Ungraded routes count only without a range, as the route query's `>=`/`<=` drops a null grade.
    const total = ranged ? [...grades.values()].reduce((sum, n) => sum + n, 0) : block.routeCount
    if (total === 0) continue
    routeCountByBlock.set(block.id, total)
    gradeCountByBlock.set(block.id, grades)
  }
  return { gradeCountByBlock, routeCountByBlock }
}

/** {@link countsFromSummary}'s counts less `routes` (the reader's sends), for "not sent yet". A route the range
 *  already left out is skipped, and a block left with nothing is dropped. */
export function withoutRoutes(
  counts: Counts,
  routes: readonly { blockFk: number; gradeFk: number | undefined }[],
  range: GradeRange,
): Counts {
  const routeCountByBlock = new Map(counts.routeCountByBlock)
  const gradeCountByBlock = new Map([...counts.gradeCountByBlock].map(([id, grades]) => [id, new Map(grades)]))
  for (const { blockFk, gradeFk } of routes) {
    if (!inGradeRange(range, gradeFk)) continue
    const total = routeCountByBlock.get(blockFk)
    if (total == null) continue
    if (total <= 1) {
      routeCountByBlock.delete(blockFk)
      gradeCountByBlock.delete(blockFk)
      continue
    }
    routeCountByBlock.set(blockFk, total - 1)
    const grades = gradeCountByBlock.get(blockFk)
    const n = gradeFk == null ? undefined : grades?.get(gradeFk)
    if (grades == null || gradeFk == null || n == null) continue
    if (n <= 1) grades.delete(gradeFk)
    else grades.set(gradeFk, n - 1)
  }
  return { gradeCountByBlock, routeCountByBlock }
}

/** Whether one route's community grade passes the range, as the route query's `>=`/`<=` would. */
export const inGradeRange = (range: GradeRange, gradeFk: number | undefined): boolean =>
  !isRanged(range) || (gradeFk != null && inRange(range, gradeFk))
