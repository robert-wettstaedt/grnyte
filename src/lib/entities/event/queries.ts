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
 * Everything a card needs, nested.
 *
 * This is the whole point of real foreign keys. The old feed ran SEVEN queries per render, one per
 * entity kind, collected the ids off the synced rows and joined them in memory, and carried a
 * ready-set plus a needs-graph so a row whose query had not answered yet would not flash a
 * tombstone. All of that was working around `entity_id` being polymorphic text that Zero could not
 * join. Here the object arrives with the event, in one consistent snapshot.
 *
 * Five of the six object relations are null on any given row (`events_one_object` guarantees it),
 * so this costs no more to sync than naming the one that is set would.
 */
const withObject = (ctx: Parameters<typeof relatedRegion>[0]) => {
  const r = relatedRegion(ctx)

  // A route as a card renders it: the same tree `listRoutes` syncs, because the card reuses
  // `RouteRow`, which wants the grade, the tags and the topo thumb. Anything less renders a real
  // route with zeroed values, which reads worse than a late one. It has to match what `listRoutes`
  // syncs, because that is what makes the `RouteListRow` cast in the mapper safe: a relation
  // missing on one path only would zero that route's values there, and the cast erases the type
  // error, which is how three hand-copies of this tree sat here disagreeing.
  //
  // Declared once, and the `any` below is what lets it be. Zero types a relation callback against
  // the exact query it is attached to, so a callback shared by four attachment points cannot be
  // written any other way.

  const routeTree = (q: typeof zql.routes) =>
    r(q)
      .related('tags', r)
      .related('firstAscents', (q) => r(q).related('firstAscensionist', r))
      .related('block', (q) => r(q).related('area', r))
      .related('topoRoutes', (q) => r(q).related('topo', (q) => r(q).related('file', r)))

  // The cast is what the comment above is about: `routeTree`'s BODY types fine against
  // `zql.routes`, and only the nominal identity of the callback parameter differs per attachment
  // point. Casting once here beats four copies of the tree or an `any` that also loses the body.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  const route = routeTree as any

  return (
    zql.events
      // `users` carries no regionFk, so it cannot take `relatedRegion`'s filter; RLS re-checks it.
      .related('actor')
      .related('changes', r)
      .related('area', (q) => r(q).related('parent', r))
      // An ascent card renders its route's name, and the route its block and area: the second and
      // third hops that used to arrive as a separate wave, and the reason a tombstone could flash.
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
      // topo thumb every block row shows. Both were on the old hydrated entity.
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
      // `ascent` is not for rendering: it carries `createdBy`, which is the discriminator every
      // ascent-media permission check reads. Without it a clip opened from a feed card falls
      // through to the EDIT branch and a maintainer could delete somebody else's media.
      // The parent trees as well as the file itself. An upload card names what the photos landed
      // on and draws that entity's row beneath them; without these it can do neither, and the
      // "added 5 photos to Rampe" headline has no source for "Rampe". `ascent` also carries
      // `createdBy`, the only discriminator in `file/permissions.ts`.
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
      // Both halves of the table, split by `type` in the mapper: the emoji become the card's chips
      // and the comments its thread. One relation rather than two, because Zero attaches a
      // relation once per name and the split is free on the client.
      //
      // Only rows hanging DIRECTLY off the event, and only live ones. `event_fk` stays set all the
      // way down a thread, so a row with a `parent_fk` is a reply or a reaction to a comment, and
      // counting one as a chip would put it on the card. A cleared row stays in the table, because
      // the one-per-person index is partial on `deleted_at is null`.
      //
      // `user` is the author's name: the chips' long press popover and every comment's byline.
      //
      // ponytail: an event with 200 of these ships 200 rows to every reader. Fine at community
      // scale. Upgrade = a denormalized count column, syncing only your own rows and a page of
      // the thread.
      .related('reactions', (q) =>
        r(q)
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
        // entity's whole log coming back empty rather than erroring. Only `file` keys on text, and
        // every caller passes a string, because the polymorphic column this replaces was text.
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
