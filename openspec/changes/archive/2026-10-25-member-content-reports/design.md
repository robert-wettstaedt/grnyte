# Design

## Context

Moderation today is one-sided. A region admin removes content through `/remove/[kind=removable]/[id]` (`RemovalForm.svelte`, the ground list in `moderation/dto.ts` `moderationGround`), which records a decision (`moderation_decisions`, RLS on, no policies, read only through privileged remote queries such as `listRegionDecisions`) and notifies authors through `notification/` source types. The region's moderation screen (`/regions/[regionId]/moderation`, `DecisionList.svelte`) lists decisions. Removable kinds and their lookup by id already exist (`removableKind`, `removalTargetSchema`, `moderation/subjects.server.ts`, `preview.server.ts`). Comments render in `Components/Reactions/Comments.svelte` with an always-visible action row (reactions, Reply, a trash icon); the other kinds have "More" action sheets. The operator's all-regions screen reads `region_statsAll`. A cleanup task under `src/routes/api/tasks/cleanup/` runs on a schedule (pg_cron in dev). There is no per-user rate limiter, only the global per-IP one.

## Goals / Non-Goals

**Goals:**

- Reuse the removal machinery: the same kinds, grounds, object lookup, form shape and moderation screen.
- Keep report contents away from the operator and the reported member, by construction rather than by screen.

**Non-Goals:**

- An in-app Art. 16 DSA procedure, anonymous reports, withdrawal, caps (see the proposal).

## Decisions

- **Data: one table, `content_reports`.** Columns: `id`, `region_fk` (cascade with the region), `object_type` (`removableKind`), `object_id` (text, as in decisions), `reporter_fk` (users, cascade), `author_fk` (users, nullable, cascade: the reported content's author, so an account deletion takes the reports on its content), `ground` (`moderationGround`), `note` (nullable, capped like a removal reason), `created_at`. Every row is open: closing a report sends its notice and deletes it, so there is no closed state, outcome column or expiry. A unique index on `(reporter_fk, object_type, object_id)` makes "one open report per member and object" a constraint, and the file mutator upserts on it, replacing ground and note. An index on `region_fk` serves the queue and the counts. RLS on, with exactly one policy: a member SELECTs their own rows. Migration through the pipeline; check the other branches' migration numbers first.
- **Reads.** The reporter's own open reports are a Zero query (`myOpenReports`, scoped to the region, own rows only by the policy), so the entry reads Reported offline and without a round trip. The admin queue is a privileged remote query `listRegionReports({ regionFk })` gated on `canModerate`, like `listRegionDecisions`, returning rows grouped by object with reporter names; it leaves out objects that are already gone, so a removal empties the row at once even before the task closes it. The operator's counts extend the all-regions stats read with three aggregates per region (open count, oldest and youngest `created_at` among open reports); nothing else of a report is selected there. The report form needs no server read for its preview: the member can see the object, so its title or a comment's excerpt comes from the entity's existing client resources by kind.
- **Writes are mutators.** `reports.file({ kind, id, ground, note })` and `reports.dismiss({ kind, id })`, client defs in `report/mutators.ts`, server defs in `report/mutators.server.ts`, run under `asPrivileged` because the table has no write policies, each naming its gate. `file` loads the object's stored region and author through the shared lookup and gates on `canReport`: a member of that region with read access, not an admin of it (`canModerate`), and not the author. `dismiss` gates on `canModerate` of the stored region. Components write through `report/writes.ts`.
- **Notices: two source types.** `content_reported` goes to every admin of the region (the existing region-admin recipients), inserted only when an object gets its first open report, so later reports on it add none. A stale one leads to the queue, which already shows the object gone or dismissed, so nothing withdraws it. `report_closed` goes to each reporter with the outcome and the object's name, and is the only trace a closed report leaves. Neither outlives membership. Nothing is ever addressed to the reported author.
- **Closing is notify, then delete, on one path per cause.** `dismiss` notifies its object's reporters ("stays") and deletes the reports in its own transaction. Everything else (a removal, a tidy-up delete by an admin, the author deleting, a parent's deletion taking the object with it) is caught by the cleanup task, which notifies the reporters of reports whose object is gone or soft-deleted ("acted on") and deletes those reports. One task covers every way content can disappear, including cascades, instead of a hook in each delete handler; the queue read hides gone objects meanwhile. An Undo restores content and finds no report to bring back.
- **The form is a route**, `/(app)/report/[kind=removable]/[id]`, mirroring `RemovalForm`: header with Cancel and Send, the preview, the ground radios extracted from `RemovalForm` into a shared component, the optional note, and for `unlawful` and `personalData` a line linking to `/legal/report?content=<address>`. A route rather than a sheet because a comment's thread is itself a sheet and a dialog opened from it is the nested-modal trap. On success it goes back and toasts.
- **Entries.** A "Report…" row in the area, block, route, ascent, media and topo action sheets, shown by `canReport` and reading Reported from `myOpenReports`. In `Comments.svelte`, a flag icon in the action row on other people's comments for non-admins, the same size and slot as the admin's trash, filled once reported. On `/f/[id]`, a quiet footer link to `/legal/report` for anyone not a member of the file's region.
- **The queue.** A `ReportQueue` component above `DecisionList` on the region moderation screen, always rendered with an empty state, one `Disclosure` row per object (name linking to the object or, for a comment, its highlighted thread; kind; count; grounds; newest time), opened to the reports and two actions: Remove…, linking to `/remove/[kind]/[id]?ground=<most reported>` (the removal form reads the parameter as its initial ground), and Dismiss behind a `Dialog`. The region screen's Moderation row shows the open count as its value.

