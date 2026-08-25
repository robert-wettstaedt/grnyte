/**
 * The fold, against a real database.
 *
 * Deliberately not a fake db. Three of the four behaviours here are enforced by SQL rather than by
 * TypeScript (the `ON CONFLICT` merge, the `btrim` undo comparison, the unique index that makes
 * the merge possible at all), so a fake would assert that the code calls drizzle in a particular
 * order and prove nothing about what lands in the table.
 *
 * Skipped when DATABASE_URL is unreachable, so `npm test` still passes without a local stack.
 */
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { reachable, sql } from '$lib/db/testDb'
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { canHardDelete, changed, createUpdateEvent, deleteEvent, insertEvent } from './event.server'

let region = 0
let actor = 0
let other = 0
let route = 0
let twin = 0
let ownsTwin = false
let area = 0
let block = 0

async function reset() {
  if (route !== 0) await db.delete(schema.events).where(eq(schema.events.routeFk, route))
}

/**
 * A region, area, block and route of the suite's own, none of them rows the database already had.
 * An earlier version took the first live route and deleted every event on it in `beforeEach`, which
 * erases real history (and, through the cascade, other people's reactions) as soon as the app
 * starts writing events on a dev database.
 *
 * The whole geography is created here rather than borrowed, because borrowing the first live block
 * is not stable in a full run: the CI database is seeded with users and nothing else, half a dozen
 * server suites create and drop their own regions in parallel, and the block a `limit 1` lands on
 * belongs to one of them. When that suite tore its region down mid-run, every insert here failed on
 * `events_region_fk_regions_id_fk`. Nothing in this file depends on which region it is, only that
 * it is ours.
 *
 * The twin is a block whose id EQUALS the route's, inserted when the two sequences do not already
 * collide. It is what makes the five `isNull` clauses in `objectMatches` testable at all: matching
 * on any old block proves nothing, since its id differs anyway.
 */
if (reachable) {
  // Ordered, for the same reason: another suite's throwaway accounts come and go under an
  // unordered `limit 2`, and the seed logins are the lowest ids there are.
  const [a, o] = await db.select().from(schema.users).orderBy(asc(schema.users.id)).limit(2)

  if (a != null && o != null) {
    const name = 'event.server.test fixture'

    const [reg] = await db.insert(schema.regions).values({ createdBy: a.id, name }).returning()
    const [ar] = await db
      .insert(schema.areas)
      .values({ createdBy: a.id, name, regionFk: reg.id, type: 'crag' })
      .returning()
    const [b] = await db
      .insert(schema.blocks)
      .values({ areaFk: ar.id, createdBy: a.id, name, order: 0, regionFk: reg.id })
      .returning()
    const [r] = await db
      .insert(schema.routes)
      .values({ blockFk: b.id, createdBy: a.id, name, regionFk: reg.id })
      .returning()

    const [shared] = await db.select().from(schema.blocks).where(eq(schema.blocks.id, r.id)).limit(1)
    const [t] =
      shared == null
        ? await db
            .insert(schema.blocks)
            .values({ areaFk: ar.id, createdBy: a.id, id: r.id, name, order: 0, regionFk: reg.id })
            .returning()
        : [shared]

    route = r.id
    region = reg.id
    actor = a.id
    other = o.id
    twin = t.id
    ownsTwin = shared == null
    area = ar.id
    block = b.id
  }
}

const usable = reachable && route !== 0

afterAll(async () => {
  // The fixtures take their events with them through `events.<object>_fk on delete cascade`, and
  // the region can only go once nothing points at it, so this unwinds in insert order reversed.
  if (route !== 0) await db.delete(schema.routes).where(eq(schema.routes.id, route))
  if (ownsTwin) await db.delete(schema.blocks).where(eq(schema.blocks.id, twin))
  if (block !== 0) await db.delete(schema.blocks).where(eq(schema.blocks.id, block))
  if (area !== 0) await db.delete(schema.areas).where(eq(schema.areas.id, area))
  if (region !== 0) await db.delete(schema.regions).where(eq(schema.regions.id, region))
  await sql.end()
})

