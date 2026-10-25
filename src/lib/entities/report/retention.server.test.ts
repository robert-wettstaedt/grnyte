import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeGoneReports } from './retention.server'

let admin: SeedUser
let ada: SeedUser
let bo: SeedUser
let regionId = 0
let blockId = 0
let adminClient: ReturnType<typeof zeroClient>
let boClient: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  ;[admin, ada, bo] = await Promise.all(['admin', 'ada', 'bo'].map((who) => createThrowawayUser(`report_close_${who}`)))
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__report_close__', ${admin.userId}) returning id`
  regionId = region.id
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${ada.userId}, ${ada.authId}, 'region_user', true),
      (${regionId}, ${bo.userId}, ${bo.authId}, 'region_user', true)`
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Close', ${admin.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Close', ${admin.userId}, ${regionId}, ${area.id}, 0) returning id`
  blockId = block.id
  adminClient = zeroClient(admin.authId)
  boClient = zeroClient(bo.authId)
})

afterAll(async () => {
  if (!reachable) return
  for (const client of [adminClient, boClient]) await client.cleanup()
  await sql`delete from public.moderation_decisions where region_fk = ${regionId}`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.content_reports where region_fk = ${regionId}`
  await sql`delete from public.reactions where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.files where region_fk = ${regionId}`
  await sql`delete from public.ascents where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  for (const user of [admin, ada, bo]) await dropThrowawayUser(user)
})

async function adasRoute(name: string) {
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values (${name}, ${ada.userId}, ${regionId}, ${blockId})
    returning id`
  return route.id
}

const report = (kind: string, id: number | string) =>
  boClient.push('reports.file', { ground: 'spam', id: String(id), kind })

const open = (kind: string, id: number | string) =>
  sql`select 1 from public.content_reports where object_type = ${kind} and object_id = ${String(id)}`

const outcome = async (kind: string, id: number | string) => {
  const rows = await sql<{ metadata: string }[]>`
    select metadata from public.notifications
    where user_fk = ${bo.userId} and source_type = 'report_closed' and object_ref = ${`${kind}:${id}`}`
  return rows.map((row) => JSON.parse(row.metadata))
}

describe.skipIf(!reachable)('closing reports on content that is gone', () => {
  it('closes as acted on after a removal, naming what was reported', async () => {
    const id = await adasRoute('Removed')
    await report('route', id)

    await adminClient.push('routes.delete', { id, removal: { ground: 'spam', reason: 'Advertising' } })
    await closeGoneReports()

    expect(await open('route', id)).toEqual([])
    expect(await outcome('route', id)).toEqual([{ kind: 'route', name: 'Removed', outcome: 'acted_on' }])
  })

  it('closes on a comment its author deleted, without naming it', async () => {
    const route = await adasRoute('Commented')
    const [event] = await sql<{ id: number }[]>`
      insert into public.events (verb, actor_fk, region_fk, route_fk) values ('create', ${ada.userId}, ${regionId}, ${route})
      returning id`
    const [comment] = await sql<{ id: number }[]>`
      insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
      values (${event.id}, 'Rude words', 'comment', ${regionId}, ${ada.authId}, ${ada.userId}) returning id`
    await report('comment', comment.id)

    await sql`update public.reactions set deleted_at = now() where id = ${comment.id}`
    await closeGoneReports()

    expect(await open('comment', comment.id)).toEqual([])
    expect(await outcome('comment', comment.id)).toEqual([{ kind: 'comment', outcome: 'acted_on' }])
  })

  it('closes on an ascent and a photo whose route was deleted, though neither was', async () => {
    const route = await adasRoute('Parent')
    const [ascent] = await sql<{ id: number }[]>`
      insert into public.ascents (type, created_by, region_fk, route_fk) values ('flash', ${ada.userId}, ${regionId}, ${route})
      returning id`
    const [photo] = await sql<{ id: string }[]>`
      insert into public.files (id, path, region_fk, route_fk, created_by)
      values (gen_random_uuid()::text, '/__report_close__.jpg', ${regionId}, ${route}, ${ada.userId}) returning id`
    await report('ascent', ascent.id)
    await report('file', photo.id)

    await sql`update public.routes set deleted_at = now() where id = ${route}`
    await closeGoneReports()

    expect(await open('ascent', ascent.id)).toEqual([])
    expect(await open('file', photo.id)).toEqual([])
  })

  it('keeps a report on content that still stands', async () => {
    const id = await adasRoute('Standing')
    await report('route', id)

    await closeGoneReports()

    expect(await open('route', id)).toHaveLength(1)
    expect(await outcome('route', id)).toEqual([])
  })

  it('closes the reports the moment a removal is recorded, so an Undo before the task brings none back', async () => {
    const id = await adasRoute('Undone at once')
    await report('route', id)

    await adminClient.push('routes.delete', { id, removal: { ground: 'spam', reason: 'Advertising' } })
    expect(await open('route', id)).toEqual([])
    expect(await outcome('route', id)).toEqual([{ kind: 'route', name: 'Undone at once', outcome: 'acted_on' }])

    await adminClient.push('moderation.undoRemoval', { id: String(id), kind: 'route' })
    expect(await open('route', id)).toEqual([])
  })

  it('replaces an unread outcome with the newer one', async () => {
    const id = await adasRoute('Twice closed')
    await report('route', id)
    await adminClient.push('reports.dismiss', { id: String(id), kind: 'route' })
    await report('route', id)

    await sql`update public.routes set deleted_at = now() where id = ${id}`
    await closeGoneReports()

    expect(await outcome('route', id)).toEqual([{ kind: 'route', name: 'Twice closed', outcome: 'acted_on' }])
  })

  it('brings no report back when the removal is undone', async () => {
    const id = await adasRoute('Undone')
    await report('route', id)
    await adminClient.push('routes.delete', { id, removal: { ground: 'spam', reason: 'Advertising' } })
    await closeGoneReports()

    await adminClient.push('moderation.undoRemoval', { id: String(id), kind: 'route' })

    expect(await sql`select deleted_at from public.routes where id = ${id}`).toEqual([{ deleted_at: null }])
    expect(await open('route', id)).toEqual([])
  })
})
