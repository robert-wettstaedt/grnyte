## Context

See proposal.md for motivation. What shapes the approach is where the exits already live.

Every mutation exit in the app already funnels through one of three places, and all three push a new
history entry:

| exit | where | reach |
| --- | --- | --- |
| `redirect(303, redirectTo)` server-side | `authedForm` in `$lib/remote/authed.server.ts` | 22 handlers |
| `await goto(result.redirectTo)` | `runCommand` in `$lib/remote/mutation.ts` | ~24 delete and undo sites |
| hand-rolled `goto` in `onSubmitted` | 4 page components | 4 |

SvelteKit applies the 303 through its internal `_goto` with no `replaceState`, which is why the
dominant path pushes. Kit is pinned at `^2.59.1`.

`MutationResult.redirectTo` is already the destination concept: declared once per handler,
server-side, where a newly created id exists. This design consumes it rather than adding a
client-side twin.

Three constraints bound the solution. The History API exposes `length` and the current entry's
`state` and nothing else, so the URL of the entry behind you is not readable and must be mirrored.
`page.state` is not restored on a reload by Kit's own design. And a deploy is not atomic on the
client, so any change to the server's half of the form contract strands already-loaded tabs.

## Goals / Non-Goals

**Goals:**

- One exit rule, in one place, that the four page-level exits and the two funnels all reach.
- Correct for the platform back gesture and button, not only the app's own control.
- Deployable in one release, with no window in which a saved form silently fails to navigate.

**Non-Goals:**

- No new Zero query and no new remote function. The two handler edits (`createRoute`,
  `createAscent`) are to existing `authedForm` writes in `entities/route/routes.remote.ts` and
  `entities/ascent/ascents.remote.ts`. Reads are untouched.
- **No schema change, so no migration and no backfill.**
- No change to `PageHeader`, which already renders the control and takes a handler.
- No restoration of scroll or of in-progress field state beyond what already happens.

## Decisions

### Repair the history stack, do not redefine the control

Rejected: making the app's back control mean "go up one level in the guidebook", which needs no
mirror and no exit changes. It would make the control disagree with the swipe gesture and the
hardware button on the same screen, and those read the stack and cannot be redirected. Since both
must agree, the stack itself is the only thing that can be fixed.

### Pop one entry or replace, never traverse several

The exit compares its destination against the entry behind it. If they match it pops one; otherwise
it replaces the current entry.

Rejected: scanning back for the nearest matching entry and traversing to it. The failure modes are
not symmetric. Popping one fails by leaving a duplicate entry, which costs one extra press and is
explicable at every step. Traversing fails by moving the reader several screens with no explanation,
and it fails worst exactly when the mirror has drifted from reality. Popping one also needs only the
previous entry's URL rather than the whole list plus a reliable index.

Blanket replacing is not an option either: replacing at a task screen whose destination is where the
reader came from produces two adjacent identical entries, so back appears dead once and then leaves
the app.

Entries are compared on path **and** query. A near-miss then falls through to replace, which is the
safe direction, and it stops an exit popping into a `?media=` viewer the reader already closed.

### Mirror only the previous entry, in memory

Rejected `page.state`: Kit does not apply it on the first page or after a reload, by documented
design. Rejected a custom top-level key in `history.state`: Kit's exported `replaceState` rebuilds
that object from four fixed keys with no spread, and this app calls it on its two busiest screens,
through `syncSearchParams` and the map layout's map-view write, so the key would be destroyed there.

Accepted cost: a reload mid-task loses the trail and the exit falls back to replace. If that ever
needs fixing, the upgrade is sessionStorage keyed by Kit's own per-entry history index, which is the
pattern Kit itself uses for scroll positions, not `page.state`.

### Extend the existing navigation module, do not add a parallel one

`$lib/state/navigation.svelte.ts` already owns `back`, `replaceUrl`, `syncSearchParams`,
`withSearchParams` and the media viewer's push and pop helpers, and it already registers a tracker
from the app layout. The mirror replaces its `depth` counter inside that module. Everything else
stays.

Two new pure functions carry the rules so they are testable without a browser, matching how
`withSearchParams` is already split out from `syncSearchParams` in that file: a reducer over the
navigation events, and a decision function from previous entry plus destination to pop or replace.

### `Form` owns the exit, and raw `goto` becomes a lint error

`$lib/forms/Form.svelte` already owns the header and the cancel handler, so it should own the
completion exit too. It gains a cancel destination prop replacing `onCancel`, and performs the exit
itself. `onSubmitted` keeps its documented job of acting on the result and stops navigating.

Enforcement is a lint rule rather than a convention because the convention already failed here:
`replaceUrl`'s doc comment says to use it instead of a raw `goto`, and four sites did not. The rule
bans importing `goto` outside the navigation module, which requires the module to re-export a
pass-through for the forward pushes that are legitimate, in `$lib/map/Map.svelte`, the explore
search bar and create-on-map. The pass-through adds no behaviour; it makes the three-way choice of
push, replace or exit explicit where it is made.

