## Context

See proposal.md for motivation. The constraints that shape the approach:

- `src/lib/videos/provider.server.ts` is a deliberate provider seam. Its own doc comment states that
  nothing else in the app calls the Bunny API, so swapping hosts is one new implementation plus the
  client transport. Readiness must not break that.
- The video host exposes **two different status enums that collide on the same integers**. The
  webhook sends `3 = Finished`, `4 = ResolutionFinished`, `5 = Failed`. The video API returns
  `3 = Transcoding`, `4 = Finished`, `5 = Error`. Reading one with the other's table is silently
  wrong for exactly the videos that matter.
- The host documents no retry and no delivery guarantee for webhooks.
- **Production has never run `/api/tasks/cleanup`.** Its pg_cron row does not exist. The repo never
  contains one: `src/routes/api/tasks/notifications/+server.ts` records the pattern and the hazard,
  "the failure mode if you forget is silent."
- No read only Bunny credential exists. `BUNNY_STREAM_API_KEY` is full access and is used for create
  and DELETE. The webhook signing secret is the library's read only key, so a new variable is needed.
- Every media query already pulls `.related('bunnyStream')` (`ascent/queries.ts`, `file/queries.ts`,
  `event/queries.ts`), and `toMediaFile` already maps one column off it (`source`).
- Notifications reach people two ways. Directed rows in `notifications` carry a NOT NULL `actorFk`
  documented as "Never the recipient: self-authored events are filtered out at fan-out", and all
  eleven existing source types are somebody else acting on you. Broadcast reaches subscribers through
  a watermark walked over the `events` feed by a job every five minutes.

## Goals / Non-Goals

**Goals:**

- One source of truth for readiness, with recovery paths that cannot corrupt it.
- No integer from either host enum escapes `bunny.provider.server.ts`.
- Reuse the existing `bunnyStream` relation and `toMediaFile` rather than adding a parallel path.
- No notification that points at something the recipient cannot watch.

**Non-Goals:**

- Changing how videos are uploaded or finalized. `createBunnyVideo` and `finalizeVideo` are untouched.
- A new entity module. Readiness is a column on an existing relation, not a new domain object.
- Optimising the probe. It is a backstop; correctness beats efficiency.

## Decisions

### D1: Three domain values, stored as a text column with an enum tuple

`bunny_streams.readiness` holds `pending | ready | failed`. The tuple is exported from
`src/lib/entities/file/dto.ts` and consumed as `text('readiness', { enum: videoReadiness })`,
matching `feedbackKind` at `schema.ts:2233`.

Not `pgEnum`. That is the older shape in this schema (`app_permission`, `app_role`,
`invitation_status`); the current precedent for a domain value set is the exported tuple, and putting
it beside `MediaFile` means the DTO and the column cannot drift.

*Alternative considered*: store the host's integer and interpret at read time. Rejected because it
puts the provider's vocabulary in the database, in the Zero schema and in every component, which is
exactly what the `VideoProvider` seam exists to prevent, and because the collision in Context means
the stored integer would not even be self describing.

### D2: Both enum mappings live behind `VideoProvider`

Add `readinessFromWebhook(status)` and `readinessFromApi(status)` to the `VideoProvider` interface,
implemented in `bunny.provider.server.ts`. The webhook route and the cron both receive a readiness
value and never see an integer. The `schema.ts` column comment states that the column holds neither
host enum.

One test pins both mapping tables. Per AGENTS.md this is tested at the call sites too, not only on
the helpers: a test that exercises the mapping function proves nothing about the route still calling
the right one of the two.

### D3: The webhook trusts its verified payload

The endpoint verifies the HMAC-SHA256 signature over the **raw** body (no JSON reserialisation)
against the library read only key, checks the version and algorithm headers, compares in constant
time, and then applies the `Status` from the payload.

*Alternative considered*: treat the webhook as a bare "something changed" ping and re-read the video
from the API. That collapses the two enum mappings into one and makes D2's collision unreachable, at
the cost of a network call per event in the critical path. Not chosen. D2 therefore has to carry the
weight instead, which is why the column comment and the call site test are part of this change rather
than nice to have.

### D4: Every write to readiness is promote only, on the server as well as the client

`ready` is a one way door. The webhook handler, the reconciliation sweep and the client probe all
refuse to move a row out of `ready`; `failed` is reachable only from `pending`.

