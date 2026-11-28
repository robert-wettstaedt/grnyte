# Design

## Context

See proposal.md for why. The PowerSync build (R1, issue 1145) sends every write as one POST to `/api/sync/mutate` (`src/lib/zero/write.powersync.ts`), which runs the server mutator once per write id (`applied_writes`, kept 30 days, `syncMutate.server.ts`). Its connector's `uploadData` is a no-op (`src/lib/powersync/db.svelte.ts`), because nothing writes to the local database. Reads are PowerSync streams copied into TanStack collections behind the row shim (`toZeroRow`): the app's `id` comes from `nid`, the serial, and the PowerSync row `id` is free to be anything (`deployment/powersync/sync-config.yaml`, `scripts/generate-powersync-schema.ts`).

PowerSync facts this design rests on (installed `@powersync/web` 2.6.0, `@powersync/common` 2.5.0, and the PowerSync docs on handling write errors):
- The upload queue (`ps_crud`) is strict FIFO. When `uploadData` throws, the front transaction is retried after `retryDelayMs` (5 s) and everything behind it waits. A transaction is only removed by `complete()`.
- While `ps_crud` holds anything, the client applies no full checkpoint. Once it drains, the next checkpoint replaces local state with the server's: a local-only row in a synced table disappears, and a row the server made under the same `id` replaces it in place.
- `insertOnly` tables put every insert into `ps_crud` and keep nothing; `localOnly` tables keep rows and never upload. Columns the server does not send arrive as null.
- In multi-tab mode (desktop Chromium and Firefox) the shared sync worker calls `uploadData` in the last connected tab, not necessarily the tab that queued the write.
- No official intent-table recipe exists; this design composes the documented primitives. Default write checkpoints suffice because `/api/sync/mutate` commits before it answers.

Terms: an **intent** is a queued call of a mutator (its name, args and write id) waiting on the device; a **queued write** is the intent plus its optimistic local row; a write is **not uploaded** until the server's copy of its row reached the device.

Engine split: the Zero build (production until issue 1149) keeps `write.ts` unchanged apart from the shared result type. Everything below exists only in the PowerSync build, imported by `*.powersync.*` modules, so `zeroClientGuard` and the twins rule hold.

Reads stay what they are (PowerSync streams in this build, Zero queries in the Zero build). Writes stay mutators; the queue is a new way to deliver the existing `ascents.create` mutator to the same route. No remote function changes.

## Goals / Non-Goals

**Goals:**
- One generic queue that any mutator joins with a small entry; ascents are its first user.
- The queue core (enqueue, upload loop, answer mapping) is plain TypeScript with no Svelte or SvelteKit import: it takes the database and a sender as arguments, so the Expo app can take it from the shared package later.

**Non-Goals:**
- Server-side ordering checks (contiguous per-device ids).
- Resolving client uuids in args to serials (dependent offline writes).
- The attachment queue.
- Queueable mutators without a natural key (see section 2).

## Decisions

### 1. An intent row plus the optimistic row, in one local transaction

`enqueue(db, entry, args)` runs one `writeTransaction`:
- `entry.apply(tx, args)` writes the optimistic row into the synced table. For ascents: `ascents` with the client uuid (from the args) as `id`, `nid` a random negative integer, `created_by` the signed-in user's id, `region_fk` from the local route row, `pending` 1.
- An insert into `mutations` (`insertOnly`): `id` = the write id (uuid v4), `name`, `args` (JSON), `created_at`.

Both land in one `ps_crud` transaction. `uploadData` takes transactions with `getNextCrudTransaction()`, sends only the `mutations` op, and completes the whole transaction (the table op is never sent: the mutator is the authority). Then the checkpoint swaps or drops the optimistic row.

The negative `nid` keeps the DTO's `id: number` true for every row, makes list keys unique without touching their `each` blocks, and can never be a real serial. Nothing may link to it (section 5).

