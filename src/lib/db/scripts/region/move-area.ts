/**
 * Move an area and everything under it into another region: sub-areas, blocks, routes, ascents,
 * topos, media, first ascent credits, and the history about them. Nothing is deleted.
 *
 * DRY RUN by default: runs the move, prints it, ROLLS BACK. Run it while nobody edits the area: a
 * write landing mid-run keeps the source region and no lock prevents that. Zero replicates the result.
 *
 *   DATABASE_URL           required
 *   AREA_ID                the area to move
 *   TARGET_REGION_ID       where it goes
 *   TARGET_PARENT_ID       an area in the target region to hang it under; omitted, it becomes a root
 *   CONFIRM=true           commit instead of rolling back
 *   ALLOW_NON_MEMBERS=true proceed although people whose ascents, media, saves, comments,
 *                          notifications or first ascent claims move are not members of the target
 *
 * First ascensionists credited only inside the area move with it, or merge into a same-named one in
 * the target when nobody claims them. One credited on both sides gets its moved credits re-pointed
 * at a copy (or the same-named row) in the target.
 */
import {
  assertTableCatalogue,
  carryContent,
  carryFirstAscensionists,
  carryLog,
  connect,
  countOf,
  integrityCounts,
  Preflight,
  runTransaction,
  type Tx,
} from './regionMove'

const sql = connect('move-area')

const AREA_ID = Number(process.env.AREA_ID)
const TARGET_REGION_ID = Number(process.env.TARGET_REGION_ID)
const TARGET_PARENT_ID = process.env.TARGET_PARENT_ID ? Number(process.env.TARGET_PARENT_ID) : null
if (!Number.isInteger(AREA_ID)) throw new Error('move-area: AREA_ID is required')
if (!Number.isInteger(TARGET_REGION_ID)) throw new Error('move-area: TARGET_REGION_ID is required')
if (TARGET_PARENT_ID != null && !Number.isInteger(TARGET_PARENT_ID)) {
  throw new Error('move-area: TARGET_PARENT_ID must be an area id')
}

const CONFIRM = process.env.CONFIRM === 'true'
const ALLOW_NON_MEMBERS = process.env.ALLOW_NON_MEMBERS === 'true'

const preflight = new Preflight()
const { fail, warn } = preflight

/** Whether the area or any ancestor is soft-deleted. Capped, so a `parent_fk` cycle cannot spin. */
const deletedInChain = async (tx: Tx, areaId: number) =>
  (await countOf(tx<{ c: number }[]>`
    with recursive up as (
      select id, parent_fk, deleted_at, 1 as depth from areas where id = ${areaId}
      union all
      select a.id, a.parent_fk, a.deleted_at, u.depth + 1 from areas a join up u on a.id = u.parent_fk
      where u.depth < 50
    )
    select count(*)::int as c from up where deleted_at is not null`)) > 0

/** Mirrors `refreshAreaType`: blocks make a sector, sub-areas an area, neither null. */
const refreshType = (tx: Tx, areaId: number) => tx`
  update areas a set type = case
    when exists (select 1 from blocks b where b.area_fk = a.id and b.deleted_at is null) then 'sector'
    when exists (select 1 from areas c where c.parent_fk = a.id and c.deleted_at is null) then 'area'
    end
  where a.id = ${areaId}`

