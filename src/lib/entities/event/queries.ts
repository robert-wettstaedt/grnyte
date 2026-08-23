import { regionMemberCan, relatedRegion } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'
import { EVENT_OBJECT_COLUMNS, type EventObjectType } from './dto'

const objectTypes = Object.keys(EVENT_OBJECT_COLUMNS) as [EventObjectType, ...EventObjectType[]]

/** Sync window when a caller does not pick one: the feed's first page. */
const DEFAULT_LIMIT = 50

/**
 * A cut through the list, stated as the pair the list is ordered by.
 *
 * NOT an id, which is what `activities` cut on. Event ids do not run with their timestamps: the
 * backfill folded historical activity in island order, so on the dev database the newest row is id
 * 142 while id 496 is dated 2024. An id cut there drops most of the log out of the window on
 * screen and reports the same rows as new.
 */
// `createdAt` is deliberately not `z.int()`. The column is `timestamp(3)`, so a fresh replica only
// ever yields whole milliseconds, but a replica populated before that narrowing still holds
// fractional values (an `ALTER TABLE ... SET DATA TYPE` emits nothing over logical replication).
// Validating them away would blank the feed rather than degrade it.
const cursor = z.object({ createdAt: z.number(), id: z.int() })

/**
 * Everything a card needs, nested: real foreign keys instead of joining polymorphic ids in memory
 * after the fact. Five of the six object relations are null on any given row
 * (`events_one_object` guarantees it), so this costs no more to sync than naming the one that is
 * set would.
 */
/**
 * A route as a card renders it, ready to hand to `.related('route', ...)`.
 *
 * Exported because the inbox nests the same tree: a notification points at the same six object
 * types an event does, and its row is drawn by the same `RouteRow`. A third hand-copy of this
 * tree would be a third thing to keep in step with `listRoutes`, which is what the `RouteListRow`
 * cast in the mapper makes silent when it drifts.
 */
export const relatedRouteTree = (ctx: Parameters<typeof relatedRegion>[0]) => {
  const r = relatedRegion(ctx)

  const routeTree = (q: typeof zql.routes) =>
    r(q)
      .related('tags', r)
      .related('firstAscents', (q) => r(q).related('firstAscensionist', r))
      .related('block', (q) => r(q).related('area', r))
      .related('topoRoutes', (q) => r(q).related('topo', (q) => r(q).related('file', r)))

  // Zero types a relation callback against the exact query it is attached to, so a callback shared
  // by several attachment points cannot be written any other way. See the note in `withObject`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  return routeTree as any
}

const withObject = (ctx: Parameters<typeof relatedRegion>[0]) => {
  const r = relatedRegion(ctx)

  // Must match what `listRoutes` syncs (see {@link relatedRouteTree}): a relation missing on this
  // path only would zero that route's values, silently, under the `RouteListRow` cast in the
  // mapper.
  const route = relatedRouteTree(ctx)

  return (
    zql.events
      // `users` carries no regionFk, so it cannot take `relatedRegion`'s filter; RLS re-checks it.
      .related('actor')
      .related('changes', r)
      .related('area', (q) => r(q).related('parent', r))
      // An ascent card renders its route's name, and the route its block and area, nested here so
      // neither hop arrives as a separate wave and flashes a tombstone.
      .related('ascent', (q) =>
        r(q)
          // The climber's own media and name: a session card renders both, and neither is
          // readable off the route beneath it.
          .related('files', (q) => r(q).related('bunnyStream').related('author'))
          .related('author')
          // The same tree every other route attachment gets, through the one cast above.
          .related('route', route),
      )
      // `geolocation` and `topos` are the pin the create card draws as a map thumbnail and the
      // topo thumb every block row shows.
      // Written out here and once more under `file` below, unlike the route tree: the block
      // relation is the only one the mapper reads WITHOUT a cast of its own, so sharing it
      // through the `any` above would take `topos` down to `any[]` and the entity's thumbnail
      // with it.
      .related('block', (q) =>
        r(q)
          .related('area', r)
          .related('geolocation', r)
          .related('topos', (q) => r(q).related('file', r)),
      )
      // `ascent` is not for rendering: it carries `createdBy`, the only discriminator
      // `file/permissions.ts` has. Without it a clip opened from a feed card falls through to the
      // EDIT branch and a maintainer could delete somebody else's media.
      // The parent trees as well as the file itself, so an upload card can name what the photos
      // landed on and draw that entity's row beneath them: without these, "added 5 photos to
      // Rampe" has no source for "Rampe".
      .related('file', (q) =>
        r(q)
          .related('bunnyStream')
          .related('author')
          // The parent trees carry what the parent's own card carries, because an upload BORROWS
          // its parent's entity: `author` is where "added a photo to Mara's ascent of Rampe" gets
          // Mara, and a block's `geolocation` and `topos` are the pin and the thumb its row draws.
          // Thinner here than at the top level, an upload card rendered a degraded version of the
          // very entity it names.
          .related('ascent', (q) => r(q).related('author').related('route', route))
          .related('route', route)
          .related('block', (q) =>
            r(q)
              .related('area', r)
              .related('geolocation', r)
              .related('topos', (q) => r(q).related('file', r)),
          )
          .related('area', (q) => r(q).related('parent', r)),
      )
      // The emoji half only. A comment body is up to 5000 characters, the window is 50 events and
      // `eventFeed` runs two queries over it, so syncing comments here would ship every
      // conversation in the region to every reader just to render a count. The count is
      // `events.comment_count` instead, and the thread is `listComments`, fetched when somebody
      // opens it.
      //
      // An emoji stays eager: it is at most 16 characters, the chips need every row to say who
      // reacted and whether you did, and there is at most one per person per event.
      //
      // Only rows hanging DIRECTLY off the event, and only live ones. `event_fk` stays set all the
      // way down a thread, so a row with a `parent_fk` is a reaction to a comment, and counting
      // one as a chip would put it on the card. A cleared row stays in the table, because the
      // one-per-person index is partial on `deleted_at is null`.
      //
      // `user` is the reactor's name, which the chips' long press popover lists.
      .related('reactions', (q) =>
        r(q)
          .where('type', 'emoji')
          .where('parentFk', 'IS', null)
          .where('deletedAt', 'IS', null)
          .related('user')
          // The id breaks the tie, so two comments written inside one millisecond keep the order
          // they were written in rather than an arbitrary one that can change between syncs.
          .orderBy('createdAt', 'asc')
          .orderBy('id', 'asc'),
      )
      .related('route', route)
      .related('subject')
  )
}

