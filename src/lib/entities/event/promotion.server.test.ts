/**
 * The promotion rule, which lives in SQL and had no test at all.
 *
 * `event_engagement_score` and `event_promotion_threshold` are Postgres functions because a handler
 * cannot write `events` under RLS and a client-side threshold would need every reaction row synced
 * to every reader. That placement is right; what was missing was any way to ask "would this score
 * promote?" without running a migrate, and that gap is exactly how a scoring bug reached every
 * already-migrated database (see 0118, which exists to repair it).
 *
 * These also pin the three numbers the migration admits are guesses: the floor of 3, the ceiling of
 * 12, and the quarter-of-the-membership slope. A later tuning pass has something to move against.
 *
 * Skips itself when no database is reachable, the same way the other server suites here do.
 */
import * as schema from '$lib/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import Database from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.DATABASE_URL ?? ''
const postgres = url.length === 0 ? undefined : Database(url, { max: 1, prepare: false })
const db = postgres == null ? undefined : drizzle(postgres, { schema })

/** Ids well clear of anything seeded or synced, so a failed run cannot collide with real rows. */
const REGION = 990_100
const ACTOR = 990_101

let usable = false
/**
 * The people this suite seeds with: eight accounts of its own, created here and dropped in
 * `afterAll`.
 *
 * Borrowing the first eight rows of `users` is what this did, and it cannot work. Only four
 * accounts are seeded, so the other four came from whichever suite happened to be holding a
 * throwaway user at import time, and `dropThrowawayUser` then deleted it out from under the
 * `region_members` insert below: `violates foreign key constraint`, in a file that had touched
 * nothing. Capturing the set once fixed the set changing, not the rows going away.
 */
let people: { authUserFk: string; id: number }[] = []

if (db != null) {
  try {
    await db.execute(sql`select public.event_promotion_threshold(0)`)
    const rows = await db.execute(sql`
      with created_auth as (
        insert into auth.users (id, email)
        select gen_random_uuid(), '__promotion_' || g || '_' || gen_random_uuid() || '@grnyte.test'
        from generate_series(1, 8) g
        returning id
      )
      insert into public.users (auth_user_fk, username)
      select id, '__promotion_' || id from created_auth
      returning id, auth_user_fk`)
    people = rows.map((row) => ({
      authUserFk: (row as { auth_user_fk: string }).auth_user_fk,
      id: Number((row as { id: number }).id),
    }))
    usable = people.length >= 4
  } catch {
    usable = false
  }
}

/** Readers react; the first `commenters` of them comment instead of tapping. Never the actor. */
async function react(count: number, commenters: number): Promise<void> {
  if (db == null) return

  await db.execute(sql`delete from public.reactions where event_fk = ${ACTOR}`)

  for (const [index, person] of people.slice(1, count + 1).entries()) {
    await db.execute(sql`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
      values (${REGION}, ${person.authUserFk}, ${person.id}, ${ACTOR},
              ${index < commenters ? 'comment' : 'emoji'}, 'x')`)
  }
}

/** A region with `members` active people, one event in it owned by the first, and nothing else. */
async function seed(members: number): Promise<void> {
  if (db == null) return

  const [actor] = people

  await db.execute(sql`
    insert into public.regions (id, name, created_by) values (${REGION}, 'promotion test', ${actor.id})
    on conflict (id) do nothing`)

  await db.execute(sql`
    insert into public.events (id, region_fk, actor_fk, verb, subject_fk)
    values (${ACTOR}, ${REGION}, ${actor.id}, 'update', ${actor.id})
    on conflict (id) do nothing`)

  await db.execute(sql`delete from public.region_members where region_fk = ${REGION}`)

  for (const person of people.slice(0, members)) {
    await db.execute(sql`
      insert into public.region_members (region_fk, auth_user_fk, user_fk, role, is_active)
      values (${REGION}, ${person.authUserFk}, ${person.id}, 'region_user', true)`)
  }
}

const score = async (): Promise<number> => {
  const [row] = await db!.execute(sql`select public.event_engagement_score(${ACTOR}) as value`)
  return Number((row as { value: number }).value)
}

const threshold = async (): Promise<number> => {
  const [row] = await db!.execute(sql`select public.event_promotion_threshold(${REGION}) as value`)
  return Number((row as { value: number }).value)
}

const ROLLBACK = Symbol('rollback')

