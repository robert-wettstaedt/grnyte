import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blockPinFingerprint } from './fingerprint'

// The block mutators' wiring: what each answers and how a refusal arrives. The bodies they share
// with the remote functions are covered by `blocks.remote.test.ts`, `pin.remote.test.ts` and
// `reorder.remote.test.ts`.
const REGION = '__block_mutators_region__'

let user: SeedUser
let regionId: number
let areaId: number
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_admin')
  user = seeded.user
  regionId = seeded.regionId
  client = zeroClient(user.authId)
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__block_mutators_sector__', 'sector', ${regionId}, ${user.userId}) returning id`
  areaId = area.id
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
  await sql`delete from public.geolocations where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
})

const create = (name: string) => client.push('blocks.create', { areaId: String(areaId), name })
const idOf = (result: { data?: unknown }) => (result.data as undefined | { id: number })?.id

async function stored(id: number) {
  const [row] = await sql<{ geolocation_fk: null | number; name: string; order: number }[]>`
    select name, geolocation_fk, "order" from public.blocks where id = ${id} and deleted_at is null`
  return row
}

describe.skipIf(!reachable)('block mutators', () => {
  it('creates a block and answers its id', async () => {
    const result = await create('__block_mutators_created__')

    expect(result.error).toBeUndefined()
    expect((await stored(idOf(result)!))?.name).toBe('__block_mutators_created__')
  })

  it('refuses a duplicate name on the name field', async () => {
    await create('__block_mutators_twin__')
    const result = await create('__block_mutators_twin__')

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'blocks_nameExists' })
    expect(result.details).toEqual({ field: 'name' })
  })

  it('refuses an edit whose pin fingerprint is stale, at form level', async () => {
    const id = idOf(await create('__block_mutators_stale__'))!
    const result = await client.push('blocks.update', { areaId: String(areaId), id: String(id), known: 'stale' })

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'blocks_pinStale' })
    expect(result.details).toEqual({ field: null })
  })

  it('sets a pin, after which a photo estimate changes nothing', async () => {
    const id = idOf(await create('__block_mutators_pin__'))!

    expect(await client.push('blocks.setLocation', { id, lat: 47.1, long: 11.2 })).toEqual({})
    const pinned = (await stored(id))?.geolocation_fk

    expect(pinned).toBeTypeOf('number')
    expect(await client.push('blocks.estimateLocation', { id, lat: 1, long: 1 })).toEqual({})
    expect((await stored(id))?.geolocation_fk).toBe(pinned)
  })

  it('saves an edit that names the loaded pin', async () => {
    const id = idOf(await create('__block_mutators_edit__'))!
    const result = await client.push('blocks.update', {
      areaId: String(areaId),
      id: String(id),
      known: blockPinFingerprint(null),
      name: '__block_mutators_edited__',
    })

    expect(result).toEqual({})
    expect((await stored(id))?.name).toBe('__block_mutators_edited__')
  })

  it('reorders the area', async () => {
    const first = idOf(await create('__block_mutators_order_a__'))!
    const second = idOf(await create('__block_mutators_order_b__'))!

    expect(await client.push('blocks.reorder', { areaId, orderedIds: [second, first] })).toEqual({})
    expect((await stored(second))!.order).toBeLessThan((await stored(first))!.order)
  })

  it('deletes a fresh block, answers the snapshot, and restores from it', async () => {
    const id = idOf(await create('__block_mutators_undo__'))!

    const deleted = await client.push('blocks.delete', { id })
    expect(deleted.data).toMatchObject({ blockId: id, mode: 'hard' })
    expect(await stored(id)).toBeUndefined()

    const restored = await client.push('blocks.restore', deleted.data)
    const blockId = (restored.data as undefined | { blockId: number })?.blockId

    expect((await stored(blockId!))?.name).toBe('__block_mutators_undo__')
  })
})
