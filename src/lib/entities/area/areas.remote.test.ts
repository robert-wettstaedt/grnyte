/**
 * `updateArea` drives the real handler, in a real RLS transaction, as a real member.
 *
 * The case that matters: `areaActionSchema` makes `regionFk` a REQUIRED client field, the permission
 * gate (`requireEditableArea`) reads the STORED row, and the write is `.set({ ...value, id })`, which
 * puts the SUBMITTED `regionFk` into the row. Nothing compares the two.
 *
 * The caller here holds `region.edit` in BOTH regions, which is what makes it a real hole rather than
 * one RLS closes by accident: the areas UPDATE policy is `authorize_in_region('region.edit', region_fk)`
 * on both USING and WITH CHECK, so a member of both regions satisfies it and the row moves.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { updateArea } from './areas.remote'

const HOME = '__areas_remote_home__'
const OTHER = '__areas_remote_other__'

let maintainer: SeedUser
let homeRegionId = 0
let otherRegionId = 0
let areaId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  // Two regions, and the caller edits in both. That is the point: the escalation has to be the
  // handler's doing, not something the region gate would have refused anyway.
  for (const [name, target] of [
    [HOME, 'home'],
    [OTHER, 'other'],
  ] as const) {
    const [region] = await sql<{ id: number }[]>`
      insert into public.regions (name, created_by) values (${name}, ${maintainer.userId})
      on conflict do nothing returning id`
    const id = region?.id ?? (await sql<{ id: number }[]>`select id from public.regions where name = ${name}`).at(0)!.id

    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${id}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)
      on conflict do nothing`

    if (target === 'home') homeRegionId = id
    else otherRegionId = id
  }

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__areas_remote_area__', 'area', ${homeRegionId}, ${maintainer.userId})
    returning id`
  areaId = area.id
})

afterAll(async () => {
  if (reachable) {
    // `activities` first: `updateArea` logs one per edit and it carries a region FK, so the region
    // delete below raises 23503 otherwise.
    await sql`delete from public.activities where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.areas where id = ${areaId}`
    await sql`delete from public.region_members where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.regions where id in (${homeRegionId}, ${otherRegionId})`
  }
  await sql.end()
})

/**
 * A form handler signals success by THROWING a 303 redirect (`authedForm` turns a `redirectTo` into
 * `redirect()`), so the interesting assertion is always the database afterwards, never the return
 * value. Anything that is not a redirect is a real failure and is rethrown.
 */
async function submit(data: Record<string, unknown>): Promise<void> {
  try {
    await asRequest(maintainer.authId, () => callForm(updateArea, data))
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status !== 303) throw error
  }
}

describe.skipIf(!reachable)('updateArea', () => {
  it('renames the area', async () => {
    // Strings, because `areaActionSchema` builds on `stringToInt`, a codec over `z.string()`:
    // this is the shape a real `<form>` submits.
    await submit({
      description: '',
      id: String(areaId),
      name: '__areas_remote_renamed__',
      regionFk: String(homeRegionId),
    })

    const [row] = await sql<{ name: string }[]>`select name from public.areas where id = ${areaId}`
    expect(row.name).toBe('__areas_remote_renamed__')
  })

  it('does not move the area to another region on a rename', async () => {
    await submit({
      description: '',
      id: String(areaId),
      name: '__areas_remote_renamed__',
      // The whole test: a field the form legitimately submits, pointed somewhere else.
      regionFk: String(otherRegionId),
    })

    const [row] = await sql<{ regionFk: number }[]>`
      select region_fk as "regionFk" from public.areas where id = ${areaId}`
    expect(row.regionFk).toBe(homeRegionId)
  })
})
