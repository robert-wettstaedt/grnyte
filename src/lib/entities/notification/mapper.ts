import { objectOf } from '$lib/entities/event/dto'
import type { EventEntity } from '$lib/entities/event/entity'
import { toEventEntity } from '$lib/entities/event/mapper'
import type { RegionMembership } from '$lib/entities/region/dto'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { NotificationListItem } from './dto'

export type NotificationRow = QueryRow<typeof queries.listNotifications>

export function toNotification(row: NotificationRow, userRegions: RegionMembership[]): NotificationListItem {
  return {
    actorFk: row.actorFk,
    actorName: row.actor?.username ?? '',
    // `created_at` carries a DB default, which Zero types as nullable; it never is.
    createdAt: row.createdAt ?? 0,
    // The row the inbox draws, built by the function the feed's cards are built with, off the same
    // six relations. A row whose object was already gone when the columns were backfilled carries
    // none, which reads as no row rather than as a tombstone: there is nothing left to name.
    entity: entityOf(row, userRegions),
    eventFk: row.eventFk ?? undefined,
    id: row.id,
    metadata: row.metadata ?? undefined,
    // What the row is ABOUT, as the ref the caption hands to the entity row. Derived from whichever
    // of the columns is set rather than stored twice.
    object: objectOf(row),
    reactionFk: row.reactionFk ?? undefined,
    readAt: row.readAt ?? undefined,
    regionFk: row.regionFk,
    sourceType: row.sourceType,
  }
}

/** `file` is never nested (see `queries.ts`), so the relation set is the other five. */
function entityOf(row: NotificationRow, userRegions: RegionMembership[]): EventEntity | undefined {
  return toEventEntity(
    {
      area: row.area,
      // An inbox row draws no media, so the ascent's files are neither synced nor read: a
      // notification is one line saying something happened, and the ascent's own screen is a tap
      // away. Spliced in empty because the shared builder reads the same shape a card does.
      ascent: row.ascent == null ? undefined : { ...row.ascent, files: [] },
      block: row.block,
      file: undefined,
      metadata: row.metadata,
      route: row.route,
      subject: row.subject,
    },
    userRegions,
  )
}
