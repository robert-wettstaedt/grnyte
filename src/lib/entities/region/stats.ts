import type { DisplayName } from '$lib/entities/displayName'
import type { AssignableRole } from '$lib/entities/rolePermission/dto'

/** How many months of activity the chart shows, ending with the current one. */
export const ACTIVITY_MONTHS = 12

/** One month of the activity chart. `month` is the UTC first-of-month epoch millis. */
export interface ActivityMonth {
  count: number
  month: number
}

/** Active members per role. Every assignable role is present, zero included. */
export type MemberSplit = Record<AssignableRole, number>

/** A region's numbers, as the stats page renders them. Identical for a member and an app admin. */
export interface RegionStats {
  activityByMonth: ActivityMonth[]
  ascents: number
  blocks: number
  /** Blocks with no coordinates, so nothing to draw on the map. */
  blocksWithoutCoordinates: number
  /** Distinct people who did anything in the activity window. */
  contributors: number
  /** Shown in place of `lastActivityAt` when a region has no events yet. */
  createdAt: number
  /** Route counts keyed by community grade (`routes.user_grade_fk`). */
  gradeCounts: Map<number, number>
  lastActivityAt: number | undefined
  maxMembers: number
  members: MemberSplit
  name: DisplayName
  pendingInvitations: number
  photos: number
  regionFk: number
  routes: number
  /** Live routes with no line drawn on any topo. */
  routesWithoutTopo: number
  sectors: number
  /** Routes carrying no community grade. */
  ungraded: number
  videos: number
}

/** A region as the app-admin list shows it. */
export interface RegionSummary {
  id: number
  lastActivityAt: number | undefined
  members: number
  name: DisplayName
}

/**
 * The {@link ACTIVITY_MONTHS} months ending with `now`'s, oldest first, with `counts` filled in.
 * A month nobody touched has to be a zero bar rather than a missing one, or a quiet region
 * renders as a narrower chart instead of a flat one.
 */
export function activityMonths(counts: Map<number, number>, now: Date | number): ActivityMonth[] {
  const end = new Date(monthStart(now))
  const months: ActivityMonth[] = []

  for (let offset = ACTIVITY_MONTHS - 1; offset >= 0; offset--) {
    const month = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - offset, 1)
    months.push({ count: counts.get(month) ?? 0, month })
  }

  return months
}

/** The oldest month the chart shows, i.e. how far back the activity query has to read. */
export function activityWindowStart(now: Date | number): number {
  const end = new Date(monthStart(now))
  return Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (ACTIVITY_MONTHS - 1), 1)
}

/** Every assignable role at zero, so a role nobody holds still renders as a row. */
export function emptyMemberSplit(): MemberSplit {
  return { region_admin: 0, region_maintainer: 0, region_user: 0 }
}

/** The UTC first-of-month millis for `at`, the bucket key the activity chart is keyed on. */
export function monthStart(at: Date | number): number {
  const date = new Date(at)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
}
