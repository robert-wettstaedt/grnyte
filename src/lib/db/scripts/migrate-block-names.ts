/**
 * One-time migration: clear legacy auto-generated "Block N" names so those blocks fall back to
 * the app's inline positional naming. The pre-2.0 import stored the numbering as a real `name`
 * (e.g. "Block 3"); an unnamed block instead renders as "Block {order + 1}" via the mapper, so
 * emptying these names lets the live (reorder-aware) numbering take over.
 *
 * Only names matching `^Block \d+$` exactly are reset — "Block B", "Block 4 - Hauptblock",
 * "Block 10 (Teekesselblock)" etc. are real names and left untouched. Blocks in (or nested under)
 * any area named "Frankenjura" are excluded — their names are curated and shouldn't be reset.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Standalone preview:
 *   npx tsx src/lib/db/scripts/migrate-block-names.ts --dry-run
 *
 * Idempotent: an empty name doesn't match the pattern, so re-running is a no-op.
 */
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import * as schema from '../schema'

// Areas in or nested under any area named "Frankenjura" — excluded from the name reset. Reused
// as a leading CTE so each statement can filter `area_fk not in (select id from frankenjura)`.
const frankenjuraCte = sql`recursive frankenjura(id) as (
    select id from areas where name = ${'Frankenjura'}
    union all
    select a.id from areas a join frankenjura f on a.parent_fk = f.id
  )`

// POSIX regex (`\d` isn't supported — use `[0-9]`): the literal "Block " followed by digits only.
const numberedNamePattern = '^Block [0-9]+$'

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const matches = await db.execute(sql`
    with ${frankenjuraCte}
    select id, name, area_fk from blocks
    where name ~ ${numberedNamePattern} and area_fk not in (select id from frankenjura)
    order by area_fk, "order"
  `)

  for (const row of matches) {
    console.log(`  block #${String(row.id)} (area ${String(row.area_fk)}): "${String(row.name)}" → ""`)
  }

  if (!dryRun && matches.length > 0) {
    await db.execute(sql`
      with ${frankenjuraCte}
      update blocks set name = ''
      where name ~ ${numberedNamePattern} and area_fk not in (select id from frankenjura)
    `)
  }

  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}reset ${matches.length} legacy "Block N" name(s).`)
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-block-names.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
