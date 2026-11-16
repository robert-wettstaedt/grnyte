import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../../drizzle.config'
import * as schema from '../../schema'

type Migrate = (db: PostgresJsDatabase<typeof schema>, options: { dryRun?: boolean }) => Promise<unknown>

/** Prints each skip reason with the ids it skipped. */
export function logSkipped(skipped: Record<string, (number | string)[]>) {
  for (const [reason, ids] of Object.entries(skipped)) {
    console.log(`Skipped (${reason}): #${ids.join(', #')}`)
  }
}

/** Runs `migrate` only when `moduleUrl` is the script tsx was started with; `--dry-run` previews. */
export async function runStandalone(moduleUrl: string, migrate: Migrate) {
  if (process.argv[1] == null || moduleUrl !== pathToFileURL(process.argv[1]).href) return
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
