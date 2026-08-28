/**
 * `createBlock` / `updateBlock` driven through the real handlers, in a real RLS transaction, as a
 * real member. What these cover is the description column and the fan-out that hangs off it:
 *
 * - it is stored as typed, and an empty one is stored as NULL rather than '', so `description IS
 *   NULL` means "not set" and the render guards do not have to know about two empties;
 * - a `!users:id!` mention in it writes an inbox row pointed at the BLOCK;
 * - re-saving a body that already carried that mention writes nothing. That last one is the branch
 *   that fails silently: drop `previousBody` from the `notifyMentions` call and every save
 *   re-notifies everybody the description names, which no screen would show and no type would catch.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBlock, updateBlock } from './blocks.remote'

const REGION = '__blocks_remote_region__'
const BLOCK = '__blocks_remote_block__'

let maintainer: SeedUser
let member: SeedUser
let second: SeedUser
let regionId = 0
let cragId = 0
let blockId = 0

/** The mentions the description carries. `!users:id!` is what the editor stores. */
let mention = ''
let secondMention = ''

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({
    maintainer: 'maintainer@grnyte.rocks',
    member: 'user@grnyte.rocks',
    // A second mentionable person, so the update case can add a name rather than only repeat one.
    second: 'anon@grnyte.rocks',
  })
  maintainer = users.maintainer
  member = users.member
  second = users.second
  mention = `!users:${member.userId}!`
  secondMention = `!users:${second.userId}!`

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${maintainer.userId})
    returning id`
  regionId = region.id

  // Both of them in the region: `notificationRecipients` only writes for members who can read it,
  // so a mentioned non-member would make the assertion below pass for the wrong reason.
  for (const [user, role] of [
    [maintainer, 'region_maintainer'],
    [member, 'region_user'],
    [second, 'region_user'],
  ] as const) {
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${regionId}, ${user.userId}, ${user.authId}, ${role}, true)
      on conflict do nothing`
  }

  const [crag] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__blocks_remote_crag__', 'crag', ${regionId}, ${maintainer.userId})
    returning id`
  cragId = crag.id
})

afterAll(async () => {
  if (reachable) {
    // Order is the FK graph: notifications and events point at the block and the region, blocks
    // point at the area, and everything points at the region.
    await sql`delete from public.notifications where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/**
 * A form handler signals success by THROWING a 303 redirect (`authedForm` turns a `redirectTo` into
 * `redirect()`), so the interesting assertion is always the database afterwards, never the return
 * value. Anything that is not a redirect is a real failure and is rethrown.
 */
async function submit(action: typeof createBlock | typeof updateBlock, data: Record<string, unknown>): Promise<void> {
  try {
    await asRequest(maintainer.authId, () => callForm(action, data))
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status !== 303) throw error
  }
}

const storedDescription = async () =>
  (await sql<{ description: null | string }[]>`select description from public.blocks where id = ${blockId}`).at(0)
    ?.description

const mentionRows = () =>
  sql<{ blockFk: null | number; userFk: null | number }[]>`
    select block_fk as "blockFk", user_fk as "userFk"
    from public.notifications
    where region_fk = ${regionId} and source_type = 'mention'`

describe.skipIf(!reachable)('block descriptions', () => {
  it('stores the description a create submits, and tells the person it mentions', async () => {
    // Strings, because `blockActionSchema` builds on `stringToInt`, a codec over `z.string()`:
    // this is the shape a real `<form>` submits.
    await submit(createBlock, {
      areaId: String(cragId),
      description: `Flat landing, out of the sun by three. Ask ${mention}.`,
      name: BLOCK,
    })

    const [row] = await sql<{ description: null | string; id: number }[]>`
      select id, description from public.blocks where name = ${BLOCK}`
    blockId = row.id

    expect(row.description).toBe(`Flat landing, out of the sun by three. Ask ${mention}.`)
    expect(await mentionRows()).toEqual([{ blockFk: blockId, userFk: member.userId }])
  })

  it('notifies only the mention a save ADDS, not the one the description already had', async () => {
    // Two things at once, deliberately. A save carrying the old mention plus a new one must write a
    // row for the new person and none for the old: asserting an empty set instead would pass with
    // the whole `notifyMentions` call deleted, which is the opposite of what this is guarding.
    //
    // The create's row is dropped first because the unique index would collapse a second write to
    // the same person anyway, and that would hide a missing `previousBody` rather than expose it.
    await sql`delete from public.notifications where region_fk = ${regionId}`

    await submit(updateBlock, {
      areaId: String(cragId),
      description: `Flat landing, out of the sun by three. Ask ${mention} or ${secondMention}.`,
      id: String(blockId),
      name: BLOCK,
    })

    expect(await mentionRows()).toEqual([{ blockFk: blockId, userFk: second.userId }])
  })

  it('stores a cleared description as NULL, not as an empty string', async () => {
    await submit(updateBlock, { areaId: String(cragId), description: '', id: String(blockId), name: BLOCK })

    expect(await storedDescription()).toBeNull()
  })
})