### No client-side destination prop

An earlier draft gave `Form` a destination callback, on the premise that a create's destination is
only known from the result. It is not: it is computed server-side where the id exists. So the cancel
destination is a plain string, the completion destination stays in the handler's envelope, and
`onSubmitted` is left for side effects.

`createRoute` and `createAscent` currently withhold `redirectTo` so their pages can finalize media
uploads and, for routes, wait for the row to sync before navigating. `Form` now awaits `onSubmitted`
before exiting, which is that ordering, so both handlers declare `redirectTo` and both pages drop
their `goto`. This mirrors `runCommand`'s existing `beforeRedirect` hook, which exists for the same
reason on the command side.

Region creation stays as it is. Its handler deliberately omits `redirectTo` because the Zero client
is session scoped, and the page performs a full document load, which history mechanics do not apply
to. The lint rule bans `goto`, not `location.href`.

### Intercept the redirect client-side rather than removing it first

The 303 cannot be corrected from our own code path, because Kit fires the navigation inside the
submit before the enhance callback resumes. Three options were weighed.

Removing the 303 in the same release makes the fix depend on a server change, and any tab still
running the old client would save and then not navigate. Adding a version marker to the request so
the server redirects only for old clients works, but it is a wire-format negotiation nobody ever
deletes and every form schema would have to tolerate an extra field.

Chosen: `Form` raises a flag around its submit, and a `beforeNavigate` handler cancels the
redirect-driven navigation raised while that flag is set, stashes the target, and lets the submit
continue. The exit then runs after `onSubmitted`. This uses only public API, needs no server change
at all, and therefore has no deploy skew. `Form` also navigates on an envelope `redirectTo` when no
redirect arrives, which is what makes the later removal a server-only change.

Verified in Kit's source rather than assumed: the internal `_goto` routes through `navigate()`,
which dispatches `beforeNavigate` and returns early when a callback cancels, and the guard that
suppresses the event during redirects does not apply because it keys on an in-flight navigation and
a form submit is not one. If a Kit upgrade changes that, the interception stops matching and
behaviour degrades to today's push rather than breaking.

### Wizard steps keep their divergence, guarded

`Form` advances its steps with local state, so its control steps backwards while the platform
gesture abandons the form. Making steps real history entries would require popping several entries
on submit, which is the traversal this design rejects, and the count is wrong after a reload.

One two-step form exists, the parking editor. It gets an unsaved-changes guard modelled on the topo
editor's `beforeNavigate` guard, whose comment already states the property that matters, that it
covers every way out and not only the app's own control. This introduces user-facing copy, so a key
pair in both locales.

### Navigation API: a comment, not a dependency

It is exactly this feature and would delete the mirror. It reached all engines only at Safari 26.2
and Firefox 147, far above the pinned `build.target` floor. A polyfill cannot close the gap because
the History API cannot read another entry's URL, so a polyfilled entry list is the same mirror with
the same reload hole. A trip-wire comment beside the pin records the versions.

## Risks / Trade-offs

- **The interception cancels a navigation Kit started, so the invalidation Kit requested is lost**
  (Kit sets it in a callback that never runs once cancelled) → the re-issued navigation carries it,
  and a pop calls the invalidation itself.
- **Cancelling rejects an internal promise Kit exposes as the navigation's completion** → check the
  browser console for an unhandled rejection while driving the flow; attach a handler if one appears.
- **The flag window could catch an unrelated navigation** if a reader taps a link mid-submit → the
  handler matches on the navigation being a programmatic one originating from the form's own screen,
  not on the flag alone.
- **The interception is code written to be deleted** → roughly fifteen lines, with a comment naming
  the release at which it goes.
- **It depends on Kit internals holding** → it uses public API only, and the degradation if Kit
  changes is today's behaviour, not a break.
- **Renaming a prop across 18 form screens conflicts loudly with other work in flight** → several
  sessions share this checkout, so stage named paths and re-base before starting.
- **A reload mid-task still degrades** (accepted above) → bounded by the spec to one extra back
  press, never to leaving the completed task reachable.

## Migration Plan

Three releases. The first is complete on its own, which is what removes the deadline from the rest.

1. **The fix.** Navigation module, `runCommand`, `Form` handling both shapes, the call sites, the
   sheets, the guard, the lint rule. No server change, so a tab running the old client behaves
   exactly as it does today. Rollback is a revert.
2. **Server cleanup, at a chosen moment, no deadline.** Remove the 303 from `authedForm`. No client
   counterpart. Exposure is limited to tabs that have not reloaded since before release 1, and the
   service worker has been cycling stale tabs throughout. Rollback is a revert; the client keeps
   working either way, which is the point of handling both shapes.
3. **Optional cleanup.** Delete the interception.

## Open Questions

- Does the sign-in redirect push? It goes through a server redirect on a path this change does not
  touch, so if it pushes, back after signing in lands on a login form while signed in. One back press
  after a sign-in settles it. The answer does not change this design, the specs or the task
  breakdown; it either adds a follow-up or a note that it already replaces.
