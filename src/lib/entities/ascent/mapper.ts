import { toMediaFile } from '$lib/entities/file/mapper'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RouteAscent, UserAscent } from './dto'

export type UserAscentRow = QueryRow<typeof queries.listUserAscents>
export type RouteAscentRow = QueryRow<typeof queries.listRouteAscents>

export function toUserAscent(row: UserAscentRow): UserAscent {
  return {
    routeFk: row.routeFk,
    type: row.type,
  }
}

export function toRouteAscent(row: RouteAscentRow): RouteAscent {
  return {
    id: row.id,
    gradeFk: row.gradeFk ?? undefined,
    // The ascent's creator owns its media; stamped onto each file so the client can
    // mirror the own-ascent-media RLS grants (edit/delete/visibility). Stamped here,
    // not via a toMediaFile param — see the note on toMediaFile.
    files: (row.files ?? []).map((file) => ({ ...toMediaFile(file), ascentCreatedBy: row.createdBy })),
  }
}
