---
name: scaffold-entity
description: Scaffold a new Zero-synced entity module in this app (src/lib/entities/<name>/ with dto, mapper, queries, resources, permissions). Use when adding a new domain entity to sync via Zero, exposing a DB table to the client, wiring queries/resources for a table, or when the user says "add an entity", "create the <X> module", "expose X in Zero", or "load/query <table> on the client". Mutations go through SvelteKit remote functions, never Zero mutators.
---

# Scaffold a Zero entity module

A domain entity is a folder under `src/lib/entities/<name>/`. Every module follows the same
template. **`src/lib/entities/area/` is the reference implementation — read it first and mirror it**,
because concrete code drifts and the live module is the source of truth.

## Files to create (mirror `area/`)

- `dto.ts` — the client-facing shape. A plain, hand-written TS `interface`. Keep it minimal and
  structural; the mapper converts nullable DB columns to `undefined`.
- `mapper.ts` — `toX(row): X`. Maps a Zero `Row` to the DTO. Declare a structural `XRow` input so
  route-level and nested-related rows both flow through it.
- `queries.ts` — `export const <name>QueryDefs = { listX: defineQuery(z.object({...}), <perm>(...)) }`.
- `resources.svelte.ts` — reactive resource factories (`xList(idGetter)`) that run a query and map
  rows via `toX`. Built on the generic `createResource` in `src/lib/zero/resource.svelte.ts`.
- `permissions.ts` — only if the UI gates on it. `canEditX`/`canDeleteX` wrapping
  `checkRegionPermission(userRegions, [REGION_PERMISSION_*], x.regionFk)` from `$lib/auth`.

## Wiring steps

1. Register the query defs in `src/lib/zero/queries.ts` (read it — per-entity `*QueryDefs` are
   combined into the aggregate `queries` object; `QueryRow<typeof queries.listX>` derives the row type).
2. Permission wrappers live in `src/lib/zero/permissions.ts`:
   - `regionMemberCan(({ args, ctx }) => zql.<table>.where(...))` for region-scoped reads.
   - `relatedRegion(ctx)` → `r`, used to region-filter `.related(...)` sub-queries.
3. If the table carries a `regionFk`, add it to `regionTables` in `src/lib/zero/permissions.ts`.
   That one list is both the array and the `RegionTable` union, and being on it is what makes
   `regionMemberCan` / `relatedRegion` accept the table at all.
4. `npm run check` until clean.

## Gotchas (these are the ones that cost time)

- **No Zero mutators.** All writes are SvelteKit remote functions (`command`/`authedCommand`) in a
  `<name>.remote.ts`, RLS-gated, returning `MutationResult<T>`. Mirror `src/lib/entities/file/files.remote.ts`.
- **Cardinality-one `.related()` returns a single object, not an array** (`row.bunnyStream?.source`,
  `topo.file?.path`). Only `cardinality: 'many'` relations are arrays (`(row.files ?? []).map(...)`).
- **`relatedRegion`'s `r` only accepts tables in the `RegionTable` union.** A related table that
  isn't a member (e.g. `bunnyStreams`) can't take `r` — use `.related('x')` with no filter; the
  parent row is already region-scoped and RLS re-checks server-side.
- **Defaulted DB columns come back nullable in the Zero row** (`createdAt: number | null` even when
  `NOT NULL DEFAULT now()`). Coerce in the mapper (`row.createdAt ?? 0`).
- DTOs are structural — growing an existing DTO/mapper (adding fields) is non-breaking, so extend
  rather than fork when a screen needs one more field.

## New table too?

If the entity needs a new DB table, that's the schema pipeline — use the `zero-schema-change` skill
first (schema.ts + RLS policies + drizzle/zero regen + migrate), then scaffold the module here.
