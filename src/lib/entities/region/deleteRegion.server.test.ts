// @vitest-environment node
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import type { SendEmailInput } from '$lib/email/send.server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRegion, previewRegionDeletion } from './delete.server'

const auth = vi.hoisted(() => ({ password: vi.fn(async () => true) }))
const storage = vi.hoisted(() => ({ remove: vi.fn(async () => {}) }))
const mail = vi.hoisted(() => ({ outcomes: [] as string[], result: 'sent', sent: [] as SendEmailInput[] }))
vi.mock('../user/password.server', () => ({ verifyPassword: auth.password }))
vi.mock('../file/cleanup.server', async (original) => ({
  ...(await original<typeof import('../file/cleanup.server')>()),
  removeFileStorage: storage.remove,
}))
vi.mock('$lib/email/send.server', () => ({
  sendEmailOutcome: async (input: SendEmailInput) => {
    mail.sent.push(input)
    return mail.outcomes.shift() ?? mail.result
  },
}))

const NAME = '__delete_region__'

let owner: SeedUser
let admin: SeedUser
let climber: SeedUser
let regionId = 0

async function seed() {
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${NAME}, ${owner.userId}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true),
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${climber.userId}, ${climber.authId}, 'region_user', true)`
  const [{ id: area }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Gebiet', ${owner.userId}, ${regionId}, 'area') returning id`
  const [{ id: block }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Block', ${owner.userId}, ${regionId}, ${area}, 0) returning id`
  const [{ id: route }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values ('Route', ${owner.userId}, ${regionId}, ${block})
    returning id`
  await sql`
    insert into public.ascents (region_fk, created_by, type, route_fk, grade_fk) values
      (${regionId}, ${owner.userId}, 'flash', ${route}, 10),
      (${regionId}, ${climber.userId}, 'redpoint', ${route}, 10),
      (${regionId}, ${climber.userId}, 'repeat', ${route}, 10)`
}

const regionRows = async () => (await sql`select 1 from public.regions where id = ${regionId}`).length
const remove = (name = NAME, by = owner) =>
  deleteRegion({ email: by.email, id: by.userId }, { name, regionFk: regionId }, 'pw', 'https://grnyte.test')

beforeEach(async () => {
  auth.password.mockResolvedValue(true)
  storage.remove.mockClear()
  mail.result = 'sent'
  mail.outcomes = []
  mail.sent = []
  if (!reachable) return
  owner ??= await createThrowawayUser('delete_region_owner')
  admin ??= await createThrowawayUser('delete_region_admin')
  climber ??= await createThrowawayUser('delete_region_climber')
  await cleanup()
  await seed()
})

async function cleanup() {
  const ids = sql`select id from public.regions where name = ${NAME}`
  await sql`delete from public.ascents where region_fk in (${ids})`
  await sql`delete from public.routes where region_fk in (${ids})`
  await sql`delete from public.blocks where region_fk in (${ids})`
  await sql`delete from public.areas where region_fk in (${ids})`
  await sql`delete from public.region_members where region_fk in (${ids})`
  await sql`delete from public.regions where name = ${NAME}`
}

afterAll(async () => {
  if (!reachable) return
  await cleanup()
  for (const user of [owner, admin, climber]) await dropThrowawayUser(user)
  await sql.end()
})

describe.skipIf(!reachable)('previewRegionDeletion', () => {
  it('counts the other members and the ascents they logged, not the owner’s own', async () => {
    expect(await previewRegionDeletion(regionId, owner.userId)).toEqual({ ascents: 2, members: 2 })
  })

  it('refuses anyone but the owner', async () => {
    await expect(previewRegionDeletion(regionId, admin.userId)).rejects.toMatchObject({ status: 403 })
  })
})

describe.skipIf(!reachable)('deleteRegion', () => {
  it('refuses a name that does not match, before asking for the password', async () => {
    expect(await remove('Something else')).toEqual({ kind: 'wrongName' })
    expect(auth.password).not.toHaveBeenCalled()
    expect(await regionRows()).toBe(1)
  })

  it('changes nothing for a wrong password', async () => {
    auth.password.mockResolvedValue(false)

    expect(await remove()).toEqual({ kind: 'wrongPassword' })
    expect(await regionRows()).toBe(1)
  })

  it('refuses an admin who is not the owner', async () => {
    await expect(remove(NAME, admin)).rejects.toMatchObject({ status: 403 })
    expect(await regionRows()).toBe(1)
  })

  it('deletes the region, removes its files, and mails every other member once', async () => {
    expect(await remove(`  ${NAME} `)).toEqual({ kind: 'deleted' })

    expect(await regionRows()).toBe(0)
    expect(await sql`select 1 from public.ascents where created_by = ${climber.userId}`).toHaveLength(0)
    expect(storage.remove).toHaveBeenCalledOnce()
    expect(mail.sent.map((sent) => sent.to).sort()).toEqual([admin.email, climber.email].sort())
    expect(mail.sent[0].subject).toContain(NAME)
  })

  it('keeps the region deleted when the mail provider fails', async () => {
    mail.result = 'failed'

    expect(await remove()).toEqual({ kind: 'deleted' })
    expect(await regionRows()).toBe(0)
  })

  it('sends one mail at a time and retries a rate-limited one once', async () => {
    mail.outcomes = ['retry']

    expect(await remove()).toEqual({ kind: 'deleted' })
    // Two members, the first refused once: three attempts, its retry before the second member.
    expect(mail.sent.map((sent) => sent.to)).toEqual([mail.sent[0].to, mail.sent[0].to, mail.sent[2].to])
    expect(mail.sent[2].to).not.toBe(mail.sent[0].to)
  })
})
