/**
 * Shared core of `split-region.ts` and `move-area.ts`. The movers read caller-built temp tables
 * `map_area (area_id, region_id)`, `map_block (block_id, …)`, `map_route (route_id, …)`.
 */
import postgres from 'postgres'

export type Tx = postgres.TransactionSql
type Fragment = postgres.PendingQuery<postgres.Row[]>

/** Every table with a `region_fk`. Asserted against the catalogue so a new one aborts a run. */
export const HANDLED_TABLES = [
  'activities',
  'areas',
  'ascents',
  'blocks',
  'bunny_streams',
  'changes',
  'events',
  'favorites',
  'files',
  'first_ascensionists',
  'geolocations',
  'notifications',
  'reactions',
  'region_invitations',
  'region_members',
  'route_external_resource_27crags',
  'route_external_resource_8a',
  'route_external_resource_the_crag',
  'route_external_resources',
  'routes',
  'routes_to_first_ascensionists',
  'routes_to_tags',
  'topo_routes',
  'topos',
]

const ABORT = Symbol('preflight abort')
const ROLLBACK = Symbol('dry-run rollback')

export class Preflight {
  readonly failures: string[] = []
  readonly warnings: string[] = []

  abortIfFailed(header: string) {
    if (this.failures.length === 0) return
    console.log(`\n${header}`)
    for (const f of this.failures) console.log(`  - ${f}`)
    throw ABORT
  }
  fail = (message: string) => this.failures.push(message)

  printWarnings() {
    if (this.warnings.length === 0) return
    console.log('\nWarnings:')
    for (const w of this.warnings) console.log(`  - ${w}`)
  }

  warn = (message: string) => this.warnings.push(message)
}

/** Opens the connection after refusing arguments: `--dry-run` from the `migrate-*` scripts would be ignored. */
export function connect(name: string): postgres.Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error(`${name}: DATABASE_URL is required`)
  if (process.argv.length > 2) {
    throw new Error(
      `${name}: unexpected argument(s) ${process.argv.slice(2).join(' ')}. This script is a DRY RUN by default; set CONFIRM=true to commit.`,
    )
  }
  return postgres(url, { prepare: false })
}

/** One transaction that rolls back unless `confirm`. Throw {@link ABORT} to stop after a printed preflight. */
export async function runTransaction(sql: postgres.Sql, confirm: boolean, body: (tx: Tx) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      await tx`set local search_path to public`
      await body(tx)
      if (!confirm) {
        console.log('\nDRY RUN - rolling back. Re-run with CONFIRM=true to commit.')
        throw ROLLBACK
      }
      console.log('\nCOMMITTED.')
    })
  } catch (e) {
    if (e !== ROLLBACK && e !== ABORT) throw e
  }
}

/** `count(*)` for a query that has already been narrowed, as a number rather than a bigint string. */
export const countOf = async (rows: Promise<{ c: number }[]>) => (await rows)[0].c

interface FirstAscensionistResult {
  copies: number
  deletedIds: number[]
  /** Full moves that kept their row (claimed or credited elsewhere) beside a same-named one. */
  keptDuplicates: { id: number; name: string; regionId: number }[]
  merged: number
  moved: number
  shared: number
  uncredited: number
}

export async function assertTableCatalogue(tx: Tx, preflight: Preflight) {
  const catalogue = (
    await tx<{ t: string }[]>`
      select table_name as t from information_schema.columns
      where table_schema = 'public' and column_name = 'region_fk' order by table_name`
  ).map((r) => r.t)
  const unhandled = catalogue.filter((t) => !HANDLED_TABLES.includes(t))
  const missing = HANDLED_TABLES.filter((t) => !catalogue.includes(t))
  if (unhandled.length > 0) preflight.fail(`region-scoped tables this script does not handle: ${unhandled.join(', ')}`)
  if (missing.length > 0) preflight.fail(`tables in the map that no longer carry region_fk: ${missing.join(', ')}`)
}

