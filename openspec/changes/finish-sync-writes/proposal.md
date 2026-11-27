# Proposal

## Why

R1 (issue 1145) makes the PowerSync build read and write without Zero. The write path package (1177) sends every write of that build to `/api/sync/mutate`, but left three things for this package (issue 1179): toggles on synced data that jump back until the changed row syncs down, mutator tests that run through the new route only when someone sets a variable by hand, and write screens nobody has driven on that build. One more gap was found since: a person who presses Save again after a write was reported as failed sends it under a new write id, so a write the server already committed applies twice.

## What Changes

- The "show what was asked for until the synced row agrees" logic of the favorites overlay becomes one shared helper. Favorites, the file visibility switch and the settings switches use it, so each shows its new state at once in the PowerSync build and goes back with a toast when the write fails. In the Zero build the row changes at once, so the helper has nothing to show and the screens behave as today.
- In the PowerSync build, a write that ended without an answer from the server is sent again under the same write id when the same write (same mutator, same arguments) is made again in the same tab. The server then answers with the stored result instead of applying it twice. A changed write gets a new id.
- CI runs every test that writes through the test client a second time, through the write route.
- Every form, create and delete is driven on the PowerSync build; the screens this change touches are also driven on the Zero build.
- Nothing is client-breaking: no URL, remote function export, mutator or `manifest.id` changes. Production builds Zero; a tab loaded before the deploy keeps working.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sync/mutations`: "Toggles apply instantly" holds in either build again (it now exempts a file's visibility on PowerSync); new "A toggle on a synced row holds its tap until the row arrives", with scenarios for a file's visibility and a setting.
- `sync/write-path`: new "Saving again after a lost answer applies once"; "The same rules decide a write on either route" adds that CI checks it on every pull request.

## Non-goals

- Reactions and notification read marks: they read through the app server, not the synced store, and the comments (1182) and notifications (1181) packages already gave them their own handling (`Reactions/toggle.svelte.ts` holds the tapped emoji over the server read). Moving reactions onto this change's helper is left alone: their overlay also merges the emoji into the chips and swallows a refusal without a toast.
- Keeping a failed write's id across a reload, or queueing writes while offline: the offline writes change (issue 1148).
- The grading scale on other screens updates when the settings row syncs down (about a second), not in the same frame; the settings screen itself shows the pick at once.
- Starting no Zero client in the PowerSync build: the last package (1183).
- Any deployment of a PowerSync build, and Playwright in CI.

## Impact

- Entity modules: `favorite` (`save.powersync.svelte.ts` uses the helper). `file` and `user` unchanged; their writes are called from the components below.
- Components and routes: `src/lib/components/Media/ShareSheet.svelte`, `src/routes/(app)/settings/SettingSwitch.svelte`.
- New: `src/lib/state/wanted.svelte.ts` and its test.
- Sync code: `src/lib/zero/write.powersync.ts` and its test.
- Records: one clause on the toggles line of `AGENTS.md`.
- `src/lib/components/ShareButton/ShareButton.svelte` and `src/lib/state/clipboard.svelte.ts` share one `createShare` with ShareSheet; `.fallow-dupes-baseline.json` loses that clone's entry.
- CI: `.github/workflows/ci.yml` gains one test step.
- Tables, migrations, remote functions, copy: none.
- Size: 1 to 1.5 days, most of it the drive.
