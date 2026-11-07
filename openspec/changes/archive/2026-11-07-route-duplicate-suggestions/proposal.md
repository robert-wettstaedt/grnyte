# Proposal

## Why

People sometimes add a route that already exists. Merge cleans that up afterwards, but only someone allowed to merge can do it, and a merge cannot be undone. Showing likely matches while the name is being typed stops most duplicates at the point they are created.

## What Changes

- The add-route form lists up to three existing routes of the same region whose names look like the one being typed.
- Matching tolerates case, accents, punctuation, spacing and small typos, and is stricter for routes outside the block's own sector.
- Tapping a suggestion opens a preview sheet, and closing it returns to the form untouched.
- From the add page the preview can go to the route. In the topo editor it never leaves the editor, and a route of the same block can take a line instead.
- An exact name match on the same block gets stronger wording.
- Submitting is never blocked. Two routes may legitimately share a name.

No **BREAKING** changes. No URL, remote function export, mutator, query argument or `manifest.id` changes, so already-loaded tabs simply keep the old form until they reload.

## Non-goals

- Blocking or confirming a submit, or a uniqueness constraint in the database.
- Catching unnamed routes, including topo "Quick line" routes, or the same line under an unrelated name.
- Listing a block's routes before anything is typed.
- Suggestions while editing an existing route.
- Suggestions for blocks or areas.
- Matching across regions.
- Offering merge or move from the suggestion list.

## Capabilities

### New Capabilities

- `guidebook/duplicate-suggestions`: what the route-creation forms suggest while a name is typed, which names count as similar, and what a person can do with a suggestion.

### Modified Capabilities

None. `guidebook/merges` keeps its requirements: this change reduces how often a merge is needed and does not alter one.

## Impact

- **Entity modules:** `src/lib/entities/route/` (`RouteFormFields.svelte`, `resources.svelte.ts`, plus a new matcher and a new suggestion component).
- **Routes:** `src/routes/(app)/blocks/[id]/routes/add/` by way of the shared fields, and `src/routes/(app)/blocks/[id]/topos/edit/TopoAddRouteModal.svelte`.
- **Tables:** `routes` is read only. No schema change, no migration, no backfill.
- **Reads:** the existing `listRoutesForMap` and `listRoutes` Zero queries with arguments they already accept. No writes change.
- **Copy:** new keys in `messages/en.json` and `messages/de.json`.
- **Dependencies:** none added.
