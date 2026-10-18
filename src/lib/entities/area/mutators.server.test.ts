import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The area mutators' wiring: what each answers and how a refusal arrives. The bodies they share
// with the remote functions are covered by `areas.remote.test.ts` and `softRestore.remote.test.ts`.
const REGION = '__area_mutators_region__'

let user: SeedUser
let regionId: number
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_admin')
  user = seeded.user
  regionId = seeded.regionId
  client = zeroClient(user.authId)
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.geolocations where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
})

const create = (name: string) => client.push('areas.create', { name, parentFk: '', regionFk: String(regionId) })
const idOf = (result: { data?: unknown }) => (result.data as undefined | { id: number })?.id

async function liveArea(id: number) {
  const [row] = await sql<{ name: string }[]>`select name from public.areas where id = ${id} and deleted_at is null`
  return row
}

async function parkings(areaId: number) {
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.geolocations where area_fk = ${areaId}`
  return row.count
}

describe.skipIf(!reachable)('area mutators', () => {
  it('creates an area and answers its id', async () => {
    const result = await create('__area_mutators_created__')

    expect(result.error).toBeUndefined()
    expect(await liveArea(idOf(result)!)).toEqual({ name: '__area_mutators_created__' })
  })

  it('refuses a duplicate sibling name on the name field', async () => {
    await create('__area_mutators_twin__')
    const result = await create('__area_mutators_twin__')

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'areas_nameExists' })
    expect(result.details).toEqual({ field: 'name' })
  })

  it('deletes a fresh area, answers the snapshot, and restores from it', async () => {
    const id = idOf(await create('__area_mutators_undo__'))!

    const deleted = await client.push('areas.delete', { id })
    expect(deleted.data).toMatchObject({ areaId: id, mode: 'hard' })
    expect(await liveArea(id)).toBeUndefined()

    const restored = await client.push('areas.restore', deleted.data)
    const areaId = (restored.data as undefined | { areaId: number })?.areaId

    expect(await liveArea(areaId!)).toEqual({ name: '__area_mutators_undo__' })
  })

  it('adds a parking, answers its snapshot on removal, and restores it', async () => {
    const areaId = idOf(await create('__area_mutators_parking__'))!
    // Parking belongs to sectors only, a type the area takes from its blocks.
    await sql`update public.areas set type = 'sector' where id = ${areaId}`

    expect(await client.push('areas.addParking', { areaId: String(areaId), lat: '47.1', long: '11.2' })).toEqual({})
    const [{ id }] = await sql<{ id: number }[]>`select id from public.geolocations where area_fk = ${areaId}`

    const removed = await client.push('areas.deleteParking', { id })
    expect(removed.data).toMatchObject({ areaId, lat: 47.1, long: 11.2 })
    expect(await parkings(areaId)).toBe(0)

    expect((await client.push('areas.restoreParking', removed.data)).error).toBeUndefined()
    expect(await parkings(areaId)).toBe(1)
  })
})
