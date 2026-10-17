# Proposal

## Why

The two cron routes are the delivery engine, not routes. `src/routes/api/tasks/notifications/+server.ts`
is 810 lines, of which `POST` is the last 30; with `src/routes/api/tasks/cleanup/+server.ts` (210)
the two hold about 1020 of the repo's roughly 1450 `+server.ts` lines. Push, digest and mail
delivery live where no other module can reuse or unit-test them, `dispatch.ts` already says its pure
half was "extracted from +server.ts" while the database half stayed, and retention sweeps sit
beside four sibling sweeps that already live in their entity modules. Found by the 2026-10-16
code-quality review (finding RN-1); it is the largest remaining item in that plan.

## What Changes

- Move the directed half of the notifications task (`sendDirected` with `dispatchSlice` and its
  slice and retry constants, `sendMembershipEmail`, the
  `MAIL` builders, `guarded`, `parentNamesOf`) into a new
  `src/lib/entities/notification/directed.server.ts`.
- Move the digest half (`sendDigests` with its watermark claim, advance and `raisedWatermark`, `namesOf`) into a new
  `src/lib/entities/notification/digestRun.server.ts`.
- Move `unreadCounts` and the `toMs` SQL helper, which both halves use, into a new `src/lib/entities/notification/delivery.server.ts`.
- Leave `src/routes/api/tasks/notifications/+server.ts` as authentication, the configuration
  check, the calls and the JSON response.
- Move the cleanup route's five sweeps to the modules that own their tables: staging and Bunny
  objects to a new `src/lib/entities/file/sweep.server.ts`, notification retention to a new
  `src/lib/entities/notification/retention.server.ts`, feedback retention to a new
  `src/lib/entities/feedback/retention.server.ts`, and the error-log sweep to a new
  `src/lib/logging/retention.server.ts` beside `failure.server.ts`, which owns the published age.
- Behaviour-preserving throughout: same queries, same order of writes, same response bodies, same
  logging. No retry, batching or concurrency change.

Not client-breaking. Both route URLs stay where they are, no `.remote.ts` file moves and no remote
export is renamed, so already-loaded tabs are unaffected; the routes are called only by the
database's pg_cron jobs, which keep calling the same paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. A pure refactor: no spec-level behaviour changes, so the change sets `skip_specs: true`.

## Non-goals

- Changing delivery behaviour: running the independent preamble reads in parallel, giving
  `inBatches` per-item isolation, or merging the two "raise a watermark" SQL spellings. Each is a
  real improvement the review lists, and each is a separate change with its own risk.
- The digest copy simplification (review finding RN-3) and the per-type traits (RN-2, done).
- Any schema, migration, i18n or UI change.

## Impact

- Routes: `src/routes/api/tasks/notifications/+server.ts`, `src/routes/api/tasks/cleanup/+server.ts`.
- `src/lib/entities/notification/dispatch.ts`: a stranded doc comment from the route moves onto
  `ParentName`, the type it describes.
- Entity modules: `src/lib/entities/notification/` (three new server modules plus retention),
  `src/lib/entities/file/` (new sweep module), `src/lib/entities/feedback/` (new retention module),
  `src/lib/logging/` (new retention module).
- Tables touched by the moved code, unchanged in how: `notifications`, `events`,
  `push_subscriptions`, `user_settings`, `feedback`, `client_error_logs`, plus the staging bucket and the Bunny library.
- Tests: `notifications.server.test.ts` and `cleanup.server.test.ts` drive `POST` and mock their
  dependencies by `$lib` path, so they keep working if the new module names avoid the mocked ones.