/** Areas, blocks, routes and everything hanging off them, per the maps. Leaves `area_fks` to the caller. */
export async function carryContent(tx: Tx, source: number) {
  await tx`update areas a set region_fk = m.region_id from map_area m where a.id = m.area_id`
  await tx`update blocks b set region_fk = m.region_id from map_block m where b.id = m.block_id`
  await tx`update routes r set region_fk = m.region_id from map_route m where r.id = m.route_id`

  await tx`update ascents x set region_fk = m.region_id from map_route m
           where x.route_fk = m.route_id and x.region_fk = ${source}`
  await tx`update routes_to_tags t set region_fk = m.region_id from map_route m
           where t.route_fk = m.route_id and t.region_fk = ${source}`
  await tx`update routes_to_first_ascensionists t set region_fk = m.region_id from map_route m
           where t.route_fk = m.route_id and t.region_fk = ${source}`
  await tx`update route_external_resources e set region_fk = m.region_id from map_route m
           where e.route_fk = m.route_id and e.region_fk = ${source}`

  // Along the satellite's NOT NULL back-pointer; the parent's forward one is nullable.
  for (const table of [
    'route_external_resource_8a',
    'route_external_resource_27crags',
    'route_external_resource_the_crag',
  ] as const) {
    await tx`
      update ${tx(table)} p set region_fk = e.region_fk
      from route_external_resources e
      where p.external_resources_fk = e.id and p.region_fk = ${source}`
  }

  await tx`update topos t set region_fk = m.region_id from map_block m
           where t.block_fk = m.block_id and t.region_fk = ${source}`
  // `topo_routes` reaches its region through either column, and both are nullable.
  await tx`update topo_routes tr set region_fk = t.region_fk from topos t
           where tr.topo_fk = t.id and tr.region_fk = ${source}`
  await tx`update topo_routes tr set region_fk = m.region_id from map_route m
           where tr.route_fk = m.route_id and tr.region_fk = ${source}`
  // A topo's image usually names no subject of its own; only `topos.file_fk` reaches it.
  await tx`update files f set region_fk = t.region_fk from topos t
           where t.file_fk = f.id and f.region_fk = ${source}`

  await tx`update geolocations g set region_fk = m.region_id from map_area m
           where g.area_fk = m.area_id and g.region_fk = ${source}`
  await tx`update geolocations g set region_fk = m.region_id from map_block m
           where g.block_fk = m.block_id and g.region_fk = ${source}`

  await tx`update files f set region_fk = m.region_id from map_area m
           where f.area_fk = m.area_id and f.region_fk = ${source}`
  await tx`update files f set region_fk = m.region_id from map_block m
           where f.block_fk = m.block_id and f.region_fk = ${source}`
  await tx`update files f set region_fk = m.region_id from map_route m
           where f.route_fk = m.route_id and f.region_fk = ${source}`
  await tx`update files f set region_fk = a.region_fk from ascents a
           where f.ascent_fk = a.id and f.region_fk = ${source}`
  await tx`update bunny_streams bs set region_fk = f.region_fk from files f
           where f.bunny_stream_fk = bs.id and bs.region_fk = ${source}`

  await tx`update favorites v set region_fk = m.region_id from map_area m
           where v.area_fk = m.area_id and v.region_fk = ${source}`
  await tx`update favorites v set region_fk = m.region_id from map_block m
           where v.block_fk = m.block_id and v.region_fk = ${source}`
  await tx`update favorites v set region_fk = m.region_id from map_route m
           where v.route_fk = m.route_id and v.region_fk = ${source}`
}

/** Re-homes first ascensionists by where their credited routes now live: moved whole, merged into a
 *  same-named row (`reuseByName`, unclaimed only), or copied per region. Run after {@link carryContent}. */
