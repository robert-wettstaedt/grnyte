/**
 * Seed a large, realistic domain tree (area -> sector -> block -> route ->
 * ascent [+ topos, topo lines, first ascensionists, events, media]) into one
 * region, so dev can be measured at prod's volume.
 *
 * `area.type` is derived from content (see area.server.ts): an area holding
 * sub-areas is type 'area', an area holding blocks is type 'sector'.
 *
 * Run `seed-dev-region.ts` first (it creates the region + members this reads).
 *
 * `PROFILE=prod` applies the shape measured on prod for one reader's regions
 * (the targets live in the zero-latency change's design.md). Any knob below
 * overrides it. Without a profile the defaults reproduce the original ~5000
 * route tree with no topos, first ascensionists or events.
 *
 *   AREAS SECTORS_PER_AREA MID_LEVELS MID_BRANCHING BLOCKS_PER_SECTOR
 *   ROUTES_PER_BLOCK | ROUTES_PER_BLOCK_MEDIAN ROUTES_PER_BLOCK_P90 ROUTES_PER_BLOCK_MAX
 *   GEO_BLOCK_SHARE TOPO_BLOCK_SHARE TOPO_EXTRA_P TOPO_LINE_SHARE TOPO_LINE_EXTRA_P
 *   FA_PEOPLE FA_ROUTE_SHARE FA_EXTRA_P EVENTS ASCENT_ROUTE_SHARE
 *   WITH_MEDIA MEDIA_BLOCK_SHARE MEDIA_ROUTE_SHARE MEDIA_ASCENT_SHARE
 *   REGION_NAME='Volume Test'   SEED=42   RESET=false
 *
 * Additive by default (re-running stacks more data). RESET=true first wipes the
 * target region's existing content. Throwaway/dev DBs only: never a real one.
 * Media paths are placeholders: the rows exist but images won't render.
 */
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('seed-volume: DATABASE_URL is required')

// Measured on prod 2026-10-01 as aggregates over one reader's eight regions.
const PROFILES: Record<string, Record<string, number>> = {
  prod: {
    AREAS: 8,
    ASCENT_ROUTE_SHARE: 0.08,
    BLOCKS_PER_SECTOR: 3.59,
    EVENTS: 12_350,
    FA_EXTRA_P: 0.12,
    FA_PEOPLE: 287,
    FA_ROUTE_SHARE: 0.55,
    GEO_BLOCK_SHARE: 0.86,
    MEDIA_ASCENT_SHARE: 0.03,
    MEDIA_BLOCK_SHARE: 0.1,
    MEDIA_ROUTE_SHARE: 0.07,
    MID_BRANCHING: 4,
    MID_LEVELS: 2,
    ROUTES_PER_BLOCK_MAX: 58,
    ROUTES_PER_BLOCK_MEDIAN: 2,
    // Measured p90 is 9; a lognormal through 2 and 9 overshoots prod's 6,729 routes by 16%.
    ROUTES_PER_BLOCK_P90: 8.5,
    SECTORS_PER_AREA: 4,
    TOPO_BLOCK_SHARE: 0.47,
    TOPO_EXTRA_P: 0.23,
    TOPO_LINE_EXTRA_P: 0.05,
    TOPO_LINE_SHARE: 0.55,
  },
}
const profile = PROFILES[process.env.PROFILE ?? ''] ?? {}
if (process.env.PROFILE && !PROFILES[process.env.PROFILE]) {
  throw new Error(`seed-volume: unknown PROFILE "${process.env.PROFILE}"`)
}

