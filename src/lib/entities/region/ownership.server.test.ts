// @vitest-environment node
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { transferRegionOwnership } from './ownership.server'

const auth = vi.hoisted(() => ({ password: vi.fn(async () => true) }))
const notice = vi.hoisted(() => ({ notify: vi.fn(async () => {}) }))
vi.mock('../user/password.server', () => ({ verifyPassword: auth.password }))
vi.mock('../notification/notification.server', () => ({ notify: notice.notify }))

const PREFIX = '__ownership__'

let owner: SeedUser
let admin: SeedUser
let maintainer: SeedUser
let regionId = 0

const ownerOf = async () =>
  (await sql<{ created_by: number }[]>`select created_by from public.regions where id = ${regionId}`)[0].created_by
const handOver = (to: SeedUser, by = owner) =>
  transferRegionOwnership({ email: by.email, id: by.userId }, { regionFk: regionId, userFk: to.userId }, 'pw')

beforeAll(async () => {
  if (!reachable) return
  ;[owner, admin, maintainer] = await Promise.all(
    ['ownership_owner', 'ownership_admin', 'ownership_maintainer'].map((label) => createThrowawayUser(label)),
  )
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${PREFIX + 'region'}, ${owner.userId}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true),
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`
})

beforeEach(async () => {
  auth.password.mockResolvedValue(true)
  notice.notify.mockClear()
  auth.password.mockClear()
  if (reachable) await sql`update public.regions set created_by = ${owner.userId} where id = ${regionId}`
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.notifications where region_fk in (select id from public.regions where name like ${PREFIX + '%'})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name like ${PREFIX + '%'})`
  await sql`delete from public.regions where name like ${PREFIX + '%'}`
  for (const user of [owner, admin, maintainer]) await dropThrowawayUser(user)
  await sql.end()
})

describe.skipIf(!reachable)('transferRegionOwnership', () => {
  it('makes another admin the owner, keeps the old owner an admin, and tells the new owner', async () => {
    expect(await handOver(admin)).toEqual({ kind: 'transferred' })

    expect(await ownerOf()).toBe(admin.userId)
    const [{ role }] = await sql<{ role: string }[]>`
      select role from public.region_members where region_fk = ${regionId} and user_fk = ${owner.userId}`
    expect(role).toBe('region_admin')
    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: 'owner',
        regionFk: regionId,
        sourceType: 'role_changed',
        userFks: [admin.userId],
      }),
    )
  })

  it('changes nothing for a wrong password', async () => {
    auth.password.mockResolvedValue(false)

    expect(await handOver(admin)).toEqual({ kind: 'wrongPassword' })
    expect(await ownerOf()).toBe(owner.userId)
  })

  it('refuses an admin who is not the owner', async () => {
    await expect(handOver(maintainer, admin)).rejects.toMatchObject({ status: 403 })
    expect(await ownerOf()).toBe(owner.userId)
  })

  it('refuses a non-owner before asking for the password', async () => {
    await expect(handOver(maintainer, admin)).rejects.toMatchObject({ status: 403 })
    expect(auth.password).not.toHaveBeenCalled()
  })

  it('refuses handing the region to yourself', async () => {
    await expect(handOver(owner)).rejects.toMatchObject({
      body: { message: expect.stringContaining('region_cannotChangeOwnRole') },
      status: 409,
    })
    expect(notice.notify).not.toHaveBeenCalled()
  })

  it('clears an unread role notice, whose key the owner notice would otherwise collide with', async () => {
    await sql`
      insert into public.notifications (region_fk, user_fk, auth_user_fk, actor_fk, subject_fk, source_type, metadata)
      values (${regionId}, ${admin.userId}, ${admin.authId}, ${owner.userId}, ${admin.userId}, 'role_changed', 'region_admin')`

    await handOver(admin)

    expect(
      await sql`select 1 from public.notifications where region_fk = ${regionId} and user_fk = ${admin.userId}`,
    ).toHaveLength(0)
  })

  it('refuses a recipient who is not an active admin', async () => {
    await expect(handOver(maintainer)).rejects.toMatchObject({ status: 409 })
    expect(await ownerOf()).toBe(owner.userId)
    expect(notice.notify).not.toHaveBeenCalled()
  })

  it('refuses a recipient who already owns the founding cap', async () => {
    await sql`
      insert into public.regions (name, created_by)
      select ${PREFIX} || 'capped' || n, ${admin.userId} from generate_series(1, 3) n`
    try {
      await expect(handOver(admin)).rejects.toMatchObject({ status: 409 })
      expect(await ownerOf()).toBe(owner.userId)
    } finally {
      await sql`delete from public.regions where name like ${PREFIX + 'capped%'}`
    }
  })
})
