// @vitest-environment node
/**
 * What guards a write to a region's `settings`. Real database and real overlapping transactions:
 * a lost update, a row lock and RLS on `for update` have no in-process equivalent.
 *
 * The first test is a negative control: a harness that quietly serialises passes for the wrong
 * reason. Skipped when DATABASE_URL is unreachable.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { sql as drizzleSql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRegionTag, removeRegionTag } from './regions.remote'
import { lockRegionSettings, writableKey, writeRegionSettings } from './settings.server'
import { addTag } from './tags.server'

/** Forces one write to report `'zero'`. Mocked because the lock makes a real zero-row write
 *  unreachable from outside the handler. Off by default. */
const forced = vi.hoisted(() => ({ zero: false }))

vi.mock('./settings.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings.server')>()

  return {
    ...actual,
    writeRegionSettings: (...args: Parameters<typeof actual.writeRegionSettings>) =>
      forced.zero ? Promise.resolve('zero' as const) : actual.writeRegionSettings(...args),
  }
})

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const REGION = '__settings_region__'

let admin = {} as SeedUser
let member = {} as SeedUser
let regionId = 0
let routeId = 0

const storedSettings = async (id: number): Promise<null | Record<string, unknown>> => {
  const [row] = await sql<{ settings: null | Record<string, unknown> }[]>`
    select settings from public.regions where id = ${id}`
  return row.settings
}

const storedTags = async (id: number): Promise<string[]> =>
  ((await storedSettings(id))?.tags as string[] | undefined) ?? []

const tagsOn = async (route: number): Promise<string[]> => {
  const rows = await sql<{ tagFk: string }[]>`
    select tag_fk as "tagFk" from public.routes_to_tags where route_fk = ${route} order by tag_fk`
  return rows.map((row) => row.tagFk)
}

