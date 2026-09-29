import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as setup } from './scripts/setup-table-permissions'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

// migrate first so all tables exist, then harden table permissions. (setup()
// REVOKEs on every table, so it must run after the tables are created -
// otherwise a from-empty `migrate` fails on the first nonexistent table.)
await migrate(db, { migrationsFolder: 'drizzle' })
await setup(db)

await postgres.end()
