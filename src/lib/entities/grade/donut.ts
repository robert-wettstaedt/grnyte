import { getGradeColor, UNGRADED_COLOR } from './color'

// Radius chosen so the circumference is exactly 100, letting each arc's length
// be expressed directly as a percentage of the ring.
export const DONUT_RADIUS = 100 / (2 * Math.PI)
export const DONUT_CENTER = DONUT_RADIUS + 2
export const DONUT_STROKE_WIDTH = 4

export interface DonutSegment {
  color: string
  /** Arc length as a fraction of the ring's 100-unit circumference. */
  length: number
  /** Dash offset that walks this arc clockwise from 12 o'clock. */
  dashOffset: number
}

/**
 * Turns per-grade route counts into one ring arc per difficulty-band color
 * (easy → hard), followed by a grey arc for routes with no grade. Shared by the
 * `GradeDonut` component and the map marker SVG so both stay in sync.
 *
 * @param countByGrade route counts keyed by grade id (`gradeFk`).
 * @param total total routes; whatever isn't covered by `countByGrade` is ungraded.
 */
export function computeDonutSegments(countByGrade: Map<number, number>, total: number): DonutSegment[] {
  const byColor = new Map<string, number>()
  for (const [gradeId, count] of [...countByGrade.entries()].sort(([a], [b]) => a - b)) {
    if (count > 0) {
      const color = getGradeColor(gradeId)
      byColor.set(color, (byColor.get(color) ?? 0) + count)
    }
  }

  const entries = [...byColor.entries()]

  // Whatever isn't accounted for by a grade is ungraded; show it as a tail arc.
  const graded = entries.reduce((acc, [, count]) => acc + count, 0)
  const ungraded = Math.max(0, total - graded)
  if (ungraded > 0) {
    entries.push([UNGRADED_COLOR, ungraded])
  }

  const sum = graded + ungraded
  if (sum === 0) {
    return []
  }

  const gap = entries.length > 1 ? 2 : 0
  const available = 100 - gap * entries.length

  let cumulative = 0
  return entries.map(([color, count]) => {
    const length = (count / sum) * available
    const segment = {
      color,
      length,
      // +25 shifts the dash start from 3 o'clock to 12 o'clock; subtracting the
      // running total walks each arc clockwise around the ring.
      dashOffset: 125 - cumulative,
    }
    cumulative += length + gap
    return segment
  })
}

/**
 * Renders the grade donut as a standalone SVG string for use as an OpenLayers
 * marker icon (data URI). Unlike the `GradeDonut` component it carries its own
 * colors and a white backing disc so it reads on top of the map, and draws the
 * centered count inside the SVG rather than as an overlaid element.
 *
 * @param size diameter in pixels.
 */
export function buildGradeDonutSvg(countByGrade: Map<number, number>, total: number, size: number): string {
  const segments = computeDonutSegments(countByGrade, total)
  const c = DONUT_CENTER
  const r = DONUT_RADIUS
  const sw = DONUT_STROKE_WIDTH

  // Font size in viewBox units; longer numbers shrink so they stay inside the hole.
  const fontSize = Math.min(13, 40 / String(total).length)

  const ring = segments
    .map(
      (segment) =>
        `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${segment.color}" stroke-width="${sw}" ` +
        `stroke-dasharray="${segment.length} ${100 - segment.length}" stroke-dashoffset="${segment.dashOffset}"/>`,
    )
    .join('')

  // Dark backing ring (visible through the gaps between arcs) plus a white disc just big
  // enough to fill the hole behind the count, so it reads on top of the map. The ring is
  // dark so the light end of the grade scale (very-easy peach) still contrasts against it.
  const hole = r - sw / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${c * 2} ${c * 2}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#52525b" stroke-width="${sw}"/>` +
    `<circle cx="${c}" cy="${c}" r="${hole}" fill="#ffffff" fill-opacity="0.8"/>` +
    ring +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" ` +
    `font-weight="700" font-size="${fontSize}" fill="#1f2937">${total}</text>` +
    `</svg>`
  )
}
