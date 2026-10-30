/**
 * Apply a guidebook repair plan, written by the offline comparison tool, to one region: relic
 * descriptions, field updates, merges of first-import copies, missed routes and blocks, moves,
 * renames, re-parenting and deletes, then everything the app derives from them. One transaction.
 *
 * DRY RUN by default: runs everything, prints it, ROLLS BACK. Run it while nobody edits the region.
 * Writes no notifications and calls nothing outside the database; Zero replicates the result.
 *
 *   DATABASE_URL   required
 *   REGION         region id every id in the plan must belong to
 *   PLAN           path to the plan JSON
 *   BATCH          label stamped on every event this run writes, e.g. guidebook-repair-2026-10
 *   ACTOR          user the events and new rows are attributed to (default 1)
 *   SQL_OUT        optional file to write every executed statement and its parameters to
 *   CONFIRM=true   commit instead of rolling back
 *
 * Run order: a dry run with SQL_OUT, read the file and the summary, then the same command with
 * CONFIRM=true. A batch label is single-use: a second run with the same BATCH refuses.
 *
 *   DATABASE_URL=… REGION=7 PLAN=plan.json BATCH=guidebook-repair-2026-10 SQL_OUT=dry.sql \
 *     npx tsx src/lib/db/scripts/guidebook-import.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import type postgres from 'postgres'
import { areaAncestry, areaIdsOf, refreshAreaType, stampDeletedAt } from '../../entities/area/area.server'
import { objectColumns } from '../../entities/event/event.server'
import { resolveFirstAscensionists } from '../../entities/route/firstAscensionist.server'
import { recalcUserGradeAndRating } from '../../entities/route/user-grade.server'
import { blank } from '../../forms/schemas'
import * as schema from '../schema'
import {
  byPage,
  ChangeLog,
  conflicts,
  faColumn,
  fbLabel,
  parsePlan,
  planLabel,
  planNewBlocks,
  splitFirstAscent,
  staleFields,
  type EntityKind,
  type RouteState,
} from './guidebookPlan'
import { connect, countOf, Preflight, runTransaction, type Tx } from './regionMove'

const REGION = Number(process.env.REGION)
const PLAN = process.env.PLAN
const BATCH = process.env.BATCH?.trim()
const ACTOR = Number(process.env.ACTOR ?? 1)
const SQL_OUT = process.env.SQL_OUT
const CONFIRM = process.env.CONFIRM === 'true'
if (!Number.isInteger(REGION)) throw new Error('guidebook-import: REGION is required')
if (!PLAN) throw new Error('guidebook-import: PLAN is required')
if (!BATCH) throw new Error('guidebook-import: BATCH is required')
if (!Number.isInteger(ACTOR)) throw new Error('guidebook-import: ACTOR must be a user id')

const plan = parsePlan(JSON.parse(readFileSync(PLAN, 'utf8')))

/** Every table column with a foreign key to `routes.id`, each re-pointed by `mergeRoute`. */
const ROUTE_REFERENCES = [
  'ascents.route_fk',
  'changes.route_fk',
  'events.route_fk',
  'favorites.route_fk',
  'files.route_fk',
  'notifications.route_fk',
  'route_external_resources.route_fk',
  'routes_to_first_ascensionists.route_fk',
  'routes_to_tags.route_fk',
  'topo_routes.route_fk',
]

if (SQL_OUT) writeFileSync(SQL_OUT, `-- guidebook-import region ${REGION} batch ${BATCH} plan ${PLAN}\n\n`)
const sql = connect(
  'guidebook-import',
  SQL_OUT
    ? { debug: (_, query, params) => appendFileSync(SQL_OUT, `${query.trim()};\n-- ${JSON.stringify(params)}\n\n`) }
    : {},
)

const preflight = new Preflight()
const { fail, warn } = preflight

interface ContainerRow {
  areaFk: null | number
  blocks: number
  children: number
  deleted: boolean
  id: number
  name: string
  parentFk: null | number
  regionFk: number
}

interface RouteRow {
  areaFk: number
  blockFk: number
  deleted: boolean
  description: null | string
  fa: string[]
  fb: null | string
  firstAscentYear: null | number
  gradeFk: null | number
  id: number
  name: string
  regionFk: number
}

const unique = (ids: (null | number)[]) => [...new Set(ids.filter((id) => id != null))]
const relicIds = (table: string) =>
  Object.keys(plan.relics)
    .filter((key) => key.startsWith(`${table}:`))
    .map((key) => Number(key.slice(table.length + 1)))
const stateOf = (route: RouteRow): RouteState => ({
  description: route.description,
  first_ascent: route.fa,
  first_ascent_year: route.firstAscentYear,
  grade: planLabel(route.fb),
  name: route.name,
})

