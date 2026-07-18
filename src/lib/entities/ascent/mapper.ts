import { toMediaFile } from '$lib/entities/file/mapper'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { AscentDetail, RouteAscent, UserAscent } from './dto'

export type AscentRow = QueryRow<typeof queries.ascent>
export type RouteAscentRow = QueryRow<typeof queries.listRouteAscents>
export type UserAscentRow = QueryRow<typeof queries.listUserAscents>

export function toAscentDetail(row: AscentRow): AscentDetail {
  return {
    createdBy: row.createdBy,
    dateTime: row.dateTime ?? undefined,
    files: (row.files ?? []).map((file) => ({ ...toMediaFile(file), ascentCreatedBy: row.createdBy })),
    gradeFk: row.gradeFk ?? undefined,
    humidity: row.humidity ?? undefined,
    id: row.id,
    notes: row.notes ?? '',
    rating: row.rating ?? undefined,
    regionFk: row.regionFk,
    routeFk: row.routeFk,
    temperature: row.temperature ?? undefined,
    type: row.type,
  }
}

export function toRouteAscent(row: RouteAscentRow): RouteAscent {
  return {
    authorName: row.author?.username ?? '',
    createdBy: row.createdBy,
    dateTime: row.dateTime ?? undefined,
    // The ascent's creator owns its media; stamped onto each file so the client can
    // mirror the own-ascent-media RLS grants (edit/delete/visibility). Stamped here,
    // not via a toMediaFile param — see the note on toMediaFile. The `ascent` stamp
    // is what marks the file as beta wherever it renders (thumbnail badge, viewer caption).
    files: (row.files ?? []).map((file) => ({
      ...toMediaFile(file),
      ascent: {
        dateTime: row.dateTime ?? undefined,
        gradeFk: row.gradeFk ?? undefined,
        humidity: row.humidity ?? undefined,
        id: row.id,
        notes: row.notes ?? '',
        rating: row.rating ?? undefined,
        temperature: row.temperature ?? undefined,
        type: row.type,
      },
      ascentCreatedBy: row.createdBy,
    })),
    gradeFk: row.gradeFk ?? undefined,
    humidity: row.humidity ?? undefined,
    id: row.id,
    notes: row.notes ?? '',
    rating: row.rating ?? undefined,
    regionFk: row.regionFk,
    temperature: row.temperature ?? undefined,
    type: row.type,
  }
}

export function toUserAscent(row: UserAscentRow): UserAscent {
  return {
    routeFk: row.routeFk,
    type: row.type,
  }
}