const num = (name: string, def: number) => Number(process.env[name] ?? profile[name] ?? def)
const AREAS = num('AREAS', 10)
const MID_LEVELS = num('MID_LEVELS', 0)
const MID_BRANCHING = num('MID_BRANCHING', 4)
const SECTORS_PER_AREA = num('SECTORS_PER_AREA', 5)
const BLOCKS_PER_SECTOR = num('BLOCKS_PER_SECTOR', 5)
const ROUTES_PER_BLOCK = num('ROUTES_PER_BLOCK', 20)
const ROUTES_PER_BLOCK_MEDIAN = num('ROUTES_PER_BLOCK_MEDIAN', 0)
const ROUTES_PER_BLOCK_P90 = num('ROUTES_PER_BLOCK_P90', 0)
const ROUTES_PER_BLOCK_MAX = num('ROUTES_PER_BLOCK_MAX', 1_000)
const GEO_BLOCK_SHARE = num('GEO_BLOCK_SHARE', 1)
const TOPO_BLOCK_SHARE = num('TOPO_BLOCK_SHARE', 0)
const TOPO_EXTRA_P = num('TOPO_EXTRA_P', 0.23)
const TOPO_LINE_SHARE = num('TOPO_LINE_SHARE', 0.55)
const TOPO_LINE_EXTRA_P = num('TOPO_LINE_EXTRA_P', 0.05)
const FA_PEOPLE = num('FA_PEOPLE', 0)
const FA_ROUTE_SHARE = num('FA_ROUTE_SHARE', 0.55)
const FA_EXTRA_P = num('FA_EXTRA_P', 0.12)
const EVENTS = num('EVENTS', 0)
const ASCENT_ROUTE_SHARE = num('ASCENT_ROUTE_SHARE', 0.6)
const MEDIA_BLOCK_SHARE = num('MEDIA_BLOCK_SHARE', 0.3)
const MEDIA_ROUTE_SHARE = num('MEDIA_ROUTE_SHARE', 0.15)
const MEDIA_ASCENT_SHARE = num('MEDIA_ASCENT_SHARE', 0.1)
const WITH_MEDIA = (process.env.WITH_MEDIA ?? 'true') !== 'false'
const REGION_NAME = process.env.REGION_NAME ?? 'Volume Test'
const MAX_GRADE = 24 // grades 0..24, seeded by drizzle/0127_yummy_whirlwind.sql

// Deterministic PRNG (mulberry32) so a given SEED reproduces the same tree.
let state = num('SEED', 42) >>> 0
const rand = () => {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
// Triangular-ish grade so histograms cluster in the middle, not flat.
const grade = () => Math.round(((rand() + rand()) / 2) * MAX_GRADE)
// 1 plus a geometric tail, capped: most draws are 1, some 2, a few more.
const oneOrMore = (extraP: number, cap: number) => {
  let n = 1
  while (n < cap && rand() < extraP) n++
  return n
}
// A fractional mean as a whole count that averages out to it.
const roundMean = (mean: number) => Math.floor(mean) + (rand() < mean % 1 ? 1 : 0)

// Lognormal routes per block from a median and p90, which is the shape prod has (2, 9, max 58).
const routesPerBlock = () => {
  if (ROUTES_PER_BLOCK_MEDIAN <= 0) return ROUTES_PER_BLOCK
  const mu = Math.log(ROUTES_PER_BLOCK_MEDIAN)
  const sigma = (Math.log(ROUTES_PER_BLOCK_P90) - mu) / 1.2816
  const z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
  return Math.min(ROUTES_PER_BLOCK_MAX, Math.max(1, Math.round(Math.exp(mu + sigma * z))))
}

const sql = postgres(DATABASE_URL, { prepare: false })

// Bulk insert in chunks (Postgres caps params at 65535); returns inserted ids.
// Schema-qualified as two identifiers around a literal dot, because transaction-mode pooling
// gives each statement whatever connection is free and no session `search_path` survives.
const insertReturningIds = async (rel: string, rows: Record<string, unknown>[], cols: string[]) => {
  const ids: number[] = []
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000)
    const out = await sql<
      { id: number }[]
    >`insert into ${sql('public')}.${sql(rel)} ${sql(chunk, ...cols)} returning id`
    ids.push(...out.map((r) => r.id))
  }
  return ids
}
const insert = async (rel: string, rows: Record<string, unknown>[], cols: string[]) => {
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`insert into ${sql('public')}.${sql(rel)} ${sql(rows.slice(i, i + 1000), ...cols)}`
  }
}

const [region] = await sql<{ createdBy: number; id: number }[]>`
  select id, created_by as "createdBy" from public.regions where name = ${REGION_NAME} limit 1`
if (!region) throw new Error(`seed-volume: region "${REGION_NAME}" not found - run seed-dev-region.ts first`)

const members = await sql<{ id: number }[]>`
  select u.id from public.region_members rm
  join public.users u on rm.user_fk = u.id
  where rm.region_fk = ${region.id} and rm.is_active`
const creators = members.length ? members.map((m) => m.id) : [region.createdBy]
const author = () => pick(creators)

