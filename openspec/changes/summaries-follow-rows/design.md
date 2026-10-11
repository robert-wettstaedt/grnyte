# Design

## Context

See proposal.md for the motivation. The pieces this builds on:

- `QueryPhase` (`src/lib/zero/resource.svelte.ts`): `answered` is server-confirmed this session and
  latched; `arriving` is rows on hand with the connection up; `partial` is offline rows never
  confirmed; `loading` is nothing on hand. None of that changes.
- Screens gate summaries by hand on `phase.kind === 'answered'` at the sites listed in the proposal.
  The map dropped its gate on `fix/map-live-counts`, which this change builds on.
- Three things draw a status pill today, all through `StatusPill`: `QueryState` (sticky in its list,
  replaceable through its `syncing` snippet), `EventFeed` (sticky, swapping to the "N new" button),
  and the map layout ("Loading map…", fixed at `top-16`).
- Measured on the dev stack (Chrome and Firefox, region 18): queries one screen registers together
  confirm within about 90 ms of each other; a dependent query (the profile's project lists, keyed by
  route ids from the logbook) confirms 100 to 450 ms after the query it depends on.

All reads stay Zero queries through entity resources. No writes, remote functions or schema change.

## Goals / Non-Goals

**Goals:**

- One helper decides whether a summary may show, so the zero and offline rules live in one place.
- A registry of arriving resources per surface, fed by the readiness layer, so no screen wires its
  own pill and a new resource counts by default.
- One pill component per surface, able to morph between status and action.

**Non-Goals:**

- No change to `resolvePhase` or the latch. Summaries read the phase, they do not redefine it.

## Decisions

### 1. A summary helper beside `expectingMore`

`summaryOf(phase, value)` in `resource.svelte.ts` returns the value when the phase is `answered`, or
when it is `arriving` and the value is non-zero; otherwise `undefined`. Callers pass the number they
display (a count, a map's size, a list's length), so the zero rule applies to what is shown, not to
the raw rows: a filter that matches nothing among rows on hand is a zero and waits. A list-valued
caller (sibling nav) passes its rows and gets them back on the same terms.

Alternative: a boolean `summaryShown(phase, hasRows)`. Rejected because callers then compute the
zero test themselves, which is where a raw-row count would slip in for the displayed one.

`partial` and `unavailable` return `undefined`, which keeps offline fragments unsummarised without a
separate offline check at each site.

### 2. Arriving resources hold the pill of their surface

A surface (`PillSurface` in `src/lib/state/pill.svelte.ts`) owns a `SvelteSet` of holders and of
offers. `createPillSurface()` makes one and publishes it on context; `pillSurface()` returns the
nearest one, or the app's root surface where none is set. `Resource` resolves its surface at
construction (component init, where context is readable) and gets an `$effect` that holds that
surface while its phase is `arriving`, releasing on cleanup, so an unmounted screen drops out.

Global resources and search opt out through `quietly(fn)`, a construction-time counter:
`setGlobalState` wraps its six factories, `entitySearch` its four and the recent lists theirs.
Search lists have their own loading state, and app-wide rows say nothing about the screen.

Context, not one app-wide set, because a pill drawn in the app frame sits under every modal's
backdrop (an activity log's "N new" could not be tapped) and, with a sheet open, reads as belonging
to the map. Context already flows through `Modal` (its depth does), so whatever a sheet renders
holds the sheet's pill.

`createResource` is only called during component init. An `$effect` outside that throws
`effect_orphan`, which fails loudly in dev and in the browser test project.

### 3. One pill per surface, at the top of its scroll

`PillHost.svelte` renders a surface's pill and owns its timing: a status appears 250 ms after it is
first wanted and leaves 200 ms after it stops, so a dependent query does not blink it; an action
appears at once. The timer keys on the content's kind and label, not its identity, so a rebuilt
offer does not restart it.

Where each surface renders its host:

- Every sheet, panel and dialog branch (`$lib/components/Modal` desktop and mobile, the explore
  `Modal` desktop and mobile and `Panel.desktop`): sticky at the top of its scroll area, so it is
  centred over that content and drawn above that surface's backdrop.
- `(shell)/+layout.svelte`: sticky at the top of `main` (feed, profile), centred on the column
  beside the rail.
- The map layout: its own surface for the map's data, fixed under the search bar.
- `(app)/+layout.svelte`: the root surface, fixed under the page header of the chromeless screens.

Screens offer an action or status to their surface's pill through `pillSurface().offer`. The feed
offers "N new" and holds the pill until its connection has caught up; the map offers `map_loading`.

### 4. The pill morphs in one box

`StatusPill` today renders a `<p role="status">` or a `<button>`, two elements. It becomes one box
whose width follows its content through a CSS `transition: width` on the mounted box, with the inner
content crossfading via `svelte/transition` `fade` (150 ms, through `motion()`). The button is the
inner content in the action state, so it is focusable only then.

The live region is separate and always mounted: a visually hidden `role="status"` element holding the
current status text. A live region inserted together with its text is often not announced, so the
region exists before the first message, and the action is not inside it.

### 5. `QueryState`, `EventFeed` and the map stop drawing pills

`QueryState` loses its pill branch and the `syncing` snippet prop; its two callers that passed an
empty snippet drop it. `EventFeed` keeps computing `newCount` and `onMergeNew` but offers them to the
pill instead of rendering one. The map layout removes its `StatusPill` and offers its status.

## Risks / Trade-offs

- [A count briefly lower than the truth on a cold device] → Accepted by decision; it only grows
  toward the confirmed value, and the pill is on screen while it can change.
- [Two pills at once, one over the map and one in a sheet] → Accepted: each sits on the surface it
  describes, which is the point of the per-surface design.
- [A modal that renders resources but no host] → Every `Modal` branch renders its surface's host, so
  a new caller of `Modal` gets one for free; a hand-rolled overlay would fall back to the root pill.
- [Projects or other category lists from a partial logbook] → Not summaries: an attempt that lands
  before its send would list a sent route as open, so those lists stay on `answered`.
- [A resource created outside component init] → `effect_orphan` throws; the browser test project
  and a dev pass over every screen in the verification sweep surface it.
- [Screen reader chatter on many navigations] → Polite only, after the 250 ms delay, so fast loads
  say nothing.
- [Tests pinning the old withholding] → Rewritten to pin the new rule; each seen failing against the
  old gate before it counts.

## Migration Plan

Client-only. Ships with the next deploy; an already-loaded tab keeps the old per-list pills until it
reloads. Rollback is a revert of the change's commits.