export async function carryFirstAscensionists(
  tx: Tx,
  source: number,
  { dropUncredited, reuseByName }: { dropUncredited: boolean; reuseByName: boolean },
): Promise<FirstAscensionistResult> {
  const result: FirstAscensionistResult = {
    copies: 0,
    deletedIds: [],
    keptDuplicates: [],
    merged: 0,
    moved: 0,
    shared: 0,
    uncredited: 0,
  }

  const spans = await tx<{ credits: number; faId: number; regionId: number }[]>`
    select t.first_ascensionist_fk as "faId", r.region_fk as "regionId", count(*)::int as credits
    from routes_to_first_ascensionists t
    join routes r on r.id = t.route_fk
    join first_ascensionists f on f.id = t.first_ascensionist_fk
    -- Moved credits and the ones staying behind; a stale credit in a third region is not followed.
    where f.region_fk = ${source}
      and (t.route_fk in (select route_id from map_route) or r.region_fk = ${source})
    group by 1, 2
    order by 1, credits desc, 2`
  const byFa = Map.groupBy(spans, (s) => s.faId)

  const faCols = await columnsOf(tx, 'first_ascensionists')

  const sameNamed = async (faId: number, regionId: number) => {
    if (!reuseByName) return null
    const [row] = await tx<{ id: number }[]>`
      select t.id from first_ascensionists t, first_ascensionists f
      where f.id = ${faId} and t.region_fk = ${regionId} and lower(t.name) = lower(f.name)
      order by t.id limit 1`
    return row?.id ?? null
  }

  // Claimed, or still credited on a route that did not move: deleting the row would orphan either.
  const mustKeep = async (faId: number) =>
    (await countOf(tx<{ c: number }[]>`
      select (
        (select count(*) from first_ascensionists where id = ${faId} and user_fk is not null) +
        (select count(*) from users where first_ascentionist_fk = ${faId}) +
        (select count(*) from routes_to_first_ascensionists
         where first_ascensionist_fk = ${faId} and route_fk not in (select route_id from map_route)))::int as c`)) > 0

  const repoint = (faId: number, to: number, regionId: number) => tx`
    update routes_to_first_ascensionists set first_ascensionist_fk = ${to}
    where first_ascensionist_fk = ${faId}
      and route_fk in (select route_id from map_route where region_id = ${regionId})`

  for (const [faId, faSpans] of byFa) {
    const away = faSpans.filter((s) => s.regionId !== source)
    if (away.length === 0) continue

    if (faSpans.length === 1) {
      const { regionId } = away[0]
      const existing = await sameNamed(faId, regionId)
      if (existing != null && !(await mustKeep(faId))) {
        await repoint(faId, existing, regionId)
        await tx`delete from first_ascensionists where id = ${faId}`
        result.deletedIds.push(faId)
        result.merged += 1
      } else {
        if (existing != null) {
          const [{ name }] = await tx<{ name: string }[]>`select name from first_ascensionists where id = ${faId}`
          result.keptDuplicates.push({ id: faId, name, regionId })
        }
        await tx`update first_ascensionists set region_fk = ${regionId} where id = ${faId}`
        result.moved += 1
      }
      continue
    }

    result.shared += 1
    let best: null | number = null
    for (const span of away) {
      let to = await sameNamed(faId, span.regionId)
      if (to == null) {
        const [copy] = await tx.unsafe<{ id: number }[]>(
          `insert into first_ascensionists (${faCols}, region_fk)
           select ${faCols}, $1 from first_ascensionists where id = $2 returning id`,
          [span.regionId, faId],
        )
        to = copy.id
        result.copies += 1
      }
      await repoint(faId, to, span.regionId)
      best ??= to
    }
    // Credits left in the source keep the original, and its claim with it.
    if (faSpans.some((s) => s.regionId === source)) continue
    await tx`update users set first_ascentionist_fk = ${best} where first_ascentionist_fk = ${faId}`
    await tx`delete from first_ascensionists where id = ${faId}`
    result.deletedIds.push(faId)
  }

  if (dropUncredited) {
    const uncredited = await tx<{ id: number }[]>`
      select id from first_ascensionists f
      where f.region_fk = ${source} and f.id <> all(${[...byFa.keys()]}::int[])`
    if (uncredited.length > 0) {
      const ids = uncredited.map((r) => r.id)
      await tx`update users set first_ascentionist_fk = null where first_ascentionist_fk in ${tx(ids)}`
      await tx`delete from first_ascensionists where id in ${tx(ids)}`
      result.deletedIds.push(...ids)
    }
    result.uncredited = uncredited.length
  }

  return result
}

