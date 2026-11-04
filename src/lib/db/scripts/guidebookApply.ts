/**
 * Executes step 3's operation list on one region inside the caller's transaction. It decides nothing: every
 * create, move, merge and delete is in the list, in order. It refuses the run when a row it updates no longer holds
 * the list's `old` value, and fails it when a postcondition does not hold.
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { refreshAreaType, stampDeletedAt } from '../../entities/area/area.server'
import { objectColumns } from '../../entities/event/event.server'
import { recalcUserGradeAndRating } from '../../entities/route/user-grade.server'
import { blank } from '../../forms/schemas'
import { stringifyCoords } from '../../map/coords'
import * as schema from '../schema'
import {
  ChangeLog,
  faColumn,
  fbLabel,
  holds,
  NEW_LINK,
  planLabel,
  type EntityKind,
  type Op,
  type Ops,
  type Ref,
} from './guidebookPlan'
import { recordImportRefs } from './importRefs.server'
import { countOf, type Preflight, type Tx } from './regionMove'

export interface ApplyContext {
  actor: number
  batch: string
  preflight: Preflight
  region: number
}

type Db = PostgresJsDatabase<typeof schema>

/** Every table column with a foreign key to `routes.id`, each re-pointed by `mergeRoute`. */
const ROUTE_REFERENCES = [
  'ascents.route_fk',
  'changes.route_fk',
  'events.route_fk',
  'favorites.route_fk',
  'files.route_fk',
  'import_refs.route_fk',
  'notifications.route_fk',
  'route_external_resources.route_fk',
  'routes_to_first_ascensionists.route_fk',
  'routes_to_tags.route_fk',
  'topo_routes.route_fk',
]

interface RouteNow {
  blockFk: number
  deleted: boolean
  description: null | string
  fa: string[]
  fb: null | string
  firstAscentYear: null | number
  gradeFk: null | number
  name: string
  rating: null | number
  regionFk: number
}

