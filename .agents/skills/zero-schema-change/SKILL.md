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

## Gotchas

- **`generate:zero` warns "Column X uses a database default the Zero client will not be able to use"
  for every defaulted column — benign.** The real consequence: a `NOT NULL DEFAULT` column becomes
  **`T | null` in the Zero row type**. Coerce it in the entity mapper (`row.createdAt ?? 0`), don't
  fight the generated type.
- New tables that reads should reach must be added to `regionPreloadTables` / `RegionTable` in
  `src/lib/zero/permissions.ts` (see the `scaffold-entity` skill).
- The generated migration + `drizzle/meta/*` snapshot are part of the change — commit them.

## Verify

Confirm the column/backfill landed with a DB query (local Postgres :5433; connection string in `.env`
`ZERO_UPSTREAM_DB` — do **not** hard-code it here). Then use `grnyte-verify` to check the app reads it.
