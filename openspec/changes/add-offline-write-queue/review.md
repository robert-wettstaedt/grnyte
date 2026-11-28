# Plan review: add-offline-write-queue

Status: stale (tasks.md restructured into TDD slices at seams S1 to S8 and design.md gained "Test seams", after the clean round 3)

## Rounds

- Round 1, snapshot `1339d5a7eca627408507b9ef5a63f6c49ea42971`: reader, grounding, security (all ran). 1 blocker, 5 major, 7 apply-note, 1 nit; all fixed or written as apply notes.

- Round 2, snapshot `c90d37c576526467428d2fccc65a677257959273`: reader (fresh), grounding, security (all ran). P2 reopened; 1 blocker, 1 major, 2 apply-note new; security clean.

- Round 3, snapshot `ddc6d6ae877a07ee93ef63c0d13022e2f32c4ea7`: reader (fresh), grounding, security (all ran). Clean: P2, P15 and P17 confirmed fixed; 4 apply-notes and 1 nit, no finding above apply-note.

### Round 3 paraphrases (reader)

**What this proposes:** Only the PowerSync build changes. A mutator that opts in (only `ascents.create` for now) is queued instead of sent: one local transaction writes an optimistic `ascents` row (row id the client uuid, a random negative `nid`, `pending` 1) and an insert-only `mutations` intent. `uploadData` sends each intent through the exported `deliver()`; each answer either holds the FIFO queue or becomes an outcome in `write_outcomes`, any other 4xx and a 500 ending three upload rounds counting as refused. Online the form waits about 10 s; later refusals show in a Banner-based notice with Dismiss and, while the route is on the device, Open. Writes with photos stay direct; the server deduplicates on `ascents.uuid`, synced as row id; all four sign-out buttons go through one guard reading a mirrored per-account count.

**How the existing system works, per this plan:** The PowerSync build POSTs every write to `/api/sync/mutate` with a client write id, and `applied_writes` makes a resend apply once for 30 days; `deliver()` resends and renews the token once, and its `arrive()` drops every 5xx. `uploadData` is a no-op. Reads are PowerSync streams in TanStack collections with the app id from `nid`. No checkpoint applies while `ps_crud` holds anything; in multi-tab mode `uploadData` runs in the last connected tab. The engine runs only under `(app)`, and each account's local file is wiped on sign-out or when another account takes over.

### Round 2 paraphrases (reader)

**What this proposes:** Only the PowerSync build changes. There, logging an ascent becomes a queued write: one local transaction writes an optimistic `ascents` row (client uuid as row id, a random negative `nid`, local `pending` = 1) and an insert-only `mutations` intent. `uploadData` sends each intent through the exported `deliver()` to `/api/sync/mutate`; each answer is either a retry that holds the FIFO queue or an outcome in the local-only `write_outcomes` table, with any other 4xx and three 500s in a row as refusals. Online, the form waits about 10 s; later refusals show in a Banner-based notice under the StatusBar offering Dismiss and, while the route is on the device, Open. Writes with photos stay direct; the server deduplicates on `ascents.uuid`, synced as row id; sign-out drains then asks. The Zero build is unchanged apart from an optional `queued` on `MutationResult`.

**How the existing system works, per this plan:** As in round 1, plus: in multi-tab mode `uploadData` runs in the last connected tab.

### Round 1 paraphrases (reader)

**What this proposes:** In the PowerSync build only, logging an ascent becomes a queued write. One local transaction writes an optimistic `ascents` row marked `pending` and an insert-only `mutations` intent. PowerSync's `uploadData` then sends the intent through the existing `deliver()` to `/api/sync/mutate`. Each answer becomes either "retry later" (FIFO, later writes wait) or a stored outcome in `write_outcomes`. A form waits about 10 s for that outcome. A refusal that arrives later shows in a notice under the StatusBar, which can reopen the form prefilled. Ascents gain a client-made `uuid` that the server deduplicates on and that syncs as the PowerSync row id. Sign-out tries to drain the queue, then asks before discarding. The Zero build is unchanged.

**How the existing system works, per this plan:** The PowerSync build POSTs every write to `/api/sync/mutate` with a client write id. `applied_writes` makes a resend apply once for 30 days. `uploadData` is a no-op because nothing writes locally. Reads are PowerSync streams copied into TanStack collections, and `toZeroRow` takes the app id from `nid` (the serial), so the PowerSync row `id` is free. While `ps_crud` is not empty, PowerSync applies no checkpoint; once it drains, a checkpoint drops local-only rows and replaces rows with the same id.

Both match the intent of issue 1148.

## Claim table

