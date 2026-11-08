import { areaChain } from '$lib/entities/area/resources.svelte'
import { toDisplayName } from '$lib/entities/displayName'
import { collections } from '$lib/powersync/collections'
import { psResource, sqlResource, treeList, waitForSynced } from '$lib/powersync/resource.svelte'
import { json, toZeroRow, unwrapParents } from '$lib/powersync/rows'
import { MAP_SQL } from '$lib/powersync/sql'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import type { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import { eq, ilike, inArray, toArray, type InitialQueryBuilder } from '@tanstack/db'
import { toBlockDetail } from './mapper'
import { acrossAreasKeys, inAreaKeys } from './order'

export interface BlockListFilter {
  areaId?: number
  /** Restrict to these block ids (e.g. hydrating a favorites list). */
  blockId?: number | number[]
  content?: string
  /** Cap the result set (e.g. a search preview). */
  limit?: number
  /** Find blocks whose description references the given `!type:id!` token (backlinks). */
  references?: string
  /** Newest first; by slot or name otherwise. */
  sort?: 'createdAt'
}

// The rows the mappers were written against, from Zero's query types.
type BlockRow = QueryRow<typeof queries.block>
type ListRow = QueryRow<typeof queries.listBlocks>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive a helper
type Ref = any
type Synced = object
type SyncedTopo = Synced & { file: Synced[]; lines?: Synced[] }

type TopoRow = BlockRow['topos'][number]

const geolocationOf = (q: InitialQueryBuilder, fk: Ref) =>
  toArray(q.from({ g: collections().geolocations }).where(({ g }) => eq(g.nid, fk)))

const fileOf = (q: InitialQueryBuilder, fk: Ref) =>
  toArray(q.from({ f: collections().files }).where(({ f }) => eq(f.id, fk)))

const toposOf = (q: InitialQueryBuilder, blockFk: Ref) =>
  q
    .from({ tp: collections().topos })
    .where(({ tp }) => eq(tp.block_fk, blockFk))
    .orderBy(({ tp }) => tp.order, 'asc')
    .orderBy(({ tp }) => tp.nid, 'asc')

/** Blocks with everything the block page draws: area chain, routes with tags, topos with their lines. */
function blockTrees(q: InitialQueryBuilder, where: (b: Ref) => Ref) {
  const { blocks, routes, routes_to_tags, topo_routes } = collections()
  return q
    .from({ b: blocks })
    .where(({ b }) => where(b))
    .select(({ b }) => ({
      ...b,
      area: areaChain(q, b.area_fk, 3),
      geolocation: geolocationOf(q, b.geolocation_fk),
      routes: toArray(
        q
          .from({ r: routes })
          .where(({ r }) => eq(r.block_fk, b.nid))
          // By integer id, as Zero's relations came: unordered, TanStack orders by the text key ("100" < "99").
          .orderBy(({ r }) => r.nid, 'asc')
          .select(({ r }) => ({
            ...r,
            tags: toArray(
              q
                .from({ t: routes_to_tags })
                .where(({ t }) => eq(t.route_fk, r.nid))
                .orderBy(({ t }) => t.tag_fk, 'asc'),
            ),
          })),
      ),
      topos: toArray(
        toposOf(q, b.nid).select(({ tp }) => ({
          ...tp,
          file: fileOf(q, tp.file_fk),
          lines: toArray(
            q
              .from({ tr: topo_routes })
              .where(({ tr }) => eq(tr.topo_fk, tp.nid))
              .orderBy(({ tr }) => tr.nid, 'asc'),
          ),
        })),
      ),
    }))
}

const toTopoRow = (topo: SyncedTopo): TopoRow => ({
  ...toZeroRow<TopoRow>('topos', topo),
  file: topo.file[0] && toZeroRow<TopoRow['file']>('files', topo.file[0]),
  routes: (topo.lines ?? []).map((line) => toZeroRow<TopoRow['routes'][number]>('topo_routes', line)),
})

type MapBlockRow = Record<string, unknown> & { area: string; geolocation: null | string }

type SyncedListBlock = Synced & { area: Ref[]; geolocation: Synced[]; topos: SyncedTopo[] }

export function blockDetail(id: () => number) {
  return holdWhileDeleting(
    blockTree(id, (row) => (row == null ? undefined : toBlockDetail(row))),
    'blocks',
    id,
  )
}

/**
 * Blocks with their area and parent, geolocation and topo photos. Text is matched in JS with
 * `toLocaleLowerCase`, as Postgres's ILIKE did: SQLite's LIKE folds ASCII only. A text match or a cap reads only
 * the hits' trees (`treeList`).
 */
export function blockList(filter: () => BlockListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  return treeList(
    filter,
    {
      byIds: (q, ids) => q.from({ b: collections().blocks }).where(({ b }) => inArray(b.nid, ids)),
      rows: (q, { areaId, blockId, references, sort }) => {
        let query = q.from({ b: collections().blocks })
        if (areaId !== undefined) query = query.where(({ b }) => eq(b.area_fk, areaId))
        if (blockId != null) query = query.where(({ b }) => inArray(b.nid, [blockId].flat()))
        // A backlink token is fixed per page, so it narrows the query rather than the selection.
        if (references != null) query = query.where(({ b }) => ilike(b.description, `%${references}%`))
        if (sort === 'createdAt') query = query.orderBy(({ b }) => b.created_at, 'desc')
        for (const key of areaId === undefined ? acrossAreasKeys : inAreaKeys) {
          query = query.orderBy(({ b }) => b[key], 'asc')
        }
        return query
      },
      toItem: toListBlock,
      trees: (q, rows) =>
        rows.select(({ b }: Ref) => ({
          ...b,
          area: areaChain(q, b.area_fk, 1),
          geolocation: geolocationOf(q, b.geolocation_fk),
          topos: toArray(toposOf(q, b.nid).select(({ tp }) => ({ ...tp, file: fileOf(q, tp.file_fk) }))),
        })),
    },
    opts,
  )
}

/** Every block in your regions for the map, with its area, parent and pin: raw SQL, as a live query building that
 *  tree per block is the map's slowest read. */
export function blockMapList() {
  return sqlResource(
    () => MAP_SQL,
    () => [],
    (rows: MapBlockRow[]) => rows.map(toMapBlock),
    () => 'guidebook',
  )
}

/** The block's routes, only the fields a route row needs. Order them with `orderRoutesByTopo` at the call site. */
export function blockRouteList(id: () => number) {
  return blockTree(id, (row) =>
    (row?.routes ?? []).map((route) => ({
      // createdBy + regionFk carry the permission gates (canDeleteRoute's own-created branch).
      createdBy: route.createdBy,
      description: route.description ?? '',
      gradeFk: route.userGradeFk ?? undefined,
      id: route.id,
      name: toDisplayName(route.name),
      rating: route.userRating ?? 0,
      regionFk: route.regionFk,
      tags: route.tags.map((tag) => tag.tagFk),
      // Every stored line, drawable or not: the count a move's `knownTopoLines` is checked against.
      topoLines: (row?.topos ?? []).flatMap((topo) => topo.routes ?? []).filter((line) => line.routeFk === route.id)
        .length,
    })),
  )
}

/** One block's tree mapped by `map`: the detail, its routes and its topos all read this one live query. */
export function blockTree<T>(id: () => number, map: (row: BlockRow | undefined) => T) {
  return psResource(
    (q) => blockTrees(q, (b) => eq(b.nid, id())),
    [id],
    ([row]) => map(row == null ? undefined : toBlockRow(row)),
  )
}

/** Several blocks' trees at once: the feed draws topos across a window of rows. */
export function blockTreesByIds<T>(ids: () => number[], map: (rows: BlockRow[]) => T) {
  return psResource(
    (q) => blockTrees(q, (b) => inArray(b.nid, ids())),
    [ids],
    (rows) => map(rows.map(toBlockRow)),
    'guidebook',
    { enabled: () => ids().length > 0 },
  )
}

/** A synced block row with its relations, as Zero's `queries.block` nested them. */
export function toBlockRow(
  row: Synced & { area: Ref[]; geolocation: Synced[]; routes: (Synced & { tags: Synced[] })[]; topos: SyncedTopo[] },
) {
  return {
    ...toZeroRow<BlockRow>('blocks', row),
    area: unwrapParents(row.area[0]) as BlockRow['area'],
    geolocation:
      row.geolocation[0] && toZeroRow<NonNullable<BlockRow['geolocation']>>('geolocations', row.geolocation[0]),
    routes: row.routes.map((route) => ({
      ...toZeroRow<BlockRow['routes'][number]>('routes', route),
      tags: route.tags.map((tag) => toZeroRow<BlockRow['routes'][number]['tags'][number]>('routes_to_tags', tag)),
    })),
    topos: row.topos.map(toTopoRow),
  } satisfies BlockRow
}

/** A synced block with its area chain, pin and topo photos, as a list shows it. */
export function toListBlock(row: SyncedListBlock) {
  return toBlockDetail({
    ...toZeroRow<ListRow>('blocks', row),
    area: unwrapParents(row.area[0]) as ListRow['area'],
    geolocation:
      row.geolocation[0] && toZeroRow<NonNullable<ListRow['geolocation']>>('geolocations', row.geolocation[0]),
    topos: row.topos.map(toTopoRow),
  })
}

/** A `MAP_SQL` row as `toBlockDetail` reads it. */
export function toMapBlock(row: MapBlockRow) {
  const geolocation = json<object>(row.geolocation)
  return toBlockDetail({
    ...toZeroRow<ListRow>('blocks', row),
    area: json<ListRow['area']>(row.area) ?? undefined,
    geolocation:
      geolocation == null ? undefined : toZeroRow<NonNullable<ListRow['geolocation']>>('geolocations', geolocation),
  })
}

/** Resolve once the block row for `id` has synced, or after `timeoutMs`. See {@link waitForSynced}. */
export function waitForBlock(id: number, timeoutMs = 5000): Promise<void> {
  return waitForSynced('blocks', id, timeoutMs)
}
