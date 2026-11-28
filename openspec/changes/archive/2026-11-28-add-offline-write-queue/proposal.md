# Proposal

## Why

A climber logs a send at the crag, usually where there is no signal. Today every write is refused while offline, so the ascent is lost or typed again later from memory. The native app (issue 1155) needs offline ascent logging before its release, and the PWA gets it with the same code. Issue 1148 asks for it on the PowerSync build: R1 (issue 1145) made that build write through `/api/sync/mutate` with write ids, which is the ground a queue needs.

## What Changes

- A generic offline write queue in the PowerSync build. A mutator opts in with two pieces, its optimistic local write and the form a refusal reopens, and must deduplicate on a key in its args. Everything else is shared and keyed by mutator name: queuing the write, sending it, sorting answers into "retry" and "refused", remembering refusals, the notice and the sign-out guard. Ascents are the first and only user in this change; other entities (crag edits, toggles) opt in later without new machinery.
- Logging an ascent goes through the queue, online and offline. The ascent shows at once wherever the climber's ascents show, marked "Not uploaded yet" until the server's copy arrives. Online, the form waits up to about 10 s for the server's answer so a refusal still lands on the form.
- A refused queued write is never lost silently. A notice under the status bar lists each refusal until dismissed and, when the form's subject is still on the device, offers to reopen the form with the values filled in. A write the server fails on three times in a row counts as refused, so one bad write cannot hold the device's sync.
- Signing out with writes still queued first tries to send them, then asks before discarding them.
- Ascents gain a client-made `uuid`, unique per ascent. A create sent twice, however late, makes one ascent. The ascents stream syncs that uuid as its PowerSync row id; the app's ids stay the serials.
- An ascent with photos attached is not queued: it is written online as today and refused offline. While offline the ascent form's photo picker is disabled with one line saying why.
- The Zero build (production until the cutover, issue 1149) is unchanged: its writes stay online-only.
- Not client-breaking: no URL, remote function export or `manifest.id` changes. `ascents.create` gains an optional argument (args only widen). Production builds Zero, so open tabs are unaffected; a PowerSync tab loaded before the deploy keeps writing online as before.

## Non-goals

- Offline photos and videos (the follow-up change: PowerSync's attachment queue behind our own transport, images everywhere, videos in the native app only, an unmetered-wifi gate later).
- Offline edits and deletes of ascents, and any other mutator joining the queue (toggles after the native release, crag edits later).
- Writes that refer to rows also created offline (a block in a new area): args may carry a client uuid there later, with server-side resolution in its own change.
- Editing or deleting a row before it uploaded.
- Moving primary keys from serials to uuids (its own change after Zero is removed).
- The native app itself and its airplane-mode check, which belong to the Expo app's change (issue 1147); the queue core is plain TypeScript so it can move into the shared package.
- Push or e-mail for refusals.

## Capabilities

### New Capabilities

- `sync/offline-writes`: which writes a PowerSync build keeps on the device until they can be sent, how they show before the server confirms them, what happens when the server refuses one later, how a queued create applies once however late, and what sign-out does with writes still queued.

### Modified Capabilities

- `sync/mutations`: "Writes are refused while disconnected" gains the exception for writes the offline queue takes.
- `sync/write-path`: "A PowerSync build sends every write to the write route" no longer refuses a queued write offline; it is sent later through the same route.

## Impact

- Entity module `src/lib/entities/ascent/` (`writes.ts`, `save.server.ts`, `dto.ts`, `mapper.ts`, `AscentRow.svelte`, `AscentFormFields.svelte`, new `queue.ts`), `src/routes/(app)/routes/[id]/ascents/add/+page.svelte` and the ascents list `src/routes/(app)/routes/[id]/ascents/+page.svelte`.
- `src/lib/state/pwa/wipe.ts` (clears the mirrored count of queued writes).
- `src/lib/zero/write.powersync.ts` (exported sender, queue routing), `src/lib/remote/mutation.ts` and `src/lib/zero/writeResult.ts` (the `queued` result, `direct`), `src/lib/forms/Form.svelte` (the queued toast), `src/lib/powersync/db.svelte.ts` (`uploadData`), `src/lib/powersync/schema.ts` and `scripts/generate-powersync-schema.ts` (local tables and columns), `src/lib/powersync/collections.ts`.
- New `src/lib/powersync/queue.ts` and `queueable.ts`; engine seam `src/lib/state/engine.ts` and `engine.powersync.ts`; new `src/lib/components/WriteOutcomes/` mounted in `src/routes/(app)/+layout.svelte`; the sign-out buttons in `src/routes/(app)/settings/+page.svelte`, `src/routes/(app)/regions/new/+page.svelte`, `src/routes/(landing)/invite/accept/+page.svelte` and `src/routes/(landing)/auth/profile/+page.svelte`.
- Table `ascents`: new `uuid` column (unique, not null, default `gen_random_uuid()`, backfilled). Drizzle migration, Zero and PowerSync schema regeneration.
- `deployment/powersync/sync-config.yaml`: the ascents query's row id becomes the uuid. Deployed through the VPS workflow before the app.
- i18n: new keys in `messages/en.json` and `messages/de.json`.
- `CONTEXT.md` (intent, queued write, not uploaded, refusal) and `AGENTS.md` (how a mutator opts in).
