# Design

## Context

See proposal.md for why. The code facts this design rests on (read 2026-11-26 at `60a29e67`):

- Six client mutator bodies apply locally in the Zero build (`reaction.toggle`, `favorite.set`, `file.setVisibility`, `notification.markFeedSeen`, `notification.markRead`, `user.updateSettings`). In the PowerSync build every write goes through `write()` in `src/lib/zero/write.powersync.ts` to `/api/sync/mutate`, and the device sees the change only when PowerSync syncs the row down, about a second after the server's answer.
- Favorites already cover that gap in their PowerSync twin, `src/lib/entities/favorite/save.powersync.svelte.ts`: a `wanted` value keyed to the entity, a `writing` counter held while writes are out (so a second tap is not judged against a stale read), `unsynced` shown until the read agrees, an effect that drops `wanted` once it does, and a revert plus `notifyError` on failure. Its tests are `save.powersync.svelte.test.ts`.
- File visibility: `src/lib/components/Media/ShareSheet.svelte` renders Skeleton's `Switch` with `checked={file.visibility === 'public'}` and `disabled={saving}` during the write. The switch is controlled (zag keeps no tapped value while `checked` is defined), so in the PowerSync build it does not move on the tap at all: it stays private and greyed through the write and moves once, when the row syncs down about a second later. The trigger's dot and label and the `{#if isPublic}` link block read the same row, and the link block has no transition. The same component runs on `/f/[id]` with the remote function `setFileVisibility` and `onVisibilityChange` updating that page's own copy of the file.
- Settings: `src/routes/(app)/settings/SettingSwitch.svelte` (the six notification switches, and the push device switch, whose `onchange` enables or disables push on this device rather than writing a synced row) holds `let value = $derived(checked)`, sets it on tap and reverts it on failure. It shows the tap at once in both builds, but two quick taps flicker in the PowerSync build: the first write's row arrives, `checked` changes, the writable derived resets to it, then the second row arrives. The grading scale and unit selects on `settings/+page.svelte` hold page state seeded once and are not affected; other screens read the grading scale from the synced user row.
- Reactions and read marks read through the app server (`source.powersync.svelte.ts`), not the synced store. 1182 and 1181 (merged 2026-11-26) handled them: `Reactions/toggle.svelte.ts` keeps its own tapped emoji over the read, with a `busy` guard. The main `sync/mutations` requirement "Toggles apply instantly" now says the PowerSync build shows a file's visibility only once the server's row arrives; this change replaces that sentence.
- `write()` makes a new id per call (`randomId()`, line 49). `arrive()` resends one body under one id after 0.3 s and 1 s, then throws `offlineRejection` or the general failure (`error_server_title`, "Something went wrong on our end"). The server claims the id inside the write's own transaction (`applied_writes`, archived 1177 design D2): same caller and same mutator answer the stored result.
- `zeroClient` in `src/lib/remote/testHarness.ts` sends through `handleSyncMutate` when `MUTATE_ROUTE=sync`. Tests write through it directly or through `useMaintainerRegion` (`src/lib/remote/testRegion.ts`, the merge and move suites); all of them live under `src/lib/entities` and `src/lib/remote`. 1177 ran the entity and remote suites that way once with no difference (its task 1.7). CI's `Run tests` step runs `npm test` once.

## Goals / Non-Goals

**Goals:**

- One implementation of "show what was asked for until the synced row agrees", used by every toggle on synced data.
- The Zero build behaves as today. Its code changes only in `ShareSheet.svelte` and `SettingSwitch.svelte`, and there the helper finds the row already agreeing after the tap.

**Non-Goals:**

- See proposal Non-goals. Design-level: no change to `createFormStore`, no new message, no change to the server.
- Reactions: their overlay (1182) stays as it is, not moved onto the helper. It merges the emoji into the chips, takes the server's answer as the held emoji and swallows a refusal without a toast (the main spec's exception), so the helper would fit it only with options nobody else needs.

## Decisions

### D1. One helper for a value the device has not seen yet

