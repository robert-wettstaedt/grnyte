/**
 * Convert every root area of a region into a region of its own, then dissolve the original.
 *
 * Each root area becomes a region carrying its name; that root's sub-areas become the new region's
 * root areas; every region-scoped row under them follows. The source region ends up holding
 * nothing and is deleted, which is what makes "no rows left for it" a checkable postcondition
 * rather than a hope.
 *
 * DRY RUN by default: runs the whole thing, prints what it did, then ROLLS BACK. `CONFIRM=true`
 * commits. Runs AFTER `npm run migrate` and BEFORE the Zero replica wipe, inside the cutover's
 * downtime window: it rewrites `region_fk` across 24 tables and nothing should be reading them.
 *
 *   DATABASE_URL          required
 *   REGION_ID             the region to split
 *   CONFIRM=true          commit instead of rolling back
 *   ACCEPT_COMMENT_LOSS=true
 *                         proceed even though deleting the root areas destroys comment threads
 *                         written on their event cards (see "What is deliberately destroyed")
 *
 * ## Preconditions, all reported together before anything is written
 *
 * Every root of the region must be a LIVE area with LIVE sub-areas. A root sector has no children to
 * promote and its blocks need an `area_fk`; an empty root would dissolve into an empty region; a
 * soft-deleted root is invisible in the app but still holds `region_fk`. All three abort, named.
 * On top of that: no root may carry content of its own, no invitation may still be live, no
 * region-scoped row may be orphaned (nothing to carry it across), and no two roots may share a
 * name, since `regions.name` is not unique and two identical entries in a switcher cannot be told
 * apart. The table map is checked against `information_schema` so a new `region_fk` table added
 * later aborts here instead of quietly staying behind.
 *
 * ## What is deliberately destroyed
 *
 * A dissolved root area's own history. `events` has six object types and none of them is a region,
 * so "Anna created Wald" cannot be re-pointed at the region Wald becomes. Its events, their
 * changes, reactions and notifications, and anybody's saved copy of the area go with it. Comment
 * threads are the one part of that worth a second look, so they need their own flag.
 *
 * The source region's membership log, too: `invite`, `accept`, `remove`, `leave` and role changes
 * are facts about a membership in THAT region, and it is being dissolved. Copying them into every
 * new region would invent one join per region on a single date. Profile events are the opposite
 * case and ARE copied everywhere, because `updateUsername` already writes one per region a person
 * belongs to; continuing that is what the app would have done had the regions existed all along.
 *
 * ## Two Postgres behaviours this leans on
 *
 * `session_replication_role = replica` is set for the transaction, as in `purge-region.ts`, because
 * region data has FK cycles (blocks<->geolocations, routes<->route_external_resources,
 * files<->bunny_streams) that no ordering of updates satisfies. It also disables ON DELETE CASCADE
 * and user triggers, which this relies on twice: the root areas' dependants are deleted explicitly
 * so the loss is counted rather than silent, and `events.comment_count` / `events.promoted` are
 * copied verbatim onto duplicated events instead of being recomputed by `sync_event_comment_count`
 * from reaction rows that arrive one at a time.
 *
 * The cost is that a mistake leaves a dangling reference instead of erroring, which is what the
 * postconditions at the end are for. They run before the teardown, so a row this script failed to
 * move fails the run rather than being swept up by a blanket delete.
 */
import {
  assertTableCatalogue,
  carryContent,
  carryFirstAscensionists,
  carryLog,
  columnsOf,
  connect,
  countOf,
  HANDLED_TABLES,
  integrityCounts,
  Preflight,
  runTransaction,
} from './regionMove'

const sql = connect('split-region')

const REGION_ID = Number(process.env.REGION_ID)
if (!Number.isInteger(REGION_ID)) throw new Error('split-region: REGION_ID is required')

const CONFIRM = process.env.CONFIRM === 'true'
const ACCEPT_COMMENT_LOSS = process.env.ACCEPT_COMMENT_LOSS === 'true'

/**
 * Membership rather than content. `region_members` is copied into every new region and then
 * dropped with the old one; `region_invitations` is only ever dropped, which is safe because the
 * preflight refuses to run while any invitation is still live. An expired or accepted one is
 * history of a region that is going away.
 */
