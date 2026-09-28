# Design

## Context

See proposal.md for motivation. The constraints that shape the approach:

- `blockRouteList` (`$lib/entities/block/resources.svelte`), which feeds the editor's route list and
  its selected route, maps only `createdBy`, `description`, `gradeFk`, `id`, `name`, `rating`,
  `regionFk` and `tags`. It has no `firstAscents`, no `rawName`, no `rawGradeFk` and no
  `firstAscentYear`.
- `updateRoute` replaces the tag and first ascensionist lists rather than patching them, and refuses
  a submit whose `known` fingerprint does not match stored. A form seeded before those lists arrive
  therefore strips them.
- `TopoRouteCard` and the routes `Modal` are the two branches of one `{#if selectedRoute != null}` /
  `{:else}` in the editor page. The routes sheet exists only while nothing is selected. So the new
  edit surface opens with no other `Modal` mounted, and the nested-dialog focus-trap rule that
  governs `TopoAddRouteModal` does not reach it. The add modal keeps that hazard, unchanged.
- The editor page already has a function named `editRoute`, which selects a route for line editing.
- The editor's shortcut handler is a window listener, inert only while `isTypingInField` is true.

## Goals / Non-Goals

**Goals:**

- One component shared by every route form in the app, so the field set cannot drift per surface
  again.
- No second write path for routes.
- A form that is impossible to seed from partial data, rather than one that merely usually is not.

**Non-Goals:**

- Teaching `TopoEditor` about anything other than lines. Route metadata does not enter the dirty
  session, the undo stack or the working docs.
- Fixing the pre-existing gap where the editor's other shortcuts stay live while its routes sheet is
  open. See Risks.

## Decisions

### The edit surface is a new component, not a reshaped `TopoAddRouteModal`

A new `TopoEditRouteModal.svelte` beside the editor's other surfaces. It reuses `Modal.svelte` with
the same geometry `TopoAddRouteModal` establishes (`backdrop`, `panel`,
`panelClass="fixed inset-y-0 right-0 z-50"`, a bottom sheet on mobile), so the screen keeps one
surface shape.

Alternative rejected: extending `TopoAddRouteModal` with an edit mode. Its two-step structure, its
`createRoute` singleton handling and its nested-in-a-sheet lifecycle are all specific to creating,
and the shared part is `RouteFormFields`, which both will now use directly. A mode flag would fuse
two lifecycles to share a component they can each import.

### Reads are Zero queries, writes are existing remote functions

- Read: `routeDetail(() => selectedRouteId)` from `$lib/entities/route/resources.svelte`, a Zero
  query, with `enabled` gated on the modal being open. The editor already carries a lot of synced
  state; hydrating a full detail tree for a route nobody is editing would widen that for nothing.
- Write: the existing `updateRoute` (`$lib/entities/route/routes.remote`), an `authedForm` gated by
  `requireRowForm` and `canEditRoute`. No new remote function, so no endpoint id is created or moved
  and already-loaded tabs are unaffected.
- Permission read: `canEditRoute` (`$lib/entities/route/permissions`), against the route row, to
  decide whether `TopoRouteCard` renders the action at all.

No schema change, no migration, no backfill.

### The form body mounts per open, which is what makes seeding safe

