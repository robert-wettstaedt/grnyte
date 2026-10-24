# Tasks

## 1. Guard

- [x] 1.1 Extract the "standing decision on this object" condition from `undoRemovalRow` into an exported helper in `moderation/undo.server.ts`, and add `refuseWhileRemoved(db, kind, id)` there, throwing 409 `moderation_restoreRefused` while one exists; verify the existing undo tests in `removal.server.test.ts` still pass
- [x] 1.2 Call it through `asPrivileged` after the `asCaller` body in `areas.restore`, `blocks.restore` and `routes.restore`; verify with one `it.each` in `moderation/removal.server.test.ts` over area (restored by the maintainer who created it), block and route (restored by a region admin) that each restore is refused, the row stays removed and the decision stays standing, seen red per row by dropping that mutator's call
- [x] 1.3 Verify with two server tests that Undo still brings a removed block back and that a route deleted as tidying up still restores

## 2. Copy

- [x] 2.1 Add `moderation_restoreRefused` to `messages/en.json` and `messages/de.json`, sorted, through the writing guidelines

## 3. Verification

- [x] 3.1 Over the touched paths: `prettier --write`, `eslint`, `vitest --project server` for the moderation and the three entities' mutator tests, `svelte-check`, `npm run lint:duplication` and `npm run lint:unused`; all green
- [x] 3.2 Drive the running app at 375x667 and 1280x800 with throwaway accounts: remove a sector for breaking the rules, check a tidy-up delete and its Undo on another block still work, and Undo the removal from the region's moderation log; no screen offers a path to the refusal, so it is pinned by the server tests

## Workflow follow-up

- Archive the change with `/opsx:archive restore-respects-removals` once implemented and reviewed.
