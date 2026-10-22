# Proposal

## Why

A region can only be deleted today by asking the operator, or by its last member deleting their account. A self-serve delete is overdue, but any one of several admins could then wipe a region the others still use. That admin can already remove the other admins one by one, which is the same harm done slowly. Most comparable apps answer this with one protected owner (Slack, Discord, Telegram, Meetup, Strava, Mastodon), not with a vote between admins. The research notes for this change cover the details.

## What Changes

- Every region has one owner: the person in `regions.created_by`. The region page labels them "Owner" instead of "Created by". The 3-region founding cap already counts this column, and now it counts owned regions.
- Other admins can no longer demote or remove the owner. The owner cannot leave the region or change their own role without handing ownership over first.
- The owner can hand ownership to another active admin of the region. They confirm with their password. The new owner gets the existing role-change notice. A handover is refused when the recipient already owns 3 regions.
- The owner can delete the region from a new screen, `/regions/[regionId]/delete`. The screen shows what goes, including how many ascents other members logged. The owner confirms with their password and the region's name. The deletion is immediate and cannot be undone.
- After a deletion, every other active member gets an email in their own language that names the region.
- **BREAKING (behavior)**: account deletion is now refused while the person owns a region that has other active members, until they hand it over. Before this change, any second admin let the deletion through.
- The last-admin rule goes. The owner is always an active admin and cannot be removed, so the owner guard already keeps every region administrable.
- A new operator script, `delete-region.ts`, deletes one region by id, files included. It is used once, for the one region that has no active members left.
- The FAQ, the terms (clause 3 and the roles in clause 15) and the privacy page describe the owner and region deletion. "Last updated" moves.

## Non-goals

- A grace period, an undo, or a veto by other admins. No comparable app documents a veto between admins.
- Restoring a deleted region, in the app or by hand.
- Any region power for app admins.
- An export of a region or of members' ascents before deletion.
- Notifying members in the app. That notice would be deleted together with the region.
- Moderation removals (`notify-moderation-removals`), which follow as their own change.

## Capabilities

### New Capabilities

- `regions/region-ownership`: who owns a region, what the owner is protected from, and how ownership is handed over.
- `regions/region-deletion`: the owner deleting a region, the confirmation it takes, what it removes, and how members learn of it.

### Modified Capabilities

- `auth/account-deletion`: the requirement "The last admin of a shared region cannot delete their account" becomes "The owner of a shared region cannot delete their account".

## Impact

- Entity modules:
  - `src/lib/entities/region/`: `guards.server.ts` (owner guard replaces the last-admin guard), `members.server.ts` (leave, remove, role change), `permissions.ts` (`accountDeletionEffect`, `isOwner` replaces `isLastAdmin`), `delete.server.ts` (reused as is), `regions.remote.ts` (two new commands), `mapper.ts` and `dto.ts` (owner on the detail DTO), `create.server.ts` (cap check reused for handover).
  - `src/lib/entities/user/delete.server.ts`: `classifyRegions` and its preview.
  - `src/lib/entities/notification/caption.ts` and `directed.server.ts`: an owner label for `role_changed`.
  - `src/lib/email/membership.ts`: the region-deleted mail.
- Routes:
  - `src/routes/(app)/regions/[regionId]/+page.svelte` and `MemberRow.svelte`: the Owner label, the "Make owner" action and the "Delete region" row.
  - New `src/routes/(app)/regions/[regionId]/delete/`.
  - `src/routes/(app)/settings/account/delete/`: the refusal copy.
  - `src/routes/(landing)/legal/terms`, `legal/privacy` and `help/faq`.
- Tables:
  - No schema change and no migration. Prod has no region whose creator is not an active admin, apart from the orphan, which the script deletes.
  - The deletion reads `region_members` and deletes every region-scoped table through `deleteRegionRows`.
- Remote functions: two new exports in `regions.remote.ts` (delete and hand over). Adding exports does not break loaded tabs. No existing export moves or is renamed, and `manifest.id` is untouched.
- New route `/regions/[regionId]/delete`. No existing URL changes. A tab loaded before the deploy simply does not show the new rows until it reloads.
- Members with the region open when it is deleted lose it through Zero sync and see the existing not-found state.
