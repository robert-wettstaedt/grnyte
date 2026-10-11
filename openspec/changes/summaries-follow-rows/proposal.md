# Proposal

## Why

The rule "Derived totals require a confirmed query" blanks every count, chart and position until the
server confirms its list. Zero marks every query unconfirmed after a reload, so screens whose data is
already complete on the device show blank charts and missing numbers for 1 to 3 s (measured 3.1 s on
a Firefox reload of an area page). The rule cannot tell a complete local copy from a fragment left by
another screen, so it withholds both. The cases that actually misled readers (absence claims, form
seeds, offline fragments, the feed's newest window) are already guarded by narrower rules.

Withholding also splits the "still syncing" cue: each `QueryState` draws its own pill, so a screen
with a dependent list (a profile's projects) shows a pill, drops it, then shows another.

## What Changes

- Summary values (counts, tallies, histograms, donuts, "n of N", filter counts, prev/next arrows)
  render from the rows on hand while their query is arriving, and settle in place once confirmed.
- A zero from an unconfirmed query still waits: "0 routes" or an empty chart is an absence claim.
- Offline fragments (`partial`, `unavailable`) keep withholding summaries, unchanged.
- One "still syncing" pill per screen replaces the per-`QueryState`, feed and map status pills. It
  sits in one fixed spot for the whole app, shows while any screen query is arriving, appears after
  250 ms, and lingers briefly so a dependent query does not make it blink.
- The pill can carry one screen-supplied action (the feed's "N new") or status (the map's "Loading
  map…"). Precedence: action, then screen status, then the generic syncing text. The pill morphs
  between them in one box rather than swapping elements.
- App-wide queries (grades, current user, roles, regions, unread count) do not hold the pill up.
- Unchanged: absence claims, form seeding, action gates (block order sort, remove all favourites,
  first-ascent "New"), and the feed's first newest-first window keep waiting for confirmation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/query-readiness`: "Derived totals require a confirmed query" is replaced by "Summary values
  follow the rows on hand" (with the zero rule, folding in the map marker exception); "One query
  reads the same everywhere" drops its "no total while arriving" clause; a new requirement states
  that a screen shows one syncing indication that follows all its queries.

## Non-goals

- No change to `QueryPhase`, to the offline keep table, or to when a query counts as answered.
- No per-value cues ("12+", shimmer on a digit) and no count-up animation: values swap in place.
- No change to the feed's first-window rule or to Zero's `prefix` result type (not shipped by Zero).
- No new copy: the pill reuses `common_syncing` and `map_loading`, and the feed its `feed_newActivity`.

## Impact

- Readiness layer: `src/lib/zero/resource.svelte.ts` (screen registry of arriving resources, a
  summary helper), `src/lib/state/global.svelte.ts` (global resources opt out).
- Pill: `src/lib/components/StatusPill/StatusPill.svelte` (one box that morphs), a new pill state
  module under `src/lib/state/`, rendered once in `src/routes/(app)/+layout.svelte`.
- Pill removed from: `src/lib/components/QueryState/QueryState.svelte` (and its `syncing` snippet,
  used by `EventLog.svelte` and `(shell)/feed/+page.svelte`), `src/lib/components/EventFeed/EventFeed.svelte`,
  `src/routes/(app)/(shell)/(explore)/(map)/+layout.svelte`.
- Summary sites: `areas/[id]/+page.svelte`, `areas/[id]/AreaListItem.svelte`,
  `areas/[id]/routes/+page.svelte`, `Filter/Filter.svelte`, `blocks/[id]/+page.svelte` (explore),
  `routes/[id]/+page.svelte`, `routes/[id]/ascents/+page.svelte`, `blocks/[id]/topos/[topoId]/+page.svelte`,
  `blocks/[id]/topos/edit/+page.svelte`, `Profile/ProfileView.svelte`, `ascent/AscentFormFields.svelte`.
- Entity modules touched only through their screens: area, block, route, ascent, user, event.
- No tables, no schema change, no remote function, URL or `manifest.id` change: nothing breaks an
  already-loaded tab across the deploy; an old tab keeps its old per-list pills until it reloads.
- Spec: `openspec/specs/sync/query-readiness/spec.md`.
