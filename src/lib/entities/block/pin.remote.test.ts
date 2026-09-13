/**
 * `updateBlock`'s pin staleness refusal, through the real handler in a real RLS transaction.
 *
 * A submit with no coordinates deletes the pin, and a block with no pin posts the same fields as
 * one whose pin never loaded. The removal cases keep it honest: a guard that refused every location
 * change would pass every refusal test and break the feature.
 */
import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { updateBlock } from './blocks.remote'
import { blockPinFingerprint } from './fingerprint'

const REGION = '__block_pin_region__'
/**
 * `LONG` is chosen for a PROPERTY, not its provenance: its float8 text does not parse back to the
 * same double, which is the difference the guard crosses. A replacement that round-trips disarms
 * this file silently.
 *
 * Check one with `select <v>::float8::text::float8 = <v>::float8` (must be FALSE) at the DEFAULT
 * `extra_float_digits`; at 3 it is true for everything and measures nothing.
 */
const LAT = 50.8756103515625
const LONG = 13.985819816589355

let maintainer: SeedUser
let regionId = 0
let sectorId = 0
let blockId = 0

beforeAll(async () => {
  if (!reachable) return

  const seeded = await seedRegion(REGION)
  maintainer = seeded.user
  regionId = seeded.regionId

  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__block_pin_sector__', 'sector', ${regionId}, ${maintainer.userId}) returning id`
  sectorId = sector.id
})

/** Back to one block carrying one pin before each case. */
beforeEach(async () => {
  if (!reachable) return

  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
  await sql`delete from public.geolocations where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`

  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, "order", region_fk, created_by)
    values ('__block_pin_block__', ${sectorId}, 0, ${regionId}, ${maintainer.userId}) returning id`
  blockId = block.id

  const [pin] = await sql<{ id: number }[]>`
    insert into public.geolocations (lat, long, estimated, block_fk, region_fk)
    values (${LAT}, ${LONG}, false, ${blockId}, ${regionId}) returning id`
  await sql`update public.blocks set geolocation_fk = ${pin.id} where id = ${blockId}`
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.changes where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
    await sql`delete from public.geolocations where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/** As in `blocks.remote.test.ts`: success throws a 303, a refusal is folded into form issues by Kit
 *  rather than rethrown, so the database afterwards is what separates the two. */
async function submit(data: Record<string, unknown>): Promise<void> {
  try {
    await asRequest(maintainer.authId, () => callForm(updateBlock, data))
  } catch (cause) {
    if ((cause as { status?: number })?.status !== 303) throw cause
  }
}

const edit = (known: string | undefined, extra: Record<string, unknown> = {}) => ({
  areaId: String(sectorId),
  id: String(blockId),
  known,
  lat: String(LAT),
  long: String(LONG),
  name: '__block_pin_block__',
  ...extra,
})

const storedPin = async () =>
  (
    await sql<{ estimated: boolean; lat: number; long: number }[]>`
      select g.lat, g.long, g.estimated from public.geolocations g
      join public.blocks b on b.geolocation_fk = g.id where b.id = ${blockId}`
  ).at(0)

const storedName = async () =>
  (await sql<{ name: null | string }[]>`select name from public.blocks where id = ${blockId}`).at(0)?.name

/**
 * What the BROWSER posts, built from the literals this file inserted rather than from reading the
 * row back. That distinction is the whole point: deriving it from `storedPin()` would compare one
 * postgres.js read against another, both lossy in the same direction, so they would agree however
 * wrong the canonical form was. The client's value comes from Zero, which never went through
 * Postgres' text output, and these literals are that value.
 */
const CLIENT_KNOWN = blockPinFingerprint({ estimated: false, lat: LAT, long: LONG })

describe.skipIf(!reachable)('updateBlock pin staleness guard', () => {
  it('accepts a fingerprint built from the exact double, not from what the driver read back', async () => {
    // The blocker's regression test: raw floats make this refuse, and with it ~99% of located
    // blocks. Also the positive control for every refusal below.
    await submit(edit(CLIENT_KNOWN, { name: 'Renamed Block' }))

    expect(await storedName()).toBe('Renamed Block')
    expect(await storedPin()).toMatchObject({ lat: LAT })
  })

  it('refuses a submit that never saw somebody else moving the pin', async () => {
    const known = CLIENT_KNOWN
    await sql`update public.geolocations set lat = 48.1 where block_fk = ${blockId}`

    await submit(edit(known, { name: 'Should Not Land' }))

    expect(await storedName()).toBe('__block_pin_block__')
    expect(await storedPin()).toMatchObject({ lat: 48.1 })
  })

  it('refuses a submit claiming there was no pin, which is the deletion this guards', async () => {
    // The shipped route bug in its block shape: a form that never loaded the geolocation posts no
    // coordinates, and without the guard `updateBlock` deletes the row.
    await submit({ ...edit(blockPinFingerprint(null), { name: 'Wiped' }), lat: '', long: '' })

    expect(await storedName()).toBe('__block_pin_block__')
    // `long` to a tolerance: reading back through postgres.js is the lossy path this file is about.
    expect(await storedPin()).toMatchObject({ lat: LAT })
    expect((await storedPin())?.long).toBeCloseTo(LONG, 7)
  })

  it('refuses a submit that omits the fingerprint, so an old tab cannot bypass it', async () => {
    await submit(edit(undefined, { name: 'Should Not Land Either' }))

    expect(await storedName()).toBe('__block_pin_block__')
    // `long` to a tolerance: reading back through postgres.js is the lossy path this file is about.
    expect(await storedPin()).toMatchObject({ lat: LAT })
    expect((await storedPin())?.long).toBeCloseTo(LONG, 7)
  })

  it('still lets a reader remove the pin on purpose', async () => {
    // Why the refusal is about the fingerprint and not "the submit had no coordinates": a guard
    // failing this passes every test above and deletes the Remove button's behaviour.
    await submit({ ...edit(CLIENT_KNOWN, { name: 'Pinless' }), lat: '', long: '' })

    expect(await storedName()).toBe('Pinless')
    expect(await storedPin()).toBeUndefined()
  })

  it('still lets a reader move the pin', async () => {
    await submit(edit(CLIENT_KNOWN, { lat: '46.5', long: '9.5' }))

    expect(await storedPin()).toMatchObject({ lat: 46.5, long: 9.5 })
  })
})
