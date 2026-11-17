import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { toGrade, type GradeRow } from './mapper'

export function gradeList() {
  return psResource(
    (q) => q.from({ g: collections().grades }).orderBy(({ g }) => g.nid, 'asc'),
    [],
    (rows) => rows.map((row) => toGrade(toZeroRow<GradeRow>('grades', row))),
    'essentials',
  )
}
