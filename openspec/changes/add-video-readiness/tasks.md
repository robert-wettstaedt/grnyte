## 1. Domain and schema

- [x] 1.1 Add the `readiness` entry to `CONTEXT.md` under Internal terms (three values, monotonic, "Preparing" in copy and never "processing"), and verify by reading it back against the design's D1 and D9.
- [x] 1.2 Export a `videoReadiness: ['pending', 'ready', 'failed']` tuple from `src/lib/entities/file/dto.ts` and add `readiness: text('readiness', { enum: videoReadiness }).notNull().default('pending')` to `bunnyStreams` in `src/lib/db/schema.ts`, matching `feedbackKind`. Not `pgEnum`. Verify the column comment states that the column holds NEITHER host enum and names both colliding integers.
- [x] 1.3 Run `generate:drizzle` once, covering BOTH `bunny_streams.readiness` and the `video_ready` value from 8.3, then append the backfill: set every row existing at migration time to `ready`. Verify the single migration file contains both schema changes plus the UPDATE, and check the migration number against other worktrees before generating.
- [x] 1.4 Run `generate:zero` and `migrate` against a throwaway database (never the shared dev DB from a worktree), and verify `bunny_streams.readiness` exists with the expected default and that existing rows read `ready`.

## 2. Provider boundary

- [x] 2.1 Add `readinessFromWebhook(status)` and `readinessFromApi(status)` to the `VideoProvider` interface in `src/lib/videos/provider.server.ts`, documenting that the two enums collide.
- [x] 2.2 Implement both in `src/lib/videos/bunny.provider.server.ts` from the documented tables (webhook `3=Finished`, `4=ResolutionFinished`, `5=Failed`; API `3=Transcoding`, `4=Finished`, `5=Error`; webhook 6 to 10 ignored). Verify no integer literal for either enum exists outside this module.
- [x] 2.3 Write tests pinning both mapping tables, including that the two disagree on `3` and `4`. Verify each has been seen red by swapping one mapping for the other and watching it fail.

## 3. Webhook endpoint

- [x] 3.1 Add a signature verification helper (HMAC-SHA256 over the raw body, read only key, constant time compare, `X-BunnyStream-Signature-Version: v1` and `-Algorithm: hmac-sha256` checked). Verify with tests covering a valid signature, a tampered body, a wrong key and a missing header, each seen red.
- [x] 3.2 Add `src/routes/api/webhooks/bunny/+server.ts` reading the raw body before any parsing, rejecting unverified requests, and writing readiness through the provider mapping. Verify an unverified POST changes nothing.
- [x] 3.3 Enforce promote only in the handler: never leave `ready`, `failed` only from `pending`, unknown GUID is a no-op and never an insert. Verify with a test that replays `Finished` then a late `Encoding` and asserts the row stays `ready`, seen red against a naive write.
- [x] 3.4 Declare the read only key in `$env/static/private`, add a CI dummy in `.github/workflows/ci.yml` beside the existing Bunny variables, and a local dev value. Verify the build fails cleanly when it is absent rather than at runtime.

## 4. Reconciliation

- [x] 4.1 Add a reconciliation pass to `src/routes/api/tasks/cleanup/+server.ts` that reads each video's status from the Bunny API via `readinessFromApi` and corrects rows, under the same promote only rule. Verify it never demotes a `ready` row, seen red.
- [x] 4.2 Make the pass report how many rows it corrected, in the same shape as the job's existing counters, so the one shot sweep after migrating can be read rather than assumed.

## 5. Readiness to the client

- [x] 5.1 Add `readiness` to the `bunnyStream` relation selection and to `MediaFile` in `src/lib/entities/file/dto.ts`, mapping it in `toMediaFile` beside `source`. Verify with a mapper test covering a row whose relation is absent.
- [x] 5.2 Add `readiness: true` to the explicit column selection in `src/routes/f/[id]/+page.server.ts`. Verify the share page receives a real value rather than `undefined`, which would render every video as pending.

## 6. Interface

