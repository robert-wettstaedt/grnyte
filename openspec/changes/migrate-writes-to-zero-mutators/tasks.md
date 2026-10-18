# Tasks

Every group is one commit on `feature/zero-mutators`. An entity group moves each handler body into
`<entity>/*.server.ts` (design 2), adds the client and server mutator defs (design 1), adds the entity's `writes.ts` functions and
switches the callers to them (design 10), and adds tests of its mutator path through `zeroClient` (design 9). The
remote functions stay as one-line callers. "Seen red" means the named production edit was made,
the test failed, and the edit was reverted.

## 1. Foundation

- [x] 1.1 Land the Zero 1.11 bump (`@rocicorp/zero`, the three `rocicorp/zero` image pins) and verify `npm ls @rocicorp/zero` shows one deduped copy and `mutate.server.test.ts` passes
- [x] 1.2 Split the spike registry into `favorite/mutators.ts`, `favorite/mutators.server.ts`, `route/mutators.ts`, `route/mutators.server.ts`, aggregated in `src/lib/zero/mutators.ts` / `mutators.server.ts` like `queries.ts`; verify the mutate tests still pass and `svelte-check` is clean
- [x] 1.3 Add `asPrivileged` beside `asCaller` (pinned `search_path`, no `applyRls`, same error mapping); verify with harness tests that a write RLS refuses as the caller commits privileged, and rolls back with its mutation while `lastMutationID` still advances, seen red by switching `asPrivileged` to `app_writer`
- [x] 1.4 Pin the spike's per-mutation `afterCommit` handling (dropped for a mutation whose result is an error, the rest drained before answering) with a harness test that a refused mutation runs none of its deferred work, seen red by draining unconditionally
- [x] 1.5 Extend `src/lib/remote/gates.test.ts` to scan server mutator defs (`mutators.server.ts`) with the same `GATES` set and written exemptions; verify it is seen red with the gate hidden in `favorites.set`
- [x] 1.6 Add `ZERO_MUTATE_URL` and `ZERO_ENABLE_CRUD_MUTATIONS=false` to `deployment/docker-compose.zero.yml`; verify `docker compose -f deployment/docker-compose.zero.yml config` renders both
- [x] 1.7 Replace "Never Zero mutators" in AGENTS.md and `openspec/config.yaml` with the mutator rules (toggles instant, everything else awaited, one body two callers, privileged mutators name a gate) and the deploy-skew rule (arguments only widen within a release; deploy zero-cache, then app); verify by reading both files back

## 2. Return values and the command adapters

