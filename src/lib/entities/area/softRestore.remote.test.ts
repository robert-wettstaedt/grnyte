/**
 * `restoreArea` and `restoreBlock` on the soft path, driven for real, with two regions deleted at
 * the same instant.
 *
 * Both helpers used to key their UPDATEs on nothing but `deletedAt = <timestamp>`, and the
 * timestamp arrived from the client: `deleteArea` and `deleteBlock` returned it in the snapshot the
 * Undo snackbar posts back. `deleted_at` is not unique and carries no region, so the WHERE clause
 * described a moment in time rather than a subtree. Two regions stamped in the same millisecond
 * came back together, and `softRestoreBlock`'s routes statement did not join its block at all, so
 * it could revive routes whose block stayed deleted.
 *
 * The collision is arranged, not raced for. Both deletes run through the real handler, then a
 * superuser UPDATE puts the two subtrees on one shared timestamp. That is exactly the
 * sub-millisecond collision `softDeleteArea`'s ponytail note names as its ceiling, and it is the
 * only condition under which the old statements misbehave; racing two `new Date()` calls for it
 * would pass or fail on where the clock happened to land.
 *
 * The actor is a `region_admin` in BOTH regions, so this is not a hole RLS would have closed by
 * accident: the areas/blocks/routes UPDATE policies are `authorize_in_region('region.edit')`, which
 * a member of both satisfies. It is a throwaway account rather than a seed login because the buggy
 * statement reaches every region the caller can write, and a shared login is a member of whatever
 * other suites are running beside this one.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteBlock, restoreBlock } from '../block/blocks.remote'
import { deleteArea, restoreArea } from './areas.remote'

/** One region holding one area -> crag -> block -> route chain: the smallest fixture that takes the
 *  soft path (a subtree with descendants) and still has a row in every table a restore writes. */
interface Tree {
  areaId: number
  blockId: number
  cragId: number
  regionId: number
  routeId: number
}

/** Every marker cleared. Named, because both suites assert it and the shape is the whole point. */
const LIVE = { area: false, block: false, crag: false, route: false }

const trees: Tree[] = []

let actor: SeedUser
let areaHome: Tree
let areaOther: Tree
let blockHome: Tree
let blockOther: Tree

