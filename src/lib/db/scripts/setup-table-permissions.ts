import { getTableName, sql } from 'drizzle-orm'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'

const tables = [
  schema.activities,
  schema.areas,
  schema.ascents,
  schema.blocks,
  schema.bunnyStreams,
  schema.favorites,
  schema.files,
  schema.firstAscensionists,
  schema.geolocations,
  schema.grades,
  schema.pushSubscriptions,
  schema.regionMembers,
  schema.regions,
  schema.rolePermissions,
  schema.routeExternalResource27crags,
  schema.routeExternalResource8a,
  schema.routeExternalResources,
  schema.routeExternalResourceTheCrag,
  schema.routes,
  schema.routesToFirstAscensionists,
  schema.routesToTags,
  schema.tags,
  schema.topoRoutes,
  schema.topos,
  schema.userRoles,
  schema.users,
  schema.userSettings,
]

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  for (const table of tables) {
    const tableName = getTableName(table)
    await db.execute(sql.raw(`revoke all on table public."${tableName}" from anon, public;`))
  }

  db.execute(sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;`)
}