Alternatives: a local-only pending table merged into every reader (every reader changes); plain CRUD on `ascents` mapped to mutators in `uploadData` (no place for args that are not columns, such as a `known` fingerprint later); keying lists by uuid (four list files change and the DTO's `id` becomes nullable).

### 2. Opting in: a `queue` entry, looked up by the PowerSync `write`

`src/lib/powersync/queueable.ts` maps mutator names to entries; each entity contributes its own (`src/lib/entities/ascent/queue.ts` for `ascents.create`). An entry has two parts:
- `apply(tx, args)`: the optimistic local write.
- `reopen(args, tx)`: the href of the form a refusal reopens, or nothing when the form's subject is no longer on the device (the route of an ascent was deleted or left the stream).

A queueable mutator must deduplicate on a natural key carried in its args (for ascents, the uuid), because an intent may be sent after `applied_writes` swept its write id. Expiring intents for mutators without one is left until such a mutator wants to join.

`write()` in `write.powersync.ts` checks the registry first: a queueable mutation goes to `enqueue` and skips the offline refusal, unless the caller passes `direct: true`; every other mutation is unchanged. `writes.ts` and the screens call `write` as before. The client mutator definitions in `mutators.ts` keep their no-op bodies (Zero build).

`MutationResult` (`src/lib/remote/mutation.ts`) gains an optional `queued: true`, so `write.ts` and `write.powersync.ts` keep one type and `Fits<>` in `twins.ts` holds; `write.ts` never sets it. `WriteOptions` gains `direct`.

### 3. Sending: `uploadData` uses the write route's sender

`deliver()` in `write.powersync.ts` (resends with the same id, renews a refused token once, checks the session is this document's account) is exported and passed into the queue core as its sender; `uploadData` and `write` both use it, with the intent's id as write id. Today `arrive()` drops every 5xx answer, so `deliver()` cannot tell a 500 from a gateway error or a dead network: it changes to return the last answer it got, 5xx included, and `write()` keeps treating a 5xx as no answer, so direct writes behave as before. After an applied intent `uploadData` calls `refreshReads()` as `write()` does. Its answer maps as follows:

| Answer | Action |
| --- | --- |
| 2xx | outcome `applied` with the answer's data; `complete()` |
| no answer (network, timeout), 502, 503, 504, 401 after renewal, 429 | throw: the queue retries after 5 s, later writes wait |
| 500 as the last answer of three `uploadData` rounds in a row for the same intent (each round is one `deliver()` with its own resends) | outcome `refused` with the general failure message; `complete()` |
| any other 4xx (refusal, 400 unknown mutator, 409 foreign write id) | outcome `refused` with the message and field; `complete()` |

A 500 is the handler failing (`syncMutate.server.ts` rethrows anything that is not an `ApplicationError`), which repeats on every send; a gateway status is the server being away. The 500 counter lives in memory per intent id: a reload restarts it, which only costs three more sends. Without the cap one bad intent would hold every later write and, since no checkpoint applies while `ps_crud` holds anything, every read on the device.

`send()` throwing because the stored session belongs to another account also throws: the engine's leave-for-other-account path wipes the file.

### 4. Outcomes and the form's wait

`write_outcomes` (`localOnly`): `id` = write id, `name`, `args`, `status` (`applied` / `refused`), `message`, `field`, `data`, `created_at`. A watched query makes it reach every tab, which matters because the tab that runs `uploadData` may not be the tab whose form is waiting.

`enqueue` resolves when its outcome appears, after about 10 s, or at once when offline. On `applied` it returns the server's data like `write` does; on `refused` it throws the same `refusal` a direct write throws, so the form shows it; otherwise it returns `{ queued: true }`. `Form.svelte` handles a `done` result that is `queued`: a "saved on this device, uploads when online" toast, then its usual exit. A refusal arriving after the form finished stays for the notice. An `applied` outcome is deleted when its waiter has read it or after a minute; a `refused` one when dismissed.

With photos attached the ascent add page passes `direct: true`: the write is today's online-only write, refused offline and reported on failure, so `finalizeMediaUploads` always gets the serial id. `AscentFormFields` disables its `MediaDropZone` while `isOnline()` is false, with one line saying why; photos added before going offline keep the form on the direct path, so its offline cover shows as today.

### 5. Not-uploaded rows

`pending` is a client-only integer column on `ascents` in the PowerSync schema: the generator gains a short list of local columns per table, and `zeroShapes` maps it. `apply` sets it to 1; the server never sends it, so the server's copy arrives with null and the mark goes exactly when the swap happens. The ascent DTO gains `pending: boolean` (false in the Zero build). `AscentRow` shows a "Not uploaded yet" chip with the `cloud-off` icon and, for such a row, no link, edit or delete, but a "Waiting to upload" line. `ProfileView` and the route page already render `AscentRow`; counts and stats read the same rows, so they include these rows without change.

### 6. Server: the ascent uuid

`ascents.uuid`: `uuid` not null, default `gen_random_uuid()`, unique. Existing rows get theirs from the default when the column is added. `ascentActionSchema` gains an optional `uuid` (zod uuid). `createAscentRow` inserts with `onConflictDoNothing` on `uuid`, before any side effect; on a conflict it reads the row by uuid and answers its id when `created_by` is the caller, and refuses with the general failure message otherwise. Grade recalculation, accolades, the event and mentions run only for a new row. The handler keeps today's gates (the route exists, `canLogAscent`) under `asCaller`.

The ascents stream query becomes `SELECT *, uuid AS id, id AS nid ...`. Whether PowerSync accepts `uuid AS id` beside `*` (which also carries `id`) is checked with the sync-rules engine the repo already runs (`src/lib/powersync/evaluate.server.ts`, `streams.server.test.ts`); if not, the query lists its columns. Existing local stores see every ascent row change id once, a one-time resync of that bucket.

### 7. Refusal notice

`WriteOutcomes.svelte` (under `src/lib/components/`, built on `Banner`) sits under `StatusBar` in `src/routes/(app)/+layout.svelte`. It watches `write_outcomes` where `status = 'refused'`, lists each with its message, and offers "Open" when `reopen` gives an href (that href plus `?restore=<write id>`) and always "Dismiss" (deletes the row). It enters with `slide`, duration from `motion(base)`. The ascent add page seeds from the outcome's args when `restore` names one (through `Form`'s `seed`). It reaches the engine through the engine seam (`engine.powersync.ts` gives the outcomes, `engine.ts` gives none), so the Zero build renders nothing.

### 8. Sign-out guard

Every sign-out button goes through one guard: `src/routes/(app)/settings/+page.svelte`, `src/routes/(app)/regions/new/+page.svelte`, `src/routes/(landing)/invite/accept/+page.svelte` and `src/routes/(landing)/auth/profile/+page.svelte`. The engine runs only under `(app)`, so the guard cannot rely on an open database: the queue mirrors its count of queued writes (the `mutations` operations in `ps_crud`, one per write; `getUploadQueueStats().count` counts every operation, two per ascent) into `localStorage` under the account's id after every enqueue and every completed transaction, and the guard reads that. Under `(app)` with writes left and the device online, it waits up to about 5 s for the queue to drain; on `(landing)` pages nothing can drain. If writes remain, a confirm dialog ("1 change has not uploaded and will be lost") offers Wait or Sign out anyway. A session found signed out keeps today's wipe of the device, queued writes included. The Zero build never writes the count, so its guard always passes.

### 9. Conventions this adds

`AGENTS.md`: how a mutator joins the queue; that it must deduplicate on a natural key; and that a queueable mutator's name and args stay accepted for as long as an intent can wait (a device may send weeks later), stricter than the one-release rule. `CONTEXT.md`: "intent", "queued write", "not uploaded" and "refusal" in the engine seam section (not "pending", which already names a readiness state).

## Test seams

Tests live only at these public boundaries; each fakes at most the one collaborator named.

- **S1** `/api/sync/mutate` running `ascents.create` (the mutator test harness, both routes in CI): uuid dedupe, another member's uuid, a resend after the route was deleted, a malformed uuid. No fake.
- **S2** `deliver()` and `write()` in `write.powersync.ts`: a 500 reported after resends; `write()` still treats a 5xx as no answer. Fakes `fetch`.
- **S3** The queue core (`enqueue`, `uploadData`) on a real `@powersync/node` database: every row of the answer table, order, the three-500s cap, the reported count, the ascent entry's `apply` and `reopen`. Fakes the sender.
- **S4** `write()` routing in the PowerSync build: queued offline, `direct` refused offline, non-queueable refused offline, online answer within the wait. Fakes the queue.
- **S5** The sync-rules evaluator over `sync-config.yaml`: ascents carry the uuid as row id and the serial as `nid`. No fake.
- **S6** `Form` given a queued result (browser test): toast and exit. Fakes the submit function.
- **S7** The sign-out guard: asks only with queued writes, live count under `(app)`, mirror on `(landing)`. Fakes the count source.
- **S8** A `@powersync/node` client against the throwaway stack's PowerSync service: the optimistic row is swapped for the server's copy with no gap, and a refused row disappears at the checkpoint. No fake.

The chip, the notice, the photo picker and `?restore=` have no seam of their own: stories and the drives cover them.

## Risks / Trade-offs

- [The PowerSync upload loop runs only while connected to the sync service, so an outage of the service holds the queue even when the app server is up] → accepted; reads stall the same way, and the status bar shows it.
- [A mutator removed or narrowed while intents for it sit on devices] → the server answers 400, the outcome is a refusal the person sees; the AGENTS.md rule keeps queueable mutators accepted.
- [A 500 that is really an outage turns three queued writes into refusals] → their values stay in the notice and reopen into the form.
- [Browser storage eviction (iOS Safari: 7 days for an uninstalled site) deletes the queue with the store] → accepted, as for offline reads; `navigator.storage.persist()` is already requested.
- [A remote sign-out drops queued writes without a word] → accepted for lost and shared devices.
- [Stream id change resyncs every ascent row once on each PowerSync device] → small bucket; only preview and local devices run PowerSync before the cutover.
- [`apply` uses local data (the route row) that may be stale] → the server re-checks everything at apply time; a mismatch is a refusal.

## Migration Plan

1. Migration adding `ascents.uuid` (coordinate the number across branches before `generate:drizzle`), regenerate Zero and PowerSync schemas.
2. Deploy order: migration; stream config through the VPS workflow and reprocess; then the app. The Zero build ignores the new column.
3. Rollback: the app first (the PowerSync build returns to online-only writes; queued intents on devices that ran the new build stay in their `ps_crud` and freeze that device's sync until it updates again, so roll forward rather than back once a preview has queued writes); the stream config second; the column may stay.
