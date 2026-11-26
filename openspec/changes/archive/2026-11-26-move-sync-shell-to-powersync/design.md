# Design

## Context

See proposal.md for why. Read at `origin/develop` 0cea521f, not driven, unless stated.

- `online.svelte.ts` is fed by `initZero` (`zero/z.svelte.ts:79`). `engine.powersync.ts` calls `initZero(session, { preload: false })`, and `db.svelte.ts` `observe` feeds nothing. `feed.svelte.ts` still needs the client (`syncCaughtUp`).
- `getZ().connectionState` is read by `StatusBar.svelte:40`, `global.svelte.ts:160` and `(app)/+layout.svelte:124`, the last of which runs the recovery.
- `@powersync/web` 2.6.0 turns shared connections off on Safari, iOS and Android. There every database lease is a navigator lock `db-lock-<file>`, taken in a dedicated worker. A lease is per operation, so an idle tab holds none. The milestone saw a second tab hang (its task 9.3) without reading the locks. Its one lock reading (9.5) was the same tab's previous page in Safari's back-forward cache, since fixed (its D16). So nobody has seen the locks of the two-tab case: task 1.1 reads them.
- There too, only the tab that holds the lock `streaming-sync-sync-<identifier>` syncs. The page requests it, and other tabs learn the connection from the holder. A frozen holder would leave a second, opened tab unconnected on a good network (inferred; task 1.1 measures it). With a shared connection the page never requests that lock.
- PowerSync's WebSocket closes after 30 s without data; until then `connected` stays true.
- auth-js keeps a session whose access token has not expired even when its refresh is refused, and `getSession` returns that token. So `write.powersync.ts` (401, then read the token again) resends the same one.
- `requireLiveSession` clears the cookie and refuses with `auth_sessionEnded`; `remoteResource` leaves on it through `leaveIfSessionEnded`, `source.powersync.svelte.ts` does not.
- `closeCurrent` unsets the database; when the layout load then delivers the new session, live queries rebuild on it and `collections()` throws. That order is inferred from the code; task 1.2 confirms it.

Reads and writes: no Zero query, mutator or remote function is added or changed. No schema change, no backfill.

## Goals / Non-Goals

Goals: the three importer entries go; the Zero build keeps its behaviour, its code changes being moves. Non-goals: see proposal.

## Decisions

### D1. Four functions join the engine seam

`state/engine.ts` and its twin gain `connection(): ConnectionName`, `storeBlocked(): boolean`, `recoverSignIn(supabase, session): undefined | (() => void)` and `sessionMoved(next, shown): boolean` (D6). Zero: `getZ().connectionState.name`, `false`, the layout's recovery effect body moved unchanged, and the token comparison the layout's auth listener makes today, moved unchanged. PowerSync: `syncConnection()` and `storeBlocked()` from `db.svelte.ts`, nothing, and the same comparison, false for an event without a session. The layout calls `recoverSignIn` inside its `$effect`, so the reads stay reactive. Zero's `downloadRefused()` becomes `isTerminal(getZ().connectionState.name)`, which is what `global.svelte.ts` adds to it today; PowerSync has no terminal name.

Alternative: twins for `StatusBar` and the layout. Rejected: two copies of markup for one value.

### D2. One reporter per build

With `preload` off, which already means that PowerSync owns the sync state, `initZero` also skips `reportConnectionState` and `setPingTightenHandler`. Two engines on one level-triggered flag would overwrite each other. The option is not renamed: 1183 deletes it.

### D3. What PowerSync reports, and when

`connected` maps to `'connected'`, everything else to `'connecting'`: PowerSync flips between connecting and disconnected while it backs off, and each flip would restart the 10 s hold (`connectionOf` in `archive/powersync-milestone`). `db.svelte.ts` calls `reportConnectionState` when `connected` changed or `lastSyncedAt` moved forward. The first report is made where `markStoreLoaded` is called today, with the status of that moment, so a launch with no service reads offline after 10 s and one already connected is reported. Not on every status: one raised locally on a dead socket would call `online = true` over the browser's offline event, while a checkpoint is proof. `syncConnection()` holds no state of its own: it answers `'connecting'` when `localStoreLoaded()` and the status PowerSync last gave is not connected, else `'connected'`. No status counts as connected, and `closeCurrent` now clears the status. So before the store is loaded, and with no account open, it answers `'connected'`, and a blocked tab is never called offline on PowerSync's word. `online.svelte.ts` changes by one function only, below.