export const eventsQueryDefs = {
  /**
   * The feed's events, newest first. Region-gated like every other list; the optional `regionFk`
   * narrows further when the reader picks one region of several.
   */
  listEvents: defineQuery(
    z.object({
      actorFk: z.number().optional(),
      /** Only rows newer than this row, which is how the feed counts what queued while reading. */
      after: cursor.optional(),
      category: z.enum(['ascent', 'update']).optional(),
      ids: z.array(z.number()).optional(),
      limit: z.number().optional(),
      regionFk: z.number().optional(),
      // One object rather than two loose fields: an id without its type would silently widen the
      // query back to the global feed. The id is a string for a `file`, which keys on a cuid, and
      // a number for the other five.
      scope: z.object({ id: z.union([z.number(), z.string()]), type: z.enum(objectTypes) }).optional(),
      /** Only rows at or older than this row: the window the reader has acknowledged. */
      upTo: cursor.optional(),
    }),
    regionMemberCan(({ args, ctx }) => {
      let q = withObject(ctx).orderBy('createdAt', 'desc').orderBy('id', 'desc')

      if (args.regionFk != null) {
        q = q.where('regionFk', args.regionFk)
      }

      if (args.actorFk != null) {
        q = q.where('actorFk', args.actorFk)
      }

      if (args.ids != null) {
        q = q.where('id', 'IN', args.ids)
      }

      // The segmented control, as a where-clause: a Zero query cannot call a predicate, so this
      // is the one mirror of `isAscentEvent` rather than another copy of the reasoning. Read that
      // for why a media removal is the exception.
      if (args.category === 'ascent') {
        q = q.where('ascentFk', 'IS NOT', null).where('verb', '!=', 'remove')
      } else if (args.category === 'update') {
        q = q.where((q) => q.or(q.cmp('ascentFk', 'IS', null), q.cmp('verb', 'remove')))
      }

      // One entity's log: events ABOUT it, plus events whose changes name it. The second half is
      // what lets a block find the reorder that moved it, whose object is the area. The event is
      // rendered whole either way, siblings included, so the same card reads identically here and
      // in the feed.
      if (args.scope != null) {
        const column = EVENT_OBJECT_COLUMNS[args.scope.type]
        // Five of the six columns are `integer`, so a caller's string id has to become a number
        // here: Zero compares by value and by type, and `'16080' === 16080` is false, which is an
        // entity's whole log coming back empty rather than erroring. Only `file` keys on text
        // (a cuid), and every caller already passes a string for it.
        const id = args.scope.type === 'file' ? String(args.scope.id) : Number(args.scope.id)
        q = q.where((q) =>
          q.or(
            q.cmp(column, id),
            q.exists('changes', (c) => c.where(column, id)),
          ),
        )
      }

      // The feed reads in two windows either side of the row the reader acknowledged, so rows
      // waiting behind the "N new" pill do not count against the window on screen and push an
      // equal number of old ones off its bottom. Both cuts compare the ORDER BY key as a pair, so
      // they land exactly where the sort puts the row, ties included.
      if (args.upTo != null) {
        const { createdAt, id } = args.upTo
        q = q.where((q) =>
          q.or(q.cmp('createdAt', '<', createdAt), q.and(q.cmp('createdAt', createdAt), q.cmp('id', '<=', id))),
        )
      }

      if (args.after != null) {
        const { createdAt, id } = args.after
        q = q.where((q) =>
          q.or(q.cmp('createdAt', '>', createdAt), q.and(q.cmp('createdAt', createdAt), q.cmp('id', '>', id))),
        )
      }

      return q.limit(args.limit ?? DEFAULT_LIMIT)
    }),
  ),
}
