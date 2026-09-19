import type { TopoPoint } from './dto'

interface Point {
  type: TopoPoint['type']
  x: number
  y: number
}

/**
 * Whether a line's points are 0–1 fractions (the current, resolution-independent
 * format: scales with any image size) rather than legacy absolute pixels.
 * ponytail: heuristic, a path is one or the other, and a pixel path never sits
 * entirely within 0–1.5. Revisit if a px-only sub-1.5 convention ever appears.
 */
export const isNormalized = (points: TopoPoint[]): boolean =>
  points.length > 0 && points.every((point) => point.x <= 1.5 && point.y <= 1.5)

/**
 * Convert legacy pixel-space points to 0-1 fractions using the image dimensions.
 * Already-normalized points (and points without known dimensions) pass through
 * unchanged, so this is safe to apply to any committed line before editing it.
 */
export const normalizePoints = (points: TopoPoint[], width?: number, height?: number): TopoPoint[] =>
  isNormalized(points) || width == null || height == null || width <= 0 || height <= 0
    ? points
    : points.map((point) => ({ ...point, x: point.x / width, y: point.y / height }))

/**
 * Whether a line can be safely edited: its points end up cleanly in 0-1 space after normalization.
 * Legacy pixel paths with no (or mismatched) image dimensions can't be normalized, so editing them
 * would mix pixel and fraction coords and Save would overwrite the stored path with garbage: the
 * editor renders those read-only instead. An empty line is trivially editable (nothing to mangle).
 */
export const canEditPoints = (points: TopoPoint[], width?: number, height?: number): boolean =>
  points.length === 0 || isNormalized(normalizePoints(points, width, height))

/** Split points into sub-paths: a new one begins at each `start`. */
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

/**
 * Serialize typed points back into the stored path format (`M x,y L x,y … Z`):
 * the inverse of `convertPathToPoints`. Each `start` opens a sub-path (`M`), the
 * rest are `L`, and a `top` closes its sub-path with a trailing `Z` marker. So a
 * two-hold start reads `M s1 L m1 L top Z M s2`. Coordinates are rounded to 5
 * decimals, matching the precision of existing rows (a fraction of a pixel on
 * any real photo) instead of storing float noise like 0.30000000000000004.
 */
const round5 = (n: number): number => Math.round(n * 100000) / 100000

/** One token of a stored path: a point, or the `Z` that marks the preceding one as a top. */
export type PathToken = 'Z' | { letter: 'L' | 'M'; x: number; y: number }

