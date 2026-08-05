import type * as schema from '$lib/db/schema'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { describe, expect, it } from 'vitest'
import {
  activityFilterConditions,
  changed,
  createUpdateActivity,
  insertActivity,
  reassignActivityEntity,
  type ActivityInput,
} from './activity.server'

/**
 * Fake db capturing delete/insert/update calls. The debounce deletes duplicates before
 * inserting, and `createUpdateActivity` folds into whatever `existing` hands back.
 *
 * Deletes are counted rather than identified: only the fold-back branch deletes, so a count
 * says which branch ran without the fake having to read drizzle's `where`.
 */
const fakeDb = (existing: Partial<schema.Activity>[] = []) => {
  const calls = {
    deletes: 0,
    inserted: null as null | schema.InsertActivity[],
    updates: [] as Record<string, unknown>[],
  }
  const db = {
    delete: () => ({ where: async () => void calls.deletes++ }),
    insert: () => ({
      values: async (v: schema.InsertActivity[]) => {
        calls.inserted = v
      },
    }),
    query: { activities: { findMany: async () => existing } },
    update: () => ({
      set: (values: Record<string, unknown>) => ({ where: async () => void calls.updates.push(values) }),
    }),
  } as unknown as PostgresJsDatabase<typeof schema>
  return { calls, db }
}

/**
 * What a mutation passes: ids as it holds them, parent left off when there isn't one.
 *
 * `block:updated:name` rather than a bare `block:updated`, because `ActivityInput` is now
 * derived from the catalogue and a column-less block update is not a triple anything
 * declares. The cast is the fixture widening its own overrides, not a hole in the seam:
 * `Partial` over a union does not distribute, so the spread cannot be inferred back into
 * one member.
 */
type Override = Partial<Omit<schema.InsertActivity, 'entityId' | 'parentEntityId'>> & {
  entityId?: number | string
  parentEntityId?: null | number | string
}

const activity = (over: Override = {}): ActivityInput =>
  ({
    columnName: 'name',
    entityId: 42,
    entityType: 'block',
    regionFk: 1,
    type: 'updated',
    userFk: 1,
    ...over,
  }) as ActivityInput

/** What that becomes on the way to the table: text ids, parent always present. */
const row = (over: Partial<schema.InsertActivity> = {}): schema.InsertActivity => ({
  columnName: 'name',
  entityId: '42',
  entityType: 'block',
  parentEntityId: null,
  regionFk: 1,
  type: 'updated',
  userFk: 1,
  ...over,
})

describe('insertActivity', () => {
  it('does nothing for an empty array', async () => {
    const { calls, db } = fakeDb()
    await insertActivity(db, [])
    expect(calls.deletes).toBe(0)
    expect(calls.inserted).toBeNull()
  })

  it('debounces then inserts a single activity', async () => {
    const { calls, db } = fakeDb()
    await insertActivity(db, activity())
    expect(calls.deletes).toBe(1)
    expect(calls.inserted).toEqual([row()])
  })

  it('debounces per item, inserts once', async () => {
    const { calls, db } = fakeDb()
    await insertActivity(db, [activity(), activity({ entityId: 43 })])
    expect(calls.deletes).toBe(2)
    expect(calls.inserted).toEqual([row(), row({ entityId: '43' })])
  })

  // The cast callers used to spell themselves. Getting it wrong wrote the literal "null" into
  // `parent_entity_id`, which `mapper.ts` still reads back as absent.
  it('casts ids to text and an absent parent to null', async () => {
    const { calls, db } = fakeDb()
    await insertActivity(db, [
      activity({ entityId: 7, parentEntityId: 9 }),
      activity({ entityId: 'cuid', parentEntityId: null }),
      activity({ entityId: 8, parentEntityId: undefined }),
    ])
    expect(calls.inserted).toEqual([
      row({ entityId: '7', parentEntityId: '9' }),
      row({ entityId: 'cuid' }),
      row({ entityId: '8' }),
    ])
  })
})

