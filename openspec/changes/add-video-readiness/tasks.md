## 1. Domain and schema

- [ ] 1.1 Add the `readiness` entry to `CONTEXT.md` under Internal terms (three values, monotonic, "Preparing" in copy and never "processing"), and verify by reading it back against the design's D1 and D9.
- [ ] 1.2 Export a `videoReadiness: ['pending', 'ready', 'failed']` tuple from `src/lib/entities/file/dto.ts` and add `readiness: text('readiness', { enum: videoReadiness }).notNull().default('pending')` to `bunnyStreams` in `src/lib/db/schema.ts`, matching `feedbackKind`. Not `pgEnum`. Verify the column comment states that the column holds NEITHER host enum and names both colliding integers.
- [ ] 1.3 Run `generate:drizzle` once, covering BOTH `bunny_streams.readiness` and the `video_ready` value from 8.3, then append the backfill: set every row existing at migration time to `ready`. Verify the single migration file contains both schema changes plus the UPDATE, and check the migration number against other worktrees before generating.
- [ ] 1.4 Run `generate:zero` and `migrate` against a throwaway database (never the shared dev DB from a worktree), and verify `bunny_streams.readiness` exists with the expected default and that existing rows read `ready`.

## 2. Provider boundary

- [ ] 2.1 Add `readinessFromWebhook(status)` and `readinessFromApi(status)` to the `VideoProvider` interface in `src/lib/videos/provider.server.ts`, documenting that the two enums collide.
- [ ] 2.2 Implement both in `src/lib/videos/bunny.provider.server.ts` from the documented tables (webhook `3=Finished`, `4=ResolutionFinished`, `5=Failed`; API `3=Transcoding`, `4=Finished`, `5=Error`; webhook 6 to 10 ignored). Verify no integer literal for either enum exists outside this module.
- [ ] 2.3 Write tests pinning both mapping tables, including that the two disagree on `3` and `4`. Verify each has been seen red by swapping one mapping for the other and watching it fail.

## 3. Webhook endpoint

- [ ] 3.1 Add a signature verification helper (HMAC-SHA256 over the raw body, read only key, constant time compare, `X-BunnyStream-Signature-Version: v1` and `-Algorithm: hmac-sha256` checked). Verify with tests covering a valid signature, a tampered body, a wrong key and a missing header, each seen red.
- [ ] 3.2 Add `src/routes/api/webhooks/bunny/+server.ts` reading the raw body before any parsing, rejecting unverified requests, and writing readiness through the provider mapping. Verify an unverified POST changes nothing.
- [ ] 3.3 Enforce promote only in the handler: never leave `ready`, `failed` only from `pending`, unknown GUID is a no-op and never an insert. Verify with a test that replays `Finished` then a late `Encoding` and asserts the row stays `ready`, seen red against a naive write.
- [ ] 3.4 Declare the read only key in `$env/static/private`, add a CI dummy in `.github/workflows/ci.yml` beside the existing Bunny variables, and a local dev value. Verify the build fails cleanly when it is absent rather than at runtime.

## 4. Reconciliation

- [ ] 4.1 Add a reconciliation pass to `src/routes/api/tasks/cleanup/+server.ts` that reads each video's status from the Bunny API via `readinessFromApi` and corrects rows, under the same promote only rule. Verify it never demotes a `ready` row, seen red.
- [ ] 4.2 Make the pass report how many rows it corrected, in the same shape as the job's existing counters, so the one shot sweep after migrating can be read rather than assumed.

## 5. Readiness to the client

- [ ] 5.1 Add `readiness` to the `bunnyStream` relation selection and to `MediaFile` in `src/lib/entities/file/dto.ts`, mapping it in `toMediaFile` beside `source`. Verify with a mapper test covering a row whose relation is absent.
- [ ] 5.2 Add `readiness: true` to the explicit column selection in `src/routes/f/[id]/+page.server.ts`. Verify the share page receives a real value rather than `undefined`, which would render every video as pending.

