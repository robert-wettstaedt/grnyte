/**
 * One-time migration: convert legacy `@username` mentions in user-authored
 * markdown to the portable `!users:id!` reference token (the same id-stable
 * grammar areas/blocks/routes already use), so no legacy `@username` is left
 * unresolved once `remark-mentions` is retired.
 *
 * Targets the user-authored markdown columns: `areas.description`,
 * `routes.description` and `ascents.notes` (blocks have no description;
 * external-resource descriptions aren't app mentions).
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Can also be run on its
 * own to preview:
 *   npx tsx src/lib/db/scripts/migrate-mentions.ts --dry-run
 *
 * Idempotent: already-converted rows contain no `@username` and are skipped.
 * Unmatched `@names` (no such user) are left untouched and logged.
 */
import { and, eq, ilike, isNotNull } from 'drizzle-orm'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import * as schema from '../schema'

// Mirrors `usernameRegexWithAt` in src/lib/components/Markdown/lib/index.ts.
const mentionRegex = /@[\da-zA-Z][-\da-zA-Z_]{0,38}/g

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  const userRows = await db.select({ id: schema.users.id, username: schema.users.username }).from(schema.users)
  const idByUsername = new Map(userRows.map((user) => [user.username, user.id]))

  const unmatched = new Set<string>()
  let scanned = 0
  let convertedCount = 0

  /** Replace each `@username` with `!users:id!`; unknown names stay as-is. */
  const convert = (value: string): { next: string; changed: boolean } => {
    let changed = false

    const next = value.replace(mentionRegex, (match) => {
      const username = match.slice(1)
      const id = idByUsername.get(username)

      if (id == null) {
        unmatched.add(username)
        return match
      }

      changed = true
      return `!users:${id}!`
    })

    return { next, changed }
  }

  /**
   * Migrate one markdown text column of one table. `column` is the text column to
   * scan (`description`, `notes`, …); `update` writes the converted value back.
   */
  const migrateColumn = async (
    table: AnyPgTable & { id: AnyPgColumn },
    column: AnyPgColumn,
    label: string,
    update: (id: number, value: string) => Promise<unknown>,
  ) => {
    const rows = await db
      .select({ id: table.id, value: column })
      .from(table)
      .where(and(isNotNull(column), ilike(column, '%@%')))

    for (const row of rows) {
      // `column` is a generic `AnyPgColumn`, so the selected fields come back
      // loosely typed; narrow/coerce to the known shapes (text column, numeric id).
      const value = row.value
      if (typeof value !== 'string') {
        continue
      }

      scanned += 1
      const { next, changed } = convert(value)

      if (!changed) {
        continue
      }

      const id = Number(row.id)
      convertedCount += 1
      console.log('===')
      console.log(`[${label} #${id}] ${dryRun ? 'would convert' : 'converting'}`)
      console.log(`  - ${value}`)
      console.log(`  + ${next}`)

      if (!dryRun) {
        await update(id, next)
      }
    }
  }

  await migrateColumn(schema.areas, schema.areas.description, 'area', (id, description) =>
    db.update(schema.areas).set({ description }).where(eq(schema.areas.id, id)),
  )
  await migrateColumn(schema.routes, schema.routes.description, 'route', (id, description) =>
    db.update(schema.routes).set({ description }).where(eq(schema.routes.id, id)),
  )
  await migrateColumn(schema.ascents, schema.ascents.notes, 'ascent', (id, notes) =>
    db.update(schema.ascents).set({ notes }).where(eq(schema.ascents.id, id)),
  )

  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}converted ${convertedCount} of ${scanned} scanned row(s).`)
  if (unmatched.size > 0) {
    console.log(`Unmatched @mentions (left untouched): ${[...unmatched].sort().join(', ')}`)
  }
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-mentions.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
