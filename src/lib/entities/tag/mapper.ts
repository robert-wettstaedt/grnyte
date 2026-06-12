import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { Tag } from './dto'

export type TagRow = QueryRow<typeof queries.listTags>

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
  }
}