/** Applies `ops`; preflight failures are collected on `ctx.preflight` and stop the run before the first write. */
export async function applyOps(tx: Tx, db: Db, ops: Ops, ctx: ApplyContext) {
  const { actor, batch, region } = ctx
  const { fail, warn } = ctx.preflight
  const of = <T extends Op['op']>(op: T) => ops.ops.filter((o): o is Extract<Op, { op: T }> => o.op === op)
  const ids = (refs: (null | undefined | { id: null | number } | { key: string })[]) =>
    refs.flatMap((r) => (r != null && 'id' in r && r.id != null ? [r.id] : []))
  const batchEvents = () => countOf(tx<{ c: number }[]>`select count(*)::int as c from events where batch = ${batch}`)

  /* --------------------------------------------------------------- preflight */

  if ((await batchEvents()) > 0) {
    fail(`batch "${batch}" already has events; pick a new label rather than doubling them`)
  }
  await assertRouteReferences(tx, fail)
  if (ops.region != null && ops.region !== region) fail(`the list was built for region ${ops.region}`)

  const routeIds = [
    ...of('update_route').map((o) => o.id),
    ...of('merge_route').flatMap((o) => [o.gone, o.into]),
    ...of('delete_route').map((o) => o.id),
  ]
  const blockIds = [
    ...of('update_block').map((o) => o.id),
    ...of('merge_block').flatMap((o) => [o.gone, o.into]),
    ...of('delete_block').map((o) => o.id),
    ...ids(of('create_route').map((o) => o.block)),
    ...ids(of('update_route').map((o) => o.set.block?.new)),
  ]
  const areaIds = [
    ...of('update_area').map((o) => o.id),
    ...of('merge_area').flatMap((o) => [o.gone, o.into]),
    ...of('delete_area').map((o) => o.id),
    ...ids(of('create_area').map((o) => o.parent)),
    ...ids(of('create_block').map((o) => o.area)),
    ...ids(of('update_block').map((o) => o.set.area?.new)),
    ...ids(of('update_area').map((o) => o.set.parent?.new)),
    ...ids(of('add_parking').map((o) => o.area)),
  ]
  const faWanted = [
    ...of('rename_fa').map((o) => o.id),
    ...of('merge_fa').flatMap((o) => [o.gone, o.into]),
    ...of('delete_fa').map((o) => o.id),
    ...ids(of('create_route').flatMap((o) => o.first_ascent)),
    ...ids(of('update_route').flatMap((o) => o.set.first_ascent?.new ?? [])),
  ]

  const routes = new Map(
    (
      await tx<(RouteNow & { id: number })[]>`
        select r.id, r.region_fk as "regionFk", r.deleted_at is not null as deleted, r.block_fk as "blockFk",
          r.name, r.description, r.first_ascent_year as "firstAscentYear", r.rating, g."FB" as fb,
          r.grade_fk as "gradeFk",
          array(select f.name from routes_to_first_ascensionists t
                join first_ascensionists f on f.id = t.first_ascensionist_fk
                where t.route_fk = r.id order by f.name) as fa
        from routes r left join grades g on g.id = r.grade_fk where r.id = any(${[...new Set(routeIds)]}::int[])`
    ).map((row) => [row.id, row]),
  )
  const blocks = new Map(
    (
      await tx<
        {
          areaFk: number
          deleted: boolean
          description: null | string
          estimated: boolean | null
          geo: null | number
          id: number
          lat: null | number
          lng: null | number
          name: string
          order: number
          regionFk: number
        }[]
      >`
        select b.id, b.region_fk as "regionFk", b.deleted_at is not null as deleted, b.area_fk as "areaFk", b.name,
          b.description, b."order", b.geolocation_fk as geo, g.lat, g.long as lng, g.estimated
        from blocks b left join geolocations g on g.id = b.geolocation_fk
        where b.id = any(${[...new Set(blockIds)]}::int[])`
    ).map((row) => [row.id, row]),
  )
  const areas = new Map(
    (
      await tx<
        {
          deleted: boolean
          description: null | string
          id: number
          name: string
          parentFk: null | number
          regionFk: number
          type: null | string
        }[]
      >`
        select id, region_fk as "regionFk", deleted_at is not null as deleted, name, description,
          parent_fk as "parentFk", type
        from areas where id = any(${[...new Set(areaIds)]}::int[])`
    ).map((row) => [row.id, row]),
  )
  const fas = new Map(
    (
      await tx<{ id: number; name: string; regionFk: number }[]>`
        select id, name, region_fk as "regionFk" from first_ascensionists where id = any(${[...new Set(faWanted)]}::int[])`
    ).map((row) => [row.id, row]),
  )
  for (const [what, wanted, rows] of [
    ['route', routeIds, routes],
    ['block', blockIds, blocks],
    ['area', areaIds, areas],
  ] as const) {
    for (const id of new Set(wanted)) {
      const row = rows.get(id)
      if (row == null) fail(`${what} ${id} does not exist`)
      else if (row.regionFk !== region) fail(`${what} ${id} is in region ${row.regionFk}, not ${region}`)
      else if (row.deleted) fail(`${what} ${id} is soft-deleted`)
    }
  }
  for (const id of new Set(faWanted)) {
    const row = fas.get(id)
    if (row == null) fail(`first ascensionist ${id} does not exist`)
    else if (row.regionFk !== region) fail(`first ascensionist ${id} is in region ${row.regionFk}, not ${region}`)
  }

  const stale = (what: string, id: number, field: string, now: unknown, old: unknown) => {
    if (!holds(now, old)) fail(`${what} ${id} ${field} changed since the snapshot`)
  }
  for (const o of of('update_route')) {
    const r = routes.get(o.id)
    if (r == null) continue
    const { set } = o
    if (set.name) stale('route', o.id, 'name', r.name, set.name.old ?? '')
    if (set.description) stale('route', o.id, 'description', r.description, set.description.old)
    if (set.grade) stale('route', o.id, 'grade', planLabel(r.fb), set.grade.old)
    if (set.first_ascent_year) stale('route', o.id, 'first_ascent_year', r.firstAscentYear, set.first_ascent_year.old)
    if (set.rating) stale('route', o.id, 'rating', r.rating, set.rating.old)
    if (set.block) stale('route', o.id, 'block', { id: r.blockFk }, set.block.old)
    if (set.first_ascent) stale('route', o.id, 'first_ascent', [...r.fa].sort(), [...set.first_ascent.old].sort())
  }
  for (const o of of('update_block')) {
    const b = blocks.get(o.id)
    if (b == null) continue
    const { set } = o
    if (set.name) stale('block', o.id, 'name', b.name, set.name.old ?? '')
    if (set.description) stale('block', o.id, 'description', b.description, set.description.old)
    if (set.order) stale('block', o.id, 'order', b.order, set.order.old)
    if (set.area) stale('block', o.id, 'area', { id: b.areaFk }, set.area.old)
    if (set.point) stale('block', o.id, 'point', b.lat == null ? null : { lat: b.lat, lng: b.lng }, set.point.old)
  }
  for (const o of of('update_area')) {
    const a = areas.get(o.id)
    if (a == null) continue
    const { set } = o
    if (set.name) stale('area', o.id, 'name', a.name, set.name.old ?? '')
    if (set.description) stale('area', o.id, 'description', a.description, set.description.old)
    if (set.type) stale('area', o.id, 'type', a.type, set.type.old)
    if (set.parent) stale('area', o.id, 'parent', { id: a.parentFk }, set.parent.old)
  }
  for (const o of of('rename_fa')) {
    const f = fas.get(o.id)
    if (f != null) stale('first ascensionist', o.id, 'name', f.name, o.old)
  }
  const removed = new Set<string>()
  const updatedRoutes = new Set<number>()
  for (const o of ops.ops) {
    const kind = o.op.slice(o.op.indexOf('_') + 1)
    const used =
      'into' in o
        ? [`${kind} ${o.into}`, `${kind} ${o.gone}`]
        : 'id' in o && (o.op.startsWith('update_') || o.op.startsWith('delete_') || o.op === 'rename_fa')
          ? [`${kind} ${o.id}`]
          : []
    for (const row of used) if (removed.has(row)) fail(`${row} is used after an earlier op removed it`)
    if ('into' in o && o.gone === o.into) fail(`${o.op} merges ${o.gone} into itself`)
    // the update event's route_fk would point at the row the merge hard-deletes
    if (o.op === 'merge_route' && updatedRoutes.has(o.gone)) fail(`route ${o.gone} is updated, then merged away`)
    if ('gone' in o) removed.add(`${kind} ${o.gone}`)
    if (o.op.startsWith('delete_') && 'id' in o) removed.add(`${kind} ${o.id}`)
    if (o.op === 'update_route') updatedRoutes.add(o.id)
  }
  for (const kind of ['area', 'block', 'fa', 'route'] as const) {
    const created = ops.ops.flatMap((o) => (o.op === `create_${kind}` && 'key' in o ? [o.key] : []))
    const twice = created.length - new Set(created).size
    if (twice > 0) fail(`${twice} create_${kind} op(s) reuse another's key`)
  }
  const mergedFas = of('merge_fa').map((o) => o.gone)
  const claimed =
    mergedFas.length === 0
      ? []
      : await tx<{ id: number }[]>`
      select f.id from first_ascensionists f where f.id = any(${mergedFas}::int[])
        and (f.user_fk is not null or exists (select 1 from users u where u.first_ascentionist_fk = f.id))`
  for (const { id } of claimed) fail(`first ascensionist ${id} is merged away but an account holds it`)
  for (const o of of('merge_route')) {
    const clashes = await tx<{ topo: number }[]>`
      select c.topo_fk as topo from topo_routes c
      join topo_routes k on k.topo_fk = c.topo_fk and k.route_fk = ${o.into}
      where c.route_fk = ${o.gone} and (c.path is distinct from k.path or c.top_type <> k.top_type)`
    for (const { topo } of clashes)
      fail(`merging route ${o.gone} into ${o.into} would drop its different line on topo ${topo}`)
  }

  const grades = await tx<{ fb: null | string; id: number }[]>`select id, "FB" as fb from grades`
  const gradeIds = new Map<string, number>()
  const labels = [...of('create_route').map((o) => o.grade), ...of('update_route').map((o) => o.set.grade?.new)]
  let unmatched = 0
  for (const label of new Set(labels.filter((label) => label != null))) {
    const matches = grades.filter((grade) => grade.fb === fbLabel(label))
    if (matches.length === 1) gradeIds.set(label, matches[0].id)
    else unmatched++
  }
  if (unmatched > 0) fail(`${unmatched} grade label(s) match no grade or several`)
  const gradeId = (label: null | string | undefined) => (label == null ? null : gradeIds.get(label)!)

  const [settings] = await tx<{ tags: null | string[] }[]>`
    select settings -> 'tags' as tags from regions where id = ${region}`
  const vocabulary = new Set(settings?.tags ?? [])
  const tagsWritten = [
    ...of('create_route').flatMap((o) => o.tags),
    ...of('update_route').flatMap((o) => o.add_tags ?? []),
  ]
  const unknownTags = [...new Set(tagsWritten)].filter((tag) => !vocabulary.has(tag)).length
  if (unknownTags > 0) fail(`${unknownTags} tag(s) are not in the region's tag list`)

  ctx.preflight.abortIfFailed(`PREFLIGHT FAILED for region ${region}:`)

  /* ------------------------------------------------------------ state before */

  const live = (table: 'areas' | 'blocks') => tx<{ id: number }[]>`
    select x.id from ${tx(table)} x where x.region_fk = ${region} and x.deleted_at is null and (
      ${
        table === 'blocks'
          ? tx`exists (select 1 from routes r where r.block_fk = x.id and r.deleted_at is null)`
          : tx`exists (select 1 from blocks b where b.area_fk = x.id and b.deleted_at is null)
             or exists (select 1 from areas c where c.parent_fk = x.id and c.deleted_at is null)`
      })`
  const filledBefore = {
    areas: (await live('areas')).map((r) => r.id),
    blocks: (await live('blocks')).map((r) => r.id),
  }

  /* ------------------------------------------------------------------ writes */

  const log = new ChangeLog()
  const events: { id: number; kind: EntityKind; verb: 'create' | 'delete' }[] = []
  const keys = {
    area: new Map<string, number>(),
    block: new Map<string, number>(),
    fa: new Map<string, number>(),
    route: new Map<string, number>(),
  }
  const resolve = (kind: keyof typeof keys, r: Ref) => {
    if ('id' in r) return r.id
    const id = keys[kind].get(r.key)
    // the key itself stays out of the message: it is list text, which may carry content
    if (id == null) throw new Error(`guidebook-import: a ${kind} key is used before the run created it`)
    return id
  }
  const recalc = new Set<number>()
  const retire = async (kind: 'area' | 'block', id: number) => {
    await stampDeletedAt(db, kind === 'block' ? { blockIds: [id] } : { areaIds: [id] }, new Date(), null)
    events.push({ id, kind, verb: 'delete' })
  }
  const faNames = async (ids: number[]) =>
    (
      await tx<{ name: string }[]>`select name from first_ascensionists where id = any(${ids}::int[]) order by name`
    ).map((r) => r.name)
  const setFirstAscent = async (route: number, faIds: number[]) => {
    await tx`delete from routes_to_first_ascensionists
             where route_fk = ${route} and first_ascensionist_fk <> all(${faIds}::int[])`
    await tx`insert into routes_to_first_ascensionists (first_ascensionist_fk, region_fk, route_fk)
             select x, ${region}, ${route} from unnest(${faIds}::int[]) x
             where not exists (select 1 from routes_to_first_ascensionists t
                               where t.route_fk = ${route} and t.first_ascensionist_fk = x)`
  }
  const addTags = async (route: number, tags: string[]) => {
    if (tags.length === 0) return
    await tx`insert into routes_to_tags (region_fk, route_fk, tag_fk)
             select ${region}, ${route}, x from unnest(${tags}::text[]) x
             where not exists (select 1 from routes_to_tags t where t.route_fk = ${route} and t.tag_fk = x)`
  }
  const setPoint = async (block: number, geo: null | number, p: { estimated: boolean; lat: number; lng: number }) => {
    if (geo != null) {
      await tx`update geolocations set lat = ${p.lat}, long = ${p.lng}, estimated = ${p.estimated} where id = ${geo}`
      return
    }
    const [row] = await tx<{ id: number }[]>`
      insert into geolocations (region_fk, block_fk, lat, long, estimated)
      values (${region}, ${block}, ${p.lat}, ${p.lng}, ${p.estimated}) returning id`
    await tx`update blocks set geolocation_fk = ${row.id} where id = ${block}`
  }
  const counts: Record<string, number> = {}

  for (const o of ops.ops) {
    counts[o.op] = (counts[o.op] ?? 0) + 1
    switch (o.op) {
      case 'create_fa': {
        const [row] = await tx<{ id: number }[]>`
          insert into first_ascensionists (name, region_fk) values (${o.name}, ${region}) returning id`
        keys.fa.set(o.key, row.id)
        break
      }
      case 'create_area': {
        const parentFk = o.parent == null ? null : resolve('area', o.parent)
        const [row] = await db
          .insert(schema.areas)
          .values({
            createdBy: actor,
            description: blank(o.description ?? ''),
            name: o.name ?? '',
            parentFk,
            regionFk: region,
            type: o.type,
          })
          .returning({ id: schema.areas.id })
        keys.area.set(o.key, row.id)
        events.push({ id: row.id, kind: 'area', verb: 'create' })
        break
      }
      case 'update_area': {
        const a = areas.get(o.id)!
        const { set } = o
        if (set.name) {
          await tx`update areas set name = ${set.name.new ?? ''} where id = ${o.id}`
          log.record('area', o.id, 'name', a.name, set.name.new ?? '')
        }
        if (set.description) {
          await tx`update areas set description = ${blank(set.description.new ?? '')} where id = ${o.id}`
          log.record('area', o.id, 'description', a.description, set.description.new)
        }
        if (set.parent) {
          const parent = set.parent.new == null ? null : resolve('area', set.parent.new)
          await tx`update areas set parent_fk = ${parent} where id = ${o.id}`
          log.record('area', o.id, 'parentFk', a.parentFk, parent)
        }
        break
      }
      case 'create_block': {
        const areaFk = resolve('area', o.area)
        const order =
          o.order ??
          (await countOf(tx<{ c: number }[]>`
          select count(*)::int as c from blocks where area_fk = ${areaFk} and deleted_at is null`))
        const [row] = await db
          .insert(schema.blocks)
          .values({
            areaFk,
            createdBy: actor,
            description: blank(o.description ?? ''),
            name: o.name ?? '',
            order,
            regionFk: region,
          })
          .returning({ id: schema.blocks.id })
        keys.block.set(o.key, row.id)
        if (o.point != null) await setPoint(row.id, null, o.point)
        events.push({ id: row.id, kind: 'block', verb: 'create' })
        break
      }
      case 'update_block': {
        const b = blocks.get(o.id)!
        const { set } = o
        if (set.area) {
          const area = resolve('area', set.area.new)
          await tx`update blocks set area_fk = ${area} where id = ${o.id}`
          log.record('block', o.id, 'areaFk', b.areaFk, area)
        }
        if (set.order) await tx`update blocks set "order" = ${set.order.new} where id = ${o.id}`
        if (set.name) {
          await tx`update blocks set name = ${set.name.new ?? ''} where id = ${o.id}`
          log.record('block', o.id, 'name', b.name, set.name.new ?? '')
        }
        if (set.description) {
          await tx`update blocks set description = ${blank(set.description.new ?? '')} where id = ${o.id}`
          log.record('block', o.id, 'description', b.description, set.description.new)
        }
        if (set.point) {
          await setPoint(o.id, b.geo, set.point.new)
          log.record(
            'block',
            o.id,
            'location',
            b.lat == null ? null : stringifyCoords({ lat: b.lat, long: b.lng! }, b.estimated ?? false),
            stringifyCoords({ lat: set.point.new.lat, long: set.point.new.lng }, set.point.new.estimated),
          )
        }
        break
      }
      case 'create_route': {
        const blockFk = resolve('block', o.block)
        const [row] = await db
          .insert(schema.routes)
          .values({
            // the region-wide pass below writes every route's chain, once all moves are done
            areaFks: [],
            areaIds: '',
            blockFk,
            createdBy: actor,
            description: blank(o.description ?? ''),
            firstAscentYear: o.first_ascent_year,
            gradeFk: gradeId(o.grade),
            name: o.name ?? '',
            rating: o.rating,
            regionFk: region,
          })
          .returning({ id: schema.routes.id })
        keys.route.set(o.key, row.id)
        await setFirstAscent(
          row.id,
          o.first_ascent.map((r) => resolve('fa', r)),
        )
        await addTags(row.id, o.tags)
        events.push({ id: row.id, kind: 'route', verb: 'create' })
        recalc.add(row.id)
        break
      }
      case 'update_route': {
        const r = routes.get(o.id)!
        const { set } = o
        const update: Record<string, null | number | string> = {}
        if (set.block) {
          update.block_fk = resolve('block', set.block.new)
          log.record('route', o.id, 'blockFk', r.blockFk, update.block_fk)
        }
        if (set.name) {
          update.name = set.name.new ?? ''
          log.record('route', o.id, 'name', r.name, update.name)
        }
        if (set.grade) {
          update.grade_fk = gradeId(set.grade.new)
          log.record('route', o.id, 'gradeFk', r.gradeFk, update.grade_fk)
        }
        if (set.first_ascent_year) {
          update.first_ascent_year = set.first_ascent_year.new
          log.record('route', o.id, 'firstAscentYear', r.firstAscentYear, set.first_ascent_year.new)
        }
        if (set.rating) {
          update.rating = set.rating.new
          log.record('route', o.id, 'rating', r.rating, set.rating.new)
        }
        if (set.description) {
          update.description = blank(set.description.new ?? '')
          log.record('route', o.id, 'description', r.description ?? '', set.description.new)
        }
        if (Object.keys(update).length > 0) await tx`update routes set ${tx(update)} where id = ${o.id}`
        if (set.first_ascent) {
          const faIds = set.first_ascent.new.map((x) => resolve('fa', x))
          await setFirstAscent(o.id, faIds)
          log.record('route', o.id, 'firstAscensionists', faColumn(r.fa), faColumn(await faNames(faIds)))
        }
        await addTags(o.id, o.add_tags ?? [])
        recalc.add(o.id)
        break
      }
      case 'rename_fa':
        await tx`update first_ascensionists set name = ${o.new} where id = ${o.id}`
        break
      case 'merge_fa':
        await tx`delete from routes_to_first_ascensionists c using routes_to_first_ascensionists k
                 where c.first_ascensionist_fk = ${o.gone} and k.first_ascensionist_fk = ${o.into}
                   and k.route_fk = c.route_fk`
        await repoint(tx, 'first_ascensionists', o.gone, o.into)
        await tx`delete from first_ascensionists where id = ${o.gone}`
        break
      case 'delete_fa': {
        const held = await countOf(tx<{ c: number }[]>`
          select ((select count(*) from routes_to_first_ascensionists where first_ascensionist_fk = ${o.id})
            + (select count(*) from users where first_ascentionist_fk = ${o.id})
            + (select count(*) from first_ascensionists where id = ${o.id} and user_fk is not null))::int as c`)
        if (held > 0) throw new Error(`guidebook-import: first ascensionist ${o.id} is deleted but still linked`)
        await tx`delete from first_ascensionists where id = ${o.id}`
        break
      }
      case 'merge_route':
        await mergeRoute(tx, o.gone, o.into)
        recalc.delete(o.gone)
        recalc.add(o.into)
        break
      case 'merge_block':
      case 'merge_area': {
        const kind = o.op === 'merge_block' ? 'block' : 'area'
        let geo: null | number = null
        if (kind === 'block') {
          const [row] = await tx<
            { geo: null | number }[]
          >`select geolocation_fk as geo from blocks where id = ${o.gone}`
          geo = row?.geo ?? null
        }
        if (geo != null) {
          await tx`update blocks set geolocation_fk = null where id = ${o.gone}`
          await tx`update blocks set geolocation_fk = ${geo} where id = ${o.into} and geolocation_fk is null`
        }
        await tx`delete from import_refs where ${tx(`${kind}_fk`)} = ${o.gone}`
        await repoint(tx, CONTAINERS[kind], o.gone, o.into)
        if (geo != null) {
          await tx`delete from geolocations g where g.id = ${geo}
                   and not exists (select 1 from blocks b where b.geolocation_fk = g.id)`
        }
        await tx`update activities set entity_id = ${String(o.into)} where entity_type = ${kind} and entity_id = ${String(o.gone)}`
        await tx`update activities set parent_entity_id = ${String(o.into)}
                 where parent_entity_type = ${kind} and parent_entity_id = ${String(o.gone)}`
        await retire(kind, o.gone)
        break
      }
      case 'add_parking':
        await tx`insert into geolocations (region_fk, area_fk, lat, long, estimated)
                 values (${region}, ${resolve('area', o.area)}, ${o.lat}, ${o.lng}, false)`
        break
      case 'delete_route':
        await stampDeletedAt(db, { routeIds: [o.id] }, new Date(), null)
        events.push({ id: o.id, kind: 'route', verb: 'delete' })
        break
      case 'delete_block':
      case 'delete_area': {
        const kind = o.op === 'delete_block' ? 'block' : 'area'
        const held = await countOf(
          kind === 'block'
            ? tx<{ c: number }[]>`select count(*)::int as c from routes where block_fk = ${o.id} and deleted_at is null`
            : tx<{ c: number }[]>`select ((select count(*) from blocks where area_fk = ${o.id} and deleted_at is null)
              + (select count(*) from areas where parent_fk = ${o.id} and deleted_at is null))::int as c`,
        )
        if (held > 0) throw new Error(`guidebook-import: ${kind} ${o.id} is deleted but still holds ${held} row(s)`)
        await retire(kind, o.id)
        break
      }
    }
  }

  /* -------------------------------------------- links to rows the run created */

  const linkKeys = { areas: keys.area, blocks: keys.block, routes: keys.route }
  const unresolved: string[] = []
  const linked = (text: string, where: string) =>
    text.replace(NEW_LINK, (all, kind: keyof typeof linkKeys, key: string) => {
      const id = linkKeys[kind].get(key)
      if (id == null) unresolved.push(`${where} (a ${kind.slice(0, -1)} link)`)
      return id == null ? all : `!${kind}:${id}!`
    })
  for (const table of ['routes', 'blocks', 'areas'] as const) {
    const rows = await tx<{ description: string; id: number }[]>`
      select id, description from ${tx(table)}
      where region_fk = ${region} and deleted_at is null and description like ${'%:new:%'}`
    for (const row of rows) {
      const text = linked(row.description, `${table} ${row.id}`)
      if (text !== row.description) await tx`update ${tx(table)} set description = ${text} where id = ${row.id}`
    }
  }
  if (unresolved.length > 0)
    throw new Error(`guidebook-import: links to rows the run did not create:\n  - ${unresolved.join('\n  - ')}`)

  /* ----------------------------------------------------------------- derived */

  // Area chains for every live route of the region: moves and re-parenting reach far beyond what the list names.
  await tx`
    with recursive up(area, node, depth) as (
      select id, id, 0 from areas where region_fk = ${region}
      union all
      select up.area, a.parent_fk, up.depth + 1 from up join areas a on a.id = up.node
      -- a parent cycle stops here; the chain check below then fails the run instead of it hanging
      where a.parent_fk is not null and up.depth < 50
    ), chains as (select area, array_agg(node order by depth desc) as chain from up group by area)
    update routes r set area_fks = c.chain,
      area_ids = (select string_agg('^' || x || '$', ',' order by o) from unnest(c.chain) with ordinality t(x, o))
    from blocks b join chains c on c.area = b.area_fk
    where r.block_fk = b.id and r.region_fk = ${region} and r.deleted_at is null and r.area_fks is distinct from c.chain`
  for (const { id } of await tx<
    { id: number }[]
  >`select id from areas where region_fk = ${region} and deleted_at is null`) {
    await refreshAreaType(db, id)
  }
  for (const id of recalc) await recalcUserGradeAndRating(db, id)

  /* ------------------------------------------------------------------ events */

  const updates = log.events()
  const written = [...events, ...updates.map((update) => ({ ...update, verb: 'update' as const }))]
  for (const event of written) {
    const [row] = await db
      .insert(schema.events)
      .values({
        actorFk: actor,
        batch,
        regionFk: region,
        verb: event.verb,
        ...objectColumns({ id: event.id, type: event.kind }),
      })
      .returning({ id: schema.events.id })
    if ('changes' in event) {
      await db.insert(schema.changes).values(
        event.changes.map(({ columnName, newValue, oldValue }) => ({
          columnName,
          eventFk: row.id,
          newValue: newValue == null ? null : linked(newValue, `${event.kind} ${event.id} change`),
          oldValue,
          regionFk: region,
        })),
      )
    }
  }

  await recordImportRefs(
    db,
    ops.source,
    region,
    ops.refs.map((r) => ({
      id: resolve(r.kind, r.target),
      imported: {},
      kind: r.kind,
      ref: r.ref,
    })),
  )

  /* ------------------------------------------------------------ postconditions */

  const problems: string[] = []
  if (unresolved.length > 0) problems.push(`links to rows the run did not create: ${unresolved.join('; ')}`)
  // the app derives an area's type from what it holds; the list's type is what that must come to
  const typed = [
    ...of('create_area').map((o) => ({ id: resolve('area', { key: o.key }), type: o.type })),
    ...of('update_area').flatMap((o) => (o.set.type ? [{ id: o.id, type: o.set.type.new }] : [])),
  ]
  const types = new Map(
    (
      await tx<{ id: number; type: null | string }[]>`
      select id, type from areas where id = any(${typed.map((t) => t.id)}::int[])`
    ).map((r) => [r.id, r.type]),
  )
  const mistyped = typed
    .filter((t) => types.get(t.id) !== t.type)
    .map((t) => `${t.id} (list ${t.type ?? 'none'}, holds ${types.get(t.id) ?? 'nothing'})`)
  if (mistyped.length > 0)
    problems.push(`${mistyped.length} area(s) hold what their list type does not: ${mistyped.join(', ')}`)
  // the app adds a parking spot only to a live sector
  const parked = [...new Set(of('add_parking').map((o) => resolve('area', o.area)))]
  const badParking =
    parked.length === 0
      ? []
      : await tx<{ id: number }[]>`
      select id from areas where id = any(${parked}::int[]) and (deleted_at is not null or type is distinct from 'sector')`
  if (badParking.length > 0)
    problems.push(`parking spots on areas that are deleted or not a sector: ${badParking.map((r) => r.id).join(', ')}`)
  const deleted = {
    areas: new Set([...of('delete_area').map((o) => o.id), ...of('merge_area').map((o) => o.gone)]),
    blocks: new Set([...of('delete_block').map((o) => o.id), ...of('merge_block').map((o) => o.gone)]),
  }
  for (const table of ['blocks', 'areas'] as const) {
    const filled = new Set((await live(table)).map((r) => r.id))
    const emptied = filledBefore[table].filter((id) => !filled.has(id) && !deleted[table].has(id))
    const stillLive =
      emptied.length === 0
        ? []
        : await tx<{ id: number }[]>`
      select id from ${tx(table)} where id = any(${emptied}::int[]) and deleted_at is null`
    if (stillLive.length > 0) {
      problems.push(
        `${stillLive.length} ${table} emptied by the run but not deleted by the list: ${stillLive.map((r) => r.id).join(', ')}`,
      )
    }
  }
  const mixed = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from blocks b join areas a on a.id = b.area_fk
    where b.region_fk = ${region} and b.deleted_at is null
      and exists (select 1 from areas c where c.parent_fk = a.id and c.deleted_at is null)`)
  if (mixed > 0) problems.push(`${mixed} live block(s) sit directly in an area that holds areas`)
  const orphans = await countOf(tx<{ c: number }[]>`
    select ((select count(*) from blocks b join areas a on a.id = b.area_fk
             where b.region_fk = ${region} and b.deleted_at is null and a.deleted_at is not null)
          + (select count(*) from areas c join areas a on a.id = c.parent_fk
             where c.region_fk = ${region} and c.deleted_at is null and a.deleted_at is not null))::int as c`)
  if (orphans > 0) problems.push(`${orphans} live block(s) or area(s) sit in a deleted area`)
  const badChains = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from routes r join blocks b on b.id = r.block_fk
    where r.region_fk = ${region} and r.deleted_at is null
      and coalesce(r.area_fks[array_length(r.area_fks, 1)] <> b.area_fk
           or (select parent_fk from areas where id = r.area_fks[1]) is not null, true)`)
  if (badChains > 0) problems.push(`${badChains} route(s) carry an area chain that is not root to block`)
  const cyclic = await countOf(tx<{ c: number }[]>`
    with recursive walk(id, parent, depth) as (
      select id, parent_fk, 0 from areas where region_fk = ${region} and deleted_at is null
      union all
      select w.id, a.parent_fk, w.depth + 1 from walk w join areas a on a.id = w.parent where w.depth < 50)
    select count(distinct id)::int as c from walk where depth = 50 and parent is not null`)
  if (cyclic > 0) problems.push(`${cyclic} live area(s) never reach a root through their parents`)
  const deadRefs = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from import_refs i
    left join areas a on a.id = i.area_fk left join blocks b on b.id = i.block_fk left join routes r on r.id = i.route_fk
    where i.source = ${ops.source} and i.region_fk = ${region}
      and (a.deleted_at is not null or b.deleted_at is not null or r.deleted_at is not null)`)
  if (deadRefs > 0) problems.push(`${deadRefs} import ref(s) point at a deleted area, block or route`)
  const stranded = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from routes r join blocks b on b.id = r.block_fk
    where r.region_fk = ${region} and r.deleted_at is null and b.deleted_at is not null`)
  if (stranded > 0) problems.push(`${stranded} live route(s) sit in a deleted block`)
  const eventCount = await batchEvents()
  if (eventCount !== written.length) problems.push(`${eventCount} events in the batch, ${written.length} written`)
  if (problems.length > 0) throw new Error(`guidebook-import: postconditions failed:\n  - ${problems.join('\n  - ')}`)

  // Stamped last: an insert-time stamp falls behind the digest watermark before the commit shows it.
  await tx`update events set created_at = (select clock_timestamp()),
    batch_size = case when id = (select max(id) from events where batch = ${batch}) then ${eventCount}::int end
    where batch = ${batch}`

  const duplicates = await tx<{ name: string; parent: number; what: string }[]>`
    select 'route' as what, block_fk as parent, name from routes
    where region_fk = ${region} and deleted_at is null and name <> '' group by block_fk, name having count(*) > 1
    union all
    select 'block', area_fk, name from blocks
    where region_fk = ${region} and deleted_at is null and name <> '' group by area_fk, name having count(*) > 1`
  for (const d of duplicates)
    warn(`two live ${d.what}s share a name under ${d.what === 'route' ? 'block' : 'area'} ${d.parent}`)
  // `blockName` numbers a nameless block by its slot, so two at one slot read the same
  const unslotted = await tx<{ area: number }[]>`
    select area_fk as area from blocks where region_fk = ${region} and deleted_at is null group by area_fk
    having min("order") <> 0 or max("order") <> count(*) - 1 or count(distinct "order") <> count(*)`
  if (unslotted.length > 0)
    warn(`${unslotted.length} area(s) hold block slots that are not 0..n-1: ${unslotted.map((r) => r.area).join(', ')}`)

  return { counts, events: written.length }
}

