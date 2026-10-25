# Tasks

## 1. Data

- [x] 1.1 Add `content_reports` to `schema.ts` (columns without any closed state, the unique and region indexes, RLS with the one SELECT-own policy), run `generate:drizzle` after checking other branches' migration numbers, `generate:zero`, and `migrate` from the main checkout; verify the migration on a fresh postgres with `ci/shim.sql`
- [x] 1.2 Add the `content_reported` and `report_closed` notification source types with their recipients and captions; verify with a test that neither ever addresses the reported author

## 2. Writes

- [x] 2.1 `canReport` in `report/permissions.ts` (member with read, not an admin of the region, not the author); verify with a unit test over member, maintainer, admin, author and outsider
- [x] 2.2 `reports.file` mutator (client and server defs, `asPrivileged`, gate on the stored object), upserting the one open report and notifying the region's admins only for an object's first open report; verify with server tests that a member files and updates one report, that an admin, the author and an outsider are refused, and that a second reporter adds no admin notice (each seen red)
- [x] 2.3 `reports.dismiss` mutator gated on `canModerate`, notifying each reporter that the content stays and deleting the object's reports; verify with server tests that a co-admin dismisses and the reports are gone, a maintainer is refused, and the reported author gets nothing (seen red)
- [x] 2.4 List the new mutators and reads in `gates.test.ts`

## 3. Reads

- [x] 3.1 `myOpenReports` Zero query; verify with a server test that a member syncs only their own reports
- [x] 3.2 `listRegionReports` remote query gated on `canModerate`, grouped by object, hiding gone objects; verify with remote tests for an admin, a maintainer and another region's admin (seen red)
- [x] 3.3 Extend the all-regions stats read with the open count and the oldest and youngest open report per region; verify with a server test that nothing else of a report is selected

## 4. Closing and retention

- [x] 4.1 In the cleanup task, notify the reporters of reports whose object is gone or soft-deleted that it was acted on, and delete those reports; verify with server tests for a removal, an author's own delete, a parent's deletion, and an Undo after closing that brings no report back (seen red)
- [x] 4.2 Account deletion takes the reports a person filed and the reports on their content; verify in `delete.server.test.ts`

## 5. Screens

- [x] 5.1 Extract the ground radios from `RemovalForm` into a shared component, and let the removal form take an initial ground from `?ground=`; verify the existing removal page test still passes and a new one for the parameter (seen red)
- [x] 5.2 The report form at `/(app)/report/[kind=removable]/[id]` (preview from the entity's client resources, grounds, note, the legal-ground link, Reported state, back plus toast); verify with a page test (seen red)
- [x] 5.3 "Report…" in the area, block, route, ascent, media and topo action sheets and the flag in `Comments.svelte`, by `canReport` and Reported state; verify with component tests that admins and authors see none (seen red)
- [x] 5.4 `ReportQueue` above `DecisionList` on the region moderation screen (empty state, grouped rows, Remove… link, Dismiss with dialog) and the open count on the region screen's Moderation row; verify with a page test (seen red)
- [x] 5.5 The footer "Report" link on `/f/[id]` for non-members; verify with a page test
- [x] 5.6 The two columns on the all-regions stats screen

## 6. Copy and legal

- [x] 6.1 Add the `reports_*` keys (form, entries, toast, queue, dialog, notices, empty state, stats columns) to both locales, sorted, through the writing guidelines
- [x] 6.2 Draft privacy §2.8, §4, §5, §7 (a report is kept only while open), the terms sentence and the reporting page line in en and de; run the `/legal-risk-assessment` reviewer over the drafts against the code; the user reads the diffs with its findings before commit

## 7. Verification

- [x] 7.1 Over the touched paths: `prettier --write`, `eslint`, `vitest --project server` and `--project browser` for the matching tests, `svelte-check`, `npm run lint:duplication`, `npm run lint:unused`; all green
- [x] 7.2 Drive at 375x667 and 1280x800, both themes, en and de, with throwaway accounts: a member reports a comment and a route, an admin gets one notice per object, removes one from the queue and dismisses the other, the reporters get their outcomes, the reported author gets nothing, a maintainer sees no queue, a non-member on a public `/f/` link sees only the legal link

## Workflow follow-up

- Archive the change with `/opsx:archive member-content-reports` once implemented and reviewed.
