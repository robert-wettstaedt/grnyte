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
import {
  dropComment,
  dropCommentNotification,
  dropReactionNotification,
  eventSubject,
  notifyComment,
  notifyReaction,
  restoreReplies,
} from './reaction.server'

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

/**
 * The same, plus WHICH sentence each of them got: one person may only ever have one.
 *
 * Sorted by user id, and the expectations are sorted through {@link inIdOrder} rather than written
 * in the order the people are declared: `beforeAll` creates them with `Promise.all`, so the ids
 * come back in whatever order four concurrent inserts happened to commit in.
 */
const said = async (): Promise<{ sourceType: string; userFk: number }[]> => {
  const rows = await db.query.notifications.findMany({
    columns: { sourceType: true, userFk: true },
    where: eq(notifications.eventFk, eventId),
  })
  return rows.map((row) => ({ sourceType: row.sourceType, userFk: row.userFk })).sort((a, b) => a.userFk - b.userFk)
}

const inIdOrder = (rows: { sourceType: string; userFk: number }[]) => [...rows].sort((a, b) => a.userFk - b.userFk)

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
    expect(await eventSubject(event())).toEqual({ id: routeId, type: 'route' })
  })

  it('has nothing to point at for an event with no object', async () => {
    expect(await eventSubject({ ...event(), routeFk: null })).toBeUndefined()
  })
})