await runTransaction(sql, CONFIRM, async (tx) => {
  /* ---------------------------------------------------------------- preflight */

  const [area] = await tx<{ name: string; parentFk: null | number; regionFk: number }[]>`
    select name, parent_fk as "parentFk", region_fk as "regionFk" from areas where id = ${AREA_ID}`
  if (area == null) throw new Error(`move-area: area ${AREA_ID} does not exist`)
  const SOURCE = area.regionFk

  const [target] = await tx<{ name: string }[]>`select name from regions where id = ${TARGET_REGION_ID}`
  if (target == null) throw new Error(`move-area: region ${TARGET_REGION_ID} does not exist`)

  await assertTableCatalogue(tx, preflight)

  if (SOURCE === TARGET_REGION_ID) fail(`area ${AREA_ID} is already in region ${TARGET_REGION_ID}`)
  if (await deletedInChain(tx, AREA_ID)) fail(`area ${AREA_ID} or one of its ancestors is soft-deleted`)

  if (TARGET_PARENT_ID != null) {
    const [parent] = await tx<{ blocks: number; regionFk: number; type: null | string }[]>`
      select region_fk as "regionFk", type,
        (select count(*)::int from blocks b where b.area_fk = a.id and b.deleted_at is null) as blocks
      from areas a where a.id = ${TARGET_PARENT_ID}`
    if (parent == null) fail(`target parent ${TARGET_PARENT_ID} does not exist`)
    else if (parent.regionFk !== TARGET_REGION_ID) {
      fail(`target parent ${TARGET_PARENT_ID} is in region ${parent.regionFk}, not ${TARGET_REGION_ID}`)
    } else if (parent.type === 'sector' || parent.blocks > 0) {
      fail(`target parent ${TARGET_PARENT_ID} is a sector; areas and blocks do not mix`)
    } else if (await deletedInChain(tx, TARGET_PARENT_ID)) {
      fail(`target parent ${TARGET_PARENT_ID} or one of its ancestors is soft-deleted`)
    }
  }

  // Soft-deleted descendants come along: they still hold `region_fk`, and a restore must land here.
  await tx`create temp table map_area (area_id int primary key, region_id int not null) on commit drop`
  await tx`
    with recursive tree as (
      select id, 1 as depth from areas where id = ${AREA_ID}
      union all
      select c.id, t.depth + 1 from areas c join tree t on c.parent_fk = t.id
      where c.region_fk = ${SOURCE} and t.depth < 50
    )
    insert into map_area select distinct id, ${TARGET_REGION_ID}::int from tree`
  await tx`
    create temp table map_block on commit drop as
    select b.id as block_id, m.region_id from blocks b
    join map_area m on b.area_fk = m.area_id where b.region_fk = ${SOURCE}`
  await tx`
    create temp table map_route on commit drop as
    select r.id as route_id, mb.region_id from routes r
    join map_block mb on r.block_fk = mb.block_id where r.region_fk = ${SOURCE}`

  const foreignChildren = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from areas c
    where c.parent_fk in (select area_id from map_area) and c.region_fk <> ${SOURCE}`)
  if (foreignChildren > 0)
    fail(`${foreignChildren} area(s) in other regions hang off this subtree; re-parent them first`)

  const crossTopos = await tx<{ route: number; topo: number }[]>`
    select t.id as topo, r.id as route from topo_routes tr
    join topos t on t.id = tr.topo_fk join routes r on r.id = tr.route_fk
    where (t.block_fk in (select block_id from map_block)) <> (r.block_fk in (select block_id from map_block))`
  for (const row of crossTopos) {
    fail(`topo ${row.topo} and route ${row.route} it draws would end up in different regions`)
  }

  // Rows a person would miss in their own views, per person without a membership in the target.
  await tx`
    create temp table moving_ascent on commit drop as
    select id, created_by from ascents where route_fk in (select route_id from map_route)`
  await tx`
    create temp table moving_file on commit drop as
    select id, created_by from files
    where area_fk in (select area_id from map_area) or block_fk in (select block_id from map_block)
       or route_fk in (select route_id from map_route) or ascent_fk in (select id from moving_ascent)
       or id in (select file_fk from topos where block_fk in (select block_id from map_block))`
  await tx`
    create temp table moving_event on commit drop as
    select id from events
    where area_fk in (select area_id from map_area) or block_fk in (select block_id from map_block)
       or route_fk in (select route_id from map_route) or ascent_fk in (select id from moving_ascent)
       or file_fk in (select id from moving_file)`
  const strangers = await tx<
    {
      ascents: number
      claims: number
      favorites: number
      files: number
      notifications: number
      reactions: number
      user: number
      username: string
    }[]
  >`
    with owned as (
      select created_by as u, 'ascents' as k from moving_ascent
      union all select created_by, 'files' from moving_file
      union all select user_fk, 'favorites' from favorites
        where area_fk in (select area_id from map_area) or block_fk in (select block_id from map_block)
           or route_fk in (select route_id from map_route)
      union all select user_fk, 'reactions' from reactions where event_fk in (select id from moving_event)
      union all select user_fk, 'notifications' from notifications
        where event_fk in (select id from moving_event)
           or area_fk in (select area_id from map_area) or block_fk in (select block_id from map_block)
           or route_fk in (select route_id from map_route)
      union all select coalesce(u.id, f.user_fk), 'claims' from first_ascensionists f
        left join users u on u.first_ascentionist_fk = f.id
        where f.region_fk = ${SOURCE} and (u.id is not null or f.user_fk is not null)
          and exists (select 1 from routes_to_first_ascensionists t
                      where t.first_ascensionist_fk = f.id and t.route_fk in (select route_id from map_route))
    )
    select o.u as "user", u.username,
      count(*) filter (where k = 'ascents')::int as ascents,
      count(*) filter (where k = 'files')::int as files,
      count(*) filter (where k = 'favorites')::int as favorites,
      count(*) filter (where k = 'reactions')::int as reactions,
      count(*) filter (where k = 'notifications')::int as notifications,
      count(*) filter (where k = 'claims')::int as claims
    from owned o join users u on u.id = o.u
    where not exists (select 1 from region_members m where m.region_fk = ${TARGET_REGION_ID} and m.user_fk = o.u)
    group by o.u, u.username order by o.u`
  if (strangers.length > 0 && SOURCE !== TARGET_REGION_ID) {
    const message = `${strangers.length} person(s) with rows in this area are not members of region ${TARGET_REGION_ID} and would lose sight of them`
    if (ALLOW_NON_MEMBERS) warn(message)
    else fail(`${message}; invite them, or set ALLOW_NON_MEMBERS=true`)
    console.log('\nNot members of the target region:')
    console.table(strangers)
  }

  preflight.abortIfFailed(`PREFLIGHT FAILED moving area ${AREA_ID} ("${area.name}"):`)

  const scope = tx`select ${SOURCE}::int union select ${TARGET_REGION_ID}::int`
  const before = await integrityCounts(tx, scope, [])

  const counts = await tx`
    select
      (select count(*)::int from map_area) as areas,
      (select count(*)::int from map_block) as blocks,
      (select count(*)::int from map_route) as routes,
      (select count(*)::int from moving_ascent) as ascents,
      (select count(*)::int from moving_file) as files,
      (select count(*)::int from moving_event) as events`
  console.log(
    `\nMoving area ${AREA_ID} ("${area.name}") from region ${SOURCE} to ${TARGET_REGION_ID} ("${target.name}")` +
      (TARGET_PARENT_ID == null ? ' as a root area:' : ` under area ${TARGET_PARENT_ID}:`),
  )
  console.table(counts)

  /* ------------------------------------------------------------------ the move */

  await carryContent(tx, SOURCE)
  await tx`update areas set parent_fk = ${TARGET_PARENT_ID} where id = ${AREA_ID}`

  // Recomputed from the new tree rather than spliced, so the chain is what `areaAncestry` would write.
  await tx`
    with recursive chain as (
      select m.area_id, m.area_id as ancestor, 0 as depth from map_area m
      union all
      select c.area_id, a.parent_fk, c.depth + 1 from chain c join areas a on a.id = c.ancestor
      where a.parent_fk is not null and c.depth < 50
    ),
    paths as (select area_id, array_agg(ancestor order by depth desc) as fks from chain group by area_id)
    update routes r
    set area_fks = p.fks,
        area_ids = (select string_agg('^' || x || '$', ',' order by ord) from unnest(p.fks) with ordinality as t(x, ord))
    from map_route m, blocks b, paths p
    where r.id = m.route_id and b.id = r.block_fk and p.area_id = b.area_fk`

  const fa = await carryFirstAscensionists(tx, SOURCE, { dropUncredited: false, reuseByName: true })
  for (const d of fa.keptDuplicates) {
    warn(
      `first ascensionist ${d.id} ("${d.name}") is claimed or credited elsewhere, so it moved beside a same-named one in region ${d.regionId}`,
    )
  }

  await carryLog(tx, SOURCE)

  if (area.parentFk != null) await refreshType(tx, area.parentFk)
  if (TARGET_PARENT_ID != null) await refreshType(tx, TARGET_PARENT_ID)

  /* ------------------------------------------------------------ postconditions */

  const leftBehind = await countOf(tx<{ c: number }[]>`
    select (
      (select count(*) from areas where id in (select area_id from map_area) and region_fk <> ${TARGET_REGION_ID}) +
      (select count(*) from blocks where id in (select block_id from map_block) and region_fk <> ${TARGET_REGION_ID}) +
      (select count(*) from routes where id in (select route_id from map_route) and region_fk <> ${TARGET_REGION_ID}) +
      (select count(*) from ascents where id in (select id from moving_ascent) and region_fk <> ${TARGET_REGION_ID}) +
      (select count(*) from files where id in (select id from moving_file) and region_fk <> ${TARGET_REGION_ID}) +
      (select count(*) from events where id in (select id from moving_event) and region_fk <> ${TARGET_REGION_ID})
    )::int as c`)
  if (leftBehind > 0) throw new Error(`move-area: ${leftBehind} row(s) of the subtree did not reach the target`)

  const strayActivities = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from activities x where x.region_fk = ${SOURCE} and (
      (x.entity_type = 'area' and x.entity_id in (select area_id::text from map_area))
      or (x.entity_type = 'block' and x.entity_id in (select block_id::text from map_block))
      or (x.entity_type = 'route' and x.entity_id in (select route_id::text from map_route))
      or (x.entity_type = 'ascent' and x.entity_id in (select id::text from moving_ascent))
      or (x.entity_type = 'file' and x.entity_id in (select id from moving_file)))`)
  if (strayActivities > 0) throw new Error(`move-area: ${strayActivities} activity row(s) stayed behind`)

  const badChains = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from routes r join blocks b on b.id = r.block_fk
    where r.id in (select route_id from map_route)
      and (r.area_fks[array_length(r.area_fks, 1)] <> b.area_fk
           or (select parent_fk from areas where id = r.area_fks[1]) is not null)`)
  if (badChains > 0) throw new Error(`move-area: ${badChains} route(s) carry an area chain that is not root to block`)

  // Compared with the same scope before the move, so a pre-existing inconsistency does not block it.
  const after = await integrityCounts(tx, scope, fa.deletedIds)
  for (const [i, [what, c]] of after.entries()) {
    if (c > before[i][1]) throw new Error(`move-area: ${c - before[i][1]} new row(s) leave ${what}`)
  }

  /* ------------------------------------------------------------------- report */

  console.table(
    await tx`
      select r.name, r.id as region,
        (select count(*)::int from areas where region_fk = r.id) as areas,
        (select count(*)::int from blocks where region_fk = r.id) as blocks,
        (select count(*)::int from routes where region_fk = r.id) as routes,
        (select count(*)::int from ascents where region_fk = r.id) as ascents
      from regions r where r.id in (${SOURCE}, ${TARGET_REGION_ID}) order by r.id`,
  )
  console.log(
    `first ascensionists: ${fa.moved} moved intact, ${fa.merged} merged into a same-named one, ${fa.copies} copies for ${fa.shared} also credited outside the area`,
  )
})

preflight.printWarnings()

await sql.end()
