// @vitest-environment node
/**
 * Who hears about a comment, and what happens to an inbox row when the reaction behind it is
 * taken back. Against a real database, because both are queries: a mock would only assert that
 * this code calls the functions it calls.
 *
 * The subscriber rule is the interesting half. There is no subscription table: the recipients of a
 * comment are the event's actor plus everybody who has already commented on it, which is what makes
 * joining a thread the act of subscribing to it. Get it wrong in one direction and a reply reaches
 * nobody but the card's author; in the other, it reaches people who never opened the thread.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { notifications } from '$lib/db/schema'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { dropReactionNotification, eventSubject, notifyComment, notifyReaction } from './reaction.server'

const REGION_NAME = '__reaction_test__'

/** The card's author, two people who talk under it, and one who never does. */
const WHO = ['author', 'first', 'second', 'quiet'] as const

type Who = (typeof WHO)[number]

let users = {} as Record<Who, SeedUser>
let regionId = 0
let routeId = 0
let eventId = 0

/** The event row as the fan-out reads it: the card `author` wrote. */
const event = () => ({
  actorFk: users.author.userId,
  areaFk: null,
  ascentFk: null,
  blockFk: null,
  fileFk: null,
  id: eventId,
  regionFk: regionId,
  routeFk: routeId,
  subjectFk: null,
})

const comment = async (who: Who): Promise<number> => {
  const [{ id }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${eventId}, 'nice', 'comment', ${regionId}, ${users[who].authId}, ${users[who].userId})
    returning id`
  return id
}

const emoji = async (who: Who): Promise<number> => {
  const [{ id }] = await sql<{ id: number }[]>`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${eventId}, '👍', 'emoji', ${regionId}, ${users[who].authId}, ${users[who].userId})
    returning id`
  return id
}

/** Who has an inbox row about this event, whatever it says. */
const told = async (): Promise<number[]> => {
  const rows = await db.query.notifications.findMany({
    columns: { userFk: true },
    where: eq(notifications.eventFk, eventId),
  })
  return rows.map((row) => row.userFk).sort((a, b) => a - b)
}

async function removeFixtures() {
  const region = sql`(select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.notifications where region_fk in ${region}`
  await sql`delete from public.reactions where region_fk in ${region}`
  await sql`delete from public.events where region_fk in ${region}`
  await sql`delete from public.routes where region_fk in ${region}`
  await sql`delete from public.blocks where region_fk in ${region}`
  await sql`delete from public.areas where region_fk in ${region}`
  await sql`delete from public.region_members where region_fk in ${region}`
  await sql`delete from public.regions where name = ${REGION_NAME}`
}

beforeAll(async () => {
  if (!reachable) return

  await removeFixtures()

  const created = await Promise.all(WHO.map((who) => createThrowawayUser(who)))
  users = Object.fromEntries(WHO.map((who, index) => [who, created[index]])) as Record<Who, SeedUser>
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members)
    values (${REGION_NAME}, ${users.author.userId}, 10) returning id`

  // Everybody a member, so nothing here is decided by the region gate: that rule has its own test.
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk) values
      (${regionId}, 'region_admin', true, ${users.author.authId}, ${users.author.userId}),
      (${regionId}, 'region_user', true, ${users.first.authId}, ${users.first.userId}),
      (${regionId}, 'region_user', true, ${users.second.authId}, ${users.second.userId}),
      (${regionId}, 'region_user', true, ${users.quiet.authId}, ${users.quiet.userId})`

  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type)
    values ('Klein Ilsetal', ${users.author.userId}, ${regionId}, 'crag') returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Nordblock', ${users.author.userId}, ${regionId}, ${areaId}, 0) returning id`
  ;[{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk)
    values ('Kante direkt', ${users.author.userId}, ${regionId}, ${blockId}) returning id`
  ;[{ id: eventId }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk)
    values ('create', ${users.author.userId}, ${regionId}, ${routeId}) returning id`
})

afterAll(async () => {
  if (reachable) {
    await removeFixtures()
    await Promise.all(WHO.map((who) => dropThrowawayUser(users[who])))
  }
  await sql.end()
})

beforeEach(async () => {
  if (reachable) {
    await sql`delete from public.notifications where event_fk = ${eventId}`
    await sql`delete from public.reactions where event_fk = ${eventId}`
  }
})

describe.skipIf(!reachable)('eventSubject', () => {
  it('points an inbox row at the event s own object', async () => {
    expect(await eventSubject(event())).toEqual({ entityId: routeId, entityType: 'route' })
  })

  it('has nothing to point at for an event with no object', async () => {
    expect(await eventSubject({ ...event(), routeFk: null })).toBeUndefined()
  })
})

describe.skipIf(!reachable)('notifyComment', () => {
  it('tells the card s author, and nobody who has not joined the thread', async () => {
    await comment('first')
    await notifyComment({ actorFk: users.first.userId, event: event(), reactionFk: await comment('first') })

    expect(await told()).toEqual([users.author.userId])
  })

  it('reaches everybody already in the thread, which is what makes a reply reach it', async () => {
    await comment('first')
    const reply = await comment('second')

    await notifyComment({ actorFk: users.second.userId, event: event(), reactionFk: reply })

    // The author and the earlier commenter. `quiet` never said anything, so nothing reaches them.
    expect(await told()).toEqual([users.author.userId, users.first.userId].sort((a, b) => a - b))
  })

  it('does not tell the person who wrote it', async () => {
    const own = await comment('author')

    await notifyComment({ actorFk: users.author.userId, event: event(), reactionFk: own })

    expect(await told()).toEqual([])
  })

  it('keeps two comments on one card as one inbox row, pointed at the newer one', async () => {
    const first = await comment('first')
    await notifyComment({ actorFk: users.first.userId, event: event(), reactionFk: first })
    const second = await comment('first')
    await notifyComment({ actorFk: users.first.userId, event: event(), reactionFk: second })

    const rows = await db.query.notifications.findMany({ where: eq(notifications.eventFk, eventId) })

    expect(rows).toHaveLength(1)
    // Unread throughout, so the row keeps its first pointer rather than being re-armed: what is
    // asserted here is that a chatty thread does not become a chatty inbox.
    expect(rows[0].reactionFk).toBe(first)
  })
})

describe.skipIf(!reachable)('dropReactionNotification', () => {
  it('takes the inbox row back with the last reaction behind it', async () => {
    await emoji('first')
    await notifyReaction({ actorFk: users.first.userId, event: event() })
    expect(await told()).toEqual([users.author.userId])

    // What `toggleReaction` does on a second tap: the row is cleared, not removed.
    await sql`update public.reactions set deleted_at = now() where event_fk = ${eventId}`
    await dropReactionNotification({ actorFk: users.first.userId, eventFk: eventId })

    expect(await told()).toEqual([])
  })

  it('leaves the row alone while the reactor still holds one', async () => {
    await emoji('first')
    await notifyReaction({ actorFk: users.first.userId, event: event() })

    await dropReactionNotification({ actorFk: users.first.userId, eventFk: eventId })

    expect(await told()).toEqual([users.author.userId])
  })

  it('does not take back somebody else s', async () => {
    await emoji('first')
    await notifyReaction({ actorFk: users.first.userId, event: event() })

    // `second` never reacted at all, so their takeback must not touch the row `first` wrote.
    await dropReactionNotification({ actorFk: users.second.userId, eventFk: eventId })

    expect(await told()).toEqual([users.author.userId])
  })
})
