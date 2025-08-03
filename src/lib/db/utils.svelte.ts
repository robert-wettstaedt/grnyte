import type { RowWithRelations } from '$lib/db/zero'

/**
 * The maximum depth for nesting areas.
 *
 * @constant {number}
 */
export const MAX_AREA_NESTING_DEPTH = 4

type WithPathname<T> = T & {
  pathname: string
}

/**
 * Enriches a NestedArea object by adding a pathname.
 */
export function areaWithPathname<T extends RowWithRelations<'areas', { parent: true }>>(area: T): WithPathname<T> {
  const slugs: string[] = []

  const recursive = (area: T): WithPathname<T> => {
    let parent = area.parent
    if (parent != null) {
      parent = recursive(parent as T)
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

/**
 * Enriches a NestedBlock object by adding a pathname and enriching its area.
 */
export function blockWithPathname<T extends RowWithRelations<'blocks', { area: true }>>(
  block: T,
): WithPathname<T> | null {
  if (block.area == null) {
    return null
  }

  const area = areaWithPathname(block.area as RowWithRelations<'areas', { parent: true }>)

  const pathname = area.pathname + ['', '_', 'blocks', block.slug].join('/')
  return { ...block, area, pathname }
}

/**
 * Enriches a NestedRoute object by adding a pathname and enriching its block.
 */
export function routeWithPathname<T extends RowWithRelations<'routes', { block: true }>>(
  route: T,
): WithPathname<T> | null {
  if (route.block == null) {
    return null
  }

  const block = blockWithPathname(route.block as RowWithRelations<'blocks', { area: true }>)

  if (block == null) {
    return null
  }

  const pathname = block.pathname + ['', 'routes', route.slug.length === 0 ? route.id : route.slug].join('/')
  return { ...route, block, pathname }
}

/**
 * Enriches a NestedAscent object by adding a pathname and enriching its route.
 */
export function ascentWithPathname<T extends RowWithRelations<'ascents', { route: true }>>(
  ascent: T,
): WithPathname<T> | null {
  if (ascent.route == null) {
    return null
  }

  const block = routeWithPathname(ascent.route as RowWithRelations<'routes', { block: true }>)

  if (block == null) {
    return null
  }

  const pathname = block.pathname + ['', 'ascents', ascent.id].join('/')
  return { ...ascent, block, pathname }
}
