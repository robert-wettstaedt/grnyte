# Proposal

## Why

Content a region admin removes for breaking the rules is soft-deleted, so the ordinary restore that backs the tidy-up Undo can bring it back. Its gate is `canDeleteCreatedRow`, which passes any region admin and also a maintainer who created the row. A crafted `areas.restore`, `blocks.restore` or `routes.restore` with `mode: 'soft'` therefore brings back a rule-breaking removal without reversing its decision: the author is not told, the region's moderation log keeps saying "In effect", and a second removal can stack a second standing decision on the same object. The UI never offers this path, but the punished author can take it, and the record no longer matches what is on screen.

## What Changes

- The soft restore of an area, block or route refuses while a standing decision (one not yet reversed) holds that object down, with one message for everyone who could otherwise restore it (anyone else gets the ordinary refusal, so nothing reveals what was moderated): "This was removed for breaking the rules. Only a region admin can bring it back, from the region's moderation log."
- Moderation Undo keeps working unchanged: it restores through the lifecycle functions directly, not through the restore mutators that carry the check.
- Tidy-up deletes and their Undo are unaffected: they record no decision.
- One new message key in `messages/en.json` and `messages/de.json`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `moderation/removal-decisions`: adds that content removed for breaking the rules comes back only through Undo.

## Non-goals

- Reversing the decision automatically when someone restores, or refusing only the author: settled as refuse for everyone.
- Ascents, comments, photos, videos and topos: ascents have no restore mutator, a removed comment has no author stash to restore from, and the media are deleted for good.
- Any change to the hard-restore branch: a rule-breaking removal always soft-deletes, so a hard restore of its id finds the row and answers as a replay.
- Any UI: the path is unreachable from the app's screens.

## Impact

- Entity modules: the `restore` mutators in `src/lib/entities/area/mutators.server.ts`, `block/mutators.server.ts` and `route/mutators.server.ts`; `src/lib/entities/moderation/undo.server.ts` for the shared standing-decision check. The lifecycle files are untouched.
- Tables read: `moderation_decisions` (by `object_type`, `object_id`, `reversed_at is null`). No table, column or policy changes.
- Copy: one `moderation_*` key in both locales.
- Client compatibility: no URL, remote export, mutator name or argument and no `manifest.id` changes. An already-loaded tab that sends such a restore gets the new refusal instead of a restore, which is the intent.
- Ships in the same release as notify-moderation-removals and region-moderation-log.
