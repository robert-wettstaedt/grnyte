import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as migrateUserGrades } from './scripts/migrate-user-grades'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

await migrate(db, { migrationsFolder: 'drizzle' })
await migrateUserGrades(db)

await postgres.end()
