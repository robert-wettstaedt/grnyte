/**
 * The table grants, which are the gate RLS is not.
 *
 * Policies decide what a role may touch; grants decide whether it may try. The split those two make
 * is the whole point of `app_writer`: `authenticated` is the role every browser's JWT names, so a
 * devtools console reaches the database as that role, and it has to be unable to write whatever a
 * policy says. A policy test cannot show this, because it runs as the role that CAN write.
 *
 * Read off `information_schema` rather than attempted as statements: a refused INSERT proves one
 * table refused one caller, and what has to hold is that no table anywhere grants the wrong thing.
 * `setup-table-permissions.ts` re-asserts all of it after every migrate, so this is what says
 * whether that took.
 */
import { getTableName, isTable } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'
import { reachable, sql } from './testDb'

/** Every write verb, not only the three DML ones: TRUNCATE is destructive and RLS does not gate it
 *  at all, so a role holding it can empty a table no policy would let it delete a row from. */
const WRITE = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

/** The tables whose writes a policy decides, which are the only ones the writer role may hold. */
const policyWritable = new Set(
  Object.values(schema)
    .filter((item) => isTable(item))
    .filter((table) =>
      getTableConfig(table).policies.some((policy) => ['all', 'delete', 'insert', 'update'].includes(policy.for ?? '')),
    )
    .map((table) => getTableName(table)),
)

/** Written only by the privileged handle, so no grant follows from their policies.
 *  `notifications` keeps one column: the reader marking their own row read. */
const NOT_THE_WRITER_ROLE = new Set(['notifications', 'user_roles'])

interface Grant {
  privilege: string
  table: string
}

const grantsFor = (role: string) => sql<Grant[]>`
  select table_name as "table", privilege_type as privilege
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = ${role}`

describe.skipIf(!reachable)('table grants', () => {
  it('lets authenticated read and nothing else', async () => {
    const held = await grantsFor('authenticated')

    expect(held.filter((grant) => WRITE.includes(grant.privilege))).toEqual([])
    expect(held.length).toBeGreaterThan(0)
  })

  it('lets anon touch nothing at all', async () => {
    expect(await grantsFor('anon')).toEqual([])
  })

  it('gives the writer role exactly the tables a policy decides', async () => {
    const held = await grantsFor('app_writer')
    const written = new Set(held.filter((grant) => WRITE.includes(grant.privilege)).map((grant) => grant.table))

    const expected = policyWritable.difference(NOT_THE_WRITER_ROLE)
    expect([...written].sort()).toEqual([...expected].sort())
  })

  it('narrows notifications to the column its reader owns', async () => {
    const columns = await sql<{ column: string; privilege: string }[]>`
      select column_name as "column", privilege_type as privilege
      from information_schema.role_column_grants
      where table_schema = 'public' and table_name = 'notifications' and grantee = 'app_writer'`

    expect(columns).toEqual([{ column: 'read_at', privilege: 'UPDATE' }])
  })

  it('answers the same question as the server does, per role', async () => {
    // The catalogue joins above and `has_table_privilege` disagree if a grant arrives through role
    // membership rather than directly, which is exactly how `app_writer` holds SELECT. Asked here
    // so the read half of membership is proven rather than assumed.
    const [row] = await sql<{ readerWrites: boolean; writerReads: boolean; writerWrites: boolean }[]>`
      select has_table_privilege('authenticated', 'public.areas', 'INSERT') as "readerWrites",
             has_table_privilege('app_writer', 'public.areas', 'INSERT') as "writerWrites",
             has_table_privilege('app_writer', 'public.areas', 'SELECT') as "writerReads"`

    expect(row).toEqual({ readerWrites: false, writerReads: true, writerWrites: true })
  })

  it('leaves no table behind, including the ones not in schema.ts', async () => {
    // `keyv` is created at runtime by the cache library and extensions create their own: the tables
    // that most need the revoke are the ones nobody listed, so this asks the database, not the
    // schema module.
    const stray = await sql<{ grantee: string; privilege: string; table: string }[]>`
      select table_name as "table", grantee, privilege_type as privilege
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'PUBLIC')
      union all
      select table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'authenticated'
        and privilege_type = any(${WRITE})`

    expect(stray).toEqual([])
  })
})
