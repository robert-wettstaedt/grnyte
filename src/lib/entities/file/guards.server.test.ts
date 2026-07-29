// @vitest-environment node
/**
 * Regression tests for two file-authorization holes that shipped above a deliberately-loose RLS:
 *
 *  - `finalizeImage` attached images with NO permission check, while `finalizeVideo` required EDIT.
 *    `resolveAttachRegion` is now the single gate both share, so image and video attach cannot
 *    diverge again. The files INSERT RLS is only READ, so this app gate is the effective one.
 *  - `setFileVisibility` (publish/unpublish) had no server gate at all - only the UI hid it. Its
 *    `canEditFile` rule is deliberately stricter than the files UPDATE RLS for ascent media, because
 *    publishing an ascent file exposes the whole ascent.
 *
 * Superuser connection (RLS bypassed) because these are the APP gates, above RLS. `userRegions` and
 * `userId` are constructed - they are the caller identity the mutation trusts. Skipped when
 * DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import type { UserRegion } from '$lib/entities/region/dto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireEditableFile, resolveAttachRegion } from './guards.server'

const REGION = '__file_authz_region__'

const EMAILS = {
  /** Creates the ascent, and so owns its media. */
  owner: 'user@grnyte.rocks',
  /** A member who is neither the owner nor an admin. */
  stranger: 'maintainer@grnyte.rocks',
} as const

let users = {} as Record<keyof typeof EMAILS, SeedUser>
let regionId = 0
let areaId = 0
let ascentId = 0
const fileId = '__file_authz_file__'

const membership = (regionFk: number, ...permissions: UserRegion['permissions']): UserRegion => ({
  name: '',
  permissions,
  regionFk,
  role: 'region_user',
  settings: undefined,
})

async function removeFixtures() {
  const inRegion = sql`(select id from public.regions where name = ${REGION})`
  await sql`delete from public.files where region_fk in ${inRegion}`
  await sql`delete from public.ascents where region_fk in ${inRegion}`
  await sql`delete from public.routes where region_fk in ${inRegion}`
  await sql`delete from public.blocks where region_fk in ${inRegion}`
  await sql`delete from public.areas where region_fk in ${inRegion}`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)
  await removeFixtures()

  const owner = users.owner.userId
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${owner}, 10) returning id`
  ;[{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by)
    values ('A', ${regionId}, ${owner}) returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, region_fk, created_by, "order", area_fk)
    values ('B', ${regionId}, ${owner}, 0, ${areaId}) returning id`
  const [{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, region_fk, created_by, block_fk)
    values ('R', ${regionId}, ${owner}, ${blockId}) returning id`
  ;[{ id: ascentId }] = await sql<{ id: number }[]>`
    insert into public.ascents (region_fk, created_by, type, route_fk)
    values (${regionId}, ${owner}, 'flash', ${routeId}) returning id`
  await sql`
    insert into public.files (id, region_fk, path, ascent_fk, created_by)
    values (${fileId}, ${regionId}, '/user-content/x.jpg', ${ascentId}, ${owner})`
}, 30_000)

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('resolveAttachRegion', () => {
  it('refuses a READ member attaching to a non-ascent entity (finalizeImage had no gate)', async () => {
    await expect(
      resolveAttachRegion(db, users.stranger.userId, [membership(regionId, 'region.read')], 'area', areaId),
    ).rejects.toThrow()
  })

  it('allows an EDIT member attaching to a non-ascent entity', async () => {
    const region = await resolveAttachRegion(db, users.stranger.userId, [membership(regionId, 'region.edit')], 'area', areaId)
    expect(region).toBe(regionId)
  })

  it('lets the ascent owner attach to their own ascent, without needing EDIT', async () => {
    const region = await resolveAttachRegion(db, users.owner.userId, [membership(regionId, 'region.read')], 'ascent', ascentId)
    expect(region).toBe(regionId)
  })

  it('refuses attaching to someone else’s ascent', async () => {
    await expect(
      resolveAttachRegion(db, users.stranger.userId, [membership(regionId, 'region.admin')], 'ascent', ascentId),
    ).rejects.toThrow()
  })
})

describe.skipIf(!reachable)('requireEditableFile', () => {
  it('refuses a maintainer (EDIT, not admin, not owner) publishing another member’s ascent media', async () => {
    await expect(
      requireEditableFile(db, [membership(regionId, 'region.edit')], users.stranger.userId, fileId),
    ).rejects.toThrow()
  })

  it('lets the ascent owner change their own media’s visibility', async () => {
    const file = await requireEditableFile(db, [membership(regionId, 'region.read')], users.owner.userId, fileId)
    expect(file.id).toBe(fileId)
  })

  it('lets a region admin change any ascent media’s visibility', async () => {
    const file = await requireEditableFile(db, [membership(regionId, 'region.admin')], users.stranger.userId, fileId)
    expect(file.id).toBe(fileId)
  })
})
