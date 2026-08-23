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
 * 12, and the third-of-the-membership slope. A later tuning pass has something to move against.
 *
 * Skips itself when no database is reachable, the same way the other server suites here do.
 */
import * as schema from '$lib/db/schema'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import Database from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.DATABASE_URL ?? ''
const postgres = url.length === 0 ? undefined : Database(url, { max: 1, prepare: false })
const db = postgres == null ? undefined : drizzle(postgres, { schema })

/** Ids well clear of anything seeded or synced, so a failed run cannot collide with real rows. */
const REGION = 990_100
const ACTOR = 990_101

let usable = false
/**
 * The people this suite seeds with, captured ONCE.
 *
 * Re-querying `users` per statement made this race the other database-backed suites, which insert
 * and delete their own fixtures in parallel on the same dev database: the set picked by a `limit`
 * changed between the seed and the assertion, and one test in the full run failed at random. A
 * flaky test is worse than no test, so the membership is fixed before anything asserts on it.
 */
let people: { authUserFk: string; id: number }[] = []

if (db != null) {
  try {
    await db.execute(sql`select public.event_promotion_threshold(0)`)
    const rows = await db.execute(sql`
      select id, auth_user_fk from public.users where auth_user_fk is not null order by id limit 8`)
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
  }
  await postgres?.end()
})

describe.skipIf(!usable)('event_promotion_threshold scales with the region', () => {
  beforeEach(async () => {
    await react(0, 0)
  })

  it('floors at three, so two mates in a tiny region are not the community', async () => {
    await seed(2)

    // A third of two rounds to one. Three of a very small region is what turning up looks like.
    expect(await threshold()).toBe(3)
  })

  it('clamps a third of the membership between three and twelve', async () => {
    // Through the real function, at the membership sizes that pin each of the three numbers the
    // migration admits are guesses. This used to run `least(12, greatest(3, ceil(0.33 * n)))`
    // itself over generate_series and compare it to a table written from the same expression,
    // which is Postgres agreeing with Postgres: retuning the migration to `least(20, greatest(5,
    // ceil(0.5 * n)))` left it green, and that is exactly the "no way to ask without running a
    // migrate" gap this file exists to close.
    await seed(0)

    expect(await thresholdWith(2)).toBe(3) // floor: a third of two rounds to one
    expect(await thresholdWith(12)).toBe(4) // slope: ceil(0.33 * 12) = 4
    expect(await thresholdWith(18)).toBe(6) // slope: ceil(0.33 * 18) = 6
    expect(await thresholdWith(37)).toBe(12) // ceiling: ceil(0.33 * 37) is 13, clamped to 12
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
