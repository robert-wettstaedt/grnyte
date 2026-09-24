# Tasks

No i18n task: no user-facing copy changes.

No spec task: `.openspec.yaml` sets `skip_specs: true`, because
`navigation/back-navigation` already requires the behaviour this restores.

## 1. See the defect fail first

- [x] 1.1 Add the regression test to `e2e/back-navigation.spec.ts`: reach an ascent deep link cold
      (`/ascents/<id>`, which forwards to the route's ascent list), press the header Back, assert the
      route screen. Run it against the CURRENT code and watch it fail. Expect the URL not to change
      at all; if it fails by landing somewhere wrong instead, the fixture reached the list by a push
      rather than through the resolver, and the test is measuring something else.
- [x] 1.2 Record what the trail believed, so the fix can be shown to change it: assert
      `history.length` alongside the URL, since landing on the route is also what a correct push
      would produce and only the entry count tells the two apart.

## 2. One record, not a boolean

- [x] 2.1 Replace the `replacing` boolean in `src/lib/state/navigation.svelte.ts` with a record of the
      destination pathname, set in `replaceUrl` and matched in `trackHistoryDepth`, discarded after
      one further navigation. Share the record-and-discard bookkeeping with `forwardingTo` but keep
      the two records separate, per `design.md`. Verify the e2e from 1.1 now passes.
- [x] 2.2 Delete the `.finally()` clear in `replaceUrl`. It is the second way to lose the flag and
      cannot be kept: the `goto` settles before the redirect's `afterNavigate`. Verify by re-running
      the e2e plus `e2e/back-navigation.spec.ts` whole.
- [x] 2.3 Say in the module comment that this function is guarded only by e2e, and why a unit test
      cannot cover it (a mocked `goto` resolves in a microtask, giving the opposite order to the
      real router). Keep it to one or two lines, per `AGENTS.md`.

## 3. Re-drive what the depth change touches

- [x] 3.1 The fix removes one entry from the trail's model, and `exit()` reads that depth to choose
      pop versus replace. Re-drive the `fix-back-navigation` flows that depend on it: save a form,
      cancel a form, and delete with undo, confirming each still lands where it did and that back
      from there does not reopen the finished screen.
- [x] 3.2 Drive an error state reached cold and confirm it still offers a way up. `canGoBack()` gates
      whether `ErrorState.svelte` RENDERS its Back button, so a corrected depth can remove it; the
      way up should then come from the primary action rather than the Back button.
- [x] 3.3 Confirm the scroll rule is unaffected: a navigation correctly becoming `replace` must still
      reset when the pathname changes. Drive a form exit (`/routes/<id>/edit` scrolled, then Cancel)
      and check the destination lands at the top.

## 4. Handing back

- [x] 4.1 Run the verification sweep over the touched paths and nothing else: `npx prettier --write`,
      `npx eslint`, `npx vitest run --project browser` for the state tests, then the typecheck
      (`./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` beside a live dev server).
- [x] 4.2 Run `npm run lint:duplication` and `npm run lint:unused`.
- [x] 4.3 Run `npm run test:e2e back-navigation` whole, since this change alters the classification
      every test in that file depends on. It cannot run in the agent sandbox, so it needs the user.
- [x] 4.4 Ask grnyte-c6 to review, since this is their change's code and they asked to see whatever
      lands. Report the browser free.

## What changed from the plan

- **1.1 / 1.2 are a unit test, not an e2e.** The e2e was written first and PASSED against the
  defective code, twice, because the real ordering is a RACE that usually resolves the safe way. A
  probe on the classification confirmed it: Chrome, Firefox and Playwright all recorded `replace` on
  demand. `design.md` said a unit test could not guard this, on the grounds that a mocked `goto`
  resolving in a microtask gives the opposite order to the real router. That was exactly backwards.
  The microtask order IS the adverse order, so awaiting the settlement before firing `afterNavigate`
  reproduces the race deterministically. That test fails on the old code and on a restored
  settle-time clear, and nothing else does.
- **The e2e is kept anyway**, as a guard for the requirement rather than for this race. It cannot
  fail on this defect.
- **An existing test was wrong, not just incomplete.** It called `replaceUrl('/profile')` and then
  simulated arriving at `/feed`. The boolean did not care; a destination record does. The fixture now
  matches, which is what it always should have said.
- **Save was not driven, cancel was.** Both reach `trail.exit` through the same call, so cancel
  exercises the branch. Driving save would mutate seed data on a shared dev stack for no extra
  coverage. Delete-with-undo was not driven either, for the same reason and because it needs a row it
  can destroy.
- **Driven results.** Cancel from a scrolled `/routes/5413/edit`: lands `/routes/5413`, history
  length unchanged at 4 (so it replaced rather than pushed), container at 0 (the scroll rule is
  unaffected), and back from there reaches the entry before rather than reopening the form. A cold
  error state at `/routes/99999999` renders only its primary action, with no Back button, because
  `canGoBack()` is correctly false.
- **Chrome, not Firefox.** The Firefox tab wedged part-way through, reporting successful navigations
  while staying put. Nothing to do with this change.
- **Review found one more of the same shape.** `claims()` ran before the type check, so an `enter` or
  `popstate` arriving at the expected pathname consumed the record and the replace that followed was
  counted as a push. Narrower than the original, because it needs a matching pathname, but the
  resolver case is exactly a same-pathname family. Only a `goto` may consume a record now. The test
  for it goes red without the gate.