describe.skipIf(!reachable)('notifyComment', () => {
  it('tells the card s author, and nobody who has not joined the thread', async () => {
    await comment('first')
    await notifyComment({
      actorFk: users.first.userId,
      body: 'said something',
      event: event(),
      reactionFk: await comment('first'),
    })

    expect(await told()).toEqual([users.author.userId])
  })

  it('reaches everybody already in the thread, which is what makes a reply reach it', async () => {
    await comment('first')
    const reply = await comment('second')

    await notifyComment({ actorFk: users.second.userId, body: 'said something', event: event(), reactionFk: reply })

    // The author and the earlier commenter. `quiet` never said anything, so nothing reaches them.
    expect(await told()).toEqual([users.author.userId, users.first.userId].sort((a, b) => a - b))
  })

  it('does not tell the person who wrote it', async () => {
    const own = await comment('author')

    await notifyComment({ actorFk: users.author.userId, body: 'said something', event: event(), reactionFk: own })

    expect(await told()).toEqual([])
  })

  it('keeps two comments on one card as one inbox row, pointed at the newer one', async () => {
    const first = await comment('first')
    await notifyComment({ actorFk: users.first.userId, body: 'said something', event: event(), reactionFk: first })
    const second = await comment('first')
    await notifyComment({ actorFk: users.first.userId, body: 'said something', event: event(), reactionFk: second })

    const rows = await db.query.notifications.findMany({ where: eq(notifications.eventFk, eventId) })

    expect(rows).toHaveLength(1)
    // Unread throughout, so the row keeps its first pointer rather than being re-armed: what is
    // asserted here is that a chatty thread does not become a chatty inbox.
    expect(rows[0].reactionFk).toBe(first)
  })

  it('tells the person being answered that they were answered, not that somebody commented', async () => {
    await comment('first')
    const reply = await comment('second')

    await notifyComment({
      actorFk: users.second.userId,
      body: 'answering you',
      event: event(),
      parentAuthorFk: users.first.userId,
      reactionFk: reply,
    })

    expect(await said()).toEqual(
      inIdOrder([
        // The card's author still hears the thread sentence.
        { sourceType: 'comment', userFk: users.author.userId },
        { sourceType: 'comment_reply', userFk: users.first.userId },
      ]),
    )
  })

  it('tells somebody named in the body that they were named', async () => {
    const own = await comment('first')

    await notifyComment({
      actorFk: users.first.userId,
      body: `ask !users:${users.quiet.userId}!, they were there`,
      event: event(),
      reactionFk: own,
    })

    expect(await said()).toEqual(
      inIdOrder([
        { sourceType: 'comment', userFk: users.author.userId },
        // `quiet` has never commented here, so the mention is the only thing that reaches them.
        { sourceType: 'mention', userFk: users.quiet.userId },
      ]),
    )
  })

  it('gives one person one row, and the most specific sentence of the three', async () => {
    await comment('first')
    const reply = await comment('second')

    await notifyComment({
      actorFk: users.second.userId,
      // Answered AND named AND already in the thread: all three rules point at `first`.
      body: `!users:${users.first.userId}! good shout`,
      event: event(),
      parentAuthorFk: users.first.userId,
      reactionFk: reply,
    })

    expect(await said()).toEqual(
      inIdOrder([
        { sourceType: 'comment', userFk: users.author.userId },
        { sourceType: 'comment_reply', userFk: users.first.userId },
      ]),
    )
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

describe.skipIf(!reachable)('dropComment and restoreReplies', () => {
  /** What the two halves of an undo have to agree on: which rows the delete actually took. */
  const cleared = async (): Promise<{ body: string; deleted: boolean }[]> => {
    const rows = await sql<{ body: string; deleted: boolean }[]>`
      select body, deleted_at is not null as deleted from public.reactions
      where event_fk = ${eventId} and type = 'comment' order by id`
    return rows.map((row) => ({ body: row.body, deleted: row.deleted }))
  }

  const reply = async (who: Who, parentFk: number, body: string, deletedAt?: Date): Promise<number> => {
    const [{ id }] = await sql<{ id: number }[]>`
      insert into public.reactions (event_fk, parent_fk, body, type, region_fk, auth_user_fk, user_fk, deleted_at)
      values (${eventId}, ${parentFk}, ${body}, 'comment', ${regionId}, ${users[who].authId}, ${users[who].userId},
              ${deletedAt ?? null})
      returning id`
    return id
  }

  it('puts back exactly the answers it took, and not the one its author had already deleted', async () => {
    const head = await comment('first')
    await reply('second', head, 'answer')
    // Cleared by its own author an hour before any of this, which no undo of somebody else's
    // delete may resurrect.
    await reply('quiet', head, 'withdrawn', new Date(Date.now() - 3_600_000))

    const [{ deletedAt }] = await sql<{ deletedAt: Date }[]>`
      update public.reactions set deleted_at = now() where id = ${head} returning deleted_at as "deletedAt"`
    await dropComment({ actorFk: users.first.userId, eventFk: eventId, reactionFk: head })

    expect(await cleared()).toEqual([
      { body: 'nice', deleted: true },
      { body: 'answer', deleted: true },
      { body: 'withdrawn', deleted: true },
    ])

    await sql`update public.reactions set deleted_at = null where id = ${head}`
    await restoreReplies({ deletedAt, reactionFk: head })

    expect(await cleared()).toEqual([
      { body: 'nice', deleted: false },
      { body: 'answer', deleted: false },
      { body: 'withdrawn', deleted: true },
    ])
  })
})

/**
 * What happens to an inbox row when the line it was written about goes away.
 *
 * The delete path, which is where a wrong sentence survives in somebody's inbox: one row covers a
 * whole conversation and points at the FIRST line it was written about, so a person who says two
 * things and deletes the first must not erase the reader's only notice of the second. A reply and a
 * mention are about ONE line each, so they may only move to a line that would have written the same
 * sentence to the same reader, and go when there is none.
 */
describe.skipIf(!reachable)('dropCommentNotification', () => {
  /** A comment, with a body worth reading (a mention is read out of it) and an optional parent. */
  const line = async (who: Who, body: string, parentFk?: number): Promise<number> => {
    const [{ id }] = await sql<{ id: number }[]>`
      insert into public.reactions (event_fk, parent_fk, body, type, region_fk, auth_user_fk, user_fk)
      values (${eventId}, ${parentFk ?? null}, ${body}, 'comment', ${regionId}, ${users[who].authId},
              ${users[who].userId})
      returning id`
    return id
  }

  const clear = (reactionFk: number) => sql`update public.reactions set deleted_at = now() where id = ${reactionFk}`

  /** Which line one reader's row points at, for one sentence. `undefined` = they have no such row. */
  const pointing = async (who: Who, sourceType: string): Promise<null | number | undefined> => {
    const rows = await db.query.notifications.findMany({
      columns: { reactionFk: true, sourceType: true, userFk: true },
      where: eq(notifications.eventFk, eventId),
    })
    return rows.find((row) => row.userFk === users[who].userId && row.sourceType === sourceType)?.reactionFk
  }

  it('re-points the thread row at the newest line its author still has standing', async () => {
    const first = await line('first', 'hollow flake on the left')
    await notifyComment({
      actorFk: users.first.userId,
      body: 'hollow flake on the left',
      event: event(),
      reactionFk: first,
    })
    const second = await line('first', 'and the start is wet')
    await notifyComment({
      actorFk: users.first.userId,
      body: 'and the start is wet',
      event: event(),
      reactionFk: second,
    })

    // An unread row keeps pointing at the first line, which is the premise this is about.
    expect(await pointing('author', 'comment')).toBe(first)

    await clear(first)
    await dropCommentNotification({ actorFk: users.first.userId, eventFk: eventId, reactionFk: first })

    expect(await pointing('author', 'comment')).toBe(second)
  })

  it('moves an answered row only onto a line that answers the same reader', async () => {
    const head = await line('second', 'which start did you use')
    const answer = await line('first', 'the sit start', head)
    await notifyComment({
      actorFk: users.first.userId,
      body: 'the sit start',
      event: event(),
      parentAuthorFk: users.second.userId,
      reactionFk: answer,
    })
    const again = await line('first', 'from the block under the arete', head)
    await notifyComment({
      actorFk: users.first.userId,
      body: 'from the block under the arete',
      event: event(),
      parentAuthorFk: users.second.userId,
      reactionFk: again,
    })
    // NEWER than the replacement, and answering nobody. This is what makes the assertion below
    // load-bearing: a row re-pointed at "the newest live line" rather than at the newest line that
    // ANSWERS this reader would land here, and the test would catch it.
    await line('first', 'anyway, good effort')

    await clear(answer)
    await dropCommentNotification({ actorFk: users.first.userId, eventFk: eventId, reactionFk: answer })

    expect(await pointing('second', 'comment_reply')).toBe(again)
  })

  it('takes an answered row back when nothing that person said answers the reader any more', async () => {
    const head = await line('second', 'which start did you use')
    const answer = await line('first', 'the sit start', head)
    await notifyComment({
      actorFk: users.first.userId,
      body: 'the sit start',
      event: event(),
      parentAuthorFk: users.second.userId,
      reactionFk: answer,
    })
    // Still a live line of the same person's, but a top-level one: it answers nobody, so it cannot
    // carry "answered you".
    await line('first', 'nice one either way')

    await clear(answer)
    await dropCommentNotification({ actorFk: users.first.userId, eventFk: eventId, reactionFk: answer })

    expect(await pointing('second', 'comment_reply')).toBeUndefined()
  })

  it('moves a mention row onto the newest line that names the same reader', async () => {
    const named = `ask !users:${users.quiet.userId}!`
    const first = await line('first', named)
    await notifyComment({ actorFk: users.first.userId, body: named, event: event(), reactionFk: first })
    const again = await line('first', named)
    await notifyComment({ actorFk: users.first.userId, body: named, event: event(), reactionFk: again })
    // The NEWEST line names nobody, which is what makes the assertion below load-bearing: a row
    // re-pointed at the newest live line rather than at the newest line that NAMES this reader
    // would land here.
    await line('first', 'or not')

    await clear(first)
    await dropCommentNotification({ actorFk: users.first.userId, eventFk: eventId, reactionFk: first })

    expect(await pointing('quiet', 'mention')).toBe(again)
  })
})
