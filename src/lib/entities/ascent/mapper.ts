import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { UserAscent } from './dto'

export type UserAscentRow = QueryRow<typeof queries.listUserAscents>

export function toUserAscent(row: UserAscentRow): UserAscent {
  return {
    routeFk: row.routeFk,
    type: row.type,
  }
}
