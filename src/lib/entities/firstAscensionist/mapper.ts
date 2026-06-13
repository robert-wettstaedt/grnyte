import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { FirstAscensionist } from './dto'

export type FirstAscensionistRow = QueryRow<typeof queries.listFirstAscensionists>

export function toFirstAscensionist(row: FirstAscensionistRow): FirstAscensionist {
  return {
    id: row.id,
    name: row.name,
    userFk: row.userFk ?? undefined,
  }
}
