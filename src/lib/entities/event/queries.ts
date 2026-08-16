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
const cursor = z.object({ createdAt: z.number(), id: z.number() })

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

  return (
    zql.events
      // `users` carries no regionFk, so it cannot take `relatedRegion`'s filter; RLS re-checks it.
      .related('actor')
      .related('changes', r)
      .related('area', (q) => r(q).related('parent', r))
      // An ascent card renders its route's name, and the route its block and area: the second and
      // third hops that used to arrive as a separate wave, and the reason a tombstone could flash.
      .related('ascent', (q) => r(q).related('route', (q) => r(q).related('block', (q) => r(q).related('area', r))))
      .related('block', (q) => r(q).related('area', r))
      .related('file', (q) => r(q).related('bunnyStream').related('author'))
      .related('route', (q) => r(q).related('block', (q) => r(q).related('area', r)))
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

      // The segmented control. An ascent card is simply an event whose object is an ascent, where
      // the old rule had to say "entityType is ascent AND columnName is not file" to keep a photo
      // pulled off an ascent out of it. A photo's object is the file, so it cannot land here.
      if (args.category === 'ascent') {
        q = q.where('ascentFk', 'IS NOT', null)
      } else if (args.category === 'update') {
        q = q.where('ascentFk', 'IS', null)
      }

      // One entity's log: events ABOUT it, plus events whose changes name it. The second half is
      // what lets a block find the reorder that moved it, whose object is the area. The event is
      // rendered whole either way, siblings included, so the same card reads identically here and
      // in the feed.
      if (args.scope != null) {
        const column = EVENT_OBJECT_COLUMNS[args.scope.type]
        const { id } = args.scope
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