Round 1 (grounding): every claim about existing code holds except three, now fixed: "AscentRow keys by uuid" (keys live in the parent lists; the plan now uses a negative `nid` and leaves the keys alone), `schema.server.test.ts` passing unchanged after task 2.1 (it asserts exactly the synced tables; apply note on 2.1), and `getUploadQueueStats().count` counting queued writes (it counts every `ps_crud` operation; #P1). Missing before: `Form`'s handling of a queued result (now task 2.5). SDK claims hold: FIFO upload with a 5 s retry, no checkpoint while `ps_crud` holds anything, `insertOnly` and `localOnly`, `uploadData` in the last connected tab under the shared worker, outcome rows reaching every tab through the table-update broadcast, default write checkpoints. Not checked line by line: the wasm core's checkpoint replacement and null for unsent columns (documented behaviour).

## Findings

| # | raised by | file:line | severity | claim | status | reason/evidence |
| - | --------- | --------- | -------- | ----- | ------ | --------------- |
| P1 | grounding (blocker), reader (apply-note) | design.md:88 | blocker | `getUploadQueueStats().count` counts both `ps_crud` ops of one ascent, so the sign-out confirm says "2 changes" | fixed | design §8 counts `mutations` operations; task 4.1 tests that one ascent counts as 1 |
| P2 | grounding, reader | design.md:59, offline-writes spec:25 | major | a deterministic 500 retries forever and, with no checkpoint while `ps_crud` holds anything, freezes all sync | fixed (reopened round 2 by #P15, fixed again) | three 500s in a row become a refusal (spec requirement and scenario, design §3, task 2.3); gateway statuses still retry |
| P3 | grounding, reader | design.md:68,74 | major | `Form` has no queued branch; `queued` breaks `Fits<>` in twins.ts; list keys live in four parent files and two pending rows have null ids | fixed | optional `queued` on the shared `MutationResult`; task 2.5 for `Form`; a random negative `nid` keeps ids numeric and unique, so no list file changes (design §1) |
| P4 | reader | design.md:70, proposal.md:14 | major | photos on the queue: `wait: 'answer'` spins forever, and a queued result skips `finalizeMediaUploads` and orphans the photos | fixed | with uploads attached the write is `direct` (today's online-only path); new spec requirement with two scenarios; task 3.4 |
| P5 | reader | offline-writes spec:78-81 | major | reopening a refusal for a deleted route lands on "Route not found" | fixed | `reopen` gives nothing when the route left the device, so the notice offers Dismiss only; the reopen scenario uses a route that still exists |
| P6 | reader | design.md:44-46 | major | `lasting`, the 29-day path and `creates` have no user; `ids` undefined | fixed | removed; a queueable mutator must deduplicate on a natural key (design §2, AGENTS.md in task 4.5) |
| P7 | reader | proposal.md:41 | apply-note | edit and delete screens cannot be reached for a not-uploaded ascent | fixed | line removed |
| P8 | grounding, reader | tasks.md:12 | apply-note | local tables break `schema.server.test.ts`, `collections.ts` and the `zeroShapes` check; notice should build on `Banner` | apply-note | note on task 2.1; design §7 names `Banner` |
| P9 | reader | design.md:21,54 | apply-note | plain-TS core conflicts with reusing `deliver()` from a module that imports runes; `refreshReads()` after an applied intent | fixed | sender and refresh passed in (design Goals, §3); apply note on task 2.3 |
| P10 | security | design.md:78 | apply-note | a resend after the route was deleted is refused before the uuid lookup, though the ascent exists | apply-note | note on task 1.3 |
| P11 | grounding | tasks.md:9 | apply-note | `parity.test.ts` proves nothing about the stream id | fixed | task 1.4 verifies through `streams.server.test.ts` / `evaluate.server.ts`; note on 1.4 |
| P12 | security, reader | design.md:78, tasks.md:20 | apply-note | `randomId()`'s insecure-origin fallback is not a uuid, so `z.uuid()` would refuse every queued ascent there | apply-note | note on task 3.1 |
| P13 | grounding, reader | design.md, tasks.md:44, .openspec.yaml | apply-note | decision refs and `docs/` cited from the plan; "intent" and "lasting" undefined; "pending" collides with CONTEXT.md; x-paths and Impact miss files; sign-out is a button, a second one is unguarded | fixed | refs removed; Terms paragraph in design Context; CONTEXT.md task avoids "pending"; x-paths and Impact list the files; task 4.3 guards both buttons |
| P15 | grounding | design.md:60-69, tasks.md:16 | blocker | `arrive()` drops every 5xx, so `deliver()` cannot report a 500 apart from a gateway error and the three-500s cap never fires; "three times" ambiguous | fixed | `deliver()` returns the last answer including 5xx, `write()` still treats 5xx as no answer (design §3, task 2.2 with a new red test); the cap counts three `uploadData` rounds |
| P16 | grounding | routes/[id]/ascents/+page.svelte:162 (code) | apply-note | that list keys by `ascent.id` with `transition:fade`, so the negative-to-serial swap fades two rows | apply-note | note on task 3.2 (key that list by `uuid`, drive it in 5.1) |
| P17 | reader | design.md:97, tasks.md:36 | major | two more sign-out buttons (`(landing)/invite/accept`, `(landing)/auth/profile`) wipe the queue without asking, and the engine is not running there | fixed | design §8: every sign-out goes through one guard that reads a per-account count the queue mirrors into `localStorage`; task 4.1 mirrors it, task 4.3 guards all four and drives the invite case |
| P18 | reader | design.md:105 | apply-note | a down app server with a live sync service also freezes reads on a device with a queued write | apply-note | note on task 2.3 |
| P19 | grounding, security, reader | design.md:97, tasks.md:36 | apply-note | nothing clears the mirrored count after a wipe, so a later sign-out asks about writes that are gone | apply-note | note on task 4.1 (clear in `wipeDeviceData` and `dropAccount`, recount on open) |
| P20 | grounding | design.md:97 | apply-note | `(landing)` pages carry no account id to key the count by | apply-note | note on task 4.3 |
| P21 | security | design.md:97, tasks.md:36 | apply-note | the mirror can read 0 while a write is queued, so the guard skips asking | apply-note | note on task 4.1 (live count under `(app)`, recount on open) |
| P22 | reader | design.md:24,97 | apply-note | writing `localStorage` from `queue.ts` breaks the plain-TS goal | apply-note | note on task 4.1 (count through a callback) |
| P23 | reader | proposal.md:41-43 | nit | Impact misses the ascents list page and `wipe.ts` | fixed | both listed; `wipe.ts` added to x-paths |
| P14 | reader | offline-writes spec:44 | nit | offline the route page shows no count, so "their count includes it" cannot be observed there | fixed | removed from the scenario; the requirement keeps counts |
