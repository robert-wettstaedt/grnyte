# Proposal

## Why

A region can have several admins, and today none of them can see what the others removed for breaking the rules, nor correct a removal once its Undo toast is gone; only the app admin sees the record. Every community platform with volunteer moderators (Reddit's mod log, Discord's audit log, Facebook group admin activity) gives the moderators of a scope a shared log of the actions in it, with who acted, so they can hold each other to account and fix mistakes.

## What Changes

- A region's admins see that region's removal decisions on a new screen, `/regions/[regionId]/moderation`, reached from a "Moderation" row on the region screen that only its admins see.
- Each row shows what the app-admin list shows, minus the region and with the admin who acted: status, ground, kind, time, reference, reason, and the items removed (a comment as its excerpt, never the full removed text). Newest first, the newest 200.
- Any admin of the region can undo any standing decision in it from that screen, after a confirm dialog. Undo restores what can come back, withdraws unread notices, tells authors who read theirs, and records which admin reversed it. The admin who made the decision is not notified.
- The Undo toast right after a removal follows the same rule: any admin of the region, no longer only the one who removed it.
- The app admin's Reverse on appeal becomes the same Undo, on the same write path, so both screens act one way.
- Members still never see who acted, the app admin's list still covers every region, and the statement page is unchanged.
- Privacy notice section 5 and terms clause 15 say that a region's admins see its removal record, including who acted, and can undo a removal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `moderation/removal-decisions`: "Decisions are recorded and visible to app admins" extends to the region's admins seeing their region's decisions; "Undo reverses the decision" widens who may undo from the acting admin to any admin of the region.

## Non-goals

- Paging past the newest 200, filters or search.
- Showing a removed comment's full text to anyone but through a reversal.
- Notifying the admin whose decision a co-admin undid.
- Letting maintainers or members see the log, or letting region admins rule on appeals under clause 13.
- Any schema change: the decision tables already hold everything shown.

## Impact

- Entity modules: `src/lib/entities/moderation/` (`admin.server.ts` gains a region-scoped read, `moderation.remote.ts` a new query, `undo.server.ts` a wider gate), `src/lib/entities/region/` only for the admin check the row uses.
- Routes: new `src/routes/(app)/regions/[regionId]/moderation/+page.svelte`; a row on `src/routes/(app)/regions/[regionId]/+page.svelte`.
- Tables read: `moderation_decisions`, `moderation_decision_subjects`, `users` (actor name). No table or policy changes.
- Copy: new `moderation_*` keys in `messages/en.json` and `messages/de.json`; `privacy.{en,de}.html` section 5, `terms.{en,de}.html` clause 15, reviewed by the legal reviewer.
- Client compatibility: the new URL and the new remote export are additive, so already-loaded tabs keep working and only gain the row after they reload. `moderation.undoRemoval` keeps its name and arguments; only its server-side gate widens. The remote command `reverseDecisionCommand` is deleted, which breaks nothing because it never shipped. No `manifest.id` change.
