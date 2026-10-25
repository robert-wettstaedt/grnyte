import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { zeroClient } from '$lib/remote/testHarness'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The way zero-cache runs a query; see `tenancy.test.ts`.
const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

let admin: SeedUser
let coAdmin: SeedUser
let ada: SeedUser
let bo: SeedUser
let cy: SeedUser
let maintainer: SeedUser
let outsider: SeedUser
let regionId = 0
let otherRegionId = 0
let blockId = 0
const clients = {} as Record<
  'ada' | 'admin' | 'bo' | 'coAdmin' | 'cy' | 'maintainer' | 'outsider',
  ReturnType<typeof zeroClient>
>

beforeAll(async () => {
  if (!reachable) return
  ;[admin, coAdmin, ada, bo, cy, maintainer, outsider] = await Promise.all(
    ['admin', 'coadmin', 'ada', 'bo', 'cy', 'maintainer', 'outsider'].map((who) =>
      createThrowawayUser(`report_${who}`),
    ),
  )
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__reports__', ${admin.userId}) returning id`
  regionId = region.id
  const [otherRegion] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__reports_other__', ${outsider.userId}) returning id`
  otherRegionId = otherRegion.id
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${coAdmin.userId}, ${coAdmin.authId}, 'region_admin', true),
      (${regionId}, ${ada.userId}, ${ada.authId}, 'region_user', true),
      (${regionId}, ${bo.userId}, ${bo.authId}, 'region_user', true),
      (${regionId}, ${cy.userId}, ${cy.authId}, 'region_user', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true),
      (${otherRegionId}, ${outsider.userId}, ${outsider.authId}, 'region_admin', true)`
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Sector', ${admin.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Block', ${admin.userId}, ${regionId}, ${area.id}, 0) returning id`
  blockId = block.id
  for (const [name, user] of Object.entries({ ada, admin, bo, coAdmin, cy, maintainer, outsider })) {
    clients[name as keyof typeof clients] = zeroClient(user.authId)
  }
})

afterAll(async () => {
  if (!reachable) return
  for (const client of Object.values(clients)) await client.cleanup()
  await sql`delete from public.notifications where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.content_reports where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.routes where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.blocks where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.areas where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.region_members where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.regions where id in (${regionId}, ${otherRegionId})`
  for (const user of [admin, coAdmin, ada, bo, cy, maintainer, outsider]) await dropThrowawayUser(user)
})

