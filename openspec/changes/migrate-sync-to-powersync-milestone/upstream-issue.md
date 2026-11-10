# Draft: issue to powersync-js (task 8.8)

Before posting, check the text and any attachment (screenshot, recording, log) for an auth UUID (also in `grnyte-<uuid>.sqlite` file names), token, bucket name, hostname, region name or region id.

---

**Title:** Safari 27: completing a checkpoint takes ~19 s even with no new operations (0.3 s in Chrome)

**Environment:** @powersync/web 2.6.0, @journeyapps/wa-sqlite 2.0.10, self-hosted service 1.27.2 (MongoDB storage), sync streams across four priorities. iOS 27.2 Simulator and an iPhone on iOS 27, Safari and home-screen web app. IDBBatchAtomicVFS, multi-tabs off. Store of ~30,000 operations (12.4 MB, one bucket of ~28,000).

**What happens:**

1. Reconnecting a store that is already synced, with nothing changed on the server: the service log shows the stream answered with 0 operations, about 5 KB, its checkpoint complete in 17 ms. The client reports the streams synced ~19 s after it connected. Streams at priorities 0 to 2 confirm within ~0.1 s of connecting when nothing on the page reads the database; the final, full checkpoint takes the 19 s. Chrome, same build and store: 0.3 s from connect to all synced.
2. First sync of the same data: Chrome ~1.8 s, Safari (Simulator) ~20 s, iPhone ~25 s for the large stream.

**Ruled out:**

- Network and server: see the service log above; on a first sync the stream arrives in ~30 to 40 lines within a second or two.
- The Asyncify build (WebKit bug 329813): swapping in `mc-wa-sqlite-jspi` at build time (verified loaded with `select sqlite3mc_version()`) brought Chrome from 3.3 s to 1.8 s on a first sync but Safari only from 23.1 s to 20.6 s.
- Our client-side ingestion: with no TanStack DB collection built, a first sync took 20.4 s.
- `enableMultiTabs: true`: no better (25.6 s).
- OPFS: `OPFSWriteAheadVFS` is Chromium-only; `OPFSCoopSyncVFS` (2.6.0) and `SimpleOpfsVFS` (2.7.0) sync once, but after any page reload the new page never opens a sync stream (similar to #808).

**Ask:** what does the client do when completing a full checkpoint (checksum validation, `sync_local`) that could take ~60x longer in WebKit than in Chromium when nothing changed? A first sync shows the same gap at ~11x. A Safari-safe OPFS VFS that survives page reloads would also let us test whether IndexedDB storage is the cost.
