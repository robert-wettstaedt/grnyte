/**
 * Handlers that used to act on a soft-deleted row: deletes counting only LIVE children that hold a
 * foreign key, creates and restores that never ask whether the parent is still there.
 *
 * Each needs a SECOND row, deleted first, to be what the handler fails to see. Fixtures are raw
 * inserts so the setup does not depend on the decision under test. Skipped without DATABASE_URL.
 */
import { enrichMarkdown } from '$lib/components/Markdown/lib/enrich.server'
import { REFERENCE_TOMBSTONE } from '$lib/components/Markdown/lib/remark-references'
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { hasDeletedAncestor } from '$lib/entities/area/area.server'
import { addParking, createArea, deleteParking, restoreArea, restoreParking } from '$lib/entities/area/areas.remote'
import { createAscent } from '$lib/entities/ascent/ascents.remote'
import { createBlock, reorderBlocks, restoreBlock } from '$lib/entities/block/blocks.remote'
import { toggleFavorite } from '$lib/entities/favorite/favorites.remote'
import { restoreComment } from '$lib/entities/reaction/reactions.remote'
import { createRoute, deleteRoute, restoreRoute } from '$lib/entities/route/routes.remote'
import { createTopo } from '$lib/entities/topo/topos.remote'
import { asRequest, callForm, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REGION = '__softdel_region__'

let maintainer: SeedUser
let regionId: number
let parentAreaId: number
let sectorAreaId: number
let blockId: number

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${maintainer.userId}) returning id`
  regionId = region.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_admin', true)`

  const [parent] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__softdel_parent__', 'area', ${regionId}, ${maintainer.userId}) returning id`
  parentAreaId = parent.id

  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by, parent_fk)
    values ('__softdel_sector__', 'sector', ${regionId}, ${maintainer.userId}, ${parentAreaId}) returning id`
  sectorAreaId = sector.id

  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__softdel_block__', ${sectorAreaId}, ${regionId}, ${maintainer.userId}, 0) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.reactions where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
    await sql`delete from public.geolocations where region_fk = ${regionId}`
    await sql`delete from public.topos where region_fk = ${regionId}`
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.favorites where route_fk in (select id from public.routes where region_fk = ${regionId})`
    await sql`delete from public.ascents where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('a delete counts the children it cannot see', () => {
  it('soft-deletes a route a tombstoned ascent still points at', async () => {
    // Fresh, so the hard path is genuinely on the table.
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__softdel_climbed__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`

    // Cleared, so a `deleted_at is null` probe misses it while the foreign key still refuses.
    await sql`
      insert into public.ascents (route_fk, region_fk, created_by, date_time, type, deleted_at)
      values (${route.id}, ${regionId}, ${maintainer.userId}, now(), 'redpoint', now())`

    const deleted = await asRequest(maintainer.authId, () => deleteRoute({ id: route.id }))

    expect(deleted?.data?.mode, 'a route a tombstoned ascent references cannot be erased').toBe('soft')

    const [row] = await sql<{ deleted_at: null | string }[]>`
      select deleted_at from public.routes where id = ${route.id}`
    expect(row?.deleted_at, 'the route should still be there, stamped').not.toBeNull()
  })

  it('still hard-deletes a route nothing points at', async () => {
    // The other half, so the fix cannot pass by soft-deleting everything.
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__softdel_bare__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`

    const deleted = await asRequest(maintainer.authId, () => deleteRoute({ id: route.id }))

    expect(deleted?.data?.mode, 'a fresh unclimbed route should still hard delete').toBe('hard')
  })
})

describe.skipIf(!reachable)('a restore refuses to strand the row', () => {
  it('will not put a route back under a cleared block', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, deleted_at)
      values ('__softdel_orphan_route__', ${blockId}, ${regionId}, ${maintainer.userId}, now()) returning id`

    await sql`update public.blocks set deleted_at = now() where id = ${blockId}`

    // Reset in `finally`: a failure here would otherwise leave the block cleared and make the next
    // test pass for the wrong reason.
    try {
      const status = await statusOf(() =>
        asRequest(maintainer.authId, () => restoreRoute({ mode: 'soft', routeId: route.id })),
      )

      expect(status, 'restoring under a cleared block should be refused').toBe(404)

      const [row] = await sql<{ deleted_at: null | string }[]>`
        select deleted_at from public.routes where id = ${route.id}`
      expect(row?.deleted_at, 'the route must stay cleared rather than come back unreachable').not.toBeNull()
    } finally {
      await sql`update public.blocks set deleted_at = null where id = ${blockId}`
    }
  })

  it('will not put a block back under a cleared sector', async () => {
    const [block] = await sql<{ id: number }[]>`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order", deleted_at)
      values ('__softdel_orphan_block__', ${sectorAreaId}, ${regionId}, ${maintainer.userId}, 1, now()) returning id`

    await sql`update public.areas set deleted_at = now() where id = ${sectorAreaId}`

    try {
      const status = await statusOf(() =>
        asRequest(maintainer.authId, () => restoreBlock({ blockId: block.id, mode: 'soft' })),
      )

      expect(status, 'restoring under a cleared sector should be refused').toBe(404)
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${sectorAreaId}`
    }
  })

  it('will not put an area back under a cleared parent, however far up it is', async () => {
    // Two levels, so this fails if the check only looks at the immediate parent.
    const [child] = await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by, parent_fk, deleted_at)
      values ('__softdel_orphan_area__', 'sector', ${regionId}, ${maintainer.userId}, ${sectorAreaId}, now())
      returning id`

    await sql`update public.areas set deleted_at = now() where id = ${parentAreaId}`

    try {
      const status = await statusOf(() =>
        asRequest(maintainer.authId, () => restoreArea({ areaId: child.id, mode: 'soft' })),
      )

      expect(status, 'a cleared GRANDparent should refuse the restore too').toBe(404)
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${parentAreaId}`
    }
  })

  it('still restores a route whose block is live', async () => {
    // The control: the guard must not refuse an ordinary undo.
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, deleted_at)
      values ('__softdel_ok_route__', ${blockId}, ${regionId}, ${maintainer.userId}, now()) returning id`

    await asRequest(maintainer.authId, () => restoreRoute({ mode: 'soft', routeId: route.id }))

    const [row] = await sql<{ deleted_at: null | string }[]>`
      select deleted_at from public.routes where id = ${route.id}`
    expect(row?.deleted_at, 'an ordinary undo must still work').toBeNull()
  })
})

