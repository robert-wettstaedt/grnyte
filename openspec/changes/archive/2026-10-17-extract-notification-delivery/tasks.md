# Tasks

## 1. Notification delivery modules

- [x] 1.1 Create `src/lib/entities/notification/delivery.server.ts` with `unreadCounts` and `toMs` moved verbatim
      from the notifications route; verify with svelte-check.
- [x] 1.2 Create `src/lib/entities/notification/directed.server.ts` with `sendDirected`,
      `sendMembershipEmail`, `MailBuilder`, `MAIL`, `guarded` and `parentNamesOf` moved verbatim,
      `DIRECTED_SCAN_LIMIT` still read inside `sendDirected`; verify with svelte-check.
- [x] 1.3 Create `src/lib/entities/notification/digestRun.server.ts` with `sendDigests`,
      `claimWatermark`, `advanceWatermark` and `namesOf` moved verbatim; verify with svelte-check.
- [x] 1.4 Prove the move is pure: compare each moved function's text with the original in
      `src/routes/api/tasks/notifications/+server.ts` (one-off script, not committed); only `export`
      and import lines may differ.
- [x] 1.5 Reduce `src/routes/api/tasks/notifications/+server.ts` to authentication, the
      configuration check, the calls and the JSON response; verify `notifications.server.test.ts`
      passes unmodified.

## 2. Cleanup sweeps to their owners

- [x] 2.1 Create `src/lib/entities/file/sweep.server.ts` with `listAll`, `sweepStaging`, `sweepBunny`
      and their ages moved verbatim; verify with svelte-check.
- [x] 2.2 Create `src/lib/entities/notification/retention.server.ts` (`sweepNotifications` and its two
      ages) and `src/lib/entities/feedback/retention.server.ts` (`sweepFeedback` and its age), moved
      verbatim; verify with svelte-check.
- [x] 2.3 Move `sweepErrorLogs` and its age to a new `src/lib/logging/retention.server.ts` importing
      `ERROR_LOG_MAX_AGE_DAYS` (not into `failure.server.ts`: import cycle with `pinned.server.ts`);
      verify `failure.server.test.ts` still passes.
- [x] 2.4 Prove the moves pure the same way as 1.4, then reduce `src/routes/api/tasks/cleanup/+server.ts`
      to authentication, the `Promise.all` of calls, the log line and the JSON response; verify
      `cleanup.server.test.ts` passes unmodified.

## 3. Tests still reach the code

- [x] 3.1 Break one line in a moved directed body and one in a moved digest body in turn, and confirm
      `notifications.server.test.ts` goes red for each; revert. Same for one moved sweep and
      `cleanup.server.test.ts`.
- [x] 3.2 Confirm the scan-limit test still lowers `DIRECTED_SCAN_LIMIT` (it fails if the binding was
      captured at load); record the result.

## 4. Verification sweep

- [x] 4.1 Over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server`
      for the route and entity tests, and `svelte-check` (beside a running dev server, per AGENTS.md).
- [x] 4.2 `npm run lint:duplication` and `npm run lint:unused`; accept moved clones into the baseline
      only if jscpd flags them, and say so in the hand-back.
- [x] 4.3 Drive the running stack: let the dev pg_cron jobs fire (every 30s) and confirm both routes
      return the same JSON shape as before with no new server errors; the app itself has no UI
      change, so the 375x667 and 1280x800 pass is a smoke check that the notifications inbox and
      badge still render.
