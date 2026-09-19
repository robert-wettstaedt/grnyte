import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { Grade } from './dto'

export type GradeRow = QueryRow<typeof queries.listGrades>

export function toGrade(row: GradeRow): Grade {
  return {
    FB: row.FB ?? undefined,
    id: row.id,
    V: row.V ?? undefined,
  }
}
