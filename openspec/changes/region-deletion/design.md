# Design

## Context

See proposal.md for the motivation. The current state that shapes this design:

- `deleteRegionRows(tx, regionFk)` (`entities/region/delete.server.ts`) already deletes a region in a safe order, leaves first. It returns the storage targets of the region's files. Account deletion calls it for sole-member regions, and then runs `removeFileStorage` after the commit.
- `regions.created_by` is already read as ownership. `createRegionIn` counts it under `LOCK.regionOwner` against `MAX_OWNED_REGIONS` (3), and `listOwnedRegions` lists it. No RLS policy reads it. The region page shows it as "Created by".
- Member changes are Zero mutators (`regions.updateMemberRole`, `regions.removeMember`, `regions.leave`). Their bodies live in `members.server.ts` and are gated by `assertMemberChangeAllowed` and `assertNotLastAdmin` in `guards.server.ts`. Today the guards refuse two things: changing your own role, and losing the last admin.
- Account deletion checks the password with `verifyPassword` (`entities/user/password.server.ts`), outside any transaction. It classifies regions with `accountDeletionEffect` (`region/permissions.ts`), whose answer is `blocks`, `deletes` or `keeps`.
- `role_changed` notices carry the new role in `metadata`. Both `caption.ts` and `directed.server.ts` resolve the label through `roleLabelFor`, which returns `undefined` for anything that is not an assignable role. In that case the copy falls back to a plain sentence.
- `$lib/email/membership.ts` holds the localized membership mails, which are sent through `sendEmail`.

## Goals / Non-Goals

**Goals:**
- One owner guard that every member write and account deletion read, so no path can bypass it.
- Reuse `deleteRegionRows`, `removeFileStorage`, `verifyPassword`, the founding-cap lock, the `role_changed` notice and the account deletion screen. Build no parallel copies of them.

**Non-Goals:**
- No new role in `app_role`, so RLS, `role_permissions` and Zero permissions stay untouched.
- No soft delete, no scheduled purge.

## Decisions

### 1. Owner is `regions.created_by`, not a new column

The column already means "owner" to the founding cap, and nothing else depends on it meaning "author". Renaming the UI label to "Owner" keeps the screen truthful after a handover.

Alternative: a new `owner_fk` column, keeping "Created by" as history. Rejected by the user. It would duplicate a column whose only other reader is already the cap.

Owner is an attribute layered on `region_admin`, not a role. RLS keeps seeing an admin.

### 2. One guard, `assertNotOwner`, in `guards.server.ts`

`isOwner(region, userFk)` is a pure predicate in `permissions.ts`, beside `isLastAdmin`, so the screen and the server read one rule. `assertMemberChangeAllowed` calls `assertNotOwner` for any `nextRole` other than `region_admin` and for removal. `leaveRegionRow` calls it too. The check reads `regions.created_by` for the update (`FOR UPDATE`), which serializes it against a concurrent handover.

The guard replaces the last-admin rule:

- `isLastAdmin`, `assertNotLastAdmin`, `activeAdminUserFks` and the `region_lastAdmin` keys are deleted, together with their tests;
- the region page's `isSoleAdmin`, which hides Leave, becomes `isOwner`.

The owner is an active admin who cannot be demoted, removed or leave, so a region with members always keeps an admin. `lockRegionMembers` stays, since invitations and restores use it.

The refusal is a new `formError('region_ownerMustHandOver')`.

### 3. Handover and delete are remote commands, not mutators

Both need `verifyPassword`, a GoTrue network call, before the transaction. AGENTS.md keeps password-gated actions as remote functions, and a mutator's server half runs inside the transaction. The two new exports in `regions.remote.ts`:

- `transferRegionOwnership({ regionFk, userFk, password })`. It verifies the password first. Then, in one `pinnedTx`:
  - locks `region_members` (`lockRegionMembers`) and the region row;
  - requires that the caller is the owner;
  - requires that the recipient is an active `region_admin`;
  - takes `LOCK.regionOwner` for the recipient and checks `MAX_OWNED_REGIONS` with the same count as `createRegionIn`, extracted into a shared `assertBelowOwnedCap(tx, userFk)`;
  - sets `created_by`;
  - writes no feed event: the notice to the new owner is the record.

  After the commit, `notify({ sourceType: 'role_changed', metadata: 'owner', ... })` sends the notice.
- `deleteRegionCommand({ regionFk, name, password })`. It checks the name first: trimmed, against the stored name, refused on the `name` field. It then verifies the password. Then, in one `pinnedTx`:
  - locks the region row and requires that the caller is the owner;
  - collects the other active members' ids, emails and `contactLocale`, before the rows go;
  - calls `deleteRegionRows`.

  After the commit, it runs `removeFileStorage(targets)` and one `sendEmail` per recipient, each wrapped so that a failure is logged and never thrown. It returns `redirectTo: resolve('/(app)/settings')`.

