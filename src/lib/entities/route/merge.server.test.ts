import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// `routes.merge` through the mutator: what the survivor ends with, what refuses, and what other people keep.
const fx = useMaintainerRegion('__route_merge_region__')
let climber: SeedUser
const at = { block: 0, otherBlock: 0 }

beforeAll(async () => {
  if (!reachable) return
  climber = await createThrowawayUser('route_merge')
  await sql`insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${fx.regionId}, ${climber.userId}, ${climber.authId}, 'region_user', true)`
  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__route_merge_sector__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
  const [a, b] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__route_merge_a__', ${sector.id}, ${fx.regionId}, ${fx.user.userId}, 0),
           ('__route_merge_b__', ${sector.id}, ${fx.regionId}, ${fx.user.userId}, 1) returning id`
  Object.assign(at, { block: a.id, otherBlock: b.id })
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.notifications where region_fk = ${fx.regionId}`
  await sql`delete from public.content_reports where region_fk = ${fx.regionId}`
  await sql`delete from public.favorites where region_fk = ${fx.regionId}`
  await sql`delete from public.ascents where region_fk = ${fx.regionId}`
  await sql`delete from public.routes_to_tags where region_fk = ${fx.regionId}`
  await sql`delete from public.routes_to_first_ascensionists where region_fk = ${fx.regionId}`
  await sql`delete from public.first_ascensionists where region_fk = ${fx.regionId}`
  await sql`update public.routes set external_resources_fk = null where region_fk = ${fx.regionId}`
  await sql`delete from public.route_external_resources where region_fk = ${fx.regionId}`
  await sql`update public.routes set merged_into = null where region_fk = ${fx.regionId}`
  await sql`delete from public.region_members where user_fk = ${climber.userId}`
  await dropThrowawayUser(climber)
})

