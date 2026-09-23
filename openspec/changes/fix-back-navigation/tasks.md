## 1. Navigation module

- [x] 1.1 Add the pure reducer over navigation events to `$lib/state/navigation.svelte.ts`, replacing
      the `depth` counter with a record of the entry behind the current one. Verify with unit tests
      in `navigation.svelte.test.ts` covering enter, push, replace and a popstate delta, run with
      `npx vitest run --project browser src/lib/state/navigation.svelte.test.ts`.
- [x] 1.2 Add the pure pop-or-replace decision function, comparing path and query. Verify with unit
      tests covering: previous entry equals destination, differs by path, differs only by query, and
      no previous entry. Each test must be seen red first by inverting the comparison, then reverted.
- [x] 1.3 Add `exit(destination)` applying that decision, and a `push(href)` pass-through for
      legitimate forward navigation. Keep `back`, `replaceUrl`, `syncSearchParams`,
      `withSearchParams` and the media helpers. Rename `back`'s parameter so it reads as the
      no-trail destination rather than a general fallback. Verify by typecheck and by the existing
      `withSearchParams` tests still passing.
- [x] 1.4 Run `npm run test:mutation -- --mutate src/lib/state/navigation.svelte.ts` and read every
      survivor. Verify by resolving each as either a real gap closed with a test or an equivalent
      mutant, and note which.
- [x] 1.5 Add the Navigation API trip-wire comment beside the `build.target` pin in
      `vite.config.ts`, naming Safari 26.2 and Firefox 147. Verify by reading it back in context.

## 2. Funnel the existing exits

- [x] 2.1 Change `runCommand` in `$lib/remote/mutation.ts` from `goto` to `exit`, and make a pop
      carry the invalidation Kit would have done. Verify in the running app: delete something, then
      press back, and confirm the deleted thing's screen is not behind you.
- [x] 2.2 Change the two explore sheets to close through `exit` instead of `goto`, in the map layout
      and the topo viewer page. Verify in the running app: open a block sheet from the map, close it,
      press back, and confirm it does not reopen.

## 3. Form owns the exit

- [x] 3.1 Replace `onCancel` with a `cancelTo: string` prop on `$lib/forms/Form.svelte`, checking
      each existing handler for cancel-time side effects before dropping it. Verify by typecheck
      listing every unconverted call site.
- [x] 3.2 Add the submit-window flag and the `beforeNavigate` handler that cancels the
      redirect-driven navigation, stashing the target. Gate it on the navigation being programmatic
      and originating from the form's own screen. Verify in the running app: save an ascent and
      confirm the route screen still appears.
- [x] 3.3 Perform the exit after `onSubmitted` resolves, using the stashed target, or
      `form.result.redirectTo` when no redirect arrived. Verify both shapes: the first in the app
      today, the second by temporarily returning the envelope without redirecting from one handler,
      then reverting.
- [x] 3.4 Carry the invalidation Kit requested onto the re-issued navigation, and invoke it directly
      on a pop. Verify in the running app that a saved edit is reflected on the destination screen
      without a manual reload.
- [x] 3.5 Convert the 18 form screens from `onCancel` to `cancelTo`. Verify with a clean typecheck
      and by cancelling out of three of them in the running app.

## 4. Handlers and the hand-rolled pages

- [x] 4.1 Declare `redirectTo` on `createRoute` in `entities/route/routes.remote.ts` and on
      `createAscent` in `entities/ascent/ascents.remote.ts`, rewriting the two comments that explain
      the old reason for withholding it. Verify with
      `npx vitest run --project server` over the touched remote tests.
- [x] 4.2 Drop the hand-rolled `goto` from the four pages that navigate themselves, leaving their
      upload finalize and row-sync wait in `onSubmitted`. Verify in the running app that adding a
      route still lands on the new route without a "not found" flash, and that its photos appear.
- [x] 4.3 Declare `redirectTo` on `updatePassword`, `updateUsername` and `submitFeedback`, then drop
      the `goBack()` call from the `onSubmitted` of those three plus `regions/[regionId]/name` and
      `regions/[regionId]/map-layers`, whose handlers already declare one and so navigate twice
      today. Keep every toast. `settings/email` is deliberately excluded: it has no `onSubmitted`,
      stays on the form to render `updateEmail.result?.email`, and giving it a destination would
      change behaviour this change is not about. Verify each of the five still lands on its
      destination in the running app, and that the feedback and password ones (plain `form`, so no
      303) exercise the envelope path rather than the interception.

## 5. Unsaved work guard

- [x] 5.1 Add a `beforeNavigate` dirty guard to the parking editor, modelled on the topo editor's, so
      it covers the platform gesture as well as the app's control. Verify in the running app: enter
      data on step 2, trigger the browser back, and confirm the confirm appears.
- [x] 5.2 Add the confirm copy as a key pair in both `messages/en.json` and `messages/de.json`,
      sorted, with one domain prefix, and no em-dashes. Verify by switching the app to German and
      triggering the guard.

## 6. Enforcement

- [x] 6.1 Add the eslint rule banning `goto` imports outside `$lib/state/navigation.svelte.ts`, and
      convert the legitimate forward pushes in `$lib/map/Map.svelte`, the explore search bar and
      create-on-map to the pass-through. Verify with `npx eslint` over the touched paths, and by
      confirming the rule fires on a deliberately reintroduced `goto` before reverting it.

## 7. Verification

- [x] 7.1 Add an e2e covering the original report: open a route, log an ascent, save, press back, and
      land on the screen the reader started from rather than the Log ascent form. Verify it has been
      seen red by reverting task 3.3 first, running it, then restoring.
- [x] 7.2 Verify the sign-in redirect by hand: sign in, press back once, and record whether a login
      form appears. If it does, raise a follow-up rather than widening this change.
- [x] 7.3 Drive the full set of exits with the browser console open and confirm no unhandled
      rejection appears from the cancelled navigation. Attach a handler if one does.
- [x] 7.4 Drive the changed screens at 375x667 and 1280x800, in both locales, confirming the back
      control's label and the guard's confirm read correctly at both sizes.
- [x] 7.5 Run the AGENTS.md sweep over the touched paths only: `npx prettier --write`, `npx eslint`,
      `npx vitest run --project server` for the `.server.test.ts` and `.remote.test.ts` files and
      `--project browser` for the rest, then `./node_modules/.bin/svelte-check --tsconfig
      ./tsconfig.json` beside the running dev server.
- [x] 7.6 Run `npm run lint:duplication` and `npm run lint:unused`, resolving any clone marked
      `[NEW]` or accepting it deliberately with `npm run lint:duplication:accept` and saying why.

## 8. Separate later release: remove the server redirect

Sections 1 to 7 are the first deploy and land together. This section and the next are separate
releases and must not be bundled with them.

- [ ] 8.1 Remove `redirect(303, ...)` from `authedForm` in `$lib/remote/authed.server.ts`. Ship only
      once release 1 has been live long enough for stale tabs to have cycled. Verify by saving every
      form shape in the running app and confirming each still navigates, now through the envelope.

## 9. Later release: delete the interception

- [ ] 9.1 Delete the `beforeNavigate` interception and its flag from `Form.svelte`, leaving the
      envelope path. Verify the e2e from 7.1 still passes.