## Settled during implementation

- **`object_name` on `content_reports`.** The reporter's acted-on notice names what they reported, and by then the object may be hard deleted (photos, topos). The name is taken at filing and refreshed on each update; null for a comment, whose words are its author's.
- **`notifications.object_ref` (`kind:id`), in `notifications_source_idx`.** Comments and topos have no object column and a closed object may be gone, so without it two report notices in one region would collapse into one row. Null on every other row, so existing dedupe is unchanged.
- **An `anonymous` source trait** replaces `notify`'s `decisionFk` check: removal and report notices store no actor. `notify` takes `actorFk: null` for the cleanup task.
- **`reportPreview` is back** (user's call): no client read exists for one comment, photo or topo. It reuses the removal preview's `itemOf` and the file mutator's gate (`canReport` on the visible stored object).
- **Visibility before permission.** `content_reports` writes run privileged, so an object in a region the caller cannot read answers as missing (404), never as refused (403).
- **Placement.** Ascents and topos have no More sheet: Report sits in the expanded ascent's action line and under the topo's route list. The media viewer and `/f/[id]` put a flag in the top-right toolbar; `/f`'s bottom belongs to the media sheet. `/legal/report` prefills the mail with `?content=` when it is an address on this site.

- **Own content (grilled after review).** An admin's own reported content goes to the region's other admins (`reviewers` in `report.server.ts`, used by the notice, the queue and dismiss). With no other admin, the author is told and sees one row with the grounds in the form's order: no reporter, note, count or time, since in a one-admin region any of them can point to the reporter. Remove… is not offered there; the author edits or deletes their content as always. The law protects who reported (privacy §2.7, § 29 BDSG), not that a report exists: Art. 15 GDPR lets the author learn that on request.
- **Remove… from the queue returns to it** through `?return=`, accepted only when it resolves to this origin.

## Risks / Trade-offs

- [A sole admin's notice is timestamped] → the row hides times, but the "New report" notice arrives as the report does; accepted, so the only admin learns of it at all.

- [Closing lags a deletion by up to one task interval] → a rule-breaking removal closes the reports on what it removed in its own transaction, so its Undo finds none. Other deletions, and reports on what a removed area or block took with it, close on the task's next run; the queue hides gone objects meanwhile.
- [No history of closed reports] → admins cannot see that a member was reported before once those reports closed; decided in favour of keeping no allegations without a reader. The decision log still records every removal.
- [A member floods reports] → one open report per object is enforced; admins see the reporter's name; a cap is a non-goal until observed.
- [Region admins learn who reported] → intended (spite reports); the reported member never does.
- [Legal claims sent in-app] → the form's note for the two legal grounds and the terms sentence say an in-app report goes to the region's admins, not the operator; the operator never reads report contents, so no knowledge arises from them.
- [A new table and policy] → one SELECT-own policy and no write policy; `gates.test.ts` lists the new mutators and remote reads with their gates.

## Migration Plan

Schema migration (the table, its indexes and policy, the two source types if they are an enum), `generate:zero`, then the app. Deploy zero-cache before the app. The legal text changes go out in the same release, announced by the release's one terms-change email.
