# Design

## Context

See proposal.md for why. What the code does today, and what decides the approach:

- No update handler touches a parent column: `updateAreaRow`, `updateBlockRow` and the route update set only their
  own fields. Forms carry `parentFk` / `areaId` / `blockId` as hidden inputs used on create.
- One trigger maintains hierarchy-derived data: `routes_sync_block_grade_counts` (0143, from the uncommitted
  `map-block-summaries` change, which this change depends on) follows `routes.block_fk` and `deleted_at`. Everything
  else is app code: `routes.area_fks` / `area_ids` (`areaAncestry`, `areaIdsOf` in `area/area.server.ts`), area type
  (`refreshAreaType`), block `order` (`shiftBlockOrdersDown/Up` in `block/lifecycle.server.ts`), events
  (`createUpdateEvent`, `writeChanges` in `event/event.server.ts`).
- `src/lib/db/scripts/move-area.ts` recomputes `area_fks` with a recursive CTE over the script's temp tables on a raw
  postgres.js handle; the app computes chains with `areaAncestry` / `areaIdsOf`. `regionMove.ts` has `assertTableCatalogue`, which fails when a table it does not know appears.
- Every Zero query filters `deletedAt IS NULL`, so a deleted entity and one that never existed render the same
  `notFound`. Markdown references are `!kind:id!` tokens (`referenceRegex` in `Markdown/lib/remark-references.ts`),
  resolved on the client through Zero (`references.svelte.ts`) and on the share page by `enrichMarkdown`. History
  diffs show them raw (`event/change.ts`, the `ponytail:` note on `proseDiff`).
- `topo_routes` is not tied to the route's block in the database; `topo/edit.server.ts` enforces it only on save.
  Seven production rows already break it.
- Two-way links: `blocks.geolocation_fk` with `geolocations.block_fk` (one pin per block), and
  `routes.external_resources_fk` with `route_external_resources.route_fk` (one set per route).
- `entitySearch` (`EntitySearch/search.svelte.ts`) searches areas, blocks and routes as Zero queries with a `content`
  filter, so hits outside the offline-kept rows sync in. It is tuned for global search: a per-group cap, routes sorted
  by rating, one crumb of context. Field devices keep the whole guidebook (`offline.ts`, `guidebook` stage).
- RLS: maintainers and admins may edit areas, blocks and routes; delete is `canDeleteCreatedRow`. Rows owned by other
  people (ascents, favorites, content reports) are not writable by the caller.

## Goals / Non-Goals

**Goals:**

- One server handler per operation and level, shared by single and bulk moves.
- Every derived column correct in the same transaction as the move or merge.
- References in stored text follow a merge with no lookup at render time.
- No new URL, and no change to an existing remote function or mutator name.

**Non-Goals:**

- A generic "repoint every FK" engine. Each table a merge touches is named, and a catalogue test keeps the list honest.
- Offline moves or merges. Both await the server.
- Redirecting a merged entity's address. Bookmarks, delivered pushes, shared links and open tabs on the source show
  not found, as for a deleted entity. A synced redirects table was weighed and dropped: merges are rare, regions are
  small, and it can be added later without touching anything here.

## Decisions

### 1. Writes are awaited Zero mutators, one pair per level

`areas.move`, `blocks.move`, `routes.move` and `areas.merge`, `blocks.merge`, `routes.merge`, defined in each entity's
`mutators.ts` / `mutators.server.ts`, bodies in `<entity>/move.server.ts` and `<entity>/merge.server.ts`. They write
nothing on the client and are awaited through `.server`, like creates and deletes, because derived columns are computed
on the server. Components call them through new functions in each entity's `writes.ts`.

Move takes a list (`{ blockIds, areaId }`, `{ routeIds, blockId, knownTopoLines }`, `{ areaIds, parentId | null }`), so
single and bulk are one mutator, and returns the previous parent of every moved row plus, for blocks, the source
area's previous order, which is the Undo's argument (`blocks.move` takes an optional `restoreOrder`).

### 2. Gates and locking

Move gates every row through `requireRow` with `canEditBlock` / `canEditRoute` / `canEditArea`, and the destination
with `canAddBlock` / `canAddRoute` / `canAddArea`. A move to the top level has no destination row and gates on
`checkRegionPermission(EDIT)` for the area's region. The destination is refused when deleted or under a deleted area
(`hasDeletedAncestor`). The cycle check walks the destination's ancestry and refuses if it contains a moved area. Rows
already under the destination are skipped, so a same-parent move changes nothing. Move runs `asCaller`.

