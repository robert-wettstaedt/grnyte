## Why

Bunny's free encoding queue has degraded from roughly one minute to over ninety minutes (measured
at two and a half hours on 2026-09-17, confirmed against both the dev and prod libraries). The tile
in `MediaThumbnail.svelte` re-probes the CDN with backoff and then gives up after about seven
minutes, rendering the `image-off` icon. A healthy video that is merely queued therefore reads as
broken for most of its first two hours, telling the person who just uploaded it that their upload
failed.

The deeper problem is that nothing in the app records a video's state at all. When encoding stalled
there were no logs, no errors and no signal of any kind: the only way to learn about it was a person
noticing a tile. With roughly 500 videos in the production library, that is the gap worth closing,
and the tile is the symptom.

Once a video's state is known, a second class of problem becomes fixable: today a person is told
their friend sent a project, opens the app, finds the clip unwatchable, and has no way to learn when
it arrives except by checking back for two hours. The same person uploading their own clip cannot
tell when the shareable `/f/<id>` link will actually play.

## What Changes

- **New `bunny_streams.readiness` column** holding `pending`, `ready` or `failed`. Bunny exposes
  eleven statuses; three is what the domain has. Readiness is monotonic: `ready` is a one way door,
  and nothing may move a video back out of it.
- **New webhook endpoint** at `/api/webhooks/bunny`, the first HMAC verified public endpoint in the
  app. It verifies Bunny's signature over the raw body and writes `readiness`. It is the only thing
  that can record `failed`.
- **A client side probe of `playlist.m3u8`** that runs only while the column says `pending` and can
  only ever promote to ready, never demote and never write back. This covers webhook events lost
  while the deployment is mid rollout or Vercel is briefly unavailable.
- **Reconciliation in the existing cleanup cron**, which already walks the whole Bunny library, to
  correct rows for videos nobody is currently looking at. It ships inert: production has no cleanup
  schedule yet, and registering it belongs to the v2 cutover, not to this change.
- **A real preparing state** in the media tile and the viewer, replacing both the bare play icon and
  the false `image-off`, plus an honest unavailable state for a video that genuinely failed.
- **A warning when sharing a pending video**, so a link sent to a friend is never silently dead.
- **A global `prefers-reduced-motion` rule** in `app.css`. The preparing tile reuses the app's
  existing `animate-pulse` skeleton pattern, and none of its fourteen instances respects the
  preference today. Honouring it globally rather than special casing one new tile is a wider blast
  radius than the rest of this change, and deliberate.
- **Notifications stop pointing at videos that cannot be watched.** A notification whose entire
  content is a video is held until the video is ready, and a notification that was sent while a
  video was still pending is followed up once when it arrives. In healthy conditions no follow up is
  ever generated, because the video is ready before the first fan out runs.
- **The uploader is told when their own video is ready**, if it took longer than a short threshold,
  so they can tell when the shareable link will actually play without reopening the app.
- **A new environment variable** for the Bunny library read only key, which is the webhook signing
  secret. No read only Bunny credential exists today; `BUNNY_STREAM_API_KEY` is full access.
- **A `CONTEXT.md` entry** for `readiness` under Internal terms.

Not breaking. `/api/webhooks/bunny` is additive, no remote function is renamed or moved, no route is
reshaped, and `manifest.id` is untouched. Across the deploy an already loaded tab keeps running its
old bundle and its old probe behaviour until it reloads, which is the current behaviour and no
worse; it does not see the new column because its Zero schema predates it.

## Capabilities

### New Capabilities

- `media/video-readiness`: whether a hosted video can be played yet, how that state is learned from
  the host, how it is corrected when an event is lost, what the interface shows in each state, and
  what the notification system does about a video that cannot yet be watched.

### Modified Capabilities

None. This is the project's first spec.

## Impact

**Tables**: `bunny_streams` (new `readiness` column, plus the Zero schema regeneration and the
backfill that follows from the pipeline in AGENTS.md). `notifications` gains one `source_type` value
if the self notification ships.

**Entity modules**: `src/lib/entities/file/` (the `MediaFile` DTO and mapper carry readiness through
to the components, and the readiness value tuple lives beside them).
`src/lib/entities/notification/` (fan out filtering, the caption key, the self actor exemption).

**Provider boundary**: `src/lib/videos/provider.server.ts` and `bunny.provider.server.ts`. Two
separate Bunny status enums are involved and they collide on the same integers: the webhook's `3`
means Finished while the video API's `3` means Transcoding. Both mappings belong behind the
`VideoProvider` interface so no integer escapes that module.

**Routes**: `src/routes/api/webhooks/bunny/+server.ts` (new), `src/routes/api/tasks/cleanup/+server.ts`
(reconciliation added), `src/routes/f/[id]/+page.server.ts` (names the relation's columns explicitly,
so it must select the new one).

**Components**: `src/lib/components/Media/MediaThumbnail.svelte`, `MediaStage.svelte`,
`ShareSheet.svelte`.

**i18n**: new `media_*` keys, and one `notifications_*` caption key if the self notification ships,
in `messages/en.json` and `messages/de.json`.

**Deployment**: one hard ordering constraint. The webhook URL must be configured in the Bunny
dashboard **last**, after the endpoint is live, because Bunny POSTs to a 404 and the documentation
states no retry, so events sent before the endpoint exists are lost permanently. The one shot
reconciliation sweep after migrating is a manual step, and it is the only reconciliation that runs
until the cutover registers a cleanup schedule.

## Non-goals

- **Moving off Bunny, or buying Premium Encoding.** Both are live options and neither is settled
  here. This change makes the current behaviour honest, not faster.
- **Registering the cleanup pg_cron schedule in production, and the retention it switches on.**
  Production has never run `/api/tasks/cleanup`, so that job also prunes staging orphans,
  notifications at 30 and 90 days, feedback at 12 months (a figure published in the privacy notice,
  section 7) and error logs. Switching all of that on is a separate decision owned by the v2 cutover.
  This change only records that reconciliation does not run until it happens.
- **Populating `files.width` and `files.height` for video rows.** They are NULL for every video
  today, which is why the tile carries a hidden probe `<img>` and a 16:9 guess. Bunny returns these,
  so the cleanup is available, but it is a second change to the same components in the same 48 hours
  and it cannot fix the back catalogue faster than the daily sweep. Follow up after cutover.
- **Writing readiness back from the browser.** The probe corrects what one viewer sees; the record
  is repaired by reconciliation from the authoritative source.
- **Showing the uploader a frame of their own clip while it prepares.** Considered and dropped on the
  decode path, not on effort. See design.md, Open Questions, so it is not re-proposed blind.
- **Alerting anyone about a `failed` video.** Recording it is this change, and the uploader sees an
  honest tile. Deciding who else hears about it is not.
- **A new notification preference.** The self notification rides the existing push subscription.
- **Webhooks on the dev library.** Production only. Local development exercises the probe, which is
  the layer that otherwise never gets driven in anger.
