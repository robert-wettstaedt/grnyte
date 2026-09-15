import type { RouteListRow } from '$lib/entities/route/mapper'
import { m } from '$lib/paraglide/messages'
import { describe, expect, it } from 'vitest'
import { entityMappers } from './search.svelte'

// The picker lists must never print a blank row: names come from the entity mappers,
// which own the "unnamed route" and "Block <order>" fallbacks.
describe('entityMappers', () => {
  const map = entityMappers()

  const blockRow = { area: undefined, id: 7, name: '', order: 0, regionFk: 2 }

  const routeRow = {
    block: { area: undefined, id: 5, name: '', order: 2 },
    blockFk: 5,
    createdAt: null,
    createdBy: 1,
    description: null,
    firstAscents: [],
    firstAscentYear: null,
    gradeFk: null,
    id: 9,
    name: '',
    rating: null,
    regionFk: 2,
    tags: [],
    topoRoutes: [],
    userGradeFk: null,
    userRating: null,
  } as unknown as RouteListRow

  it('labels a nameless route with the unnamed placeholder', () => {
    expect(map.routes(routeRow).label).toBe(m.common_unnamed())
  })

  it('labels a nameless block by its order', () => {
    expect(map.blocks(blockRow).label).toBe(`${m.common_block()} 1`)
  })

  it('uses the same block fallback in a route crumb', () => {
    expect(map.routes(routeRow).context).toEqual([`${m.common_block()} 3`])
  })
})
