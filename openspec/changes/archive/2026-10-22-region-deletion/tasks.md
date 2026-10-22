# Tasks

## 1. Owner rule and guard

- [x] 1.1 Delete `isLastAdmin` from `region/permissions.ts` and its tests. The owner check is a plain `ownerFk === userId` at each call site, read from `RegionDetail.ownerFk` (mapper test seen red), so no helper.
- [x] 1.2 Replace `assertNotLastAdmin` / `activeAdminUserFks` with `assertNotOwner` in `guards.server.ts`, called from `assertMemberChangeAllowed` (demote, remove) and `leaveRegionRow`. Swap `region_lastAdmin` for `region_ownerMustHandOver`, and the page's `isSoleAdmin` for `isOwner`. Delete the last-admin tests. Add cases in `guards.server.test.ts` and `mutators.server.test.ts`: an admin demotes the owner, an admin removes the owner, the owner leaves, an admin removes a non-owner admin. Each is seen red.
- [x] 1.3 Change `accountDeletionEffect(members, userFk, ownerFk)`, make `classifyRegions` / `previewAccountDeletion` select `created_by`, and update `user/delete.server.test.ts` to cover: an owner with a second admin blocks, and a non-owner admin keeps (seen red)

## 2. Operator procedure

- [x] 2.1 Write the operator procedure for deleting a region with no owner (design §9) as a local, uncommitted runbook, and verify it against a throwaway region in the dev DB.

## 3. Handover

- [x] 3.1 Extract `assertBelowOwnedCap(tx, userFk)` from `createRegionIn`, which takes the lock and the count, and keep `create.server.test.ts` green
- [x] 3.2 Add `transferRegionOwnership` (body in `ownership.server.ts`, thin `transferRegionOwnershipCommand` in `regions.remote.ts`, design §3, no feed event) with a test in `ownership.server.test.ts` for each case: success, wrong password, non-owner caller, recipient not an admin, recipient at the cap. Each is seen red.
- [x] 3.3 Render `role_changed` with `metadata: 'owner'` as "now the owner" through `roleLabelFor`, which both `caption.ts` and `directed.server.ts` read. Cover it in `caption.test.ts` and in a `NotificationRow` story.
- [x] 3.4 Add a "Make owner" action and its password prompt to `MemberRow.svelte`, and hide demote and remove on the owner's row. Verify it by driving the screen as the owner and as another admin.

## 4. Deletion

- [x] 4.1 Add `regionDeletionPreview` (a remote query, owner-gated) with a test for its two counts, where the owner's own ascents are not counted (seen red)
- [x] 4.2 Add `deleteRegionCommand` (design §3) with tests for: wrong name, wrong password, non-owner, success removing every row and calling `removeFileStorage`, and recipients collected before the delete. Each is seen red.
- [x] 4.3 Add `regionDeletedEmailContent` to `$lib/email/membership.ts`, send it after commit with logged failures, and test it in the `deleteRegionCommand` suite with the sender mocked: one mail per other member, none to the owner, and a failed send still deletes
- [x] 4.4 Build `src/routes/(app)/regions/[regionId]/delete/+page.svelte`, mirroring `settings/account/delete`, with a `page.svelte.test.ts` covering: the preview shown, submit held until the preview answers, the name error, the password error and the non-owner refusal
- [x] 4.5 On the region page, relabel "Created by" to "Owner", add `ownerFk` to the detail DTO and mapper (`mapper.test.ts`), and add the owner-only "Delete region" row

## 5. Copy

- [x] 5.1 Add the i18n keys to BOTH `messages/en.json` and `messages/de.json`, sorted: `regions_owner`, the make-owner action and prompt, the delete row, the delete screen, `region_ownerMustHandOver` (replacing `region_lastAdmin`), the owner-at-cap refusal, the mail subject and body, and the reworded `settings_deleteAccountBlocked`. Review them with `/writing-guidelines` and `/simple-english`.
- [x] 5.2 Update the FAQ ("How do I delete my account or my region?"), terms clause 3 and the roles in clause 15 (the owner, region deletion removing other members' ascents), the privacy page (the deletion mail) and "last updated", in en and de

## 6. Verification

- [x] 6.1 Over the touched paths, run `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser`, the typecheck, `npm run lint:duplication` and `npm run lint:unused`
- [x] 6.2 Drive the app at 375x667 and 1280x800, in both themes and in en and de: a handover, a refused demotion of the owner, deleting a throwaway region with a second throwaway member (check the mail in the Resend dashboard or the dev inbox), and the second member's open tab landing on not-found

## Workflow follow-up

- Release: follow the Migration Plan in design.md (the prod ownership query, zero-cache, the app, then `delete-region.ts` for the orphan, dry run first).
- `/review-loop`, then `/opsx:archive region-deletion`.
- Then start `notify-moderation-removals`.