- [x] 2.1 Make `routes.update` return `{ id }` and prove in the harness where Zero 1.11 stores the value (its shard `mutations` table, inside the transaction, refused to `app_writer`): switch the role back after the body, and scrub every unauthored error message in `handleMutate`; both seen red
- [x] 2.2 Add `write(mutation, { redirectTo? })` in `src/lib/zero/write.ts`, answering in the remote-command envelope so `runCommand` and `withUndo` take it unchanged, and use it in the favorite toggle; verify with unit tests for success, an `app` refusal with its field, a `zero` error (offline message, never Zero's text) and offline, each seen red

## 3. Form store and the route edit pilot

- [x] 3.1 Add `createFormStore(schema)` in `src/lib/forms/` (values in `$state`, zod validation, field issues, `setIssue(field | null, message)`, seeded and reset through `fields.set`); verify with browser unit tests for validation, a field refusal, a form-level refusal and reset
- [x] 3.2 Remove the spike's `convert_formdata` import, `mutate` prop and `FormError` `message` prop, then give `Form.svelte` a store mode with a `submit(values)` prop, keeping `waitFor`, `seed`, `{#key seeded}`, the offline overlay and `FormError`; unmigrated screens keep the remote-form path until group 15 deletes it; verify `FormGate.svelte.test.ts` passes
- [x] 3.3 Move the route form's component-state fields (grade, rating, tags, first ascensionists) to write into the store instead of posting hidden inputs; verify with a browser test that the submitted value includes each of them
- [x] 3.4 Switch `routes/[id]/edit` to the store mode; verify by driving at 375x667 and 1280x800 that changing only the year keeps grade, rating, tags and first ascensionists (DB check, then revert), and that a duplicate name shows on the name field

## 4. Favorites

- [x] 4.1 Point `ProfileFavorites` and every remaining `toggleFavorite` caller at `favorite/writes.ts`; verify by grepping for `toggleFavorite(` outside `favorites.remote.ts`, and by driving a save and unsave at both widths

## 5. Routes

- [x] 5.1 Move `createRoute`, `deleteRoute` and `restoreRoute` bodies to `route/save.server.ts` and `route/lifecycle.server.ts` and add `routes.create` (returns `{ id }`), `routes.delete` (returns the snapshot) and `routes.restore`; add `route/mutators.server.test.ts` through the shared `zeroClient` harness, each guard seen red
- [x] 5.2 Switch the route add form, `TopoAddRouteModal` and `TopoEditRouteForm` to the store (`store.submit`) and the delete and restore callers (`RouteActions`, the topo editor) to `route/writes.ts`; drive add, delete and undo, and the topo editor's new route, quick line, edit and delete with undo

## 6. Areas and parking

- [ ] 6.1 Move `createArea`, `updateArea`, `deleteArea`, `restoreArea` bodies and add their mutators; port `areas.remote.test.ts` and `softRestore.remote.test.ts`, each guard seen red
- [ ] 6.2 Move `addParking`, `deleteParking`, `restoreParking` and add their mutators; port their cases, seen red
- [ ] 6.3 Switch the area add and edit forms and the parking form to the store mode and the delete callers to the adapters; drive create, edit, delete and undo at both widths

## 7. Blocks

- [ ] 7.1 Move `createBlock`, `updateBlock` (with its `known` pin fingerprint and `lockLiveBlock`), `setBlockLocation`, `estimateBlockLocationFromPhoto` and add their mutators; port `blocks.remote.test.ts` and `pin.remote.test.ts`, each guard seen red, including the stale-pin refusal
- [ ] 7.2 Move `deleteBlock`, `restoreBlock`, `reorderBlocks` and add their mutators; port `reorder.remote.test.ts` and the block restore cases, seen red
- [ ] 7.3 Switch `BlockForm` (inside its `FormGate`), the location picker and the reorder and delete callers; drive create, edit with a pin, reorder, delete and undo at both widths

## 8. Ascents

- [ ] 8.1 Move `createAscent` (returns `{ id }` for upload finalize), `updateAscent` and `deleteAscent` (its after-commit `notify` and storage teardown moved into `afterCommit`) and add their mutators; add harness tests for each, since the module has none, each seen red
- [ ] 8.2 Switch the ascent forms (keeping the date and the five other component-state fields in the store) and the delete caller; drive log, edit and delete of an ascent with a photo at both widths, and confirm the photo's storage is gone

## 9. Files and topos

- [ ] 9.1 Verify `removeFileStorage` treats an already-missing object as done (a test that deletes twice), and fix it if it does not
- [ ] 9.2 Move `setFileVisibility` (optimistic toggle), `setVideoSource` and `deleteFile` and add their mutators; port their cases from the file tests, seen red
- [ ] 9.3 Move `createTopo` (returns `{ id }`, keeps its advisory lock), `deleteTopo`, `replaceTopoImage`, `reorderTopos`, `saveTopoLines` (with its `known` fingerprint) and add their mutators; port `topos.remote.test.ts` and `lines.remote.test.ts`, each guard seen red
- [ ] 9.4 Switch the media and topo editor callers; drive a visibility toggle, a topo create, line save, image replace and delete at both widths, and time the delete path's answer against its remote-function baseline

## 10. Reactions and comments

- [ ] 10.1 Move `toggleReaction` (optimistic), `postComment`, `deleteComment`, `restoreComment` and add their mutators, keeping each `afterCommit` notification; port `toggleReaction.remote.test.ts`, seen red
- [ ] 10.2 Switch the reaction and comment callers; drive react, unreact, comment, delete and undo at both widths, and confirm one notification per action in `notifications`

## 11. Notifications and push

- [ ] 11.1 Move `markNotificationsRead` and `markEventFeedSeen` (both optimistic), `unsubscribeFromPush`, and `subscribeToPush` (as `asPrivileged`) and add their mutators; port `notifications.remote.test.ts`, seen red
- [ ] 11.2 Switch their callers; drive opening the inbox and the feed, and a push subscribe and unsubscribe, at both widths

## 12. Users

- [ ] 12.1 Move `updateUsername` and `updateUserSettings` (optimistic) and add their mutators; add harness tests, since the module has none, seen red
- [ ] 12.2 Switch the username form to the store mode and the settings toggles; drive both at both widths
- [ ] 12.3 Add `command` exports beside `updateEmail` and `updatePassword` in `settings/account.remote.ts` (the `form` exports stay one release) and switch `settings/email` and `settings/password` to the store mode calling them; drive an email change request and a password change at both widths

## 13. Feedback

- [ ] 13.1 Move `submitFeedback` as `asPrivileged` with `notifyAdminsOfFeedback` in `afterCommit` (its existing `feedback-<id>-<admin>` key); port its cases from `feedback.remote.test.ts`, seen red
- [ ] 13.2 Switch the feedback form to the store mode; drive a submission at both widths and confirm one admin notification

## 14. Regions

- [ ] 14.1 Add `last_delivered_at` to `region_invitations` in `schema.ts`, run `generate:drizzle` (check the other worktrees' migration numbers first), append the backfill `update region_invitations set last_delivered_at = last_sent_at`, then `generate:zero` and `migrate`; verify the column and backfill in the dev DB
- [ ] 14.2 Add i18n keys to `messages/en.json` and `messages/de.json` for the invitation row's "not delivered" line and the "Invitation saved" toast, sorted, no em-dashes; verify `npm run machine-translate` reports nothing missing
- [ ] 14.3 Move the settings writers (`updateRegionMapLayers`, `addRegionTag`, `renameRegionTag`, `removeRegionTag`, all through `settings.server.ts` with their row lock) and `updateRegion`, and add their mutators; port `regions.remote.test.ts` and `mapLayers.remote.test.ts` cases, each guard seen red, including the stale map-layers refusal
- [ ] 14.4 Move `inviteRegionMember` and `resendRegionInvitation` with the email in `afterCommit` (keys `invitation-<id>` and, for resend, `invitation-<id>-<last_sent_at>`) and `last_delivered_at` written on acceptance, plus `revokeRegionInvitation` and `restoreRegionInvitation`; add harness tests that a refused or rolled-back invite sends no email and that a refused send leaves `last_delivered_at` empty, each seen red
- [ ] 14.5 Move the membership writers (`updateRegionMemberRole`, `removeRegionMember`, `restoreRegionMember`, `leaveRegion`, keeping their advisory locks and the event-before-delete order) and add their mutators; port `memberRestore.remote.test.ts`, seen red
- [ ] 14.6 Move `createRegion`, `acceptRegionInvitation` and `acceptMyInvitation` as `asPrivileged`, keeping their advisory locks; port their cases, seen red
- [ ] 14.7 Show delivery state in `InvitationRow` from `last_sent_at` and `last_delivered_at`, and reduce the post-invite toast to "Invitation saved"; switch every region screen's callers; drive invite (with Resend unreachable once, to see "not delivered"), resend, revoke and undo, role change, remove and undo, map layers and tag edits, in `en` and `de` at both widths

## 15. Removal and integration

- [ ] 15.1 Delete what no caller uses any more: `Form.svelte`'s remote-form path, `src/lib/forms/seed.svelte.ts`, `submit.ts`, `offlineFailure.ts` and their tests, and `RemoteFormInputWrapper` from every entity `*FormFields`; verify each with a grep showing no importer outside `AuthField`, then `svelte-check` and `lint:unused`
- [ ] 15.2 Cut the remote-form conventions from AGENTS.md (clearing in the `enhance` callback, `seedForm` versus a DOM reset, `form.for(key)`) and keep the rest of each paragraph that still applies; verify no AGENTS.md line names a deleted helper

- [ ] 15.3 Verify no migrated caller still imports a migrated remote function (grep each export name outside its `*.remote.ts`), and that every remaining `*.remote.ts` export is in the proposal's out-of-scope list
- [ ] 15.4 Run `npm run test:e2e` against the dev stack and fix what it finds
- [ ] 15.5 Verification sweep over the touched paths: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` and `--project browser`, `svelte-check`, `npm run lint:duplication`, `npm run lint:unused`, and drive the favorite toggle, the route edit form and one delete with undo at 375x667 and 1280x800; close the pages opened

## Workflow follow-up

- Before deleting the remote functions, port each remaining `*.remote.test.ts` case to the `zeroClient` harness, so no body loses its coverage.

- Release order: zero-cache 1.11 with the new env, then `migrate`, then the app.
- In the next ordinary release, delete the migrated remote functions and their `*.remote.test.ts` files.
- Archive the change after that release and the review loop.