New `src/lib/state/wanted.svelte.ts`: `createWanted<T>(read: () => T, key: () => string)` returns `{ value, unsynced, set(next, persist) }`. It is the core of the favorites twin moved out, plus one change in behaviour, the write order (last bullet):

- `value` is `unsynced ?? read()`. `unsynced` is the wanted value while it belongs to the current `key()` and either a write is out or the read still disagrees.
- `set(next, persist)` records `next`, counts the write as out, awaits `persist()`, and on a throw drops `next` if it is still the latest wanted value and shows the error through `notifyError`. Every caller showed it that way, so none keeps a catch of its own.
- `set` runs `persist` after the previous `persist` of the same helper has settled (one promise chain per helper), so taps on one toggle reach the server in the order they were made. Without that, off, on, off sent as three fetches with resends can commit as off, off, on, and the helper would show off for good: no write out, the read says on, `unsynced` never clears. The wait is invisible, because `value` shows each tap at once. This is new against the favorites twin, which has the same gap today; Zero orders a client's writes itself.
- An effect drops the wanted value once `unsynced` is gone, so a later change from another device is not hidden.

Users:

- `favorite/save.powersync.svelte.ts` keeps its `count` arithmetic (it needs `unsynced` against `favorited.data`) and delegates the rest; its existing tests must pass unchanged.
- `ShareSheet.svelte`: `createWanted(() => file.visibility === 'public', () => file.id)`; everything that read `isPublic` reads `value` instead: the switch, its status line, the trigger's dot and label, and the link block. The link therefore shows from the tap, as it does in the Zero build today, and goes again if the write fails. The link block gets a `slide` transition (AGENTS.md, conditional UI toggled on a press), with the `duration` the component already derives. `saving` and `disabled` go: the counter is what keeps a second tap honest, as on favorites. Both builds and `/f/[id]` take the same code; on `/f/[id]`, `onVisibilityChange` still updates that page's copy, which then agrees.
- `SettingSwitch.svelte`: replaces its writable derived and its try/catch revert with `createWanted(() => checked, () => label)`. This removes the double-tap flicker.

ShareSheet's share wiring (share data, `canShare`, copy, share) was a copy of ShareButton's; both now take it from `createShare` beside `createCopyButton` in `$lib/state/clipboard.svelte.ts`, which removes the clone the duplication baseline listed instead of re-keying it (user, 2026-11-27).

ShareSheet and SettingSwitch get no tests of their own: they only hand the helper a read, a key and a write, and the helper's tests carry the behaviour. The drive checks them on both builds (D4).

Location: `$lib/state/`, beside the other reactive helpers (`now`, `visible`, `online`); not under an entity, because three entities and two later packages use it.

Alternatives: a few lines inside `ShareSheet` only (a second copy of the counter logic, which is the part easy to get wrong); a PowerSync-only twin of `ShareSheet` (twins are modules, not components, and the Zero build would gain nothing from staying byte-identical here). Chosen by the user on 2026-11-26.

### D2. A failed write keeps its id for the same write

In `write.powersync.ts`, one module-level slot, `unanswered`: the key (`name` plus `JSON.stringify(args)`) and id of the last write that ended without an answer, plus a count of writes begun. Every `write()` that passes the offline check counts itself as begun and takes the slot, emptying it: when its key matches, it sends under that id, otherwise under a new one. Only when `arrive()` throws because no answer arrived, and no other write has begun since this one did, does the write put its key and id back into the slot. A write refused offline before sending leaves the slot alone. An answered write (success or any 4xx, including a second 401) leaves the slot empty.

So an id is reused only when the unanswered write was the last write the tab began and the next write is that same write. Any other write begun in between (an undo, another field, another toggle), whether before or after the failure was reported, keeps the id out of the slot or empties it, so A, then B, then A sends the second A under a new id, also when B was answered while A was still being resent. Two writes in flight at once never share an id: the slot holds an id only after its write has ended.