The modal's content sits behind `{#if open}`, so the form mounts on every open on both platforms.
(The mobile sheet already mounts its body on open, but a desktop panel keeps it mounted, so without
this the desktop path would reopen carrying the previous route's values.) Seeding then uses
`seedOnKeyChange` keyed on a latched hydrated id, exactly as `/routes/[id]/edit` does, and
`RouteFormFields` is wrapped in `{#key detail.id}` so its once-on-mount state cannot be reused across
routes.

Alternative rejected: keeping the body mounted and keying the seed on a composite of route id and an
open counter. `seedOnKeyChange` accepts a string key so it would work, but the key stops being an
identity and becomes a re-render trigger, which is the thing that module's doc warns against.

The hydration latch is copied, deliberately not extracted: it is five lines, and the parked
`QueryResource` `hydrated` flag is the right place to unify all of these at once rather than growing
a second half-abstraction now.

### `known` is captured in the seed

`known: routeListsFingerprint(data.tags, data.firstAscents)` is set inside the seed callback, from
the same snapshot the visible fields come from, and submitted through a hidden input. Never recomputed
at submit: a fingerprint computed at submit time describes whatever has synced by then, matches itself
every time and guards nothing.

### `RouteFormFields` gains `allowMedia`, defaulting to true

Its media block is gated `{#if route == null}`. It becomes `{#if route == null && allowMedia}`, with
`allowMedia = true` as the default so the existing add page is untouched. The topo editor's add modal
passes `false`.

Alternative rejected: inverting the default or making the caller opt in. Two of the three call sites
want media; the default should be the majority and the editor should state its exception.

### Both editor forms render `RouteFormFields`

`TopoAddRouteModal`'s step 2 drops its hand-rolled name input, `GradePicker` and `RouteTagsInput` and
renders `RouteFormFields` with `allowMedia={false}` and no `route`. Its own `blockId` hidden input
goes too, because `RouteFormFields` renders one. Step 1 and its "Quick line" button are untouched:
quick line posts only `blockId` from a separate form, and remains the fast path.

### The shortcut and the rest of the keyboard

`topoEditorKeydown` gains an `onEditRoute` callback and a branch for `e`, which fires only when
`editor.selectedRouteFk != null`. It also gains a predicate for "a route form is open" and returns
early when it is true, before any other branch. `isTypingInField` is not sufficient: with the form
open and focus on a button rather than an input, `1` would still switch photos and `j` would still
change the selection under the form.

Esc is left to `Modal`. The window handler's Esc branch is behind that same early return, so closing
the form cannot also clear the selection and unmount the card the form was opened from.

### Found during implementation, not predicted here

Three things the plan above got wrong, kept as decisions because each was driven in the app:

- **The surface is two components, not one.** The seeding has to happen in whatever mounts per open,
  and the modal shell cannot unmount itself. `TopoEditRouteModal` owns the resource, the latch and
  the header's save button; `TopoEditRouteForm` behind `{#if open}` owns the seed, the reset and the
  submit. One component would have kept `seedOnKeyChange`'s `applied` across a close, so reopening
  the same route would not reseed.
- **`updateRoute` redirects.** Its `redirectTo` reaches the client as a 303 that Kit applies as a
  push to the route screen, so the first working version saved correctly and then left the editor,
  taking the unsaved lines with it. The form wraps its submit in `createRedirectCapture`
  (`$lib/state/redirectCapture.svelte`) and drops the destination. `Form.svelte` is the only other
  user and captures it for the opposite reason.
- **Cancelling the redirect was not enough; the editor's own leave guard also saw it.** Kit runs
  every registered `beforeNavigate` over a Set, and the page's "Leave without saving your changes?"
  guard is a second handler on the same navigation. It prompted before the capture cancelled, so
  saving a route with unsaved lines asked exactly the question this feature exists to stop asking,
  even though nothing was ever lost. The guard now returns early for that one destination while
  `updateRoute.pending > 0`, matched on the URL rather than on `pending` alone so a real navigation
  raced against a save still prompts.
- **The window handler had to move to the capture phase.** zag closes the dialog from a document
  listener, which in the bubble phase runs before the editor's window handler, so `formOpen` read
  false and Escape both closed the form and cleared the selection. `onkeydowncapture` makes the
  order deterministic: the editor sees the Escape while the form is still open, returns early, and
  zag closes the dialog.

### The dead fallback

`{route.name || m.topo_quickLine()}` becomes `{route.name}`. `name` comes from `toDisplayName`, which
has already substituted `common_unnamed`, so the right-hand side is unreachable today and the app has
one wording for a nameless route.

## Risks / Trade-offs

- A rename saved immediately survives a "discard" answer to the editor's leave confirm → Accepted and
  specified. It matches photo uploads and route deletion, which are already immediate on this screen.
  The alternative costs `TopoEditor` a second kind of dirt and an answer for what undo does to a
  rename.
- Step 2 of the add modal grows from three fields to seven inside a sheet nested in the routes sheet,
  the one surface here with a known focus-trap fragility → The fragility is about unmounting an outer
  dialog in the same flush, which taller content does not change. The real cost is scroll length on a
  375px screen, which the verification sweep at that size has to confirm.
- `updateRoute` and `createRoute` are module-level singletons shared with the standalone add and edit
  pages → The per-open mount plus the existing `clearForOpen` reset in the add modal cover values;
  Kit's issues survive a `fields.set` and only a real DOM reset clears them, which is why the reset
  stays.
- The editor's other shortcuts remain live while the routes sheet and the add modal are open, which
  this change does not fix → Pre-existing, out of scope, and now easy to close later because the
  predicate this change adds is the hook for it.
- Naming: the page's existing `editRoute` means "select this route" → The new handler takes a
  different name. Reusing it would silently shadow line selection.
