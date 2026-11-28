# Tasks

Each slice is one red-to-green cycle at one agreed seam (design "Test seams", S1 to S8): write the test, run it and see it fail for the stated reason, then write only the code that makes it pass. No slice writes a test for the next one. Refactoring belongs to review, not to a slice.

## 1. Server: the ascent uuid (S1, S5)

- [x] 1.1 Schema: add `ascents.uuid` (uuid, not null, default `gen_random_uuid()`, unique) in `src/lib/db/schema.ts` with a column comment; agree the migration number across branches, then `generate:drizzle`, `generate:zero`, `generate:powersync`; verify the migration applies on a throwaway database (`ci/local.sh up`) and every existing row has a distinct uuid
- [x] 1.2 S1 red: in `ascent/mutators.server.test.ts`, a create with a non-uuid `uuid` is refused as invalid input. Green: widen `ascentActionSchema` with an optional zod `uuid`
- [x] 1.3 S1 red: two creates with the same uuid, the second after its write id was swept from `applied_writes`, make one ascent and one event and both answer its id. Green: `createAscentRow` inserts with `onConflictDoNothing` on `uuid` before any side effect and answers the existing id for the caller's own row
- [x] 1.4 S1 red: a create with another member's uuid is refused with the general failure message, writes nothing and its answer names nothing of that ascent. Green: refuse when the conflicting row's `created_by` is not the caller
- [x] 1.5 S1 red: a resend whose ascent exists, after its route was deleted, answers the existing id. Green: look up the caller's own row by uuid before the route and `canLogAscent` gates (#P10)
- [x] 1.6 S5 red: in `streams.server.test.ts`, an ascent comes out of the ascents stream with its uuid as row id and its serial as `nid`. Green: change the query in `deployment/powersync/sync-config.yaml` (`uuid AS id` beside `*`, or a column list if the evaluator refuses it); then confirm on the local PowerSync service (restart it to read the config)
  - Apply note (#P11): `parity.test.ts` feeds hand-built rows and proves nothing about the stream; it only has to keep passing.
  - Done: the evaluator accepts `uuid AS id` beside `*`. The live-service check moves to 5.1 (S8): the shared dev service reads the unmigrated dev database, which a worktree must not migrate.

S1 runs through both routes in CI, as every mutator test does.

## 2. Sender and queue core (S2, S3, S4, S6)

- Subtract first (before 2.1 and 2.4):
  - Drop the `offlineRejection` / `WriteRejection` re-exports from `write.ts` and `write.powersync.ts`; `src/lib/forms/store.svelte.ts` and `src/lib/forms/command.ts` import them from `$lib/zero/writeResult` (`command.ts` then no longer pulls the Zero client for a constant). Existing tests stay green.
  - `appSchema` stays synced-only: emit `mutations` and `write_outcomes` as a separate `localTables` export from `scripts/generate-powersync-schema.ts` and build the database schema once in `db.svelte.ts` from both, so `collections.ts`, `schema.server.test.ts`, `MarkerTable` and the `zeroShapes` check need no skip logic (#P8). Only the client-only `pending` column goes into `appSchema.ascents`, through a local-columns list in the generator. Verify `generate:powersync` emits them and `schema.server.test.ts` passes unchanged.

- [x] 2.1 S2 red: in `write.powersync.test.ts`, `deliver()` reports a 500 after its resends, and `write()` still reports the general failure and keeps the write id for a same-args retry. Green: export `deliver()`; change `arrive()` in place to return the last answer, 5xx included; `write()` treats `status >= 500` as no answer. No second sender
- [x] 2.2 S3 red: in `src/lib/powersync/queue.server.test.ts` (real `@powersync/node` database, fake sender), `enqueue` writes the optimistic row and one `mutations` intent in one `ps_crud` transaction. Green: `queue.ts` with `enqueue(db, entry, args)`
  - Apply note (#P9, #P22): `queue.ts` imports nothing from `$app`, `svelte`, `*.svelte.ts` or browser globals; the database, the sender, the account id, `refreshReads` and the count report are passed in. Running under Node in the server project is the check.
- [x] 2.3 S3 red: `uploadData` sends only the intent under its write id, records an `applied` outcome with the answer's data and completes the transaction. Green: the upload loop for the 2xx row
- [x] 2.4 S3 red: a refusal (any other 4xx, including 409) records a `refused` outcome with message and field, completes, and the next intent is sent. Green: the refusal row
- [x] 2.5 S3 red: no answer, a 502/503/504, a 429 and a 401 after renewal each throw and leave the intent and those behind it queued. Green: the hold row
- [x] 2.6 S3 red: an intent whose `uploadData` round ends in a 500 three times in a row becomes a `refused` outcome with the general failure message and the next intent is sent. Green: the per-intent 500 counter (#P15)
  - Apply note (#P18): while the app server answers gateway errors and the sync service is up, a device with a queued write also receives no reads; add this to the design's risks when the code lands.
- [x] 2.7 S3 red: the reported count of queued writes is 1 for one queued ascent (two `ps_crud` operations) and 0 once it is sent. Green: count `mutations` operations and report through the callback (#P1)
- [x] 2.8 S4 red: in `write.powersync.test.ts`, a queueable write offline resolves `{ queued: true }` without a request; with `direct: true` it is refused offline; a non-queueable write is still refused offline; online, a queueable write resolves with the server's data once its outcome appears within about 10 s. Green: `src/lib/powersync/queueable.ts`, optional `queued` on `MutationResult` (`src/lib/remote/mutation.ts`), `direct` on `WriteOptions` (`writeResult.ts`), routing in `write()`; `twins.test.ts` and typecheck pass
- [x] 2.9 S6 red: a browser test of `Form` whose submit resolves `{ queued: true }` shows the "saved on this device" toast and exits. Green: the queued branch in `src/lib/forms/Form.svelte`
- [x] 2.10 Wire: replace the no-op `uploadData` and its "Nothing writes to the local database" comment in `db.svelte.ts` with the queue's, passing `deliver`, `refreshReads` and `userId`; no new test (covered by S8 in 5.1)

## 3. Ascents join the queue (S3, mapper)

- Subtract first (before 3.1): fix `randomId()` (`src/lib/forms/randomId.ts`) so its insecure-origin fallback is a dashed v4 uuid, instead of a second helper (#P12); update the 32-hex regex in `write.powersync.test.ts` and see it red before the fix.

- [x] 3.1 S3 red: in `queue.server.test.ts`, enqueuing `ascents.create` with the ascent entry writes an `ascents` row with the client uuid as id, `pending` 1, a negative `nid`, the user and the route's region; `reopen` gives the add form's href while the route row is present and nothing once it is gone. Green: `src/lib/entities/ascent/queue.ts`, registered in `queueable.ts`; `createAscent` sends `randomId()` as `uuid`
- [x] 3.2 Mapper red: in `mapper.test.ts`, a row with `pending` 1 maps to `pending: true` and carries its `uuid`; a Zero row maps to `pending: false`. Green: the row shim, mapper and DTO; `parity.test.ts` still passes
  - Apply note (#P16): key `routes/[id]/ascents/+page.svelte`'s list by `uuid` (its `transition:fade` and `animate:flip` would fade the negative-to-serial swap); include that page in drive 5.2.
- [x] 3.3 UI (no seam test): the "Not uploaded yet" chip in `AscentRow.svelte` and, for such a row, no link, edit or delete but a "Waiting to upload" line; a story in `AscentRow.stories.svelte`; checked in Storybook and in drive 5.2
- [x] 3.4 UI (no seam test): `AscentFormFields.svelte` disables its media drop zone offline with one line; the add page passes `direct: true` when uploads are attached; checked in drive 5.2
- [x] 3.5 UI (no seam test): the add page seeds from a refused outcome when `?restore=` names one; checked in drive 5.2

## 4. Refusals and sign-out (S7)

- Subtract first (before 4.2): the `signOut.enhance` callback (`submit`, `tellOtherTabsSignedOut`, `wipeAndLeave(to)`) is copied in `(app)/regions/new`, `(landing)/invite/accept` and `(landing)/auth/profile`: move it into one helper in a new module (not `wipe.ts`, whose page-test mocks stay valid); the existing page tests stay green.

- [x] 4.1 Engine seam: refusals from `engine.powersync.ts` (none from `engine.ts`); the PowerSync caller of the queue mirrors the reported count into `localStorage` per account, clears it once in `deleteUnrefused` in `db.svelte.ts` (every account-file deletion passes there) and recounts when the database opens (#P19); the queue reads the account id from `db.svelte.ts`'s `userId`. Verify `twins.test.ts` and typecheck
- [x] 4.2 S7 red: the sign-out guard with a count of 0 signs out at once; with 1 it asks; "Sign out anyway" proceeds and Wait does not; under `(app)` it reads the live count and drains for up to about 5 s when online, on `(landing)` it reads the mirror (#P21). Green: the guard in the sign-out helper, used by all four buttons (`(app)/settings` before `disablePush()`, the other three through the helper)
  - Apply note (#P20): the `(landing)` pages carry no account id (no root `+layout.ts`; `invite/accept/+page.server.ts` returns only `sessionEmail`): pass `locals.claims.sub` in their page data, or read every count key with the app's prefix.
- [x] 4.3 UI (no seam test): `src/lib/components/WriteOutcomes/WriteOutcomes.svelte` on `Banner` (Open when `reopen` gives an href, Dismiss, `slide` with `motion(base)`) with a story, mounted under `StatusBar` in `src/routes/(app)/+layout.svelte`; checked in Storybook, the Zero build renders nothing
- [x] 4.4 i18n: keys in `messages/en.json` and `messages/de.json` (the chip, waiting to upload, saved on this device, photos need a connection, the notice and its actions, the sign-out confirm) through `/add-i18n-keys`; verify both files carry each key and no em-dash
- [x] 4.5 Docs: reword the AGENTS.md line and the CONTEXT.md "write route" entry that say every PowerSync write posts straight to `/api/sync/mutate`, and add opting in, the natural-key rule, that queueable mutators stay accepted while intents can wait, and the terms intent, queued write, not uploaded, refusal (not "pending"); verify against the code

## 5. Verification (S8 and drives)

- [x] 5.1 S8 red: in a local-stack test beside `streams.local.server.test.ts` (throwaway stack with its PowerSync service, a `@powersync/node` client connected with the real connector), an ascent enqueued while disconnected stays marked; after connecting, its row is replaced by the server's copy (serial `nid`, `pending` null) with no moment where the uuid is absent; a queued ascent for a deleted route disappears at the checkpoint and leaves a `refused` outcome. Green: fix whatever the earlier slices left wrong
- [ ] 5.2 Drive on the PowerSync build at 375x667 and 1280x800 (throwaway stack, own port): log an ascent offline, reload while offline (it stays, marked), go online (it uploads once, mark goes, no gap, also on the ascents list page); a refusal while offline (route deleted meanwhile) shows the notice with Dismiss only; a forced 500 three times shows the notice with Open, which reopens prefilled; photo picker disabled offline, and a photo then offline shows the offline cover; sign-out with one queued ascent from settings and from an invite for another address; check `ascents` and `applied_writes` in psql
  - Drive notes (2026-11-28, 375x667, throwaway stack `docs/stack1148.sh`, app `docs/app1148.sh`): offline log shows the ascent at once with the chip and the toast; online it uploaded once (one ascent, one event, one `applied_writes` row) and the chip went without the row leaving the list; a route deleted while offline gave the notice with Dismiss only (fixed during the drive: the reopen link is now recomputed at each checkpoint); three forced 500s gave the notice with Open, which reopened the form with the notes; Dismiss survives a reload; the photo picker is disabled offline with its line.
  - Open, this change (blocks this task): after an ascent queued ONLINE, the route page the form exits to stays unconfirmed (count hidden, "See all ascents") until a reload, with TanStack's "Subset demand ... aborted" in the console. Bisected on a production build in fresh browser profiles: a direct create is fine with serial and with uuid row ids; only the queued create (optimistic row, then the server copy swapped in, `nid` changing from negative to the serial in the lazy files join) sticks. Clean main does not do it. A list page already mounted during the swap is fine.
  - More driven (2026-11-28): 1280x800 (chip counted, refusal notice; the route page shows one row, and a pending ascent sorts after same-day ones by its negative `nid`); sign-out with a queued ascent asks "1 change ... Signing out deletes it", Cancel keeps the session; the closing dialog read "0 changes" (fixed: it keeps the last count); a photo attached then offline shows the offline cover and queues nothing (the offline hint dropped "saves without them", wrong in that case); production preview: reload while offline keeps the queued ascent marked, and back online it uploads once and the mark goes; Storybook: the notice and "Not uploaded yet" stories render.
  - Fixed during this drive: the Zero build did not start, because `leave.svelte.ts` value-imported `$lib/powersync/queue` (the Zero guard refuses it); the count now comes through the engine seam (`refreshQueued` answers it, 0 in Zero).
  - Design nit, open: at 1280 the refusal notice spans the window while the page content is a narrow column. A debug log showed the route ascents live query stuck at `isReady: false` after TanStack's "Subset demand ... failed: Load subset operation was aborted before its result became visible" (`syncRunGeneration` fence in `@tanstack/db` sync). A pre-existing PowerSync-build read bug, for its own fix.
  - Open (copy): the StatusBar still says "You're offline. Changes won't save." while ascents now do save offline.
  - Not driven yet: 1280x800, reload while offline (dev serves modules unbundled, so it needs a production preview), the photo-then-offline cover, sign-out with a queued write.
- [x] 5.3 Drive the ascent add form on the Zero build at both sizes and confirm it behaves as before
- [x] 5.4 Run the sweep over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser`, typecheck, `npm run lint:unused`, `lint:duplication`, `lint:health`; every new test was seen red (`npm run test:mutation -- --mutate src/lib/powersync/queue.ts` lists the survivors)

## Workflow follow-up

- Before archiving, run the issue-sync gate from the worktree root and archive only on "ready"; the archive commit subject ends "(closes #1148)".
- The native airplane-mode check belongs to the Expo app's change (issue 1147).
- The offline media change follows (PowerSync's attachment queue behind our own transport, images everywhere, videos in the native app only).