describe('createUpdateActivity', () => {
  /** A row the same user wrote minutes ago, which is what a second save folds into. */
  const open = (over: Partial<schema.Activity> = {}): Partial<schema.Activity> => ({
    columnName: 'location',
    id: 1,
    metadata: null,
    oldValue: 'A',
    type: 'updated',
    ...over,
  })

  const move = (db: PostgresJsDatabase<typeof schema>, from: string, to: string, metadata?: string) =>
    createUpdateActivity({
      db,
      entityId: 42,
      entityType: 'block',
      metadata,
      newEntity: { location: to },
      oldEntity: { location: from },
      regionFk: 1,
      userFk: 1,
    })

  it('folds a second edit into the row the first one wrote', async () => {
    const { calls, db } = fakeDb([open()])
    // A→B is already logged; B→C has to leave one row reading A→C, not a second card for a
    // state the crag was never left in.
    await move(db, 'B', 'C')

    expect(calls.updates).toEqual([{ createdAt: expect.any(Date), newValue: 'C' }])
    expect(calls.inserted).toBeNull()
  })

  it('deletes the row when the edit folds back to where it started', async () => {
    const { calls, db } = fakeDb([open()])
    await move(db, 'B', 'A')

    // "A → A" is not a change, and the location renderer would read it as a confirmed pin.
    expect(calls.deletes).toBe(1)
    expect(calls.updates).toEqual([])
    expect(calls.inserted).toBeNull()
  })

  const PHOTO_1 = '{"action":"lines","topoId":1}'
  const PHOTO_2 = '{"action":"lines","topoId":2}'

  it('keeps rows about different things apart', async () => {
    const { calls, db } = fakeDb([open({ metadata: PHOTO_1 })])
    // Same block, same column, same minute, other photo: two changes, not one. Only the
    // metadata differs, so dropping that half of the predicate fails here rather than
    // quietly folding two unrelated photo edits into one A→C row.
    await move(db, 'B', 'C', PHOTO_2)

    expect(calls.updates).toEqual([])
    expect(calls.inserted).toEqual([row({ columnName: 'location', metadata: PHOTO_2, newValue: 'C', oldValue: 'B' })])
  })

  it('folds two saves on one photo', async () => {
    const { calls, db } = fakeDb([open({ metadata: PHOTO_1 })])
    await move(db, 'B', 'C', PHOTO_1)

    expect(calls.updates).toEqual([{ createdAt: expect.any(Date), newValue: 'C' }])
    expect(calls.inserted).toBeNull()
  })
})

describe('deleteActivity filters', () => {
  // An undo that does not pin `columnName` also matches the column-scoped deletes logged
  // against the same entity, so restoring a route erased its photo-removal history too.
  it('constrains nothing for an omitted field and IS NULL for an explicit one', () => {
    const unscoped = activityFilterConditions({ entityId: 42, entityType: 'route', type: 'deleted' })
    const scoped = activityFilterConditions({
      columnName: null,
      entityId: 42,
      entityType: 'route',
      type: 'deleted',
    })

    expect(unscoped).toHaveLength(3)
    // The fourth condition is the `IS NULL` that keeps `route:deleted:file` rows out of it.
    expect(scoped).toHaveLength(4)
  })
})

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

describe('reassignActivityEntity', () => {
  // A hard restore brings the entity back under a new id. Moving only `entityId` leaves the
  // route's own uploads and ascent rows naming a parent that no longer exists, so both columns
  // have to move, and the ids have to arrive as text.
  it('moves both the subject and the parent onto the new id', async () => {
    const { calls, db } = fakeDb()
    await reassignActivityEntity(db, { entityType: 'route', fromId: 599, toId: 600 })

    expect(calls.updates).toEqual([{ entityId: '600' }, { parentEntityId: '600' }])
  })
})
