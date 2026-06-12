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
