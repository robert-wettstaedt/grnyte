// @vitest-environment node
/**
 * What guards a write to a region's `settings`.
 *
 * Real database and real overlapping transactions, because every property here is one only a
 * database can have. A lost update, a row lock and an RLS policy applied to `for update` have no
 * in-process equivalent, and the bug this module exists to close survived four rounds of review
 * precisely because nothing exercised two writers at once.
 *
 * The first test is a deliberate negative control. A concurrency test that silently runs its two
 * transactions one after the other passes for the wrong reason and proves nothing, so before
 * asserting the guard holds, this asserts that the same harness without the guard loses a write.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { sql as drizzleSql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { addRegionTag, removeRegionTag } from './regions.remote'
import { lockRegionSettings, writableKey, writeRegionSettings } from './settings.server'
import { addTag } from './tags.server'

/**
 * Forces one write to report `'zero'`, so the handlers' response to it can be asserted.
 *
 * Mocked rather than staged for real because the lock makes a genuine zero-row write unreachable
 * from outside the handler: no other writer can get at the row, and the caller cannot reach into
 * the handler's transaction. Off by default, so every other test in this file runs the real thing.
 */
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
    // The shape of the old code: read the vocabulary somewhere else, rewrite the whole array from
    // that copy. Both transactions read `["SD"]`, so whichever commits second erases the other's
    // word. The barrier is what makes it deterministic, and it is also the proof that these two
    // genuinely overlap: were they serialised onto one connection, the first would wait here for a
    // release the second could never reach, and this test would time out rather than pass.
    const arrived = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]

    /** Read inside the transaction, the way the code under test does. Reading on the pool instead
     *  would be a read of committed data on a third connection, which is not what either writer
     *  sees and made this pass for the wrong reason. */
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
    // The first holds the lock across a real delay, so the second is guaranteed to arrive while it
    // is held rather than after it. What the second reads once it gets in is the whole point: it
    // must see the first one's word and add to it, not to the copy it would have read on arrival.
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
    // Postgres applies the UPDATE policy's `using` clause to `for update`, not only the SELECT one,
    // so the lock is itself the write gate. This is what stops a caller demoted between the auth
    // hook's read and this transaction reaching the statements that destroy `routes_to_tags` rows.
    expect(await as(member, (tx) => lockRegionSettings(tx, regionId))).toBeUndefined()
    expect(await as(admin, (tx) => lockRegionSettings(tx, regionId))).toBeDefined()
  })

  it('reads a region whose settings have never been written', async () => {
    // A region inserts with a null blob, so "nothing configured" has to read as complete and
    // writable. Reporting it unreadable would make a new region's first tag unsaveable.
    await sql`update public.regions set settings = null where id = ${regionId}`

    const locked = await as(admin, (tx) => lockRegionSettings(tx, regionId))
    expect(locked?.stored.tagsComplete).toBe(true)
    expect(writableKey(locked!, 'tags')).toBeDefined()
  })
})

describe.skipIf(!reachable)('writeRegionSettings', () => {
  it('leaves a sibling key this build has never heard of untouched', async () => {
    // The entire reason the write merges rather than assigns, and nothing asserted it on either
    // path. An older build saving its own key must not delete a newer one's.
    await sql`update public.regions
              set settings = '{"tags":["SD"],"futureKey":{"kept":true}}'::jsonb where id = ${regionId}`

    await as(admin, async (tx) => {
      const locked = await lockRegionSettings(tx, regionId)
      await addTag(tx, writableKey(locked!, 'tags')!, 'dyno')
    })

    expect(await storedSettings(regionId)).toEqual({ futureKey: { kept: true }, tags: ['SD', 'dyno'] })
  })

  it('refuses a key that did not read whole, rather than writing what it could read', async () => {
    // A vocabulary holding something this build cannot represent: writing back what parsed would
    // silently drop the rest, and `regionTags` is the allowlist a route write is checked against,
    // so the region's own tags would become unwritable.
    await sql`update public.regions set settings = '{"tags":["SD",5]}'::jsonb where id = ${regionId}`

    const locked = await as(admin, (tx) => lockRegionSettings(tx, regionId))
    expect(locked?.stored.tagsComplete).toBe(false)
    expect(writableKey(locked!, 'tags')).toBeUndefined()
  })

  it('writes the other key, with the compare-and-swap matching on a float', async () => {
    // `mapLayers` had no coverage at all, and it is not interchangeable with `tags` here: the key
    // reaches the predicate as a bound parameter, and `jsonb -> unknown` resolves to `-> integer`
    // (subscript an array) as readily as `-> text` (look a key up). The `::text` cast in the write
    // is what settles it, and this is what would fail if somebody removed the cast.
    //
    // A float opacity because the compare-and-swap compares `JSON.stringify` output against what
    // Postgres stored: a number that did not survive that round trip identically would refuse every
    // save of the region, permanently, with no way for the admin out of it.
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

    // Read back, then write again from that read. The second save is the one that exercises the
    // predicate against a stored value rather than against `null`.
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
    // The old `writeTags` had no `returning` at all, so a write that landed nowhere looked exactly
    // like one that did. This drives the compare-and-swap directly, which is the backstop for the
    // case the lock cannot cover: a future caller that writes without locking first. Moving the key
    // inside the transaction holding the lock is the only way to stage that, since no other writer
    // can get at the row while it is held.
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
    // What `assertWritten` is for. Without it the junction rows had already moved, so a retired tag
    // vanished from every route while the screen still showed it: the caller saw success either
    // way. Reverting that throw to a no-op has to turn this red, which is the whole point of it.
    await sql`insert into public.routes_to_tags (route_fk, tag_fk, region_fk)
              values (${routeId}, 'SD', ${regionId})`
    forced.zero = true

    await expect(asRequest(admin.authId, () => removeRegionTag({ name: 'SD', regionFk: regionId }))).rejects.toThrow()

    // And the transaction took the junction delete back with it.
    expect(await tagsOn(routeId)).toEqual(['SD'])
  })

  it('refuses to retire a tag before touching a single junction row', async () => {
    // Fail fast rather than roll back. The delete is irreversible and the transaction would undo
    // it, but a refusal that arrives first is one that never has to.
    await sql`insert into public.routes_to_tags (route_fk, tag_fk, region_fk)
              values (${routeId}, 'SD', ${regionId})`
    await sql`update public.regions set settings = '{"tags":["SD",5]}'::jsonb where id = ${regionId}`

    await expect(asRequest(admin.authId, () => removeRegionTag({ name: 'SD', regionFk: regionId }))).rejects.toThrow()

    expect(await tagsOn(routeId)).toEqual(['SD'])
  })
})
