import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as migrateFileIdToCuid } from './scripts/migrate-file-id-to-cuid'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

await migrate(db, { migrationsFolder: 'drizzle' })

await migrateFileIdToCuid(db)

await postgres.end()
