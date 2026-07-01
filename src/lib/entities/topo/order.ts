import type { TopoLine, TopoView } from './dto'

/** Leftmost x of a line's start holds, falling back to all its points. */
const anchorX = (line: TopoLine): number => {
  const starts = line.points.filter((point) => point.type === 'start')
  const points = starts.length > 0 ? starts : line.points
  return points.length === 0 ? Infinity : Math.min(...points.map((point) => point.x))
}

/**
 * Order routes the way they read across a block's topos: topos in their given
 * order, and within each topo left-to-right by the leftmost start hold. A route's
 * position is its first appearance across the topos; routes drawn on no topo keep
 * their original relative order, after the drawn ones.
 *
 * Cross-topo comparison is safe because the topo index dominates the sort key —
 * an x from one topo's coordinate space is never compared against another's.
 * Generic over `{ id: number }` (matched against `TopoLine.routeId`) so it sorts
 * whatever route shape a caller already has.
 */
export function orderRoutesByTopo<T extends { id: number }>(routes: T[], views: TopoView[]): T[] {
  const key = new Map<number, readonly [topo: number, x: number]>()

  views.forEach((view, topoIndex) => {
    for (const line of view.lines) {
      const x = anchorX(line)
      const prev = key.get(line.routeId)
      if (prev == null || topoIndex < prev[0] || (topoIndex === prev[0] && x < prev[1])) {
        key.set(line.routeId, [topoIndex, x])
      }
    }
  })

  // Array.prototype.sort is stable, so undrawn routes (returning 0 among
  // themselves) keep their input order.
  return [...routes].sort((a, b) => {
    const ka = key.get(a.id)
    const kb = key.get(b.id)
    if (ka == null || kb == null) {
      return Number(ka == null) - Number(kb == null)
    }
    return ka[0] - kb[0] || ka[1] - kb[1]
  })
}