// The region's own vocabulary, since tags stopped being global. Empty rather than a copy of
// `DEFAULT_TAGS`: migration 0089 wrote the key onto every region, and the tag seeding below is
// already guarded on this being non-empty.
const tags =
  (
    await sql<{ tags: null | string[] }[]>`
  select settings -> 'tags' as tags from public.regions where id = ${region.id}`
  )[0]?.tags ?? []

// RESET=true wipes this region's existing content first, dependents before what they point at.
if (process.env.RESET === 'true') {
  const r = region.id
  console.log(`RESET: wiping existing content in region ${r}`)
  for (const rel of ['notifications', 'reactions', 'changes', 'events', 'favorites', 'route_external_resources']) {
    await sql`delete from ${sql('public')}.${sql(rel)} where region_fk = ${r}`
  }
  await sql`delete from public.topo_routes where region_fk = ${r}`
  await sql`delete from public.topos where region_fk = ${r}`
  await sql`delete from public.bunny_streams where region_fk = ${r}`
  await sql`delete from public.files where region_fk = ${r}`
  await sql`delete from public.routes_to_first_ascensionists where region_fk = ${r}`
  await sql`delete from public.routes_to_tags where region_fk = ${r}`
  await sql`delete from public.ascents where region_fk = ${r}`
  await sql`delete from public.routes where region_fk = ${r}`
  await sql`
    update public.users set first_ascentionist_fk = null
    where first_ascentionist_fk in (select id from public.first_ascensionists where region_fk = ${r})`
  await sql`delete from public.first_ascensionists where region_fk = ${r}`
  await sql`update public.blocks set geolocation_fk = null where region_fk = ${r}`
  await sql`delete from public.geolocations where region_fk = ${r}`
  await sql`delete from public.blocks where region_fk = ${r}`
  // Any depth: detach every parent link, then nothing references anything.
  await sql`update public.areas set parent_fk = null where region_fk = ${r}`
  await sql`delete from public.areas where region_fk = ${r}`
}

console.log(`seeding into region ${region.id} ("${REGION_NAME}") as ${creators.length} creator(s)`)

const areaCols = ['name', 'created_by', 'region_fk', 'type', 'parent_fk', 'description']
const parentOf = new Map<number, number>()

const rootIds = await insertReturningIds(
  'areas',
  Array.from({ length: AREAS }, (_, i) => ({
    created_by: author(),
    description: 'Seeded area.',
    name: `Area ${String(i + 1).padStart(2, '0')}`,
    parent_fk: null,
    region_fk: region.id,
    type: 'area',
  })),
  areaCols,
)
let level = rootIds.map((id, i) => ({ id, label: String(i + 1).padStart(2, '0') }))
let areaCount = rootIds.length

// Intermediate 'area' levels between the roots and the block-holding sectors.
for (let depth = 0; depth < MID_LEVELS; depth++) {
  const rows = level.flatMap((parent) =>
    Array.from({ length: MID_BRANCHING }, (_, i) => ({
      label: `${parent.label}-${i + 1}`,
      row: {
        created_by: author(),
        description: 'Seeded area.',
        name: `Area ${parent.label}-${i + 1}`,
        parent_fk: parent.id,
        region_fk: region.id,
        type: 'area',
      },
    })),
  )
  const ids = await insertReturningIds(
    'areas',
    rows.map((x) => x.row),
    areaCols,
  )
  ids.forEach((id, i) => parentOf.set(id, rows[i].row.parent_fk))
  level = ids.map((id, i) => ({ id, label: rows[i].label }))
  areaCount += ids.length
}

const sectorRows = level.flatMap((parent) =>
  Array.from({ length: SECTORS_PER_AREA }, (_, i) => ({
    created_by: author(),
    description: 'Seeded sector.',
    name: `Sector ${parent.label}-${String(i + 1).padStart(2, '0')}`,
    parent_fk: parent.id,
    region_fk: region.id,
    type: 'sector',
  })),
)
const sectorIds = await insertReturningIds('areas', sectorRows, areaCols)
sectorIds.forEach((id, i) => parentOf.set(id, sectorRows[i].parent_fk))
areaCount += sectorIds.length
console.log(`  areas: ${areaCount} (${sectorIds.length} sectors, depth ${MID_LEVELS + 2})`)

// Leaf sector up to its root, which is what routes denormalise for area filters.
const chainOf = (sectorId: number) => {
  const chain = [sectorId]
  for (let id = parentOf.get(sectorId); id != null; id = parentOf.get(id)) chain.push(id)
  return chain
}

