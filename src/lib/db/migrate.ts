import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as migrateRouteAreaFks } from './scripts/migrate-route-area-fks'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

await migrate(db, { migrationsFolder: 'drizzle' })
await migrateRouteAreaFks(db)

await postgres.end()
