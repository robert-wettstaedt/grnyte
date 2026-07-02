import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'
import { migrate as migrateBlockNames } from './scripts/migrate-block-names'
import { migrate as migrateBlockOrder } from './scripts/migrate-block-order'
import { migrate as migrateImageDerivatives } from './scripts/migrate-image-derivatives'
import { migrate as migrateMentions } from './scripts/migrate-mentions'
import { migrate as migratePromoteOriginals } from './scripts/migrate-promote-originals'
import { migrate as migrateTopoPaths } from './scripts/migrate-topo-paths'
import { migrate as setup } from './scripts/setup-table-permissions'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

await setup(db)
await migrate(db, { migrationsFolder: 'drizzle' })

await migrateMentions(db)
await migrateBlockNames(db)
await migrateBlockOrder(db)
await migratePromoteOriginals(db)
await migrateImageDerivatives(db)
await migrateTopoPaths(db)

await postgres.end()
