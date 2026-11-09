# Draft: issue to powersync-js (task 8.8)

Post only after task 8.6, with its result filled in below. Before posting, check the text and any attachment (screenshot, recording, log) for an auth UUID (also in `grnyte-<uuid>.sqlite` file names), token, bucket name, hostname, region name or region id.

---

**Title:** Initial sync ~7x slower on Safari 27 with IDBBatchAtomicVFS; JSPI build not used

**Environment:** @powersync/web 2.6.0 (2.7.0 tried), @journeyapps/wa-sqlite 2.0.10, self-hosted service 1.27.2 (MongoDB storage), sync streams. iOS 27.2 Simulator and an iPhone on iOS 27, Safari and home-screen web app. Default options (IDBBatchAtomicVFS; multi-tabs off on Safari).

**What happens:** a first sync of ~30,000 operations (12.4 MB, one large bucket of ~28,000) takes:

| Client                           | Large stream, synced to done |
| -------------------------------- | ---------------------------- |
| Chrome, same app build and data  | ~3.3 s                       |
| Safari, iOS 27.2 Simulator       | 23 to 26 s                   |
| Safari, iPhone (comparable data) | 45 to 60 s                   |

Small streams at the start sync in ~0.3 s; the time goes into the large one.

**Ruled out:**

- Network and server: the stream arrives quickly, in ~30 to 40 lines (the 1,000-op / 1 MiB chunk limits).
- Rendering: the same time on a page without the map. Note the app uses TanStack DB collections over every synced table, which take rows in on the main thread during the sync; _8.6 result: whether a first sync without them differs_.
- `enableMultiTabs: true` (sync in a SharedWorker): no better (25.6 s).
- OPFS: `OPFSWriteAheadVFS` is Chromium-only; `OPFSCoopSyncVFS` (2.6.0) and `SimpleOpfsVFS` (2.7.0) sync once (~19.6 s), but after any page reload the new page never opens a sync stream (similar to #808).

**Suspected cause:** `loadModuleAndVfs` always uses the Asyncify build for IDBBatchAtomicVFS, and WebKit bug 329813 makes Asyncify code ~10x slower after a few seconds of work (reported for wa-sqlite in lalexdotcom/browser-sqlite#11 on Safari 27.2). Safari 27 supports JSPI. A Web Inspector recording showed the page's main thread busy for the whole sync and the database worker mostly idle, which we could not fully reconcile with this.

**Result of loading `mc-wa-sqlite-jspi` instead (our build-time swap):** _to fill in from task 8.6._

**Ask:** load the JSPI build (with the core) for IDBBatchAtomicVFS where `WebAssembly.Suspending` exists, or let apps choose the module build; and a Safari-safe OPFS VFS that survives page reloads.