async function createTree(label: string): Promise<Tree> {
  const name = `__soft_restore_${label}__`

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${name}, ${actor.userId}) returning id`

  // region_admin, not maintainer: `canDeleteArea` and `canDeleteBlock` want `region.delete`, and
  // the seeded permission matrix grants that to region_admin alone.
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${region.id}, ${actor.userId}, ${actor.authId}, 'region_admin', true)`

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values (${`${name}_area`}, 'area', ${region.id}, ${actor.userId}) returning id`
  const [crag] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${`${name}_crag`}, 'crag', ${area.id}, ${region.id}, ${actor.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values (${`${name}_block`}, 0, ${crag.id}, ${region.id}, ${actor.userId}) returning id`
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values (${`${name}_route`}, ${block.id}, ${region.id}, ${actor.userId}) returning id`

  const tree = { areaId: area.id, blockId: block.id, cragId: crag.id, regionId: region.id, routeId: route.id }
  trees.push(tree)

  return tree
}

/** The soft-delete marker at each level of one tree, as one shape. Compared whole, so a partial
 *  restore (the block back but its routes left behind, or the reverse) fails loudly instead of
 *  slipping past an assertion that only looked at the row it expected to move. */
async function markers(tree: Tree): Promise<Record<'area' | 'block' | 'crag' | 'route', boolean>> {
  const [row] = await sql<Record<'area' | 'block' | 'crag' | 'route', boolean>[]>`
    select
      (select deleted_at is not null from public.areas where id = ${tree.areaId}) as "area",
      (select deleted_at is not null from public.areas where id = ${tree.cragId}) as "crag",
      (select deleted_at is not null from public.blocks where id = ${tree.blockId}) as "block",
      (select deleted_at is not null from public.routes where id = ${tree.routeId}) as "route"`

  return row
}

/** Put two just-deleted subtrees on one `deleted_at`. Superuser and deliberate: see the file
 *  header. The old WHERE only misbehaves when the two timestamps are equal to the microsecond. */
async function shareDeletionTimestamp(first: Tree, second: Tree): Promise<void> {
  const stamp = new Date()

  for (const { regionId } of [first, second]) {
    await sql`update public.areas set deleted_at = ${stamp} where region_fk = ${regionId} and deleted_at is not null`
    await sql`update public.blocks set deleted_at = ${stamp} where region_fk = ${regionId} and deleted_at is not null`
    await sql`update public.routes set deleted_at = ${stamp} where region_fk = ${regionId} and deleted_at is not null`
  }
}

beforeAll(async () => {
  if (!reachable) return

  actor = await createThrowawayUser('soft_restore')

  // Four trees, not two: the area case soft-deletes its whole subtree, so the block case needs
  // blocks that are still standing by the time it runs.
  areaHome = await createTree('area_home')
  areaOther = await createTree('area_other')
  blockHome = await createTree('block_home')
  blockOther = await createTree('block_other')
})

afterAll(async () => {
  if (reachable) {
    for (const tree of trees) {
      // `events` first: every delete logs one and it carries a region FK, so the region delete
      // below raises 23503 otherwise. Its `changes` and `reactions` cascade off it.
      await sql`delete from public.events where region_fk = ${tree.regionId}`
      await sql`delete from public.routes where region_fk = ${tree.regionId}`
      await sql`delete from public.blocks where region_fk = ${tree.regionId}`
      // The crag before its parent: `areas.parent_fk` points at another row in this same set.
      await sql`delete from public.areas where id = ${tree.cragId}`
      await sql`delete from public.areas where id = ${tree.areaId}`
      await sql`delete from public.region_members where region_fk = ${tree.regionId}`
      await sql`delete from public.regions where id = ${tree.regionId}`
    }

    if (actor != null) {
      await dropThrowawayUser(actor)
    }
  }

  await sql.end()
})

describe.skipIf(!reachable)('softRestoreArea', () => {
  it('restores its own subtree and leaves an identically stamped one deleted', async () => {
    const deleted = await asRequest(actor.authId, () => deleteArea({ id: areaHome.areaId }))
    await asRequest(actor.authId, () => deleteArea({ id: areaOther.areaId }))

    // The snapshot the Undo snackbar posts back, and there is no `deletedAt` on it: the restore
    // reads the timestamp off the stored row, so there is nothing here to point somewhere else.
    expect(deleted?.data).toEqual({ areaId: areaHome.areaId, mode: 'soft' })

    await shareDeletionTimestamp(areaHome, areaOther)
    await asRequest(actor.authId, () => restoreArea({ areaId: areaHome.areaId, mode: 'soft' }))

    // Every level of the named subtree is back, so the scoping did not cost the restore anything.
    expect(await markers(areaHome)).toEqual(LIVE)
    // Same timestamp, different region, never named by the call. This is the assertion that fails
    // against the old helper: the three UPDATEs matched the instant and nothing else.
    expect(await markers(areaOther)).toEqual({ area: true, block: true, crag: true, route: true })
  })
})

describe.skipIf(!reachable)('softRestoreBlock', () => {
  it('restores its own block and leaves an identically stamped one deleted', async () => {
    const deleted = await asRequest(actor.authId, () => deleteBlock({ id: blockHome.blockId }))
    await asRequest(actor.authId, () => deleteBlock({ id: blockOther.blockId }))

    expect(deleted?.data).toEqual({ blockId: blockHome.blockId, mode: 'soft' })

    await shareDeletionTimestamp(blockHome, blockOther)
    await asRequest(actor.authId, () => restoreBlock({ blockId: blockHome.blockId, mode: 'soft' }))

    expect(await markers(blockHome)).toEqual(LIVE)
    // Both still deleted, and each for its own reason: the blocks statement matched the timestamp
    // alone, and the routes statement named no block at all, so it could revive these routes under
    // a block that stayed gone. Their areas were never deleted, hence false at those two levels.
    expect(await markers(blockOther)).toEqual({ area: false, block: true, crag: false, route: true })
  })
})
