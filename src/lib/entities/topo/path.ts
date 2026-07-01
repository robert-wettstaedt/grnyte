import type { TopoPoint } from './dto'

interface Point {
  type: TopoPoint['type']
  x: number
  y: number
}

/**
 * Whether a line's points are 0–1 fractions (the current, resolution-independent
 * format — scales with any image size) rather than legacy absolute pixels.
 * ponytail: heuristic — a path is one or the other, and a pixel path never sits
 * entirely within 0–1.5. Revisit if a px-only sub-1.5 convention ever appears.
 */
export const isNormalized = (points: TopoPoint[]): boolean =>
  points.length > 0 && points.every((point) => point.x <= 1.5 && point.y <= 1.5)

/** Split points into sub-paths — a new one begins at each `start`. */
const toSubPaths = (points: Point[]): Point[][] => {
  const subPaths: Point[][] = []
  for (const point of points) {
    if (point.type === 'start' || subPaths.length === 0) {
      subPaths.push([point])
    } else {
      subPaths[subPaths.length - 1].push(point)
    }
  }
  return subPaths
}

/** Straight `M…L…` polyline through the points (open, no `Z`). */
const straightPath = (points: Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')

/**
 * Smooth `d` that passes through every point — a Catmull-Rom spline converted to
 * cubic béziers, so the line reads as a natural climbing line. Two points come
 * out straight; ponytail: uniform Catmull-Rom can overshoot on sharp kinks, swap
 * the /6 control math for a centripetal variant if a line bulges off-rock.
 */
const smoothPath = (points: Point[]): string => {
  if (points.length === 0) {
    return ''
  }

  let d = `M${points[0].x},${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }

  return d
}

/** Average position of a set of points — the anchor the route line rises from. */
const centroid = (points: Point[]): Point => ({
  type: 'start',
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
})

export interface BuiltLine {
  /** The route line: one path rising from the centre of the start holds to the top. */
  d: string
  /** Bracket bar joining the start holds (empty for a single-hold start). */
  bracket: string
  /** One point per sub-path — each a starting handhold (deduped across lines by the caller). */
  starts: Point[]
  /** The top-out point, for the end marker. */
  top: Point | undefined
}

/**
 * Turn a route's stored points into everything needed to draw it. Normalized 0–1
 * paths are scaled to the image; pixel paths are used as-is.
 *
 * Renders the "bracket + line from centre" style: the start holds are grouped by
 * a bracket bar (drawn once as rings by the caller), and a single line rises from
 * their centroid through the trunk's waypoints to the top. Decoupling the hold
 * grouping from the line keeps shared starts across routes legible — overlapping
 * brackets read cleanly where forks would tangle.
 */
export const buildLine = (points: TopoPoint[], curved: boolean, imgWidth = 1, imgHeight = 1): BuiltLine => {
  const scaleX = isNormalized(points) ? imgWidth : 1
  const scaleY = isNormalized(points) ? imgHeight : 1
  const subPaths = toSubPaths(points).map((sub) =>
    sub.map((point) => ({ type: point.type, x: point.x * scaleX, y: point.y * scaleY })),
  )

  if (subPaths.length === 0) {
    return { d: '', bracket: '', starts: [], top: undefined }
  }

  const starts = subPaths.map((sub) => sub[0])

  // The trunk is the sub-path that tops out (or the longest); its points above the
  // start hold are the waypoints tracing the climbing line.
  let trunkIndex = subPaths.findIndex((sub) => sub.some((point) => point.type === 'top'))
  if (trunkIndex < 0) {
    trunkIndex = subPaths.reduce((best, sub, index, all) => (sub.length > all[best].length ? index : best), 0)
  }
  const trunk = subPaths[trunkIndex]

  // One line from the centre of the start holds through the trunk's waypoints. A
  // single-hold start has no centre to compute, so it rises straight from the hold.
  const linePoints = starts.length > 1 ? [centroid(starts), ...trunk.slice(1)] : trunk
  const d = curved ? smoothPath(linePoints) : straightPath(linePoints)

  // Bracket bar across the holds, ordered by x so it never criss-crosses.
  const bracket = starts.length > 1 ? straightPath([...starts].sort((a, b) => a.x - b.x)) : ''

  const allPoints = subPaths.flat()
  return {
    d,
    bracket,
    starts,
    top: allPoints.length > 1 ? (trunk.find((point) => point.type === 'top') ?? trunk.at(-1)) : undefined,
  }
}