const MEMBERSHIP_TABLES = ['region_members', 'region_invitations']

/** Log tables, which keep rows for the old region on purpose (see the module comment) and so are
 *  checked by category instead of by the plain zero-rows rule the content tables get. */
const LOG_TABLES = ['activities', 'changes', 'events', 'notifications', 'reactions']

const CONTENT_TABLES = HANDLED_TABLES.filter((t) => !MEMBERSHIP_TABLES.includes(t) && !LOG_TABLES.includes(t))

/**
 * `changes.column_name` values that make a subject-shaped event a profile edit rather than a
 * membership one. The column holds the key of the diff the handler passed, so `updateUsername`
 * writes `username` and the role change in `regions.remote.ts` writes `role`.
 * `first ascensionist` has no writer today but is in the event catalogue, so it is listed rather
 * than discovered.
 */
const PROFILE_CHANGE_COLUMNS = ['username', 'first ascensionist']

const preflight = new Preflight()
const { fail, warn } = preflight

await runTransaction(sql, CONFIRM, async (tx) => {
  // Drops FK enforcement, ON DELETE CASCADE and user triggers for this transaction.
  await tx`set local session_replication_role = replica`

  /* ---------------------------------------------------------------- preflight */

  const [region] = await tx<{ createdBy: number; maxMembers: number; name: string }[]>`
    select created_by as "createdBy", max_members as "maxMembers", name
    from regions where id = ${REGION_ID}`
  if (region == null) throw new Error(`split-region: region ${REGION_ID} does not exist`)

  await assertTableCatalogue(tx, preflight)

  const roots = await tx<
    { deletedAt: Date | null; id: number; liveChildren: number; name: string; type: null | string }[]
  >`
    select
      a.id, a.name, a.type, a.deleted_at as "deletedAt",
      (select count(*)::int from areas c where c.parent_fk = a.id and c.deleted_at is null) as "liveChildren"
    from areas a
    where a.region_fk = ${REGION_ID} and a.parent_fk is null
    order by a.id`

  if (roots.length === 0) fail(`region ${REGION_ID} has no root areas`)

  for (const root of roots) {
    const label = `root area ${root.id} ("${root.name}")`
    if (root.deletedAt != null) {
      // Not fixable through the app: `deleteArea` only hard-deletes a bare area, so clearing this
      // is a deliberate hand-written delete or a restore, and either is a decision.
      fail(`${label} is soft-deleted; restore it or remove it by hand before running this`)
    } else if (root.type !== 'area') {
      fail(`${label} has type ${root.type ?? 'null'}, expected 'area' (a sector or empty root cannot dissolve)`)
    } else if (root.liveChildren === 0) {
      fail(`${label} has no live sub-areas, so it would dissolve into an empty region`)
    }
  }

  const duplicateNames = await tx<{ n: number; name: string }[]>`
    select lower(name) as name, count(*)::int as n
    from areas where region_fk = ${REGION_ID} and parent_fk is null
    group by lower(name) having count(*) > 1`
  for (const row of duplicateNames) {
    fail(`${row.n} root areas share the name "${row.name}"; regions.name is not unique, rename one first`)
  }

  const rootIds = roots.map((r) => r.id)
  if (rootIds.length > 0) {
    // `blocks` is checked as well as the rest, and not because a well-formed 'area' can hold one:
    // `refreshAreaType` would have called it a sector. The stored column can be stale, and 1.0's was
    // NOT NULL DEFAULT 'area', so prod may carry a root typed 'area' that holds blocks anyway.
    // Deleting it would dangle `blocks.area_fk`, which is NOT NULL, and replica mode would not
    // complain.
    const ownContent = await tx<{ blocks: number; files: number; id: number; pins: number; prose: number }[]>`
      select
        a.id,
        (select count(*)::int from blocks b where b.area_fk = a.id) as blocks,
        (select count(*)::int from files f where f.area_fk = a.id) as files,
        (select count(*)::int from geolocations g where g.area_fk = a.id) as pins,
        (case when coalesce(a.description, '') <> '' or a.geo_paths is not null
                   or a.walking_paths is not null then 1 else 0 end) as prose
      from areas a where a.id in ${tx(rootIds)}`
    for (const row of ownContent.filter((r) => r.blocks + r.files + r.pins + r.prose > 0)) {
      const parts = [
        row.blocks > 0 && `${row.blocks} block(s) directly attached`,
        row.files > 0 && `${row.files} file(s)`,
        row.pins > 0 && `${row.pins} parking pin(s)`,
        row.prose > 0 && 'a description, geo paths or walking paths',
      ].filter(Boolean)
      fail(`root area ${row.id} carries content of its own (${parts.join(', ')}), which a region cannot hold`)
    }
  }

  // An area belonging to somebody else that hangs off this region's tree is a pre-existing
  // inconsistency, and one the split would otherwise strand: the recursive walk refuses to leave
  // the region, so its parent would be deleted out from under it.
  const foreignChildren = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from areas child join areas parent on parent.id = child.parent_fk
    where parent.region_fk = ${REGION_ID} and child.region_fk <> ${REGION_ID}`)
  if (foreignChildren > 0) {
    fail(`${foreignChildren} area(s) in other regions hang off this region's tree; re-parent them first`)
  }

  const liveInvitations = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from region_invitations
    where region_fk = ${REGION_ID} and status = 'pending' and expires_at > now()`)
  if (liveInvitations > 0) {
    fail(`${liveInvitations} invitation(s) are still live; let them land or revoke them, the region is deleted here`)
  }

  const orphans = {
    bunnyStreams: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from bunny_streams bs
      where bs.region_fk = ${REGION_ID} and not exists (select 1 from files f where f.bunny_stream_fk = bs.id)`),
    files: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from files
      where region_fk = ${REGION_ID}
        and area_fk is null and ascent_fk is null and block_fk is null and route_fk is null
        and not exists (select 1 from topos t where t.file_fk = files.id)`),
    geolocations: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from geolocations
      where region_fk = ${REGION_ID} and area_fk is null and block_fk is null`),
    topoRoutes: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from topo_routes
      where region_fk = ${REGION_ID} and topo_fk is null and route_fk is null`),
    topos: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from topos where region_fk = ${REGION_ID} and block_fk is null`),
  }
  for (const [table, c] of Object.entries(orphans)) {
    if (c > 0) fail(`${c} orphaned ${table} row(s) hang off nothing, so nothing carries them across`)
  }

  const ownedAfter = await countOf(tx<{ c: number }[]>`
    select (count(*)::int - 1 + ${roots.length}) as c from regions where created_by = ${region.createdBy}`)
  if (ownedAfter > 3) {
    warn(
      `user ${region.createdBy} will own ${ownedAfter} regions, over MAX_OWNED_REGIONS (3); they keep them but cannot found more`,
    )
  }

  /* ------------------------------------------- what deleting the roots destroys */

  const cascade =
    rootIds.length === 0
      ? []
      : await tx<
          { activities: number; changes: number; comments: number; events: number; id: number; saves: number }[]
        >`
          select
            a.id,
            (select count(*)::int from activities l
               where l.entity_type = 'area' and l.entity_id = a.id::text) as activities,
            (select count(*)::int from events e where e.area_fk = a.id) as events,
            (select count(*)::int from changes c
               join events e on e.id = c.event_fk where e.area_fk = a.id) as changes,
            (select count(*)::int from reactions r
               join events e on e.id = r.event_fk where e.area_fk = a.id and r.type = 'comment') as comments,
            (select count(*)::int from favorites f where f.area_fk = a.id) as saves
          from areas a where a.id in ${tx(rootIds)} order by a.id`

  // Membership events (`invite`, `accept`, `remove`, `leave`, and role changes) are dropped with
  // the region rather than copied, unlike the profile events beside them, so comments written on
  // those cards die too and belong in the same gate.
  const membershipComments = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from reactions r
    join events e on e.id = r.event_fk
    where e.region_fk = ${REGION_ID} and e.subject_fk is not null and r.type = 'comment'
      and not exists (
        select 1 from changes c
        where c.event_fk = e.id and c.column_name in ${tx(PROFILE_CHANGE_COLUMNS)})`)

  const totalComments = cascade.reduce((a, r) => a + r.comments, 0) + membershipComments
  if (totalComments > 0 && !ACCEPT_COMMENT_LOSS) {
    const where = [
      cascade.some((r) => r.comments > 0) && "the root areas' cards",
      membershipComments > 0 && 'membership cards dropped with the region',
    ].filter(Boolean)
    fail(
      `${totalComments} comment(s) written on ${where.join(' and ')} would be destroyed; set ACCEPT_COMMENT_LOSS=true to accept`,
    )
  }

  preflight.abortIfFailed(`PREFLIGHT FAILED for region ${REGION_ID} ("${region.name}"):`)

  console.log(`\nSplitting region ${REGION_ID} ("${region.name}") into ${roots.length} regions:`)
  console.table(roots.map((r) => ({ name: r.name, root: r.id })))
  if (cascade.some((r) => r.activities + r.changes + r.events + r.saves > 0)) {
    console.log('\nDestroyed with the root areas (no region-shaped event object exists to hold it):')
    console.table(cascade)
  }

  /* ------------------------------------------------------------------ new regions */

  await tx`create temp table new_region (root_id int primary key, region_id int not null) on commit drop`
  // Every column of the source region except its name, which is the root area's.
  const regionCols = await columnsOf(tx, 'regions', ['name'])
  for (const root of roots) {
    const [created] = await tx.unsafe<{ id: number }[]>(
      `insert into regions (${regionCols}, name) select ${regionCols}, $1 from regions where id = $2 returning id`,
      [root.name, REGION_ID],
    )
    await tx`insert into new_region values (${root.id}, ${created.id})`
  }

  // Verbatim, roles included: anything narrower silently revokes access to content people
  // already had. No events and no notifications, so nobody is told they joined N regions.
  const memberCols = await columnsOf(tx, 'region_members')
  await tx.unsafe(
    `insert into region_members (${memberCols}, region_fk)
     select ${memberCols}, nr.region_id from region_members cross join new_region nr
     where region_members.region_fk = $1`,
    [REGION_ID],
  )

  /* ------------------------------------------------------------------ the subtrees */

  // Every area in the region keyed to the region its root ancestor became. No `deleted_at`
  // filter: a soft-deleted descendant still holds a `region_fk` and still has to move.
  await tx`
    create temp table map_area (area_id int primary key, root_id int not null, region_id int not null)
    on commit drop`
  // Two guards on the recursive arm. `region_fk` keeps it inside this region: `areas.parent_fk`
  // carries no region constraint, so an area belonging to somebody else whose parent points in
  // here would otherwise be pulled in and re-regioned. The depth cap turns a `parent_fk` cycle
  // into a truncated tree instead of a transaction that never returns; `areaAncestry` guards
  // against the same thing, so the shape is considered possible. A truncated tree then fails
  // the reachability check below rather than passing silently.
  await tx`
    with recursive tree as (
      select a.id, a.id as root_id, 1 as depth
      from areas a where a.region_fk = ${REGION_ID} and a.parent_fk is null
      union all
      select c.id, t.root_id, t.depth + 1
      from areas c join tree t on c.parent_fk = t.id
      where c.region_fk = ${REGION_ID} and t.depth < 50
    )
    insert into map_area select t.id, t.root_id, nr.region_id from tree t join new_region nr on nr.root_id = t.root_id`

  const unreachableAreas = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from areas
    where region_fk = ${REGION_ID} and id not in (select area_id from map_area)`)
  if (unreachableAreas > 0) {
    throw new Error(
      `split-region: ${unreachableAreas} area(s) in the region are not reachable from any root (a parent_fk cycle, or a parent in another region)`,
    )
  }

  await tx`
    create temp table map_block on commit drop as
    select b.id as block_id, m.region_id, m.root_id from blocks b
    join map_area m on b.area_fk = m.area_id where b.region_fk = ${REGION_ID}`
  await tx`
    create temp table map_route on commit drop as
    select r.id as route_id, mb.region_id, mb.root_id from routes r
    join map_block mb on r.block_fk = mb.block_id where r.region_fk = ${REGION_ID}`

  /* -------------------------------------------------------------- move the content */

  await carryContent(tx, REGION_ID)

  // The root of every moved route's area chain is the area being dissolved. `area_ids` is rebuilt
  // from the trimmed array to keep the `^2$,^3$` token format the route filter matches on.
  await tx`
    update routes r
    set area_fks = array_remove(r.area_fks, m.root_id),
        area_ids = (
          select string_agg('^' || x || '$', ',' order by ord)
          from unnest(array_remove(r.area_fks, m.root_id)) with ordinality as t(x, ord))
    from map_route m
    where r.id = m.route_id and r.area_fks is not null and m.root_id = any(r.area_fks)`

  const fa = await carryFirstAscensionists(tx, REGION_ID, { dropUncredited: true, reuseByName: false })

  /* ------------------------------------------------------------------ the log */

  await carryLog(tx, REGION_ID)

  // Profile edits are already fanned out per region by `updateUsername`, so a copy in every new
  // region is the row the app would have written. Changes and reactions come along; the
  // denormalised counters on the event copy across untouched because triggers are off.
  const profileEvents = await tx<{ id: number }[]>`
    select e.id from events e
    where e.region_fk = ${REGION_ID} and e.subject_fk is not null
      and exists (select 1 from changes c where c.event_fk = e.id and c.column_name in ${tx(PROFILE_CHANGE_COLUMNS)})
    order by e.id`
  const newRegions = await tx<{ regionId: number }[]>`select region_id as "regionId" from new_region order by region_id`

  const eventCols = await columnsOf(tx, 'events')
  const changeCols = await columnsOf(tx, 'changes')
  // `parent_fk` is excluded and remapped below rather than copied: it names another reaction, and
  // copying it verbatim would point every copied reply at the source-region row the teardown
  // deletes. Replica mode raises no FK error for that, so nothing downstream would notice.
  const reactionCols = await columnsOf(tx, 'reactions', ['parent_fk'])

  for (const { id: sourceId } of profileEvents) {
    const sourceReactions = await tx<{ id: number; parentFk: null | number }[]>`
      select id, parent_fk as "parentFk" from reactions where event_fk = ${sourceId} order by id`

    for (const { regionId } of newRegions) {
      const [copy] = await tx.unsafe<{ id: number }[]>(
        `insert into events (${eventCols}, region_fk)
         select ${eventCols}, $1 from events where id = $2 returning id`,
        [regionId, sourceId],
      )
      await tx.unsafe(
        `insert into changes (${changeCols}, event_fk, region_fk)
         select ${changeCols}, $1, $2 from changes where event_fk = $3`,
        [copy.id, regionId, sourceId],
      )
      // In id order, so a parent is always copied before the reply that names it: a reply is
      // written after the comment it answers, and the column is a serial.
      const copied = new Map<number, number>()
      for (const source of sourceReactions) {
        const [reaction] = await tx.unsafe<{ id: number }[]>(
          `insert into reactions (${reactionCols}, event_fk, region_fk, parent_fk)
           select ${reactionCols}, $1, $2, $3 from reactions where id = $4 returning id`,
          [copy.id, regionId, source.parentFk == null ? null : (copied.get(source.parentFk) ?? null), source.id],
        )
        copied.set(source.id, reaction.id)
      }
    }
  }

  /* ------------------------------------------------- promote and drop the roots */

  await tx`update areas set parent_fk = null where parent_fk in (select root_id from new_region)`

  // Explicit rather than by ON DELETE CASCADE, which replica mode has switched off. Deleting a
  // dependant this misses would be a dangling reference, so the postconditions check both.
  await tx`
    delete from notifications
    where event_fk in (select id from events where area_fk in (select root_id from new_region))
       or reaction_fk in (
            select id from reactions
            where event_fk in (select id from events where area_fk in (select root_id from new_region)))
       or area_fk in (select root_id from new_region)`
  await tx`
    delete from reactions
    where event_fk in (select id from events where area_fk in (select root_id from new_region))`
  await tx`
    delete from changes
    where event_fk in (select id from events where area_fk in (select root_id from new_region))`
  await tx`delete from events where area_fk in (select root_id from new_region)`
  await tx`delete from favorites where area_fk in (select root_id from new_region)`
  await tx`
    delete from activities
    where entity_type = 'area' and entity_id in (select root_id::text from new_region)`
  await tx`delete from areas where id in (select root_id from new_region)`

  /* --------------------------------------------- postconditions, before teardown */

  for (const table of CONTENT_TABLES) {
    const left = await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from ${tx(table)} where region_fk = ${REGION_ID}`)
    if (left > 0) throw new Error(`split-region: ${left} ${table} row(s) still belong to region ${REGION_ID}`)
  }

  const strayEvents = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from events where region_fk = ${REGION_ID} and subject_fk is null`)
  if (strayEvents > 0) {
    throw new Error(`split-region: ${strayEvents} event(s) about content still belong to region ${REGION_ID}`)
  }
  // Only rows whose subject this run actually moved: those had somewhere to go, so one left
  // behind is a bug here. `activities` carries a text `entity_id` and no foreign key, so a row
  // whose subject was deleted years ago resolves to nothing and could never move; it is dropped
  // with the region and counted in `discarded`, which is what the module comment promises.
  const strayActivities = await countOf(tx<{ c: number }[]>`
    select count(*)::int as c from activities x
    where x.region_fk = ${REGION_ID} and x.entity_type <> 'user' and (
      (x.entity_type = 'area' and exists (
         select 1 from areas a where a.id::text = x.entity_id
           and a.region_fk in (select region_id from new_region)))
      or (x.entity_type = 'block' and exists (
         select 1 from blocks b where b.id::text = x.entity_id
           and b.region_fk in (select region_id from new_region)))
      or (x.entity_type = 'route' and exists (
         select 1 from routes r where r.id::text = x.entity_id
           and r.region_fk in (select region_id from new_region)))
      or (x.entity_type = 'ascent' and exists (
         select 1 from ascents s where s.id::text = x.entity_id
           and s.region_fk in (select region_id from new_region)))
      or (x.entity_type = 'file' and exists (
         select 1 from files f where f.id = x.entity_id
           and f.region_fk in (select region_id from new_region)))
    )`)
  if (strayActivities > 0) {
    throw new Error(
      `split-region: ${strayActivities} activity row(s) whose subject moved still belong to region ${REGION_ID}`,
    )
  }

  const discarded = {
    activities: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from activities where region_fk = ${REGION_ID}`),
    changes: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from changes where region_fk = ${REGION_ID}`),
    events: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from events where region_fk = ${REGION_ID}`),
    notifications: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from notifications where region_fk = ${REGION_ID}`),
    reactions: await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from reactions where region_fk = ${REGION_ID}`),
  }

  /* ------------------------------------------------------------------ teardown */

  for (const table of ['notifications', 'reactions', 'changes', 'events', 'activities', ...MEMBERSHIP_TABLES]) {
    await tx`delete from ${tx(table)} where region_fk = ${REGION_ID}`
  }
  await tx`delete from regions where id = ${REGION_ID}`

  /* --------------------------------------------------- postconditions, after it */

  for (const table of HANDLED_TABLES) {
    const left = await countOf(tx<{ c: number }[]>`
      select count(*)::int as c from ${tx(table)} where region_fk = ${REGION_ID}`)
    if (left > 0) throw new Error(`split-region: ${left} ${table} row(s) survived the teardown`)
  }

  // Scoped to the regions this run created: a pre-existing inconsistency elsewhere is not its to answer for.
  for (const [what, c] of await integrityCounts(tx, tx`select region_id from new_region`, fa.deletedIds)) {
    if (c > 0) throw new Error(`split-region: ${c} row(s) leave ${what}`)
  }

  /* ------------------------------------------------------------------- report */

  console.table(
    await tx`
      select r.name, r.id as region,
        (select count(*)::int from areas where region_fk = r.id) as areas,
        (select count(*)::int from blocks where region_fk = r.id) as blocks,
        (select count(*)::int from routes where region_fk = r.id) as routes,
        (select count(*)::int from ascents where region_fk = r.id) as ascents,
        (select count(*)::int from region_members where region_fk = r.id) as members
      from regions r where r.id in (select region_id from new_region) order by r.id`,
  )
  console.log(
    `first ascensionists: ${fa.moved} moved intact, ${fa.copies} copies for ${fa.shared} shared across regions, ${fa.uncredited} uncredited removed`,
  )
  console.log(`profile events copied into each new region: ${profileEvents.length}`)
  console.log(
    `dropped with region ${REGION_ID}: ${Object.entries(discarded)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}`,
  )
})

preflight.printWarnings()

await sql.end()
