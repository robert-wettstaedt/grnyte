import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listRegionDecisions, removalPreview } from './moderation.remote'

let admin: SeedUser
let maintainer: SeedUser
let outsider: SeedUser
let people: SeedUser[]
let regionId = 0
let blockId = 0

beforeAll(async () => {
  if (!reachable) return
  admin = await createThrowawayUser('preview_admin')
  maintainer = await createThrowawayUser('preview_maintainer')
  outsider = await createThrowawayUser('preview_outsider')
  people = await Promise.all(['ada', 'bo', 'cy'].map((who) => createThrowawayUser(`preview_${who}`)))
  await sql`update public.users set username = 'Ada' where id = ${people[0].userId}`
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__moderation_preview__', ${admin.userId}) returning id`
  regionId = region.id
  await sql`
    insert into public.moderation_decisions (actor_fk, ground, object_id, object_type, reason, region_fk)
    values (${admin.userId}, 'spam', '1', 'area', 'Logged', ${regionId})`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true),
      (${regionId}, ${people[0].userId}, ${people[0].authId}, 'region_user', true),
      (${regionId}, ${people[1].userId}, ${people[1].authId}, 'region_user', true),
      (${regionId}, ${people[2].userId}, ${people[2].authId}, 'region_user', false)`
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Preview', ${admin.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Preview', ${admin.userId}, ${regionId}, ${area.id}, 0) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.moderation_decisions where region_fk = ${regionId}`
  await sql`delete from public.region_members where user_fk = ${outsider.userId}`
  await sql`delete from public.regions where created_by = ${outsider.userId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  for (const user of [admin, maintainer, outsider, ...people]) await dropThrowawayUser(user)
})

const route = async (author: SeedUser) => {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values ('R', ${author.userId}, ${regionId}, ${blockId})
    returning id`
  return row.id
}

describe.skipIf(!reachable)('removalPreview', () => {
  // Cy left the region and is told all the same: the statement is owed to whoever posted it.
  it('names one author of a block and counts the others, in the region or not', async () => {
    for (const person of people) await route(person)

    const preview = await asRequest(admin.authId, () => removalPreview({ id: String(blockId), kind: 'block' }))

    expect(preview).toMatchObject({ item: { title: 'Preview' }, names: ['Ada'], others: 2 })
  })

  it('refuses a route holding nothing of anyone else', async () => {
    const id = await route(admin)

    expect(await statusOf(() => asRequest(admin.authId, () => removalPreview({ id: String(id), kind: 'route' })))).toBe(
      400,
    )
  })

  it('refuses a maintainer', async () => {
    expect(
      await statusOf(() => asRequest(maintainer.authId, () => removalPreview({ id: String(blockId), kind: 'block' }))),
    ).toBe(403)
  })
})

describe.skipIf(!reachable)('listRegionDecisions', () => {
  it('lists the region s decisions for its admin', async () => {
    const rows = await asRequest(admin.authId, () => listRegionDecisions({ regionFk: regionId }))

    expect(rows.map((row) => row.reason)).toEqual(['Logged'])
  })

  it('refuses a maintainer of the region and an admin of another', async () => {
    const [other] = await sql<{ id: number }[]>`
      insert into public.regions (name, created_by) values ('__moderation_preview_other__', ${outsider.userId}) returning id`
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${other.id}, ${outsider.userId}, ${outsider.authId}, 'region_admin', true)`

    for (const user of [maintainer, outsider]) {
      expect(await statusOf(() => asRequest(user.authId, () => listRegionDecisions({ regionFk: regionId })))).toBe(403)
    }
  })
})