Merge gates the source with `canDeleteArea` / `canDeleteBlock` / `canDeleteRoute` and the survivor with the edit
predicate, both through `requireRow`, then locks both rows `for update` in id order and re-checks `deleted_at`, so two
crossing merges cannot both commit. The survivor's own field writes, the soft delete and the moves of children run
`asCaller`. Only the repointing of rows other people own (ascents, files, favorites, content reports, notifications,
events, changes, first ascensionist links, import refs) runs `asPrivileged`. AGENTS.md gets one line naming this second
legitimate use of `asPrivileged`, and `gates.test.ts` gets the named gate for each merge mutator.

Area merge refuses a survivor beneath the source, and two areas whose children are of different kinds (blocks against
sub-areas; an empty side fits either).

### 3. Move derives everything from the new tree

After updating the parent column, in the same transaction:

- `routes.area_fks` / `area_ids` for every route under the moved roots, by `recomputeAreaChains(db, areaIds)` in
  `area/area.server.ts`: for each area in the moved subtree, the existing `areaAncestry` and `areaIdsOf`, then one
  update of the routes on that area's blocks. The same functions create and restore already use, so there is one way to
  compute a chain, not a second CTE. A subtree holds tens of areas, so one ancestry walk each is cheap.
- `refreshAreaType` on every old and new parent area.
- Blocks: the renumbering loop is lifted out of `reorderBlocksRow` (`block/order.server.ts`) into
  `renumberArea(db, areaId, orderedIds)`, which `reorderBlocksRow` then calls. Move renumbers the destination as its
  blocks followed by the moved ones in incoming order, and the source as what is left in its current order. Undo passes
  the source's previous order back as `restoreOrder`. No slot arithmetic, and `shiftBlockOrdersDown/Up` stay only
  where delete and restore already use them.
- Routes: `topo_routes` rows whose topo's block is not the route's new block are deleted. The client sends
  `knownTopoLines`, the count its confirmation showed, read from each route's `topoRoutes` relation through a resource
  marked `whole`; the server counts the same predicate and refuses a mismatch before its first write.
- `blocks.grade_counts`: nothing, the trigger follows `routes.block_fk`.
- One `update` event per moved row through `createUpdateEvent`, with a `changes` row `parent` holding the old and new
  parent's display names, not ids. The line then renders like any text change, and nothing has to resolve an id
  to a name later, which a deleted area would make a lookup outside Zero. Bulk moves rely on the existing burst folding.

### 4. Merge: allowlisted fields, repointed attachments

Fields: a per-level allowlist (route: `name`, `gradeFk`, `description`, `firstAscentYear`, `rating`; block: `name`,
`description`, location; area: `name`, `description`). `gradeFk` is the set grade, never the derived `user_grade_fk`.
The client sends only the conflicting fields, as the values chosen, parsed with the entity's update schema restricted
to the allowlist. The server fills each empty survivor field in the allowlist from the source, then applies the sent
values. Sending values rather than sides means a concurrent edit cannot swap what the person saw. Block location is a
choice between the two pins: the chosen pin becomes `geolocation_fk`, the other is deleted.

Attachments, each table named in `merge.server.ts`:

