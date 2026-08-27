// @vitest-environment node
/**
 * The fan-out, against a real database.
 *
 * Everything interesting here is a query, so a mock would only assert that the code calls the
 * functions it calls. Two things are worth proving:
 *
 * 1. **The recipient set is exactly who can read the region.** `notificationRecipients` mirrors
 *    the `events` SELECT policy by hand, and a hand-written mirror is the kind of thing that
 *    drifts silently. So it is not asserted against a list written out here: it is asserted
 *    against who can really `SELECT` a row in that region, impersonated the way `createDrizzle`
 *    does. Loosen the helper and this fails.
 * 2. **A repeated event does not repeat the notification.** For an event that can genuinely happen
 *    twice the unique index is what collapses it; for a mention, which cannot, the diff against
 *    the previous body is, because the row the index needs does not outlive cleanup.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { notifications } from '$lib/db/schema'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { eq, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  notificationRecipients,
  notify,
  notifyMentions,
  notifyOutOfBand,
  readableRegions,
  retractOutOfBand,
} from './notification.server'

const REGION_NAME = '__notification_test__'

/**
 * One account per membership shape the recipient rule has to decide, plus the actor.
 *
 * `inactive` is the one that matters most: an inactive membership is not a membership, and it is
 * the case a `region_fk` check alone would get wrong.
 */
const WHO = ['actor', 'admin', 'member', 'inactive', 'outsider'] as const

type Who = (typeof WHO)[number]

let users = {} as Record<Who, SeedUser>
let regionId = 0
/** An event in the fixture region, the thing the recipient rule is mirrored from. */
let eventId = 0
/** A real route in the fixture region: the thing the notifications point at. */
let routeId = 0
/** An ascent on it, for the mention rows, which are about somebody's ascent notes. */
let ascentId = 0

/** Rolls back whatever `fn` did, so a read never leaves anything behind. */
const ROLLBACK = Symbol('rollback')

/** Runs `fn` as `who`, impersonated the way `createDrizzle` does. Always rolls back. */
async function as<T>(who: Who, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const { authId, email } = users[who]
  const claims = JSON.stringify({ email, role: 'authenticated', sub: authId })

  let result!: T
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${claims}, true)`
      await tx.unsafe('set local role app_writer')
      result = await fn(tx)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result
}

/** Whether `who` can actually `SELECT` the fixture event, which is what "may be told about
 *  something in this region" means. */
async function canReadRegion(who: Who): Promise<boolean> {
  const rows = await as(who, (tx) => tx`select 1 from public.events where id = ${eventId}`)
  return rows.length > 0
}

async function removeFixtures() {
  await sql`delete from public.notifications where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.events where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  // Crag first, and in child-to-parent order: a notification's object columns are foreign keys, so
  // the route cannot go while a row still points at it.
  await sql`delete from public.ascents where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.routes where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.blocks where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = ${REGION_NAME})`
  await sql`delete from public.regions where name = ${REGION_NAME}`
}

beforeAll(async () => {
  if (!reachable) return

  await removeFixtures()

  const created = await Promise.all(WHO.map((who) => createThrowawayUser(who)))
  users = Object.fromEntries(WHO.map((who, index) => [who, created[index]])) as Record<Who, SeedUser>
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members)
    values (${REGION_NAME}, ${users.actor.userId}, 10) returning id`

  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk) values
      (${regionId}, 'region_admin', true, ${users.actor.authId}, ${users.actor.userId}),
      (${regionId}, 'region_admin', true, ${users.admin.authId}, ${users.admin.userId}),
      (${regionId}, 'region_user', true, ${users.member.authId}, ${users.member.userId}),
      (${regionId}, 'region_user', false, ${users.inactive.authId}, ${users.inactive.userId})`
  // A real route to point the notifications at. The object columns are foreign keys now, so a
  // made-up id is rejected by the database rather than stored and never looked at.
  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type)
    values ('Klein Ilsetal', ${users.actor.userId}, ${regionId}, 'crag') returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Nordblock', ${users.actor.userId}, ${regionId}, ${areaId}, 0) returning id`
  ;[{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk)
    values ('Kante direkt', ${users.actor.userId}, ${regionId}, ${blockId}) returning id`
  ;[{ id: ascentId }] = await sql<{ id: number }[]>`
    insert into public.ascents (type, created_by, region_fk, route_fk)
    values ('flash', ${users.member.userId}, ${regionId}, ${routeId}) returning id`

  // The row `canReadRegion` probes. An EVENT, not an activity: the recipient rule mirrors the
  // events SELECT policy, so what this asserts against has to be a row that policy governs.
  ;[{ id: eventId }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk)
    values ('create', ${users.actor.userId}, ${regionId}, ${routeId}) returning id`
})

