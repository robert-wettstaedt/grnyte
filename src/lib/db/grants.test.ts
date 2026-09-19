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
 *
 * Scoped to `anon` and `authenticated` throughout, which are the roles a browser's JWT can name.
 * `service_role` keeps Supabase's defaults on purpose (see `setup-table-permissions.ts`), so it is
 * deliberately not asserted here rather than missed.
 */
import { describe, expect, it } from 'vitest'
import { reachable, sql } from './testDb'

/** Every write verb, not only the three DML ones: TRUNCATE is destructive and RLS does not gate it
 *  at all, so a role holding it can empty a table no policy would let it delete a row from. */
const WRITE = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']

/**
 * Every table the writer role may write, written out.
 *
 * Deliberately a list and not the derivation. `setup-table-permissions.ts` computes this set from
 * "tables carrying a write policy"; an earlier version of this test computed it the same way from
 * the same schema, which meant it could only ever prove the script had RUN. A wrong derivation, or
 * a drizzle change to what `policies` reports, moved both sides together and stayed green.
 *
 * So the cost is deliberate: add a write policy to a table and this test goes red until somebody
 * writes the name here. That is the review step. `notifications` is absent because its only write
 * is one column (asserted separately below) and `user_roles` because the auth hook owns it.
 */
const WRITER_TABLES = [
  'activities',
  'areas',
  'ascents',
  'blocks',
  'bunny_streams',
  'changes',
  'events',
  'favorites',
  'files',
  'first_ascensionists',
  'geolocations',
  'push_subscriptions',
  'reactions',
  'region_invitations',
  'region_members',
  'regions',
  'route_external_resource_27crags',
  'route_external_resource_8a',
  'route_external_resource_the_crag',
  'route_external_resources',
  'routes',
  'routes_to_first_ascensionists',
  'routes_to_tags',
  'topo_routes',
  'topos',
  'user_settings',
  'users',
]

interface Grant {
  privilege: string
  table: string
}

const grantsFor = (role: string) => sql<Grant[]>`
  select table_name as "table", privilege_type as privilege
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = ${role}`

describe.skipIf(!reachable)('table grants', () => {
  it('still lets the writer role read, which is how the app kept working', async () => {
    const read = (await grantsFor('app_writer')).filter((grant) => grant.privilege === 'SELECT')

    expect(read.length).toBeGreaterThan(0)
  })

  it('gives the writer role sequence usage of its own, borrowed from nobody', async () => {
    // Every INSERT calls `nextval` on a serial's sequence, and `app_writer` used to reach that
    // through membership in `authenticated`: the role this file strips to nothing. Asserted
    // directly, because losing it breaks every write for a reason no error message would name.
    const usage = await sql<{ grantee: string }[]>`
      select grantee from information_schema.role_usage_grants
      where object_schema = 'public' and grantee in ('anon', 'authenticated', 'app_writer', 'PUBLIC')`

    expect(new Set(usage.map((grant) => grant.grantee))).toEqual(new Set(['app_writer']))
  })

  it('gives the writer role exactly the tables it is meant to have', async () => {
    const held = await grantsFor('app_writer')
    const written = new Set(held.filter((grant) => WRITE.includes(grant.privilege)).map((grant) => grant.table))

    expect([...written].sort()).toEqual([...WRITER_TABLES].sort())
  })

  it('narrows notifications to the column its reader owns', async () => {
    // Write verbs only: SELECT is granted table-wide, so every column carries it and none of that
    // says anything about who may change a row.
    const columns = await sql<{ column: string; privilege: string }[]>`
      select column_name as "column", privilege_type as privilege
      from information_schema.role_column_grants
      where table_schema = 'public' and table_name = 'notifications' and grantee = 'app_writer'
        and privilege_type = any(${WRITE})`

    expect(columns).toEqual([{ column: 'read_at', privilege: 'UPDATE' }])
  })

  it('answers the same question as the server does, per role', async () => {
    // The catalogue joins above and `has_table_privilege` disagree if a grant arrives through role
    // membership rather than directly, which is exactly how `app_writer` holds SELECT. Asked here
    // so the read half of membership is proven rather than assumed.
    const [row] = await sql<
      { readerReads: boolean; readerWrites: boolean; writerReads: boolean; writerWrites: boolean }[]
    >`
      select has_table_privilege('authenticated', 'public.areas', 'SELECT') as "readerReads",
             has_table_privilege('authenticated', 'public.areas', 'INSERT') as "readerWrites",
             has_table_privilege('app_writer', 'public.areas', 'SELECT') as "writerReads",
             has_table_privilege('app_writer', 'public.areas', 'INSERT') as "writerWrites"`

    expect(row).toEqual({ readerReads: false, readerWrites: false, writerReads: true, writerWrites: true })
  })

  it('leaves no table behind, including the ones not in schema.ts', async () => {
    // Which is what "the data API is off" means when it is a fact rather than a dashboard toggle:
    // PostgREST and pg_graphql switch to one of these roles and find no table they may even name.
    //
    // `keyv` is created at runtime by the cache library and extensions create their own: the tables
    // that most need the revoke are the ones nobody listed, so this asks the database, not the
    // schema module.
    const stray = await sql<{ grantee: string; privilege: string; table: string }[]>`
      select table_name as "table", grantee, privilege_type as privilege
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')`

    expect(stray).toEqual([])
  })
})