/** Fails the run when a new table references `routes` that `mergeRoute` would leave pointing at a deleted copy. */
async function assertRouteReferences(tx: Tx, fail: Preflight['fail']) {
  const found = (await referencingColumns(tx, 'routes')).map(({ col, tbl }) => `${tbl}.${col}`).sort()
  const unhandled = found.filter((ref) => !ROUTE_REFERENCES.includes(ref))
  const missing = ROUTE_REFERENCES.filter((ref) => !found.includes(ref))
  if (unhandled.length > 0) fail(`foreign keys to routes this script does not re-point: ${unhandled.join(', ')}`)
  if (missing.length > 0) fail(`foreign keys to routes that no longer exist: ${missing.join(', ')}`)
}

/** Moves everything that names `copy` onto `keep`, dropping what `keep` already has, then hard-deletes `copy`. */
async function mergeRoute(tx: Tx, copy: number, keep: number) {
  await tx`update ascents set route_fk = ${keep} where route_fk = ${copy}`
  await tx`update files set route_fk = ${keep} where route_fk = ${copy}`
  // Preflight refused a merge where the two lines on one topo differ, so this drops a duplicate.
  await tx`delete from topo_routes c using topo_routes k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.topo_fk = c.topo_fk`
  await tx`update topo_routes set route_fk = ${keep} where route_fk = ${copy}`
  await tx`delete from routes_to_tags c using routes_to_tags k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.tag_fk = c.tag_fk`
  await tx`update routes_to_tags set route_fk = ${keep} where route_fk = ${copy}`
  // The list set the survivor's first ascent already, so the copy's credits go.
  await tx`delete from routes_to_first_ascensionists where route_fk = ${copy}`
  await tx`update route_external_resources set route_fk = ${keep} where route_fk = ${copy}`
  await tx`update routes k set external_resources_fk = c.external_resources_fk from routes c
           where k.id = ${keep} and c.id = ${copy} and k.external_resources_fk is null`
  await tx`update routes set external_resources_fk = null where id = ${copy}`
  await tx`delete from favorites c using favorites k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.user_fk = c.user_fk`
  await tx`update favorites set route_fk = ${keep} where route_fk = ${copy}`
  // Events carry the comments and reactions, so they move rather than cascade away with the copy.
  await tx`update events set route_fk = ${keep} where route_fk = ${copy}`
  await tx`update changes set route_fk = ${keep} where route_fk = ${copy}`
  await tx`delete from import_refs where route_fk = ${copy}`
  // `notifications_source_idx` would refuse the second of two rows that differ only in the route.
  await tx`delete from notifications c using notifications k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.user_fk = c.user_fk
             and k.source_type = c.source_type and k.region_fk = c.region_fk
             and k.actor_fk is not distinct from c.actor_fk and k.event_fk is not distinct from c.event_fk
             and k.subject_fk is not distinct from c.subject_fk`
  await tx`update notifications set route_fk = ${keep} where route_fk = ${copy}`
  await tx`update activities set entity_id = ${String(keep)} where entity_type = 'route' and entity_id = ${String(copy)}`
  await tx`update activities set parent_entity_id = ${String(keep)}
           where parent_entity_type = 'route' and parent_entity_id = ${String(copy)}`
  await tx`delete from routes where id = ${copy}`
}

const CONTAINERS = { area: 'areas', block: 'blocks' } as const
const referencing = new Map<string, Promise<{ col: string; tbl: string }[]>>()

/** Every column with a foreign key to `table`. */
const referencingColumns = (tx: Tx, table: string) =>
  tx<{ col: string; tbl: string }[]>`
    select cl.relname as tbl, a.attname as col from pg_constraint co
    join pg_class cl on cl.oid = co.conrelid
    join pg_attribute a on a.attrelid = co.conrelid and a.attnum = any(co.conkey)
    where co.contype = 'f' and co.confrelid = ${`public.${table}`}::regclass`

/** Re-points every foreign key to `table.gone` at `into`; a unique clash aborts the run rather than dropping a row. */
async function repoint(tx: Tx, table: 'areas' | 'blocks' | 'first_ascensionists', gone: number, into: number) {
  let columns = referencing.get(table)
  if (columns == null) {
    columns = referencingColumns(tx, table)
    referencing.set(table, columns)
  }
  for (const { col, tbl } of await columns) {
    await tx`update ${tx(tbl)} set ${tx(col)} = ${into} where ${tx(col)} = ${gone}`
  }
}
