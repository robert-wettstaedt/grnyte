/**
 * Apply drizzle migrations UP TO a named tag instead of all at once, so a long cutover can be taken
 * in checkpoints. `migrate()` runs every pending migration in ONE transaction, so a single bad row
 * anywhere rolls the whole thing back with nothing recorded; stepping makes each run its own
 * transaction, and a failure keeps everything already applied.
 *
 * Drizzle publishes no step-wise API and `drizzle-kit migrate` has no flag for it. `readMigrationFiles`
 * is a public typed export though, and `db.dialect.migrate` is what `migrate()` itself calls.
 *
 *   npx tsx src/lib/db/migrate-step.ts --list
 *   npx tsx src/lib/db/migrate-step.ts 0088_rapid_justice
 *
 * Migrations are gated by a HIGH WATERMARK on the journal's `when`, never by the stored hash, so
 * tags must be applied in ascending order. Asking for one at or below the watermark applies NOTHING
 * and is not an error, which is why this asserts the recorded count moved rather than trusting the
 * absence of an exception. `deployment/CUTOVER.md` has the step boundaries and why each one exists.
 */
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import fs from 'node:fs'
import Database from 'postgres'
import drizzleConfig from '../../../drizzle.config'

const FOLDER = 'drizzle'

/** `readMigrationFiles` drops the tag, and it iterates `journal.entries` in order, so zip it back on. */
const taggedMigrations = () => {
  const journal = JSON.parse(fs.readFileSync(`${FOLDER}/meta/_journal.json`, 'utf8')) as {
    entries: { tag: string; when: number }[]
  }
  const files = readMigrationFiles({ migrationsFolder: FOLDER })
  if (files.length !== journal.entries.length) {
    throw new Error(`journal lists ${journal.entries.length} migrations but ${files.length} files were read`)
  }
  return files.map((migration, i) => ({ ...migration, tag: journal.entries[i].tag }))
}

/** Zero before the very first migration, when the table does not exist yet. */
const recordedCount = async (db: PostgresJsDatabase): Promise<number> => {
  const rows = await db
    .execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)
    .catch(() => [{ n: 0 }])
  return Number(rows[0]?.n ?? 0)
}

export const migrateThrough = async (db: PostgresJsDatabase, tag: string): Promise<number> => {
  const all = taggedMigrations()
  const index = all.findIndex((migration) => migration.tag === tag)
  if (index === -1) {
    throw new Error(`no migration tagged "${tag}". Run with --list to see them.`)
  }

  const before = await recordedCount(db)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `dialect`/`session` are internal
  const internals = db as any
  await internals.dialect.migrate(all.slice(0, index + 1), internals.session, { migrationsFolder: FOLDER })
  const after = await recordedCount(db)

  if (after === before) {
    throw new Error(
      `nothing was applied for "${tag}": the database is already at or past it. Steps run in ascending order.`,
    )
  }
  return after - before
}

if (process.argv[1] != null && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = process.argv[2]
  if (arg == null || arg === '--list') {
    for (const { tag } of taggedMigrations()) console.log(tag)
    process.exit(0)
  }

  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  const db = drizzle(postgres)
  try {
    const applied = await migrateThrough(db, arg)
    console.log(`applied ${applied} migration(s) through ${arg}`)
  } finally {
    await postgres.end()
  }
}