async function route(name: string, extra: { blockId?: number; description?: string; gradeFk?: number } = {}) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, grade_fk, description)
    values (${name}, ${extra.blockId ?? at.block}, ${fx.regionId}, ${fx.user.userId}, ${extra.gradeFk ?? null},
            ${extra.description ?? null}) returning id`
  return row.id
}

const merge = (
  sourceId: number,
  survivorId: number,
  values: Record<string, unknown> = {},
  client = fx.client,
  knownTopoLines = 0,
) => client.push('routes.merge', { knownTopoLines, sourceId, survivorId, values })

const one = async <T>(query: Promise<T[]>) => (await query)[0]

describe.skipIf(!reachable)('routes.merge', () => {
  it('fills what the survivor lacks, keeps the chosen value and retires the source', async () => {
    const survivor = await route('__rm_keep__', { gradeFk: 11 })
    const source = await route('__rm_dupe__', { description: 'Crimps', gradeFk: 12 })

    const result = await merge(source, survivor, { gradeFk: 12 })

    expect(result.error).toBeUndefined()
    expect(await one(sql`select grade_fk as "gradeFk", description from public.routes where id = ${survivor}`)).toEqual(
      {
        description: 'Crimps',
        gradeFk: 12,
      },
    )
    expect(
      await one(
        sql`select deleted_at is not null as gone, merged_into as "mergedInto" from public.routes where id = ${source}`,
      ),
    ).toEqual({ gone: true, mergedInto: survivor })
  })

  it('refuses a field outside the allowlist', async () => {
    const survivor = await route('__rm_strict_keep__')
    const source = await route('__rm_strict_dupe__')

    expect((await merge(source, survivor, { regionFk: 1 })).error).toBe('app')
    expect(await one(sql`select deleted_at from public.routes where id = ${source}`)).toEqual({ deleted_at: null })
  })

  it('lets only one of two crossing merges through', async () => {
    const a = await route('__rm_cross_a__')
    const b = await route('__rm_cross_b__')
    const other = zeroClient(fx.user.authId)
    try {
      const results = await Promise.all([merge(a, b), merge(b, a, {}, other)])
      expect(results.filter((result) => result.error == null)).toHaveLength(1)
      const live = await sql`select id from public.routes where id in ${sql([a, b])} and deleted_at is null`
      expect(live).toHaveLength(1)
    } finally {
      await other.cleanup()
    }
  })

  it('moves other people’s ascents and keeps one of each shared attachment', async () => {
    const survivor = await route('__rm_attach_keep__')
    const source = await route('__rm_attach_dupe__')
    await sql`insert into public.ascents (region_fk, created_by, type, route_fk) values (${fx.regionId}, ${climber.userId}, 'flash', ${source})`
    await sql`insert into public.routes_to_tags (region_fk, route_fk, tag_fk)
      values (${fx.regionId}, ${survivor}, 'SD'), (${fx.regionId}, ${source}, 'SD'), (${fx.regionId}, ${source}, 'highball')`
    const [fa] = await sql<{ id: number }[]>`
      insert into public.first_ascensionists (region_fk, name) values (${fx.regionId}, '__rm_fa__') returning id`
    await sql`insert into public.routes_to_first_ascensionists (region_fk, route_fk, first_ascensionist_fk)
      values (${fx.regionId}, ${survivor}, ${fa.id}), (${fx.regionId}, ${source}, ${fa.id})`
    await sql`insert into public.favorites (region_fk, user_fk, auth_user_fk, route_fk)
      values (${fx.regionId}, ${climber.userId}, ${climber.authId}, ${survivor}),
             (${fx.regionId}, ${climber.userId}, ${climber.authId}, ${source}),
             (${fx.regionId}, ${fx.user.userId}, ${fx.user.authId}, ${source})`
    await sql`insert into public.events (region_fk, verb, route_fk, actor_fk) values (${fx.regionId}, 'add', ${source}, ${fx.user.userId})`

    expect((await merge(source, survivor)).error).toBeUndefined()

    expect(
      await sql`select 1 from public.ascents where route_fk = ${survivor} and created_by = ${climber.userId}`,
    ).toHaveLength(1)
    const tags = await sql<
      { tag: string }[]
    >`select tag_fk as tag from public.routes_to_tags where route_fk = ${survivor} order by 1`
    expect(tags.map((row) => row.tag).sort()).toEqual(['SD', 'highball'].sort())
    expect(await sql`select 1 from public.routes_to_first_ascensionists where route_fk = ${survivor}`).toHaveLength(1)
    expect(
      await sql`select 1 from public.favorites where user_fk = ${climber.userId} and route_fk = ${survivor}`,
    ).toHaveLength(1)
    expect(
      await sql`select 1 from public.favorites where user_fk = ${fx.user.userId} and route_fk = ${survivor}`,
    ).toHaveLength(1)
    expect(await sql`select 1 from public.events where route_fk = ${source}`).toHaveLength(0)
  })

  it('leaves the source’s creation and edits, change rows included, with the source', async () => {
    const survivor = await route('__rm_born_keep__')
    const source = await route('__rm_born_dupe__')
    const own = await sql<{ id: number }[]>`insert into public.events (region_fk, verb, route_fk, actor_fk)
      values (${fx.regionId}, 'create', ${source}, ${fx.user.userId}), (${fx.regionId}, 'update', ${source}, ${fx.user.userId})
      returning id`
    for (const event of own) {
      await sql`insert into public.changes (region_fk, event_fk, column_name, new_value, route_fk)
        values (${fx.regionId}, ${event.id}, 'name', '__rm_born_dupe__', ${source})`
    }

    expect((await merge(source, survivor)).error).toBeUndefined()

    const ids = own.map((event) => event.id)
    expect(await sql`select 1 from public.events where id in ${sql(ids)} and route_fk = ${source}`).toHaveLength(2)
    expect(await sql`select 1 from public.changes where event_fk in ${sql(ids)} and route_fk = ${source}`).toHaveLength(
      2,
    )
  })

  it('keeps the survivor’s line on a shared topo and drops the source’s lines on another block', async () => {
    const survivor = await route('__rm_topo_keep__')
    const source = await route('__rm_topo_dupe__', { blockId: at.otherBlock })
    const topoOn = async (blockId: number, key: string) => {
      await sql`insert into public.files (id, region_fk, path, block_fk) values (${key}, ${fx.regionId}, '/x', ${blockId})`
      return (
        await one(sql<{ id: number }[]>`
        insert into public.topos (region_fk, block_fk, file_fk) values (${fx.regionId}, ${blockId}, ${key}) returning id`)
      ).id
    }
    const shared = await topoOn(at.block, `__rm_topo_a_${survivor}__`)
    const elsewhere = await topoOn(at.otherBlock, `__rm_topo_b_${source}__`)
    await sql`insert into public.topo_routes (region_fk, top_type, topo_fk, route_fk)
      values (${fx.regionId}, 'start', ${shared}, ${survivor}), (${fx.regionId}, 'sit', ${shared}, ${source}),
             (${fx.regionId}, 'start', ${elsewhere}, ${source})`

    // The confirmation counted none: a line drawn since is refused, not deleted unasked.
    expect((await merge(source, survivor)).error).toBe('app')
    expect((await merge(source, survivor, {}, fx.client, 1)).error).toBeUndefined()

    const lines = await sql<{ topoFk: number; topType: string }[]>`
      select topo_fk as "topoFk", top_type as "topType" from public.topo_routes where route_fk in ${sql([source, survivor])}`
    expect(lines).toEqual([{ topoFk: shared, topType: 'start' }])
  })

  it('takes over the source’s external links only when the survivor has none', async () => {
    const survivor = await route('__rm_ext_keep__')
    const source = await route('__rm_ext_dupe__')
    const [links] = await sql<{ id: number }[]>`
      insert into public.route_external_resources (region_fk, route_fk) values (${fx.regionId}, ${source}) returning id`
    await sql`update public.routes set external_resources_fk = ${links.id} where id = ${source}`

    await merge(source, survivor)

    expect(await one(sql`select external_resources_fk as fk from public.routes where id = ${survivor}`)).toEqual({
      fk: links.id,
    })
  })

  it('closes a reporter’s second report the way any report closes', async () => {
    const survivor = await route('__rm_report_keep__')
    const source = await route('__rm_report_dupe__')
    await sql`insert into public.content_reports (region_fk, reporter_fk, object_type, object_id, ground)
      values (${fx.regionId}, ${climber.userId}, 'route', ${String(survivor)}, 'spam'),
             (${fx.regionId}, ${climber.userId}, 'route', ${String(source)}, 'spam')`

    expect((await merge(source, survivor)).error).toBeUndefined()

    expect(await sql`select 1 from public.content_reports where reporter_fk = ${climber.userId}`).toHaveLength(1)
    await expect
      .poll(
        async () =>
          (
            await sql`select 1 from public.notifications where user_fk = ${climber.userId} and source_type = 'report_closed'`
          ).length,
      )
      .toBe(1)
  })

  it('records the merge on the survivor and refolds its community grade', async () => {
    // Same name on both: the usual duplicate, and still a change worth a history entry.
    const survivor = await route('__rm_event_same__', { description: 'Crimps' })
    const source = await route('__rm_event_same__', { description: 'Slopers' })
    await sql`insert into public.ascents (region_fk, created_by, type, route_fk, grade_fk)
      values (${fx.regionId}, ${climber.userId}, 'redpoint', ${source}, 14)`

    await merge(source, survivor, { description: 'Slopers' })

    // The picked description is part of the same entry, so the history shows what the merge changed.
    const changes = await sql`
      select c.column_name as "column", c.old_value as "oldValue", c.new_value as "newValue" from public.changes c
      join public.events e on e.id = c.event_fk where e.route_fk = ${survivor} order by c.column_name`
    expect(changes).toEqual([
      { column: 'description', newValue: 'Slopers', oldValue: 'Crimps' },
      { column: 'mergedFrom', newValue: '__rm_event_same__', oldValue: null },
    ])
    expect(await one(sql`select user_grade_fk as "userGradeFk" from public.routes where id = ${survivor}`)).toEqual({
      userGradeFk: 14,
    })
  })
})
