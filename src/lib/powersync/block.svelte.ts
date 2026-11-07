import { toBlockDetail } from '$lib/entities/block/mapper'
import { toDisplayName } from '$lib/entities/displayName'
import { toTopoViews } from '$lib/entities/topo/mapper'
import { holdWhileDeleting } from '$lib/zero/deleting.svelte'
import { eq, toArray, type InitialQueryBuilder } from '@tanstack/db'
import { collections } from './collections'
import { psResource } from './resource.svelte'
import { json, ms, unwrapParents } from './rows'

// Trial 3: the block screen's three resources on PowerSync + TanStack DB, shaped like `queries.block`'s row so
// the existing mappers run unchanged.

// The same shape `blockRouteList` in block/resources.svelte.ts builds; task 6.2 folds this module into it.
const toRouteItems = (row: Tree) =>
  ((row?.routes ?? []) as Tree[]).map((route) => ({
    createdBy: route.createdBy as null | number,
    description: (route.description ?? '') as string,
    gradeFk: (route.userGradeFk ?? undefined) as number | undefined,
    id: route.id as number,
    name: toDisplayName(route.name),
    rating: (route.userRating ?? 0) as number,
    regionFk: route.regionFk as number,
    tags: (route.tags as { tagFk: string }[]).map((tag) => tag.tagFk),
    topoLines: ((row?.topos ?? []) as Tree[])
      .flatMap((topo) => topo.routes ?? [])
      .filter((line) => line.routeFk === route.id).length,
  }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped include rows, reshaped to Zero's row here
type Tree = any

// The area chain the breadcrumb needs, nested as Zero's `.related('parent')` returns it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the builder's ref types do not survive recursion
function areaChain(q: InitialQueryBuilder, fk: any, depth: number): any {
  const { areas } = collections()
  return toArray(
    q
      .from({ a: areas })
      .where(({ a }) => eq(a.nid, fk))
      .select(({ a }) => ({
        id: a.nid,
        name: a.name,
        ...(depth > 0 ? { parent: areaChain(q, a.parent_fk, depth - 1) } : {}),
        type: a.type,
      })),
  )
}
function blockTree(q: InitialQueryBuilder, blockId: number) {
  const { blocks, files, geolocations, routes, routes_to_tags, topo_routes, topos } = collections()
  return q
    .from({ b: blocks })
    .where(({ b }) => eq(b.nid, blockId))
    .select(({ b }) => ({
      area: areaChain(q, b.area_fk, 3),
      areaFk: b.area_fk,
      createdAt: b.created_at,
      createdBy: b.created_by,
      description: b.description,
      geolocation: toArray(
        q
          .from({ g: geolocations })
          .where(({ g }) => eq(g.nid, b.geolocation_fk))
          .select(({ g }) => ({ estimated: g.estimated, id: g.nid, lat: g.lat, long: g.long })),
      ),
      gradeCounts: b.grade_counts,
      id: b.nid,
      name: b.name,
      order: b.order,
      regionFk: b.region_fk,
      routes: toArray(
        q
          .from({ r: routes })
          .where(({ r }) => eq(r.block_fk, b.nid))
          .select(({ r }) => ({
            createdBy: r.created_by,
            description: r.description,
            id: r.nid,
            name: r.name,
            regionFk: r.region_fk,
            tags: toArray(
              q
                .from({ t: routes_to_tags })
                .where(({ t }) => eq(t.route_fk, r.nid))
                .select(({ t }) => ({ tagFk: t.tag_fk })),
            ),
            userGradeFk: r.user_grade_fk,
            userRating: r.user_rating,
          })),
      ),
      topos: toArray(
        q
          .from({ tp: topos })
          .where(({ tp }) => eq(tp.block_fk, b.nid))
          .orderBy(({ tp }) => tp.order, 'asc')
          .orderBy(({ tp }) => tp.nid, 'asc')
          .select(({ tp }) => ({
            file: toArray(
              q
                .from({ f: files })
                .where(({ f }) => eq(f.id, tp.file_fk))
                .select(({ f }) => ({ createdBy: f.created_by, height: f.height, path: f.path, width: f.width })),
            ),
            id: tp.nid,
            routes: toArray(
              q
                .from({ tr: topo_routes })
                .where(({ tr }) => eq(tr.topo_fk, tp.nid))
                .select(({ tr }) => ({ id: tr.nid, path: tr.path, routeFk: tr.route_fk, topType: tr.top_type })),
            ),
          })),
      ),
    }))
}

function toZeroRow(tree: Tree) {
  if (tree == null) return undefined
  return {
    ...tree,
    area: unwrapParents(tree.area?.[0]),
    createdAt: ms(tree.createdAt),
    geolocation:
      tree.geolocation?.[0] == null
        ? undefined
        : { ...tree.geolocation[0], estimated: !!tree.geolocation[0].estimated },
    gradeCounts: json<Record<string, number>>(tree.gradeCounts),
    routes: tree.routes.map((r: Tree) => ({ ...r, name: r.name ?? '' })),
    topos: tree.topos.map((t: Tree) => ({ ...t, file: t.file?.[0] })),
  }
}

const blockResource = <T>(id: () => number, map: (row: ReturnType<typeof toZeroRow>) => T) =>
  psResource(
    (q) => blockTree(q, id()),
    [id],
    (rows) => map(toZeroRow((rows as Tree[])[0])),
  )

export const blockDetailPs = (id: () => number) =>
  holdWhileDeleting(
    blockResource(id, (row) => (row == null ? undefined : toBlockDetail(row))),
    'blocks',
    id,
  )

export const blockRouteListPs = (id: () => number) => blockResource(id, toRouteItems)

export const blockTopoListPs = (id: () => number) => blockResource(id, (row) => (row == null ? [] : toTopoViews(row)))
