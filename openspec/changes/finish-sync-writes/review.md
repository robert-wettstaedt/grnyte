# Plan review

Status: clean

## Rounds

- Round 1, snapshot `12a14a9fe84e1bc855e0d35243e65eb6ff4acc23`: reader, grounding, both on Opus, both reported. Not clean.
- Round 2, snapshot `c1deea7eb55518a73cdc1501db5a0b12d6e88609`: reader (fresh), grounding (resumed), both on Opus, both reported. P1 to P6 confirmed. Not clean.
- Round 3, snapshot `aa0360f9fce6f4db81113f9b07ba88f9661feefc`: reader (fresh), grounding (resumed), both on Opus, both reported. Every `fixed` row confirmed; only nits and apply notes. Clean. The nits were fixed after the round (P15 to P17), not reviewed again.
- After round 3 (user, 2026-11-26): D4's drive scope kept as planned (Zero build: edited screens plus a smoke set; most PowerSync writes at one viewport). Recorded in D4, not reviewed.
- Subtract pass (user, 2026-11-26), not reviewed: the helper shows a failed write's error itself, so its callers drop their catch; the ShareSheet and SettingSwitch component tests are dropped (they re-tested the helper through wiring; the drive checks them, the push device switch added to 5.2); task 2.2 dropped (the replay case exists in `syncMutate.server.test.ts`); task 4.1 narrowed to the one AGENTS.md line; `CONTEXT.md` and the dropped test files left `x-paths`. The user accepted these edits without another round.
- TDD pass (user, 2026-11-26): the seams under test agreed and written at the top of tasks.md, with the one-case-at-a-time loop; tasks 1.1 and 2.1 reworded to match. No scope or behaviour change; not reviewed.
- Coherence pass (`/opsx:update`, 2026-11-26): proposal Impact names the AGENTS.md line; D1 says the two components get no tests of their own. Round 4 reviews everything since round 3 (user asked for a review of these edits).
- Round 4 (user), snapshot `bddbc39cdbde884badf639e454ea11f4ed777e48`, limited to `aa0360f9..bddbc39c`: reader (fresh), grounding (resumed), both on Opus, both reported. P4 and P15 to P19 confirmed; only apply notes (P20 to P23). Clean.
- Rebase onto develop `e4262150` (user, 2026-11-27), not reviewed: 1180, 1181 and 1182 merged. 1182 had rewritten "Toggles apply instantly" (reactions shown at once, a file's visibility exempt on PowerSync); the mutations delta now carries that text, drops the exemption, and moves the synced-row and order rules into a new requirement. The write-path id rule became its own ADDED requirement (both had passed 500 characters, which strict validation now refuses), so "A PowerSync build sends every write to the write route" is no longer modified. Proposal and design say reactions keep 1182's own overlay. None of the code files the plan edits changed on develop.

## Paraphrases

Round 1, reader:

> **What this proposes.** Finish the PowerSync build's writes (issue 1179): move the favorites twin's "show the wanted value until the synced row agrees" logic into a shared `createWanted` helper in `$lib/state/` and use it in the file visibility switch and the notification setting switches, so toggles stay where tapped until the row syncs down. In `write.powersync.ts`, remember the write id of a write that ended without a server answer, keyed on mutator name plus JSON args, and reuse it when the identical write is sent again in the same tab, so a committed-but-unanswered write is not applied twice. Add a CI step that reruns every test using `zeroClient` with `MUTATE_ROUTE=sync`, and drive every write screen on the PowerSync build plus a smoke set on Zero.
>
> **How the existing system works, per this plan.** In the PowerSync build every write goes through `write()` to `/api/sync/mutate` with a fresh random write id per call; `arrive()` resends the same body under that id twice (0.3 s, 1 s) before throwing the offline or general failure. The server claims the id in the write's transaction (`applied_writes`), answering the stored result for the same caller and mutator, and keeps no id for a rolled-back write. The device sees the change only when PowerSync syncs the row down about a second later, so toggles jump back; favorites already hide this in their twin with a wanted value and a write counter. Tests write through `zeroClient`, which goes through `handleSyncMutate` only when `MUTATE_ROUTE=sync` is set by hand; CI runs `npm test` once.

Round 2, reader:

> **What this proposes.** Finish the PowerSync build's writes (issue 1179) in three parts. The favorites twin's "show the wanted value until the synced row agrees" logic (a wanted value, a write counter, and an effect that drops it once the read agrees) moves into a shared `createWanted` helper in `$lib/state/`. Favorites, every `isPublic` reader in ShareSheet (with `disabled` removed and a `slide` added on the link block) and SettingSwitch use it. Toggles then hold the tapped state until the row syncs down. `write.powersync.ts` gets a one-write slot. It holds the key and id of the last write that ended without an answer. The very next write reuses that id only if it is the identical write, and any other write empties the slot. CI reruns `--project server src/lib/entities src/lib/remote` with `MUTATE_ROUTE=sync`. Every write screen is driven on the PowerSync build, plus a smoke set on Zero.
>
> **How the existing system works, per this plan.** In the PowerSync build, `write()` checks that the device is online. It then POSTs to `/api/sync/mutate` under a fresh `randomId()` and resends the same body twice (after 0.3 s and 1 s) before throwing the offline or general failure. The server claims the id in the write's transaction, answers a repeat of the same caller and mutator with the stored result, and keeps no id for a rolled-back write. The device sees the row only after PowerSync syncs it down about a second later. Favorites already cover that gap. ShareSheet's switch is controlled and greyed while saving, so it moves only when the row lands, and SettingSwitch's writable derived flickers on two quick taps. Tests write through `zeroClient`, directly or through `useMaintainerRegion`. They use the write route only when `MUTATE_ROUTE=sync` is set, and CI runs `npm test` once.

## Claims

Round 1, grounding: every claim holds except two, both fixed: the ShareSheet switch does not move on the tap at all (zag keeps no tapped value while `checked` is controlled), and the writing tests are not all found by a grep for `zeroClient`. Not checked: whether uploads re-stage files on a retry (then their arguments differ and no id is reused).

## Findings

| # | raised by | file:line | severity | claim | status | reason/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | reader, grounding | design.md:48, write-path spec.md:5 | blocker | the id is stored at the start, so a toggle repeating a value in flight reuses an id, and A then B then A after a failure replays a stale result | fixed | `syncMutate.server.ts:46-49` answers by name only; D2 now one slot, filled only after `arrive()` throws, emptied by every write; spec reworded, scenarios "Undo in between" and "Quick taps"; task 2.1 cases |
| P2 | reader, grounding | design.md:60, tasks.md:19 | blocker | the grep misses the six `useMaintainerRegion` suites and matches `vite.sync-engine.test.ts` | fixed | `testRegion.ts:24`; D3 runs `--project server src/lib/entities src/lib/remote`, 1177's set; Context corrected |
| P3 | grounding | design.md:9 | blocker | the ShareSheet switch never moves on the tap; it does not go back | fixed | zag `bindable.svelte.js:7,21`; Context corrected |
| P4 | reader, grounding | design.md:39 | major | the link block and the trigger dot still read the row; the `{#if}` has no transition | fixed | `ShareSheet.svelte:100,108,147`; D1 reads `value` everywhere (the link shows from the tap, as in the Zero build today), `slide` added; task 1.3 |
| P5 | reader | mutations spec.md:5 | major | the requirement keeps "reacting" while this change leaves reactions unmet on PowerSync | fixed | the added sentence covers toggles on synced rows only; design Non-Goals names the pre-existing gap |
| P6 | grounding | tasks.md:8 | major | dropping the counter cannot turn the favorites tests red | fixed | task 1.2 adds a case that depends on the counter, seen red first |
| P7 | reader | tasks.md:9 | apply-note | ShareSheet test has no red step | apply-note | task 1.3 |
| P8 | reader | design.md:10 | apply-note | the push device switch also uses SettingSwitch | apply-note | task 1.4; Context names it |
| P9 | grounding | tasks.md:20 | apply-note | `favorites.set` answers nothing, so its red step stays green | apply-note | task 3.2 uses `areas.create` |
| P10 | grounding | tasks.md:14 | apply-note | module state leaks between test cases | apply-note | task 2.1 |
| P11 | grounding | design.md:49, write-path spec.md:5 | major | a write begun while the unanswered one is still being resent does not stop the id going back into the slot, so save, unsave (answered), save replays | fixed | D2 counts writes begun and refills the slot only if none began since; spec and scenario "Undo while the first write is still being resent"; task 2.1 case |
| P12 | grounding | tasks.md:22, design.md:84 | major | 1177's 151 counted every project, so it cannot be the baseline for `--project server` | fixed | task 3.1 compares with a plain run of the same command; Risks line |
| P13 | reader | write-path spec.md:42, design.md:82 | major | taps on one toggle are separate fetches with resends and can commit out of order; the helper then shows the wrong state for good | fixed | `write.powersync.ts:42-52`; D1 chains each helper's writes; mutations spec requires order; the write-path scenario keeps only the ids; task 1.1 case |
| P14 | reader | design.md:49 | apply-note | taking the slot before the offline check empties it on an offline refusal | fixed | D2 takes it after the check; task 2.1 case |
| P15 | reader, grounding | write-path spec.md:49 | nit | under D1's chain one favorite cannot unsave while its save is resent, so the scenario cannot happen as worded | fixed | scenario now a form's save and a favorite |
| P16 | reader | tasks.md:7 | nit | "the first persist answered last" cannot happen under the chain | fixed | task 1.1 reworded: the second `persist` waits |
| P17 | reader | design.md:31, design.md:82 | nit | "unchanged in behaviour" contradicts the new write order | fixed | D1 and Risks name the change |
| P18 | grounding | design.md:35 | apply-note | a send abandoned after 15 s may still commit after the next | apply-note | task 1.1 |
| P19 | reader | design.md:50 | apply-note | the account-mismatch refusal inside `arrive()` is not "no answer" | apply-note | task 2.1 |
| P20 | grounding, reader | design.md:44, tasks.md:10 | apply-note | with the ShareSheet test dropped, nothing checks the sheet on `/f/[id]` (remote function, `visibilityOverride`) | apply-note | task 5.2 |
| P21 | reader | tasks.md:7, tasks.md:15 | apply-note | several cases are green when written, so "each case drives the slot" is false and they need a named red edit | apply-note | task 2.1, sentence reworded |
| P22 | reader | tasks.md:26 | apply-note | CONTEXT.md's "write id" entry does describe the spot D2 changes | apply-note | task 4.1; CONTEXT.md back in x-paths |
