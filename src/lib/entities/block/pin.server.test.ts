/**
 * The block pin's two-way link through `pin.server.ts`: attach sets both foreign keys, move keeps or
 * writes `estimated`, remove clears both. Skipped without DATABASE_URL.
 */
import * as schema from '$lib/db/schema'
import { reachable, seedRegion, sql } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachPin, movePin, removePin } from './pin.server'

const db = drizzle(sql, { schema })
const NAME = '__pin_server__'

let regionId = 0
let blockId = 0

const state = async () => {
  const [block] = await sql<{ geolocationFk: null | number }[]>`
    select geolocation_fk as "geolocationFk" from public.blocks where id = ${blockId}`
  const pins = await sql<
    { blockFk: number; estimated: boolean; id: number; lat: number; long: number; regionFk: number }[]
  >`
    select id, block_fk as "blockFk", estimated, lat, long, region_fk as "regionFk"
    from public.geolocations where block_fk = ${blockId}`
  return { geolocationFk: block.geolocationFk, pins }
}

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(NAME)
  regionId = seeded.regionId
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values (${NAME}, 'sector', ${regionId}, ${seeded.user.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values (${NAME}, 0, ${area.id}, ${regionId}, ${seeded.user.userId}) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (reachable) {
    await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
    await sql`delete from public.geolocations where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('pin.server', () => {
  it('attaches a pin linked both ways, in the block region', async () => {
    const pin = await attachPin(db, { id: blockId, regionFk: regionId }, { estimated: true, lat: 49.1, long: 12.1 })
    const { geolocationFk, pins } = await state()
    expect(geolocationFk).toBe(pin.id)
    expect(pins).toEqual([{ blockFk: blockId, estimated: true, id: pin.id, lat: 49.1, long: 12.1, regionFk: regionId }])
  })

  it('moves a pin, keeping estimated when none is given', async () => {
    const [{ id }] = (await state()).pins
    await movePin(db, id, { lat: 49.2, long: 12.2 })
    expect((await state()).pins[0]).toMatchObject({ estimated: true, lat: 49.2, long: 12.2 })
  })

  it('moves a pin, writing estimated when given', async () => {
    const [{ id }] = (await state()).pins
    await movePin(db, id, { estimated: false, lat: 49.3, long: 12.3 })
    expect((await state()).pins[0]).toMatchObject({ estimated: false, lat: 49.3, long: 12.3 })
  })

  it('removes a pin from both sides', async () => {
    const { geolocationFk } = await state()
    await removePin(db, { geolocationFk: geolocationFk!, id: blockId })
    expect(await state()).toEqual({ geolocationFk: null, pins: [] })
  })
})