Why this is safe: the server binds an id to one caller and one mutator, and a write that rolled back keeps no id (1177 D2), so a reused id either returns the stored result of a committed write or runs the write for the first time. The stored result is the right answer only while nothing else changed the row in between, which the tab cannot see for a write made elsewhere (another device, `/f/[id]`'s remote function); then a reused id would answer the old result and apply nothing, and a toggle would show its tap for good. So the slot is also emptied when the row may have moved (code review, user 2026-11-27): it expires 60 s after its write ended (a real retry follows the error within seconds), and `forgetUnanswered()`, exported by `write.powersync.ts` and as a no-op by `write.ts`, empties it, which `createWanted` calls when it mounts (the row may have changed while nothing watched it) and whenever its synced read changes. A forget also counts while the write is still being resent: a write that ends unanswered after one keeps no id. A forget costs a pending retry its id: harmless for a toggle, but a create or delete retried after one may apply twice, the case this decision exists for. So the forget fires only when a toggle mounts or its value really changes, which on a form screen is rare. A form has no synced read, so for it only the 60 s apply. An account switch reloads the document (1177 D5), which empties the slot.

Why here and not in the form store: it covers forms, creates, deletes and toggles alike with one edit to the one function every write passes; `createFormStore` is shared with the Zero build, which has no write id.

Limits, accepted: the slot lives as long as the tab (a reload starts fresh; keeping writes across reloads is issue 1148); it holds one write, so a retry after some other write gets a new id, which is today's behaviour; arguments serialized in another key order count as another write.

Alternative: one id per form mount, renewed on a field change (needs every form and `forms/command.ts` to carry it, and leaves deletes and toggles out).

### D3. CI runs the writing tests through the write route

One step in `.github/workflows/ci.yml` after `Run tests`, with `MUTATE_ROUTE: sync`: `npx vitest run --project server src/lib/entities src/lib/remote`, the set 1177 ran by hand (its task 1.7). Every test that writes through `zeroClient`, directly or through `useMaintainerRegion`, lives there; a grep for the name would miss the second kind. The server project only, because the browser tests there never write. Its own step, so a failure names the route.

Alternatives: a file list from `git grep zeroClient` (misses the six suites that write through `useMaintainerRegion`, and matches `vite.sync-engine.test.ts`, which never writes); a vitest project with the variable set (a third project definition for the same files); the whole suite twice.

### D4. The drive

Every write the app makes, on the PowerSync build, from the screen that makes it (task 5.1 lists them by screen). Each at one viewport, alternating 375x667 and 1280x800. The full matrix (375x667 and 1280x800, en and de, light and dark) runs on a set that covers each kind of answer: the three toggles, a form with a field error, a create, a delete with its undo, the offline message, and the general failure while online. On the Zero build, the screens this change edits (share sheet, notification settings) and one form, one create, one delete as a smoke check, at both viewports.

While driving, two known points from 1177 are checked and recorded: an account switch logs one error only on a slow clear (accepted in 1178's D10), and "Something went wrong on our end" is the message for a write that never reaches the server while online.

The issue's done line says every write screen on both builds. The Zero build's write path does not change here (D1's two components aside), so this plan drives it as above, and drives most writes at one viewport only (user, 2026-11-26).

### D5. Archive in the pull request

The change is archived inside the pull request's branch before the merge, in a commit whose subject ends "(closes #1179)", as 1177 and 1178 did.

## Risks / Trade-offs

- [The helper changes the favorites twin's behaviour] → Its existing tests run unchanged against it and task 1.2 adds one seen red first; the one intended change, the write order, is tested on the helper (task 1.1).
- [ShareSheet without `disabled` sends two writes on a double tap] → Each carries its own id (D2 reuses only an ended write's id), the helper sends them in order (D1), and the server ends in the last state.
- [A reused id answers a stale result for a write the person meant to make twice] → Only after a reported failure and with identical arguments; the person sees success for what is on screen, and the server holds it once. A second identical comment typed on purpose after a failure is the case that gets merged into the first; accepted.
- [The CI step misses a writing test] → Task 3.1 compares the step's file and test counts with a plain run of the same command, and task 3.2 sees the step fail on a mutator that answers differently.
- [CI time] → Task 3.1 records how long the step takes.

## Migration Plan

Nothing to migrate: no table, no route, no remote function. Merge to `develop`; production builds Zero. Rollback: revert the merge.
