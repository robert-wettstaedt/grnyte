# Design

## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- `(app)/+layout.svelte` pins the frame with `fixed inset-0`, so `window` never scrolls and Kit's
  built-in scroll handling is inert. The scroll containers are the `<main class="overflow-y-auto">`
  elements, one per nested layout.
- Those elements persist across navigations within their layout. That persistence is the forward
  defect and also what makes a layout-level `snapshot` viable.
- `src/lib/state/navigation.svelte.ts` already runs the app's single `afterNavigate`
  (`trackHistoryDepth`) and already classifies every navigation as `enter` / `popstate` / `push` /
  `replace` for `createTrail`. That classification is exactly the input the scroll rule needs.
- `src/lib/components/SiblingNav/siblingNav.ts` already implements a narrow version of this rule for
  one call site, and its own comment states the general problem.
- Content is Zero-synced and arrives after the route renders, so a destination's scroll height grows
  over the first moments of a navigation.

No reads change: this touches no Zero query. No writes change: no remote function is added or
moved. No schema change, so no backfill.

## Goals / Non-Goals

**Goals:**

- One rule, stated once, that every scrolling surface obeys.
- Restoration owned by the framework rather than by app code, since per-entry storage that survives
  a reload is the part most likely to be got wrong by hand.
- The rule derives from the same navigation classification the trail uses, so scroll and history
  cannot disagree about what a navigation was.

**Non-Goals:**

- Beyond the proposal's non-goals: no change to `createTrail`'s rules or to `exit` semantics. This
  change reads the classification `trackHistoryDepth` already computes and adds no new history
  behavior.
- No new abstraction over `<main>`. The layouts keep their own markup.

## Decisions

### Keep the fixed shell; do not restructure to a document scroller

Making `<html>` the scroller again would let Kit's native handling take over and is the tempting
answer. Rejected on four grounds, each checked against the code:

1. `transform-gpu` on `[data-app-frame]` (`(app)/+layout.svelte`) is not a paint hint. It makes that
   row the containing block for every `fixed` descendant, which is what keeps `NavRail`
   (`fixed top-0 h-full`), `TabBar` (`fixed inset-x-0 bottom-0`) and the map's overlays
   (`fixed top-2`, `fixed top-16`) below `StatusBar`. Removing it re-anchors all of them to the
   viewport and each offset has to be redone.
2. The frame is read at runtime, not only styled against. `Modal.mobile.svelte` resolves
   `closest('[data-app-frame]')` and `sheetState.sheetTop` is defined as an offset inside that frame
   precisely because the status bar pushes it down. The mobile sheet's geometry is defined against
   the frame.
3. The map, the topo editor and the block-order screen must never scroll the document. A document
   scroller forces a per-route `overflow: hidden` toggle on `<html>`, which is bespoke
   navigation-coupled logic with global blast radius: the same mechanism this change is trying to
   remove, relocated somewhere worse.
4. A document scroller reintroduces the iOS URL-bar resize, rubber-band overscroll and
   body-scroll-lock-behind-the-sheet problems. The map layout already pins its search bar to
   `visualViewport` because "the iOS on-screen keyboard can't scroll this `fixed` layer up behind
   the status bar", which is a scar from this class of problem, and it is not verifiable from a
   desktop browser.

Kit does not assume the window is the scroller; it provides `snapshot` for when it is not. The
restructure buys nothing this design does not already get.

### Restoration via Kit's `snapshot`, not hand-rolled storage

`snapshot` is Kit's documented mechanism for exactly this, the docs naming "scroll positions on
sidebars" as the case. It stores the captured value against the history entry and persists it to
`sessionStorage`, which covers forward-after-back, multi-entry traversal and returning from another
site.

The doubt worth resolving first was whether `capture` fires from a layout that never unmounts.
Probed against the running dev server, with a temporary `snapshot` export on
`settings/+layout.svelte`:

```text
probe: ["capture:600", "capture:107", "restore:600"]
afterForward: 107   afterBack: 600
```

Capture fires on both navigations, restore fires with the correct value on back, and the container
lands where it was. The probe was reverted.

The same output settles the other half: `afterForward: 107` shows `snapshot` does not address
forward navigation, because a fresh entry has nothing stored and `restore` is never called. Forward
needs its own reset. Alternative considered and rejected: storing positions in a module-level map
keyed by a history token. That reimplements what Kit already persists, and gets the reload case
wrong by default.

