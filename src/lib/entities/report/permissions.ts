import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
import { canModerate } from '$lib/entities/moderation/permissions'
import type { UserRegion } from '$lib/entities/region/dto'

/** A member or maintainer, on someone else's content. An admin removes instead. */
export function canReport(
  userRegions: UserRegion[],
  userFk: number | undefined,
  target: { authorFk: null | number | undefined; regionFk: number },
): boolean {
  return (
    target.authorFk !== userFk &&
    !canModerate(userRegions, target.regionFk) &&
    checkRegionPermission(userRegions, [REGION_PERMISSION_READ], target.regionFk)
  )
}
