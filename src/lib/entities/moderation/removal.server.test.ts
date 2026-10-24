import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readDecisions } from './admin.server'

let admin: SeedUser
let ada: SeedUser
let bo: SeedUser
let maintainer: SeedUser
let coAdmin: SeedUser
let outsider: SeedUser
let appAdmin: SeedUser
let regionId = 0
let otherRegionId = 0
let adminClient: ReturnType<typeof zeroClient>
let maintainerClient: ReturnType<typeof zeroClient>
let coAdminClient: ReturnType<typeof zeroClient>
let outsiderClient: ReturnType<typeof zeroClient>
let appAdminClient: ReturnType<typeof zeroClient>

const removal = { ground: 'spam', reason: 'Advertising a gym' } as const

beforeAll(async () => {
  if (!reachable) return
  ;[admin, ada, bo, maintainer, coAdmin, outsider, appAdmin] = await Promise.all(
    ['admin', 'ada', 'bo', 'maintainer', 'coadmin', 'outsider', 'appadmin'].map((who) =>
      createThrowawayUser(`removal_${who}`),
    ),
  )
  await sql`update public.users set username = 'Cy' where id = ${coAdmin.userId}`
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__moderation_removal__', ${admin.userId}) returning id`
  regionId = region.id
  const [otherRegion] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__moderation_removal_other__', ${outsider.userId}) returning id`
  otherRegionId = otherRegion.id
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${ada.userId}, ${ada.authId}, 'region_user', true),
      (${regionId}, ${bo.userId}, ${bo.authId}, 'region_user', true),
      (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true),
      (${regionId}, ${coAdmin.userId}, ${coAdmin.authId}, 'region_admin', true),
      (${otherRegionId}, ${outsider.userId}, ${outsider.authId}, 'region_admin', true)`
  await sql`insert into public.user_roles (auth_user_fk, role) values (${appAdmin.authId}, 'app_admin')`
  adminClient = zeroClient(admin.authId)
  maintainerClient = zeroClient(maintainer.authId)
  coAdminClient = zeroClient(coAdmin.authId)
  outsiderClient = zeroClient(outsider.authId)
  appAdminClient = zeroClient(appAdmin.authId)
})

afterAll(async () => {
  if (!reachable) return
  for (const client of [adminClient, maintainerClient, coAdminClient, outsiderClient, appAdminClient]) {
    await client.cleanup()
  }
  await sql`delete from public.moderation_decisions where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.reactions where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.topo_routes where region_fk = ${regionId}`
  await sql`delete from public.topos where region_fk = ${regionId}`
  await sql`delete from public.files where region_fk = ${regionId}`
  await sql`delete from public.ascents where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.regions where id in (${regionId}, ${otherRegionId})`
  await sql`delete from public.user_roles where auth_user_fk = ${appAdmin.authId}`
  for (const user of [admin, ada, bo, maintainer, coAdmin, outsider, appAdmin]) await dropThrowawayUser(user)
})

async function sector(name: string, routeAuthors: SeedUser[]) {
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values (${name}, ${admin.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values (${name}, ${admin.userId}, ${regionId}, ${area.id}, 0) returning id`
  for (const [index, author] of routeAuthors.entries()) {
    await sql`
      insert into public.routes (name, created_by, region_fk, block_fk)
      values (${`${name} ${index}`}, ${author.userId}, ${regionId}, ${block.id})`
  }
  return area.id
}

const notices = (user: SeedUser) =>
  sql<{ decision_fk: number }[]>`
    select decision_fk from public.notifications where user_fk = ${user.userId} and source_type = 'content_removed'`

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('a rule-breaking area removal', () => {
  it('tells each author of a route in it, once', async () => {
    const id = await sector('Two authors', [ada, bo, ada])

    await adminClient.push('areas.delete', { id, removal })

    const [decision] = await sql<{ id: number }[]>`
      select id from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)}`
    expect(await notices(ada)).toEqual([{ decision_fk: decision.id }])
    expect(await notices(bo)).toEqual([{ decision_fk: decision.id }])
  })

  it('records nothing when tidying up', async () => {
    const id = await sector('Tidy', [ada])

    await adminClient.push('areas.delete', { id })

    expect(
      await sql`select 1 from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)}`,
    ).toHaveLength(0)
  })

  it('refuses when nothing in it is anyone else s, and deletes nothing', async () => {
    const id = await sector('Own', [admin])

    expect(messageOf(await adminClient.push('areas.delete', { id, removal }))).toBe('moderation_nothingOfOthers')
    expect(await sql`select deleted_at from public.areas where id = ${id}`).toEqual([{ deleted_at: null }])
  })
})

