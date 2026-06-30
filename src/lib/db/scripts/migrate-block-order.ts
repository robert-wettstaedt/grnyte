/**
 * One-time migration: rearrange block `order` to a contiguous `0..n-1` per area. The old order
 * assignment left gaps, so each area's non-deleted blocks are renumbered by their current order,
 * breaking ties by id. Soft-deleted blocks keep their `order` (their restore slot).
 *
 * Applies to every area (no exclusions) — a contiguous order is a pure data-integrity fix.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Standalone preview:
 *   npx tsx src/lib/db/scripts/migrate-block-order.ts --dry-run
 *
 * Idempotent: already-contiguous orders don't change, so re-running is a no-op.
 */
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = false }: { dryRun?: boolean } = {}) => {
  // `row_number()` numbers each area's blocks 1, 2, 3… in their current order (ties broken by id);
  // `- 1` makes the target 0-based. Only rows whose stored order differs are reported / updated.
  const changes = await db.execute(sql`
    with ranked as (
      select id, area_fk, "order" as old_order,
        (row_number() over (partition by area_fk order by "order", id) - 1)::int as new_order
      from blocks
      where deleted_at is null
    )
    select id, area_fk, old_order, new_order from ranked where old_order <> new_order order by area_fk, new_order
  `)

  for (const row of changes) {
    console.log(
      `  block #${String(row.id)} (area ${String(row.area_fk)}): ${String(row.old_order)} → ${String(row.new_order)}`,
    )
  }

  if (!dryRun && changes.length > 0) {
    await db.execute(sql`
      with ranked as (
        select id, (row_number() over (partition by area_fk order by "order", id) - 1) as new_order
        from blocks
        where deleted_at is null
      )
      update blocks b set "order" = r.new_order
      from ranked r
      where b.id = r.id and b."order" <> r.new_order
    `)
  }

  console.log(`\n${dryRun ? 'DRY RUN — ' : ''}rearranged ${changes.length} block order(s).`)
}

// Standalone preview: `npx tsx src/lib/db/scripts/migrate-block-order.ts [--dry-run]`.
if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
  await migrate(drizzle(postgres, { schema }), { dryRun: process.argv.includes('--dry-run') })
  await postgres.end()
}
