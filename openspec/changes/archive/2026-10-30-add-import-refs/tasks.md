# Tasks

## 1. Table and migration

- [x] 1.1 Add `importRefs` to `src/lib/db/schema.ts` per design.md (columns, `on delete cascade` FKs, the two checks, three partial unique indexes, FK indexes, `.enableRLS()` with no policies, short column comments); verify `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` passes
- [x] 1.2 Check `drizzle/` and the main checkout for an unmerged migration number (the uncommitted `0141`), then run `npm run generate:drizzle`; verify the new SQL creates exactly the table, checks and indexes and touches nothing else
- [x] 1.3 Run `npm run generate:zero`; verify the only diff in `zero-schema.gen.ts` is the new table and that `src/lib/zero/queries` gains nothing
- [x] 1.4 Run `npm run migrate` from the main checkout (never a worktree); verify with psql that `import_refs` exists with RLS enabled and no policies

## 2. Region scripts

- [x] 2.1 Add `import_refs` to `HANDLED_TABLES` and its three updates to `carryContent` in `src/lib/db/scripts/regionMove.ts`, on top of the uncommitted edits there; verify `assertTableCatalogue` passes against the migrated dev DB and the existing `regionMove` tests stay green
- [x] 2.2 Verify `purge-region.ts` lists `import_refs` in its dry run against a region holding a ref (no code change expected)

## 3. Helper

- [x] 3.1 Write a DB-backed test `src/lib/db/scripts/importRefs.server.test.ts` (skips when `DATABASE_URL` is unreachable, via `$lib/db/testDb`) covering each spec scenario that the database or helper decides: two targets, no target, empty source, duplicate line per kind, block and route on one line, two editions, soft-deleted entity still read, hard delete cascades, `region_fk` taken from the entity, and a member's session reading no rows; verify it fails before 3.2 exists
- [x] 3.2 Implement `recordImportRefs` and `importRefsOf` in `src/lib/db/scripts/importRefs.server.ts`; verify 3.1 passes, then see it red by dropping the `region_fk` join (one edit), and revert

## 4. Verification sweep

- [x] 4.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` for the new test, typecheck, `npm run lint:duplication`, `npm run lint:unused`; verify all pass
- [x] 4.2 With `npm run dev` and zero-cache running, load a region at 375x667 and 1280x800; verify sync still hydrates with the new table in the schema (no user-facing change, so this is a smoke check only)

## Workflow follow-up

- Archive the change once the rebuild import writes its first refs.
