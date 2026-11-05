# Proposal

## Why

Once an area, block or route exists, it is stuck where it was created. Fixing a misplaced block or a duplicate
route means deleting it, losing its ascents, photos and history, or asking the operator to edit the database by
hand. Those manual edits have already left 7 topo lines in production pointing at routes that now sit on another
block. Region maintainers need to restructure their guidebook themselves, safely.

## What Changes

- **Move** a route to another block, a block to another area, or an area under another area or to the top level,
  within one region. Offered from each entity's action menu and undoable from the toast.
- **Bulk move**: a select mode on one child list (blocks in a sector, routes on a block, child areas in an area)
  moves the selection to one destination in one step.
- **Merge** two routes, two blocks or two areas of the same region. The person picks the survivor; fields where
  both sides hold different values are chosen one by one, everything else is kept from whichever side has it.
  The survivor takes over the source's ascents, photos, topos, tags, first ascensionists, favorites, children and
  history. The source is retired, not erased, and cannot be restored.
- **References**: references to a merged source in descriptions, ascent notes and comments are rewritten to the
  survivor. History keeps what was written. The source's own address shows not found, as a deleted entity does.
- Moving a route off a block removes its lines from that block's topos, and a one-off migration removes the 7
  existing stale lines.
- Moves and merges appear in entity history and are delivered like any guidebook edit.

Both flows run in a stepped `Modal` (bottom sheet on phones, panel on desktop). No route is added, renamed or
removed, no remote function export moves and `manifest.id` is untouched, so nothing here is client-breaking.
The new mutators are additions: an already-loaded tab simply does not offer them until it reloads.

## Non-goals

- Moving anything across regions. The `move-area.ts` script stays the only way.
- Clone, split, group into a new sub-area, dissolve an area. Split and group are a create plus a bulk move.
- Undoing a merge.
- Matching duplicate routes automatically when two blocks merge.
- Redirecting a merged entity's address. Old bookmarks, delivered pushes and shared links show not found.
- Rewriting history: past edits keep the text that was written.
- Drag and drop in a tree.

## Capabilities

### New Capabilities

- `guidebook/moves`: moving one or several areas, blocks or routes to a new parent inside their region, who may do
  it, what follows the moved item, and undo.
- `guidebook/merges`: merging two entities of the same level, choosing field values, what the survivor inherits,
  who may do it, and how references to a merged entity are kept pointing at the survivor.

### Modified Capabilities

None.

## Impact

- **Tables**: no schema change; one data migration. Merge rewrites reference tokens in `areas`, `blocks`, `routes`
  descriptions, `ascents.notes`, `reactions.body` and `deleted_comments.body`, and repoints rows in `ascents`, `files`, `topos`, `topo_routes`, `routes_to_tags`, `routes_to_first_ascensionists`,
  `route_external_resources`, `favorites`, `import_refs`, `content_reports`, `events`, `changes`, `notifications`,
  `geolocations`. Move rewrites `routes.area_fks` / `area_ids`, block `order`, and `topo_routes`.
- **Entity modules**: `src/lib/entities/area/`, `block/`, `route/` (new move and merge handlers, mutators,
  `writes.ts`), `report/` (closing collided reports), `event/`.
- **Components and routes**: `AreaActions.svelte`, `BlockActions.svelte`, `RouteActions.svelte`, the block list on
  `areas/[id]`, the route list on `blocks/[id]`, the sector chooser in `CreateOnMap.svelte` (picker extracted),
  the history change renderer for parent and merge lines.
- **Depends on** the uncommitted `map-block-summaries` change (its grade-count trigger).
- **AGENTS.md**: one line on the new legitimate use of `asPrivileged`.
- **Vocabulary**: `CONTEXT.md` gains "move" and "merge" (survivor, source).
- **i18n**: new keys in `messages/en.json` and `messages/de.json`.