### The reset keys on the screen, not on push versus replace

An earlier version of this design reset only on a push, reasoning that a replace is the same screen.
Review falsified it: `trail.exit` replaces to a DIFFERENT screen whenever it cannot pop, which is
every form submit and cancel in the app. Driven before fixing, cancelling `/routes/5413/edit` at
offset 760 landed the detail page at 341 rather than at the top.

The rule is therefore the pathname: a different screen starts at the top, the same screen does not
move, whichever way the entry was written. That also keeps the media viewer working, since opening it
pushes `?media=` onto the screen the reader is already on.

A reset must also abandon any restore still in flight, and drop any restore queued for a container
that has not attached yet. Without the first, a push landing inside the restore window is zeroed and
then dragged back by the watch's next frame; without the second, a layout that mounts after the push
applies an offset belonging to a screen the reader has already left.

### A forwarding redirect is a third kind of navigation

Keying the reset on the pathname broke the ascent deep link: `/ascents/[id]` resolves an ascent to
its row in the route's list and forwards there with a replace, and the destination scrolls that row
into view. A pathname change, so the new rule zeroed it. Reproduced deterministically at 375x667:
`/ascents/68` landed at 0 where the same URL reached directly landed at 141.

Two fixes failed first, and each was wrong about ordering rather than about intent:

- Scrolling in a `requestAnimationFrame` so it lands after the reset. A probe showed the frame DID
  scroll to 141 and `afterNavigate` then reset it, so `afterNavigate` runs after the next frame.
- A boolean raised by the caller, the way `replacing` is. A resolver forwards from an `$effect`
  during its own mount, so the flag is raised before that mount's own navigation reaches
  `afterNavigate`, and the mount consumes it. The redirect arrived classified `push` and unexempted.

So the app has a third navigation intent that neither push nor replace describes: forwarding to the
canonical URL for what the reader asked for. `redirectTo` records the DESTINATION, matched in
`afterNavigate` and discarded after one further navigation. Counted rather than cleared when the
`goto` settles, because the `goto` settles BEFORE that `afterNavigate`, measured; a mocked `goto`
resolving in a microtask gives the opposite order, so no unit test would have caught that.

The exemption is only sound for a destination that positions itself. Forwarding within one layout to
a screen with no position of its own would leave the reader wearing the previous screen's offset.

### The navigation kind still comes from the trail, not a second derivation

The reset must fire on a push and not on a replace, or paging the media viewer (`pageMedia` ->
`replaceUrl`) would yank the reader to the top of the screen behind the viewer.

Kit's `AfterNavigate` does not expose the `noScroll` option, so the rule cannot read the flag those
call sites pass. It can read the classification `trackHistoryDepth` already computes from the
`replacing` flag, which is the signal `replaceUrl` raises for precisely this ambiguity
("SvelteKit exposes no replace signal"). `trackHistoryDepth` computes the `TrailEvent.type` once and
hands the same value to `trail.record` and to the scroll module.

Deriving it twice is the failure `AGENTS.md` describes as aiming a sound method one level off the
thing that runs: two derivations that agree today and drift later, with scroll and history
disagreeing about what a navigation was and no test able to see it.

Reset on `push` only. `enter` needs no reset because a fresh element is already at zero, and forcing
one there would fight the browser on a restored session. `popstate` is `snapshot`'s job. `replace`
is deliberately untouched.

### One helper, one short export per layout

A new module under `src/lib/state/` beside `navigation.svelte.ts` and `trail.svelte.ts`, exporting a
factory each layout uses to produce both its `snapshot` object and its element binding. The layouts
keep their own `<main>` markup, which already differs (`md:pl-20` on the shell, the loading gate
inside it, the sibling attribute on routes).

Alternative considered: hoist a single `<main>` into `(app)/+layout.svelte` so one scroll container
serves the whole app and one `snapshot` export covers everything. Attractive, and it would remove
the per-layout repetition, but it changes the DOM the sheets measure against and the shell's loading
gate sits inside its main. That is a layout refactor with visual risk on every screen, justified on
its own merits or not at all, not smuggled in behind a scroll fix.

### `goToSibling`'s reset loop is deleted, not kept alongside

