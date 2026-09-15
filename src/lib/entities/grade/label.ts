import type { GradingScale } from '$lib/entities/user/dto'
import type { Grade } from './dto'

/** One choice in a grade picker: what it reads, and the grade it stores. */
export interface GradeRung {
  /** The grade id this rung writes. */
  id: number
  label: string
}

/** The `grades` index range one rung covers, both ends inclusive. */
export interface RungSpan {
  first: number
  last: number
}

/**
 * The grade in the user's scale, with the redundant scale prefix stripped
 * (`FB 6A+` → `6A+`). Returns an em-dash for ungraded routes. Shared by every
 * route row so grades read identically across blocks, areas and the routes list.
 */
export function gradeLabel(grades: Grade[], scale: GradingScale, gradeFk: null | number | undefined): string {
  if (gradeFk == null) {
    return '—'
  }
  const value = grades.find((grade) => grade.id === gradeFk)?.[scale]
  if (value == null) {
    return '—'
  }
  return value.startsWith(`${scale} `) ? value.slice(scale.length + 1) : value
}

/**
 * Where each rung starts and ends in `grades`. A lower bound takes `first` and an upper bound
 * `last`, or "up to V8" excludes 7B+. Pass `scaleRungs` without `current`, which would move a bound.
 */
export function rungSpans(grades: Grade[], rungs: GradeRung[]): RungSpan[] {
  const starts = rungs.map((rung) => grades.findIndex((grade) => grade.id === rung.id))
  return starts.map((first, index) => ({ first, last: (starts[index + 1] ?? grades.length) - 1 }))
}

/**
 * The rungs a scale offers, one per distinct label (Font 25, V 21), each storing the grade the
 * conversion charts name. The picked `current` is adopted by its rung, so the collapse loses nothing.
 */
export function scaleRungs(grades: Grade[], scale: GradingScale, current?: null | number): GradeRung[] {
  const rungs: GradeRung[] = []
  for (const grade of grades) {
    const label = gradeLabel(grades, scale, grade.id)
    const open = rungs.at(-1)
    if (open?.label === label) {
      if (grade.id === current) {
        open.id = current
      }
      continue
    }
    rungs.push({ id: grade.id, label })
  }
  return rungs
}
