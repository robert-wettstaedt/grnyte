import KeyvPostgres from '@keyv/postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Keyv from 'keyv'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as migrateRegions } from './scripts/migrate-regions'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

const keyvPostgres = new KeyvPostgres({ uri: drizzleConfig.dbCredentials.url, pool: false })
export const keyv = new Keyv({ store: keyvPostgres })

await migrate(db, { migrationsFolder: 'drizzle' })
await keyv.clear()

await migrateRegions(db)

await postgres.end()
