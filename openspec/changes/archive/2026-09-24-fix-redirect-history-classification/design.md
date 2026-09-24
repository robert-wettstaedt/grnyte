# Design

## Context

See `proposal.md` for the symptom and the measurement. The constraints that shape the fix:

- `trail.svelte.ts` is pure over an injected navigator and has real unit tests. Its rules are
  correct. Only the `TrailEvent` it is handed is wrong.
- `trackHistoryDepth` in `navigation.svelte.ts` is the labelling half and is deliberately uncovered,
  because everything it does is ordering against the real router.
- `forwardingTo` already lives in that function, added by `restore-scroll-on-navigation`, and is the
  destination-record shape this fix generalises. Two mechanisms for one job is the thing to remove.
- Two orderings are established by measurement, not by reading SvelteKit:
  - A resolver forwarding from an `$effect` raises its flag before that mount's own `afterNavigate`.
  - A `goto` settles BEFORE the `afterNavigate` of the navigation it started.

No reads change: no Zero query. No writes change: no remote function. No schema change, so no
backfill.

## Goals / Non-Goals

**Goals:**

- A navigation the app replaced is labelled `replace`, whatever else is in flight.
- One mechanism in `trackHistoryDepth`, not two.
- A guard that would fail against the current code.

**Non-Goals:**

- Beyond the proposal's: no change to `trail`'s rules, and no new navigation intent. `redirectTo`
  stays as it is.

## Decisions

### A destination record, not a boolean

A boolean answers "was the last navigation a replace", which nobody can ask safely, because
"last" is ambiguous while two navigations overlap. A destination answers "was THIS navigation a
replace", which is the actual question `afterNavigate` has.

`replaceUrl` records the pathname it is navigating to. `trackHistoryDepth` treats the arrival as a
replace when it matches, and clears the record then. Alternatives rejected:

- Keep the boolean and clear it more carefully. There is no "more carefully" available: the mount
  and the `goto` settlement both legitimately reach the flag before the redirect does, and neither
  can be told apart from the real consumer without identity.
- A counter of in-flight replaces. Survives the mount but still cannot say WHICH arrival was the
  replace, so a push landing while a replace is in flight would be mislabelled.

### Discarded after one further navigation, not when the `goto` settles

A record that never matches must not go stale forever, or some later arrival at that pathname is
silently mislabelled. The obvious bound, clearing in `replaceUrl`'s `.finally()`, is wrong here and
is the existing bug: measured, the `goto` settles before the redirect's `afterNavigate`, so that
clear can spend the record just before it is read.

So the record is discarded after one further navigation instead. One, because the resolver's own
mount is the navigation it has to survive. The residual is that within that single-navigation window
an arrival at the recorded pathname is read as a replace; any scheme without an ordering dependency
has a residual of that shape, and this one fails towards "recorded as a replace", which under-counts
rather than over-counts the trail.

### Reuse `forwardingTo`'s shape, and keep the two records separate

They answer different questions. `replacing` decides `push` versus `replace` for the trail;
`forwardingTo` decides whether the scroll rule treats the arrival as a screen change. A redirect is
both, an ordinary `replaceUrl` is only the first. Merging them would make `exit` exempt from the
scroll reset, which is the defect `restore-scroll-on-navigation` just fixed.

They should share the bookkeeping, not the meaning: same record-and-discard helper, two records.

### The guard is an e2e, and it has to be seen red

`e2e/back-navigation.spec.ts` already owns this area and has the fixture and sign-in shape. The test
opens an ascent deep link cold, presses the header Back, and asserts the route screen.

It must be seen failing against the current code first. The failure mode to expect is the URL not
changing at all, which is the driven symptom, rather than landing somewhere wrong. A test that passes
before the fix is measuring the wrong thing, most likely because the fixture reached the list by a
push rather than through the resolver.

## Risks / Trade-offs

- **The one-navigation residual above.** Accepted, and the direction it fails is the safer one.
- **`trail`'s depth changes for existing flows.** The fix makes one navigation stop counting, which
  is the point, but `canGoBack()` and `exit()`'s pop-versus-replace choice both read that depth. Any
  flow that reaches a screen through a resolver now has one fewer entry behind it → re-drive the
  form-exit and delete-undo paths from `fix-back-navigation`, not only the deep link.
- **`ErrorState`'s Back button may disappear where it used to show.** That is the correct behaviour
  when there is genuinely nothing behind, but it is a visible change → check an error state reached
  cold still offers its way up, which it should, via `back(primaryHref)`'s replace branch.
- **Uncovered by unit tests by construction.** Nothing here can be guarded below e2e, so a future
  refactor of this function has only the e2e to catch it → say so in the module comment, so the next
  reader does not add a unit test that passes for the wrong reason.
