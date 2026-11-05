/**
 * The merge's declared reach against the live schema: a new foreign key into areas, blocks or routes,
 * or a new markdown column, fails here until it is decided. Skipped without DATABASE_URL.
 */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { FOREIGN_KEYS, LEFT_AS_WRITTEN, REWRITTEN, TEXT_REFERENCES } from './repoint.server'

afterAll(async () => {
  await sql.end()
})

describe.skipIf(!reachable)('merge catalogue', () => {
  it('declares every foreign key into areas, blocks and routes', async () => {
    const rows = await sql<{ ref: string }[]>`
      select tc.table_name || '.' || kcu.column_name as ref
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_name in ('areas', 'blocks', 'routes')`

    expect(rows.map((row) => row.ref).sort()).toEqual(Object.keys(FOREIGN_KEYS).sort())
  })

  it('names only text references that still exist', async () => {
    const rows = await sql<{ ref: string }[]>`
      select table_name || '.' || column_name as ref from information_schema.columns where table_schema = 'public'`
    const existing = new Set(rows.map((row) => row.ref))

    expect(Object.keys(TEXT_REFERENCES).filter((ref) => !existing.has(ref))).toEqual([])
  })

  it('decides every markdown column', async () => {
    const rows = await sql<{ ref: string }[]>`
      select table_name || '.' || column_name as ref from information_schema.columns
      where table_schema = 'public' and data_type = 'text' and column_name in ('description', 'notes', 'body')`

    const decided = [...REWRITTEN, ...LEFT_AS_WRITTEN].map(([table, column]) => `${table}.${column}`)
    expect(rows.map((row) => row.ref).sort()).toEqual(decided.sort())
  })
})
