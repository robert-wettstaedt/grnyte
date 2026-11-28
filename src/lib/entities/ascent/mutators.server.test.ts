import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { pushRefusal, zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The ascent mutators' wiring: what each answers, how a refusal arrives, and that a delete's
// notice runs after commit.
const REGION = '__ascent_mutators_region__'

let admin: SeedUser
let climber: SeedUser
let regionId: number
let routeId: number
let adminClient: ReturnType<typeof zeroClient>
let climberClient: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_admin')
  admin = seeded.user
  regionId = seeded.regionId
  climber = await createThrowawayUser('ascent_mutators')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${climber.userId}, ${climber.authId}, 'region_user', true)`
  adminClient = zeroClient(admin.authId)
  climberClient = zeroClient(climber.authId)

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__ascent_mutators_area__', 'area', ${regionId}, ${admin.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__ascent_mutators_block__', ${area.id}, ${regionId}, ${admin.userId}, 0) returning id`
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values ('__ascent_mutators_route__', ${block.id}, ${regionId}, ${admin.userId}, ${[area.id]}, ${`^${area.id}$`})
    returning id`
  routeId = route.id
})

afterAll(async () => {
  if (!reachable) return
  await adminClient.cleanup()
  await climberClient.cleanup()
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.ascents where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(climber)
})

const log = (client: ReturnType<typeof zeroClient>, notes = '') =>
  client.push('ascents.create', { dateTime: '2026-10-01', notes, routeId: String(routeId), type: 'flash' })
const idOf = (result: { data?: unknown }) => (result.data as undefined | { id: number })?.id

async function stored(id: number) {
  const [row] = await sql<{ notes: null | string; type: string }[]>`
    select notes, type from public.ascents where id = ${id} and deleted_at is null`
  return row
}

describe.skipIf(!reachable)('ascent mutators', () => {
  it('logs an ascent and answers its id', async () => {
    const result = await log(climberClient, '__ascent_mutators_logged__')

    expect(result.error).toBeUndefined()
    expect(await stored(idOf(result)!)).toEqual({ notes: '__ascent_mutators_logged__', type: 'flash' })
  })

  it('makes one ascent and one event for a device id sent twice', async () => {
    // Each push is a new write id: the second is a resend after `applied_writes` let the first go.
    const args = { dateTime: '2026-10-01', routeId: String(routeId), type: 'flash', uuid: crypto.randomUUID() }
    const first = await climberClient.push('ascents.create', args)
    const second = await climberClient.push('ascents.create', args)

    expect(second.error).toBeUndefined()
    expect(idOf(second)).toBe(idOf(first))
    const rows = await sql`select id from public.ascents where uuid = ${args.uuid}`
    const events = await sql`select 1 from public.events where ascent_fk = ${idOf(first)!}`
    expect([rows.length, events.length]).toEqual([1, 1])
  })

  it('answers a resent device id with its ascent after the route was deleted', async () => {
    const args = { dateTime: '2026-10-01', routeId: String(routeId), type: 'flash', uuid: crypto.randomUUID() }
    const first = await climberClient.push('ascents.create', args)
    await sql`update public.routes set deleted_at = now() where id = ${routeId}`
    try {
      const again = await climberClient.push('ascents.create', args)

      expect(again.error).toBeUndefined()
      expect(idOf(again)).toBe(idOf(first))
    } finally {
      await sql`update public.routes set deleted_at = null where id = ${routeId}`
    }
  })

  it('refuses a device id another member logged, naming nothing of their ascent', async () => {
    const args = { dateTime: '2026-10-01', routeId: String(routeId), type: 'flash', uuid: crypto.randomUUID() }
    await adminClient.push('ascents.create', args)

    const result = await climberClient.push('ascents.create', { ...args, notes: '__ascent_mutators_foreign__' })

    expect(result.data).toBeUndefined()
    expect(pushRefusal(result)).toMatchObject({ message: 'error_server_title' })
    const [row] = await sql`select 1 from public.ascents where notes = '__ascent_mutators_foreign__'`
    expect(row).toBeUndefined()
  })

  it('refuses an ascent whose device id is not a uuid', async () => {
    const result = await climberClient.push('ascents.create', {
      dateTime: '2026-10-01',
      notes: '__ascent_mutators_bad_uuid__',
      routeId: String(routeId),
      type: 'flash',
      uuid: 'not-a-uuid',
    })

    expect(result.error).toBeDefined()
    const [row] = await sql`select 1 from public.ascents where notes = '__ascent_mutators_bad_uuid__'`
    expect(row).toBeUndefined()
  })

  it('refuses an ascent of a route that is not there, at form level', async () => {
    const result = await climberClient.push('ascents.create', { dateTime: '2026-10-01', routeId: '-1', type: 'flash' })

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_notFound' })
    expect(result.details).toEqual({ field: null })
  })

  it('edits your own ascent and answers its route', async () => {
    const id = idOf(await log(climberClient))!
    const result = await climberClient.push('ascents.update', {
      dateTime: '2026-10-02',
      id: String(id),
      notes: '__ascent_mutators_edited__',
      routeId: String(routeId),
      type: 'redpoint',
    })

    expect(result.data).toEqual({ id, routeFk: routeId })
    expect(await stored(id)).toEqual({ notes: '__ascent_mutators_edited__', type: 'redpoint' })
  })

  it('refuses an edit of somebody else ascent', async () => {
    const id = idOf(await log(adminClient))!
    const result = await climberClient.push('ascents.update', {
      dateTime: '2026-10-02',
      id: String(id),
      routeId: String(routeId),
      type: 'attempt',
    })

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'form_noPermission' })
    expect((await stored(id))?.type).toBe('flash')
  })

  it('deletes an ascent and tells the climber after commit', async () => {
    const id = idOf(await log(climberClient))!

    expect(await adminClient.push('ascents.delete', { id })).toEqual({})
    expect(await stored(id)).toBeUndefined()
    const notices = await sql`
      select 1 from public.notifications
      where user_fk = ${climber.userId} and source_type = 'ascent_deleted' and route_fk = ${routeId}`
    expect(notices).toHaveLength(1)
  })
})
