# Proposal

## Why

The fullscreen media viewer draws its toolbar, caption and playback controls over the media at all
times. They cover the bottom of the frame, which is often where the feet and the action are, and a
reader has no way to clear them. The player also lacks basics that a reader studying beta needs:
slow motion, stepping, keyboard control, and any sign that a video is buffering.

## What Changes

- Controls can be hidden. On touch, a tap on the media toggles them, and pausing moves to the play
  button. With a mouse, a click still plays or pauses and moving the mouse reveals them.
- During actual playback, controls hide after 3 seconds. A paused video never auto-hides, though a
  tap can still hide its controls.
- Hiding covers the toolbar, caption, playback controls and desktop arrows. Paging to another item
  brings them back. The logo on the share page stays visible.
- Photos in the same viewer get tap-to-hide, with no timer.
- Controls are laid out in two rows: the seek bar above, buttons below.
- New playback features: speed (0.25x to 2x), stepping while paused, a Repeat button when a video
  ends, keyboard shortcuts, and a sound setting remembered until the page reloads.
- Smaller fixes: a buffering spinner, the existing poster on the `<video>`, and safe-area padding.

**Non-goals**

- A loop toggle or looping by default. Repeat is offered only when a video ends.
- True fullscreen. The viewer already fills the window.
- Picture-in-picture. Paging or closing the viewer would end it.
- Double-tap to seek. Double-tap keeps zooming.
- Exact frame stepping, which would need a stored frame rate.
- A "keep controls visible" setting.
- Captions or subtitles.

## Capabilities

### New Capabilities

- `media/video-controls`: how the media viewer's controls show and hide, and how a reader controls
  video playback in it.

### Modified Capabilities

None. `media/video-readiness` already owns the preparing and unavailable states, and this change
only keeps controls visible in them.

## Impact

- **Components:** `src/lib/components/Media/MediaStage.svelte`, `MediaViewer.svelte`, and a new
  controls-visibility module beside them.
- **Routes:** `src/routes/f/[id]/+page.svelte` (the public share page reuses `MediaStage`).
- **Video playback:** `src/lib/videos/hls.ts`, whose autoplay gains a muted retry.
- **Shared code:** `src/lib/components/Icon/icons.ts` and both `messages/*.json`.
- **Entity modules and tables:** none. No entity module, table, Zero query, mutator or remote
  function changes, and there is no schema change.
- **Client-breaking changes:** none. No URL, remote function export or `manifest.id` changes. An
  already-loaded tab keeps the old player until it reloads, and nothing it calls goes away.
