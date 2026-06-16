/**
 * Maps a grade to a difficulty-band color, keyed off its ordinal id:
 * amber (easy) → red (hard) → purple (very hard). Accepts a raw id, a `Grade`
 * DTO, or any object exposing an `id` so it can be reused across call sites.
 */
export const getGradeColor = (grade: number | { id: number }): string => {
  const id = typeof grade === 'number' ? grade : grade.id

  if (id < 7) {
    return '#f59e0b'
  }
  if (id < 14) {
    return '#b91c1c'
  }
  return '#581c87'
}

/**
 * Maps a grade to a 1–7 heat-scale band (1 = easy → 7 = hard) by its ordinal
 * position within the full, low→high ordered grade list, so the bands spread
 * evenly across whatever grades exist. Drives the `--grade-{1..7}` tokens used
 * by the EntityRow primitives. Unknown or missing grades fall back to band 1.
 */
export const getGradeBand = (
  gradeFk: number | undefined,
  grades: readonly { id: number }[],
): 1 | 2 | 3 | 4 | 5 | 6 | 7 => {
  const index = gradeFk == null ? -1 : grades.findIndex((grade) => grade.id === gradeFk)
  if (index < 0 || grades.length === 0) {
    return 1
  }
  const band = Math.ceil(((index + 1) / grades.length) * 7)
  return Math.min(7, Math.max(1, band)) as 1 | 2 | 3 | 4 | 5 | 6 | 7
}