- [x] 6.1 Add these keys to BOTH `messages/en.json` and `messages/de.json`, kept sorted, no em-dashes. Verify both files parse and no key exists in only one.
  - `media_preparing`: "Preparing" / "Wird vorbereitet"
  - `media_preparingHint`: "This can take a while. The video will appear here on its own once it is ready." / "Das kann eine Weile dauern. Das Video erscheint hier automatisch, sobald es fertig ist."
  - `media_unavailable`: "Video unavailable" / "Video nicht verfügbar"
  - `media_unavailableHint`: "This video could not be prepared and cannot be played." / "Dieses Video konnte nicht vorbereitet werden."
  - `media_sharePending`: "This video is still being prepared. The link will not play yet." / "Dieses Video wird noch vorbereitet. Der Link kann noch nicht abgespielt werden."
  - `media_videoPreparing`: "Video, being prepared" / "Video, wird vorbereitet" (accessible name for a pending tile)
  - `media_videoUnavailable`: "Video, unavailable" / "Video, nicht verfügbar" (accessible name for a failed tile)
- [x] 6.2 Replace the terminal `failed` branch and the ten attempt backoff in `src/lib/components/Media/MediaThumbnail.svelte` with a promote only probe of `playlist.m3u8`, gated on `readiness === 'pending'`, at a fixed 30s interval, paused while the document is hidden AND while the app is offline (reuse `onlineHold` / `online.svelte`; offline every failure is indistinguishable from "still encoding"). Verify a pending tile never reaches `image-off` no matter how long it waits, that a hidden tab stops requesting, and that an offline tab stops requesting.
- [x] 6.3 Render the preparing state on the tile as a skeleton, mirroring its sibling `src/lib/components/Image/Image.svelte:79` (`bg-surface-200-800` plus `animate-pulse`) rather than a new component. Leave the pulse ungated, consistent with the other 13 instances; the reduced motion question is 6.7, globally. Verify the tile no longer promises playback.
- [x] 6.4 Give the tile a readiness aware `aria-label` in place of the unconditional `m.common_playVideo()` at `MediaThumbnail.svelte:82`, which today announces "Play video" for something explicitly unplayable. Verify with a screen reader or the accessibility tree, not by reading the source.
- [x] 6.5 Keep the tile opening the viewer on click in every readiness state. The viewer is the only place Delete lives, and gating it behind readiness would recreate v1's "wait two hours to delete the wrong clip". Verify Delete is reachable for a `pending` video and for a `failed` one.
- [x] 6.6 Render the preparing state in `src/lib/components/Media/MediaStage.svelte` ahead of the HLS attempt, keeping the caption and attribution but SUPPRESSING the transport row (play, seek, mute), which otherwise renders `0:00 / 0:00` against a `<video>` with no source. Verify the iframe fallback still serves genuine playback failure on a `ready` video.
- [x] 6.7 Add a global `prefers-reduced-motion` rule to `src/app.css` that stops `animate-pulse`. Blast radius is deliberate: it affects all 14 existing instances, not just the new one. Verify two or three of the existing sites (`Avatar`, `QueryState`, a route placeholder) still read correctly as static blocks.
- [x] 6.8 Render the `failed` state in both the tile and the viewer: `image-off` plus copy, never hidden. Verify a failed video is still listed.
- [x] 6.9 Warn in `src/lib/components/Media/ShareSheet.svelte` when the video is not `ready`. Verify the warning clears once it is.
- [x] 6.10 Add Storybook stories for a video tile in all three readiness states. Verify they are reviewable with no backlog and no network, since a genuinely pending video stops being reproducible once the host catches up.

## 7. Deployment

- [ ] 7.1 **Yours**: create the read only key in the Bunny dashboard. Verify it is the READ ONLY key and not the full access one, since it doubles as the webhook signing secret.
- [ ] 7.2 **Yours**: store it in Bitwarden, push to Vercel for all three environments, and set a local value for dev. Verify by reading it back per environment rather than assuming the push succeeded.
- [ ] 7.3 Migrate production. Verify `readiness` exists and that existing rows read `ready`.
- [ ] 7.4 Deploy. Verify the endpoint answers before going further: an unsigned POST is rejected, not a 404.
- [ ] 7.5 **Yours**: point the Bunny webhook at `/api/webhooks/bunny`. ONLY after 7.4 passes, because anything sent before the endpoint exists hits a 404 and is lost permanently with no retry. Verify by uploading one video and watching its readiness flip on its own, which is the acceptance test for the whole change.
- [ ] 7.6 Trigger the one shot reconciliation sweep manually and read its corrected count, spot checking two or three known videos. It is the only reconciliation that runs until the cutover registers a cleanup schedule.
- [ ] 7.7 Confirm push delivery works in production AT ALL before relying on it, since it has never been verified there and this change adds a new push kind to it. Verify by receiving one on a real device. If it does not work, that is a finding about the push system and the inbox half of the notification still lands.
- [x] 7.8 Hand off to the v2 cutover list: registering the `/api/tasks/cleanup` pg_cron row, and that reconciliation does not run until it exists. Note separately that the same job also switches on staging, notification, feedback and error log retention, which is a decision of its own. DONE: written into docs/CUTOVER.md, which also carries the rest of group 7.