/** Events follow their object, and their changes, reactions and notifications follow them. Run after {@link carryContent}. */
export async function carryLog(tx: Tx, source: number) {
  await tx`update events e set region_fk = m.region_id from map_area m
           where e.area_fk = m.area_id and e.region_fk = ${source}`
  await tx`update events e set region_fk = m.region_id from map_block m
           where e.block_fk = m.block_id and e.region_fk = ${source}`
  await tx`update events e set region_fk = m.region_id from map_route m
           where e.route_fk = m.route_id and e.region_fk = ${source}`
  await tx`update events e set region_fk = a.region_fk from ascents a
           where e.ascent_fk = a.id and e.region_fk = ${source}`
  await tx`update events e set region_fk = f.region_fk from files f
           where e.file_fk = f.id and e.region_fk = ${source}`

  await tx`update changes c set region_fk = e.region_fk from events e
           where c.event_fk = e.id and c.region_fk = ${source}`
  await tx`update reactions r set region_fk = e.region_fk from events e
           where r.event_fk = e.id and r.region_fk = ${source}`
  await tx`update notifications n set region_fk = e.region_fk from events e
           where n.event_fk = e.id and n.region_fk = ${source}`
  await tx`update notifications n set region_fk = r.region_fk from reactions r
           where n.reaction_fk = r.id and n.region_fk = ${source}`
  // A mention has no `event_fk` and is identified by its object alone.
  await tx`update notifications n set region_fk = m.region_id from map_area m
           where n.area_fk = m.area_id and n.region_fk = ${source}`
  await tx`update notifications n set region_fk = m.region_id from map_block m
           where n.block_fk = m.block_id and n.region_fk = ${source}`
  await tx`update notifications n set region_fk = m.region_id from map_route m
           where n.route_fk = m.route_id and n.region_fk = ${source}`
  await tx`update notifications n set region_fk = f.region_fk from files f
           where n.file_fk = f.id and n.region_fk = ${source}`
  await tx`update notifications n set region_fk = a.region_fk from ascents a
           where n.ascent_fk = a.id and n.region_fk = ${source}`

  // 1.0's frozen log, keyed by a text id. Compared as text: a guarded int cast still raises 22P02 on a file's cuid2.
  for (const [entityType, mapTable, mapColumn] of [
    ['area', 'map_area', 'area_id'],
    ['block', 'map_block', 'block_id'],
    ['route', 'map_route', 'route_id'],
  ] as const) {
    await tx`
      update activities x set region_fk = m.region_id from ${tx(mapTable)} m
      where x.entity_type = ${entityType} and x.entity_id = m.${tx(mapColumn)}::text
        and x.region_fk = ${source}`
  }
  await tx`
    update activities x set region_fk = a.region_fk from ascents a
    where x.entity_type = 'ascent' and x.entity_id = a.id::text and x.region_fk = ${source}`
  await tx`
    update activities x set region_fk = f.region_fk from files f
    where x.entity_type = 'file' and x.entity_id = f.id and x.region_fk = ${source}`
}

/**
 * A table's columns minus its identity, `region_fk`, `event_fk` and `also`, as one quoted list:
 * postgres.js reads `sql(array)` in an insert as VALUES, not as a column list.
 */
export async function columnsOf(tx: Tx, table: string, also: string[] = []): Promise<string> {
  const skip = ['id', 'region_fk', 'event_fk', ...also]
  const rows = await tx<{ c: string }[]>`
    select column_name as c from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
      and column_name <> all(${skip}) order by ordinal_position`
  return rows.map((r) => `"${r.c}"`).join(', ')
}

/**
 * Rows in `regions` that disagree with the region of what they hang off, or point at something
 * gone. The scope keeps a run from answering for inconsistencies elsewhere in the database.
 */
