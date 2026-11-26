# Proposal

## Why

The shell is the app frame around the screens: the layout, the status bar and what decides them. The PowerSync build still takes its connection state and its sign-in recovery from a Zero client (issue 1178, the shell package of R1, the PowerSync read and write build before the cutover). A second tab that cannot open the local database shows an endless spinner. The write path package (1177) left three defects in the same code, and dropping Zero's recovery would leave a device whose session was ended unable to notice, against `auth/sessions`.

## What Changes

- In the PowerSync build, online, offline and reconnecting come from PowerSync. The Zero client that build still starts for the feed reports nothing.
- Zero's sign-in recovery runs in the Zero build only.
- In the PowerSync build, a write refused as unauthorized asks for a real token refresh once. When the refresh is definitively refused, the device signs out and clears itself. A server read refused because the session ended does the same.
- A tab that waits on another tab's lock on the local database says so after 3 seconds, and goes on by itself once the lock is free.
- An account switch in another tab reloads without an uncaught error logged under the new account, and no redirect wins over the reload.
- The 3 second wait before that reload, and the `derived_inert` warnings at 1280x800, are traced, then fixed or recorded.
- `ZERO_CLIENT_IMPORTERS` loses its three shell entries.

Nothing is client-breaking: no URL, remote function export, mutator or `manifest.id` changes. Production builds Zero and keeps its behaviour, so a tab loaded before the deploy keeps working.

## Capabilities

### New Capabilities

- `sync/shell`: what the PowerSync build's shell reports about the connection, the local database, an ended session and an account switch.

### Modified Capabilities

None. `auth/sessions` is unchanged; this change makes the PowerSync build meet it. `sync/engine-switch` is being changed by `add-sync-write-path`, and its rule that the importer list only shrinks already covers the three entries.

## Non-goals

- Starting no Zero client (1183) and replacing the feed's `syncCaughtUp` (1180).
- Sharing one database connection between tabs on Safari, iOS and Android, or releasing the lock when a tab is hidden.
- A database that another tab blocks after it opened: the message covers opening. A tab that opened while a frozen one holds the sync reads as reconnecting.
- A device clock more than 90 s slow: PowerSync may refuse its token until the clock reaches the refresh time; a write renews it.
- Any deployment of a PowerSync build.

## Impact

- Entity modules and tables: none. Remote functions: none.
- Routes: `(app)/+layout.ts`, `(app)/+layout.svelte`.
- State: `engine.ts` and its twin, `global.svelte.ts`, `online.svelte.ts`.
- Sync: `powersync/db.svelte.ts`, new `powersync/lock.ts`, `zero/z.svelte.ts`, `zero/write.powersync.ts`, `zero/source.powersync.svelte.ts`, new `zero/checkSession.ts`.
- Components: `StatusBar`, `ErrorState`. Copy: two keys in each of `en` and `de`.
- `write.powersync.ts` and `source.powersync.svelte.ts` may be edited by 1179 to 1182 as well: this merges before they start on those files. The review runs with `+security`.
- Size: 1.5 to 2 days.
