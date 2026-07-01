import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { TopoLine, TopoPoint, TopoView } from './dto'

/**
 * Parse a stored topo path (`M x,y L x,y … Z`) into typed points. The trailing
 * `Z` is a marker meaning "the last point is the top-out", not a real segment,
 * so it's dropped and that last point is tagged `top`. Coordinates are kept in
 * whatever space they were stored in (0–1 fractions or legacy pixels).
 */
export const convertPathToPoints = (path: string): TopoPoint[] => {
  if (path.trim() === '') {
    return []
  }

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
}

/**
 * The `queries.block` row `toTopoViews` maps — derived from the query's own
 * `.related(...)` chain (topos → routes + file, plus the block's own routes) so
 * the mapper's input can never drift from the query that feeds it.
 */
type BlockRow = QueryRow<typeof queries.block>

export function toTopoViews(block: BlockRow): TopoView[] {
  const routesById = new Map((block.routes ?? []).map((route) => [route.id, route]))

  return (block.topos ?? []).flatMap((topo) => {
    const imagePath = topo.file?.path
    if (imagePath == null) {
      return []
    }

    return [
      {
        id: topo.id,
        imagePath,
        lines: (topo.routes ?? [])
          .filter((tr) => tr.routeFk != null && tr.path != null && tr.path.trim() !== '')
          .map((tr): TopoLine => {
            const route = routesById.get(tr.routeFk!)
            return {
              id: tr.id,
              routeId: tr.routeFk!,
              name: route?.name ?? '',
              topType: tr.topType,
              gradeFk: route?.gradeFk ?? undefined,
              points: convertPathToPoints(tr.path!),
            }
          })
          .filter((line) => line.points.length > 0),
      },
    ]
  })
}

/**
 * Find which topo to show for a single route. A route can be drawn on several
 * topos; pick the one where its line has the most points (the most complete
 * drawing), falling back to the first match.
 */
export function selectTopoForRoute(views: TopoView[], routeId: number): { view: TopoView; line: TopoLine } | undefined {
  let best: { view: TopoView; line: TopoLine } | undefined

  for (const view of views) {
    const line = view.lines.find((candidate) => candidate.routeId === routeId)
    if (line != null && (best == null || line.points.length > best.line.points.length)) {
      best = { view, line }
    }
  }

  return best
}