// Clustered but distinct coords so blocks render as separate map markers:
// areas spread across the region, sectors cluster within their root, blocks
// scatter within their sector. Continuous jitter => no two blocks coincide.
const BASE = { lat: 46.5, long: 8.0 } // arbitrary alpine-ish anchor
const jit = (range: number) => (rand() * 2 - 1) * range
const rootCenters = new Map(rootIds.map((id) => [id, { lat: BASE.lat + jit(0.25), long: BASE.long + jit(0.25) }]))
const sectorCenters = sectorIds.map((id) => {
  const chain = chainOf(id)
  const c = rootCenters.get(chain[chain.length - 1])!
  return { lat: c.lat + jit(0.02), long: c.long + jit(0.02) }
})

const blockCoords: { lat: number; long: number }[] = []
const blockMeta: { name: string; order: number; sectorId: number }[] = []
sectorIds.forEach((sectorId, ci) => {
  const c = sectorCenters[ci]
  const n = Math.max(1, roundMean(BLOCKS_PER_SECTOR))
  for (let i = 0; i < n; i++) {
    blockCoords.push({ lat: c.lat + jit(0.0015), long: c.long + jit(0.0015) })
    blockMeta.push({ name: `Block ${i + 1}`, order: i, sectorId })
  }
})

// Geolocations for a share of blocks: insert geos, point blocks at them, then
// back-link geolocation.block_fk (mirrors block create).
const geolocated = blockMeta.map(() => rand() < GEO_BLOCK_SHARE)
const geoIds = await insertReturningIds(
  'geolocations',
  blockCoords
    .filter((_, i) => geolocated[i])
    .map((c) => ({ estimated: false, lat: c.lat, long: c.long, region_fk: region.id })),
  ['region_fk', 'lat', 'long', 'estimated'],
)
let nextGeo = 0
const blockRows = blockMeta.map((m, i) => ({
  area_fk: m.sectorId,
  created_by: author(),
  geolocation_fk: geolocated[i] ? geoIds[nextGeo++] : null,
  name: m.name,
  order: m.order,
  region_fk: region.id,
}))
const blockIds = await insertReturningIds('blocks', blockRows, [
  'name',
  'created_by',
  'region_fk',
  'area_fk',
  'order',
  'geolocation_fk',
])
const geoLinks = blockRows.flatMap((r, i) => (r.geolocation_fk == null ? [] : [[r.geolocation_fk, blockIds[i]]]))
await sql`
  update public.geolocations g set block_fk = d.bid
  from unnest(${geoLinks.map((l) => l[0])}::int[], ${geoLinks.map((l) => l[1])}::int[]) as d(gid, bid)
  where g.id = d.gid`
console.log(`  blocks: ${blockIds.length} (+ ${geoIds.length} geolocations)`)

// areaFks/areaIds denormalise the block's area chain (leaf sector -> root area),
// matching routes.remote.ts so area filters find these routes.
const routeBlock: number[] = []
const routeRows = blockIds.flatMap((blockId, bi) => {
  const areaFks = chainOf(blockRows[bi].area_fk)
  const areaIds = areaFks.map((id) => `^${id}$`).join(',')
  return Array.from({ length: routesPerBlock() }, (_, i) => {
    // user_grade_fk / user_rating are the COMMUNITY values the UI
    // displays (grade_fk / rating are the original, shown only in the breakdown).
    // Seed both so grades/ratings render and histograms populate.
    const g = grade()
    const r = rand() < 0.7 ? int(1, 5) : null
    routeBlock.push(blockId)
    return {
      area_fks: areaFks,
      area_ids: areaIds,
      block_fk: blockId,
      created_by: author(),
      description: null,
      first_ascent_year: rand() < 0.6 ? int(1985, 2024) : null,
      grade_fk: g,
      name: `Route ${String(i + 1).padStart(3, '0')}`,
      rating: r,
      region_fk: region.id,
      user_grade_fk: g,
      user_rating: r,
    }
  })
})
const routeIds = await insertReturningIds('routes', routeRows, [
  'name',
  'created_by',
  'region_fk',
  'block_fk',
  'grade_fk',
  'user_grade_fk',
  'rating',
  'user_rating',
  'first_ascent_year',
  'area_fks',
  'area_ids',
  'description',
])
console.log(`  routes: ${routeIds.length}`)

