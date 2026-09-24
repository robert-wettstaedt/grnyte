# Tasks

No i18n task: the change introduces no user-facing copy, so neither `messages/en.json` nor
`messages/de.json` is touched. See `proposal.md` under Impact.

## 1. The rule, in one module

- [x] 1.1 Add `src/lib/state/scroll.ts` holding the scroll rule: a factory producing a
      `snapshot` object (`capture` reading the container's `scrollTop`, `restore` writing it) plus
      the element binding a layout needs. Keep the pure parts in plain `.ts` so Stryker can reach
      them, per `AGENTS.md`. Verify with unit tests in `src/lib/state/scroll.test.ts` over a fake
      container: capture returns the current offset, restore assigns it, restore of a never-scrolled
      entry leaves it at zero.
- [x] 1.2 Add the bounded re-apply from `design.md` (Restoring against content that has not synced
      yet): restore re-asserts the position until the container can honour it or a bound is reached,
      and cancels on any reader-initiated scroll. Verify with unit tests: a container that grows
      after restore ends at the target, a container that never grows enough gives up rather than
      looping, and a scroll event during the window cancels it.
- [x] 1.3 Have `trackHistoryDepth` in `src/lib/state/navigation.svelte.ts` pass the `TrailEvent.type`
      it already computes to the scroll module alongside `trail.record`, so both read one
      classification. Verify by extending the existing navigation tests: a `replaceUrl` navigation
      reports `replace` to both, a plain `push` reports `push` to both.
- [x] 1.4 Implement reset-on-push in the scroll module: `push` zeroes the marked containers,
      `replace` and `enter` leave them alone, `popstate` defers to `snapshot`. Verify with unit
      tests over a fake container per navigation type. Before trusting this module, run
      `npm run test:mutation -- --mutate src/lib/state/scroll.ts` and read every survivor;
      the reset-vs-leave-alone branches are where a vacuous test would hide.

## 2. Wiring the surfaces

- [x] 2.1 Wire `(app)/settings/+layout.svelte` to the helper and verify by hand at 375x667:
      scroll `/settings` to the bottom, open Notifications (lands at top), press back (returns to
      the previous offset). This is the reported defect and the smallest end-to-end proof.
- [x] 2.2 Wire the remaining layouts that own a `<main>`: `(app)/(shell)/`, `(app)/areas/`,
      `(app)/ascents/`, `(app)/blocks/`, `(app)/regions/`, `(app)/routes/`. Verify each with one
      forward-and-back pair per layout, including `/feed` to `/profile`. `ascents/` was missing from
      the proposal's list; four of these carry no fixture taller than 375x667, so drive those at a
      shorter viewport rather than recording an untested pass.
- [x] 2.3 Delete `goToSibling`'s reset loop, `SCROLL_SURFACE_ATTRIBUTE` and `siblingScrollSurface`
      from `src/lib/components/SiblingNav/siblingNav.ts`, and drop the spread from
      `routes/+layout.svelte`, `Panel.desktop.svelte`, `Modal.desktop.svelte` and
      `Modal.mobile.svelte`. If `goToSibling` is then only a `push`, remove it and update its
      callers. Verify by driving prev/next on a route detail screen: the sibling still opens at the
      top with the loop gone.
- [x] 2.4 Verify the explore sheet and panel reset and do not restore, per `design.md` (The explore
      sheet and panel reset, and do not restore). At 375x667: scroll a block sheet's route list,
      navigate to another entity, confirm it opens at the top; then open a route from the scrolled
      list and press back, confirming the sheet returns at the top rather than part-scrolled. Repeat
      the first case against the desktop panel at 1280x800. The back case is the one that would have
      tempted restoration, so drive it rather than assuming the reset covers it.

## 3. Proving it

- [x] 3.1 Add an e2e spec, `e2e/scroll-restoration.spec.ts`, covering the requirements that unit
      tests over a fake container cannot: forward lands at top, back restores, forward-again after
      back restores, and two scrolled entries restore independently. Drive it at 375x667.
- [x] 3.2 Cover the late-sync case named in `design.md` as the main risk: go back to a list long
      enough that its scroll height depends on synced rows rather than on chrome, and assert the
      restored offset. Verify this test red first by removing the re-apply from task 1.2; a test
      that passes without it is measuring chrome height, not synced content.
- [x] 3.3 See every new test red before trusting it, per `AGENTS.md`: for each, name the one
      production edit that should break it, make that edit, run it, revert. Check the fixture rather
      than the assertion when one refuses to fail, and grep the mutated text to confirm the mutation
      applied.
- [x] 3.4 Verify the media viewer is undisturbed: open it from a scrolled screen, page to a sibling,
      close it, confirm the screen behind kept its offset. This is the case reset-on-push would
      break if the classification were derived twice.

## 4. Handing back

- [x] 4.1 Add one line to `AGENTS.md` stating that a layout owning a scroll container takes it from
      the scroll helper, which is the only thing standing between a seventh `<main>` and a silent
      regression (see `design.md`, Risks).
- [x] 4.2 Run the verification sweep over the touched paths and nothing else: `npx prettier --write`,
      `npx eslint`, `npx vitest run --project browser` for the unit tests, then the typecheck
      (`./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` beside a live dev server, per
      `AGENTS.md`).
- [x] 4.3 Run `npm run lint:duplication` and `npm run lint:unused`. Six layouts taking the same
      helper is the likely jscpd hit; if a clone is deliberate, say so and run
      `npm run lint:duplication:accept`.
- [x] 4.4 Drive the running app at both 375x667 and 1280x800. 375 is the load-bearing width here:
      a destination shorter than the viewport clamps to zero and the desktop pass proves nothing.
      Close the pages opened and report the browser free, per the worktree rules in `AGENTS.md`.

## What the e2e suite caught

All five pass. Three findings the unit tests could not have produced, because each was about the
world the code runs in rather than its logic:

- `navigation.from.url` is null on a document's first navigation. The unguarded `.pathname` threw
  inside `afterNavigate`, which left Kit's client router dead, so every link fell back to a full page
  load. The fixture always supplied a `from.url`, so no unit test could see it.
- Kit calls `restore` on a remounted layout before its attachment binds the new element, so a layout
  that unmounts on the way out dropped the offset. Queued until the container arrives.
- Two test-harness faults that looked exactly like product bugs: `waitForURL` resolves before Kit has
  navigated, so a second history move raced the first and Kit dropped it; and Playwright scrolls a
  click target into view first, so following a link at the top of a scrolled screen moved the reader
  to the top before navigating and the entry correctly stored zero.

The lesson worth keeping is in `verify-at-point-of-use` terms: four rounds were spent inferring from
symptoms when the trace was already on disk, and one diagnostic run settled it. Instrument on the
first unexplained failure, not the fourth.

## Found by review, fixed

Two rounds with two reviewers, converged with no findings outstanding.

- The reset keyed on push-versus-replace, but `trail.exit` REPLACES to a different screen whenever it
  cannot pop, which is every form submit and cancel. Driven: cancelling `/routes/5413/edit` at 760
  landed the detail page at 341. The rule now keys on the screen, not on how the entry was written.
- The reset zeroed the container but left an in-flight restore running, so a push landing inside the
  window was dragged back a frame later. It now abandons the restore, and a queued one.
- Widening the rule broke the ascent deep link. See `design.md` for why the first two fixes failed.
- `INTERACTIONS` missed `pointerdown` and `keydown`, so a desktop reader taking over by scrollbar or
  keyboard was dragged back for up to five seconds. One-size defect, invisible at 375.
- Spec requirement 1 contradicted requirement 3, since the media viewer adds an entry and must not
  move the reader. R1 now triggers on arriving at a DIFFERENT screen.

## Raised, not fixed

Both pre-existing, both outside this diff, both unowned:

- `replacing` in `navigation.svelte.ts` has the same consumed-by-the-wrong-navigation flaw the
  forwarding flag had, so a redirect issued from a mount is recorded as a push. The browser entry
  really is replaced, so the trail's depth over-counts by one after every ascent deep link, which
  makes `canGoBack()` and `back()`'s delta wrong on exactly the navigation a push notification
  produces.
- `TopoAddRouteModal.svelte` `pick` closes the inner dialog and calls `onAdd` synchronously, and the
  `await tick()` in `addRouteLine` sits after the line that unmounts the outer sheet, so it separates
  nothing. Both surfaces are panel plus backdrop, the trapping shape `AGENTS.md` warns about
  (committed in `0ed81bec`).
