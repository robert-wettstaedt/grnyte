# Proposal

## Why

Nothing in the app scrolls the window. `(app)/+layout.svelte` pins the frame with `fixed inset-0`
and the real scrolling happens in a `<main class="overflow-y-auto">` owned by a nested layout, so
`document.documentElement` has zero scrollable overflow. SvelteKit's scroll handling drives
`window`, which means it neither resets on forward navigation nor restores on back. Both halves of
the browser contract are silently missing.

Forward, that reads as a page opening part-scrolled. Measured at 375x667 on the dev server:
scrolling `/settings` to the bottom and tapping Notifications lands at `scrollTop: 107`, because the
`<main>` is the same DOM element across the navigation and only its children swapped. At 1280x800 the
destination is shorter than the viewport and the browser clamps to 0, so the defect is invisible on
the desktop pass and lands on phones only.

Back, it reads as losing your place: returning to a long list drops you at the top. That half is the
more damaging one and the more expensive to hand-roll, because correct restoration is per history
entry and has to survive a reload.

## What Changes

- **A scrolled surface is restored when back returns to it.** Leaving a screen records where its
  scroll container was; returning to that history entry puts it back. This uses SvelteKit's
  `snapshot` export, which the Kit docs name for this exact case ("scroll positions on sidebars"),
  so per-entry storage and `sessionStorage` survival across a reload come from the framework rather
  than from app code.
- **A forward navigation onto a new entry starts at the top.** A push lands at `scrollTop: 0`
  regardless of where the previous screen was left.
- **A replace navigation leaves scroll alone.** Paging the media viewer and any other
  `replaceUrl` navigation stays put; it is the same screen, not a new one.
- **The rule is stated once and rides the trail's existing classification.** `trackHistoryDepth`
  already decides push / replace / popstate / enter for the back-navigation work, and Kit's
  `afterNavigate` exposes no `noScroll` signal, so the scroll rule reads that same classification
  instead of deriving a second, disagreeing one.
- **`goToSibling`'s hand-rolled reset is removed.** It currently queries `[data-sibling-scroll]` and
  zeroes every match, which is this rule applied to one call site. Once a push resets by default,
  that loop and the `siblingScrollSurface` marker it exists for are redundant.

## Non-goals

- **Restructuring the app shell so the document scrolls again.** Considered and rejected, with the
  reasoning recorded in `design.md`. The short version: `transform-gpu` on `[data-app-frame]` is
  load-bearing as the containing block for all `fixed` chrome, `sheetState.sheetTop` and
  `Modal.mobile` measure sheet geometry against that frame, the map and topo editors must never
  scroll the document at all (which would reintroduce a per-route `overflow: hidden` toggle on
  `<html>`, the same bespoke mechanism in a worse place), and a document scroller brings back the
  iOS URL-bar resize and body-scroll-lock problems the fixed shell exists to avoid. Kit supports a
  custom scroll root through `snapshot`; the restructure buys nothing this change does not already
  get.
- **Fragment and `:target` scrolling.** `#section` links do not work against a custom scroller and
  will not start to here. No route uses one today.
- **Scroll position surviving a hard reload of the current screen.** `snapshot` restores an entry
  the user navigates back to. Reloading in place is out of scope, matching the reload caveat
  `fix-back-navigation` already accepts.
- **Horizontal scroll containers.** `ContributionCalendar` manages its own `scrollLeft` and keeps
  doing so.
- **The explore map surface.** It does not scroll; it pans.

## Capabilities

### New Capabilities

- `navigation/scroll-restoration`: where a screen's scroll container lands when the app navigates
  forward, back, or replaces the current entry.

### Modified Capabilities

None. `navigation/back-navigation` is a sibling capability under the same path and is not amended:
its `design.md` lists scroll restoration as out of scope, and this change fills that gap without
changing any requirement it states.

## Impact

**Routes.** Every layout that owns a scroll container: `(app)/(shell)/+layout.svelte`,
`(app)/settings/+layout.svelte`, `(app)/areas/+layout.svelte`, `(app)/ascents/+layout.svelte`,
`(app)/blocks/+layout.svelte`, `(app)/regions/+layout.svelte`, `(app)/routes/+layout.svelte`.
Each gains a `snapshot` export built by one shared helper.

**Modules.** A new scroll module under `src/lib/state/`, beside `navigation.svelte.ts` and
`trail.svelte.ts`, which it reads the push / replace / popstate classification from.
`src/lib/components/SiblingNav/siblingNav.ts` loses `goToSibling`'s reset loop, the
`SCROLL_SURFACE_ATTRIBUTE` constant and the `siblingScrollSurface` export; its four consumers
(`routes/+layout.svelte`, `Panel.desktop.svelte`, `Modal.desktop.svelte`, `Modal.mobile.svelte`)
drop the spread.

**Entity modules and tables.** None. No Zero query, no remote function, no schema change, no
backfill.

**i18n.** None. The change introduces no user-facing copy, so neither `messages/en.json` nor
`messages/de.json` is touched.

**Client-breaking: no.** No URL is reshaped, no `.remote.ts` file moves, no remote function export
is renamed, and `manifest.id` is untouched. An already-loaded tab across the deploy keeps the old
behavior (no restore, no reset) until it reloads, which is the defect it already has, not a new
failure.

**Verification risk.** The forward defect is only visible where the destination is taller than the
viewport, which on most screens means 375x667 and not 1280x800. Both widths are required, and the
375 pass is the one that can fail.