This is on the server specifically because webhook delivery order is not guaranteed. Without it, one
late `Encoding` event arriving after `Finished` would un-publish a working video, which is the exact
failure the probe exists to catch. Building the backstop and then letting the source of truth cause
the thing it backstops would be worse than having neither.

Webhook status `4` (ResolutionFinished, the host's own "video becomes playable") promotes to `ready`;
it fires once per rendition, which is harmless because the write is idempotent under this rule.
Statuses 6 to 8 (upload lifecycle) and 9 to 10 (captions, generated metadata) are ignored.

### D5: The probe reads `playlist.m3u8`, promotes only, and never writes back

It runs only while the synced column says `pending`, and a 200 promotes that viewer's own view. It
never demotes, never declares failure, and never tells the server. Cadence is a fixed 30 seconds, and
it **pauses while the document is hidden and while the app is offline**, resuming on visibility and
on reconnect.

*Why the pause*: without it, a tab left open polls the CDN for the entire ninety minute encode for a
video nobody is looking at, which is the case reconciliation already covers. This did not matter when
the loop went terminal after seven minutes.

*Why the offline gate*: the app is offline capable for reads, so the loop would otherwise keep firing
with no network, and offline every failure is indistinguishable from "still encoding". `onlineHold`
and `online.svelte` already carry that state.

*Why the playlist and not the thumbnail*: the host's status `1` is "preview and format details
processing started", so a thumbnail can exist before playback does. Measured on 2026-09-17: a pending
video 404s on `playlist.m3u8`, `thumbnail.jpg` and `preview.webp` alike, while a finished one serves
all three. Only the playlist attests playability.

*Why no write back*: it would need an authed endpoint, a permission story, and a rule for trusting a
client's claim about a fact it cannot prove. Reconciliation already repairs the record from the
authoritative source. Keeping the override local also makes D4 trivially safe, because a local
override cannot propagate.

This **replaces** the existing backoff in `MediaThumbnail.svelte`, which currently gives up after ten
attempts (about seven minutes) and falls to `image-off`. That terminal branch is deleted, not tuned.

### D6: Reconciliation folds into the existing cleanup job, and ships inert

`/api/tasks/cleanup` already walks the entire library via `provider.listVideos`, so the API call is
already being made. A new route would mean a second pg_cron registration, and registration is exactly
what is missing.

Production has no cleanup schedule at all, so **this layer does not run until the cutover registers
one**, and the one shot sweep after migrating is the only reconciliation that happens in the meantime.
That is accepted rather than worked around: the layer exists for videos nobody is looking at, the
probe covers anyone actually watching, and inventing a second scheduling mechanism to avoid the
missing one would leave two.

### D7: Readiness rides the existing relation, not a new one

`readiness` is added to the `bunnyStream` relation already pulled by every media query, mapped in
`toMediaFile` beside `source`, and exposed on `MediaFile`. No query gains a relation and no new
entity module is created.

**Reads are Zero queries** and need no change beyond the regenerated schema, with one exception:
`src/routes/f/[id]/+page.server.ts` is a server side Drizzle read that names the relation's columns
explicitly (`bunnyStream: { columns: { source: true } }`). It must add `readiness: true` or the share
page silently sees `undefined` and renders every video as pending.

### D8: The webhook is a `+server.ts` route, not a remote function

AGENTS.md says writes are remote functions. This is a deliberate exception: the caller is the video
host, not a signed in person, so there is no session, no RLS context and no form. It is a `POST`
handler under `src/routes/api/webhooks/bunny/+server.ts` writing through `db.server`, in the same
shape as the existing `/api/tasks/*` routes, differing only in that it authenticates a signature
rather than a shared `x-api-key`.

Its authorisation is the signature and nothing else, so it must never read anything from the payload
other than the video GUID and the status, and must never create a row: an unknown GUID is a no-op,
not an insert.

### D9: UI copy is "Preparing"

Not "Processing", which is the host's word for its own machinery and would leak a provider concept
into copy. New `media_*` keys in both `messages/en.json` and `messages/de.json`. German:
"Wird vorbereitet".

`CONTEXT.md` gains a `readiness` entry under Internal terms, since this introduces a word the code
is then obliged to use consistently.

### D10: A failed video is shown, not hidden

`image-off` plus copy. The icon was always right for a genuine failure; what was wrong was firing it
at healthy videos on a timer. Hiding the tile instead is worse: the uploader remembers uploading it,
and a row that silently vanishes reads as data loss.

### D11: The signing key exists in every environment

Declared through `$env/static/private`, so it must be present at build time everywhere or the build
fails on a missing member. Dev and CI get a dummy value, which means signature verification simply
always fails there. That is correct for environments that receive no real webhooks.

*Alternative considered*: make it optional and have the route answer 503 when unset. Rejected because
it adds a branch that only ever executes where nobody is looking.

### D12: Notifications wait for the video rather than pointing at an unwatchable one

Two different mechanisms, so two different fixes.

**Broadcast, other people's videos.** The watermark job walks `events` every five minutes. Where an
event's entire content is video (a clip added to an existing ascent, or to a route), it is skipped
while that media is `pending`, and the job's own five minute cadence is the retry. Where the event
carries other news (a new ascent), it is delivered immediately, because the news is the send and
holding it for two hours is worse than a preparing tile; a single follow up then goes to the same
subscribers when the video arrives.

The follow up is **self suppressing in healthy conditions**: a one minute encode is ready before the
first fan out runs, so nothing pending is ever observed and no follow up is generated. It exists only
in the degraded state, which is when it carries information. It fires once per event when the last of
its pending media resolves, never once per file. On `failed` nothing is sent, which is only possible
because `failed` is now recorded.

**Directed, your own video.** A new `video_ready` source type with `actorFk` set to the recipient
themselves. This is not a lie about causation: the uploader did cause the video to exist, the host
merely finished the work. It needs the fan out's self filter to exempt this one source type by name,
not a general loosening, and `schema.ts`'s `actorFk` comment must be amended, since it currently
states the invariant absolutely and would otherwise contradict the code.

`caption.ts`'s `KEYS` record is exhaustive by construction, so adding the source type breaks it at
compile time until a `notifications_*` key exists. The caption names no actor, which `caption.ts`
already supports through its `NO_ROW` set.

The threshold needs no new column: the handler that promotes to `ready` compares against
`files.createdAt`, so "longer than five minutes" is a constant rather than a schema decision.

No new preference. It is self caused, fires roughly never in the healthy case, and would arrive
defaulted on; a toggle for that is settings page clutter.

### D13: Presentation mechanics reuse what is already there

The preparing tile is a skeleton in the shape `Image.svelte:79` already uses for a loading image
(`bg-surface-200-800` plus `animate-pulse`), not a new component. Skeleton ships no placeholder
primitive, but the app has fourteen instances of this pattern across eight files, so the video tile
mirrors its sibling rather than inventing a fifteenth spelling.

The pulse is left ungated. None of the other thirteen respects `prefers-reduced-motion` and there is
no global rule in any CSS, so gating only the new one would make the video tile the odd one out. The
preference is instead honoured globally in `app.css`, which fixes all fourteen at once; that is a
deliberately wider blast radius than this change otherwise has, and it is the right home for the
concern.

Two further presentation details follow from readiness rather than from taste. The tile's
`aria-label` is unconditionally `m.common_playVideo()` today, so a screen reader announces "Play
video" for something explicitly unplayable; it becomes readiness aware. And the viewer's transport
row (play, seek, mute) is suppressed while pending, because it otherwise renders `0:00 / 0:00`
against a `<video>` with no source.

### D14: Readiness does not change which videos exist

`route/queries.ts` selects routes that have beta with
`exists('files', (f) => f.where('bunnyStreamFk', 'IS NOT', null))`, which now includes videos that
cannot yet be watched. Left as is, deliberately.

*Alternative considered*: require `readiness = 'ready'` in those filters. Rejected because a route
would then appear in the filter, vanish, and reappear as its videos encode, and because the video
genuinely does exist. A person filtering for beta and finding a preparing tile has been told the
truth; one whose route silently leaves a filter has not.

### D15: The notification work ships in this change, both halves

Decided. The broadcast half was always nearly free, and the directed half turned out cheaper than
first priced because setting `actorFk` to the recipient removes the need for a system actor concept.
It directly answers "when can I share the link", which is the second pain in the proposal.

Two consequences follow and neither is optional.

**One migration, not two.** Adding `video_ready` to `notificationSourceType` is a schema change in its
own right. It rides the same generated migration as `bunny_streams.readiness`. Two migrations for one
change is worse on its own terms, and with other worktrees generating numbers in parallel a second
one is an avoidable collision.

**Push has to be verified before it is relied on.** Live push delivery has never been confirmed in
production. This change adds a new push kind to that mechanism, so "does push work at all in prod"
becomes a deployment step rather than an assumption. If it turns out not to work, that is a finding
about the push system rather than about readiness, and the inbox half of the notification still
lands.

## Risks / Trade-offs

- **Webhook URL configured before the endpoint is live** → Bunny POSTs to a 404 with no documented
  retry and those events are lost permanently. Configure the URL last, after deploy. This is the one
  irreversible step in the plan.
- **Reconciliation never runs** → production has no cleanup schedule today, so this is the default
  outcome rather than an accident, and it looks exactly like "webhooks are working fine". The one shot
  sweep is a real step whose output should be read, and the handoff to the cutover list is a task.
- **D2's collision is load bearing because of D3** → a wrong mapping is invisible in types, lint and
  any test that exercises only the helper. Mitigated by the column comment plus call site tests, and
  it stays the single most likely defect in this change.
- **All of this lands inside 48 hours of the v2 cutover** → every step except the webhook URL is
  independently reversible, and the migration is additive with a default, so a rollback of the code
  leaves a harmless unused column.
- **A genuinely failed video reads as "Preparing" until the host says otherwise** → accepted. It is
  quiet and rare, against a loud and universal alternative, and reconciliation closes it once it runs.
- **Exempting one source type from the self filter** → the filter exists to stop people being told
  about their own actions. The exemption must be by name at the filter, and the schema comment
  amended, or the next reader finds code and comment disagreeing about an invariant.
- **A new secret across three environments** → the read only key must reach Bitwarden and Vercel for
  every environment, and CI needs a dummy, or the build fails on the missing `$env/static/private`
  member.

## Migration Plan

Schema change follows the AGENTS.md pipeline: edit `schema.ts`, `generate:drizzle`, append the
backfill, `generate:zero`, `migrate`.

The column is added `NOT NULL DEFAULT 'pending'`, which is correct for rows created from then on,
and the appended backfill then sets every row **existing at migration time** to `ready`. Because the
migration runs before the new code, every row it touches predates the feature. That gives the
proposal's "existing library is not shown as preparing" without a default that would be wrong for
new uploads.

Deployment order, with the only hard constraint last:

1. Create the read only key in the Bunny dashboard.
2. Store it in Bitwarden, then push to Vercel for all three environments, and set a local value for
   dev. Add a CI dummy.
3. Migrate (column exists, nothing writes it yet, harmless).
4. Deploy the code (endpoint live, probe active, tiles honest).
5. Configure the webhook URL in the Bunny dashboard. **Not before step 4.**
6. Trigger the one shot reconciliation sweep manually and read its output.
7. Hand the cleanup pg_cron registration to the v2 cutover list.

**Rollback**: revert the deploy. The column is additive with a default and nothing else reads it, so
an unreverted migration is inert. The webhook URL should be removed from the Bunny dashboard on a
rollback, or events accumulate against a 404 for nothing.

## Open Questions

- **Whether reconciliation should later also populate `files.width` and `files.height` for video
  rows**, which would let the hidden probe `<img>` and the 16:9 guess in `MediaThumbnail.svelte` be
  deleted. Explicitly out of scope here (see proposal Non-goals); deferrable without reopening
  anything in this change.
- **Whether the uploader can be shown a frame of their own clip while it prepares.** Considered and
  dropped, recorded here so it is not re-proposed without the reason. Today the local blob is revoked
  seconds after upload (`MediaGrid.svelte:51-62`), so the only way to check you uploaded the right
  clip is to wait for it to encode, which is the same problem as deleting the wrong one from the
  other end. Extracting a poster frame needs no library, just a `<video>` and `canvas.drawImage`, but
  it needs the browser to DECODE the file: desktop Chrome and Firefox frequently cannot decode HEVC,
  which is what iPhone clips are, and iOS Safari has historically restricted seeking and frame
  reading without a user gesture. Both main paths are uncertain and the fallback is the skeleton we
  already build, so the likely outcome is the thing we have. Worth a half hour spike on a real device
  before anyone writes a task for it.
