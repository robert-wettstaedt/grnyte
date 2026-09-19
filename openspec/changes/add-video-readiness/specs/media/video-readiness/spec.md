## Purpose

Whether a hosted video can be played yet, how the app learns that from the video host, how it
recovers when the host's notification is lost, what a reader sees while a video is still being
prepared, and how the person who uploaded it learns that it is playable.

## ADDED Requirements

### Requirement: Every hosted video has a recorded readiness

The system SHALL record, for every hosted video, whether it is `pending` (accepted by the host but
not yet playable), `ready` (playable) or `failed` (the host will never produce a playable video).
Readiness SHALL be readable without contacting the video host.

#### Scenario: A newly attached video starts pending

- **WHEN** a video is attached to an entity and the host has not yet reported it playable
- **THEN** its readiness is `pending`

#### Scenario: Readiness is available offline to a reader

- **WHEN** a reader opens a screen listing videos
- **THEN** each video's readiness is available from synced data without any request to the video host

### Requirement: What a reader is shown reads against their effective readiness

Effective readiness is the recorded readiness, or `ready` where this reader has since observed the
video to be playable. Every requirement about what a reader is SHOWN SHALL be read against effective
readiness and never against the record directly, and the observation SHALL NOT change the record.

Stated once, here, because it is the distinction every presentation surface has to make and the one
they are most likely to make differently: a surface reading the record alone is a defensible reading
of any requirement that says "a `pending` video" without this.

#### Scenario: A reader who has seen the video play

- **WHEN** a reader has observed a `pending` video to be playable
- **THEN** every surface shows it as playable to that reader, including the share surface

#### Scenario: A reader who has not

- **WHEN** no such observation has been made
- **THEN** the surfaces show the recorded readiness

### Requirement: Readiness is monotonic

Once a video is `ready` the system SHALL NOT move it to any other readiness. A video that is
playable never stops being playable, so no notification, reconciliation or client observation may
demote it. `failed` SHALL be reachable only from `pending`.

#### Scenario: A late or out of order notification cannot demote a playable video

- **WHEN** the host reports an earlier stage for a video already recorded as `ready`
- **THEN** the video remains `ready`

#### Scenario: A failure after the video became playable does not hide it

- **WHEN** the host reports a failure for a video already recorded as `ready`
- **THEN** the video remains `ready`

### Requirement: Status notifications from the host are authenticated

The system SHALL expose an endpoint that accepts video status notifications from the video host, and
SHALL reject any notification whose authenticity cannot be cryptographically verified as originating
from the host. A rejected notification SHALL NOT change any recorded readiness.

#### Scenario: An unsigned notification is refused

- **WHEN** a status notification arrives without a valid signature
- **THEN** the request is rejected and no readiness changes

#### Scenario: A forged notification for someone else's video is refused

- **WHEN** a status notification arrives with an invalid signature naming a video the app holds
- **THEN** the request is rejected and that video's readiness is unchanged

#### Scenario: A verified notification is applied

- **WHEN** a status notification arrives with a valid signature reporting a video playable
- **THEN** that video's readiness becomes `ready`

### Requirement: A video becomes ready as soon as it is playable

The system SHALL treat a video as `ready` at the first point the host reports it playable, not only
when the host has finished producing every rendition.

#### Scenario: First rendition finished

- **WHEN** the host reports that one rendition has finished and the video is playable
- **THEN** readiness becomes `ready` even though other renditions are still being produced

### Requirement: A waiting video is never presented as broken

The system SHALL NOT present a `pending` video as failed, damaged or unavailable, and SHALL NOT
derive a failure from elapsed time. Only the video host may establish that a video has failed.

#### Scenario: A video still pending after several hours

- **WHEN** a video has been `pending` for longer than any expected preparation time
- **THEN** it is still presented as being prepared, not as broken

#### Scenario: A video the host reports as failed

- **WHEN** the host reports that preparation failed
- **THEN** readiness becomes `failed` and the video is presented as unavailable

### Requirement: A pending video is presented as being prepared

In every surface that shows a video, the system SHALL show a `pending` video as being prepared, with
copy explaining that it will appear on its own, in each supported locale. A `pending` video SHALL
NOT present a control that promises playback, and SHALL remain openable so that it can still be
managed.

#### Scenario: A pending video in a media grid

- **WHEN** a reader sees a tile for a `pending` video
- **THEN** the tile shows a preparing state with explanatory copy rather than a play control or a
  broken media icon

#### Scenario: A pending tile can still be opened

- **WHEN** a reader selects a tile for a `pending` video
- **THEN** the video opens, so the actions that live there remain reachable

#### Scenario: A pending video opened in the viewer

