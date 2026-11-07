import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { eq, toArray, type InitialQueryBuilder } from '@tanstack/db'
import type { AscentType } from './dto'
import {
  toAscentDetail,
  toRouteAscent,
  toUserAscent,
  toUserAscentDetail,
  type RouteAscentRow,
  type UserAscentDetailRow,
  type UserAscentRow,
} from './mapper'
import { ascentStatusByRoute } from './status'

// Ascents sync with the region's activity, their media with the guidebook, video state with the media stream.
const WITH_MEDIA = ['region_activity', 'guidebook', 'media', 'members']

type BlockRow = NonNullable<RouteRow['block']>
// The nested rows the mappers were written against, from Zero's query types.
type FileRow = RouteAscentRow['files'][number]
type RouteRow = NonNullable<UserAscentDetailRow['route']>
type SyncedFile = { author: object[]; stream: object[] }

/** An ascent's files with their video and author, as Zero's `.related('files', …)` nested them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive a helper
const filesOf = (q: InitialQueryBuilder, ascentFk: any) => {
  const { bunny_streams, files, users } = collections()
  return toArray(
    q
      .from({ f: files })
      .where(({ f }) => eq(f.ascent_fk, ascentFk))
      .select(({ f }) => ({
        ...f,
        author: toArray(q.from({ u: users }).where(({ u }) => eq(u.nid, f.created_by))),
        stream: toArray(q.from({ s: bunny_streams }).where(({ s }) => eq(s.id, f.bunny_stream_fk))),
      })),
  )
}

const toFileRow = (file: SyncedFile): FileRow => ({
  ...toZeroRow<FileRow>('files', file),
  author: file.author[0] && toZeroRow<FileRow['author']>('users', file.author[0]),
  bunnyStream: file.stream[0] && toZeroRow<FileRow['bunnyStream']>('bunny_streams', file.stream[0]),
})

const authorOf = (row: { author: object[] }) =>
  row.author[0] && toZeroRow<RouteAscentRow['author']>('users', row.author[0])

/** One ascent with its media, for the edit-ascent form. */
export function ascentDetail(id: () => number) {
  return psResource(
    (q) =>
      q
        .from({ a: collections().ascents })
        .where(({ a }) => eq(a.nid, id()))
        .select(({ a }) => ({
          ...a,
          files: filesOf(q, a.nid),
          route: toArray(q.from({ r: collections().routes }).where(({ r }) => eq(r.nid, a.route_fk))),
        })),
    [id],
    ([row]) =>
      // A deleted route takes its ascents with it on screen; they stay stored so an undo brings them back.
      row == null || row.route.length === 0
        ? undefined
        : toAscentDetail({
            ...toZeroRow<RouteAscentRow>('ascents', row),
            files: row.files.map(toFileRow),
          }),
    WITH_MEDIA,
  )
}

/**
 * All ascents of one route, with their media: the route detail page's
 * grade-opinion chart and ascent beta videos.
 */
export function routeAscentList(routeId: () => number) {
  return psResource(
    (q) =>
      q
        .from({ a: collections().ascents })
        .where(({ a }) => eq(a.route_fk, routeId()))
        .select(({ a }) => ({
          ...a,
          author: toArray(q.from({ u: collections().users }).where(({ u }) => eq(u.nid, a.created_by))),
          files: filesOf(q, a.nid),
        })),
    [routeId],
    (rows) =>
      rows.map((row) =>
        toRouteAscent({
          ...toZeroRow<RouteAscentRow>('ascents', row),
          author: authorOf(row),
          files: row.files.map(toFileRow),
        }),
      ),
    WITH_MEDIA,
  )
}

/**
 * A user's ascents enriched with route name + community grade and their media:
 * the profile page's sessions, stats and grade histogram. Separate from the lean
 * `userAscentList` so the shared ascent-status query stays small. Gated by
 * `enabled` and skipped until a `userId` is available. Anyone's reads offline: every member's ascents sync.
 */
export function userAscentDetailList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return psResource(
    (q) => {
      const { areas, ascents, blocks, routes, users } = collections()
      return q
        .from({ a: ascents })
        .where(({ a }) => eq(a.created_by, userId() ?? -1))
        .select(({ a }) => ({
          ...a,
          author: toArray(q.from({ u: users }).where(({ u }) => eq(u.nid, a.created_by))),
          files: filesOf(q, a.nid),
          route: toArray(
            q
              .from({ r: routes })
              .where(({ r }) => eq(r.nid, a.route_fk))
              .select(({ r }) => ({
                ...r,
                block: toArray(
                  q
                    .from({ b: blocks })
                    .where(({ b }) => eq(b.nid, r.block_fk))
                    .select(({ b }) => ({
                      ...b,
                      area: toArray(q.from({ ar: areas }).where(({ ar }) => eq(ar.nid, b.area_fk))),
                    })),
                ),
              })),
          ),
        }))
    },
    [userId],
    (rows) =>
      // Deleted routes do not sync, and their ascents go with them, as in `ascentDetail`.
      rows.flatMap((row) => {
        const route = row.route[0]
        if (route == null) return []
        const block = route.block[0]
        return [
          toUserAscentDetail({
            ...toZeroRow<UserAscentDetailRow>('ascents', row),
            author: authorOf(row),
            files: row.files.map(toFileRow),
            route: {
              ...toZeroRow<RouteRow>('routes', route),
              block: block && {
                ...toZeroRow<BlockRow>('blocks', block),
                area: block.area[0] && toZeroRow<BlockRow['area']>('areas', block.area[0]),
              },
            },
          }),
        ]
      }),
    WITH_MEDIA,
    { enabled: () => userId() != null && enabled() },
  )
}

/**
 * The signed-in user's ascents. Gated by `enabled` so it only syncs when
 * needed (e.g. an ascent-status filter is active), and skipped entirely until
 * a `userId` is available.
 */
export function userAscentList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return psResource(
    (q) => q.from({ a: collections().ascents }).where(({ a }) => eq(a.created_by, userId() ?? -1)),
    [userId],
    (rows) => rows.map((row) => toUserAscent(toZeroRow<UserAscentRow>('ascents', row))),
    'region_activity',
    { enabled: () => userId() != null && enabled() },
  )
}

/**
 * The signed-in user's status per route (repeat > flash > redpoint > attempt): the
 * status every `RouteRow` shows. Pages sharing it reuse the same underlying
 * live query over the synced ascents.
 */
export function userAscentStatus(userId: () => number | undefined) {
  const ascents = userAscentList(userId)
  const byRoute = $derived(ascentStatusByRoute(ascents.data))
  return {
    get(routeId: number): AscentType | undefined {
      return byRoute.get(routeId)
    },
  }
}
