import { getTableName, isTable, sql } from 'drizzle-orm'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

const tables = Object.values(schema).filter((item) => isTable(item))

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  Object.values(schema).map((item) => isTable(item))

  for (const table of tables) {
    const tableName = getTableName(table)
    await db.execute(sql.raw(`revoke all on table public."${tableName}" from anon, public;`))
  }

  // keyv is created lazily at runtime by the cache library, so it may not exist
  // yet on a freshly migrated database. Guard it so a from-empty migrate works.
  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.keyv') IS NOT NULL THEN
        REVOKE ALL ON TABLE public.keyv FROM anon, public;
        ALTER TABLE public.keyv ENABLE ROW LEVEL SECURITY;
      END IF;
    END $$;
  `)
  db.execute(sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;`)
}