if (tags.length) {
  const tagRows: Record<string, unknown>[] = []
  for (const routeId of routeIds) {
    if (rand() < 0.35) {
      const t = pick(tags)
      tagRows.push({ region_fk: region.id, route_fk: routeId, tag_fk: t })
      if (rand() < 0.3) {
        const t2 = pick(tags)
        if (t2 !== t) tagRows.push({ region_fk: region.id, route_fk: routeId, tag_fk: t2 })
      }
    }
  }
  await insert('routes_to_tags', tagRows, ['region_fk', 'route_fk', 'tag_fk'])
  console.log(`  route tags: ${tagRows.length}`)
}

// `files.id` has no default, so every file row carries its own.
const fileCols = [
  'id',
  'region_fk',
  'created_by',
  'path',
  'width',
  'height',
  'visibility',
  'block_fk',
  'route_fk',
  'ascent_fk',
]
const fileRow = (path: string, fks: Partial<Record<'ascent_fk' | 'block_fk' | 'route_fk', number>> = {}) => {
  const id = randomUUID()
  return {
    ascent_fk: null,
    block_fk: null,
    route_fk: null,
    ...fks,
    created_by: author(),
    height: 768,
    id,
    path: path.replace('{id}', id),
    region_fk: region.id,
    visibility: 'public',
    width: 1024,
  }
}

if (TOPO_BLOCK_SHARE > 0) {
  const topoFiles: ReturnType<typeof fileRow>[] = []
  const topoRows: Record<string, unknown>[] = []
  const toposOfBlock = new Map<number, number[]>()
  for (const blockId of blockIds) {
    if (rand() >= TOPO_BLOCK_SHARE) continue
    const n = oneOrMore(TOPO_EXTRA_P, 7)
    for (let order = 0; order < n; order++) {
      const file = fileRow('/topos/seed-{id}.jpg')
      topoFiles.push(file)
      topoRows.push({ block_fk: blockId, file_fk: file.id, order, region_fk: region.id })
    }
  }
  await insert('files', topoFiles, fileCols)
  const topoIds = await insertReturningIds('topos', topoRows, ['region_fk', 'block_fk', 'file_fk', 'order'])
  topoIds.forEach((id, i) => {
    const b = topoRows[i].block_fk as number
    toposOfBlock.set(b, [...(toposOfBlock.get(b) ?? []), id])
  })

  const linePath = () => {
    const pts = Array.from({ length: int(3, 6) }, () => `${rand().toFixed(3)},${rand().toFixed(3)}`)
    return `M${pts[0]} ${pts
      .slice(1)
      .map((p) => `L${p}`)
      .join(' ')}`
  }
  const lineRows: Record<string, unknown>[] = []
  routeIds.forEach((routeId, i) => {
    const topos = toposOfBlock.get(routeBlock[i])
    if (!topos || rand() >= TOPO_LINE_SHARE) return
    for (let k = oneOrMore(TOPO_LINE_EXTRA_P, 3); k > 0; k--) {
      lineRows.push({
        path: linePath(),
        region_fk: region.id,
        route_fk: routeId,
        top_type: pick(['top', 'topout']),
        topo_fk: pick(topos),
      })
    }
  })
  await insert('topo_routes', lineRows, ['region_fk', 'top_type', 'path', 'route_fk', 'topo_fk'])
  console.log(`  topos: ${topoIds.length} (+ ${topoFiles.length} files, ${lineRows.length} lines)`)
}

if (FA_PEOPLE > 0) {
  const peopleIds = await insertReturningIds(
    'first_ascensionists',
    Array.from({ length: FA_PEOPLE }, (_, i) => ({
      name: `Climber ${String(i + 1).padStart(3, '0')}`,
      region_fk: region.id,
    })),
    ['region_fk', 'name'],
  )
  const linkRows: Record<string, unknown>[] = []
  for (const routeId of routeIds) {
    if (rand() >= FA_ROUTE_SHARE) continue
    // Squared so a few prolific people account for most first ascents, as real ones do.
    const chosen = new Set<number>()
    for (let k = oneOrMore(FA_EXTRA_P, 4); k > 0; k--) chosen.add(peopleIds[Math.floor(rand() ** 2 * peopleIds.length)])
    for (const person of chosen)
      linkRows.push({ first_ascensionist_fk: person, region_fk: region.id, route_fk: routeId })
  }
  await insert('routes_to_first_ascensionists', linkRows, ['region_fk', 'route_fk', 'first_ascensionist_fk'])
  console.log(`  first ascensionists: ${peopleIds.length} (${linkRows.length} route links)`)
}

