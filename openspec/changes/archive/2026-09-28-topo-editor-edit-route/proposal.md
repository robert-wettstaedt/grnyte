# Proposal

## Why

The topo editor can create a route entity and delete one, but never change one. Its own "Quick line"
button posts a route with an empty name and no grade, so the editor manufactures nameless, ungraded
routes and then offers no way to fix them without leaving the screen. Leaving is not free: the editor
batches line drawing into a dirty session and guards navigation with a confirm, so today the only
path to the edit form asks the user to throw their drawing away first.

The same screen also describes a route twice and disagrees with itself. Its new-route form hand-rolls
three fields where the rest of the app offers seven, so what a route is depends on where you created
it.

## What Changes

- The selected-route card gains an Edit action beside the existing Delete, gated on `canEditRoute`
  and hidden when that gate fails.
- Edit opens a form surface inside the editor with the app's full route field set: name, grade,
  rating, tags, description, first ascent year and first ascensionists. It reuses `RouteFormFields`
  and the `updateRoute` remote function rather than adding a second write path.
- The editor's existing new-route form moves to the same full field set, replacing its hand-rolled
  subset with the same shared component. Both surfaces on this screen then describe a route
  identically.
- `RouteFormFields` gains a way to suppress its media picker. That picker is offered in create mode
  only, and the topo editor already owns a separate photo upload for topo photos, so two unrelated
  "add a photo" affordances would otherwise share one surface. Route media stays on the route detail
  screen.
- Neither form opens ready. The editor's route list carries no first ascensionists and no stored raw
  name, so the edit surface loads the route's detail on open and shows a loading state, or an offline
  notice, until the related rows are local. Seeding before then would post an empty tag list and
  silently strip the route's tags, because `updateRoute` replaces those lists rather than patching
  them.
- Saving a route is an immediate write, independent of the editor's dirty line session, matching how
  photos and route deletion already behave on this screen.
- The `E` key opens the edit form for the selected route, joining the editor's existing shortcut set,
  and is inert with no selection.
- Fixes a live defect found while reading. `TopoRouteCard` renders `{route.name || m.topo_quickLine()}`,
  but `name` comes from `toDisplayName`, which has already substituted the unnamed fallback. The
  branch is unreachable, so the card promises a label it can never show. The dead fallback goes and a
  nameless route reads as it does everywhere else in the app.

## Capabilities

### New Capabilities

- `topo/route-editing`: what a person can change about a route from inside the topo editor, what they
  see while the route's data is still arriving, when the action is offered at all, and how those
  edits relate to the editor's unsaved line work.

### Modified Capabilities

None. No existing capability describes the topo editor.

## Impact

Touched:

- `src/routes/(app)/blocks/[id]/topos/edit/+page.svelte`: owns the selected route, the edit surface's
  open state and its detail resource.
- `src/routes/(app)/blocks/[id]/topos/edit/TopoRouteCard.svelte`: the Edit action, and the dead
  fallback removal.
- `src/routes/(app)/blocks/[id]/topos/edit/TopoAddRouteModal.svelte`: step 2 swapped for the shared
  form component.
- `src/routes/(app)/blocks/[id]/topos/edit/keydown.ts` and `keydown.test.ts`: the `E` shortcut.
- `src/lib/entities/route/RouteFormFields.svelte`: the media suppression prop.
- A new component beside the editor's other surfaces for the edit form.
- `messages/en.json` and `messages/de.json`.

Reused unchanged: `routes.remote.ts` (`createRoute`, `updateRoute`), `fingerprint.ts`
(`routeListsFingerprint`), `permissions.ts` (`canEditRoute`), `resources.svelte.ts` (`routeDetail`),
`Modal.svelte`.

No table, column, RLS policy or migration changes.

Not client-breaking. No URL is added, removed or reshaped, no remote function is moved or renamed,
and `manifest.id` is untouched, so an already-loaded tab keeps working across the deploy. It lacks
the new button and keeps the three-field new-route form until it reloads.

## Non-goals

- Editing a route from anywhere other than the topo editor. The block route list and the route detail
  screen keep the paths they have.
- An Edit affordance on the route rows inside the editor's routes picker. That list stays a picker.
- Adding route media from the editor, in either form.
- Changing "Quick line", which stays the fast path and is what serves someone mid-draw.
- Folding route edits into the editor's Save button or its undo history. Metadata writes stay
  immediate, so a rename survives a later "discard" answer to the leave confirm, exactly as a photo
  upload and a route deletion already do.
- Any change to how `createRoute` or `updateRoute` validate, or to the stale-list guard.
- Re-labelling a nameless route anywhere outside `TopoRouteCard`.