describe.skipIf(!reachable)('a reply cannot come back under a cleared head', () => {
  /** An event with a head comment and one reply under it, both live. */
  async function thread(): Promise<{ eventId: number; headId: number; replyId: number }> {
    const [event] = await sql<{ id: number }[]>`
      insert into public.events (region_fk, actor_fk, verb, comment_count, block_fk)
      values (${regionId}, ${maintainer.userId}, 'create', 2, ${blockId}) returning id`

    const [head] = await sql<{ id: number }[]>`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
      values (${regionId}, ${maintainer.authId}, ${maintainer.userId}, ${event.id}, 'comment', '__softdel_head__')
      returning id`

    const [reply] = await sql<{ id: number }[]>`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body, parent_fk)
      values (${regionId}, ${maintainer.authId}, ${maintainer.userId}, ${event.id}, 'comment', '__softdel_reply__', ${head.id})
      returning id`

    return { eventId: event.id, headId: head.id, replyId: reply.id }
  }

  it('refuses the reply while its head is cleared, and leaves the count alone', async () => {
    const { eventId, headId, replyId } = await thread()

    // Reply first: `dropComment`'s cascade skips it, so its own undo is the only way back.
    await sql`update public.reactions set deleted_at = now() where id = ${replyId}`
    await sql`update public.reactions set deleted_at = now() where id = ${headId}`

    const [before] = await sql<{ comment_count: number }[]>`
      select comment_count from public.events where id = ${eventId}`

    const status = await statusOf(() => asRequest(maintainer.authId, () => restoreComment({ commentId: replyId })))

    expect(status, 'a reply under a cleared head should be refused').toBe(404)

    const [row] = await sql<{ deleted_at: null | string }[]>`
      select deleted_at from public.reactions where id = ${replyId}`
    expect(row?.deleted_at, 'the reply must stay cleared').not.toBeNull()

    // Nothing recomputes `events.comment_count`, so a stranded restore leaves it high forever.
    const [after] = await sql<{ comment_count: number }[]>`
      select comment_count from public.events where id = ${eventId}`
    expect(after.comment_count, 'the count must not move').toBe(before.comment_count)
  })

  it('still restores a reply whose head is live', async () => {
    const { replyId } = await thread()

    await sql`update public.reactions set deleted_at = now() where id = ${replyId}`

    await asRequest(maintainer.authId, () => restoreComment({ commentId: replyId }))

    const [row] = await sql<{ deleted_at: null | string }[]>`
      select deleted_at from public.reactions where id = ${replyId}`
    expect(row?.deleted_at, 'an ordinary reply undo must still work').toBeNull()
  })
})

