# Proposal

## Why

Region admins can remove content for breaking the rules, but they act only on what they happen to see. A member who meets spam, harassment or someone's personal data in their region has no way to say so: the only reporting route is the operator's legal channel at `/legal/report`, an email address meant for unlawful content and land complaints. Moderation is missing its input.

## What Changes

- A region's members and maintainers can report another person's area, block, route, ascent, comment, photo or video, or topo, for one of the six grounds admins remove content for, with an optional note. "Report…" sits in each object's "More" sheet and, for a comment, as a flag icon in its action row. The form is its own screen, `/report/[kind]/[id]`. Admins see Remove, never Report; nobody sees either on their own content.
- A member has at most one open report per object; sending again updates it. The entry then reads "Reported" and reopening it shows what was sent.
- Picking "Unlawful content" or "Someone's personal data" adds a note that a legal claim can also go to the operator, linking to `/legal/report` with the content's address filled in. The in-app report still goes to the region's admins.
- The region's admins get one inbox and push notice per reported object while its reports are open. The region's moderation screen gains a "Reports" section above the decisions log: one row per object with its grounds, each reporter's name and note, and Remove… or Dismiss (with a confirmation). The "Moderation" row shows the open count.
- Reports close on their own when their object is removed or deleted, however that happened ("acted on"), or when an admin dismisses them ("stays"); each reporter gets an inbox notice of the outcome. A later Undo does not reopen them.
- The reported member is never told about a report or who filed it.
- The operator sees no report contents: the all-regions stats screen gains, per region, the open-report count and the age of the oldest and youngest open report.
- On a public `/f/[id]` page, anyone who is not a member of the file's region gets a "Report" link to `/legal/report` with the address filled in.
- A report is deleted as soon as it closes, once its reporter's notice is out; an account deletion takes the reports it filed and the reports on its content.
- Privacy notice §2.8, §4, §5 and §7, terms (an in-app report reaches the region's admins, not the operator), and the reporting page change, in both languages.

## Capabilities

### New Capabilities

- `moderation/content-reports`: members reporting content to their region's admins, the admins' queue and its outcomes, and what the operator sees.

### Modified Capabilities

None. Removal, Undo and the decision log keep their requirements; a report only opens the existing removal form.

## Non-goals

- Reports reaching the operator, or an in-app Art. 16 DSA notice procedure: legal claims stay on `/legal/report`.
- Anonymous or non-member reports in the app, including from `/f/[id]`.
- Withdrawing a report, a per-member report cap, or a reporter's list of their reports.
- Reporting from feed cards: the card opens the object, which carries the entry.
- Admins reporting to co-admins.

## Impact

- Schema: a new `content_reports` table (migration plus `generate:zero`), and two notification source types.
- Entity modules: a new `src/lib/entities/report/` (dto, mutators, queries, server handlers, writes); `moderation/` for the queue on the region's moderation screen; `notification/` for the source types and recipients; `region/` for the stats columns; `user/delete.server.ts` for account deletion; `src/routes/api/tasks/cleanup/` for closing reports on content that is gone.
- Routes: new `src/routes/(app)/report/[kind=removable]/[id]/`; entries in the area, block, route, ascent, media and topo action sheets, `Comments.svelte`, `/regions/[regionId]/moderation`, the region screen's Moderation row, `/f/[id]`, the all-regions stats screen.
- Copy: new `reports_*` keys in `messages/en.json` and `messages/de.json`; `privacy.{en,de}.html`, `terms.{en,de}.html`, `report.{en,de}.html`.
- Client compatibility: the new route, mutators and remote reads are additive; no existing URL, remote export, mutator name or argument and no `manifest.id` changes. Tabs loaded before the deploy simply lack the entries until they reload.
- Release: ships with notify-moderation-removals, region-moderation-log and restore-respects-removals, under one terms-change email.