async function adasRows() {
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Ratchet', ${ada.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Ratchet', ${ada.userId}, ${regionId}, ${area.id}, 0) returning id`
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values ('Ratchet', ${ada.userId}, ${regionId}, ${block.id})
    returning id`
  const [ascent] = await sql<{ id: number }[]>`
    insert into public.ascents (type, created_by, region_fk, route_fk) values ('flash', ${ada.userId}, ${regionId}, ${route.id})
    returning id`
  const [photo] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, route_fk, created_by)
    values (gen_random_uuid()::text, '/__ratchet__.jpg', ${regionId}, ${route.id}, ${ada.userId}) returning id`
  const [image] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, block_fk, created_by)
    values (gen_random_uuid()::text, '/__ratchet_topo__.jpg', ${regionId}, ${block.id}, ${ada.userId}) returning id`
  const [topo] = await sql<{ id: number }[]>`
    insert into public.topos (block_fk, file_fk, region_fk) values (${block.id}, ${image.id}, ${regionId}) returning id`
  const [event] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk) values ('create', ${ada.userId}, ${regionId}, ${route.id})
    returning id`
  const [comment] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${event.id}, 'ratchet', 'comment', ${regionId}, ${ada.authId}, ${ada.userId}) returning id`
  return {
    area: area.id,
    ascent: ascent.id,
    block: block.id,
    comment: comment.id,
    photo: photo.id,
    route: route.id,
    topo: topo.id,
  }
}

const decided = (kind: string, id: number | string) =>
  sql`select 1 from public.moderation_decisions where object_type = ${kind} and object_id = ${String(id)}`