`goToSibling` currently calls `push` and then zeroes every `[data-sibling-scroll]` element. Once a
push resets by default that loop is the rule applied twice. Removing it takes
`SCROLL_SURFACE_ATTRIBUTE` and `siblingScrollSurface` with it, and the spread comes off
`routes/+layout.svelte`, `Panel.desktop.svelte`, `Modal.desktop.svelte` and `Modal.mobile.svelte`.
`goToSibling` becomes a `push`, which is worth checking against its call sites: if nothing else
remains, the callers can use `push` directly and the helper goes too.

Note that those four surfaces include the explore sheets and panel, which are scroll containers that
are not a layout's `<main>`. They need the reset, so the reset must address marked containers
generally rather than only the layout mains.

### The explore sheet and panel reset, and do not restore

A bottom sheet has two positions, not one: its snap point and its content scroll offset. On a sheet
these are not independent, because the same upward drag grows the sheet first and scrolls its
content only once expanded. Here they are the same element:
`Modal.mobile.svelte` sets `snapPoints: [titleSnapPoint, 0.25, 0.5, 0.75]` on the element that is
also the scroll container ("The sheet element is the scroll container here: BottomSheet.Content
clips instead").

So restoring a scroll offset without restoring the snap it was taken at is incoherent. A sheet
reopening at `0.25` with a restored offset shows a few rows from the middle of a list with no cue
that anything sits above. Restoring half of a two-part position is worse than restoring none of it.

Restoring both is a larger piece of work than this change: the sheet would have to carry its snap
through the history entry alongside the offset, and reopening would have to reach that snap before
the offset means anything. Reset is the honest version of not doing that yet.

The cost is accepted with open eyes. Browsing a block, opening a route, and coming back is the most
common loop in the app, and resetting taxes it every trip. The explore layout also already restores
`mapViewState` and `restoredFocus` on back, so sheet restoration would be consistent with its
neighbours rather than exotic. Both are arguments for doing the whole job in a later change, not for
doing half of it in this one.

The desktop panel (`Panel.desktop.svelte`) has no snap point, so the objection does not apply and
restoring it would be correct and cheap. It resets anyway: splitting the behavior gives one logical
surface two mental models for a small win. If a later change restores sheet snap and scroll
together, the panel comes along with it.

### Restoring against content that has not synced yet

`restore` runs as soon as the route updates, but Zero rows arrive after that, so the container can
still be short and the browser clamps the assignment. This is the same class of trap as the form
seeding rule in `AGENTS.md`: "loaded" is not one event.

The position is re-applied until the container is tall enough to honour it or a bound is reached,
rather than assigned once. The bound matters: an entity whose content genuinely shrank must not
leave a listener running, and a restore that never becomes satisfiable must give up rather than
fight a reader who has started scrolling. Any reader-initiated scroll or a new navigation cancels
it.

## Risks / Trade-offs

- **Content arriving late defeats the restore, silently.** The assignment clamps to a short
  container and the reader lands near the top, which looks like the bug the change was meant to fix
  → the re-apply above, plus an e2e case that goes back to a list long enough that its height
  depends on synced rows, not just on chrome.
- **The re-apply fights the reader.** A reader who scrolls during the window would be yanked → any
  reader-initiated scroll cancels it, and this is a case to drive by hand, not only in a test.
- **A future layout adds a scroll container and silently misses the rule.** Nothing enforces the next one → the helper is the only supported way to own a scroll container, and
  `AGENTS.md` gains a line saying so. Weak, but the alternative is a lint rule for a shape that is
  hard to state syntactically.
- **The forward defect is invisible at desktop width.** A destination shorter than the viewport
  clamps to zero, so a 1280x800 pass proves nothing → 375x667 is the load-bearing width for every
  verification of this change, and both widths are still required.
- **Reset-on-push is wrong for some future same-screen push.** Today the only same-screen
  navigations are replaces. A push that mirrors state onto the same screen would reset the reader →
  such a navigation should be a replace, which is what `syncSearchParams` already does. Recorded so
  the next same-screen push is recognised as the design decision it is.

## Migration Plan

No schema change, no data migration. Nothing changes a URL, a remote function export, or
`manifest.id`, so no already-loaded tab breaks: an old tab keeps the current behavior until it
reloads, which is the defect it already has.

Rollback is reverting the commit. The removal of `siblingScrollSurface` is the only part that is not
purely additive, so if the change is reverted after that removal lands separately, sibling
navigation returns to the shared defect rather than to a broken state.
