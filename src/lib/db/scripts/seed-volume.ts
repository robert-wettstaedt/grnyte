/**
 * Seed a large, realistic domain tree (area -> crag -> block -> route ->
 * ascent [+ media]) into one region, to replace the ~5000-route volume that
 * region 1 used to provide for load/UX testing.
 *
 * `area.type` is derived from content (see area.server.ts): an area holding
 * sub-areas is type 'area', an area holding blocks is type 'crag'. So the roots
 * here are 'area' and their block-holding children are 'crag'.
 *
 * Run `seed-dev-region.ts` first (it creates the region + members this reads).
 *
 * Every block gets a clustered-but-distinct geolocation so the map renders.
 *
 * Config via env (defaults -> ~5000 routes):
 *   AREAS=10 CRAGS_PER_AREA=5 BLOCKS_PER_CRAG=5 ROUTES_PER_BLOCK=20
 *   WITH_MEDIA=true   REGION_NAME='Volume Test'   SEED=42   RESET=false
 *
 * Additive by default (re-running stacks more data). RESET=true first wipes the
 * target region's existing content. Throwaway/dev DBs only - never a real one.
 *
 * ponytail: no `event` rows are written, so the global feed won't list this
 * content (profile / area / route / explore views will). Add event seeding
 * if the feed specifically needs volume. Media paths are placeholders - the DB
 * structure exists but images won't render without real storage objects.
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('seed-volume: DATABASE_URL is required')

const num = (name: string, def: number) => Number(process.env[name] ?? def)
const AREAS = num('AREAS', 10)
const CRAGS_PER_AREA = num('CRAGS_PER_AREA', 5)
const BLOCKS_PER_CRAG = num('BLOCKS_PER_CRAG', 5)
const ROUTES_PER_BLOCK = num('ROUTES_PER_BLOCK', 20)
const WITH_MEDIA = (process.env.WITH_MEDIA ?? 'true') !== 'false'
const REGION_NAME = process.env.REGION_NAME ?? 'Volume Test'
const MAX_GRADE = 21 // grades 0..21, see seed-refdata.sql

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

const sql = postgres(DATABASE_URL, { prepare: false })
// Bare table names below rely on public being on the search_path.
await sql`set search_path to public`

// Bulk insert in chunks (Postgres caps params at 65535); returns inserted ids.
// `rel` is an unqualified table name (identifier helper can't take schema.table).
const insertReturningIds = async (rel: string, rows: Record<string, unknown>[], cols: string[]) => {
  const ids: number[] = []
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000)
    const out = await sql<{ id: number }[]>`insert into ${sql(rel)} ${sql(chunk, ...cols)} returning id`
    ids.push(...out.map((r) => r.id))
  }
  return ids
}
const insert = async (rel: string, rows: Record<string, unknown>[], cols: string[]) => {
  for (let i = 0; i < rows.length; i += 1000) {
    await sql`insert into ${sql(rel)} ${sql(rows.slice(i, i + 1000), ...cols)}`
  }
}

// --- Resolve region + creators (must exist from seed-dev-region) ------------
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

// RESET=true wipes this region's existing content first (FK-safe order; blocks
// <-> geolocations is a cycle, so null the block link before deleting geos).
if (process.env.RESET === 'true') {
  console.log(`RESET: wiping existing content in region ${region.id}`)
  await sql`delete from public.files where region_fk = ${region.id}`
  await sql`delete from public.routes_to_tags where region_fk = ${region.id}`
  await sql`delete from public.ascents where region_fk = ${region.id}`
  await sql`delete from public.routes where region_fk = ${region.id}`
  await sql`update public.blocks set geolocation_fk = null where region_fk = ${region.id}`
  await sql`delete from public.geolocations where region_fk = ${region.id}`
  await sql`delete from public.blocks where region_fk = ${region.id}`
  await sql`delete from public.areas where region_fk = ${region.id} and parent_fk is not null`
  await sql`delete from public.areas where region_fk = ${region.id} and parent_fk is null`
}

console.log(`seeding into region ${region.id} ("${REGION_NAME}") as ${creators.length} creator(s)`)

// --- Areas: roots (type 'area', hold sub-areas) then crags (type 'crag',
// hold blocks). Nesting is area > crag, never the reverse. ------------------
const areaRows = Array.from({ length: AREAS }, (_, i) => ({
  created_by: author(),
  description: 'Seeded area.',
  name: `Area ${String(i + 1).padStart(2, '0')}`,
  parent_fk: null,
  region_fk: region.id,
  type: 'area',
}))
const areaIdList = await insertReturningIds('areas', areaRows, [
  'name',
  'created_by',
  'region_fk',
  'type',
  'parent_fk',
  'description',
])

const cragRows = areaIdList.flatMap((areaId, ai) =>
  Array.from({ length: CRAGS_PER_AREA }, (_, i) => ({
    created_by: author(),
    description: 'Seeded crag.',
    name: `Crag ${String(ai + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    parent_fk: areaId,
    region_fk: region.id,
    type: 'crag',
  })),
)
const cragIds = await insertReturningIds('areas', cragRows, [
  'name',
  'created_by',
  'region_fk',
  'type',
  'parent_fk',
  'description',
])
// cragIds[k]'s parent area is cragRows[k].parent_fk
const areaOfCrag = cragRows.map((r) => r.parent_fk as number)
console.log(`  areas: ${areaIdList.length} areas + ${cragIds.length} crags`)

// --- Blocks + geolocations --------------------------------------------------
// Clustered but distinct coords so blocks render as separate map markers:
// areas spread across the region, crags cluster within their area, blocks
// scatter within their crag. Continuous jitter => no two blocks coincide.
const BASE = { lat: 46.5, long: 8.0 } // arbitrary alpine-ish anchor
const jit = (range: number) => (rand() * 2 - 1) * range
const areaCenters = areaIdList.map(() => ({ lat: BASE.lat + jit(0.25), long: BASE.long + jit(0.25) }))
const cragCenters = cragRows.map((r) => {
  const c = areaCenters[areaIdList.indexOf(r.parent_fk as number)]
  return { lat: c.lat + jit(0.02), long: c.long + jit(0.02) }
})

const blockCoords: { lat: number; long: number }[] = []
const blockMeta: { cragId: number; name: string; order: number }[] = []
cragIds.forEach((cragId, ci) => {
  const c = cragCenters[ci]
  for (let i = 0; i < BLOCKS_PER_CRAG; i++) {
    blockCoords.push({ lat: c.lat + jit(0.0015), long: c.long + jit(0.0015) })
    blockMeta.push({ cragId, name: `Block ${i + 1}`, order: i })
  }
})

// One geolocation per block. Insert geos first, point blocks at them via
// geolocation_fk, then back-link geolocation.block_fk (mirrors block create).
const geoIds = await insertReturningIds(
  'geolocations',
  blockCoords.map((c) => ({ estimated: false, lat: c.lat, long: c.long, region_fk: region.id })),
  ['region_fk', 'lat', 'long', 'estimated'],
)
const blockRows = blockMeta.map((m, i) => ({
  area_fk: m.cragId,
  created_by: author(),
  geolocation_fk: geoIds[i],
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
await sql`
  update public.geolocations g set block_fk = d.bid
  from unnest(${geoIds}::int[], ${blockIds}::int[]) as d(gid, bid)
  where g.id = d.gid`
const cragOfBlock = blockRows.map((r) => r.area_fk)
console.log(`  blocks: ${blockIds.length} (+ ${geoIds.length} geolocations)`)

// --- Routes -----------------------------------------------------------------
// areaFks/areaIds denormalise the block's area chain (leaf crag -> root area),
// matching routes.remote.ts so area filters find these routes.
const routeRows = blockIds.flatMap((blockId, bi) => {
  const cragId = cragOfBlock[bi]
  const areaId = areaOfCrag[cragIds.indexOf(cragId)]
  const areaFks = [cragId, areaId]
  const areaIds = areaFks.map((id) => `^${id}$`).join(',')
  return Array.from({ length: ROUTES_PER_BLOCK }, (_, i) => {
    // user_grade_fk / user_rating are the COMMUNITY values the UI actually
    // displays (grade_fk / rating are the original, shown only in the breakdown).
    // Seed both so grades/ratings render and histograms populate.
    const g = grade()
    const r = rand() < 0.7 ? int(1, 5) : null
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

// --- Route tags (some routes get 1-2 tags) ----------------------------------
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

// --- Ascents (0-3 per route, weighted low) ----------------------------------
const ASCENT_TYPES = ['flash', 'redpoint', 'redpoint', 'redpoint', 'repeat', 'attempt'] as const
const dayMs = 86_400_000
const now = Date.now()
const ascentRows = routeIds.flatMap((routeId) => {
  const n = rand() < 0.4 ? 0 : int(1, 3)
  return Array.from({ length: n }, () => ({
    created_by: author(),
    date_time: new Date(now - int(0, 5 * 365) * dayMs).toISOString().slice(0, 10),
    grade_fk: rand() < 0.5 ? grade() : null,
    notes: rand() < 0.2 ? 'Great line.' : null,
    rating: rand() < 0.6 ? int(1, 5) : null,
    region_fk: region.id,
    route_fk: routeId,
    type: pick(ASCENT_TYPES),
  }))
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
])
console.log(`  ascents: ${ascentIds.length}`)

// --- Media (placeholder paths; see header note) -----------------------------
if (WITH_MEDIA) {
  const fileRows: Record<string, unknown>[] = []
  // Every row carries all three fk keys (null unless set) so the explicit
  // column list matches uniformly across chunks.
  const img = (fk: 'ascent_fk' | 'block_fk' | 'route_fk', id: number, tag: string) => ({
    ascent_fk: null as null | number,
    block_fk: null as null | number,
    created_by: author(),
    [fk]: id,
    height: 768,
    path: `sandbox/seed/${tag}-${id}.jpg`,
    region_fk: region.id,
    route_fk: null as null | number,
    visibility: 'public',
    width: 1024,
  })
  blockIds.forEach((id) => rand() < 0.3 && fileRows.push(img('block_fk', id, 'block')))
  routeIds.forEach((id) => rand() < 0.15 && fileRows.push(img('route_fk', id, 'route')))
  ascentIds.forEach((id) => rand() < 0.1 && fileRows.push(img('ascent_fk', id, 'ascent')))
  await insert('files', fileRows, [
    'region_fk',
    'created_by',
    'path',
    'width',
    'height',
    'visibility',
    'block_fk',
    'route_fk',
    'ascent_fk',
  ])
  console.log(`  media files: ${fileRows.length} (placeholder paths, won't render)`)
}

await sql.end()
console.log('volume seed complete.')