`pinnedTx` because the deletion crosses every region table and the caller's RLS cannot delete other members' rows. That is the same reason account deletion uses it.

The name check comes before the password check, so a typo never costs a GoTrue round trip.

### 4. Preview is a remote query

`regionDeletionPreview(regionFk)` returns two counts: the other active members, and the ascents they logged in the region. It runs on the privileged handle, after an owner check. It is a server read for the same reason as `accountDeletionPreview`: a half-synced client must not under-report.

### 5. Owner label in the role-change notice

`role_changed` with `metadata: 'owner'`. A separate `ownerLabel` check comes before `roleLabelFor` in `caption.ts`, and again for the mail role in `directed.server.ts`, both resolving to `m.regions_owner()`. Adding `'owner'` to `assignableRoles` was rejected, because role pickers read that list. A new source type was also rejected: it means a new enum value, caption, push template, mail and Zero regeneration, all for the same sentence with a different label.

### 6. Account deletion: `accountDeletionEffect` takes the owner

The signature becomes `accountDeletionEffect(members, userFk, ownerFk)`. With no other active member, the answer is `deletes`, as before. Otherwise it is `blocks` when `ownerFk === userFk`, else `keeps`. The admin filter goes, since it only fed `isLastAdmin`. `classifyRegions` already locks the regions, and also selects `created_by`. The settings copy `settings_deleteAccountBlocked` gains "hand it over first".

### 7. Screens

- **Region page** (`regions/[regionId]/+page.svelte`):
  - the `region_createdBy` label becomes `regions_owner`. The value is still `detail.createdBy`, synced through the existing `author` relation;
  - a "Delete region" `SettingLink` at the end, shown when the current user is the owner, linking to `/regions/[regionId]/delete` with a literal `resolve()`;
  - the owner check reads a new `ownerFk` on the detail DTO, which carries the raw `createdBy` id beside the display name.
- **`MemberRow.svelte`**:
  - a "Make owner" action for the owner, on rows of other active admins. It links to `/regions/[regionId]/owner/[userId]`, a `Form` screen with the password field (a route rather than a modal, like the delete screen), and needs no client write, since sync carries `created_by`;
  - for the owner's own row, the demote and remove actions are hidden.
- **`/regions/[regionId]/delete/+page.svelte`**:
  - mirrors `settings/account/delete/+page.svelte`, with the preview through `remoteResource`, `QueryError` on failure and submit held until the preview has answered;
  - it adds a name field above the password field;
  - a non-owner sees `RegionAdminRequired`-style refusal copy.

### 8. Region-deleted mail

`regionDeletedEmailContent({ locale, regionName, url })` sits in `membership.ts` beside `membershipRemovedEmailContent`, and is passive like that mail. It names the region and that the owner deleted it, with no person's name. The CTA opens the app.

### 9. The orphan: an operator procedure, no migration and no script

The prod check found exactly one region whose creator is not an active admin, and it has no members. A backfill would fix nothing else, so there is none. A rerun of that query is a release step instead (Migration Plan).

The orphan is deleted through the app, not a script: the operator makes themselves an active admin and the owner of that region in SQL, then deletes it on `/regions/[regionId]/delete`. A `tsx` script cannot do it, because `removeFileStorage` reaches the image and video providers through SvelteKit's `$env` modules, which exist only inside the Vite runtime. The same procedure serves any later request to delete a region whose owner is gone. `purge-region.ts` stays the dev-only tool it is, since it skips storage.

## Risks / Trade-offs

- [The owner guard reads `created_by` while another tab hands over] → both paths lock the region row, so one waits for the other.
- [A deleted region frees the owner's founding slot, so a person can found, delete and found again] → accepted. The cap bounds concurrent regions, not lifetime ones, and deletion is password-gated.
- [Members not emailed when Resend is down] → logged and not retried. Accepted, because the deletion is the user-visible fact and members will see the region gone.
- [Storage removal fails after commit] → `removeFileStorage` already logs failures for account deletion, and the same orphan-file risk applies.
- [An old tab shows "Created by" until reload] → harmless, since the label changes but the value is the same.
- [A non-owner admin opens a stale settings page and demotes the owner] → the server guard refuses it, and the screen shows the error.

## Migration Plan

1. Rerun the ownership query from the grilling against prod. If it returns anything besides the orphan, stop and fix by hand.
2. Deploy zero-cache (no schema change), then the app.
3. Delete the orphan with the operator procedure in §9.
4. Send the member email that covers account deletion and region deletion (terms clause 21), once both are deployed.
5. Rollback: revert the app. Nothing in the data changed shape.
