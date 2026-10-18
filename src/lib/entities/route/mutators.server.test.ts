import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The route mutators' wiring: what each answers and how a refusal arrives. The bodies they share
// with the remote functions are covered by `routes.remote.test.ts` and the restore suites.
const REGION = '__route_mutators_region__'

let user: SeedUser
let regionId: number
let blockId: number
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return

  const seeded = await seedRegion(REGION, 'region_maintainer')
  user = seeded.user
  regionId = seeded.regionId
  client = zeroClient(user.authId)

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__route_mutators_area__', 'area', ${regionId}, ${user.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__route_mutators_block__', ${area.id}, ${regionId}, ${user.userId}, 0) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
})

const create = (name: string) => client.push('routes.create', { blockId: String(blockId), name })

async function liveRoute(id: number) {
  const [row] = await sql<{ name: string }[]>`select name from public.routes where id = ${id} and deleted_at is null`
  return row
}

describe.skipIf(!reachable)('route mutators', () => {
  it('creates a route and answers its id', async () => {
    const result = await create('__route_mutators_created__')
    const id = (result.data as undefined | { id: number })?.id

    expect(result.error).toBeUndefined()
    expect(id).toBeTypeOf('number')
    expect(await liveRoute(id!)).toEqual({ name: '__route_mutators_created__' })
  })

  it('refuses a duplicate name on the name field', async () => {
    await create('__route_mutators_twin__')
    const result = await create('__route_mutators_twin__')

    expect(result.error).toBe('app')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_nameExists' })
    expect(result.details).toEqual({ field: 'name' })
  })

  it('deletes a fresh route, answers the snapshot, and restores from it', async () => {
    const id = ((await create('__route_mutators_undo__')).data as { id: number }).id

    const deleted = await client.push('routes.delete', { id })
    expect(deleted.data).toMatchObject({ mode: 'hard', routeId: id })
    expect(await liveRoute(id)).toBeUndefined()

    const restored = await client.push('routes.restore', deleted.data)
    const routeId = (restored.data as undefined | { routeId: number })?.routeId

    expect(restored.error).toBeUndefined()
    expect(await liveRoute(routeId!)).toEqual({ name: '__route_mutators_undo__' })
  })

  it('refuses a delete of a route that is not there, as the not-found message', async () => {
    const result = await client.push('routes.delete', { id: -1 })

    expect(result.error).toBe('app')
    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_notFound' })
  })
})
