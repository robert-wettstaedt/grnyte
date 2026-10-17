# Design

## Context

See proposal.md for the why. What shapes the how:

- Both routes are server-only `RequestHandler`s called by pg_cron. Locally the dev database POSTs to
  them every 30 seconds, so the moved code runs continuously in dev with nothing else started.
- No Zero query and no remote function is involved. Everything moved is server-side Drizzle through
  `db`, `pinnedTx` and the service-role clients, and it stays that way. No schema change.
- `notifications.server.test.ts` and `cleanup.server.test.ts` import `POST` and replace
  dependencies with `vi.mock` by `$lib` module id: `$lib/entities/notification/push` (partially,
  with `DIRECTED_SCAN_LIMIT` exposed through a getter so a test can lower it),
  `$lib/entities/notification/push.server`, `$lib/entities/notification/errorAlert.server`,
  `$lib/email/send.server`, `$lib/logging/failure.server` (wholesale, notifications only),
  `$lib/db/pinned.server` (partially), `$lib/remote/cron.server`,
  `$lib/entities/file/cleanup.server` (wholesale, cleanup only),
  `$lib/entities/file/readiness.server`, `$lib/entities/user/unconfirmed.server`,
  `$lib/db/supabaseAdmin.server` and `$lib/videos/provider.server`.
- `unreadCounts` and the `toMs` SQL helper are used by both halves of the notifications task; `guarded`, `parentNamesOf`,
  `sendMembershipEmail` and `MAIL` only by the directed half; `claimWatermark`,
  `advanceWatermark` and `namesOf` only by the digest half.

## Goals / Non-Goals

**Goals:**

- Each moved declaration keeps its body byte for byte. The only edits are imports, `export`, one
  stranded doc comment (it described `ParentName`, which already lives in `dispatch.ts`, so it moves
  onto that type), and the
  one-line call sites in the routes, so review is "did anything but the location change".
- Both test files pass unmodified.

**Non-Goals:**

- Renaming any moved function, or changing a signature beyond what a module boundary forces.

## Decisions

1. **Three notification modules, split by caller.** `directed.server.ts` (`sendDirected`, `CLAIM_SLICE`, `MAIL_RETRY_MS`, `MAILED`,
   `sendMembershipEmail`, `MAIL`, `MailBuilder`, `guarded`, `parentNamesOf`),
   `digestRun.server.ts` (`sendDigests`, `raisedWatermark`, `claimWatermark`, `advanceWatermark`, `namesOf`) and
   `delivery.server.ts` (`unreadCounts` and `toMs`, what both halves share), which both import. They extend the existing
   `entities/notification` module beside `dispatch.ts` (the pure half these were split from) and
   `digest.server.ts` (the copy the digest run renders).
   - Rejected: both halves in one module. It would be about 750 lines, moving the size problem rather
     than removing it.
   - Rejected: appending to `notification.server.ts`. That module is the write side (`notify`,
     recipients, mentions), already over 400 lines, and imported by remote handlers that must not
     pull delivery code with them.
   - `digestRun.server.ts`, not `digest.server.ts`: that name holds the rendering and is imported by
     its own tests.
2. **New module names avoid every mocked id.** A function moved into a module that a test mocks
   wholesale would vanish from that test. Hence `file/sweep.server.ts` for the staging and Bunny
   sweeps rather than `file/cleanup.server.ts`, which the cleanup test replaces with
   `{ reportBunnyOrphans }`. The moved code keeps importing the same `$lib` modules it imports
   today, so every existing mock still lands on it.
3. **`DIRECTED_SCAN_LIMIT` stays a live import.** `sendDirected` reads it inside the function body
   today, and must still: the test lowers it through the mocked module's getter, which only works
   while the binding is read at call time, never copied into a module-level constant.
4. **Retention ages move with their sweeps.** Each sweep module exports its age next to the sweep
   (as `failure.server.ts` already does with `ERROR_LOG_MAX_AGE_DAYS`); the cleanup route still
   computes each cutoff from one `now` and passes a `Date`, so the sweep signatures do not change.
   The error-log sweep goes to a new `logging/retention.server.ts` that imports
   `ERROR_LOG_MAX_AGE_DAYS`, not into `failure.server.ts` itself: the sweep runs through `pinnedTx`,
   and `pinned.server.ts` already imports `failure.server.ts` to report, so the obvious home would
   be an import cycle (the reason `failure.server.ts` avoids `pinnedTx`).
5. **Mechanical proof of a pure move.** Before deleting from a route, compare each moved function's
   text against the original (a short script over both files, run once and not committed). Any
   difference beyond `export` and imports stops the task.

## Risks / Trade-offs

- [A moved function lands in a mocked module and silently disappears from a test, which then
  passes for the wrong reason] → Decision 2; and each test file is run with one moved body
  deliberately broken to confirm it still reaches the code.
- [`DIRECTED_SCAN_LIMIT` captured at module load, so the scan-limit test stops lowering it] →
  Decision 3; the existing scan-limit test goes red if it happens.
- [jscpd fingerprints moved code as new clones (AGENTS.md)] → run `lint:duplication`; a clone that
  moved rather than appeared is accepted into the baseline with `lint:duplication:accept`, and the
  hand-back says so.
- [An import cycle between the new modules] → only `delivery.server.ts` is shared, and it imports
  nothing from the other two.

- [The new modules are reached only through the route tests, so `npm run test:mutation -- --mutate`
  on one of them finds no directly related test (AGENTS.md)] → accepted for this change: the route
  tests do reach the moved code (each of four seeded mutations went red). Unit tests per module are
  the follow-up that makes them mutation-testable.

## Migration Plan

None. No data, URL or contract changes: deploy as usual. Rollback is reverting the commit; pg_cron
keeps calling the same two paths throughout.
