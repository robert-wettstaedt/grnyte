import { calcMiddlePoint } from '$lib/components/TopoViewer/components/Route/lib'
import type { Route } from '$lib/db/schema'
import type { NestedArea, NestedAscent, NestedBlock, NestedRoute } from '$lib/db/types'
import { type TopoDTO } from '$lib/topo'

interface WithPathname {
  pathname: string
}

export interface EnrichedArea extends NestedArea, WithPathname {}

/**
 * Enriches a NestedArea object by adding a pathname.
 *
 * @param {NestedArea} area - The area to enrich.
 * @returns {EnrichedArea} The enriched area with a pathname.
 */
export const enrichArea = (area: NestedArea): EnrichedArea => {
  const slugs: string[] = []

  const recursive = (area: NestedArea): EnrichedArea => {
    let parent = area.parent
    if (parent != null) {
      parent = recursive(parent as NestedArea)
    }

    slugs.push(`${area.slug}-${area.id}`)
    const pathname = ['', 'areas', ...slugs].join('/')
    return { ...area, parent, pathname }
  }

  if (area.parent == null) {
    return { ...area, pathname: ['', 'areas', `${area.slug}-${area.id}`].join('/') }
  } else {
    return recursive(area)
  }
}

export interface EnrichedBlock extends NestedBlock, WithPathname {}

/**
 * Enriches a NestedBlock object by adding a pathname and enriching its area.
 *
 * @param {NestedBlock} block - The block to enrich.
 * @returns {EnrichedBlock} The enriched block with a pathname and enriched area.
 */
export const enrichBlock = (block: NestedBlock): EnrichedBlock => {
  const area = enrichArea(block.area as NestedArea)

  const pathname = area.pathname + ['', '_', 'blocks', block.slug].join('/')
  return { ...block, area, pathname }
}

export interface EnrichedRoute extends NestedRoute, WithPathname {}

/**
 * Enriches a NestedRoute object by adding a pathname and enriching its block.
 *
 * @param {NestedRoute} route - The route to enrich.
 * @returns {EnrichedRoute} The enriched route with a pathname and enriched block.
 * @throws Will throw an error if the route cannot be enriched.
 */
export const enrichRoute = (route: NestedRoute): EnrichedRoute => {
  try {
    const block = enrichBlock(route.block as NestedBlock)

    const pathname = block.pathname + ['', 'routes', route.slug.length === 0 ? route.id : route.slug].join('/')
    return { ...route, block, pathname }
  } catch (error) {
    console.log('Unable to enrich route: ', route)
    throw error
  }
}

export interface EnrichedAscent extends Omit<NestedAscent, 'route'> {
  route: EnrichedRoute
}

export const enrichAscent = (ascent: NestedAscent): EnrichedAscent => {
  try {
    const route = enrichRoute(ascent.route as NestedRoute)

    return { ...ascent, route }
  } catch (error) {
    console.log('Unable to enrich ascent: ', ascent)
    throw error
  }
}

export const sortRoutesByTopo = <T extends Route>(routes: T[], topos: TopoDTO[]): T[] => {
  return routes.toSorted((a, b) => {
    const topoIndexA = topos.findIndex((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === a.id))
    const topoIndexB = topos.findIndex((topo) => topo.routes.some((topoRoute) => topoRoute.routeFk === b.id))

    // Sort routes by order of the topo they are in
    if (topoIndexA !== topoIndexB) {
      return topoIndexA - topoIndexB
    }

    const topoRouteA = topos[topoIndexA]?.routes.find((topoRoute) => topoRoute.routeFk === a.id)
    const topoRouteB = topos[topoIndexA]?.routes.find((topoRoute) => topoRoute.routeFk === b.id)

    const meanA = calcMiddlePoint(topoRouteA?.points ?? [])?.x ?? 0
    const meanB = calcMiddlePoint(topoRouteB?.points ?? [])?.x ?? 0

    // Sort routes by the mean x value of the topo
    return meanA - meanB
  })
}
