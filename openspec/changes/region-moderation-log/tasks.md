# Tasks

## 1. Read

- [x] 1.1 Give `readDecisions()` in `moderation/admin.server.ts` an optional `regionFk` filter and add `objectId` to `DecisionRow`; verify with a server test that a region's read returns its decisions only, those of every admin, with the actor named (seen red)
- [x] 1.2 Add `listRegionDecisions({ regionFk })` to `moderation/moderation.remote.ts`, gated on `canModerate` (403 otherwise), and list it in `gates.test.ts`; verify with a remote test that an admin of the region gets its rows and a maintainer and an admin of another region get 403 (seen red)

## 2. Undo

- [x] 2.1 Add `userPermissions` to `ServerMutatorContext`, filled where the mutate endpoint builds the context; verify with the existing mutate tests and typecheck
- [x] 2.2 Widen `undoRemovalRow` in `moderation/undo.server.ts` to any admin of the decision's region or an app admin, keeping the record of who reversed it; verify with server tests that a co-admin's undo and an app admin's undo outside the region restore the content and record them, and that a maintainer and an admin of another region are refused (seen red)
- [x] 2.3 Delete `reverseDecisionCommand` (`moderation.remote.ts`), `reverseById` (`admin.server.ts`) and their `gates.test.ts` entry, moving the `reverseById` tests in `removal.server.test.ts` onto `moderation.undoRemoval`; verify the moved tests pass and `lint:unused` is clean

## 3. Screens

- [x] 3.1 Extract the rows, disclosure and dialog of `settings/moderation/+page.svelte` into `moderation/DecisionList.svelte` (rows, show-region flag, `onundo`), labelled Undo, with the app-admin page undoing through `undoRemoval(kind, objectId)` and refreshing `listDecisions`; verify with a page test that its Undo calls the write for the row's object (seen red) and by driving it
- [x] 3.2 Add `routes/(app)/regions/[regionId]/moderation/+page.svelte` on `RegionScreen` and `RegionAdminRequired`, listing `listRegionDecisions` through `DecisionList` without the region, with Undo calling the entity's `undoRemoval(kind, id)` and refreshing the list; verify with a page test that Undo calls the write for the row's object (seen red)
- [x] 3.3 Add the admin-only "Moderation" row to `routes/(app)/regions/[regionId]/+page.svelte`, shown when `canModerate` holds; verify it shows for a region admin and not for a maintainer by driving the region screen

## 4. Copy and legal

- [x] 4.1 Add the new `moderation_*` keys (row label and hint, page title and empty state, Undo dialog title) to `messages/en.json` and `messages/de.json` and remove the `moderation_reverse*` keys the Undo label replaces, sorted, through the writing guidelines; verify both locales render on both screens
- [x] 4.2 Update privacy section 5 (`privacy.en.html`, `privacy.de.html`) so a region's admins see its removal record, including which admin acted, and terms clause 15 (`terms.en.html`, `terms.de.html`) so a region admin sees it and can undo a removal; verify with the legal reviewer's pass over both

## 5. Verification

- [x] 5.1 Over the touched paths: `prettier --write`, `eslint`, `vitest --project server` and `--project browser` for the matching tests, `svelte-check`, `npm run lint:duplication` and `npm run lint:unused`; all green
- [x] 5.2 Drive the running app at 375x667 and 1280x800, both themes, en and de, with throwaway accounts: a region admin sees a co-admin's decision with their name and undoes it after the dialog, the content comes back and the row reads reversed; a maintainer sees no row and the screen refuses; the app-admin screen undoes a decision in a region its admin is not in

## Workflow follow-up

- Archive the change with `/opsx:archive region-moderation-log` once implemented and reviewed.
