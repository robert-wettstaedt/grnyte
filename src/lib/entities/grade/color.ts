/**
 * Accessible difficulty scale, easy → hard (band 1 → 4), sampled across most of
 * the magma colormap (t ≈ 0.33–0.94) for the widest separation between tiers.
 * Luminance decreases monotonically across the four bands, so the order survives
 * grayscale and every kind of colour-vision deficiency. Bands 1–3 clear 3:1 on
 * the dark app surface; the hard tier is a deep purple (~1.9:1) — low contrast
 * but still a distinct shape, and the rarest tier. Mirrors the `--grade-1..4`
 * tokens in grnyte.css (foregrounds live there as `--grade-N-fg`) — keep in sync.
 */
export const GRADE_COLORS = ['#fde2a3', '#fa815f', '#c43c75', '#701f81'] as const

/**
 * Neutral colour for routes with no grade — shared by the donut, topo lines and
 * row chips so "ungraded" reads the same everywhere. A desaturated grey keeps it
 * distinct from the saturated tiers; its luminance (~0.55) sits in the gap
 * between the very-easy and easy tiers so it stays distinguishable in grayscale /
 * under monochromacy too (a mid grey would collide with the easy tier). Mirrored
 * by `--grade-ungraded` / `--grade-ungraded-fg` in grnyte.css.
 */
export const UNGRADED_COLOR = '#c4c4c8'

/** Difficulty band of the grade heat scale (1 = very easy → 4 = hard). */
export type GradeBand = 1 | 2 | 3 | 4

/**
 * Buckets a grade into a 1–4 difficulty tier by its ordinal id, following the
 * common Font/V categories: very easy ≤5C (V0–2), easy 6A–7A (V3–6),
 * medium 7A+–7C+ (V7–10), hard ≥8A (V11+). Absolute by design — a 5C reads
 * "very easy" everywhere, regardless of what else a crag holds. Returns
 * `undefined` for an ungraded route, so callers render the neutral colour.
 * ponytail: thresholds are the seeded grade ids (0 = 5A … 21 = 9A); if the
 * grades table is ever reindexed, bucket by the stored V number instead.
 */
export const getGradeBand = (gradeFk: number | undefined | null): GradeBand | undefined => {
  if (gradeFk == null) {
    return undefined
  }
  if (gradeFk <= 2) {
    return 1
  }
  if (gradeFk <= 9) {
    return 2
  }
  if (gradeFk <= 14) {
    return 3
  }
  return 4
}

/**
 * The concrete colour for a grade (the neutral for ungraded), from the same scale
 * as the `--grade-*` tokens. Used where a literal value is needed (SVG donut arcs,
 * the map-marker data-URI, inline histogram bars) rather than the CSS token.
 * Accepts a raw id or any object exposing one, so it can be reused across sites.
 */
export const getGradeColor = (grade: number | { id: number } | undefined | null): string => {
  const band = getGradeBand(typeof grade === 'object' ? grade?.id : grade)
  return band == null ? UNGRADED_COLOR : GRADE_COLORS[band - 1]
}

/** CSS custom-property reference for a band's colour, or the ungraded neutral. */
export const gradeVar = (band: GradeBand | undefined): string =>
  band == null ? 'var(--grade-ungraded)' : `var(--grade-${band})`

/** CSS custom-property reference for a band's readable foreground. */
export const gradeFgVar = (band: GradeBand | undefined): string =>
  band == null ? 'var(--grade-ungraded-fg)' : `var(--grade-${band}-fg)`