| Level                | Repointed                                                                                                                                                                                                                                                                   | Collision rule                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route                | `ascents`, `files`, `topo_routes`, `routes_to_tags`, `routes_to_first_ascensionists`, `favorites`, `import_refs`, `content_reports`, `events` (add and remove only; the source's create, update and delete stay with it), `changes`, `notifications`                        | survivor keeps `topo_routes` (topo, route), tags, favorite, report, notification; first ascensionists deduped by ascensionist; source lines on topos not on the survivor's block deleted |
| route external links | survivor's set kept; the source's set moves only when the survivor has none, else stays on the retired source                                                                                                                                                               |                                                                                                                                                                                          |
| block                | routes (all, deleted included, appended to the survivor's order), `files`, `topos`, `favorites`, `import_refs`, `content_reports`, `events` (add and remove only; the source's create, update and delete stay with it), `changes`, `notifications`                          | survivor keeps favorite, report, notification; losing pin deleted                                                                                                                        |
| area                 | child areas and blocks (deleted included, via section 3), parkings only into a sector else dropped, `files`, `favorites`, `import_refs`, `content_reports`, `events` (add and remove only; the source's create, update and delete stay with it), `changes`, `notifications` | as block                                                                                                                                                                                 |

A colliding content report is closed through `closeReports` (`report/report.server.ts`), so its reporter is told, never
deleted silently; a surviving report's `object_name` and `author_fk` are refreshed to the survivor. The source's
`create` event stays on the source. The survivor gets an `update` event with a `changes` row `mergedFrom` naming the
source. Afterwards: route merge reruns `recalcUserGradeAndRating`; block merge renumbers the source block's area with
`renumberArea`; area merge runs `refreshAreaType` on the source's parent; moved children get section 3's
derivation. The 0143 trigger keeps grade counts right on its own. The source is then soft-deleted with
`stampDeletedAt` and `merged_into` set to the survivor (section 7). Soft restore takes only an id, so the marker is
what refuses it.

Ascents of one person on both routes are all kept: they were real sessions, and `countSessions` already folds a shared
day.

Counts on the confirmation come from a `mergePreview(kind, sourceId, survivorId)` remote read (block and area ascent
totals are not on the client). Merge needs the server anyway, so this costs nothing offline.

Catalogue test: one `merge.server.test.ts` case lists every FK column referencing `areas`, `blocks` or `routes` from
`information_schema`, plus the polymorphic text references (`content_reports.object_id`, `moderation_decisions.object_id`,
`notifications.object_ref`, `activities.entity_id`), and asserts both sets equal what the merge modules declare.
A new reference fails it until handled. Declared as deliberately left alone, because they record what happened:
`moderation_decisions`, the retired `activities`, `events.metadata`, `changes.old_value` / `new_value`,
`notifications.object_ref` and `notifications.metadata`.

### 5. References are rewritten at merge time

Inside the merge's privileged body, every `!kind:sourceId!` token is replaced by `!kind:survivorId!` in the stored
markdown columns: `areas.description`, `blocks.description`, `routes.description`, `ascents.notes`, `reactions.body`
(comments) and `deleted_comments.body` (so an Undo of a comment deletion restores the rewritten text). One
`update ... set col = regexp_replace(col, '!kind:sourceId!', '!kind:survivorId!', 'gi') where col ilike '%!kind:sourceId!%'`
per column; the closing `!` keeps `!blocks:14!` from matching `!blocks:140!`, and case-insensitivity matches
`referenceRegex`. The rewrite writes no event and no `changes` row: it is mechanical, not an edit.

Left alone on purpose: `changes.old_value` / `new_value` (the edit log keeps what was written), `feedback.body` (sent
to the operator, not rendered in a region), and the imported external-resource descriptions. A second catalogue case
lists every `text` column named `description`, `notes` or `body` from `information_schema` and asserts each is declared
rewritten or left alone, so a new markdown column fails it until decided.

Accepted race: an edit form already open on a description containing the old token saves it back after the merge.
It then renders as the existing "not found" tombstone, visibly, and a later edit fixes it. A fingerprint on every
markdown field is not worth that window.

No lookup is added anywhere: the reference resolvers (`references.svelte.ts`, `enrichMarkdown`) are unchanged.

### 6. UI: one stepped Modal per flow, a browse picker and a name search

The sector chooser in `CreateOnMap.svelte` (a `Modal` of `Row` items with full ancestor crumbs) is extracted into
`$lib/components/GuidebookPicker/GuidebookPicker.svelte`: a browse list that opens at a given area, steps up and down
the tree, lists one level at a time (areas, sectors, or a sector's blocks), and takes a `disabled(row)` predicate, an
optional `pinned` group and an optional search box. It reads the area and block resources the explore screens
already use; on a field device the whole guidebook is local, elsewhere a level syncs in with the resource's loading
state. `CreateOnMap` switches to it.

- Move destinations browse, opening at the entity's current parent, with search as a secondary box.
- The merge survivor opens with the source's siblings pinned, then a name search: the existing `listAreas` /
  `listBlocks` / `listRoutes` Zero queries with their `content` filter, sorted by name, with a higher cap than the
  global search. Rows already shown keep their position; arriving matches append below them, so a tap never lands on
  a row that moved. Built `quietly`, so it never holds the screen pill.

`entitySearch` itself is not reused: its per-group cap and rating sort are wrong for finding a duplicate by name.

`MoveSheet.svelte` and `MergeSheet.svelte` run their steps inside one `Modal` (bottom sheet at 375, panel at 1280).
Move: pick, then confirm only when topo lines will be removed. Merge: pick, fields (skipped with nothing to ask),
confirm with the preview counts and the no-undo notice. The fields step stacks each field as a label over two radio
rows; values clamp to two lines with a "more" toggle expanding in place with `transition:slide={{ duration: motion() }}`.
Confirm buttons follow `interface/confirmations` (merge is red).

Entry: "Move to..." and "Merge into..." in `AreaActions`, `BlockActions`, `RouteActions`, shown by the gate predicates.
The action sheet closes and `await tick()` runs before the next sheet mounts (`openAfter`, `Modal/nested.ts`). Bulk:
a "Select to move" control above the block list of `areas/[id]`, the route list of `blocks/[id]` and the child area list
opens a checklist sheet (`BulkMove`) whose footer reads "Move N to…" and hands the ids to `MoveSheet`. A checklist
rather than checkboxes inside the lists, which already carry topo views, distances and filters.

Built since: the menus mount each sheet on its first open only, so a detail page that never opens one runs none of its
queries and Storybook (Zero unmocked) keeps rendering the action menus. Content swaps inside a sheet go through
`afterClick`: svelte-bottom-sheet closes on a document click whose target it no longer contains, so a row unmounted by
the same click read as outside and closed the sheet at 375.

Undo: `withUndo(move(...), { onUndo: () => move(previous) })` from `toast.ts`.

History lines for `parent` and `mergedFrom` are catalogue entries in `event/verbs.ts`; their values are already names
(section 3), so no resolver is added.

### 7. `merged_into` and the restore guard; one data migration

`areas`, `blocks` and `routes` gain `merged_into` (nullable self-FK, `on delete set null`) with a CHECK
`merged_into is null or deleted_at is not null`, so no path can clear `deleted_at` on a merged row, including moderation
reversal, which calls `restore*Row` directly. `refuseMerged` (`merge/restore.server.ts`) runs inside the three soft
restores after their permission check, the order `refuseWhileRemoved` keeps, and turns the constraint into a readable
refusal. It cannot share one function with `refuseWhileRemoved`: that reads `moderation_decisions` privileged after the
write, while this must run before it. A merge repoints `merged_into` rows naming the source, so every pointer is one hop.
No backfill; `generate:drizzle` and `generate:zero`; deploy zero-cache first.

Weighed and dropped (independent review): generic retirement columns, since no second irreversible soft delete exists
(moderation is reversible, purges and import merges hard-delete); a client-held stamp, which is a guessable timestamp and
would tighten restore's arguments; hard-deleting the source, which a missed reference would cascade away silently.

One custom drizzle migration deletes `topo_routes` rows whose topo's `block_fk` differs from the route's `block_fk`:
seven in production, none in dev.

### 8. Vocabulary

`CONTEXT.md` gains **move** (a new parent in the same region) and **merge** with its **survivor** and **source**: a
merged source is retired, its address shows not found, and references to it in stored text now name the survivor.

## Risks / Trade-offs

- [A large area move rewrites many routes in one transaction] → One update per area in the subtree; regions hold
  thousands of routes, not millions. Tests include a nested area.
- [History stores names, so a renamed parent keeps its old name in past move lines] → That is what happened at the time,
  the same as a past name change.
- [Merge partly runs privileged] → Gates and the caller's own writes run as the caller; the privileged body only
  touches rows by the two locked ids and the tokens naming the source.
- [A reference or markdown column added later is missed by merge] → The two catalogue cases fail until it is decided.
- [The token rewrite scans whole text columns] → Merges are rare and the `ilike` filter limits the writes; no index is
  added for it.
- [Old bookmarks, delivered pushes and shared links to a source show not found] → Accepted, as for deletes today.
- [Moving or merging drops topo lines Undo cannot restore] → The confirmation says so, and the server refuses a stale count.
- [Depends on uncommitted work] → `map-block-summaries` (0143 trigger) lands first.
- [An already-loaded tab during deploy] → New mutators only; it does not offer the actions until it reloads.

## Migration Plan

1. After `map-block-summaries` lands: renumber this branch's two migrations (stale lines, `merged_into`) after its
   0143/0144, then `migrate` from the main checkout.
2. Deploy zero-cache, then the app.
3. Rollback: the app can be reverted freely; `merged_into` stays as an unused column and the stale lines stay deleted.