/** Runs `fn` as `who` inside a real RLS transaction, impersonated the way `createDrizzle` does. */
async function as<T>(who: SeedUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ email: who.email, role: 'authenticated', sub: who.authId })

  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`select set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(drizzleSql.raw('set local role app_writer'))
    return fn(tx)
  })
}

async function removeFixtures() {
  await sql`delete from public.routes_to_tags where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.routes where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.blocks where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return
  ;({ admin, member } = await seedUsers({ admin: 'admin@grnyte.rocks', member: 'user@grnyte.rocks' }))

  await removeFixtures()

  const [{ id }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${admin.userId}, 10) returning id`
  regionId = id

  await sql`insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
            values (${id}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
                   (${id}, ${member.userId}, ${member.authId}, 'region_user', true)`

  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk) values (${REGION}, ${admin.userId}, ${id}) returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", created_by, area_fk, region_fk)
    values (${REGION}, 0, ${admin.userId}, ${areaId}, ${id}) returning id`
  const [{ id: route }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, block_fk, region_fk)
    values (${REGION}, ${admin.userId}, ${blockId}, ${id}) returning id`
  routeId = route
}, 30_000)

beforeEach(async () => {
  forced.zero = false
  if (!reachable) return
  await sql`delete from public.routes_to_tags where region_fk = ${regionId}`
  await sql`update public.regions set settings = jsonb_build_object('tags', '["SD"]'::jsonb) where id = ${regionId}`
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('the harness really overlaps two transactions', () => {
  it('loses a write when both read before either writes, which is the bug being fixed', async () => {
    // The old shape: read the vocabulary elsewhere, rewrite the whole array. The barrier makes it
    // deterministic and proves the two overlap: serialised, this would time out rather than pass.
    const arrived = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]

    /** Read inside the transaction, as the code under test does: a pool read is a third
     *  connection seeing committed data, which is not what either writer sees. */
    const readInTx = async (tx: Tx): Promise<string[]> => {
      const rows = await tx.execute<{ tags: null | string[] }>(
        drizzleSql`select settings -> 'tags' as tags from public.regions where id = ${regionId}`,
      )
      return rows[0]?.tags ?? []
    }

    const unguarded = (tx: Tx, tags: string[]) =>
      tx.execute(
        drizzleSql`update public.regions
                   set settings = coalesce(settings, '{}'::jsonb) || ${JSON.stringify({ tags })}::jsonb
                   where id = ${regionId}`,
      )

    /** Both read, then both write. Two-way, so neither can finish before the other has read. */
    const racer = (index: number, name: string) =>
      as(admin, async (tx) => {
        const before = await readInTx(tx)
        arrived[index].resolve()
        await Promise.all(arrived.map((one) => one.promise))
        await unguarded(tx, [...before, name])
      })

    await Promise.all([racer(0, 'first'), racer(1, 'second')])

    const after = await storedTags(regionId)
    expect(after).toHaveLength(2)
    expect(after.includes('first') && after.includes('second')).toBe(false)
  })
})

describe.skipIf(!reachable)('lockRegionSettings', () => {
  it('serialises two writers, so neither loses the other tag', async () => {
    // The first holds the lock across a real delay, so the second arrives while it is held and
    // must add to the first one's word rather than to what it would have read on arrival.
    const write = async (name: string, hold: boolean) =>
      as(admin, async (tx) => {
        const locked = await lockRegionSettings(tx, regionId)
        if (hold) {
          await tx.execute(drizzleSql`select pg_sleep(0.3)`)
        }
        const writable = writableKey(locked!, 'tags')
        await addTag(tx, writable!, name)
      })

    const held = write('first', true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await Promise.all([held, write('second', false)])

    expect((await storedTags(regionId)).toSorted()).toEqual(['SD', 'first', 'second'])
  })

  it('hands nothing to a member who may read the region but not update it', async () => {
    // Postgres applies the UPDATE policy to `for update`, so the lock is itself the write gate:
    // a caller demoted since the auth hook's read never reaches the destructive statements.
    expect(await as(member, (tx) => lockRegionSettings(tx, regionId))).toBeUndefined()
    expect(await as(admin, (tx) => lockRegionSettings(tx, regionId))).toBeDefined()
  })

  it('reads a region whose settings have never been written', async () => {
    // A region inserts with a null blob: reporting that unreadable makes its first tag unsaveable.
    await sql`update public.regions set settings = null where id = ${regionId}`

    const locked = await as(admin, (tx) => lockRegionSettings(tx, regionId))
    expect(locked?.stored.tagsComplete).toBe(true)
    expect(writableKey(locked!, 'tags')).toBeDefined()
  })
})

describe.skipIf(!reachable)('writeRegionSettings', () => {
  it('leaves a sibling key this build has never heard of untouched', async () => {
    // Why the write merges rather than assigns: an older build must not delete a newer key.
    await sql`update public.regions
              set settings = '{"tags":["SD"],"futureKey":{"kept":true}}'::jsonb where id = ${regionId}`

    await as(admin, async (tx) => {
      const locked = await lockRegionSettings(tx, regionId)
      await addTag(tx, writableKey(locked!, 'tags')!, 'dyno')
    })

    expect(await storedSettings(regionId)).toEqual({ futureKey: { kept: true }, tags: ['SD', 'dyno'] })
  })

  it('refuses a key that did not read whole, rather than writing what it could read', async () => {
    // Writing back only what parsed would drop the rest, and `regionTags` is the allowlist a
    // route write is checked against.
    await sql`update public.regions set settings = '{"tags":["SD",5]}'::jsonb where id = ${regionId}`

    const locked = await as(admin, (tx) => lockRegionSettings(tx, regionId))
    expect(locked?.stored.tagsComplete).toBe(false)
    expect(writableKey(locked!, 'tags')).toBeUndefined()
  })

  it('writes the other key, with the compare-and-swap matching on a float', async () => {
    // Reddens if the `::text` cast in the write goes: `jsonb -> unknown` also resolves to
    // `-> integer`. A float opacity, because the compare-and-swap round-trips `JSON.stringify`.
    const layer = {
      attributions: null,
      minZoom: 14,
      name: 'Relief',
      opacity: 0.7,
      params: { LAYERS: 'relief' },
      type: 'wms' as const,
      url: 'https://example.invalid/wms',
    }

    await sql`update public.regions
              set settings = jsonb_build_object('tags', '["SD"]'::jsonb) where id = ${regionId}`

    const first = await as(admin, async (tx) => {
      const locked = await lockRegionSettings(tx, regionId)
      return writeRegionSettings(tx, writableKey(locked!, 'mapLayers')!, [layer])
    })
    expect(first).toBe('ok')

    // The second save is the one exercising the predicate against a stored value, not `null`.
    const second = await as(admin, async (tx) => {
      const locked = await lockRegionSettings(tx, regionId)
      expect(locked?.stored.settings.mapLayers).toEqual([layer])
      return writeRegionSettings(tx, writableKey(locked!, 'mapLayers')!, [{ ...layer, opacity: 0.35 }])
    })
    expect(second).toBe('ok')

    const after = await storedSettings(regionId)
    expect((after?.mapLayers as { opacity: number }[])[0].opacity).toBe(0.35)
    // And the sibling key is still there, which is the other half of writing one key of a blob.
    expect(after?.tags).toEqual(['SD'])
  })

  it('reports a write that matched no row instead of returning quietly', async () => {
    // The old `writeTags` had no `returning`, so a write landing nowhere looked like one that did.
    // Staged inside the locked transaction, the only way to reach the compare-and-swap.
    const outcome = await as(admin, async (tx) => {
      const locked = await lockRegionSettings(tx, regionId)
      const writable = writableKey(locked!, 'tags')!

      await tx.execute(
        drizzleSql`update public.regions
                   set settings = jsonb_build_object('tags', '["moved"]'::jsonb) where id = ${regionId}`,
      )

      return writeRegionSettings(tx, writable, ['SD', 'never'])
    })

    expect(outcome).toBe('zero')
    // And the refused write left no trace, rather than half-applying.
    expect(await storedTags(regionId)).toEqual(['moved'])
  })
})

describe.skipIf(!reachable)('the tag commands end to end', () => {
  it('keeps both words when two admins add one at the same time', async () => {
    await Promise.all([
      asRequest(admin.authId, () => addRegionTag({ name: 'alpha', regionFk: regionId })),
      asRequest(admin.authId, () => addRegionTag({ name: 'beta', regionFk: regionId })),
    ])

    expect((await storedTags(regionId)).toSorted()).toEqual(['SD', 'alpha', 'beta'].toSorted())
  })

  it('fails the command when the write lands nowhere, rather than reporting success', async () => {
    // What `assertWritten` is for: without it a retired tag vanished from every route while the
    // screen still showed it. Reverting that throw to a no-op has to turn this red.
    await sql`insert into public.routes_to_tags (route_fk, tag_fk, region_fk)
              values (${routeId}, 'SD', ${regionId})`
    forced.zero = true

    await expect(asRequest(admin.authId, () => removeRegionTag({ name: 'SD', regionFk: regionId }))).rejects.toThrow()

    // And the transaction took the junction delete back with it.
    expect(await tagsOn(routeId)).toEqual(['SD'])
  })

  it('refuses to retire a tag before touching a single junction row', async () => {
    // Fail fast rather than roll back: a refusal that arrives first is one that never has to.
    await sql`insert into public.routes_to_tags (route_fk, tag_fk, region_fk)
              values (${routeId}, 'SD', ${regionId})`
    await sql`update public.regions set settings = '{"tags":["SD",5]}'::jsonb where id = ${regionId}`

    await expect(asRequest(admin.authId, () => removeRegionTag({ name: 'SD', regionFk: regionId }))).rejects.toThrow()

    expect(await tagsOn(routeId)).toEqual(['SD'])
  })
})