afterAll(async () => {
  if (reachable) {
    await removeFixtures()
    await Promise.all(WHO.map((who) => dropThrowawayUser(users[who])))
  }
  await sql.end()
})

beforeEach(async () => {
  if (reachable) await sql`delete from public.notifications where region_fk = ${regionId}`
})

describe.skipIf(!reachable)('notificationRecipients', () => {
  /**
   * The assertion the whole file exists for. Not "these two ids come back": "exactly the people
   * who can read the row come back", answered by the database itself.
   */
  it('matches who can actually read the region, minus the actor', async () => {
    const candidates = WHO.map((who) => users[who].userId)
    const recipients = await notificationRecipients(regionId, candidates, users.actor.userId)

    const expected: number[] = []
    for (const who of WHO) {
      if (who !== 'actor' && (await canReadRegion(who))) {
        expected.push(users[who].userId)
      }
    }

    expect(recipients.map((recipient) => recipient.userFk).sort()).toEqual(expected.sort())
    // Non-empty, so a helper that silently returned nothing could not pass this by agreeing with
    // an equally silent policy failure.
    expect(recipients.length).toBeGreaterThan(0)
  })

  it('carries the auth id the row s RLS predicate compares', async () => {
    const [recipient] = await notificationRecipients(regionId, [users.member.userId], users.actor.userId)
    expect(recipient.authUserFk).toBe(users.member.authId)
  })

  it('drops the actor, even when they are the only candidate', async () => {
    expect(await notificationRecipients(regionId, [users.actor.userId], users.actor.userId)).toEqual([])
  })

  it('drops an inactive membership', async () => {
    expect(await notificationRecipients(regionId, [users.inactive.userId], users.actor.userId)).toEqual([])
  })

  it('drops somebody who is not in the region at all', async () => {
    expect(await notificationRecipients(regionId, [users.outsider.userId], users.actor.userId)).toEqual([])
  })
})

describe.skipIf(!reachable)('notify', () => {
  const rows = () =>
    db.select().from(notifications).where(eq(notifications.regionFk, regionId)).orderBy(notifications.userFk)

  it('writes one row per readable recipient', async () => {
    await notify({
      actorFk: users.actor.userId,
      object: { id: routeId, type: 'route' },
      regionFk: regionId,
      sourceType: 'ascent_edited',
      userFks: [users.admin.userId, users.member.userId, users.inactive.userId, users.outsider.userId],
    })

    const written = await rows()
    expect(written.map((row) => row.userFk).sort()).toEqual([users.admin.userId, users.member.userId].sort())
    expect(written[0].routeFk).toBe(routeId)
    expect(written[0].readAt).toBeNull()
  })

  it('does not write a second row for a repeat of the same event', async () => {
    const input = {
      actorFk: users.actor.userId,
      object: { id: routeId, type: 'route' as const },
      regionFk: regionId,
      sourceType: 'mention' as const,
      userFks: [users.member.userId],
    }

    await notify(input)
    await notify(input)

    expect(await rows()).toHaveLength(1)
  })

  // The same entity and the same actor, but a different sentence, so it is a different row.
  it('keeps two source types on one entity apart', async () => {
    const input = {
      actorFk: users.actor.userId,
      object: { id: routeId, type: 'route' as const },
      regionFk: regionId,
      userFks: [users.member.userId],
    }

    await notify({ ...input, sourceType: 'mention' })
    await notify({ ...input, sourceType: 'ascent_deleted' })

    expect(await rows()).toHaveLength(2)
  })

  /**
   * The other half of that rule, and the reason it is not a plain `do nothing`. The index carries
   * no time, so a row that survives (30 days after a read, 90 unread) would otherwise mute every
   * repeat of the same event for as long as it sits there.
   */
  it('tells somebody again about a repeat of something they already read', async () => {
    const input = {
      actorFk: users.actor.userId,
      object: { id: routeId, type: 'route' as const },
      regionFk: regionId,
      sourceType: 'ascent_edited' as const,
      userFks: [users.member.userId],
    }

    await notify(input)
    await db
      .update(notifications)
      .set({ pushedAt: new Date(), readAt: new Date() })
      .where(eq(notifications.regionFk, regionId))

    await notify(input)

    const written = await rows()
    // Still one row: the same event in the same place, not a second entry in the inbox.
    expect(written).toHaveLength(1)
    expect(written[0].readAt).toBeNull()
    // Undelivered again, or the cron would never push what it just revived.
    expect(written[0].pushedAt).toBeNull()
  })

  it('writes nothing when nobody is left to tell', async () => {
    await notify({
      actorFk: users.actor.userId,
      object: { id: routeId, type: 'route' },
      regionFk: regionId,
      sourceType: 'ascent_edited',
      userFks: [users.actor.userId, users.outsider.userId],
    })

    expect(await rows()).toHaveLength(0)
  })
})

