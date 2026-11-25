import { db } from '$lib/db/db.server'
import { connect } from '$lib/db/testAccounts'
/** The change markers: SQL in, the marker row out, since that row is what the trigger hands the stream. */
import {
  createThrowawayUser,
  dropGuidebookRegion,
  dropThrowawayUser,
  reachable,
  sql,
  type SeedUser,
} from '$lib/db/testDb'
import { deleteRegionRows } from '$lib/entities/region/delete.server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/** The pool, or one connection or transaction of it. */
type Db = typeof sql

let author: SeedUser
let regionId: number
let otherRegionId: number
let areaId: number

const newRegion = async () => {
  const [row] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values ('__counters_region__', ${author.userId}) returning id`
  return row.id
}

const newArea = async (region: number) => {
  const [row] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__counters_area__', 'area', ${region}, ${author.userId}) returning id`
  return row.id
}

const newEvent = async (db: Db = sql) => {
  const [row] = await db<{ id: number }[]>`
    insert into public.events (region_fk, area_fk, actor_fk, verb)
    values (${regionId}, ${areaId}, ${author.userId}, 'create') returning id`
  return row.id
}

const eventsMarker = async (region = regionId) => {
  const [row] = await sql<{ events: string }[]>`select events from public.region_counters where region_fk = ${region}`
  return Number(row?.events ?? 0)
}

/** How far `region`'s marker moves while `run` does its work. */
const moves = async (marker: () => Promise<number>, run: () => Promise<unknown>) => {
  const before = await marker()
  await run()
  return (await marker()) - before
}

beforeAll(async () => {
  if (!reachable) return
  author = await createThrowawayUser('counters_author')
  regionId = await newRegion()
  otherRegionId = await newRegion()
  areaId = await newArea(regionId)
})

afterAll(async () => {
  if (!reachable) return
  for (const id of [regionId, otherRegionId]) {
    await sql`delete from public.notifications where region_fk = ${id}`
    await dropGuidebookRegion(id)
  }
  await dropThrowawayUser(author)
})

describe.skipIf(!reachable)("a region's events marker", () => {
  it('moves when an event is recorded, and no other region moves', async () => {
    const other = await eventsMarker(otherRegionId)

    expect(await moves(eventsMarker, () => newEvent())).toBe(1)
    expect(await eventsMarker(otherRegionId)).toBe(other)
  })

  it('moves when the event changes and when it is deleted', async () => {
    const id = await newEvent()

    expect(await moves(eventsMarker, () => sql`update public.events set verb = 'update' where id = ${id}`)).toBe(1)
    expect(await moves(eventsMarker, () => sql`delete from public.events where id = ${id}`)).toBe(1)
  })

  it('moves in both regions when an event moves between them', async () => {
    const id = await newEvent()
    const move = () => sql`update public.events set region_fk = ${otherRegionId} where id = ${id}`

    expect(
      await moves(
        () => eventsMarker(otherRegionId),
        () => moves(eventsMarker, move).then((n) => expect(n).toBe(1)),
      ),
    ).toBe(1)
  })

  it('moves once for a transaction that records several', async () => {
    const three = () =>
      sql.begin(async (tx) => {
        for (let i = 0; i < 3; i++) await newEvent(tx as unknown as Db)
      })

    expect(await moves(eventsMarker, three)).toBe(1)
  })
})

