import type { GradingScale } from '$lib/entities/user/dto'
import type { Grade } from './dto'

/**
 * The grade in the user's scale, with the redundant scale prefix stripped
 * (`FB 6A+` → `6A+`). Returns an em-dash for ungraded routes. Shared by every
 * route row so grades read identically across blocks, areas and the routes list.
 */
export function gradeLabel(grades: Grade[], scale: GradingScale, gradeFk: number | undefined | null): string {
  if (gradeFk == null) {
    return '—'
  }
  const value = grades.find((grade) => grade.id === gradeFk)?.[scale]
  if (value == null) {
    return '—'
  }
  return value.startsWith(`${scale} `) ? value.slice(scale.length + 1) : value
}