beforeEach(reset)

const object = () => ({ id: route, type: 'route' as const })

describe.skipIf(!usable)('the fold decides open-versus-join', () => {
  it('joins an event the same actor opened inside the window, keeping its id', async () => {
    const first = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    const second = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })

    // Same row, which is the entire point: a reaction attached to it survives the second save.
    expect(second.id).toBe(first.id)
    // And the verb is NOT overwritten, so "Anna added Traumtanz" absorbs its own refinements
    // rather than turning into "Anna edited Traumtanz".
    expect(second.verb).toBe('create')
  })

  it('refloats the joined event, by the database clock rather than the caller s', async () => {
    const first = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })

    const aged = new Date(Date.now() - 5 * 60 * 1000)
    await db.update(schema.events).set({ createdAt: aged }).where(eq(schema.events.id, first.id))

    await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })

    const stored = await db.query.events.findFirst({ where: eq(schema.events.id, first.id) })
    expect(stored?.createdAt.getTime()).toBeGreaterThan(aged.getTime())
  })

  it('gives a different actor their own event', async () => {
    const mine = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    const theirs = await insertEvent(db, { actorFk: other, object: object(), regionFk: region, verb: 'update' })

    expect(theirs.id).not.toBe(mine.id)
  })

  it('does not join across metadata, so two photos on one block stay two events', async () => {
    const one = await insertEvent(db, {
      actorFk: actor,
      metadata: 'photo:1',
      object: object(),
      regionFk: region,
      verb: 'add',
    })
    const two = await insertEvent(db, {
      actorFk: actor,
      metadata: 'photo:2',
      object: object(),
      regionFk: region,
      verb: 'add',
    })

    expect(two.id).not.toBe(one.id)
  })

  it('does not join an event opened outside the window', async () => {
    const old = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    await db
      .update(schema.events)
      .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(schema.events.id, old.id))

    const fresh = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    expect(fresh.id).not.toBe(old.id)
  })
})

describe.skipIf(!usable)('changes merge, undo and empty out', () => {
  const changesOf = (eventId: number) => db.select().from(schema.changes).where(eq(schema.changes.eventFk, eventId))

  it('merges a second edit of the same column into one row, A to C', async () => {
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'C' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })

    const [event] = await db.select().from(schema.events).where(eq(schema.events.routeFk, route))
    const rows = await changesOf(event.id)

    expect(rows).toHaveLength(1)
    // B was never a state the crag was left in, so nobody is told about it.
    expect(rows[0].oldValue).toBe('A')
    expect(rows[0].newValue).toBe('C')
  })

  it('deletes the change when an edit ends where it started, and the event with it', async () => {
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })

    const events = await db.select().from(schema.events).where(eq(schema.events.routeFk, route))
    expect(events).toHaveLength(0)
  })

  it('keeps a create event that folded back, because creating still happened', async () => {
    const created = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })

    const events = await db.select().from(schema.events).where(eq(schema.events.id, created.id))
    // Only an `update` event empties itself. The create is what happened, diff or no diff.
    expect(events).toHaveLength(1)
    expect(await changesOf(created.id)).toHaveLength(0)
  })

  it('does not refloat a create whose edit undid itself', async () => {
    const created = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    const [edited] = await db.select().from(schema.events).where(eq(schema.events.id, created.id))

    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })

    const [after] = await db.select().from(schema.events).where(eq(schema.events.id, created.id))
    // A rename typed and untyped is nothing happening, so "Anna added Traumtanz" stays where it
    // was instead of jumping back to the top of everybody's feed.
    expect(after.createdAt.getTime()).toBe(edited.createdAt.getTime())
  })

  it('reports whether the submission changed anything, not whether a row survived', async () => {
    const first = await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    const undone = await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })
    const untouched = await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })

    expect(first).toBe(true)
    // Undoing is still an edit somebody made, and its owner still wants telling.
    expect(undone).toBe(true)
    expect(untouched).toBe(false)
  })

  it('leaves whitespace-only reserialisation unreported', async () => {
    const moved = await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { description: 'hi\n' },
      object: object(),
      oldEntity: { description: 'hi' },
      regionFk: region,
    })

    expect(moved).toBe(false)
    expect(await db.select().from(schema.events).where(eq(schema.events.routeFk, route))).toHaveLength(0)
  })
})