const ASCENT_TYPES = ['flash', 'redpoint', 'redpoint', 'redpoint', 'repeat', 'attempt'] as const
const dayMs = 86_400_000
const now = Date.now()
const ascentRows = routeIds.flatMap((routeId) => {
  const n = rand() < ASCENT_ROUTE_SHARE ? int(1, 3) : 0
  return Array.from({ length: n }, () => {
    // Conditions on a minority of ascents, so the ConditionsPill and its absence are both
    // represented. Without any of these the pill never rendered and the unit formatting on the
    // share page (`/f/[id]`, the one SSR'd route) could not be checked at all.
    //
    // `humidity` is whole percent, not a 0-1 fraction: `formatHumidity` divides by 100 before
    // handing it to `Intl.NumberFormat`'s percent style.
    const conditions = rand() < 0.35

    return {
      created_by: author(),
      date_time: new Date(now - int(0, 5 * 365) * dayMs).toISOString().slice(0, 10),
      grade_fk: rand() < 0.5 ? grade() : null,
      humidity: conditions ? int(20, 95) : null,
      notes: rand() < 0.2 ? 'Great line.' : null,
      rating: rand() < 0.6 ? int(1, 5) : null,
      region_fk: region.id,
      route_fk: routeId,
      temperature: conditions ? int(-5, 30) : null,
      type: pick(ASCENT_TYPES),
    }
  })
})
const ascentIds = await insertReturningIds('ascents', ascentRows, [
  'created_by',
  'region_fk',
  'route_fk',
  'type',
  'date_time',
  'grade_fk',
  'rating',
  'notes',
  'temperature',
  'humidity',
])
console.log(`  ascents: ${ascentIds.length}`)

if (WITH_MEDIA) {
  const fileRows: ReturnType<typeof fileRow>[] = []
  blockIds.forEach(
    (id) => rand() < MEDIA_BLOCK_SHARE && fileRows.push(fileRow(`sandbox/seed/block-${id}.jpg`, { block_fk: id })),
  )
  routeIds.forEach(
    (id) => rand() < MEDIA_ROUTE_SHARE && fileRows.push(fileRow(`sandbox/seed/route-${id}.jpg`, { route_fk: id })),
  )
  ascentIds.forEach(
    (id) => rand() < MEDIA_ASCENT_SHARE && fileRows.push(fileRow(`sandbox/seed/ascent-${id}.jpg`, { ascent_fk: id })),
  )
  await insert('files', fileRows, fileCols)
  console.log(`  media files: ${fileRows.length} (placeholder paths, won't render)`)
}

// `create` only: an `update` card expects `changes` rows this does not write. One object per
// event, as the `events_one_object` check requires.
if (EVENTS > 0) {
  type Kind = 'area_fk' | 'ascent_fk' | 'block_fk' | 'route_fk'
  const weights: [Kind, number][] = [
    ['route_fk', 12],
    ['block_fk', 3],
    ['ascent_fk', ascentIds.length ? 3 : 0],
    ['area_fk', 2],
  ]
  const kinds = weights.flatMap(([kind, w]) => Array<Kind>(w).fill(kind))
  const objectOf = { area_fk: sectorIds, ascent_fk: ascentIds, block_fk: blockIds, route_fk: routeIds }
  const eventRows = Array.from({ length: EVENTS }, () => {
    const kind = pick(kinds)
    const base = {
      actor_fk: author(),
      area_fk: null,
      ascent_fk: null,
      block_fk: null,
      created_at: new Date(now - rand() * 730 * dayMs).toISOString(),
      region_fk: region.id,
      route_fk: null,
      verb: 'create',
    }
    // After the spread, so the one object overrides its null.
    return { ...base, [kind]: pick(objectOf[kind]) }
  })
  await insert('events', eventRows, [
    'region_fk',
    'actor_fk',
    'verb',
    'created_at',
    'route_fk',
    'block_fk',
    'ascent_fk',
    'area_fk',
  ])
  console.log(`  events: ${eventRows.length}`)
}

await sql.end()
console.log('volume seed complete.')
