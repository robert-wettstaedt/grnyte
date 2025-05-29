import KeyvPostgres from '@keyv/postgres'
import { eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import Keyv from 'keyv'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'
import * as schema from './schema'

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

const keyvPostgres = new KeyvPostgres({ uri: drizzleConfig.dbCredentials.url, pool: false })
export const keyv = new Keyv({ store: keyvPostgres })

await migrate(db, { migrationsFolder: 'drizzle' })
await keyv.clear()

const appAdmin = await db.query.userRoles.findFirst({ where: eq(schema.userRoles.role, 'app_admin') })
const appAdminUser =
  appAdmin == null ? null : await db.query.users.findFirst({ where: eq(schema.users.authUserFk, appAdmin.authUserFk) })
if (appAdminUser != null) {
  await db.update(schema.regions).set({ createdBy: appAdminUser.id }).where(isNull(schema.regions.createdBy))
}

await postgres.end()
