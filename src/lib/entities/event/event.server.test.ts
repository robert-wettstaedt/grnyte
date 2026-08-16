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
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { canHardDelete, createUpdateEvent, deleteEvent, insertEvent } from './event.server'

let region = 0
let actor = 0
let other = 0
let route = 0

async function reset() {
  if (route !== 0) await db.delete(schema.events).where(eq(schema.events.routeFk, route))
}

/**
 * Found, not hard-coded. An earlier version pinned region 6 and dereferenced the first route in
 * it, which throws a TypeError during top-level await on any database where that region is empty:
 * the file errors out instead of reporting as skipped, and `describe.skipIf` never gets to run.
 * Any region with a live route will do, since nothing here depends on which one.
 */
if (reachable) {
  const [r] = await db.select().from(schema.routes).where(isNull(schema.routes.deletedAt)).limit(1)
  const [a, b] = await db.select().from(schema.users).limit(2)

  if (r != null && a != null && b != null) {
    route = r.id
    region = r.regionFk
    actor = a.id
    other = b.id
  }
}

const usable = reachable && route !== 0

afterAll(async () => {
  if (reachable) await reset()
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
    expect(second.createdAt.getTime()).toBeGreaterThanOrEqual(first.createdAt.getTime())
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
    const [block] = await db
      .select()
      .from(schema.blocks)
      .where(and(eq(schema.blocks.regionFk, region), inArray(schema.blocks.id, [route])))
      .limit(1)

    if (block == null) return // no block shares this route's id in the seed, nothing to prove here

    const onRoute = await insertEvent(db, { actorFk: actor, object: object(), regionFk: region, verb: 'update' })
    const onBlock = await insertEvent(db, {
      actorFk: actor,
      object: { id: block.id, type: 'block' },
      regionFk: region,
      verb: 'update',
    })

    expect(onBlock.id).not.toBe(onRoute.id)
    await db.delete(schema.events).where(eq(schema.events.id, onBlock.id))
  })
})