const loadRoutes = async (tx: Tx, ids: number[]) =>
  new Map(
    (
      await tx<RouteRow[]>`
        select r.id, r.region_fk as "regionFk", r.deleted_at is not null as deleted, r.block_fk as "blockFk",
          b.area_fk as "areaFk", r.name, r.description, r.first_ascent_year as "firstAscentYear",
          r.grade_fk as "gradeFk", g."FB" as fb,
          array(select f.name from routes_to_first_ascensionists t
                join first_ascensionists f on f.id = t.first_ascensionist_fk
                where t.route_fk = r.id order by f.name) as fa
        from routes r join blocks b on b.id = r.block_fk left join grades g on g.id = r.grade_fk
        where r.id = any(${ids}::int[])`
    ).map((row) => [row.id, row]),
  )

const loadContainers = async (tx: Tx, table: 'areas' | 'blocks', ids: number[]) =>
  new Map(
    (
      await tx<ContainerRow[]>`
        select x.id, x.region_fk as "regionFk", x.deleted_at is not null as deleted, x.name,
          ${table === 'blocks' ? tx`x.area_fk` : tx`null::int`} as "areaFk",
          ${table === 'areas' ? tx`x.parent_fk` : tx`null::int`} as "parentFk",
          (select count(*)::int from areas c where c.parent_fk = x.id and c.deleted_at is null) as children,
          (select count(*)::int from blocks c where c.area_fk = x.id and c.deleted_at is null) as blocks
        from ${tx(table)} x where x.id = any(${ids}::int[])`
    ).map((row) => [row.id, row]),
  )

/** Fails the run when a new table references `routes` that `mergeRoute` would leave pointing at a deleted copy. */
async function assertRouteReferences(tx: Tx) {
  const found = (
    await tx<{ ref: string }[]>`
      select cl.relname || '.' || a.attname as ref from pg_constraint co
      join pg_class cl on cl.oid = co.conrelid
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = any(co.conkey)
      where co.contype = 'f' and co.confrelid = 'public.routes'::regclass order by 1`
  ).map((row) => row.ref)
  const unhandled = found.filter((ref) => !ROUTE_REFERENCES.includes(ref))
  const missing = ROUTE_REFERENCES.filter((ref) => !found.includes(ref))
  if (unhandled.length > 0) fail(`foreign keys to routes this script does not re-point: ${unhandled.join(', ')}`)
  if (missing.length > 0) fail(`foreign keys to routes that no longer exist: ${missing.join(', ')}`)
}

