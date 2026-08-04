import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { TopoLine, TopoPoint, TopoView } from './dto'

/**
 * Parse a stored topo path (`M x,y L x,y … Z`) into typed points. The trailing
 * `Z` is a marker meaning "the last point is the top-out", not a real segment,
 * so it's dropped and that last point is tagged `top`. Coordinates are kept in
 * whatever space they were stored in (0–1 fractions or legacy pixels).
 *
 * A path it cannot read is no line rather than an exception: every caller already
 * drops empty ones, and one of them is the feed, which parses paths decoded off an
 * activity row. There a throw takes down the whole card, and the row is broadcast to
 * everyone in the region rather than shown only on the block that owns it.
 */
export const convertPathToPoints = (path: string): TopoPoint[] => {
  if (path.trim() === '') {
    return []
  }

  try {
    return path
      .toUpperCase()
      .split(' ')
      .flatMap((point, index, points) => {
        const typeRaw = point[0]
        if (typeRaw === 'Z') {
          return []
        }

        const type = (() => {
          const nextTypeRaw = points[index + 1]?.[0]
          if (nextTypeRaw === 'Z') {
            return 'top' as const
          }

          switch (typeRaw) {
            case 'M':
              return 'start' as const
            case 'L':
              return 'middle' as const
            default:
              throw new Error(`Unsupported point type: ${point}`)
          }
        })()

        const [xRaw, yRaw] = point.substring(1).split(',')
        const x = Number(xRaw)
        const y = Number(yRaw)

        if (Number.isNaN(x) || Number.isNaN(y)) {
          throw new Error(`Invalid point: ${point}`)
        }

        return [{ id: crypto.randomUUID?.() ?? String(Math.random()), type, x, y }]
      })
  } catch {
    return []
  }
}

/**
 * The row `toTopoViews` maps — derived from the query's own `.related(...)` chain (topos →
 * routes + file, plus the block's own routes) so the mapper's input can never drift from
 * the query that feeds it.
 *
 * Taken off `blockTopos` rather than `block`, because it is the narrower of the two: a
 * `queries.block` row satisfies it with room to spare, while pinning to `block` would make
 * every other caller fetch that query's extra relations to typecheck.
 */
type BlockRow = QueryRow<typeof queries.blockTopos>

/**
 * Find which topo to show for a single route. A route can be drawn on several
 * topos; pick the one where its line has the most points (the most complete
 * drawing), falling back to the first match.
 */
/**
 * From a route's own `topoRoutes` rows, pick the most complete drawn line and its
 * image — the thumbnail a route row shows. Mirrors {@link selectTopoForRoute}'s
 * "most points wins", but reads straight off the route (no block context needed).
 */
export function routeTopoThumb(
  topoRoutes: readonly { path: null | string; topo?: null | { file?: null | { path: null | string } } }[],
): undefined | { imagePath: string; points: TopoPoint[] } {
  let best: undefined | { imagePath: string; points: TopoPoint[] }
  for (const tr of topoRoutes) {
    const imagePath = tr.topo?.file?.path
    if (tr.path == null || tr.path.trim() === '' || imagePath == null) {
      continue
    }
    const points = convertPathToPoints(tr.path)
    if (points.length > 0 && (best == null || points.length > best.points.length)) {
      best = { imagePath, points }
    }
  }
  return best
}

export function selectTopoForRoute(views: TopoView[], routeId: number): undefined | { line: TopoLine; view: TopoView } {
  let best: undefined | { line: TopoLine; view: TopoView }

  for (const view of views) {
    const line = view.lines.find((candidate) => candidate.routeId === routeId)
    if (line != null && (best == null || line.points.length > best.line.points.length)) {
      best = { line, view }
    }
  }

  return best
}

export function toTopoViews(block: Pick<BlockRow, 'routes' | 'topos'>): TopoView[] {
  const routesById = new Map((block.routes ?? []).map((route) => [route.id, route]))

  return (block.topos ?? []).flatMap((topo) => {
    const imagePath = topo.file?.path
    if (imagePath == null) {
      return []
    }

    return [
      {
        id: topo.id,
        imageHeight: topo.file?.height ?? undefined,
        imagePath,
        imageWidth: topo.file?.width ?? undefined,
        lines: (topo.routes ?? [])
          // `routesById` holds only the block's live routes (the query filters deletedAt), so a
          // row whose route is missing here belongs to a soft-deleted route — drop it, or it
          // renders as a nameless grey ghost line that survives "Delete route everywhere".
          .filter((tr) => tr.routeFk != null && tr.path != null && tr.path.trim() !== '' && routesById.has(tr.routeFk))
          .map((tr): TopoLine => {
            const route = routesById.get(tr.routeFk!)
            return {
              gradeFk: route?.userGradeFk ?? undefined,
              id: tr.id,
              name: route?.name ?? '',
              points: convertPathToPoints(tr.path!),
              routeId: tr.routeFk!,
              topType: tr.topType,
            }
          })
          .filter((line) => line.points.length > 0),
      },
    ]
  })
}