describe.skipIf(!reachable)("an account's notifications marker", () => {
  /** Pools of their own: the suite's has too few connections to hold two. */
  const connections = [connect(), connect()]
  let lower: SeedUser
  let higher: SeedUser

  const notify = async (user: SeedUser, db: Db = sql) => {
    // Its own event: an account has one notification per source.
    const eventFk = await newEvent()
    const [row] = await db<{ id: number }[]>`
      insert into public.notifications (region_fk, auth_user_fk, user_fk, source_type, event_fk)
      values (${regionId}, ${user.authId}, ${user.userId}, 'mention', ${eventFk}) returning id`
    return row.id
  }

  const marker = async (user: SeedUser) => {
    const [row] = await sql<{ notifications: string }[]>`
      select notifications from public.user_counters where auth_user_fk = ${user.authId}`
    return Number(row?.notifications ?? 0)
  }

  const lowerMoves = (run: () => Promise<unknown>) => moves(() => marker(lower), run)

  beforeAll(async () => {
    if (!reachable) return
    const users = [await createThrowawayUser('counters_a'), await createThrowawayUser('counters_b')]
    ;[lower, higher] = users.sort((a, b) => (a.authId < b.authId ? -1 : 1))
  })

  afterAll(async () => {
    if (!reachable) return
    await sql`delete from public.notifications where region_fk = ${regionId}`
    for (const user of [lower, higher]) await dropThrowawayUser(user)
    for (const connection of connections) await connection.end()
  })

  it('moves for a new one, for reading it and for deleting it, and for nobody else', async () => {
    const other = await marker(higher)
    let id = 0

    expect(await lowerMoves(async () => (id = await notify(lower)))).toBe(1)
    expect(await lowerMoves(() => sql`update public.notifications set read_at = now() where id = ${id}`)).toBe(1)
    expect(await lowerMoves(() => sql`delete from public.notifications where id = ${id}`)).toBe(1)
    expect(await marker(higher)).toBe(other)
  })

  it('does not move when only the push stamp does', async () => {
    const id = await notify(lower)

    expect(await lowerMoves(() => sql`update public.notifications set pushed_at = now() where id = ${id}`)).toBe(0)
  })

  it('is not locked before the commit', async () => {
    await notify(lower)
    const holder = await connections[0].reserve()
    const writer = await connections[1].reserve()
    try {
      await holder`begin`
      await holder`select 1 from public.user_counters where auth_user_fk = ${lower.authId} for update`
      await writer`begin`
      await writer`set local lock_timeout = '500ms'`

      expect(await notify(lower, writer as unknown as Db)).toBeGreaterThan(0)
    } finally {
      await writer`rollback`
      await holder`rollback`
      writer.release()
      holder.release()
    }
  })

  it('is taken in one order at the commit, whichever came first in the transaction', async () => {
    await notify(lower)
    await notify(higher)
    const holder = await connections[0].reserve()
    const writer = await connections[1].reserve()
    let committed: Promise<unknown> | undefined
    try {
      await holder`begin`
      await holder`select 1 from public.user_counters where auth_user_fk = ${lower.authId} for update`
      await writer`begin`
      await notify(higher, writer as unknown as Db)
      await notify(lower, writer as unknown as Db)
      committed = writer`commit`.execute()
      await waitForLock()

      await holder`set local lock_timeout = '500ms'`
      const locked = await holder`
        select 1 from public.user_counters where auth_user_fk = ${higher.authId} for update`
      expect(locked).toHaveLength(1)
    } finally {
      await holder`rollback`
      await committed
      writer.release()
      holder.release()
    }
  })

  /** Until the waiting commit is seen to wait, so the next lock is not taken ahead of it. */
  async function waitForLock() {
    for (let tries = 0; tries < 100; tries++) {
      const waiting = await sql`
        select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike 'commit%'`
      if (waiting.length > 0) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('the commit never waited for a lock')
  }
})

describe.skipIf(!reachable)('deleting what a marker belongs to', () => {
  it('leaves no marker of a region that had events', async () => {
    const id = await newRegion()
    const area = await newArea(id)
    await sql`
      insert into public.events (region_fk, area_fk, actor_fk, verb) values (${id}, ${area}, ${author.userId}, 'create')`
    expect(await eventsMarker(id)).toBe(1)

    await db.transaction((tx) => deleteRegionRows(tx, id))

    expect(await sql`select 1 from public.regions where id = ${id}`).toHaveLength(0)
    expect(await sql`select 1 from public.region_counters where region_fk = ${id}`).toHaveLength(0)
  })

  it('leaves no notification, marker or recorded write of an account', async () => {
    const { authId, userId } = await createThrowawayUser('counters_deleted')
    await sql`
      insert into public.notifications (region_fk, auth_user_fk, user_fk, source_type)
      values (${regionId}, ${authId}, ${userId}, 'mention')`
    await sql`insert into public.applied_writes (auth_user_fk, id, name) values (${authId}, ${authId}, 'favorites.set')`
    expect(await sql`select 1 from public.user_counters where auth_user_fk = ${authId}`).toHaveLength(1)

    // As the account deletion does: the app's rows in one transaction, the sign-in account in a later one.
    await sql.begin(async (tx) => {
      await tx`delete from public.notifications where auth_user_fk = ${authId}`
      await tx`delete from public.users where id = ${userId}`
    })
    await sql`delete from auth.users where id = ${authId}`

    for (const table of ['notifications', 'user_counters', 'applied_writes']) {
      expect(await sql`select 1 from ${sql(`public.${table}`)} where auth_user_fk = ${authId}`, table).toHaveLength(0)
    }
  })
})