export async function integrityCounts(
  tx: Tx,
  regions: Fragment,
  deletedFaIds: number[],
): Promise<[what: string, count: number][]> {
  const checks: [string, Promise<{ c: number }[]>][] = [
    [
      'an area whose parent is in another region',
      tx`select count(*)::int as c from areas a join areas p on p.id = a.parent_fk
         where a.region_fk in (${regions}) and a.region_fk <> p.region_fk`,
    ],
    [
      'a block whose area no longer exists or sits in another region',
      tx`select count(*)::int as c from blocks b where b.region_fk in (${regions})
         and not exists (select 1 from areas a where a.id = b.area_fk and a.region_fk = b.region_fk)`,
    ],
    [
      'a route whose block no longer exists or sits in another region',
      tx`select count(*)::int as c from routes r where r.region_fk in (${regions})
         and not exists (select 1 from blocks b where b.id = r.block_fk and b.region_fk = r.region_fk)`,
    ],
    [
      'an ascent whose route is in another region',
      tx`select count(*)::int as c from ascents x join routes r on r.id = x.route_fk
         where x.region_fk in (${regions}) and x.region_fk <> r.region_fk`,
    ],
    [
      'a topo whose block is in another region',
      tx`select count(*)::int as c from topos t join blocks b on b.id = t.block_fk
         where t.region_fk in (${regions}) and t.region_fk <> b.region_fk`,
    ],
    [
      'a topo line whose topo or route is in another region',
      tx`select count(*)::int as c from topo_routes tr
         left join topos t on t.id = tr.topo_fk left join routes r on r.id = tr.route_fk
         where tr.region_fk in (${regions})
           and (tr.region_fk <> t.region_fk or tr.region_fk <> r.region_fk)`,
    ],
    [
      'a topo whose image is in another region',
      tx`select count(*)::int as c from topos t join files f on f.id = t.file_fk
         where t.region_fk in (${regions}) and t.region_fk <> f.region_fk`,
    ],
    [
      'a file whose subject is in another region',
      tx`select count(*)::int as c from files f
         left join areas a on a.id = f.area_fk left join blocks b on b.id = f.block_fk
         left join routes r on r.id = f.route_fk left join ascents x on x.id = f.ascent_fk
         where f.region_fk in (${regions}) and f.region_fk <> coalesce(x.region_fk, r.region_fk, b.region_fk, a.region_fk)`,
    ],
    [
      'a video stream whose file is in another region',
      tx`select count(*)::int as c from bunny_streams bs join files f on f.bunny_stream_fk = bs.id
         where bs.region_fk in (${regions}) and bs.region_fk <> f.region_fk`,
    ],
    [
      'a pin whose area or block is in another region',
      tx`select count(*)::int as c from geolocations g
         left join areas a on a.id = g.area_fk left join blocks b on b.id = g.block_fk
         where g.region_fk in (${regions}) and g.region_fk <> coalesce(b.region_fk, a.region_fk)`,
    ],
    [
      'a save whose subject is in another region',
      tx`select count(*)::int as c from favorites v
         left join areas a on a.id = v.area_fk left join blocks b on b.id = v.block_fk
         left join routes r on r.id = v.route_fk
         where v.region_fk in (${regions}) and v.region_fk <> coalesce(r.region_fk, b.region_fk, a.region_fk)`,
    ],
    [
      'a tag or external resource whose route is in another region',
      tx`select count(*)::int as c from routes r
         where exists (select 1 from routes_to_tags t
                       where t.route_fk = r.id and t.region_fk in (${regions}) and t.region_fk <> r.region_fk)
            or exists (select 1 from route_external_resources e
                       where e.route_fk = r.id and e.region_fk in (${regions}) and e.region_fk <> r.region_fk)`,
    ],
    [
      'an external resource provider row in another region than its resource',
      tx`select count(*)::int as c from route_external_resources e
         where e.region_fk in (${regions}) and (
           exists (select 1 from route_external_resource_8a p where p.external_resources_fk = e.id and p.region_fk <> e.region_fk)
           or exists (select 1 from route_external_resource_27crags p where p.external_resources_fk = e.id and p.region_fk <> e.region_fk)
           or exists (select 1 from route_external_resource_the_crag p where p.external_resources_fk = e.id and p.region_fk <> e.region_fk))`,
    ],
    [
      'an event whose subject is in another region',
      tx`select count(*)::int as c from events e
         left join areas a on a.id = e.area_fk left join blocks b on b.id = e.block_fk
         left join routes r on r.id = e.route_fk left join ascents x on x.id = e.ascent_fk
         left join files f on f.id = e.file_fk
         where e.region_fk in (${regions})
           and e.region_fk <> coalesce(x.region_fk, f.region_fk, r.region_fk, b.region_fk, a.region_fk)`,
    ],
    [
      'a notification whose card or subject is in another region',
      tx`select count(*)::int as c from notifications n
         left join events e on e.id = n.event_fk left join reactions rx on rx.id = n.reaction_fk
         left join areas a on a.id = n.area_fk left join blocks b on b.id = n.block_fk
         left join routes r on r.id = n.route_fk left join ascents x on x.id = n.ascent_fk
         left join files f on f.id = n.file_fk
         where n.region_fk in (${regions}) and n.region_fk <> coalesce(
           e.region_fk, rx.region_fk, x.region_fk, f.region_fk, r.region_fk, b.region_fk, a.region_fk)`,
    ],
    [
      'a change whose event is in another region',
      tx`select count(*)::int as c from changes c join events e on e.id = c.event_fk
         where c.region_fk in (${regions}) and c.region_fk <> e.region_fk`,
    ],
    [
      'a reaction whose event is in another region',
      tx`select count(*)::int as c from reactions r join events e on e.id = r.event_fk
         where r.region_fk in (${regions}) and r.region_fk <> e.region_fk`,
    ],
    [
      'a reply whose parent comment is gone or sits in another region',
      tx`select count(*)::int as c from reactions r
         where r.region_fk in (${regions}) and r.parent_fk is not null
           and not exists (select 1 from reactions p where p.id = r.parent_fk and p.region_fk = r.region_fk)`,
    ],
    [
      'a first ascent credit whose route is in another region',
      tx`select count(*)::int as c from routes_to_first_ascensionists t join routes r on r.id = t.route_fk
         where t.region_fk in (${regions}) and t.region_fk <> r.region_fk`,
    ],
    [
      'a first ascent credit naming a first ascensionist in another region',
      tx`select count(*)::int as c from routes_to_first_ascensionists t
         join first_ascensionists f on f.id = t.first_ascensionist_fk
         where t.region_fk in (${regions}) and t.region_fk <> f.region_fk`,
    ],
    [
      'an event pointing at an area that no longer exists',
      tx`select count(*)::int as c from events e where e.region_fk in (${regions})
         and e.area_fk is not null and not exists (select 1 from areas a where a.id = e.area_fk)`,
    ],
    [
      'a route whose denormalised area chain names an area that no longer exists',
      tx`select count(*)::int as c from routes r
         where r.region_fk in (${regions}) and r.area_fks is not null and exists (
           select 1 from unnest(r.area_fks) x where not exists (select 1 from areas a where a.id = x))`,
    ],
    [
      'a claim on a first ascensionist this run deleted',
      tx`select count(*)::int as c from users u where u.first_ascentionist_fk is not null
         and u.first_ascentionist_fk in ${tx(deletedFaIds.length > 0 ? deletedFaIds : [0])}`,
    ],
    [
      // Any region: a stale credit elsewhere is exactly what a replica-mode delete would orphan.
      'a first ascent credit naming a first ascensionist this run deleted',
      tx`select count(*)::int as c from routes_to_first_ascensionists
         where first_ascensionist_fk in ${tx(deletedFaIds.length > 0 ? deletedFaIds : [0])}`,
    ],
  ]
  const counts: [string, number][] = []
  for (const [what, query] of checks) counts.push([what, await countOf(query)])
  return counts
}