const tokenRegex = /^([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i

/** The inverse of {@link serializePoints}. `null` means a token this format does not describe,
 *  which callers must treat as unconvertible rather than as an empty path. */
export const parsePathTokens = (path: string): null | PathToken[] => {
  const trimmed = path.trim()
  if (trimmed === '') {
    return []
  }

  const tokens: PathToken[] = []
  for (const token of trimmed.split(/\s+/)) {
    if (token.toUpperCase() === 'Z') {
      tokens.push('Z')
      continue
    }
    const match = tokenRegex.exec(token)
    if (match == null) {
      return null
    }
    tokens.push({ letter: match[1].toUpperCase() as 'L' | 'M', x: Number(match[2]), y: Number(match[3]) })
  }
  return tokens
}

export const serializePoints = (points: TopoPoint[]): string =>
  toSubPaths(points)
    .map((sub) =>
      sub
        .map((point) => {
          // `M` means start hold, not first token: a line whose start is off the photo stores no
          // `M` at all, and writing one would give it a hold it never had.
          const segment = `${point.type === 'start' ? 'M' : 'L'}${round5(point.x)},${round5(point.y)}`
          return point.type === 'top' ? `${segment} Z` : segment
        })
        .join(' '),
    )
    .join(' ')

/** Straight `M…L…` polyline through the points (open, no `Z`). */
const straightPath = (points: Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')

/**
 * Smooth `d` that passes through every point: a Catmull-Rom spline converted to
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

/** Average position of a set of points: the anchor the route line rises from. */
export const centroid = (points: Point[]): Point => ({
  type: 'start',
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
})

/**
 * End-marker `d` for a line's top: an up-arrow for a mantle over the top (`topout`)
 * or a flat cap bar for a finish hold (`top`). `unit` sizes it relative to the image
 * (see `Topo.svelte`). Shared by the viewer and the editor so both draw it the same.
 */
export const topMarkerD = (
  point: { x: number; y: number },
  topType: 'top' | 'topout' | undefined,
  unit: number,
): string => {
  const { x, y } = point
  if (topType === 'topout') {
    return `M${x - unit * 1.3},${y + unit * 0.5} L${x},${y - unit} L${x + unit * 1.3},${y + unit * 0.5}`
  }
  return `M${x - unit * 1.4},${y} L${x + unit * 1.4},${y}`
}

export interface BuiltLine {
  /** Where the guidebook number hangs: under the lowest start hold, or under the lowest point of
   *  the line when the photo does not show the start. Lowest, not first: the two coincide only
   *  once a line's points are in climbed order, which a legacy row need not be. */
  anchor: Point | undefined
  /** Bracket bar joining the start holds (empty for a single-hold start). */
  bracket: string
  /** The route line: one path rising from the centre of the start holds to the top. */
  d: string
  /** The line's start holds, deduped across lines by the caller. EMPTY when the photo does not show
   *  the start: a boulder too big for one frame, a sit start in a cave. Not an error. */
  starts: Point[]
  /** The top-out point, for the end marker. Undefined when the photo does not show the top. */
  top: Point | undefined
}

/**
 * Turn a route's stored points into everything needed to draw it. Normalized 0–1
 * paths are scaled to the image; pixel paths are used as-is.
 *
 * Renders the "bracket + line from centre" style: the start holds are grouped by
 * a bracket bar (drawn once as rings by the caller), and a single line rises from
 * their centroid through the trunk's waypoints to the top. Decoupling the hold
 * grouping from the line keeps shared starts across routes legible: overlapping
 * brackets read cleanly where forks would tangle.
 */
export const buildLine = (points: TopoPoint[], curved: boolean, imgWidth = 1, imgHeight = 1): BuiltLine => {
  const scaleX = isNormalized(points) ? imgWidth : 1
  const scaleY = isNormalized(points) ? imgHeight : 1
  const subPaths = toSubPaths(points).map((sub) =>
    sub.map((point) => ({ type: point.type, x: point.x * scaleX, y: point.y * scaleY })),
  )

  if (subPaths.length === 0) {
    return { anchor: undefined, bracket: '', d: '', starts: [], top: undefined }
  }

  // By TYPE, never by position. A sub-path opens at whatever point comes first, so reading the
  // start off `sub[0]` gave a waypoint a start ring on every line whose start is off the photo.
  const starts = subPaths.flat().filter((point) => point.type === 'start')

  // The trunk is the sub-path that tops out (or the longest); its points above the
  // start hold are the waypoints tracing the climbing line.
  let trunkIndex = subPaths.findIndex((sub) => sub.some((point) => point.type === 'top'))
  if (trunkIndex < 0) {
    trunkIndex = subPaths.reduce((best, sub, index, all) => (sub.length > all[best].length ? index : best), 0)
  }
  const trunk = subPaths[trunkIndex]

  // One line from the centre of the start holds through the trunk's waypoints. A single hold is
  // its own centre; no hold at all and the line simply begins at its first waypoint.
  //
  // Consecutive repeats are dropped: a point stored twice is a zero-length segment, and
  // Catmull-Rom reads one as a direction of nothing, kinking the curve or bulging it past its own
  // end. The points stay in the data, they just stop steering the line twice.
  const linePoints = [
    ...(starts.length > 0 ? [centroid(starts)] : []),
    ...trunk.filter((point) => point.type !== 'start'),
  ].filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y)
  const d = curved ? smoothPath(linePoints) : straightPath(linePoints)

  // Bracket bar across the holds, ordered by x so it never criss-crosses.
  const bracket = starts.length > 1 ? straightPath([...starts].sort((a, b) => a.x - b.x)) : ''

  return {
    // Under the lowest hold, or under the lowest point of the line when there is none.
    anchor:
      starts.length > 0
        ? { type: 'start', x: centroid(starts).x, y: Math.max(...starts.map((point) => point.y)) }
        : linePoints.reduce((lowest, point) => (point.y > lowest.y ? point : lowest), linePoints[0]),
    bracket,
    d,
    starts,
    // Only a point the path TYPED as a top. The old fallback to the last point put a topout arrow
    // on whatever waypoint happened to end the line, on every line whose top is off the photo.
    top: subPaths.flat().find((point) => point.type === 'top'),
  }
}