describe.skipIf(!reachable)('every delete mutator', () => {
  // Leaves first, so each container still stands when its own removal runs.
  it.each([
    ['comment', 'reactions.deleteComment', (id: number | string) => ({ commentId: id, removal })],
    ['file', 'files.delete', (id: number | string) => ({ id, removal })],
    ['topo', 'topos.delete', (id: number | string) => ({ id, removal })],
    ['ascent', 'ascents.delete', (id: number | string) => ({ id, removal })],
    ['route', 'routes.delete', (id: number | string) => ({ id, removal })],
    ['block', 'blocks.delete', (id: number | string) => ({ id, removal })],
    ['area', 'areas.delete', (id: number | string) => ({ id, removal })],
  ] as const)('records a rule-breaking removal of another member s %s', async (kind, mutator, args) => {
    const rows = await adasRows()
    const id = rows[kind === 'file' ? 'photo' : kind]

    await adminClient.push(mutator, args(id))

    expect(await decided(kind, id)).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('the leaf removals', () => {
  it('lets a maintainer delete a topo only as tidying up', async () => {
    const { topo } = await adasRows()

    expect(messageOf(await maintainerClient.push('topos.delete', { id: topo, removal }))).toBe('form_noPermission')
    expect(await sql`select 1 from public.topos where id = ${topo}`).toHaveLength(1)
  })

  it('tells the climber of a removed ascent why, instead of that it was deleted', async () => {
    const { ascent } = await adasRows()

    await adminClient.push('ascents.delete', { id: ascent, removal })

    const kinds = await sql<{ source_type: string }[]>`
      select source_type from public.notifications where user_fk = ${ada.userId} and source_type in ('content_removed', 'ascent_deleted')
      and created_at > now() - interval '1 minute'`
    expect(kinds.map((row) => row.source_type)).toContain('content_removed')
    expect(kinds.map((row) => row.source_type)).not.toContain('ascent_deleted')
  })

  it('names a removed photo by the route it hangs on', async () => {
    const { photo } = await adasRows()

    await adminClient.push('files.delete', { id: photo, removal })

    expect(
      await sql`
        select s.items from public.moderation_decision_subjects s join public.moderation_decisions d on d.id = s.decision_fk
        where d.object_type = 'file' and d.object_id = ${photo}`,
    ).toEqual([{ items: [{ kind: 'file', name: 'Ratchet' }] }])
  })

  it('keeps the existing notice for an ascent tidied up', async () => {
    const { ascent } = await adasRows()
    await sql`delete from public.notifications where user_fk = ${ada.userId}`

    await adminClient.push('ascents.delete', { id: ascent })

    expect(
      await sql`select 1 from public.notifications where user_fk = ${ada.userId} and source_type = 'ascent_deleted'`,
    ).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('the undo after a removal', () => {
  it('lets the admin who removed a sector bring it back and take the notices back', async () => {
    const id = await sector('Undone', [ada])
    await adminClient.push('areas.delete', { id, removal })

    expect(await adminClient.push('moderation.undoRemoval', { id: String(id), kind: 'area' })).toEqual({})

    expect(await sql`select deleted_at from public.areas where id = ${id}`).toEqual([{ deleted_at: null }])
    expect(
      await sql`select 1 from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)} and reversed_at is null`,
    ).toHaveLength(0)
  })

  it.each([
    ['another admin of the region', () => coAdminClient, () => coAdmin],
    ['an app admin from outside it', () => appAdminClient, () => appAdmin],
  ])('lets %s undo it, and records who did', async (_, client, who) => {
    const id = await sector(`Undone by ${who().userId}`, [ada])
    await adminClient.push('areas.delete', { id, removal })

    expect(await client().push('moderation.undoRemoval', { id: String(id), kind: 'area' })).toEqual({})

    expect(await sql`select deleted_at from public.areas where id = ${id}`).toEqual([{ deleted_at: null }])
    expect(
      await sql`select reversed_by_fk from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)}`,
    ).toEqual([{ reversed_by_fk: who().userId }])
    const [{ username }] = await sql<
      { username: string }[]
    >`select username from public.users where id = ${who().userId}`
    expect((await readDecisions(regionId)).find((row) => row.objectId === String(id))?.reversedByName).toBe(username)
  })

  // Two standing decisions on one object: a restore left the first one standing.
  it('reverses the decision the log names, not the newest one on its object', async () => {
    const id = await sector('Removed twice', [ada])
    await adminClient.push('areas.delete', { id, removal })
    await sql`update public.areas set deleted_at = null where id = ${id}`
    await sql`update public.blocks set deleted_at = null where area_fk = ${id}`
    await sql`update public.routes set deleted_at = null where block_fk in (select id from public.blocks where area_fk = ${id})`
    await adminClient.push('areas.delete', { id, removal })
    const [older, newer] = await sql<{ id: number }[]>`
      select id from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)} order by id`

    expect(
      await coAdminClient.push('moderation.undoRemoval', { decisionId: older.id, id: String(id), kind: 'area' }),
    ).toEqual({})

    expect(
      await sql`select id, reversed_at is not null as reversed from public.moderation_decisions where id in (${older.id}, ${newer.id}) order by id`,
    ).toEqual([
      { id: older.id, reversed: true },
      { id: newer.id, reversed: false },
    ])
  })

  it('refuses a maintainer of the region and an admin of another', async () => {
    const id = await sector('Not yours', [ada])
    await adminClient.push('areas.delete', { id, removal })

    for (const client of [maintainerClient, outsiderClient]) {
      expect(messageOf(await client.push('moderation.undoRemoval', { id: String(id), kind: 'area' }))).toBe(
        'form_noPermission',
      )
    }
    expect(await sql`select deleted_at is not null as gone from public.areas where id = ${id}`).toEqual([
      { gone: true },
    ])
  })
})

describe.skipIf(!reachable)('an app admin reversing a decision', () => {
  const undo = (kind: string, id: number | string) =>
    appAdminClient.push('moderation.undoRemoval', { id: String(id), kind })

  it('brings a removed area back, marks the decision reversed, and takes back the unread notices', async () => {
    const id = await sector('Reversed', [ada])
    await adminClient.push('areas.delete', { id, removal })
    const [decision] = await sql<{ id: number }[]>`
      select id from public.moderation_decisions where object_type = 'area' and object_id = ${String(id)}`

    await undo('area', id)

    expect(await sql`select deleted_at from public.areas where id = ${id}`).toEqual([{ deleted_at: null }])
    expect(await sql`select reversed_by_fk from public.moderation_decisions where id = ${decision.id}`).toEqual([
      { reversed_by_fk: appAdmin.userId },
    ])
    expect(await notices(ada)).not.toContainEqual({ decision_fk: decision.id })
  })

  // Fresh and bare, so a tidy-up would have erased it; a removal keeps the row for this.
  it('brings back a route removed minutes after it was added', async () => {
    await sector('Fresh', [ada])
    const [route] = await sql<{ id: number }[]>`
      select id from public.routes where region_fk = ${regionId} and name = 'Fresh 0'`
    await adminClient.push('routes.delete', { id: route.id, removal })

    await undo('route', route.id)

    expect(await sql`select deleted_at from public.routes where id = ${route.id}`).toEqual([{ deleted_at: null }])
  })

  it('restores a removed comment and drops its copy, but leaves one whose words were erased', async () => {
    const { comment } = await adasRows()
    const { comment: erased } = await adasRows()
    await adminClient.push('reactions.deleteComment', { commentId: comment, removal })
    await adminClient.push('reactions.deleteComment', { commentId: erased, removal })
    const decisionOf = async (id: number) =>
      (
        await sql<{ id: number }[]>`
          select id from public.moderation_decisions where object_type = 'comment' and object_id = ${String(id)}`
      )[0].id
    // What account deletion leaves: the author's words gone from the decision.
    await sql`update public.moderation_decisions set removed_body = null where id = ${await decisionOf(erased)}`

    await undo('comment', comment)
    await undo('comment', erased)

    expect(await sql`select body, deleted_at from public.reactions where id = ${comment}`).toEqual([
      { body: 'ratchet', deleted_at: null },
    ])
    expect(
      await sql`select removed_body from public.moderation_decisions where id = ${await decisionOf(comment)}`,
    ).toEqual([{ removed_body: null }])
    expect(await sql`select 1 from public.reactions where id = ${erased} and deleted_at is not null`).toHaveLength(1)
  })

  it('takes the "removed" card off the feed when an ascent comes back', async () => {
    const { ascent } = await adasRows()
    await adminClient.push('ascents.delete', { id: ascent, removal })
    const card = () => sql`select 1 from public.events where ascent_fk = ${ascent} and verb = 'delete'`
    expect(await card()).toHaveLength(1)

    await undo('ascent', ascent)

    expect(await sql`select deleted_at from public.ascents where id = ${ascent}`).toEqual([{ deleted_at: null }])
    expect(await card()).toHaveLength(0)
  })

  it('tells a climber who read the notice that only the ascent came back, not its photo', async () => {
    const { ascent } = await adasRows()
    await sql`
      insert into public.files (id, path, region_fk, ascent_fk, created_by) values
        (gen_random_uuid()::text, '/__ascent_photo__.jpg', ${regionId}, ${ascent}, ${ada.userId}),
        (gen_random_uuid()::text, '/__ascent_photo_bo__.jpg', ${regionId}, ${ascent}, ${bo.userId})`
    await adminClient.push('ascents.delete', { id: ascent, removal })
    const [decision] = await sql<{ id: number }[]>`
      select id from public.moderation_decisions where object_type = 'ascent' and object_id = ${String(ascent)}`
    await sql`update public.notifications set read_at = now() where decision_fk = ${decision.id}`

    await undo('ascent', ascent)

    // Bo's photo on it is gone for good, so Bo hears nothing.
    const restored = await sql<{ metadata: string; user_fk: number }[]>`
      select metadata, user_fk from public.notifications where decision_fk = ${decision.id} and source_type = 'content_restored'`
    expect(restored.map((row) => ({ items: JSON.parse(row.metadata), user: row.user_fk }))).toEqual([
      { items: [{ kind: 'ascent', name: 'Ratchet' }], user: ada.userId },
    ])
  })

  it('refuses to reverse a decision twice', async () => {
    const id = await sector('Twice', [ada])
    await adminClient.push('areas.delete', { id, removal })
    await undo('area', id)

    expect(messageOf(await undo('area', id))).toBe('moderation_alreadyReversed')
  })
})

describe.skipIf(!reachable)('a region s moderation log', () => {
  it('lists the decisions of every admin of the region, each named, and none from elsewhere', async () => {
    const mine = await sector('Logged', [ada])
    const theirs = await sector('Logged by Cy', [ada])
    await adminClient.push('areas.delete', { id: mine, removal })
    await coAdminClient.push('areas.delete', { id: theirs, removal })
    await sql`
      insert into public.moderation_decisions (actor_fk, ground, object_id, object_type, reason, region_fk)
      values (${outsider.userId}, 'spam', '1', 'area', 'Elsewhere', ${otherRegionId})`

    const rows = await readDecisions(regionId)

    expect(rows.map((row) => row.reason)).not.toContain('Elsewhere')
    expect(rows.find((row) => row.objectId === String(theirs))).toMatchObject({ actorName: 'Cy', objectType: 'area' })
    expect(rows.find((row) => row.objectId === String(mine))).toBeDefined()
  })
})

// The sector is the maintainer's own, so without the guard their ordinary restore would pass.
async function maintainersSector() {
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Own sector', ${maintainer.userId}, ${regionId}, 'sector')
    returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Own sector', ${maintainer.userId}, ${regionId}, ${area.id}, 0) returning id`
  await sql`
    insert into public.routes (name, created_by, region_fk, block_fk) values ('Ada s line', ${ada.userId}, ${regionId}, ${block.id})`
  return area.id
}

const tableOf = { area: 'areas', block: 'blocks', route: 'routes' } as const

describe.skipIf(!reachable)('a restore of content removed for breaking the rules', () => {
  it.each([
    [
      'area',
      'areas.delete',
      'areas.restore',
      () => maintainerClient,
      maintainersSector,
      (id: number) => ({ areaId: id, mode: 'soft' }),
    ],
    [
      'block',
      'blocks.delete',
      'blocks.restore',
      () => coAdminClient,
      async () => (await adasRows()).block,
      (id: number) => ({ blockId: id, mode: 'soft' }),
    ],
    [
      'route',
      'routes.delete',
      'routes.restore',
      () => coAdminClient,
      async () => (await adasRows()).route,
      (id: number) => ({ mode: 'soft', routeId: id }),
    ],
  ] as const)(
    'is refused for the %s, which stays removed with its decision standing',
    async (kind, remove, restore, client, setup, args) => {
      const id = await setup()
      await adminClient.push(remove, { id, removal })

      expect(messageOf(await client().push(restore, args(id)))).toBe('moderation_restoreRefused')

      expect(await sql`select 1 from ${sql(tableOf[kind])} where id = ${id} and deleted_at is not null`).toHaveLength(1)
      expect(
        await sql`select 1 from public.moderation_decisions where object_type = ${kind} and object_id = ${String(id)} and reversed_at is null`,
      ).toHaveLength(1)
    },
  )

  // Answered like any other refusal, so it does not tell an outsider what was moderated.
  it('gives an admin of another region the ordinary refusal', async () => {
    const { route } = await adasRows()
    await adminClient.push('routes.delete', { id: route, removal })

    expect(messageOf(await outsiderClient.push('routes.restore', { mode: 'soft', routeId: route }))).toBe(
      'form_noPermission',
    )
  })

  // A hard restore of an existing id only ever replays, so it must answer alike for both deletions.
  it('answers a hard restore the same whether the route was tidied away or removed', async () => {
    const tidied = await adasRows()
    const removed = await adasRows()
    await adminClient.push('routes.delete', { id: tidied.route })
    await adminClient.push('routes.delete', { id: removed.route, removal })
    const hard = ({ block, route }: { block: number; route: number }) => ({
      firstAscensionistFks: [],
      mode: 'hard',
      route: { blockFk: block, description: null, firstAscentYear: null, gradeFk: null, name: 'Probe', rating: null },
      routeId: route,
      tags: [],
    })

    const outcome = (result: object) => ('error' in result ? result : 'replayed')

    expect(outcome(await maintainerClient.push('routes.restore', hard(removed)))).toBe('replayed')
    expect(outcome(await maintainerClient.push('routes.restore', hard(tidied)))).toBe('replayed')
  })

  it('lets Undo bring a removed block back', async () => {
    const { block } = await adasRows()
    await adminClient.push('blocks.delete', { id: block, removal })

    expect(await coAdminClient.push('moderation.undoRemoval', { id: String(block), kind: 'block' })).toEqual({})

    expect(await sql`select deleted_at from public.blocks where id = ${block}`).toEqual([{ deleted_at: null }])
    expect(
      await sql`select 1 from public.moderation_decisions where object_type = 'block' and object_id = ${String(block)} and reversed_at is not null`,
    ).toHaveLength(1)
  })

  it('leaves a route deleted as tidying up restorable', async () => {
    const { route } = await adasRows()
    await adminClient.push('routes.delete', { id: route })

    expect(await adminClient.push('routes.restore', { mode: 'soft', routeId: route })).not.toHaveProperty('error')

    expect(await sql`select deleted_at from public.routes where id = ${route}`).toEqual([{ deleted_at: null }])
  })
})