## 8. Notifications

Only the uploader's own notification. The broadcast half (telling other people when somebody
else's video is ready) was dropped during implementation: see design.md, D12. Adding `video_ready`
needs no migration at all, because `notification_source_type` is a text column with a
TypeScript-only enum.

- [x] 8.3 Add a `video_ready` value to `notificationSourceType` in the SAME generated migration as `bunny_streams.readiness`, not a second one: two migrations for one change is an avoidable collision with the other worktrees generating numbers in parallel. Verify `caption.ts`'s `KEYS` record fails to compile until its key exists, which is the intended tripwire.
- [x] 8.4 Exempt `video_ready` by name from the fan out's self filter, and amend the `actorFk` comment in `schema.ts` so code and comment agree about the invariant. Verify no other source type can now reach its own actor, seen red.
- [x] 8.5 Produce the notification when a video promotes to `ready` more than five minutes after `files.createdAt`, with no new column and no new preference. Verify a fast upload produces nothing and a failed one produces nothing.
- [x] 8.6 Add the `notifications_videoReady` caption key to both locales: "Your video is ready" / "Dein Video ist fertig". Verify it renders with no actor row, as its `NO_ROW` peers do.

## 10. Client video seam

Design D16. Behaviour-preserving except 10.5, which the spec's effective-readiness requirement makes
a conformance fix. Nothing is committed, so the whole group reverts by deleting one module and
reverting five components.

- [x] 10.1 Add `src/lib/videos/view.svelte.ts`: `videoView(file)` returning `preparing | unavailable | playable | undefined`, with `tileState` private and the derivative ladder moved in. Carries the reasoning `thumbnail.ts` holds today.
- [x] 10.2 Add `src/lib/videos/view.svelte.test.ts`: a table over readiness x observed, driven through `videoView` rather than the private core, absorbing `thumbnail.test.ts`. Seen red by making the `unavailable` arm return `playable`, and the falsifier must break the VIEWER's case, since one that only breaks the tile would have passed against every version of this logic that already shipped.
- [x] 10.3 Delete `src/lib/components/Media/thumbnail.ts` and `thumbnail.test.ts`, and confirm the mutation story moves with them rather than only the assertions.
- [x] 10.4 Point `MediaThumbnail`, `MediaStage`, `MediaViewer` and `routes/f/[id]/+page.svelte` at the seam. Verify the two non-null assertions in `MediaStage` are gone.
- [x] 10.5 Point `ShareSheet.svelte` at the seam. This is the BUG FIX: it gains the observed-set override it never had, so a promoted video stops warning that its link will not play. Verify by driving, not by reading.
- [x] 10.6 Give the viewer's peek a terminal `onerror` (D16). Verify a pending video never draws a broken-image glyph in the swipe filmstrip.
- [x] 10.7 Run `test:mutation -- --mutate src/lib/videos/view.svelte.ts` and read every survivor.
- [x] 10.8 Drive all five surfaces at 375x667 and 1280x800, in both locales, then request a round from both reviewers: this reopens files they verified and deletes two they validated.

## 9. Verification sweep

- [x] 9.1 Over the touched paths only: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` for the `*.server.test.ts` and `*.remote.test.ts` files and `--project browser` for the rest, then typecheck.
- [x] 9.2 Run `npm run lint:duplication` and `npm run lint:unused`, and account for any `[NEW]` clone rather than accepting the baseline reflexively.
- [x] 9.3 Drive the running app at BOTH 375x667 and 1280x800: a pending video tile, the same video in the viewer, the share sheet warning, and a ready video still playing normally. Verify in German as well as English.
- [x] 9.4 Exercise the probe path end to end against a genuinely pending video while the host backlog still makes one reproducible, since once encoding catches up this path can only be tested by faking the 404s.
- [x] 9.5 Delete a genuinely pending video and verify it is gone at the HOST, not only in the database. `provider.remove` treats a 404 as success, so a host side refusal mid encode would pass silently and strand an orphan the sweeper cannot collect (it only takes status 0). Do NOT check this via the CDN: the pull zone caches `/original` for 30 days and ignores a cache-busting query string, so a deleted video keeps returning 200. Ask the video API for the GUID and expect a 404. Verified 2026-09-17 against a video deleted while Bunny still reported it processing.
