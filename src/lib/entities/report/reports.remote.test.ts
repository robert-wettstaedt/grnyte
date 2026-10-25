import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listRegionReports, reportPreview } from './reports.remote'

let admin: SeedUser
let maintainer: SeedUser
let outsider: SeedUser
let ada: SeedUser
let bo: SeedUser
let cy: SeedUser
let regionId = 0
let otherRegionId = 0
let blockId = 0

beforeAll(async () => {
  if (!reachable) return
  ;[admin, maintainer, outsider, ada, bo, cy] = await Promise.all(
    ['admin', 'maintainer', 'outsider', 'ada', 'bo', 'cy'].map((who) => createThrowawayUser(`queue_${who}`)),
  )
  await sql`update public.users set username = 'Bo' where id = ${bo.userId}`
  await sql`update public.users set username = 'Cy' where id = ${cy.userId}`
  await sql`update public.users set username = 'Mo' where id = ${maintainer.userId}`
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__report_queue__', ${admin.userId}) returning id`
  regionId = region.id
  const [other] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__report_queue_other__', ${outsider.userId}) returning id`
  otherRegionId = other.id
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true),
      (${regionId}, ${ada.userId}, ${ada.authId}, 'region_user', true),
      (${regionId}, ${bo.userId}, ${bo.authId}, 'region_user', true),
      (${otherRegionId}, ${outsider.userId}, ${outsider.authId}, 'region_admin', true)`
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Queue', ${admin.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Queue', ${admin.userId}, ${regionId}, ${area.id}, 0) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (!reachable) return
  // The dev cron may have closed a fixture report and told its reporter.
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.content_reports where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.regions where id in (${regionId}, ${otherRegionId})`
  for (const user of [admin, maintainer, outsider, ada, bo, cy]) await dropThrowawayUser(user)
})

async function reportedRoute(name: string, reports: [SeedUser, string, string?][], deleted = false) {
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk, deleted_at)
    values (${name}, ${ada.userId}, ${regionId}, ${blockId}, ${deleted ? new Date() : null}) returning id`
  for (const [reporter, ground, note] of reports) {
    await sql`
      insert into public.content_reports (author_fk, ground, note, object_id, object_type, region_fk, reporter_fk)
      values (${ada.userId}, ${ground}, ${note ?? null}, ${String(route.id)}, 'route', ${regionId}, ${reporter.userId})`
  }
  return String(route.id)
}

describe.skipIf(!reachable)('listRegionReports', () => {
  it('groups an object s reports, most reported ground first, and leaves out what is gone', async () => {
    // Spam outnumbers harassment, which the form lists first.
    const id = await reportedRoute('Odin', [
      [bo, 'harassment', 'Names a person'],
      [cy, 'spam'],
      [maintainer, 'spam'],
    ])
    await reportedRoute('Gone', [[bo, 'spam']], true)

    const queue = await asRequest(admin.authId, () => listRegionReports({ regionFk: regionId }))

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ grounds: ['spam', 'harassment'], id, kind: 'route', name: 'Odin' })
    expect(queue[0].reports.map((report) => [report.reporterName, report.ground, report.note]).sort()).toEqual([
      ['Bo', 'harassment', 'Names a person'],
      ['Cy', 'spam', undefined],
      ['Mo', 'spam', undefined],
    ])
  })

  it('refuses a maintainer of the region and an admin of another', async () => {
    for (const user of [maintainer, outsider]) {
      expect(await statusOf(() => asRequest(user.authId, () => listRegionReports({ regionFk: regionId })))).toBe(403)
    }
  })
})

describe.skipIf(!reachable)('listRegionReports on an admin s own content', () => {
  it('shows a sole admin only the rules named: no reporter, note, count or time', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, region_fk, block_fk) values ('Own', ${admin.userId}, ${regionId}, ${blockId})
      returning id`
    for (const [reporter, ground] of [
      [bo, 'spam'],
      [cy, 'harassment'],
      [maintainer, 'spam'],
    ] as const) {
      await sql`
        insert into public.content_reports (author_fk, ground, note, object_id, object_type, region_fk, reporter_fk)
        values (${admin.userId}, ${ground}, 'Says who', ${String(route.id)}, 'route', ${regionId}, ${reporter.userId})`
    }

    const queue = await asRequest(admin.authId, () => listRegionReports({ regionFk: regionId }))
    const own = queue.find((row) => row.id === String(route.id))

    // The form's order, not the count's, so the order leaks nothing either.
    expect(own).toMatchObject({ grounds: ['harassment', 'spam'], newestAt: undefined, own: true, reports: [] })
  })

  it('lists a sole admin s own row after every other, so its place says nothing of when', async () => {
    const at = async (name: string, author: SeedUser, hoursAgo: number) => {
      const [route] = await sql<{ id: number }[]>`
        insert into public.routes (name, created_by, region_fk, block_fk) values (${name}, ${author.userId}, ${regionId}, ${blockId})
        returning id`
      await sql`
        insert into public.content_reports (author_fk, ground, object_id, object_type, region_fk, reporter_fk, created_at)
        values (${author.userId}, 'spam', ${String(route.id)}, 'route', ${regionId}, ${bo.userId}, now() - ${`${hoursAgo} hours`}::interval)`
      return String(route.id)
    }
    const older = await at('Older', ada, 10)
    const own = await at('Own, in between', admin, 5)
    const newer = await at('Newer', ada, 1)

    const ids = (await asRequest(admin.authId, () => listRegionReports({ regionFk: regionId }))).map((row) => row.id)

    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older))
    expect(ids.indexOf(own)).toBeGreaterThan(ids.indexOf(older))
  })

  it('hides it from that admin once another admin can review it, who sees it whole', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, region_fk, block_fk) values ('Own, two admins', ${admin.userId}, ${regionId}, ${blockId})
      returning id`
    await sql`
      insert into public.content_reports (author_fk, ground, object_id, object_type, region_fk, reporter_fk)
      values (${admin.userId}, 'spam', ${String(route.id)}, 'route', ${regionId}, ${bo.userId})`
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${regionId}, ${cy.userId}, ${cy.authId}, 'region_admin', true)`

    try {
      const mine = await asRequest(admin.authId, () => listRegionReports({ regionFk: regionId }))
      const theirs = await asRequest(cy.authId, () => listRegionReports({ regionFk: regionId }))

      expect(mine.find((row) => row.id === String(route.id))).toBeUndefined()
      expect(theirs.find((row) => row.id === String(route.id))).toMatchObject({
        own: false,
        reports: [{ reporterName: 'Bo' }],
      })
    } finally {
      await sql`delete from public.region_members where region_fk = ${regionId} and user_fk = ${cy.userId}`
    }
  })
})

describe.skipIf(!reachable)('reportPreview', () => {
  it('shows a member what they are about to report', async () => {
    const id = await reportedRoute('Previewed', [])

    const item = await asRequest(bo.authId, () => reportPreview({ id, kind: 'route' }))

    expect(item).toMatchObject({ title: 'Previewed' })
  })

  it('refuses the author, and answers an outsider as if nothing were there', async () => {
    const id = await reportedRoute('Not to preview', [])

    expect(await statusOf(() => asRequest(ada.authId, () => reportPreview({ id, kind: 'route' })))).toBe(403)
    expect(await statusOf(() => asRequest(outsider.authId, () => reportPreview({ id, kind: 'route' })))).toBe(404)
  })
})
