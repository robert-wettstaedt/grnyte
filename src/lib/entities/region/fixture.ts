import type { UserRegion } from './dto'
import { emptyRegionSettings } from './settings'

/** A plain membership: `region_user` holding exactly the permissions passed. The input every `can*`
 *  predicate reads. Spread it to override a field. Not imported by the app. */
export function userRegion(regionFk: number, ...permissions: UserRegion['permissions']): UserRegion {
  return {
    layersComplete: true,
    name: `region ${regionFk}`,
    permissions,
    regionFk,
    role: 'region_user',
    settings: emptyRegionSettings(),
    synced: true,
    tagsComplete: true,
  }
}