describe.skipIf(!reachable)('a create refuses a cleared parent', () => {
  // The other door onto the same state: guarding restores is pointless if a create gets there.
  it('will not add a route to a cleared block', async () => {
    await sql`update public.blocks set deleted_at = now() where id = ${blockId}`

    try {
      // The key, not merely a refusal: a row count alone passes on any rejected payload.
      const result = await asRequest(maintainer.authId, () => callForm(createRoute, { blockId: String(blockId), name: '__softdel_created_route__' }))

      expect(result).toMatchObject({ issues: [{ message: JSON.stringify({ message: 'blocks_notFound' }) }] })

      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.routes where name = '__softdel_created_route__'`
      expect(row.count, 'no route should exist under a cleared block').toBe(0)
    } finally {
      await sql`update public.blocks set deleted_at = null where id = ${blockId}`
    }
  })

  it('will not add a block to a cleared sector', async () => {
    await sql`update public.areas set deleted_at = now() where id = ${sectorAreaId}`

    try {
      const result = await asRequest(maintainer.authId, () => callForm(createBlock, { areaId: String(sectorAreaId), name: '__softdel_created_block__' }))

      expect(result).toMatchObject({ issues: [{ message: JSON.stringify({ message: 'areas_parentNotFound' }) }] })

      const [row] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.blocks where name = '__softdel_created_block__'`
      expect(row.count, 'no block should exist under a cleared sector').toBe(0)
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${sectorAreaId}`
    }
  })

  it('still adds a route to a live block', async () => {
    await asRequest(maintainer.authId, () => callForm(createRoute, { blockId: String(blockId), name: '__softdel_ok_created__' }))

    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.routes where name = '__softdel_ok_created__'`
    expect(row.count, 'an ordinary create must still work').toBe(1)
  })
})

describe.skipIf(!reachable)('the ancestor walk fails closed', () => {
  // A guard that answers "no" when it cannot answer is worse than none. Pin all three exits.
  it('reports a live chain as fine', async () => {
    expect(await hasDeletedAncestor(db, sectorAreaId)).toBe(false)
  })

  it('reports a parent that does not exist', async () => {
    // `areaAncestry` records an id before looking it up, so an absent row shortens the count.
    const [orphan] = await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by)
      values ('__softdel_orphan_parent__', 'area', ${regionId}, ${maintainer.userId}) returning id`

    expect(await hasDeletedAncestor(db, orphan.id + 9_000_000)).toBe(true)
  })

  it('reports a cycle, where nothing is deleted but no root is reachable', async () => {
    const [a] = await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by)
      values ('__softdel_cycle_a__', 'area', ${regionId}, ${maintainer.userId}) returning id`
    const [b] = await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by, parent_fk)
      values ('__softdel_cycle_b__', 'area', ${regionId}, ${maintainer.userId}, ${a.id}) returning id`
    await sql`update public.areas set parent_fk = ${b.id} where id = ${a.id}`

    try {
      expect(await hasDeletedAncestor(db, a.id), 'a loop reaches no root, so it strands').toBe(true)
    } finally {
      // Unlink first: parent_fk has no ON DELETE action, so the cycle blocks its own cleanup.
      await sql`update public.areas set parent_fk = null where id in (${a.id}, ${b.id})`
    }
  })
})

describe.skipIf(!reachable)('the write gates refuse a cleared subject', () => {
  it('will not add a topo to a cleared block', async () => {
    // The seed this whole audit started from. A REAL file on the block, so the block gate is the
    // only thing that can refuse: a missing fileId 404s on its own and hides the gate entirely.
    const fileId = '__softdel_topo_file__'
    await sql`
      insert into public.files (id, region_fk, path, block_fk, created_by)
      values (${fileId}, ${regionId}, '/topos/145.jpg', ${blockId}, ${maintainer.userId})`
    await sql`update public.blocks set deleted_at = now() where id = ${blockId}`

    try {
      const status = await statusOf(() => asRequest(maintainer.authId, () => createTopo({ blockId, fileId })))
      expect(status, 'a cleared block must not take a new topo').toBe(404)

      const [made] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.topos where block_fk = ${blockId}`
      expect(made.count, 'and no topo row should exist').toBe(0)
    } finally {
      await sql`update public.blocks set deleted_at = null where id = ${blockId}`
    }

    // Live control: the same call on a live block must succeed, or the refusal above proves nothing.
    await asRequest(maintainer.authId, () => createTopo({ blockId, fileId }))
    const [live] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.topos where block_fk = ${blockId}`
    expect(live.count, 'the same call must work on a live block').toBe(1)
  })

  it('will not log an ascent on a cleared route', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, deleted_at)
      values ('__softdel_gone_route__', ${blockId}, ${regionId}, ${maintainer.userId}, now()) returning id`

    const result = await asRequest(maintainer.authId, () =>
      callForm(createAscent, { dateTime: '2026-09-13', routeId: String(route.id), type: 'redpoint' }),
    )

    expect(result).toMatchObject({ issues: [{ message: JSON.stringify({ message: 'routes_notFound' }) }] })

    const [logged] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.ascents where route_fk = ${route.id}`
    expect(logged.count, 'and nothing should have been logged').toBe(0)
  })

  it('refuses a second delete of the same route', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__softdel_twice__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`
    await sql`insert into public.ascents (route_fk, region_fk, created_by, date_time, type)
      values (${route.id}, ${regionId}, ${maintainer.userId}, now(), 'redpoint')`

    await asRequest(maintainer.authId, () => deleteRoute({ id: route.id }))
    const status = await statusOf(() => asRequest(maintainer.authId, () => deleteRoute({ id: route.id })))

    expect(status, 'a replayed delete must not run the cascade twice').toBe(404)
  })

  it('refuses a new favorite on a cleared route but still removes an existing one', async () => {
    // The half that matters: a favorite whose entity died must stay removable, or the reader is
    // stuck with a row they cannot clear.
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__softdel_fav__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`

    await asRequest(maintainer.authId, () => toggleFavorite({ entityId: route.id, entityType: 'route' }))
    await sql`update public.routes set deleted_at = now() where id = ${route.id}`

    await asRequest(maintainer.authId, () => toggleFavorite({ entityId: route.id, entityType: 'route' }))
    const [gone] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.favorites where route_fk = ${route.id}`
    expect(gone.count, 'removing a favorite must survive its entity being cleared').toBe(0)

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () => toggleFavorite({ entityId: route.id, entityType: 'route' })),
    )
    expect(status, 'but adding one back must not').toBe(404)

    const [back] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.favorites where route_fk = ${route.id}`
    expect(back.count, 'and no favorite should have been re-inserted').toBe(0)
  })
})

describe.skipIf(!reachable)('parking refuses as a pair, and says why', () => {
  // All three halves agree, or a delete succeeds while its own Undo cannot.
  it('refuses add, delete and restore on a cleared sector, each as a not-found', async () => {
    const [geo] = await sql<{ id: number }[]>`
      insert into public.geolocations (area_fk, region_fk, lat, long)
      values (${sectorAreaId}, ${regionId}, 50.1, 11.1) returning id`

    await sql`update public.areas set deleted_at = now() where id = ${sectorAreaId}`

    try {
      const added = await asRequest(maintainer.authId, () =>
        callForm(addParking, { areaId: String(sectorAreaId), lat: '50.2', long: '11.2' }),
      )
      expect(added, 'add says gone, not forbidden').toMatchObject({
        issues: [{ message: JSON.stringify({ message: 'areas_notFound' }) }],
      })

      expect(
        await statusOf(() => asRequest(maintainer.authId, () => deleteParking({ id: geo.id }))),
        'delete refuses too, or its Undo is unreachable',
      ).toBe(404)

      expect(
        await statusOf(() =>
          asRequest(maintainer.authId, () => restoreParking({ areaId: sectorAreaId, lat: 50.1, long: 11.1 })),
        ),
        'restore says gone, not forbidden',
      ).toBe(404)
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${sectorAreaId}`
      await sql`delete from public.geolocations where id = ${geo.id}`
    }
  })

  it('still deletes a parking on a live sector', async () => {
    const [geo] = await sql<{ id: number }[]>`
      insert into public.geolocations (area_fk, region_fk, lat, long)
      values (${sectorAreaId}, ${regionId}, 50.3, 11.3) returning id`

    await asRequest(maintainer.authId, () => deleteParking({ id: geo.id }))

    const [left] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.geolocations where id = ${geo.id}`
    expect(left.count, 'the live path must still work').toBe(0)
  })
})

describe.skipIf(!reachable)('reorderBlocks', () => {
  it('refuses a cleared sector', async () => {
    await sql`update public.areas set deleted_at = now() where id = ${sectorAreaId}`

    try {
      const status = await statusOf(() =>
        asRequest(maintainer.authId, () => reorderBlocks({ areaId: sectorAreaId, orderedIds: [blockId] })),
      )
      expect(status).toBe(404)
    } finally {
      await sql`update public.areas set deleted_at = null where id = ${sectorAreaId}`
    }
  })

  it('still reorders a live sector', async () => {
    await asRequest(maintainer.authId, () => reorderBlocks({ areaId: sectorAreaId, orderedIds: [blockId] }))
  })
})

describe.skipIf(!reachable)('a cleared sibling does not reserve its name', () => {
  // The reader cannot see it, so it must not block them. Cost accepted: restoring it afterwards
  // can leave two siblings sharing a name. A successful form submit leaves via a 303 redirect.
  it('lets an area reuse a cleared sibling name, but still refuses a live one', async () => {
    const name = '__softdel_dupe_area__'
    await sql`
      insert into public.areas (name, type, region_fk, created_by, parent_fk, deleted_at)
      values (${name}, 'area', ${regionId}, ${maintainer.userId}, ${parentAreaId}, now())`

    const reused = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        callForm(createArea, { name, parentFk: String(parentAreaId), regionFk: String(regionId) }),
      ),
    )
    expect(reused, 'a cleared sibling must not block the name').toBe(303)

    const [live] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.areas where name = ${name} and deleted_at is null`
    expect(live.count).toBe(1)

    // The control: the check still fires against the LIVE row it just made, so the filter has not
    // simply disabled uniqueness.
    // The payload, not merely "did not redirect": `statusOf` returns `thrown.status`, and a crash
    // has none either, so a bare toBeUndefined() cannot tell a refusal from a handler that died.
    const blocked = await asRequest(maintainer.authId, () =>
      callForm(createArea, { name, parentFk: String(parentAreaId), regionFk: String(regionId) }),
    )
    expect(blocked, 'a live sibling must still block it, by name').toMatchObject({
      issues: [{ message: JSON.stringify({ message: 'areas_nameExists', params: { name } }) }],
    })

    const [total] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.areas where name = ${name} and deleted_at is null`
    expect(total.count, 'and no second live row should exist').toBe(1)
  })

  it('lets a block reuse a cleared sibling name, but still refuses a live one', async () => {
    const name = '__softdel_dupe_block__'
    await sql`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order", deleted_at)
      values (${name}, ${sectorAreaId}, ${regionId}, ${maintainer.userId}, 9, now())`

    const reused = await statusOf(() =>
      asRequest(maintainer.authId, () => callForm(createBlock, { areaId: String(sectorAreaId), name })),
    )
    expect(reused, 'a cleared block must not reserve its name').toBe(303)

    const blocked = await asRequest(maintainer.authId, () =>
      callForm(createBlock, { areaId: String(sectorAreaId), name }),
    )
    expect(blocked, 'a live sibling must still block it, by name').toMatchObject({
      issues: [{ message: JSON.stringify({ message: 'blocks_nameExists', params: { name } }) }],
    })

    const [live] = await sql<{ count: number }[]>`
      select count(*)::int as count from public.blocks where name = ${name} and deleted_at is null`
    expect(live.count).toBe(1)
  })
})

describe.skipIf(!reachable)('markdown references', () => {
  // The resolver's own comment promised a tombstone for a deleted target; it resolved the name.
  it('tombstones a cleared route instead of naming it', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, deleted_at)
      values ('__softdel_referenced__', ${blockId}, ${regionId}, ${maintainer.userId}, now()) returning id`

    const enriched = await enrichMarkdown(`see !routes:${route.id}!`, db, regionId)

    expect(enriched, 'the cleared name must not be published').not.toContain(btoa('__softdel_referenced__'))
    expect(enriched, 'and it should tombstone').toContain(btoa(REFERENCE_TOMBSTONE))
  })

  it('still resolves a live route', async () => {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__softdel_live_ref__', ${blockId}, ${regionId}, ${maintainer.userId}) returning id`

    const enriched = await enrichMarkdown(`see !routes:${route.id}!`, db, regionId)

    expect(enriched, 'a live route must still resolve').toContain(btoa('__softdel_live_ref__'))
  })
})