async function adasRoute(name: string) {
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values (${name}, ${ada.userId}, ${regionId}, ${blockId})
    returning id`
  return String(route.id)
}

const reportsOn = (id: string) =>
  sql<{ ground: string; note: null | string; reporter_fk: number }[]>`
    select ground, note, reporter_fk from public.content_reports where object_type = 'route' and object_id = ${id}`

const noticesOf = (user: SeedUser) =>
  sql<{ actor_fk: null | number; metadata: string; object_ref: string; source_type: string }[]>`
    select actor_fk, metadata, object_ref, source_type from public.notifications
    where user_fk = ${user.userId} and region_fk = ${regionId} and source_type in ('content_reported', 'report_closed')
    order by id`

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('filing a report', () => {
  it('keeps one open report per member and object, updated on a second send', async () => {
    const id = await adasRoute('Twice')

    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })
    await clients.bo.push('reports.file', { ground: 'harassment', id, kind: 'route', note: 'Names a person' })

    expect(await reportsOn(id)).toEqual([{ ground: 'harassment', note: 'Names a person', reporter_fk: bo.userId }])
  })

  it('lets a maintainer report', async () => {
    const id = await adasRoute('By a maintainer')

    await clients.maintainer.push('reports.file', { ground: 'spam', id, kind: 'route' })

    expect(await reportsOn(id)).toHaveLength(1)
  })

  it.each([
    ['an admin', 'admin', 'form_noPermission'],
    ['the author', 'ada', 'form_noPermission'],
    ['an admin of another region', 'outsider', 'reports_notFound'],
  ] as const)('refuses %s', async (_, who, message) => {
    const id = await adasRoute(`Refused ${who}`)

    expect(messageOf(await clients[who].push('reports.file', { ground: 'spam', id, kind: 'route' }))).toBe(message)
    expect(await reportsOn(id)).toEqual([])
  })

  it('tells each admin once per object, names nobody, and tells the author nothing', async () => {
    const id = await adasRoute('Odin')

    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })
    // Read, so a second notice would re-arm it rather than collapse into it.
    await sql`update public.notifications set read_at = now() where object_ref = ${`route:${id}`}`
    await clients.cy.push('reports.file', { ground: 'harassment', id, kind: 'route' })

    const ref = `route:${id}`
    expect(await sql`select 1 from public.notifications where object_ref = ${ref} and read_at is null`).toEqual([])
    for (const who of [admin, coAdmin]) {
      expect((await noticesOf(who)).filter((notice) => notice.object_ref === ref)).toEqual([
        {
          actor_fk: null,
          metadata: JSON.stringify({ kind: 'route', name: 'Odin' }),
          object_ref: ref,
          source_type: 'content_reported',
        },
      ])
    }
    expect(await noticesOf(ada)).toEqual([])
  })

  it('tells an admin nothing about a report on their own content', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, region_fk, block_fk) values ('By an admin', ${admin.userId}, ${regionId}, ${blockId})
      returning id`
    const ref = `route:${route.id}`

    await clients.bo.push('reports.file', { ground: 'spam', id: String(route.id), kind: 'route' })

    expect((await noticesOf(admin)).filter((notice) => notice.object_ref === ref)).toEqual([])
    expect((await noticesOf(coAdmin)).filter((notice) => notice.object_ref === ref)).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('reports on an admin s own content', () => {
  it('stay out of that admin s hands while another admin can review them', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, region_fk, block_fk) values ('Not theirs to judge', ${admin.userId}, ${regionId}, ${blockId})
      returning id`
    const id = String(route.id)
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })

    expect(messageOf(await clients.admin.push('reports.dismiss', { id, kind: 'route' }))).toBe('reports_notFound')
    expect(await reportsOn(id)).toHaveLength(1)
  })

  // The outsider is the only admin of the other region.
  it('go to a sole admin, who is told and may dismiss them', async () => {
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${otherRegionId}, ${bo.userId}, ${bo.authId}, 'region_user', true)`
    const [area] = await sql<{ id: number }[]>`
      insert into public.areas (name, created_by, region_fk, type) values ('Alone', ${outsider.userId}, ${otherRegionId}, 'sector')
      returning id`
    const [block] = await sql<{ id: number }[]>`
      insert into public.blocks (name, created_by, region_fk, area_fk, "order")
      values ('Alone', ${outsider.userId}, ${otherRegionId}, ${area.id}, 0) returning id`
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, region_fk, block_fk) values ('Sole', ${outsider.userId}, ${otherRegionId}, ${block.id})
      returning id`
    const id = String(route.id)
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })

    const told = await sql`
      select 1 from public.notifications where user_fk = ${outsider.userId} and object_ref = ${`route:${id}`}`
    expect(told).toHaveLength(1)
    expect(await clients.outsider.push('reports.dismiss', { id, kind: 'route' })).not.toHaveProperty('message')
    expect(await reportsOn(id)).toEqual([])
  })
})

describe.skipIf(!reachable)('a member s own open reports', () => {
  it('sync to them alone', async () => {
    const id = await adasRoute('Seen by its reporter')
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })
    await clients.cy.push('reports.file', { ground: 'harassment', id, kind: 'route' })

    const mine = async (user: SeedUser) => {
      const ctx = { authUserId: user.authId, pageState: await getUserPermissions(user.authId) }
      const rows = (await zero.run(queries.myOpenReports.fn({ args: {}, ctx }))) as {
        objectId: string
        reporterFk: number
      }[]
      return rows.filter((row) => row.objectId === id).map((row) => row.reporterFk)
    }
    expect(await mine(bo)).toEqual([bo.userId])
    expect(await mine(admin)).toEqual([])
  })
})

describe.skipIf(!reachable)('dismissing reports', () => {
  it('tells each reporter it stays, deletes the reports, and tells the author nothing', async () => {
    const id = await adasRoute('Stays')
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })
    await clients.cy.push('reports.file', { ground: 'spam', id, kind: 'route' })

    expect(await clients.coAdmin.push('reports.dismiss', { id, kind: 'route' })).not.toHaveProperty('message')

    expect(await reportsOn(id)).toEqual([])
    const stays = { kind: 'route', name: 'Stays', outcome: 'stays' }
    for (const who of [bo, cy]) {
      expect((await noticesOf(who)).filter((notice) => notice.object_ref === `route:${id}`)).toEqual([
        { actor_fk: null, metadata: JSON.stringify(stays), object_ref: `route:${id}`, source_type: 'report_closed' },
      ])
    }
    expect(await noticesOf(ada)).toEqual([])
  })

  // A 403 would tell the author their content is reported; a 404 says nothing either way.
  it('answers a non-admin as if nothing were reported', async () => {
    const id = await adasRoute('Probed')
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })

    expect(messageOf(await clients.ada.push('reports.dismiss', { id, kind: 'route' }))).toBe('reports_notFound')
    expect(
      messageOf(await clients.ada.push('reports.dismiss', { id: await adasRoute('Unreported'), kind: 'route' })),
    ).toBe('reports_notFound')
  })

  it('refuses a maintainer and keeps the reports', async () => {
    const id = await adasRoute('Not theirs to dismiss')
    await clients.bo.push('reports.file', { ground: 'spam', id, kind: 'route' })

    expect(messageOf(await clients.maintainer.push('reports.dismiss', { id, kind: 'route' }))).toBe('reports_notFound')
    expect(await reportsOn(id)).toHaveLength(1)
  })
})
