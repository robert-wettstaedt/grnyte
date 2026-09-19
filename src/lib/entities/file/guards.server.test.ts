import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { userRegion } from '$lib/entities/region/fixture'
// @vitest-environment node
/**
 * Regression tests for two file-authorization holes that shipped above a deliberately-loose RLS:
 *
 *  - `finalizeImage` attached images with NO permission check, while `finalizeVideo` required EDIT.
 *    `resolveAttachRegion` is now the single gate both share, so image and video attach cannot
 *    diverge again. The files INSERT RLS is only READ, so this app gate is the effective one.
 *  - `setFileVisibility` (publish/unpublish) had no server gate at all: only the UI hid it. Its
 *    `canEditFile` rule is deliberately stricter than the files UPDATE RLS for ascent media, because
 *    publishing an ascent file exposes the whole ascent.
 *
 * Superuser connection (RLS bypassed) because these are the APP gates, above RLS. `userRegions` and
 * `userId` are constructed: they are the caller identity the mutation trusts. Skipped when
 * DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { formError } from '$lib/forms/schemas'
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
let blockId = 0
let routeId = 0
let ascentId = 0
const fileId = '__file_authz_file__'

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
  ;[{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, region_fk, created_by, "order", area_fk)
    values ('B', ${regionId}, ${owner}, 0, ${areaId}) returning id`
  ;[{ id: routeId }] = await sql<{ id: number }[]>`
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
  // The status, not merely any throw: `resolveAttachRegion` 404s on a missing row immediately before
  // it checks the permission, so a drifted fixture (a failed insert leaving `areaId` at 0, a new
  // deletedAt filter) would keep a bare `rejects.toThrow()` green while the authz branch these
  // tests exist for never runs.
  it('refuses a READ member attaching to a non-ascent entity (finalizeImage had no gate)', async () => {
    await expect(
      resolveAttachRegion(db, users.stranger.userId, [userRegion(regionId, 'region.read')], 'area', areaId),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('allows an EDIT member attaching to a non-ascent entity', async () => {
    const region = await resolveAttachRegion(
      db,
      users.stranger.userId,
      [userRegion(regionId, 'region.edit')],
      'area',
      areaId,
    )
    expect(region).toBe(regionId)
  })

  // Only `area` was ever driven, so the block and route arms of the same ternary, and the per-entity
  // not-found key each picks, ran in no test at all.
  it.each([
    ['block', () => blockId],
    ['route', () => routeId],
  ] as const)('resolves the region through the %s arm', async (type, id) => {
    expect(await resolveAttachRegion(db, users.stranger.userId, [userRegion(regionId, 'region.edit')], type, id())) //
      .toBe(regionId)
  })

  it.each([
    ['area', 'areas_notFound'],
    ['block', 'blocks_notFound'],
    ['route', 'routes_notFound'],
  ] as const)('404s a missing %s with its own key, not a neighbour s', async (type, key) => {
    await expect(
      resolveAttachRegion(db, users.stranger.userId, [userRegion(regionId, 'region.edit')], type, 0),
    ).rejects.toMatchObject({ body: { message: formError(key) }, status: 404 })
  })

  it('refuses attaching to a soft-deleted entity, EDIT or not', async () => {
    // The bytes would land on a row nothing reaches and no sweeper reclaims.
    await sql`update public.areas set deleted_at = now() where id = ${areaId}`

    try {
      await expect(
        resolveAttachRegion(db, users.stranger.userId, [userRegion(regionId, 'region.edit')], 'area', areaId),
      ).rejects.toMatchObject({ status: 404 })
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${areaId}`
    }
  })

  it('lets the ascent owner attach to their own ascent, without needing EDIT', async () => {
    const region = await resolveAttachRegion(
      db,
      users.owner.userId,
      [userRegion(regionId, 'region.read')],
      'ascent',
      ascentId,
    )
    expect(region).toBe(regionId)
  })

  it('refuses attaching to someone else’s ascent', async () => {
    // 403 rather than any throw, and it matters more here: the ascent branch filters on
    // `isNull(ascents.deletedAt)`, so a soft-deleted fixture 404s and would pass a bare toThrow
    // without ever reaching the `ascent.createdBy !== userId` check this test is named for.
    await expect(
      resolveAttachRegion(db, users.stranger.userId, [userRegion(regionId, 'region.admin')], 'ascent', ascentId),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe.skipIf(!reachable)('requireEditableFile on a file with no ascent behind it', () => {
  // Every case below hangs off the ascent file, so `canEditFile`'s other branch, the one a topo or
  // block photo takes, never ran through this gate.
  const blockFileId = '__file_authz_block_file__'

  beforeAll(async () => {
    if (!reachable) return
    await sql`
      insert into public.files (id, region_fk, path, block_fk, created_by)
      values (${blockFileId}, ${regionId}, '/topos/b.jpg', ${blockId}, ${users.owner.userId})
      on conflict (id) do nothing`
  })

  it('lets an EDIT member edit it, with no ascent author to own it', async () => {
    const file = await requireEditableFile(
      db,
      [userRegion(regionId, 'region.edit')],
      users.stranger.userId,
      blockFileId,
    )
    expect(file.id).toBe(blockFileId)
  })

  it('refuses a READ member, who may own ascent media but not this', async () => {
    await expect(
      requireEditableFile(db, [userRegion(regionId, 'region.read')], users.owner.userId, blockFileId),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('404s a file that is not there', async () => {
    await expect(
      requireEditableFile(db, [userRegion(regionId, 'region.edit')], users.stranger.userId, '__file_authz_missing__'),
    ).rejects.toMatchObject({ body: { message: formError('files_notFound') }, status: 404 })
  })
})

describe.skipIf(!reachable)('requireEditableFile', () => {
  it('refuses a maintainer (EDIT, not admin, not owner) publishing another member’s ascent media', async () => {
    // `requireEditableFile` 404s on a missing row and 403s when `canEditFile` refuses. Pinning the
    // 403 is what keeps the deliberate divergence here under test: a maintainer must not flip
    // someone else's ascent media public, even though the files UPDATE policy would let them.
    await expect(
      requireEditableFile(db, [userRegion(regionId, 'region.edit')], users.stranger.userId, fileId),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets the ascent owner change their own media’s visibility', async () => {
    const file = await requireEditableFile(db, [userRegion(regionId, 'region.read')], users.owner.userId, fileId)
    expect(file.id).toBe(fileId)
  })

  it('lets a region admin change any ascent media’s visibility', async () => {
    const file = await requireEditableFile(db, [userRegion(regionId, 'region.admin')], users.stranger.userId, fileId)
    expect(file.id).toBe(fileId)
  })
})