describe.skipIf(!usable)('a refinement joins, a repeat collapses, a different verb does neither', () => {
  it('never folds a delete into an open update, so the deletion is still recorded', async () => {
    const edit = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    const removal = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'delete' })

    expect(removal.id).not.toBe(edit.id)
    expect(removal.verb).toBe('delete')
  })

  it('never folds an add into an open create, so the upload is still its own card', async () => {
    const created = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    const added = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'add' })

    expect(added.id).not.toBe(created.id)
  })

  it('collapses a byte-identical repeat, so three photos off one route is one card', async () => {
    const removals = []
    for (let index = 0; index < 3; index++) {
      removals.push(
        await insertEvent(db, {
          actorFk: actor,
          metadata: 'photo',
          object: object(),
          regionFk: region,
          verb: 'remove',
        }),
      )
    }

    expect(new Set(removals.map((event) => event.id)).size).toBe(1)
  })
})

describe.skipIf(!usable)('an undone update keeps anything somebody else said', () => {
  it('does not delete an emptied event that carries a reaction', async () => {
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'B' },
      object: object(),
      oldEntity: { name: 'A' },
      regionFk: region,
    })
    const [event] = await db.select().from(schema.events).where(eq(schema.events.routeFk, route))

    const [reactor] = await db.select().from(schema.users).where(eq(schema.users.id, other))
    await db.insert(schema.reactions).values({
      authUserFk: reactor.authUserFk,
      body: '👍',
      eventFk: event.id,
      regionFk: region,
      type: 'emoji',
      userFk: other,
    })

    // The author changes their mind. Without the guard this cascades the reaction away.
    await createUpdateEvent(db, {
      actorFk: actor,
      newEntity: { name: 'A' },
      object: object(),
      oldEntity: { name: 'B' },
      regionFk: region,
    })

    const after = await db.select().from(schema.events).where(eq(schema.events.id, event.id))
    expect(after).toHaveLength(1)
    expect(await db.select().from(schema.reactions).where(eq(schema.reactions.eventFk, event.id))).toHaveLength(1)
  })

  it('refuses a hard delete once somebody has reacted, however young the row', async () => {
    const event = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    expect(await canHardDelete(db, { childless: true, createdAt: new Date(), object: object() })).toBe(true)

    const [reactor] = await db.select().from(schema.users).where(eq(schema.users.id, other))
    await db.insert(schema.reactions).values({
      authUserFk: reactor.authUserFk,
      body: '💪',
      eventFk: event.id,
      regionFk: region,
      type: 'emoji',
      userFk: other,
    })

    // A mistake leaves no trace; somebody else's words are not part of the mistake.
    expect(await canHardDelete(db, { childless: true, createdAt: new Date(), object: object() })).toBe(false)
  })

  it('does not count a reaction that was taken back', async () => {
    const event = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    const [reactor] = await db.select().from(schema.users).where(eq(schema.users.id, other))
    await db.insert(schema.reactions).values({
      authUserFk: reactor.authUserFk,
      body: '👍',
      deletedAt: new Date(),
      eventFk: event.id,
      regionFk: region,
      type: 'emoji',
      userFk: other,
    })

    // The table soft-deletes, so an un-tapped emoji is still a row. Counting it would disable the
    // grace window for this entity for good.
    expect(await canHardDelete(db, { childless: true, createdAt: new Date(), object: object() })).toBe(true)
  })

  it('refuses a hard delete when the caller says the row still has children', async () => {
    expect(await canHardDelete(db, { childless: false, createdAt: new Date(), object: object() })).toBe(false)
  })

  it('refuses a hard delete on anything older than the window', async () => {
    expect(
      await canHardDelete(db, { childless: true, createdAt: new Date(Date.now() - 16 * 60 * 1000), object: object() }),
    ).toBe(false)
  })
})

