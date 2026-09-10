/**
 * `reorderBlocks` driven through the real handler, as a real maintainer.
 *
 * The branch worth covering is the one no screen can produce on demand: a submit that names only
 * some of an area's blocks. Zero reports a query ready on a partial snapshot, and the drop zone
 * hands back a working copy of its own, so the reorder screen posts a subset in good faith.
 * Numbering only what was sent left the rest on their old slots and `order` is not uniquely
 * constrained, so the area came back with duplicates; numbering the sent ones first instead
 * reordered blocks the reader never saw. Both fail silently, in the database, for everyone.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reorderBlocks } from './blocks.remote'

const REGION = '__blocks_reorder_region__'

let maintainer: SeedUser
let regionId = 0
let areaId = 0
/** A block in a different area of the same region, for the "not this area" rejection. */
let foreignBlockId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${maintainer.userId})
    returning id`
  regionId = region.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)
    on conflict do nothing`

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__blocks_reorder_crag__', 'crag', ${regionId}, ${maintainer.userId})
    returning id`
  areaId = area.id

  // A second area in the same region, holding the block the foreign-id case submits. Seeded here
  // rather than looked up: `where area_fk <> ...` picks up whatever a shared dev database happens
  // to hold, and nothing at all on a freshly seeded CI one.
  const [other] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__blocks_reorder_other__', 'crag', ${regionId}, ${maintainer.userId})
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('outsider', ${other.id}, ${regionId}, ${maintainer.userId}, 0)
    returning id`
  foreignBlockId = block.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/**
 * Replaces the area's blocks with four rows at the given `order` values, ids ascending in the order
 * `names` lists them.
 *
 * `names` matters: with A, B, C, D the alphabet and the ids run the same way, so a rule that breaks
 * a duplicate slot on `name` and one that breaks it on `id` produce identical output and the two
 * tests at the bottom of this file pass either way. Pass them descending to tell the two apart.
 */
async function seedBlocks(orders = [0, 1, 2, 3], names = ['A', 'B', 'C', 'D']): Promise<Record<string, number>> {
  await sql`delete from public.blocks where area_fk = ${areaId}`
  const ids: Record<string, number> = {}
  for (const [index, name] of names.entries()) {
    const [row] = await sql<{ id: number }[]>`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order")
      values (${name}, ${areaId}, ${regionId}, ${maintainer.userId}, ${orders[index]})
      returning id`
    ids[name] = row.id
  }
  return ids
}

/** The area's blocks as stored, top to bottom. */
async function storedNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    select name from public.blocks
    where area_fk = ${areaId} and deleted_at is null
    order by "order", id`
  return rows.map((row) => row.name)
}

/** Every `order` in the area, ascending. A correct run is always 0..n-1 with no repeats. */
async function storedOrders(): Promise<number[]> {
  const rows = await sql<{ order: number }[]>`
    select "order" from public.blocks
    where area_fk = ${areaId} and deleted_at is null
    order by "order"`
  return rows.map((row) => row.order)
}

const reorder = (orderedIds: number[]) => asRequest(maintainer.authId, () => reorderBlocks({ areaId, orderedIds }))

describe.skipIf(!reachable)('reorderBlocks', () => {
  it('writes the submitted sequence and leaves the area contiguous', async () => {
    const ids = await seedBlocks()

    await reorder([ids.D, ids.C, ids.B, ids.A])

    expect(await storedNames()).toEqual(['D', 'C', 'B', 'A'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })

  it('leaves a block the submit never named on the slot it had', async () => {
    const ids = await seedBlocks()

    // Only B and C were synced, and the reader swapped them. A and D are not in the payload at
    // all, and must not move: numbering the submitted ids first wrote C, B, A, D instead, so a
    // Save with no edit at all silently pushed A from first to third.
    await reorder([ids.C, ids.B])

    expect(await storedNames()).toEqual(['A', 'C', 'B', 'D'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })

  it('ignores duplicates and ids from outside the area', async () => {
    const ids = await seedBlocks()

    // D twice, a real block from another area, and A. What survives is [D, A], which fills the
    // slots A and D already held: first and last.
    await reorder([ids.D, ids.D, foreignBlockId, ids.A])

    expect(await storedNames()).toEqual(['D', 'B', 'C', 'A'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })

  it('repairs duplicate orders in a fixed sequence', async () => {
    // The input this repair actually runs on: an area an older partial save left with two blocks
    // on the same slot. Without `id` breaking the tie the read order is the plan's to choose, so
    // the same rows could renumber one way now and the other way on the next save.
    const ids = await seedBlocks([1, 1, 2, 3])

    await reorder([])

    expect(await storedNames()).toEqual(['A', 'B', 'C', 'D'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
    expect(ids.A).toBeLessThan(ids.B)
  })

  it('breaks a duplicate slot on id, so the repair matches the list the reader was shown', async () => {
    // Names descending against ascending ids, which is what the other fixtures cannot express:
    // D and C share slot 0, and the two candidate tie-breaks disagree about which of them is
    // first. `id` says D (it was inserted first), `name` says C. The client read spelled `name`
    // here until this commit, so the screen and this handler answered differently on exactly the
    // input the repair advertises.
    await seedBlocks([0, 0, 1, 2], ['D', 'C', 'B', 'A'])

    await reorder([])

    expect(await storedNames()).toEqual(['D', 'C', 'B', 'A'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })

  it('leaves the arrangement alone when the reader saves without editing', async () => {
    // Idempotence on a duplicate slot, which no other case here covers: the reader opens the
    // screen, touches nothing, and submits the whole list in the order they were shown. The
    // duplicate collapses to 0..n-1 and nothing changes places.
    //
    // Deliberately cannot discriminate the tie-break, and that is the point of writing it down.
    // `renumbered` fills the submitted slots with `queue` in submitted order, so when EVERY block
    // is submitted the result is the submitted order whatever the enumeration was. Changing the
    // server clause leaves this green. It is the executable form of why a reader can never lose
    // their own arrangement to the ordering rule, which is the question this file keeps inviting.
    const ids = await seedBlocks([0, 0, 1, 2], ['D', 'C', 'B', 'A'])

    await reorder([ids.D, ids.C, ids.B, ids.A])

    expect(await storedNames()).toEqual(['D', 'C', 'B', 'A'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })

  it('drops a block the submit never named into its id-order slot, not its name-order one', async () => {
    // The two failures compounded: a partial submit leaves unnamed blocks on their slots, and
    // which slots those are is the tie-break's answer. Under `name` the pair the reader swapped
    // lands one row higher and D and C come back swapped with it.
    const ids = await seedBlocks([0, 0, 1, 2], ['D', 'C', 'B', 'A'])

    await reorder([ids.A, ids.B])

    expect(await storedNames()).toEqual(['D', 'C', 'A', 'B'])
    expect(await storedOrders()).toEqual([0, 1, 2, 3])
  })
})
