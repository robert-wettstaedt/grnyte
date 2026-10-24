import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The file mutators' wiring: what each answers and how a refusal arrives. The gates themselves are
// covered by `guards.server.test.ts`.
const REGION = '__file_mutators_region__'

let admin: SeedUser
let stranger: SeedUser
let regionId: number
let routeId: number
let adminClient: ReturnType<typeof zeroClient>
let strangerClient: ReturnType<typeof zeroClient>
let next = 0

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_admin')
  admin = seeded.user
  regionId = seeded.regionId
  stranger = await createThrowawayUser('file_mutators')
  adminClient = zeroClient(admin.authId)
  strangerClient = zeroClient(stranger.authId)

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by) values ('A', ${regionId}, ${admin.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, region_fk, created_by, "order", area_fk)
    values ('B', ${regionId}, ${admin.userId}, 0, ${area.id}) returning id`
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, region_fk, created_by, block_fk)
    values ('R', ${regionId}, ${admin.userId}, ${block.id}) returning id`
  routeId = route.id
})

afterAll(async () => {
  if (!reachable) return
  await adminClient.cleanup()
  await strangerClient.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.files where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(stranger)
})

/** A route photo with no stored bytes, so a delete has nothing to tear down. */
async function photo() {
  const id = `__file_mutators_${Date.now()}_${next++}__`
  await sql`
    insert into public.files (id, region_fk, path, route_fk, created_by, visibility)
    values (${id}, ${regionId}, '', ${routeId}, ${admin.userId}, 'private')`
  return id
}

async function stored(id: string) {
  const [row] = await sql<{ visibility: string }[]>`select visibility from public.files where id = ${id}`
  return row
}

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('file mutators', () => {
  it('publishes a file', async () => {
    const id = await photo()

    expect(await adminClient.push('files.setVisibility', { fileId: id, visibility: 'public' })).toEqual({})
    expect(await stored(id)).toEqual({ visibility: 'public' })
  })

  it('refuses a visibility change from outside the region', async () => {
    const id = await photo()
    const result = await strangerClient.push('files.setVisibility', { fileId: id, visibility: 'public' })

    expect(result.error).toBe('app')
    expect(await stored(id)).toEqual({ visibility: 'private' })
  })

  it('refuses a source on a photo', async () => {
    const id = await photo()
    const result = await adminClient.push('files.setVideoSource', { fileId: id, source: 'https://example.com' })

    expect(messageOf(result)).toBe('media_sourceVideoOnly')
  })

  it('deletes a file and records the removal on its route', async () => {
    const id = await photo()

    expect(await adminClient.push('files.delete', { id })).toEqual({})
    expect(await stored(id)).toBeUndefined()
    const events = await sql`select 1 from public.events where route_fk = ${routeId} and verb = 'remove'`
    expect(events.length).toBeGreaterThan(0)
  })

  it('refuses a delete of a file that is not there', async () => {
    expect(messageOf(await adminClient.push('files.delete', { id: '__file_mutators_missing__' }))).toBe(
      'files_notFound',
    )
  })
})