/** Moves everything that names `copy` onto `keep`, dropping what `keep` already has, then hard-deletes `copy`. */
async function mergeRoute(tx: Tx, copy: number, keep: number, dropCredits: boolean) {
  await tx`update ascents set route_fk = ${keep} where route_fk = ${copy}`
  await tx`update files set route_fk = ${keep} where route_fk = ${copy}`
  // Preflight refused a merge where the two lines on one topo differ, so this drops a duplicate.
  await tx`delete from topo_routes c using topo_routes k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.topo_fk = c.topo_fk`
  await tx`update topo_routes set route_fk = ${keep} where route_fk = ${copy}`
  await tx`delete from routes_to_tags c using routes_to_tags k
           where c.route_fk = ${copy} and k.route_fk = ${keep} and k.tag_fk = c.tag_fk`
  await tx`update routes_to_tags set route_fk = ${keep} where route_fk = ${copy}`
  await tx`delete from routes_to_first_ascensionists c
           where c.route_fk = ${copy} and (${dropCredits} or exists (
             select 1 from routes_to_first_ascensionists k
             where k.route_fk = ${keep} and k.first_ascensionist_fk = c.first_ascensionist_fk))`
  await tx`update routes_to_first_ascensionists set route_fk = ${keep} where route_fk = ${copy}`
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

await runTransaction(sql, CONFIRM, async (tx) => {
  // postgres.js leaves `options` off a transaction handle, and drizzle reads it once for its parsers.
  const db = drizzle(Object.assign(tx, { options: sql.options }) as unknown as postgres.Sql, { schema })

  /* ---------------------------------------------------------------- preflight */

  const [region] = await tx<{ name: string }[]>`select name from regions where id = ${REGION}`
  if (region == null) throw new Error(`guidebook-import: region ${REGION} does not exist`)

  const [actor] = await tx<{ member: boolean }[]>`
    select exists (select 1 from region_members m where m.region_fk = ${REGION} and m.user_fk = u.id) as member
    from users u where u.id = ${ACTOR}`
  if (actor == null) fail(`actor ${ACTOR} does not exist`)
  else if (!actor.member) warn(`actor ${ACTOR} is not a member of region ${REGION}`)
  if ((await countOf(tx<{ c: number }[]>`select count(*)::int as c from events where batch = ${BATCH}`)) > 0) {
    fail(`batch "${BATCH}" already has events; pick a new label rather than doubling them`)
  }
  await assertRouteReferences(tx)
  for (const conflict of conflicts(plan)) fail(conflict)

  // A topo line someone drew on the route's current block outranks the book's block division: it stays.
  const drawnHere = await tx<{ route: number }[]>`
    select distinct tr.route_fk as route from topo_routes tr
    join topos t on t.id = tr.topo_fk join routes r on r.id = tr.route_fk
    where tr.route_fk = any(${plan.moves.map((move) => move.route)}::int[]) and t.block_fk = r.block_fk`
  const keptByTopo = new Set(drawnHere.map(({ route }) => route))
  plan.moves = plan.moves.filter((move) => !keptByTopo.has(move.route))

  const routeIds = unique([
    ...Object.keys(plan.updates).map(Number),
    ...relicIds('routes'),
    ...plan.delete,
    ...plan.merge.flat(),
    ...plan.moves.map((move) => move.route),
  ])
  const routes = await loadRoutes(tx, routeIds)
  const blockIds = unique([
    ...plan.create.map((create) => create.block),
    ...plan.moves.map((move) => move.block),
    ...plan.block_renames.map(([block]) => block),
    ...plan.new_sectors.flatMap((sector) => sector.blocks),
    ...plan.delete_blocks,
    ...relicIds('blocks'),
  ])
  const blocks = await loadContainers(tx, 'blocks', blockIds)
  const { blocks: newBlocks, errors } = planNewBlocks(plan, (route) => routes.get(route)?.areaFk)
  for (const error of errors) fail(error)
  const areaIds = unique([
    ...plan.create.map((create) => create.area),
    ...newBlocks.map((block) => block.area),
    ...plan.sector_renames.map(([area]) => area),
    ...plan.sector_parents.flatMap(([area, parent]) => [area, parent]),
    ...plan.new_sectors.map((sector) => sector.area),
    ...relicIds('areas'),
  ])
  const areas = await loadContainers(tx, 'areas', areaIds)
  // A new block of a book block a new sector claims goes into that sector, not into the area it is keyed by.
  const sectorOf = (area: number, bookBlock: string) =>
    plan.new_sectors.find((sector) => sector.area === area && sector.book_blocks.includes(bookBlock))?.key

  for (const [what, ids, rows] of [
    ['route', routeIds, routes],
    ['block', blockIds, blocks],
    ['area', areaIds, areas],
  ] as const) {
    for (const id of ids) {
      const row = rows.get(id)
      if (row == null) fail(`${what} ${id} does not exist`)
      else if (row.regionFk !== REGION) fail(`${what} ${id} is in region ${row.regionFk}, not ${REGION}`)
      else if (row.deleted) fail(`${what} ${id} is soft-deleted`)
    }
  }

  const grades = await tx<{ fb: null | string; id: number }[]>`select id, "FB" as fb from grades`
  const gradeIds = new Map<string, number>()
  const labels = [
    ...Object.values(plan.updates).map((update) => update.grade?.new),
    ...plan.create.map((create) => create.grade),
  ]
  for (const label of new Set(labels.filter((label) => label != null))) {
    const matches = grades.filter((grade) => grade.fb === fbLabel(label))
    if (matches.length === 1) gradeIds.set(label, matches[0].id)
    else fail(`grade "${label}" matches ${matches.length} grades, not one`)
  }
  const gradeId = (label: null | string) => (label == null ? null : gradeIds.get(label)!)

  for (const [key, update] of Object.entries(plan.updates)) {
    const route = routes.get(Number(key))
    if (route == null) continue
    for (const field of staleFields(stateOf(route), update, 'old')) {
      fail(`route ${key} ${field} changed since the plan (now ${JSON.stringify(stateOf(route)[field])})`)
    }
  }

  for (const [copy, keep] of plan.merge) {
    const clashes = await tx<{ topo: number }[]>`
      select c.topo_fk as topo from topo_routes c
      join topo_routes k on k.topo_fk = c.topo_fk and k.route_fk = ${keep}
      where c.route_fk = ${copy} and (c.path is distinct from k.path or c.top_type <> k.top_type)`
    for (const { topo } of clashes) {
      fail(`merging route ${copy} into ${keep} would drop its different line on topo ${topo}`)
    }
    const planned = plan.updates[keep]?.first_ascent
    const credits = routes.get(copy)?.fa ?? []
    const kept = new Set(splitFirstAscent(planned?.new ?? null).map((name) => name.toLowerCase()))
    if (planned != null && credits.some((name) => !kept.has(name.toLowerCase()))) {
      warn(`route ${copy}'s first ascent (${credits.join(', ')}) is dropped: the plan sets route ${keep}'s`)
    }
  }

  for (const create of plan.create) {
    const block = create.block == null ? undefined : blocks.get(create.block)
    if (block != null && block.areaFk !== create.area) {
      fail(`create "${create.name}" names block ${create.block}, which is in area ${block.areaFk}, not ${create.area}`)
    }
  }
  for (const block of newBlocks) {
    if ((areas.get(block.area)?.children ?? 0) > 0) {
      fail(`new block "${block.name}" would go into area ${block.area}, which holds areas; areas and blocks do not mix`)
    }
  }

  for (const sector of plan.new_sectors) {
    const area = areas.get(sector.area)
    if (area != null && area.children > 0) fail(`area ${sector.area} already holds areas; new sector "${sector.name}"`)
    for (const block of sector.blocks) {
      const row = blocks.get(block)
      if (row != null && row.areaFk !== sector.area) {
        fail(`new sector "${sector.name}" takes block ${block}, which is in area ${row.areaFk}, not ${sector.area}`)
      }
    }
  }
  if (plan.delete_blocks.length > 0) {
    // A location alone does not keep a block: the first import wrote the book's GPS as block locations.
    const occupied = await tx<{ attached: number; id: number; located: number; routes: number }[]>`
      select b.id,
        (select count(*)::int from routes r where r.block_fk = b.id and r.deleted_at is null) as routes,
        (select count(*)::int from topos t where t.block_fk = b.id)
          + (select count(*)::int from files f where f.block_fk = b.id) as attached,
        (select count(*)::int from geolocations g where g.block_fk = b.id) as located
      from blocks b where b.id = any(${plan.delete_blocks}::int[])`
    for (const block of occupied) {
      if (block.routes > 0) fail(`block ${block.id} is to be deleted as empty but holds ${block.routes} route(s)`)
      if (block.attached === 0) {
        if (block.located > 0) warn(`empty block ${block.id} is deleted with its location`)
        continue
      }
      const sector = plan.new_sectors.find((s) => s.keep?.includes(block.id))
      if (sector == null) {
        fail(`empty block ${block.id} has ${block.attached} topo(s) or file(s) and no sector to keep it`)
        continue
      }
      warn(`empty block ${block.id} kept for its ${block.attached} topo(s) or file(s): into "${sector.name}"`)
      plan.delete_blocks = plan.delete_blocks.filter((id) => id !== block.id)
      sector.blocks.push(block.id)
    }
  }

  const gebiete = new Map<string, null | number>()
  for (const [area, parent, gebiet] of plan.sector_parents) {
    if (parent == null) {
      const roots = await tx<{ blocks: boolean; id: number }[]>`
        select id, exists (select 1 from blocks b where b.area_fk = a.id and b.deleted_at is null) as blocks
        from areas a
        where region_fk = ${REGION} and parent_fk is null and deleted_at is null and name = ${gebiet}`
      if (gebiet.trim() === '') fail(`sector ${area} gets a new root area with no name`)
      else if (roots.length > 1) fail(`${roots.length} root areas are named "${gebiet}"; give sector ${area} an id`)
      else if (roots[0]?.blocks) fail(`root area "${gebiet}" holds blocks, so sector ${area} cannot hang under it`)
      gebiete.set(gebiet, roots[0]?.id ?? null)
      continue
    }
    const target = areas.get(parent)
    if (target == null) continue
    if (target.blocks > 0) fail(`area ${parent} holds blocks, so sector ${area} cannot hang under it`)
    if ((await areaAncestry(db, parent)).includes(area)) fail(`area ${parent} sits inside sector ${area}`)
    if (target.name !== gebiet)
      warn(`sector ${area}'s new parent ${parent} is "${target.name}", the plan says "${gebiet}"`)
  }

  preflight.abortIfFailed(`PREFLIGHT FAILED for ${PLAN} in region ${REGION} ("${region.name}"):`)

  /* --------------------------------------------------------- state before */

  const totalBefore = await countOf(
    tx<{ c: number }[]>`select count(*)::int as c from routes where region_fk = ${REGION}`,
  )
  const strandedQuery = () => tx<{ c: number }[]>`
    select count(*)::int as c from routes r join blocks b on b.id = r.block_fk
    where r.region_fk = ${REGION} and r.deleted_at is null and b.deleted_at is not null`
  const strandedBefore = await countOf(strandedQuery())
  const blocksWithRoutes = (
    await tx<{ id: number }[]>`
      select distinct block_fk as id from routes where region_fk = ${REGION} and deleted_at is null`
  ).map((row) => row.id)
  const areasWithChildren = (
    await tx<{ id: number }[]>`
      select a.id from areas a where a.region_fk = ${REGION} and a.deleted_at is null
        and (exists (select 1 from blocks b where b.area_fk = a.id and b.deleted_at is null)
          or exists (select 1 from areas c where c.parent_fk = a.id and c.deleted_at is null))`
  ).map((row) => row.id)

  /* ------------------------------------------------------------------ writes */

  const log = new ChangeLog()
  const events: { id: number; kind: EntityKind; verb: 'create' | 'delete' }[] = []
  const recalc = new Set<number>()
  const rechain = new Set<number>()
  const orderAreas = new Set<number>()
  const typeAreas = new Set<number>()
  const createdRoutes: number[] = []

  const setFirstAscent = async (routeId: number, names: string[]) => {
    const resolved = await resolveFirstAscensionists(
      db,
      names.map((name) => ({ name })),
      REGION,
      ACTOR,
    )
    const ids = resolved.map((row) => row.id)
    await tx`delete from routes_to_first_ascensionists
             where route_fk = ${routeId} and first_ascensionist_fk <> all(${ids}::int[])`
    await tx`insert into routes_to_first_ascensionists (first_ascensionist_fk, region_fk, route_fk)
             select x, ${REGION}, ${routeId} from unnest(${ids}::int[]) x
             where not exists (select 1 from routes_to_first_ascensionists t
                               where t.route_fk = ${routeId} and t.first_ascensionist_fk = x)`
    return resolved.map((row) => row.name)
  }

  // 1. Relics: a description the first import put somewhere else.
  for (const [key, description] of Object.entries(plan.relics)) {
    const [table, id] = [key.slice(0, key.indexOf(':')) as 'areas' | 'blocks' | 'routes', Number(key.split(':')[1])]
    const [row] = await tx<{ description: null | string }[]>`select description from ${tx(table)} where id = ${id}`
    await tx`update ${tx(table)} set description = ${blank(description)} where id = ${id}`
    const kind = table.slice(0, -1) as EntityKind
    // `updateRouteRow` diffs a route's old description as '' when unset; blocks and areas keep null.
    log.record(kind, id, 'description', kind === 'route' ? (row.description ?? '') : row.description, description)
  }

  // 2. Field updates, as `updateRouteRow` writes and logs them.
  for (const [key, update] of Object.entries(plan.updates)) {
    const id = Number(key)
    const route = routes.get(id)!
    const set: Record<string, null | number | string> = {}
    if (update.name != null) {
      set.name = update.name.new
      log.record('route', id, 'name', route.name, update.name.new)
    }
    if (update.grade != null) {
      set.grade_fk = gradeId(update.grade.new)
      log.record('route', id, 'gradeFk', route.gradeFk, set.grade_fk)
    }
    if (update.first_ascent_year != null) {
      set.first_ascent_year = update.first_ascent_year.new
      log.record('route', id, 'firstAscentYear', route.firstAscentYear, update.first_ascent_year.new)
    }
    if (update.description != null) {
      set.description = blank(update.description.new ?? '')
      log.record('route', id, 'description', route.description ?? '', update.description.new)
    }
    if (Object.keys(set).length > 0) await tx`update routes set ${tx(set)} where id = ${id}`
    if (update.first_ascent != null) {
      const names = await setFirstAscent(id, splitFirstAscent(update.first_ascent.new))
      log.record('route', id, 'firstAscensionists', faColumn(route.fa), faColumn(names))
    }
    recalc.add(id)
  }

  // 3. Merges: the copy's history moves to the route that stays.
  for (const [copy, keep] of plan.merge) {
    await mergeRoute(tx, copy, keep, plan.updates[keep]?.first_ascent != null)
    recalc.add(keep)
  }

  // 4. New sectors for the level the first import flattened; their blocks move in with their ids.
  const sectorIds = new Map<string, number>()
  for (const sector of plan.new_sectors) {
    const [created] = await db
      .insert(schema.areas)
      .values({
        createdBy: ACTOR,
        description: blank(sector.description ?? ''),
        name: sector.name,
        parentFk: sector.area,
        regionFk: REGION,
        type: null,
      })
      .returning({ id: schema.areas.id })
    sectorIds.set(sector.key, created.id)
    events.push({ id: created.id, kind: 'area', verb: 'create' })
    if (sector.blocks.length > 0)
      await tx`update blocks set area_fk = ${created.id} where id = any(${sector.blocks}::int[])`
    const under = await tx<{ id: number }[]>`select id from routes where block_fk = any(${sector.blocks}::int[])`
    for (const { id } of under) rechain.add(id)
    for (const area of [created.id, sector.area]) {
      orderAreas.add(area)
      typeAreas.add(area)
    }
  }

  // 5. Creates, new blocks first, each appended to its area as `createBlockRow` appends.
  const newBlockIds = new Map<string, number>()
  for (const block of newBlocks) {
    const key = sectorOf(block.area, block.bookBlock)
    const area = key == null ? block.area : sectorIds.get(key)!
    const order = await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from blocks where area_fk = ${area} and deleted_at is null`)
    const [created] = await db
      .insert(schema.blocks)
      .values({ areaFk: area, createdBy: ACTOR, description: null, name: block.name, order, regionFk: REGION })
      .returning({ id: schema.blocks.id })
    newBlockIds.set(`${block.area}:${block.bookBlock}`, created.id)
    await refreshAreaType(db, area)
    events.push({ id: created.id, kind: 'block', verb: 'create' })
    orderAreas.add(area)
  }
  for (const create of [...plan.create].sort(byPage)) {
    const blockFk = create.block ?? newBlockIds.get(`${create.area}:${create.book_block}`)!
    const areaFks = await areaAncestry(db, create.area)
    const [route] = await db
      .insert(schema.routes)
      .values({
        areaFks,
        areaIds: areaIdsOf(areaFks),
        blockFk,
        createdBy: ACTOR,
        description: blank(create.description ?? ''),
        firstAscentYear: create.first_ascent_year,
        gradeFk: gradeId(create.grade),
        name: create.name ?? '',
        regionFk: REGION,
      })
      .returning({ id: schema.routes.id })
    await setFirstAscent(route.id, splitFirstAscent(create.first_ascent))
    events.push({ id: route.id, kind: 'route', verb: 'create' })
    createdRoutes.push(route.id)
    recalc.add(route.id)
    rechain.add(route.id)
  }

  // 6. Moves.
  for (const move of plan.moves) {
    const route = routes.get(move.route)!
    const blockFk = move.block ?? newBlockIds.get(`${route.areaFk}:${move.book_block}`)!
    await tx`update routes set block_fk = ${blockFk} where id = ${move.route}`
    rechain.add(move.route)
  }

  // 7. Block and sector renames.
  for (const [kind, table, renames, rows] of [
    ['block', 'blocks', plan.block_renames, blocks],
    ['area', 'areas', plan.sector_renames, areas],
  ] as const) {
    for (const [id, name] of renames) {
      await tx`update ${tx(table)} set name = ${name} where id = ${id}`
      log.record(kind, id, 'name', rows.get(id)!.name, name)
    }
  }

  // 8. Sector parents. A null parent is the region's root area of that name, created if missing.
  for (const [area, parent, gebiet] of plan.sector_parents) {
    let target = parent ?? gebiete.get(gebiet) ?? null
    if (target == null) {
      const [created] = await db
        .insert(schema.areas)
        .values({ createdBy: ACTOR, description: null, name: gebiet, parentFk: null, regionFk: REGION, type: null })
        .returning({ id: schema.areas.id })
      target = created.id
      gebiete.set(gebiet, target)
      events.push({ id: target, kind: 'area', verb: 'create' })
    }
    const from = areas.get(area)!.parentFk
    await tx`update areas set parent_fk = ${target} where id = ${area}`
    if (from != null) typeAreas.add(from)
    typeAreas.add(target)
    const under = await tx<{ id: number }[]>`
      select r.id from routes r join blocks b on b.id = r.block_fk
      where ${area} = any(r.area_fks) or b.area_fk = ${area}`
    for (const { id } of under) rechain.add(id)
  }

  // 9. Deletes, soft and logged as `deleteRouteRow` does past its grace window.
  if (plan.delete.length > 0) await stampDeletedAt(db, { routeIds: plan.delete }, new Date(), null)
  for (const id of plan.delete) events.push({ id, kind: 'route', verb: 'delete' })

  // 10. Empty blocks a split area leaves behind, listed in the plan: an area may hold no block itself.
  if (plan.delete_blocks.length > 0) {
    const filled = await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from routes where block_fk = any(${plan.delete_blocks}::int[]) and deleted_at is null`)
    if (filled > 0) throw new Error(`guidebook-import: ${filled} route(s) landed in a block the plan deletes as empty`)
    await stampDeletedAt(db, { blockIds: plan.delete_blocks }, new Date(), null)
  }
  for (const id of plan.delete_blocks) {
    events.push({ id, kind: 'block', verb: 'delete' })
    const area = blocks.get(id)!.areaFk!
    orderAreas.add(area)
    typeAreas.add(area)
  }

  /* ------------------------------------------------------- cleanup, derived */

  // Blocks this run emptied, then areas, upwards. Their deletion scale is all zeros, so no metadata.
  const emptiedBlocks = await tx<{ areaFk: number; id: number }[]>`
    select b.id, b.area_fk as "areaFk" from blocks b
    where b.id = any(${blocksWithRoutes}::int[]) and b.deleted_at is null
      and not exists (select 1 from routes r where r.block_fk = b.id and r.deleted_at is null)`
  if (emptiedBlocks.length > 0) {
    await stampDeletedAt(db, { blockIds: emptiedBlocks.map((block) => block.id) }, new Date(), null)
  }
  for (const block of emptiedBlocks) {
    events.push({ id: block.id, kind: 'block', verb: 'delete' })
    orderAreas.add(block.areaFk)
    typeAreas.add(block.areaFk)
  }

  await tx`
    with ranked as (
      select id, (row_number() over (partition by area_fk order by "order", id) - 1)::int as slot
      from blocks where area_fk = any(${[...orderAreas]}::int[]) and deleted_at is null
    )
    update blocks b set "order" = r.slot from ranked r where b.id = r.id and b."order" <> r.slot`

  for (const area of typeAreas) await refreshAreaType(db, area)

  const emptiedAreas: number[] = []
  for (;;) {
    const emptied = await tx<{ id: number; parentFk: null | number }[]>`
      select a.id, a.parent_fk as "parentFk" from areas a
      where a.id = any(${areasWithChildren}::int[]) and a.deleted_at is null
        and not exists (select 1 from blocks b where b.area_fk = a.id and b.deleted_at is null)
        and not exists (select 1 from areas c where c.parent_fk = a.id and c.deleted_at is null)`
    if (emptied.length === 0) break
    await stampDeletedAt(db, { areaIds: emptied.map((area) => area.id) }, new Date(), null)
    for (const area of emptied) {
      events.push({ id: area.id, kind: 'area', verb: 'delete' })
      emptiedAreas.push(area.id)
      if (area.parentFk != null) await refreshAreaType(db, area.parentFk)
    }
  }

  const chains = new Map<number, number[]>()
  const chained = await tx<{ areaFk: number; id: number }[]>`
    select r.id, b.area_fk as "areaFk" from routes r join blocks b on b.id = r.block_fk
    where r.id = any(${[...rechain]}::int[])`
  for (const route of chained) {
    const chain = chains.get(route.areaFk) ?? (await areaAncestry(db, route.areaFk))
    chains.set(route.areaFk, chain)
    await tx`update routes set area_fks = ${chain}::int[], area_ids = ${areaIdsOf(chain)}
             where id = ${route.id}`
  }

  for (const id of recalc) await recalcUserGradeAndRating(db, id)

  /* ------------------------------------------------------------------ events */

  const updates = log.events()
  const written = [...events, ...updates.map((update) => ({ ...update, verb: 'update' as const }))]
  for (const event of written) {
    const [row] = await db
      .insert(schema.events)
      .values({
        actorFk: ACTOR,
        batch: BATCH,
        regionFk: REGION,
        verb: event.verb,
        ...objectColumns({ id: event.id, type: event.kind }),
      })
      .returning({ id: schema.events.id })
    if ('changes' in event) {
      await db.insert(schema.changes).values(
        event.changes.map(({ columnName, newValue, oldValue }) => ({
          columnName,
          eventFk: row.id,
          newValue,
          oldValue,
          regionFk: REGION,
        })),
      )
    }
  }

  /* ------------------------------------------------------------ postconditions */

  const problems: string[] = []
  const after = await loadRoutes(tx, Object.keys(plan.updates).map(Number))
  for (const [key, update] of Object.entries(plan.updates)) {
    for (const field of staleFields(stateOf(after.get(Number(key))!), update, 'new')) {
      problems.push(`route ${key} ${field} does not hold the planned value`)
    }
  }
  const totalAfter = await countOf(
    tx<{ c: number }[]>`select count(*)::int as c from routes where region_fk = ${REGION}`,
  )
  const expected = totalBefore + plan.create.length - plan.merge.length
  if (totalAfter !== expected) problems.push(`region holds ${totalAfter} routes, expected ${expected}`)
  const stranded = await countOf(strandedQuery())
  if (stranded > strandedBefore) problems.push(`${stranded - strandedBefore} live route(s) now sit in a deleted block`)
  const gapped = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from (
      select count(*) as n, min("order") as lo, max("order") as hi, count(distinct "order") as d
      from blocks where area_fk = any(${[...orderAreas]}::int[]) and deleted_at is null group by area_fk
    ) x where lo <> 0 or hi <> n - 1 or d <> n`)
  if (gapped > 0) problems.push(`${gapped} touched area(s) have block orders that are not 0..n-1`)
  const badChains = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from routes r join blocks b on b.id = r.block_fk
    where r.id = any(${[...rechain]}::int[])
      and (r.area_fks[array_length(r.area_fks, 1)] <> b.area_fk
           or (select parent_fk from areas where id = r.area_fks[1]) is not null)`)
  if (badChains > 0) problems.push(`${badChains} route(s) carry an area chain that is not root to block`)
  const eventCount = await countOf(tx<{ c: number }[]>`select count(*)::int as c from events where batch = ${BATCH}`)
  const changedEntities = events.length + updates.length
  if (eventCount !== changedEntities)
    problems.push(`${eventCount} events in the batch, ${changedEntities} entities changed`)
  // Only the app's code keeps areas and blocks apart, so the whole region is checked, not just what moved.
  const mixed = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from blocks b join areas a on a.id = b.area_fk
    where b.region_fk = ${REGION} and b.deleted_at is null
      and exists (select 1 from areas c where c.parent_fk = a.id and c.deleted_at is null)`)
  if (mixed > 0) problems.push(`${mixed} live block(s) sit directly in an area that holds areas`)
  const bare = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from areas a where a.id = any(${[...sectorIds.values()]}::int[])
      and not exists (select 1 from blocks b where b.area_fk = a.id and b.deleted_at is null)`)
  if (bare > 0) problems.push(`${bare} new sector(s) hold no block`)
  if (problems.length > 0) throw new Error(`guidebook-import: postconditions failed:\n  - ${problems.join('\n  - ')}`)
  // Stamped last: an insert-time stamp falls behind the digest watermark before the commit shows it.
  // The newest event is the head, the one row unscoped lists and the digest read for the batch.
  await tx`update events set created_at = (select clock_timestamp()),
    batch_size = case when id = (select max(id) from events where batch = ${BATCH}) then ${eventCount}::int end
    where batch = ${BATCH}`
  const heads = await tx<
    { size: number }[]
  >`select batch_size as size from events where batch = ${BATCH} and batch_size is not null`
  if (heads.length !== 1 || heads[0].size !== eventCount)
    throw new Error(
      `guidebook-import: batch "${BATCH}" has ${heads.length} head(s), expected one of size ${eventCount}`,
    )

  const duplicates = await tx<{ name: string; parent: number; what: string }[]>`
    select 'route' as what, block_fk as parent, name from routes
    where region_fk = ${REGION} and deleted_at is null and name <> ''
      and block_fk in (select block_fk from routes where id = any(${[...rechain, ...Object.keys(plan.updates).map(Number)]}::int[]))
    group by block_fk, name having count(*) > 1
    union all
    select 'block', area_fk, name from blocks
    where region_fk = ${REGION} and deleted_at is null and name <> '' and area_fk = any(${[...orderAreas]}::int[])
    group by area_fk, name having count(*) > 1`
  for (const d of duplicates)
    warn(`two live ${d.what}s named "${d.name}" under ${d.what === 'route' ? 'block' : 'area'} ${d.parent}`)

  /* ------------------------------------------------------------------- report */

  const tally = (kind: EntityKind, verb: string) =>
    written.filter((event) => event.kind === kind && event.verb === verb).length
  console.log(`\nGuidebook import into region ${REGION} ("${region.name}"), batch "${BATCH}":`)
  console.table({
    'areas emptied and deleted': emptiedAreas.length,
    'blocks created': newBlocks.length,
    'blocks emptied and deleted': emptiedBlocks.length,
    'blocks renamed': plan.block_renames.length,
    'empty blocks deleted (plan)': plan.delete_blocks.length,
    relics: Object.keys(plan.relics).length,
    'routes before / after': `${totalBefore} / ${totalAfter}`,
    'routes created': createdRoutes.length,
    'routes deleted': plan.delete.length,
    'routes kept where a topo draws them': keptByTopo.size,
    'routes merged away': plan.merge.length,
    'routes moved': plan.moves.length,
    'routes re-chained': chained.length,
    'routes updated': Object.keys(plan.updates).length,
    'sectors created (numbered headings)': plan.new_sectors.length,
    'sectors re-parented': plan.sector_parents.length,
    'sectors renamed': plan.sector_renames.length,
  })
  console.table(
    (['route', 'block', 'area'] as const).map((kind) => ({
      create: tally(kind, 'create'),
      delete: tally(kind, 'delete'),
      kind,
      update: tally(kind, 'update'),
    })),
  )
})

preflight.printWarnings()

await sql.end()