/**
 * `event_promotion_threshold` for a region holding `members` active people.
 *
 * Inside a transaction that always rolls back, so the accounts it has to invent never reach the
 * shared dev database. They have to be invented: `region_members` carries real foreign keys to
 * both `auth.users` and `public.users` and is unique per (region, user), so the eight accounts
 * this suite borrows cannot reach the slope or the ceiling. The function is STABLE and reads
 * inside the same transaction, so it sees the uncommitted rows.
 */
async function thresholdWith(members: number): Promise<number> {
  let value = 0

  try {
    await postgres!.begin(async (tx) => {
      await tx`delete from public.region_members where region_fk = ${REGION}`

      if (members > 0) {
        await tx`
          with created_auth as (
            insert into auth.users (id, email)
            select gen_random_uuid(), '__promotion_' || g || '_' || gen_random_uuid() || '@grnyte.test'
            from generate_series(1, ${members}) g
            returning id
          ), created_users as (
            insert into public.users (auth_user_fk, username)
            select id, '__promotion_' || id from created_auth
            returning id, auth_user_fk
          )
          insert into public.region_members (region_fk, auth_user_fk, user_fk, role, is_active)
          select ${REGION}, auth_user_fk, id, 'region_user', true from created_users`
      }

      const [row] = await tx<{ value: number }[]>`select public.event_promotion_threshold(${REGION}) as value`
      value = Number(row.value)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }

  return value
}

afterAll(async () => {
  if (db != null && usable) {
    await db.execute(sql`delete from public.reactions where event_fk = ${ACTOR}`)
    await db.execute(sql`delete from public.events where id = ${ACTOR}`)
    await db.execute(sql`delete from public.region_members where region_fk = ${REGION}`)
    await db.execute(sql`delete from public.regions where id = ${REGION}`)
    // After the rows that point at them, and `public.users` before `auth.users`.
    await postgres!`delete from public.users where id = any(${people.map((person) => person.id)})`
    await postgres!`delete from auth.users where id = any(${people.map((person) => person.authUserFk)})`
  }
  await postgres?.end()
})

describe.skipIf(!usable)('event_promotion_threshold scales with the region', () => {
  beforeEach(async () => {
    await react(0, 0)
  })

  it('floors at three, so two mates in a tiny region are not the community', async () => {
    await seed(2)

    // A quarter of two rounds to one. Three of a small region is what turning up looks like.
    expect(await threshold()).toBe(3)
  })

  it('clamps a quarter of the membership between three and twelve', async () => {
    // Through the real function, at the membership sizes that pin each of the three numbers the
    // migration admits are guesses. This used to run `least(12, greatest(3, ceil(0.33 * n)))`
    // itself over generate_series and compare it to a table written from the same expression,
    // which is Postgres agreeing with Postgres: retuning the migration to `least(20, greatest(5,
    // ceil(0.5 * n)))` left it green, and that is exactly the "no way to ask without running a
    // migrate" gap this file exists to close.
    await seed(0)

    expect(await thresholdWith(2)).toBe(3) // floor: a quarter of two rounds to one
    expect(await thresholdWith(12)).toBe(3) // slope: ceil(0.25 * 12) = 3
    expect(await thresholdWith(18)).toBe(5) // slope: ceil(0.25 * 18) = 5
    expect(await thresholdWith(49)).toBe(12) // ceiling: ceil(0.25 * 49) is 13, clamped to 12
  })
})

describe.skipIf(!usable)('the flip tells the actor when the card can show the banner', () => {
  const FAVORITE = 990_102
  const ASCENT = 990_103
  const ROUTE = 990_104
  const BLOCK = 990_105
  const AREA = 990_106
  const FILE = '__promotion_file'

  /** Each test owns the event: the actor's, in a region of five, whose floor of three the reactions reach. */
  async function logged(verb: string, object: 'ascent' | 'file' | 'subject' = 'subject'): Promise<void> {
    const [actor] = people
    await seed(5)
    await db!.execute(sql`delete from public.reactions where event_fk = ${FAVORITE}`)
    await db!.execute(sql`delete from public.events where id = ${FAVORITE}`)
    await db!.execute(sql`
      insert into public.events (id, region_fk, actor_fk, verb, subject_fk, ascent_fk, file_fk)
      values (${FAVORITE}, ${REGION}, ${actor.id}, ${verb},
              ${object === 'subject' ? actor.id : null},
              ${object === 'ascent' ? ASCENT : null},
              ${object === 'file' ? FILE : null})`)
  }

  async function turnUp(count: number, from = 1): Promise<void> {
    for (const person of people.slice(from, from + count)) {
      await db!.execute(sql`
        insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
        values (${REGION}, ${person.authUserFk}, ${person.id}, ${FAVORITE}, 'emoji', 'x')`)
    }
  }

  const told = async () =>
    (await db!.execute(sql`
      select user_fk, actor_fk, ascent_fk, event_fk, file_fk, route_fk, subject_fk
      from public.notifications
      where source_type = 'community_favorite' and event_fk = ${FAVORITE}`)) as unknown as Record<
      string,
      null | number | string
    >[]

  const promoted = async () => {
    const [row] = await db!.execute(sql`select promoted from public.events where id = ${FAVORITE}`)
    return (row as { promoted: boolean }).promoted
  }

  beforeAll(async () => {
    const [actor] = people
    await seed(5)
    await db!.execute(sql`
      insert into public.areas (id, region_fk, name) values (${AREA}, ${REGION}, 'a')
      on conflict (id) do nothing`)
    await db!.execute(sql`
      insert into public.blocks (id, region_fk, area_fk, name, "order")
      values (${BLOCK}, ${REGION}, ${AREA}, 'b', 0)
      on conflict (id) do nothing`)
    await db!.execute(sql`
      insert into public.routes (id, region_fk, block_fk, name) values (${ROUTE}, ${REGION}, ${BLOCK}, 'r')
      on conflict (id) do nothing`)
    await db!.execute(sql`
      insert into public.ascents (id, region_fk, created_by, type, route_fk)
      values (${ASCENT}, ${REGION}, ${actor.id}, 'redpoint', ${ROUTE})
      on conflict (id) do nothing`)
    await db!.execute(sql`
      insert into public.files (id, region_fk, route_fk, path) values (${FILE}, ${REGION}, ${ROUTE}, 'p')
      on conflict (id) do nothing`)
  })

  afterAll(async () => {
    await db!.execute(sql`delete from public.reactions where event_fk = ${FAVORITE}`)
    await db!.execute(sql`delete from public.events where id = ${FAVORITE}`)
    await db!.execute(sql`delete from public.files where id = ${FILE}`)
    await db!.execute(sql`delete from public.ascents where id = ${ASCENT}`)
    await db!.execute(sql`delete from public.routes where id = ${ROUTE}`)
    await db!.execute(sql`delete from public.blocks where id = ${BLOCK}`)
    await db!.execute(sql`delete from public.areas where id = ${AREA}`)
  })

  it('stays quiet one point short of the floor', async () => {
    await logged('add')
    await turnUp(2)

    expect(await promoted()).toBe(false)
    expect(await told()).toEqual([])
  })

  it('tells only the actor, once, and names nobody as the cause', async () => {
    await logged('add')
    await turnUp(4)

    expect(await told()).toEqual([
      {
        actor_fk: null,
        ascent_fk: null,
        event_fk: FAVORITE,
        file_fk: null,
        route_fk: null,
        subject_fk: people[0].id,
        user_fk: people[0].id,
      },
    ])
  })

  it('flags an edit without telling anybody, since its card shows no banner', async () => {
    await logged('update')
    await turnUp(3)

    expect(await promoted()).toBe(true)
    expect(await told()).toEqual([])
  })

  it('notifies about a send with no accolade', async () => {
    await db!.execute(sql`update public.ascents set accolade = null where id = ${ASCENT}`)
    await logged('create', 'ascent')
    await turnUp(3)

    expect((await told()).map((row) => row.ascent_fk)).toEqual([ASCENT])
  })

  it('stays quiet about a send whose accolade already holds the banner', async () => {
    await db!.execute(sql`update public.ascents set accolade = '{"kind":"ceiling"}' where id = ${ASCENT}`)
    await logged('create', 'ascent')
    await turnUp(3)

    expect(await promoted()).toBe(true)
    expect(await told()).toEqual([])
  })

  it('points an upload at what it landed on, like every other notification', async () => {
    await logged('add', 'file')
    await turnUp(3)

    const [row] = await told()
    expect(row.file_fk).toBeNull()
    expect(row.route_fk).toBe(ROUTE)
  })

  it('promotes only on a write that raised the score, never on a retraction or an edit', async () => {
    await logged('add')
    await turnUp(4)
    // An event over the bar and not yet flagged, which is what lowering the bar leaves behind.
    await db!.execute(sql`update public.events set promoted = false where id = ${FAVORITE}`)
    await db!.execute(sql`delete from public.notifications where event_fk = ${FAVORITE}`)

    const [first, second] = people.slice(1)
    await db!.execute(sql`
      update public.reactions set deleted_at = now()
      where event_fk = ${FAVORITE} and user_fk = ${first.id}`)
    const [still] = await db!.execute(sql`select public.event_engagement_score(${FAVORITE}) as value`)
    expect(Number((still as { value: number }).value)).toBeGreaterThanOrEqual(await threshold())
    expect(await promoted()).toBe(false)

    await db!.execute(sql`
      update public.reactions set body = 'edited'
      where event_fk = ${FAVORITE} and user_fk = ${second.id}`)
    expect(await promoted()).toBe(false)
    expect(await told()).toEqual([])

    await db!.execute(sql`
      update public.reactions set deleted_at = null
      where event_fk = ${FAVORITE} and user_fk = ${first.id}`)
    expect(await promoted()).toBe(true)
    expect(await told()).toHaveLength(1)
  })

  it('does not let the author promote their own card by commenting on it', async () => {
    await logged('add')
    await turnUp(4)
    await db!.execute(sql`update public.events set promoted = false where id = ${FAVORITE}`)
    await db!.execute(sql`delete from public.notifications where event_fk = ${FAVORITE}`)

    const [actor] = people
    await db!.execute(sql`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
      values (${REGION}, ${actor.authUserFk}, ${actor.id}, ${FAVORITE}, 'comment', 'x')`)

    expect(await promoted()).toBe(false)
    expect(await told()).toEqual([])
  })

  it('tells nobody once the actor has left the region', async () => {
    await logged('add')
    await db!.execute(sql`
      update public.region_members set is_active = false
      where region_fk = ${REGION} and user_fk = ${people[0].id}`)
    await turnUp(3)

    expect(await promoted()).toBe(true)
    expect(await told()).toEqual([])
  })
})

describe.skipIf(!usable)('event_engagement_score counts people, not actions', () => {
  it('is silent when nobody has said anything', async () => {
    await seed(5)
    await react(0, 0)

    expect(await score()).toBe(0)
  })

  it('does not count the actor applauding their own card', async () => {
    // The anti-self-promotion half of the rule, `AND r.user_fk <> e.actor_fk`, which had no
    // coverage at all: `react()` always slices people from index 1, so no test ever put a
    // reaction from the event's own actor on it. Drop that clause and an author reaches the
    // floor of three with one accomplice plus themselves, twice over.
    await seed(5)
    await react(0, 0)

    const [actor] = people
    const applaud = (type: string) =>
      db!.execute(sql`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
      values (${REGION}, ${actor.authUserFk}, ${actor.id}, ${ACTOR}, ${type}, 'x')`)

    await applaud('emoji')
    expect(await score()).toBe(0)

    // The weighted branch too, since a comment is worth more than a tap.
    await applaud('comment')
    expect(await score()).toBe(0)
  })

  it('gives one reader who reacted a score of one', async () => {
    await seed(5)
    await react(1, 0)

    expect(await score()).toBe(1)
  })

  it('weights a comment above a tap, because it costs more to leave', async () => {
    await seed(5)
    await react(1, 1)

    expect(await score()).toBe(2)
  })

  it('does not let one reader who did both clear the floor alone', async () => {
    // The 0117 bug: two independent DISTINCT counts summed to 1 + 2 = 3 for one person, which is
    // precisely the "anybody can promote their friend's card" case the rule exists to refuse.
    await seed(5)
    await react(1, 1)
    const [, reader] = people
    await db!.execute(sql`
      insert into public.reactions (region_fk, auth_user_fk, user_fk, event_fk, type, body)
      values (${REGION}, ${reader.authUserFk}, ${reader.id}, ${ACTOR}, 'emoji', 'y')`)

    expect(await score()).toBe(2)
    expect(await score()).toBeLessThan(await threshold())
  })

  it('promotes once three separate people have turned up', async () => {
    await seed(5)
    await react(3, 0)

    expect(await score()).toBe(3)
    expect(await score()).toBeGreaterThanOrEqual(await threshold())
  })

  it('ignores a reaction that was taken back', async () => {
    await seed(5)
    await react(3, 0)
    await db!.execute(sql`update public.reactions set deleted_at = now() where event_fk = ${ACTOR}`)

    expect(await score()).toBe(0)
  })
})
