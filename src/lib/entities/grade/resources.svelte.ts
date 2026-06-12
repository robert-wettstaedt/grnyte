import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toGrade } from './mapper'

export function gradeList() {
  return createResource(
    () => queries.listGrades(),
    (rows) => rows.map(toGrade),
  )
}