## 6. Interface

- [ ] 6.1 Add these keys to BOTH `messages/en.json` and `messages/de.json`, kept sorted, no em-dashes. Verify both files parse and no key exists in only one.
  - `media_preparing`: "Preparing" / "Wird vorbereitet"
  - `media_preparingHint`: "This can take a while. The video will appear here on its own once it is ready." / "Das kann eine Weile dauern. Das Video erscheint hier automatisch, sobald es fertig ist."
  - `media_unavailable`: "Video unavailable" / "Video nicht verfügbar"
  - `media_unavailableHint`: "This video could not be prepared and cannot be played." / "Dieses Video konnte nicht vorbereitet werden."
  - `media_sharePending`: "This video is still being prepared. The link will not play yet." / "Dieses Video wird noch vorbereitet. Der Link kann noch nicht abgespielt werden."
  - `media_videoPreparing`: "Video, being prepared" / "Video, wird vorbereitet" (accessible name for a pending tile)
  - `media_videoUnavailable`: "Video, unavailable" / "Video, nicht verfügbar" (accessible name for a failed tile)
- [ ] 6.2 Replace the terminal `failed` branch and the ten attempt backoff in `src/lib/components/Media/MediaThumbnail.svelte` with a promote only probe of `playlist.m3u8`, gated on `readiness === 'pending'`, at a fixed 30s interval, paused while the document is hidden AND while the app is offline (reuse `onlineHold` / `online.svelte`; offline every failure is indistinguishable from "still encoding"). Verify a pending tile never reaches `image-off` no matter how long it waits, that a hidden tab stops requesting, and that an offline tab stops requesting.
- [ ] 6.3 Render the preparing state on the tile as a skeleton, mirroring its sibling `src/lib/components/Image/Image.svelte:79` (`bg-surface-200-800` plus `animate-pulse`) rather than a new component. Leave the pulse ungated, consistent with the other 13 instances; the reduced motion question is 6.7, globally. Verify the tile no longer promises playback.
- [ ] 6.4 Give the tile a readiness aware `aria-label` in place of the unconditional `m.common_playVideo()` at `MediaThumbnail.svelte:82`, which today announces "Play video" for something explicitly unplayable. Verify with a screen reader or the accessibility tree, not by reading the source.
- [ ] 6.5 Keep the tile opening the viewer on click in every readiness state. The viewer is the only place Delete lives, and gating it behind readiness would recreate v1's "wait two hours to delete the wrong clip". Verify Delete is reachable for a `pending` video and for a `failed` one.
- [ ] 6.6 Render the preparing state in `src/lib/components/Media/MediaStage.svelte` ahead of the HLS attempt, keeping the caption and attribution but SUPPRESSING the transport row (play, seek, mute), which otherwise renders `0:00 / 0:00` against a `<video>` with no source. Verify the iframe fallback still serves genuine playback failure on a `ready` video.
- [ ] 6.7 Add a global `prefers-reduced-motion` rule to `src/app.css` that stops `animate-pulse`. Blast radius is deliberate: it affects all 14 existing instances, not just the new one. Verify two or three of the existing sites (`Avatar`, `QueryState`, a route placeholder) still read correctly as static blocks.
- [ ] 6.8 Render the `failed` state in both the tile and the viewer: `image-off` plus copy, never hidden. Verify a failed video is still listed.
- [ ] 6.9 Warn in `src/lib/components/Media/ShareSheet.svelte` when the video is not `ready`. Verify the warning clears once it is.
- [ ] 6.10 Add Storybook stories for a video tile in all three readiness states. Verify they are reviewable with no backlog and no network, since a genuinely pending video stops being reproducible once the host catches up.

## 7. Deployment