A page that waits for the sync lock while another tab holds it is unconnected without that being evidence about the network. The SDK requests the lock only after the first status, after a restart's disconnect and after each backoff, so asking once at the report is too early. An unconnected status is therefore reported at once, which starts the 10 s hold, and the locks are asked every second while unconnected (one timer with D4). When the page waits and another client holds, the report is withdrawn. When a later ask finds it no longer waiting and still unconnected, it is reported again. A connected status is reported and ends the asking. `syncConnection()` answers `'connecting'` throughout, so the bar says reconnecting.

`online.svelte.ts` gains `withdrawConnectionState()`: no state known, none reported, the hold cleared, and one probe. With no state known, the probe alone decides, in both directions (`probeReachability` already treats it so), and an offline verdict from a hold that already fired is cleared by it. Zero never calls it.

`lock.ts` finds the wait as a pending `streaming-sync-sync-<identifier>` lock of this page's own client id with a holder of another. The page learns its id by querying under a lock of a name of its own.

Alternative: the full-screen message there too. Rejected: the guidebook is readable in that tab.

### D4. Blocked means another client holds our lock

New `powersync/lock.ts`: one pure function over `navigator.locks.query()`'s answer, which says whether the file is blocked (this decision) and whether the sync is held elsewhere (D3). Blocked when one of the file's two locks, `db-lock-<file>` or SQLite's `lock##IDB(<file>):/<file>##access`, is pending for one client and held by a different one; the measured hang waits on the second (task 1.1). `db.svelte.ts` has one timer for both answers: it asks every second while the store is not loaded or the status is not connected, and stops when neither holds or the database closes. `storeBlocked()` is true once the file was blocked 3 s or more after the open, and false once `localStoreLoaded()`. No `navigator.locks`: never blocked. The layout tests `storeBlocked()` ahead of `isStoreCold`, with `fade` and `motion()`, and shows `ErrorState` with a new `blocked` type (the `offline` one's reload button, with the `info` icon instead of no signal).

Copy, for the user to approve before it is added: `error_storeBlocked_title` "Open in another tab" / "In einem anderen Tab geöffnet"; `error_storeBlocked_body` "Switch to the other tab or close it. This tab then continues by itself." / "Wechsle zum anderen Tab oder schließe ihn. Dieser Tab macht dann von selbst weiter."

Alternative: the message after a timeout alone. Rejected: a slow phone would be told of a tab that does not exist. If task 1.1 finds no lock that shows the wait, work stops and the user decides.

### D5. A refused write renews once, for real

One function answers every question about the stored session: new `zero/checkSession.ts`, `checkSession(auth, { refused, userId })`, which answers `'signedOut'`, `'unreadable'` or the stored session.

1. Read the stored session. An error: `'unreadable'`. None: `'signedOut'`, since the cookie is every tab's and the first refusal clears it with no event in the others. Another account's, or no `refused` given, or a token other than `refused`: that session.
2. The refused token is still stored: `refreshSession()`, thrown errors included as failures. Any outcome but an error that `isDefinitiveRefusal` names (reused from `authRecovery.ts`, which imports no Zero client) answers as step 1 does on a new read, except that a refused token still stored is answered as it is.
3. Definitive: read again. Still the account's and still `refused`: `signOut({ scope: 'local' })`, then `'signedOut'`. Else as step 1 does.

`engine.powersync.ts` wraps it once: `'signedOut'` in a document that started signed in calls `wipeAndLeave` to the start page, unless the tab is leaving. The wrapper is the third argument of `setWriteToken` and the second of `setReadUser`. `write()` asks it on a 401 with the refused token, before the one resend, and without one when the token source answers no session. A server read asks it when refused with 401, without a token. `start()` asks it when given no session (D6).

The order keeps a race with another tab's refresh, and another account's session, from being signed out. The refresh, not the sync connector, carries this: PowerSync calls `invalidateCredentials` on plain network errors too, so refreshing there would hammer the refresh token.

`ServerRead.#failed` calls `leaveIfSessionEnded` first and stays `unknown` when it leaves.

### D6. The account switch holds the layout load

`start()` may return a session, or a promise of one, and `(app)/+layout.ts` returns `(await start(session, supabase)) ?? session`. On a switch the PowerSync twin's promise never settles. Zero returns nothing, and the await costs a microtask. Given no session once started, the twin asks `checkSession` (D5): `'signedOut'` holds the load, `'unreadable'` answers the last session of this document, and a session answers itself, or takes the switch when it is another account's. Either way it neither closes the database nor lets the screens see an empty session, and the load is held only when the tab leaves.

