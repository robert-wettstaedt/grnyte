import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { Grade } from './dto'

export type GradeRow = QueryRow<typeof queries.listGrades>

export function toGrade(row: GradeRow): Grade {
  return {
    id: row.id,
    FB: row.FB ?? undefined,
    V: row.V ?? undefined,
  }
}
