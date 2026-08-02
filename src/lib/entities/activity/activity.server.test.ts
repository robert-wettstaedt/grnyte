import type * as schema from '$lib/db/schema'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { describe, expect, it } from 'vitest'
import { insertActivity, type ActivityInput } from './activity.server'

/** Fake db capturing delete/insert calls — debounce deletes duplicates before inserting. */
const fakeDb = () => {
  const calls = { deletes: 0, inserted: null as null | schema.InsertActivity[] }
  const db = {
    delete: () => ({ where: async () => void calls.deletes++ }),
    insert: () => ({
      values: async (v: schema.InsertActivity[]) => {
        calls.inserted = v
      },
    }),
  } as unknown as PostgresJsDatabase<typeof schema>
  return { calls, db }
}

/** What a mutation passes: ids as it holds them, parent left off when there isn't one. */
const activity = (over: Partial<ActivityInput> = {}): ActivityInput => ({
  entityId: 42,
  entityType: 'block',
  regionFk: 1,
  type: 'updated',
  userFk: 1,
  ...over,
})

/** What that becomes on the way to the table: text ids, parent always present. */
const row = (over: Partial<schema.InsertActivity> = {}): schema.InsertActivity => ({
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