describe.skipIf(!reachable)('readableRegions', () => {
  /** The same rule as the recipient set, from the other end, and batched: both halves of the cron
   *  ask it of everybody they are about to push to. */
  it('answers per person, and only for what they can still read', async () => {
    const byUser = await readableRegions([users.member.userId, users.inactive.userId, users.outsider.userId])

    expect(byUser.get(users.member.userId)).toContain(regionId)
    expect(byUser.get(users.inactive.userId)).toBeUndefined()
    expect(byUser.get(users.outsider.userId)).toBeUndefined()
  })

  it('asks nothing of an empty list', async () => {
    expect(await readableRegions([])).toEqual(new Map())
  })
})

describe.skipIf(!reachable)('notifyMentions', () => {
  const mentioned = () =>
    db
      .select()
      .from(notifications)
      .where(inArray(notifications.regionFk, [regionId]))

  it('notifies every user token in the body, once each', async () => {
    await notifyMentions({
      actorFk: users.actor.userId,
      body: `Belayed by !users:${users.member.userId}! and !users:${users.member.userId}! again.`,
      object: { id: ascentId, type: 'ascent' },
      regionFk: regionId,
    })

    const rows = await mentioned()
    expect(rows).toHaveLength(1)
    expect(rows[0].sourceType).toBe('mention')
    expect(rows[0].userFk).toBe(users.member.userId)
  })

  it('ignores area, block and route tokens, which are not people', async () => {
    await notifyMentions({
      actorFk: users.actor.userId,
      body: 'See !areas:1! and !blocks:2! and !routes:3!.',
      object: { id: ascentId, type: 'ascent' },
      regionFk: regionId,
    })

    expect(await mentioned()).toHaveLength(0)
  })

  it('writes nothing for a cleared body', async () => {
    await notifyMentions({
      actorFk: users.actor.userId,
      body: null,
      object: { id: ascentId, type: 'ascent' },
      regionFk: regionId,
    })

    expect(await mentioned()).toHaveLength(0)
  })

  it('tells only the name this save added', async () => {
    await notifyMentions({
      actorFk: users.actor.userId,
      body: `!users:${users.member.userId}! and !users:${users.admin.userId}!`,
      object: { id: ascentId, type: 'ascent' },
      previousBody: `!users:${users.member.userId}!`,
      regionFk: regionId,
    })

    const rows = await mentioned()
    expect(rows).toHaveLength(1)
    expect(rows[0].userFk).toBe(users.admin.userId)
  })

  /**
   * The regression: a mention is not an event that recurs, so an edit that leaves the text alone
   * must be silent even once the notification for it is gone or has been read. The read row is the
   * sharper half - {@link notify} re-arms one on conflict, so before the diff this pushed a
   * months-old mention again the next time anybody touched the entity for any other reason.
   */
  it('says nothing when the body still holds a mention it already sent', async () => {
    const body = `Belayed by !users:${users.member.userId}!`
    const input = {
      actorFk: users.actor.userId,
      body,
      object: { id: ascentId, type: 'ascent' as const },
      regionFk: regionId,
    }

    await notifyMentions(input)
    const read = new Date()
    await db.update(notifications).set({ pushedAt: read, readAt: read }).where(eq(notifications.regionFk, regionId))

    // An edit of something else entirely: same description, so the same refs come back out of it.
    await notifyMentions({ ...input, previousBody: body })

    const rows = await mentioned()
    expect(rows).toHaveLength(1)
    // Still read and still delivered, i.e. the cron has nothing to pick up.
    expect(rows[0].readAt).not.toBeNull()
    expect(rows[0].pushedAt).not.toBeNull()
  })

  it('mentions somebody again once their name has been taken out and written back', async () => {
    const input = {
      actorFk: users.actor.userId,
      body: `!users:${users.member.userId}!`,
      object: { id: ascentId, type: 'ascent' as const },
      regionFk: regionId,
    }

    await notifyMentions(input)
    await notifyMentions({ ...input, body: 'nobody', previousBody: input.body })
    await db.delete(notifications).where(eq(notifications.regionFk, regionId)) // cleanup, 30 days on
    await notifyMentions({ ...input, previousBody: 'nobody' })

    expect(await mentioned()).toHaveLength(1)
  })
})

