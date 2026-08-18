---
name: zero-schema-change
description: Run this app's schema migration pipeline after any change to src/lib/db/schema.ts — generate the Drizzle migration, hand-append data backfill SQL, regenerate the Zero schema, and migrate. Use when adding or altering a column/table, adding RLS policies, when the user says "add a column", "change the schema", "migrate", or "backfill", or immediately after editing schema.ts. Covers the drizzle-zero regeneration and the DB backfill gotchas.
---

# Schema change → migrate pipeline

Drizzle is the source of truth (`src/lib/db/schema.ts`); the Zero client schema is generated from it.
A schema change is a fixed sequence, not just a `schema.ts` edit.

## Steps

1. **Edit `src/lib/db/schema.ts`.** Column helpers: `baseFields` = serial `id` + `createdAt`;
   `baseRegionFields` = `regionFk` only; `softDeleteFields` = `deletedAt`. Media/`files` opt out of
   `baseFields` (they keep a cuid2 `id`), so add per-column fields explicitly there.
   For a **new table**, add its RLS `policy(...)` calls (region-scoped via
   `getAuthorizedInRegionPolicyConfig`, plus any own-ascent/owner escape hatches) and `.enableRLS()`.
2. `npm run generate:drizzle` → writes `drizzle/NNNN_*.sql`.
3. **Append data backfill** to that generated `.sql` when existing rows need values, separated by
   `--> statement-breakpoint`. Pattern (backfilling a new column from another table):
   ```sql
   UPDATE "files" SET "created_at" = "a"."created_at"
   FROM "activities" "a"
   WHERE "a"."type" = 'uploaded' AND "a"."entity_type" = 'file' AND "a"."entity_id" = "files"."id";
   ```
   Keeping the backfill in the migration makes `npm run migrate` atomic.
4. `npm run generate:zero` → regenerates `src/lib/zero/zero-schema.gen.ts`.
5. `npm run migrate` → applies the SQL migrations, **then** runs `setup-table-permissions` and the
   data-backfill scripts in `src/lib/db/scripts/` (image derivatives, mentions, etc.), so its output
   is noisy and includes image/data work — that's expected, not an error.
6. `npm run check` until clean.

`npm run generate` runs 2+4 together; `.env` `DATABASE_URL` (supabase pooler) is the target.

## One migration per unshipped feature

While the feature is still on its branch and not deployed, its schema is **one** migration file, not
one per work session. If a later phase changes what an earlier phase added — adds a column then
drops it, renames it, tightens a constraint — fold the change back into the original `NNNN_*.sql`
and delete the follow-up file, then regenerate the `drizzle/meta` snapshot so it matches. Nobody has
run the first version, so there is no history to preserve; a column that is added in 0099 and
removed in 0101 is noise for every future reader.

Stop folding once the migration has run anywhere but a local/throwaway DB. From then on it is
append-only.

Not every schema edit even needs SQL: changing RLS policy composition, grants or triggers that are
re-emitted by `setup-table-permissions` on every `npm run migrate` produces no migration at all.
Check whether `generate:drizzle` actually wrote a file before assuming it did.

## A rename or drop is a data move

`generate:drizzle` writes `ADD COLUMN` + `DROP COLUMN` for a rename and calls it done — the rows are
your problem. Before dropping anything:

- **Move the data first**, in the same migration, above the drop. Renaming three user-settings
  columns without the `UPDATE` silently resets every existing user to the default.
- **Grep for readers of the old column**, including cron/task routes and generated Zero queries. A
  dropped bookkeeping column (`activities.notified`, watermarks, `*_up_to_*` ids) usually means some
  job's "already handled" test now returns nothing, so the next run re-processes the whole table and
  re-notifies everyone.
- **A nullable column that nothing writes is a bug, not a migration.** If a phase adds
  `deleted_at`-style state, the writer, the read filters and the delete path land with it.

## Gotchas

- **`generate:zero` warns "Column X uses a database default the Zero client will not be able to use"
  for every defaulted column — benign.** The real consequence: a `NOT NULL DEFAULT` column becomes
  **`T | null` in the Zero row type**. Coerce it in the entity mapper (`row.createdAt ?? 0`), don't
  fight the generated type.
- New region-scoped tables must be added to `regionTables` in `src/lib/zero/permissions.ts` (see the
  `scaffold-entity` skill). `tenancy.test.ts` sweeps that list, so a table left off it is both
  unprotected and untested.
- The generated migration + `drizzle/meta/*` snapshot are part of the change — commit them.

## Verify

Confirm the column/backfill landed with a DB query (local Postgres :5433; connection string in `.env`
`ZERO_UPSTREAM_DB` — do **not** hard-code it here). Then use `grnyte-verify` to check the app reads it.
