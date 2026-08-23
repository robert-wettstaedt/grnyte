/**
 * A topo may only ever point at its own block's image.
 *
 * The hole these close: `canEditTopo` authorized the BLOCK, and `fileId` was a second client value
 * nothing looked at. So a member holding region edit could point a topo at any file id they could
 * read, and `deleteTopo` then destroyed that file's row and its bytes. `canDeleteFile` (region
 * delete, or ownership of the ascent) was never consulted, which is exactly the rule that says a
 * maintainer must not remove another climber's ascent media.
 *
 * It was masked rather than prevented: the `files` DELETE policy happens to also be region edit, so
 * the database agreed. That coincidence ends when RLS is reduced to region scoping, and it never
 * covered the cross-region case at all.
 *
 * The fixture is one region, one block, and a file attached to an ASCENT rather than to the block,
 * which is the realistic victim: somebody's photo, in a region the attacker legitimately edits.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTopo, replaceTopoImage } from './topos.remote'

const REGION = '__topos_remote__'

let maintainer: SeedUser
let victim: SeedUser
let regionId = 0
let blockId = 0
let ownFileId = ''
let victimFileId = ''

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer
  victim = await createThrowawayUser('topo-victim')

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${maintainer.userId}) returning id`
  regionId = region.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__topos_area__', 'crag', ${regionId}, ${maintainer.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__topos_block__', ${area.id}, ${regionId}, ${maintainer.userId}, 0) returning id`
  blockId = block.id

  // The legitimate one: a block image, which is what a topo is made from.
  const [own] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, created_by, block_fk)
    values (gen_random_uuid()::text, '/topos/own.jpg', ${regionId}, ${maintainer.userId}, ${blockId})
    returning id`
  ownFileId = own.id

  // The victim's: attached to an ascent, so `canDeleteFile` would refuse the maintainer outright.
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__topos_route__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`
  const [ascent] = await sql<{ id: number }[]>`
    insert into public.ascents (region_fk, route_fk, created_by, date_time, type)
    values (${regionId}, ${route.id}, ${victim.userId}, '2026-08-01', 'flash') returning id`
  const [victimFile] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, created_by, ascent_fk)
    values (gen_random_uuid()::text, '/ascents/victim.jpg', ${regionId}, ${victim.userId}, ${ascent.id})
    returning id`
  victimFileId = victimFile.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.topo_routes where region_fk = ${regionId}`
    await sql`delete from public.topos where region_fk = ${regionId}`
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.ascents where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
    await dropThrowawayUser(victim)
  }
  await sql.end()
})

/**
 * A topo on the block's own image, built through the handler, for the test that is about to use it.
 *
 * Per test rather than leaned on from the create case: `topoId` used to be a module variable that
 * the first test assigned and the three below it read, so each of those only passed while vitest
 * ran them in declaration order. `vitest --sequence.shuffle` failed all three, against an id of 0
 * that no row has, and the message ("expected 404 to be 409") said nothing about the real cause.
 */
async function freshTopo(): Promise<number> {
  const result = await asRequest(maintainer.authId, () => createTopo({ blockId, fileId: ownFileId }))
  return result!.data!.id
}

/** The status of a refusal, or undefined when the call went through. */
async function statusOf(run: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await run()
    return undefined
  } catch (error) {
    return (error as { status?: number })?.status
  }
}

describe.skipIf(!reachable)('topo images', () => {
  // Each case starts from no topos at all, so none of them inherits what another one built.
  beforeEach(async () => {
    if (!reachable) return
    await sql`delete from public.topo_routes where region_fk = ${regionId}`
    await sql`delete from public.topos where region_fk = ${regionId}`
  })

  it('creates a topo from the block s own image', async () => {
    const result = await asRequest(maintainer.authId, () => createTopo({ blockId, fileId: ownFileId }))

    expect(result?.data?.fileFk).toBe(ownFileId)
  })

  it('refuses to create a topo pointing at a file that is not the block s', async () => {
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () => createTopo({ blockId, fileId: victimFileId })),
    )

    expect(status).toBe(404)

    const rows = await sql`select id from public.files where id = ${victimFileId}`
    expect(rows).toHaveLength(1)
  })

  it('refuses to swap a topo onto a file that is not its block s', async () => {
    const topoId = await freshTopo()

    // The shorter route to the same end: point the topo at the victim's file, then delete the topo
    // and its bytes go with it.
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () => replaceTopoImage({ fileId: victimFileId, topoId })),
    )

    expect(status).toBe(404)

    const [topo] = await sql<{ fileFk: string }[]>`
      select file_fk as "fileFk" from public.topos where id = ${topoId}`
    expect(topo.fileFk).toBe(ownFileId)

    const rows = await sql`select id from public.files where id = ${victimFileId}`
    expect(rows).toHaveLength(1)
  })

  it('refuses to swap a topo onto an image another topo on the same block already holds', async () => {
    const topoId = await freshTopo()

    // Same block, so the block test passes and the old guard let this through. What follows the
    // swap is a hard delete of the image being let go of, which leaves two topos on one `files` row
    // and the next delete raising 23503 against a NO ACTION foreign key.
    const [second] = await sql<{ id: string }[]>`
      insert into public.files (id, path, region_fk, created_by, block_fk)
      values (gen_random_uuid()::text, '/topos/second.jpg', ${regionId}, ${maintainer.userId}, ${blockId})
      returning id`
    const sibling = await asRequest(maintainer.authId, () => createTopo({ blockId, fileId: second.id }))

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () => replaceTopoImage({ fileId: second.id, topoId })),
    )

    expect(status).toBe(409)

    const [topo] = await sql<{ fileFk: string }[]>`
      select file_fk as "fileFk" from public.topos where id = ${topoId}`
    expect(topo.fileFk).toBe(ownFileId)

    const [held] = await sql<{ fileFk: string }[]>`
      select file_fk as "fileFk" from public.topos where id = ${sibling!.data!.id}`
    expect(held.fileFk).toBe(second.id)
  })

  it('leaves a topo alone when the swap names the image it already has', async () => {
    const topoId = await freshTopo()

    // The degenerate call: the update is a no-op against the same id, and the delete that used to
    // follow it destroyed the image the topo still points at.
    const result = await asRequest(maintainer.authId, () => replaceTopoImage({ fileId: ownFileId, topoId }))

    expect(result?.data?.id).toBe(topoId)

    const [topo] = await sql<{ fileFk: string }[]>`
      select file_fk as "fileFk" from public.topos where id = ${topoId}`
    expect(topo.fileFk).toBe(ownFileId)

    const rows = await sql`select id from public.files where id = ${ownFileId}`
    expect(rows).toHaveLength(1)
  })
})