- [ ] 7.1 **Yours**: create the read only key in the Bunny dashboard. Verify it is the READ ONLY key and not the full access one, since it doubles as the webhook signing secret.
- [ ] 7.2 **Yours**: store it in Bitwarden, push to Vercel for all three environments, and set a local value for dev. Verify by reading it back per environment rather than assuming the push succeeded.
- [ ] 7.3 Migrate production. Verify `readiness` exists and that existing rows read `ready`.
- [ ] 7.4 Deploy. Verify the endpoint answers before going further: an unsigned POST is rejected, not a 404.
- [ ] 7.5 **Yours**: point the Bunny webhook at `/api/webhooks/bunny`. ONLY after 7.4 passes, because anything sent before the endpoint exists hits a 404 and is lost permanently with no retry. Verify by uploading one video and watching its readiness flip on its own, which is the acceptance test for the whole change.
- [ ] 7.6 Trigger the one shot reconciliation sweep manually and read its corrected count, spot checking two or three known videos. It is the only reconciliation that runs until the cutover registers a cleanup schedule.
- [ ] 7.7 Confirm push delivery works in production AT ALL before relying on it, since it has never been verified there and this change adds a new push kind to it. Verify by receiving one on a real device. If it does not work, that is a finding about the push system and the inbox half of the notification still lands.
- [ ] 7.8 Hand off to the v2 cutover list: registering the `/api/tasks/cleanup` pg_cron row, and that reconciliation does not run until it exists. Note separately that the same job also switches on staging, notification, feedback and error log retention, which is a decision of its own.

## 8. Notifications

Ships in this change, both halves (design.md, D15). Its schema change rides group 1's migration, so
8.3 must be settled before 1.3 is generated.

- [ ] 8.1 In the broadcast fan out, skip an event whose entire content is `pending` video, letting the job's own five minute cadence retry it. Verify a video-only event is not delivered while pending, is delivered once on ready, and is never delivered on failed, each seen red.
- [ ] 8.2 Emit a single follow up for an event that was delivered while its videos were pending, fired once per event when the last resolves, never once per file. Verify no follow up is produced when the videos were already ready at delivery, which is the healthy case.
- [ ] 8.3 Add a `video_ready` value to `notificationSourceType` in the SAME generated migration as `bunny_streams.readiness`, not a second one: two migrations for one change is an avoidable collision with the other worktrees generating numbers in parallel. Verify `caption.ts`'s `KEYS` record fails to compile until its key exists, which is the intended tripwire.
- [ ] 8.4 Exempt `video_ready` by name from the fan out's self filter, and amend the `actorFk` comment in `schema.ts` so code and comment agree about the invariant. Verify no other source type can now reach its own actor, seen red.
- [ ] 8.5 Produce the notification when a video promotes to `ready` more than five minutes after `files.createdAt`, with no new column and no new preference. Verify a fast upload produces nothing and a failed one produces nothing.
- [ ] 8.6 Add the `notifications_videoReady` caption key to both locales: "Your video is ready" / "Dein Video ist fertig". Verify it renders with no actor row, as its `NO_ROW` peers do.

## 9. Verification sweep

- [ ] 9.1 Over the touched paths only: `npx prettier --write`, `npx eslint`, `npx vitest run --project server` for the `*.server.test.ts` and `*.remote.test.ts` files and `--project browser` for the rest, then typecheck.
- [ ] 9.2 Run `npm run lint:duplication` and `npm run lint:unused`, and account for any `[NEW]` clone rather than accepting the baseline reflexively.
- [ ] 9.3 Drive the running app at BOTH 375x667 and 1280x800: a pending video tile, the same video in the viewer, the share sheet warning, and a ready video still playing normally. Verify in German as well as English.
- [ ] 9.4 Exercise the probe path end to end against a genuinely pending video while the host backlog still makes one reproducible, since once encoding catches up this path can only be tested by faking the 404s.
- [ ] 9.5 Delete a genuinely pending video and verify it is gone at the HOST, not only in the database. `provider.remove` treats a 404 as success, so a host side refusal mid encode would pass silently and strand an orphan the sweeper cannot collect (it only takes status 0). Same window as 9.4: this is only honestly testable while a backlog exists.
