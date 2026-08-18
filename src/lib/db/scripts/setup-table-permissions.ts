import { getTableName, isTable, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

/**
 * The tables that declare a write policy, which are the only ones the writer role has any business
 * writing. Derived rather than listed: a table with no policy behind its grant is a standing
 * permission waiting for somebody to add one, and a hand-kept exclusion list is a thing to forget.
 * `notifications` is the one exception below, because WHICH column is not something a policy says.
 */
const writable = Object.values(schema)
  .filter((item) => isTable(item))
  .filter((table) =>
    getTableConfig(table).policies.some((policy) => ['all', 'delete', 'insert', 'update'].includes(policy.for ?? '')),
  )
  .map((table) => getTableName(table))

/**
 * Who may write what, re-asserted on every migrate.
 *
 * Schema-wide rather than per table, because the tables this has to cover are exactly the ones
 * nobody remembered to list: `keyv` is created at runtime by the cache library, extensions and the
 * Supabase dashboard create their own, and Supabase's default privileges hand `authenticated`
 * everything on all of them. Iterating the tables declared in `schema.ts` would visit only the ones
 * already accounted for.
 */
export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  await db.execute(sql`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public`)

  // The write split `0115_app_writer_role` created the role for. `authenticated` is the role every
  // browser holds, so it keeps SELECT and nothing else: TRUNCATE in particular is a destructive
  // write that row-level security does not gate at all.
  await db.execute(sql`
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
    FROM authenticated`)
  // Revoking is schema-wide because the tables that most need it are the ones nobody listed.
  // Granting is not: `app_writer` gets exactly the tables whose writes a policy decides. Everything
  // else (an extension's, the dashboard's, `keyv`, `grades`, `role_permissions`) stays reachable
  // through the privileged handle alone.
  //
  // Revoke first, so a table that loses its last write policy loses the grant with it rather than
  // keeping one nothing decides any more.
  await db.execute(sql`REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM app_writer`)
  for (const table of writable) {
    await db.execute(sql.raw(`GRANT INSERT, UPDATE, DELETE ON TABLE public."${table}" TO app_writer`))
  }

  // Two exceptions, both tables whose writes belong to the privileged handle. `notifications` is
  // written by the fan-out and updated by the reader through one column; `user_roles` is what
  // decides `app.admin` and is written by the auth hook. Neither has a write policy today, so both
  // lines are what keeps adding one from silently handing the request role the whole table.
  await db.execute(sql`REVOKE INSERT, UPDATE, DELETE ON TABLE public.notifications FROM app_writer`)
  await db.execute(sql`GRANT UPDATE ("read_at") ON TABLE public.notifications TO app_writer`)
  await db.execute(sql`REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM app_writer`)

  // keyv is created lazily at runtime by the cache library, so it may not exist yet on a freshly
  // migrated database, and it is not in `schema.ts` at all. RLS on and no policies means nothing
  // reaches it but the privileged handle.
  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.keyv') IS NOT NULL THEN
        REVOKE ALL ON TABLE public.keyv FROM anon, public, authenticated, app_writer;
        ALTER TABLE public.keyv ENABLE ROW LEVEL SECURITY;
      END IF;
    END $$;
  `)

  // Awaited, unlike the version of this that shipped: drizzle's `execute` returns a lazy
  // QueryPromise that only runs when something calls `then`, so the un-awaited statement here had
  // never executed once, and `anon` still held every default privilege to prove it.
  await db.execute(sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon`)
  await db.execute(sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated`)
  // Deliberately no default GRANT for `app_writer`: a new table should arrive writable by nobody
  // until somebody writes a policy for it and adds it to `schema.ts`.

  // The other grantor: anything Supabase creates carries ITS defaults, not ours. Needs membership
  // in the role, which a managed instance may not give us, so a refusal is a notice rather than a
  // failed migrate.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        RETURN;
      END IF;

      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        REVOKE ALL ON TABLES FROM anon;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'not a member of supabase_admin: its default privileges are unchanged';
    END $$;
  `)
}
