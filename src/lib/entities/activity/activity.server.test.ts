import { describe, expect, it } from 'vitest'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '$lib/db/schema'
import { insertActivity } from './activity.server'

/** Fake db capturing delete/insert calls — debounce deletes duplicates before inserting. */
const fakeDb = () => {
  const calls = { deletes: 0, inserted: null as schema.InsertActivity[] | null }
  const db = {
    delete: () => ({ where: async () => void calls.deletes++ }),
    insert: () => ({
      values: async (v: schema.InsertActivity[]) => {
        calls.inserted = v
      },
    }),
  } as unknown as PostgresJsDatabase<typeof schema>
  return { db, calls }
}

const activity = (over: Partial<schema.InsertActivity> = {}): schema.InsertActivity => ({
  type: 'updated',
  userFk: 1,
  entityId: '42',
  entityType: 'block',
  regionFk: 1,
  ...over,
})

describe('insertActivity', () => {
  it('does nothing for an empty array', async () => {
    const { db, calls } = fakeDb()
    await insertActivity(db, [])
    expect(calls.deletes).toBe(0)
    expect(calls.inserted).toBeNull()
  })

  it('debounces then inserts a single activity', async () => {
    const { db, calls } = fakeDb()
    const item = activity()
    await insertActivity(db, item)
    expect(calls.deletes).toBe(1)
    expect(calls.inserted).toEqual([item])
  })

  it('debounces per item, inserts once', async () => {
    const { db, calls } = fakeDb()
    const items = [activity(), activity({ entityId: '43' })]
    await insertActivity(db, items)
    expect(calls.deletes).toBe(2)
    expect(calls.inserted).toEqual(items)
  })
})