describe.skipIf(!usable)('an undo erases exactly what its mutation logged', () => {
  const eventsOnRoute = () => db.select().from(schema.events).where(eq(schema.events.routeFk, route))

  it('takes the delete event and leaves the rest of the entity history standing', async () => {
    const created = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'delete' })

    await deleteEvent(db, { object: object(), verb: 'delete' })

    expect((await eventsOnRoute()).map((row) => row.id)).toEqual([created.id])
  })

  it('tells an explicit null metadata from an omitted one', async () => {
    // The shape a revoked invitation and a removed member share: same verb, and only the
    // metadata says which of them this is.
    const invitation = await insertEvent(db, {
      actorFk: actor,
      metadata: 'lea@example.com',
      object: object(),
      regionFk: region,
      verb: 'remove',
    })
    await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'remove' })

    await deleteEvent(db, { metadata: null, object: object(), verb: 'remove' })

    expect((await eventsOnRoute()).map((row) => row.id)).toEqual([invitation.id])
  })

  it('deletes nothing at all when the filter constrains nothing', async () => {
    await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })

    await deleteEvent(db, {})

    expect(await eventsOnRoute()).toHaveLength(1)
  })
})

describe.skipIf(!usable)('the object is a real foreign key', () => {
  it('sets exactly one object column and leaves the other five null', async () => {
    const event = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'create' })
    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, event.id))

    expect(row.routeFk).toBe(route)
    expect([row.areaFk, row.ascentFk, row.blockFk, row.fileFk, row.subjectFk]).toEqual([null, null, null, null, null])
  })

  it('does not join an event about a different entity that shares an id', async () => {
    expect(twin).toBe(route) // the fixture guarantees the collision, so this never silently passes

    const onRoute = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    const onBlock = await insertEvent(db, {
      actorFk: actor,
      object: { id: twin, type: 'block' },
      regionFk: region,
      verb: 'update',
    })

    expect(onBlock.id).not.toBe(onRoute.id)

    const [row] = await db.select().from(schema.events).where(eq(schema.events.id, onBlock.id))
    expect(row.blockFk).toBe(twin)
    expect(row.routeFk).toBeNull()

    await db.delete(schema.events).where(eq(schema.events.id, onBlock.id))
  })
})

// Pure, so it needs no database and no skip guard. Lifted from the retired
// `activity.server.test.ts` along with the function it covers.
describe('changed', () => {
  it('ignores whitespace the editor added around a value', () => {
    // Opening a description and saving it untouched reserialises it with a trailing newline.
    expect(changed('Sit start on crimps.', 'Sit start on crimps.\n')).toBe(false)
    expect(changed('  Kante  ', 'Kante')).toBe(false)
  })

  // A column that was SQL NULL and a form that submits '' are the same state, "not set". The
  // old comparison stringified null to "null", so an untouched save on a v1 row logged a card
  // whose two sides both read "Not set".
  it('treats an absent value and an empty one as the same', () => {
    expect(changed(null, '')).toBe(false)
    expect(changed(undefined, '')).toBe(false)
  })

  it('still sees a real edit', () => {
    expect(changed('Kante', 'Kante direkt')).toBe(true)
    expect(changed(null, 'Kante')).toBe(true)
    expect(changed('Kante', '')).toBe(true)
    // Whitespace inside is left alone: two trailing spaces on a line are a markdown hard break.
    expect(changed('one\ntwo', 'one  \ntwo')).toBe(true)
  })
})
