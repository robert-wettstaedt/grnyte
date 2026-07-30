// @vitest-environment node
/**
 * Regression test for the cross-region escalation `updateArea` once shipped: its permission check
 * read the SUBMITTED `regionFk` instead of the stored row's, so anyone holding EDIT in any region
 * could edit (and relocate) an area in a region they had no rights in. `requireEditableArea` gates
 * on the fetched row, so the submitted value can no longer be the subject.
 *
 * `userRegions` is the app's own permission array, which the mutation trusts as the caller's
 * identity - so it is constructed here rather than seeded, keeping the fixture to a single area.
 * The connection is the superuser one (RLS bypassed) because this is the APP gate, above RLS -
 * and the escalation worked precisely because RLS on `areas` UPDATE is deliberately loose (READ).
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import type { UserRegion } from '$lib/entities/region/dto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadParentArea, requireEditableArea } from './guards.server'

const REGION = '__area_guards_region__'

const EMAILS = { owner: 'maintainer@grnyte.rocks' } as const

let users = {} as Record<keyof typeof EMAILS, SeedUser>
let regionId = 0
let areaId = 0

/** A membership carrying `permissions` in `regionFk`, the only two fields the gate reads. */
const membership = (regionFk: number, ...permissions: UserRegion['permissions']): UserRegion => ({
  name: '',
  permissions,
  regionFk,
  role: 'region_user',
  settings: undefined,
})

async function removeFixtures() {
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)
  await removeFixtures()
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${users.owner.userId}, 10) returning id`
  ;[{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by)
    values ('Guarded Area', ${regionId}, ${users.owner.userId}) returning id`
}, 30_000)

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('requireEditableArea', () => {
  it('refuses an editor whose EDIT is in a DIFFERENT region (the escalation)', async () => {
    // The attacker holds EDIT in region 999, and targets an area in `regionId`. Under the old
    // code they would submit `regionFk: 999` and pass; here the gate reads the stored row.
    await expect(requireEditableArea(db, [membership(999, 'region.edit')], areaId)).rejects.toThrow()
  })

  it('refuses a plain member (READ) of the area’s own region', async () => {
    await expect(requireEditableArea(db, [membership(regionId, 'region.read')], areaId)).rejects.toThrow()
  })

  it('allows an editor of the area’s own region, and returns the stored row', async () => {
    const area = await requireEditableArea(db, [membership(regionId, 'region.edit')], areaId)
    expect(area.id).toBe(areaId)
    expect(area.regionFk).toBe(regionId)
  })

  it('refuses when the id is missing', async () => {
    await expect(requireEditableArea(db, [membership(regionId, 'region.edit')], undefined)).rejects.toThrow()
  })
})

/**
 * `loadParentArea` is the shared cross-region check createArea and restoreArea both run: a child area
 * must live in its parent's region. The escalation it prevents is a child created (or restored from a
 * client snapshot) in region A under a parent in region B, where B can neither see nor moderate it.
 */
describe.skipIf(!reachable)('loadParentArea', () => {
  it('is ok with no parent (a top-level area)', async () => {
    const { parent, status } = await loadParentArea(db, null, regionId)
    expect(status).toBe('ok')
    expect(parent).toBeUndefined()
  })

  it('is ok, and returns the parent, when the parent is in the claimed region', async () => {
    const { parent, status } = await loadParentArea(db, areaId, regionId)
    expect(status).toBe('ok')
    expect(parent?.id).toBe(areaId)
  })

  it('flags a parent in a DIFFERENT region than the child claims', async () => {
    // The parent (areaId) lives in `regionId`; a child claiming some other region must not attach.
    const { status } = await loadParentArea(db, areaId, regionId + 987654)
    expect(status).toBe('wrongRegion')
  })

  it('flags a parent id that does not exist', async () => {
    const { status } = await loadParentArea(db, 987654321, regionId)
    expect(status).toBe('missing')
  })
})