A kept session needs one more rule. auth-js sends each new subscriber an `INITIAL_SESSION`, without a session when the stored one cannot be read. The layout's auth listener compares tokens, so it would invalidate, the rerun would hand the effect a new `data`, and the new subscription would get the same event again, until the service is back. Hence `sessionMoved`: the PowerSync twin ignores an event without a session. A sign-out that raises an event is handled before the comparison, a silent one by `checkSession`, and the service's return raises an event with a session.

While leaving, every further `start()` returns the held promise. With the load held, the resources keep their latched answers while the store empties, so "answered, empty" would fire the layout's redirects. `leaveForOtherAccount` therefore calls `setLeaving(true)` before it clears, and both redirects check `isLeaving()`, the delayed one when its timer fires. The twin imports `wipe.ts` lazily, as `sessionEnded.ts` does, since `wipe.ts` imports the engine; a chunk that fails to load still clears and reloads.

If the drive still shows the error because an emptied result rebuilds a query, work stops and the user decides.

### D7. Two traces with a stop line

The 3 s wait equals `LEAVE_CAP_MS`, so the clear most likely runs into its cap. Cause unknown; D6 removes one candidate, the start without a session whose close the second start waited for. Task 5.3 times `await cleared`, disconnect, clear, close and delete in the real flow. Goal: a reload within 1 s. If the cause is in the SDK or the browser, it is recorded and the user decides; the cap stays either way. `derived_inert` is traced from its stack; ours is fixed, a dependency's is recorded.

### D8. Removed before building (subtract pass, user 2026-11-25)

Cut from this plan's own code, with nothing taken from its scope: no `leaving.ts` and no repointed imports (a lazy import does); one `checkSession` instead of `renewSession` and `leaveIfSignedOut`; one lock function and one timer instead of two of each; no state behind `syncConnection()`; no renamed `preload`; no ErrorState story and no special Back button. The moves out of Zero come before anything is built.

### D9. How the tests are written (TDD pass, user 2026-11-25)

The seams and the loop are stated once, at the top of tasks.md. What the pass changed: results are read as the app reads them (`isOnline()`, what is stored, what is sent, whether the tab leaves) instead of through calls between our own modules; `lock.ts` and `withdrawConnectionState()` get no test of their own and arrive with the first case that needs them; `write()` is tested over the real `checkSession`; and `engine.powersync.ts`, which decides when a device wipes itself and was left to a drive, gets a seam, which also drives a `write()` and a server read, so a check that is not handed over fails a test.

### D10. After the code review (user, 2026-11-26)

- The three server-form sign-outs (invitation page, profile completion, region creation) now also tell the other tabs on auth-js's own channel, so a tab signed in elsewhere wipes and leaves at once and the account switch of D6 stays a rare fallback. Its leftover, a query rebuilt on the emptied store while a slow clear runs (task 5.2), is accepted.
- A successful probe beside a connection that says it is live sets the browser flag back to online: PowerSync does not report the same connection again, so a missed `online` event would otherwise keep the app offline until the next checkpoint.
- Accepted as they are: the layout ignores a sign-out while the shared leaving flag is set, which account deletion also sets; a tab holding the file's lock may show the blocked message during a slow double open; a wipe may delete the file of an account that signed in during it; a single-item server read cannot tell a redirect from none (a `shortcut:` comment).

## Risks / Trade-offs

- [The Zero build changes] → moves, one condition in `initZero` and one await; `authRecovery.test.ts` and the existing cases of `onlineHold.test.ts` pass unchanged, and it is driven.
- [A refresh per 401] → auth-js shares one in flight and caches a refusal.
- [A tab whose database is blocked signs out] → its clear waits on the open and hits the 3 s cap, then leaves; the delete completes when the holder closes.
- [With a report withdrawn, signal lost without a browser event goes unseen until the next probe] → a write that fails says so; only while another tab holds the sync.
- [A slow clock] → recorded in the non-goals.
- [Files shared with 1179 to 1182] → this merges first.

## Migration Plan

Merge to `develop`. No schema, stream or deploy step; nothing builds with `powersync`. Rollback: revert.

## Open Questions

None beyond the stop lines in D4, D6 and D7.
