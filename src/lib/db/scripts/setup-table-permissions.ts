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

  await db.execute(sql`
    revoke all on table public.keyv from anon, public;
    ALTER TABLE keyv ENABLE ROW LEVEL SECURITY;
  `)
  db.execute(sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;`)
}
