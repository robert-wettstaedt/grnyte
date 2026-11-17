/**
 * The client schema against what the streams actually deliver. A column the streams send but the client does not
 * declare is dropped without an error, so every row the engine routes from the real database must fit the schema.
 * Skipped without DATABASE_URL.
 */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { syncedTables, SyncedWorld } from './evaluate.server'
import { appSchema } from './schema'

afterAll(async () => {
  await sql.end()
})

describe('the client schema', () => {
  it('declares exactly the tables the streams sync', () => {
    expect(appSchema.tables.map((table) => table.name).sort()).toEqual(syncedTables)
  })

  it.skipIf(!reachable)('declares every column the streams deliver', async () => {
    const world = new SyncedWorld()
    for (const table of syncedTables) world.add(table, await sql`select * from ${sql('public.' + table)} limit 50`)
    const declared = new Map(appSchema.tables.map((table) => [table.name, new Set(table.columns.map((c) => c.name))]))

    const missing = new Set<string>()
    for (const { data, table } of world.routed()) {
      for (const column of Object.keys(data)) {
        if (column !== 'id' && !declared.get(table)?.has(column)) missing.add(`${table}.${column}`)
      }
    }
    expect([...missing].sort()).toEqual([])
  })
})
