import type { AreaDetail } from '$lib/entities/area/dto'
import type { BlockListItem } from '$lib/entities/block/dto'
import type { DisplayName } from '$lib/entities/displayName'
import type { RouteListItem } from '$lib/entities/route/dto'
import type { UserListItem } from '$lib/entities/user/dto'
import { entityCrumbs, type EntityCandidate } from './search.svelte'

/**
 * Maps entity DTOs to search candidates, for readers that go through the entity functions (recent items,
 * references, the PowerSync search). `search.svelte.ts`'s `entityMappers` maps raw Zero rows instead.
 * `regionCrumb` names a region in the crumbs, as there.
 */
export function entityItemMappers(regionCrumb?: (regionFk: number) => DisplayName | undefined) {
  const region = (regionFk: null | number | undefined) => (regionFk == null ? undefined : regionCrumb?.(regionFk))
  const crumbs = (regionFk: null | number | undefined, rest: Array<DisplayName | null | undefined>) =>
    entityCrumbs(region(regionFk), rest)

  return {
    areas: (area: AreaDetail): EntityCandidate => ({
      context: crumbs(area.regionFk, [area.areas.at(-1)?.name]),
      id: area.id,
      label: area.name,
      type: 'areas',
    }),

    blocks: (block: BlockListItem): EntityCandidate => ({
      context: crumbs(block.regionFk, [block.areas.at(-1)?.name]),
      id: block.id,
      label: block.name,
      type: 'blocks',
    }),

    routes: (route: RouteListItem): EntityCandidate => ({
      context: crumbs(route.regionFk, [route.areaName, route.blockName]),
      id: route.id,
      label: route.name,
      type: 'routes',
    }),

    users: (user: UserListItem): EntityCandidate => ({
      // A user isn't in one place, so its crumb is the region(s) it shares with the searcher: only shown when
      // `regionCrumb` opts in.
      context: crumbs(
        null,
        user.regionFks.map((regionFk) => regionCrumb?.(regionFk)),
      ),
      id: user.id,
      label: user.username,
      type: 'users',
    }),
  }
}