- **WHEN** a reader opens a `pending` video
- **THEN** the viewer shows the preparing state, retaining the surrounding context the reader
  depends on, rather than delegating to the host's own holding page

#### Scenario: Copy is available in both locales

- **WHEN** the interface is in either supported locale
- **THEN** the preparing copy is presented in that locale

### Requirement: A failed video is presented as unavailable with an explanation

The system SHALL present a `failed` video as unavailable, with copy explaining that it cannot be
played, in each supported locale. It SHALL NOT hide the video: a person who uploaded it remembers
doing so, and a tile that silently disappears is less honest than one that explains itself.

#### Scenario: A failed video in a media grid

- **WHEN** a reader sees a tile for a `failed` video
- **THEN** the tile shows an unavailable state with explanatory copy, and the video is not hidden

#### Scenario: A failed video opened in the viewer

- **WHEN** a reader opens a `failed` video
- **THEN** the viewer explains that it cannot be played rather than attempting playback

### Requirement: A video that is not ready can still be managed

A `pending` or `failed` video SHALL remain openable and SHALL offer the same management actions as a
playable one, in particular deletion. Readiness SHALL NOT gate any action other than playback, and
SHALL NOT change which videos a listing or a filter includes. A person who uploaded the wrong clip
must not have to wait for it to become playable before removing it, and at current preparation times
that wait would be hours.

#### Scenario: Deleting a video that is still being prepared

- **WHEN** a person opens a `pending` video they uploaded by mistake
- **THEN** they can delete it without waiting for it to become playable

#### Scenario: Deleting a failed video

- **WHEN** a person opens a `failed` video
- **THEN** they can delete it

#### Scenario: A filter that selects videos

- **WHEN** a reader filters for routes that have video
- **THEN** routes whose only video is `pending` are still included, so a route never silently leaves
  a filter and rejoins it later

#### Scenario: Deletion reaches the host

- **WHEN** a `pending` video is deleted
- **THEN** it is removed at the video host as well, leaving nothing behind that outlives the record

### Requirement: Sharing a pending video warns the sharer

When a reader shares a video that is not yet `ready`, the system SHALL tell them that the link will
not play yet, so a link sent outside the app is never silently dead.

#### Scenario: Sharing a pending video

- **WHEN** a reader opens the share surface for a `pending` video
- **THEN** they are told the video is still being prepared and that the link will not play yet

#### Scenario: A shared link opened while still pending

- **WHEN** somebody opens a shared link for a `pending` video
- **THEN** the page shows the preparing state rather than appearing broken

### Requirement: A lost status notification is recovered

The system SHALL correct readiness without a further notification from the host, because
notifications may be lost while the application is unavailable or mid deployment and the host does
not guarantee redelivery. Recovery SHALL work both for a video someone is looking at and for one
nobody has opened.

#### Scenario: A reader is looking at a video whose notification was lost

- **WHEN** a video is recorded `pending` but is in fact playable, and a reader has it on screen
- **THEN** that reader sees it become playable without waiting for a scheduled job

#### Scenario: Nobody has opened the video

- **WHEN** a video is recorded `pending` but is in fact playable, and no reader has it on screen
- **THEN** a scheduled reconciliation against the host corrects the recorded readiness

#### Scenario: A client observation never corrupts the record

- **WHEN** a reader's own observation of a video differs from the recorded readiness
- **THEN** the reader's view reflects the observation but the recorded readiness is changed only by
  the host or by reconciliation

### Requirement: Videos that predate readiness are not presented as pending

On introducing readiness, the system SHALL NOT present the existing library as being prepared, and
SHALL establish the true readiness of every existing video from the host.

#### Scenario: The existing library on release

- **WHEN** readiness is introduced for a library of already playable videos
- **THEN** none of them is presented as being prepared

#### Scenario: An existing video that is genuinely not playable

- **WHEN** readiness is introduced while some existing videos are genuinely still being prepared or
  have failed
- **THEN** reconciliation against the host establishes their true readiness

### Requirement: The uploader is told when their own video is ready

When a video takes longer than a short threshold to become playable, the system SHALL tell the person
who uploaded it, so they do not have to keep reopening the app to find out. Below that threshold it
SHALL NOT, because the uploader is still present and can see it appear.

#### Scenario: A slow upload

- **WHEN** a video the reader uploaded becomes `ready` later than the threshold after upload
- **THEN** the uploader is told their video is ready

#### Scenario: A fast upload

- **WHEN** a video the reader uploaded becomes `ready` within the threshold
- **THEN** no notification is produced

#### Scenario: A failed upload

- **WHEN** a video the reader uploaded becomes `failed`
- **THEN** no readiness notification is produced, and the uploader learns from the video's own
  unavailable state