describe.skipIf(!reachable)('notifyOutOfBand', () => {
  /** Every row in the fixture region, whoever it is for. */
  const rows = () =>
    db.query.notifications.findMany({
      columns: { pushedAt: true, sourceType: true, userFk: true },
      where: eq(notifications.regionFk, regionId),
    })

  it('writes a row for somebody notify would refuse, because they are not in the region', async () => {
    await notify({
      actorFk: users.actor.userId,
      object: { id: users.outsider.userId, type: 'user' },
      regionFk: regionId,
      sourceType: 'membership_removed',
      userFks: [users.outsider.userId],
    })
    expect(await rows()).toHaveLength(0)

    await notifyOutOfBand({
      actorFk: users.actor.userId,
      regionFk: regionId,
      sourceType: 'membership_removed',
      userFk: users.outsider.userId,
    })

    expect((await rows()).map((row) => row.userFk)).toEqual([users.outsider.userId])
  })

  /**
   * The property the whole design rests on: the row exists for the cron and for nobody else.
   *
   * Asserted against what the recipient can really `SELECT`, the same way the recipient rule is,
   * rather than against a policy written out here. Widen the SELECT policy and this fails, which
   * is the point: a visible row would be an inbox entry whose only action is a link into a region
   * the reader cannot open.
   */
  it('writes a row its own recipient cannot read', async () => {
    await notifyOutOfBand({
      actorFk: users.actor.userId,
      regionFk: regionId,
      sourceType: 'membership_removed',
      userFk: users.outsider.userId,
    })

    const visible = await as('outsider', (tx) => tx`select 1 from public.notifications where region_fk = ${regionId}`)
    expect(visible).toHaveLength(0)
    expect(await rows()).toHaveLength(1)
  })

  it('separates two regions, so being removed from both is told twice', async () => {
    const [{ id: otherRegionId }] = await sql<{ id: number }[]>`
      insert into public.regions (name, created_by, max_members)
      values (${`${REGION_NAME}_2`}, ${users.actor.userId}, 10) returning id`

    try {
      for (const region of [regionId, otherRegionId]) {
        await notifyOutOfBand({
          actorFk: users.actor.userId,
          regionFk: region,
          sourceType: 'membership_removed',
          userFk: users.outsider.userId,
        })
      }

      const all = await db.query.notifications.findMany({
        columns: { regionFk: true },
        where: inArray(notifications.regionFk, [regionId, otherRegionId]),
      })
      expect(all.map((row) => row.regionFk).sort()).toEqual([regionId, otherRegionId].sort())
    } finally {
      await sql`delete from public.notifications where region_fk = ${otherRegionId}`
      await sql`delete from public.regions where id = ${otherRegionId}`
    }
  })

  it('takes back a pending notice, and leaves a delivered one alone', async () => {
    const removal = {
      actorFk: users.actor.userId,
      regionFk: regionId,
      sourceType: 'membership_removed' as const,
      userFk: users.outsider.userId,
    }

    await notifyOutOfBand(removal)
    await retractOutOfBand(removal)
    expect(await rows()).toHaveLength(0)

    await notifyOutOfBand(removal)
    await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.regionFk, regionId))
    await retractOutOfBand(removal)
    expect(await rows()).toHaveLength(1)
  })
})
