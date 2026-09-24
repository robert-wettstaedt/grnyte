# Proposal

## Why

The back control does nothing on a screen reached through a resolver. Driven at 375x667, signed in,
in a fresh tab: `/ascents/68` forwards to `/routes/108/ascents?ascent=68`, `history.length` is 1, and
clicking the header's Back button leaves both the URL and the length unchanged. It is a dead control,
on exactly the arrival a push notification produces.

`navigation/back-navigation` already forbids this. "A screen with no trail behind it offers a way up"
says the back control SHALL take the reader to that screen's parent "rather than doing nothing". So
this is a conformance fix, not a behaviour change, and the code is what is wrong.

The cause is that `replacing` is a boolean claimed by whichever navigation reaches `afterNavigate`
first. `src/routes/(app)/ascents/[id]/+page.svelte` forwards from an `$effect` during its own mount,
so the flag goes up before that mount's own navigation settles and the MOUNT spends it. Measured with
a timestamped probe:

```text
onNavigation kind=enter at /ascents/68
onNavigation kind=push  at /routes/108/ascents?ascent=68   <- a replaceState
```

The trail therefore records a pushed entry for a navigation the browser replaced, and its depth
over-counts by one. `canGoBack()` returns true, `trail.back()` takes the `history.back()` branch, the
browser has nothing to go back to, and the `navigator.replace(up)` fallback that would have reached
`/routes/108` is never called.

## What Changes

- **A navigation the app replaced is recorded as a replace, whichever navigation settles first.**
  `replacing` becomes a record of the destination rather than a boolean, matched in `afterNavigate`
  and discarded after one further navigation, which is the shape `forwardingTo` already uses in the
  same function.
- **The two mechanisms collapse into one.** `forwardingTo` and `replacing` currently sit side by side
  doing the same job with different reliability. After this they are one.
- **The `.finally()` clear goes.** It is the second way to lose the same flag and is unfixable in
  place: the `goto` settles BEFORE the redirect's own `afterNavigate`, measured, so clearing there
  can spend the record early on its own. It exists because a cancelled or throwing navigation used to
  leave the latch stuck, which the discard-after-one-navigation rule handles instead.
- **A regression test in `e2e/back-navigation.spec.ts`**: open an ascent deep link cold, press Back,
  land on the route.

## Non-goals

- **Changing where back goes.** The destination is already specified and already computed correctly
  by `trail`; only the event feeding it is wrong.
- **Unit-testing the classification.** `trackHistoryDepth` is deliberately uncovered, because
  everything it does is ordering against the real router, and a mocked `goto` resolving in a
  microtask produces the opposite order to the real one. A unit test here would pass on a fix that
  fails in a browser. The guard belongs in e2e.
- **The rest of `fix-back-navigation`.** That change is parked on two later-release tasks and is not
  reopened here.
- **Auditing every other resolver.** `/ascents/[id]` is the only mount-time redirect today. The fix
  is general, but this change does not go looking for more.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `navigation/back-navigation` already requires the behaviour this restores, in "A screen with no
trail behind it offers a way up", and its scenario "Opening a shared route link" already covers the
shape. Nothing about what the system must do changes, so `.openspec.yaml` sets `skip_specs: true`.

## Impact

**Modules.** `src/lib/state/navigation.svelte.ts` only: the `replacing` flag, `replaceUrl`, and the
classification inside `trackHistoryDepth`. `trail.svelte.ts` is untouched, since its rules are right
and only the event it receives is wrong.

**Callers.** None change. `replaceUrl`, `redirectTo`, `exit`, `pageMedia` and `syncSearchParams` keep
their signatures.

**Behaviour beyond the deep link.** `canGoBack()` has one other consumer,
`ErrorState.svelte:77`, where it decides whether a Back button RENDERS at all. A wrongly-true
`canGoBack` puts a dead Back button on an error state reached after any mount-time redirect. That is
reasoned from the call site, not driven.

**Scroll.** `restore-scroll-on-navigation` reads the same classification, so a navigation correctly
becoming `replace` must still reset when the pathname changes. It does: that rule keys on the
pathname, not on push versus replace.

**Entity modules and tables.** None. No Zero query, no remote function, no schema change, no backfill.

**i18n.** None.

**Client-breaking: no.** No URL, no remote function export, no `manifest.id`. An already-loaded tab
keeps the dead button until it reloads, which is the defect it already has.
