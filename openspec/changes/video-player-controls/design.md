# Design

## Context

See `proposal.md` for motivation and `specs/media/video-controls/spec.md` for behavior.

The controls live in three places. `MediaViewer` owns the toolbar and arrows, `MediaStage` owns the
caption and playback footer, and `/f/[id]/+page.svelte` renders `MediaStage` alone with its own logo
and toolbar. `MediaStage` is remounted per file under `{#key currentFile.id}`, so its state resets on
every page, and a new `<video>` element comes with it.

Input already passes through several layers. `deckGestures` reads swipes in the capture phase and lets
a tap through, skipping `input, button, a`. `panzoom` (d3-zoom) owns pinch, pan and double-tap on the
media node, and swallows the click that ends a drag. `clickToTogglePlay` sits on that same node. The
footer and header are full-width overlays with gradients, so today they swallow taps.

This change touches no Zero query, mutator, remote function or schema. There is nothing to backfill.

## Goals / Non-Goals

**Goals:**

- One source of truth for "are the controls visible", shared by every surface that draws them.
- Hiding removes the controls from pointer input without removing them from the keyboard or from
  screen readers.
- Open sheets and focus survive a hide.

**Non-Goals:**

- A general player component. `MediaStage` stays the only player.
- Any change to swipe, pinch, or double-tap zoom behavior.

## Decisions

### Remove code first, and let the platform carry state

Two removals land before anything is built, as task group 0:

- `MediaViewer`'s `syncedFileId` and its zoom and fallback resets. They exist to reset state when the
  open file changes, and the `{#key}` remount is already that signal. The new stage reports zoom 1 at
  mount and already reports its fallback state from an effect.
- `MediaStage`'s `onended` handler. The HTML spec has an ending element set `paused` and fire `pause`
  before `ended`, so `onpause` already covers it.

The feature then reads element state instead of mirroring it: `bind:ended`, `bind:seeking` and
`bind:readyState` replace hand-written event handlers. Seeks and steps write `videoEl.currentTime`
with no clamp of our own, because the browser bounds a seek; task 6.4 confirms that, since the bound
was checked from memory rather than the spec text.

### Visibility lives in a `createMediaChrome` factory that the page owns

Add `src/lib/components/Media/chrome.svelte.ts`, beside `toolbar.ts`, in the shape of the repo's
`create*` state factories (`createFormStore`, `createScrollSurface`). `MediaViewer` and the share page
each create one and pass it to `MediaStage` as a `chrome` prop.

It holds `visible`, one `mode` (`timed` for a video, `manual` for a photo, `pinned` for preparing,
unavailable and fallback), and a set of holds: `sheet` and `stageSheet`, because the page and the stage
each own sheets, plus a hover and a press symbol per surface, because paging unmounts the footer while
the pointer rests on an arrow. The 3 second timer runs only in `timed` mode while the video is playing and
no hold is set. A `surface` attachment goes on each control group. A press hold also covers scrubbing.
Keyboard focus is judged when it arrives, because a key press flips an already focused button to
`:focus-visible`, and compared when the timer fires, because a focused step button can unmount without a
`focusout`. Hiding takes focus off a control inside a surface, or Space would activate a button nobody can see.

Alternative: stage-owned state reported up through a callback such as `onZoomChange`. Rejected because the flow runs both ways here: hover, focus and sheets in the viewer's
toolbar have to hold a timer the stage would own, which needs a second channel back down.

### A press is classified by the `pointerdown` before it

Record `pointerType` from a capture-phase `pointerdown` on the media node, and have the click handler
read it, because `click` alone does not reliably report it across the browser floor. `touch` and `pen`
toggle visibility. `mouse` plays or pauses on a video and toggles on a photo.

Per pointer rather than by `(hover: hover)`, the query `MediaViewer` uses for its arrows, because a
touchscreen laptop has both inputs and each press should act on its own input.

Mouse reveal listens for `pointermove` filtered to `pointerType === 'mouse'` with non-zero movement,
since browsers can fire a move with no motion when content changes under a still pointer. Video.js
filters the same way. It applies to videos only: a photo has no timer, so a move would undo a hide
for good.

### Hidden controls stay mounted, and are faded with CSS

Hidden controls get `opacity-0` and lose pointer events. Do not use `{#if}` or `inert`. `{#if}` would
destroy open sheets and focus, and `inert` would remove the controls from the tab order and from
screen readers, which the spec forbids.

AGENTS.md allows a Tailwind transition here because the element is already mounted, and
`motion-reduce:transition-none` covers reduced motion. The header's inline `style:opacity` from
`chromeOpacity` would override a class, so the header computes `visible ? chromeOpacity : 0` instead.

Repeat and the stepping buttons do enter and leave the DOM, so they use a `svelte/transition` through
`motion()`.

### Footer and header pass presses through except on their controls

The overlay containers become `pointer-events-none` always, and their `a`, `button` and `input`
children `pointer-events-auto` only while visible. A tap on the empty gradient then reaches the media
and toggles, instead of being swallowed. Without this, a large part of the screen would not respond
to a tap.

### Only keyboard focus holds the controls

The focus hold applies only when the focused element matches `:focus-visible`. A touch press can leave
a button focused, so a plain `focusin` would stop auto-hide for good after the first press on mute.
Shaka separates keyboard navigation from other focus for the same reason.

### Taps reveal immediately and hide after 250 ms

A pending hide is cancelled by a second tap, so a double-tap zoom with visible controls does not
flicker. A second click is not enough to cancel it: driving real WebKit showed the controls hiding
through a double-tap, because d3 takes that tap. So the stage's `onZoom` calls `chrome.zoomed()`, which
cancels a pending hide and ignores a click arriving just after it. A pinch has no pending hide, so it
reveals nothing. d3's own double-tap window is longer, so a slow double-tap can still hide first, which
is an accepted cosmetic flicker. `panzoom` itself does not change.

### The viewer opens with focus on the deck

Zag focuses the first tabbable element on open, the uploader link. On a deep link or a keyboard open
that matches `:focus-visible`, which held the controls up indefinitely and left Space on a link, where
it does nothing for playback. `initialFocusEl` points at the deck, a `tabindex="-1"` element, so nothing
holds the controls until a reader tabs.

### Remounting already gives the per-item reset

The stage derives its `mode` and hands it to `chrome.reset(mode)` at mount. That shows controls on every
page and gives per-video speed and step state with no reset code.

### Sound lives in the stage's module script, and the mute button is its only writer

A plain `let` in `MediaStage`'s `<script module>` starts muted and lasts until a reload. It needs no
file of its own and no reactivity, because it is read only at mount. Only the mute button and `m` write
it. A forced mute from a refused autoplay leaves it alone, so the next video tries sound again.

In `hls.ts`, a rejected `play()` retries muted only for `NotAllowedError`. An `AbortError` from teardown
must stay swallowed, or a closing viewer would start playing again.

### Speed uses the existing `Modal` and `MenuRow`

The `1x` button opens `Modal` with `panel={false}` and no backdrop, listing `MenuRow selected` rows, with
a snap point tall enough for all six rows at 667 px. A
popover does not trap focus, so it avoids the nested focus trap failure that AGENTS.md describes. The stage
binds `playbackRate`. Labels format through `Intl.NumberFormat`, so German reads `0,5x`.

### Key handling is a pure function

A `mediaKeyAction(event, state)` in `src/lib/components/Media/keys.ts` returns the action or nothing,
which the stage performs from `<svelte:window onkeydown>`. It reuses `isNavKeyExempt`, with one
addition: a focused range input is not "typing", so it leaves only the arrows to the native slider.
Space is ignored on a focused `button` or `a`. It also ignores keys while a sheet is held open, matching
how `MediaViewer.onKeydown` pauses `j`/`l`.

### Repeat also covers a paused video at the end of the bar

The bar's 0.1 s step stops short of a length like 60.01 s, so a drag to the end leaves `ended` false. Do
not fix that with `step="any"`: driving a Pixel 5 showed Android keeps a stale frame on screen after a
seek to the exact end. Repeat shows when ended, or when paused within one step of the end, and it seeks
to the start itself, because `play()` only restarts an element that has truly ended.

### Tooltips bind to a wrapper, not the button

`MediaToolButton` is the one way to draw a viewer button, so its label, key and `aria-keyshortcuts` cannot
drift apart. `MediaToolTip` is the bare wrapper under it, also used for the report link and the close trigger.
It puts `KbdTooltip`'s wiring on a span around the control. Zag's
popover and dialog triggers need their own `id` and handlers on the button, and Zag finds a trigger by id, so
spreading both onto one element makes one of them lose. Hover and focus both reach the span by bubbling, since
Zag's Svelte adapter already binds `onfocusin` and `onfocusout`. The share tooltip carries the visibility status,
replacing its native `title`, which would preempt the tooltip. `MEDIA_TOOL` restates the brand focus ring, because
the glass preset's shadow beats the zero-specificity rule in `app.css` and left these buttons with no visible focus.

### Spinner and buffering state

Two derived values replace buffering event handlers. `buffering` is `!atEnd && (seeking || readyState < 3)`,
which also ends after a refused autoplay wherever the browser keeps loading, since `canplay` updates
`readyState` without `playing` ever firing. A browser that does not load without a gesture would spin over the
poster until play; that was not observed on a device, and task 11.4 checks it. `actuallyPlaying` is `!paused && !buffering`, and it drives the timer, because `play` fires
before any frame exists.

The existing spinner markup in `MediaStage` now serves both images and videos behind one derived
condition, with the `skeleton-hold` CSS utility for the 250 ms wait instead of a timer. The readiness
threshold is a literal, because `HTMLMediaElement` does not exist on the server and `/f/<id>`
server-renders.

### Poster reads a derived primitive

`poster` gets a `$derived` string from `view`, never `view` itself: `videoView` returns a fresh object
on each evaluation, and the existing comment warns that keying on it restarts a playing video.

### Safe areas reuse `p-safe-*`

`app.html` sets no `viewport-fit=cover`, so insets read 0 on iOS, while `app.css` records a measured
66 px on a Pixel 9. Swapping `p-3` for `p-safe-3` costs nothing where insets are 0.

### Reuse summary

| Need | Reuses |
| --- | --- |
| Fade duration | `motion()` from `$lib/state/motion.svelte` |
| Speed picker | `Modal`, `MenuRow` |
| Typing guard | `isNavKeyExempt` |
| Button styling | `MEDIA_TOOL` |
| Safe areas | `p-safe-*` |
| Spinner wait | `skeleton-hold` |
| Playback state | Svelte's `bind:ended`, `bind:seeking`, `bind:readyState` |
| New icons | `step-back`, `step-forward`, `rotate-ccw`, `gauge` through `icons.ts` |

## Risks / Trade-offs

- **Pausing at an exact moment takes two taps on touch** → Accepted when choosing tap-to-toggle. Stepping
  makes up for a missed frame.
- **A pointer drag would leave focus on the seek bar, taking `j`, `l` and the 5 s arrows with it** → The bar
  blurs on `pointerup`. A release outside the bar can miss that, and leaves the old behavior until focus moves.
- **Escape in a mobile sheet closes the whole viewer, for every sheet in it** → Existing behavior: the
  bottom sheet is not in Zag's dismiss stack, and phones have no Escape key. The desktop popover closes
  alone. Left as it is.
- **Pinch was never driven** → `adb` and `idb` send one finger here, so task 3.3 stays open for a pinch
  by hand. Everything else in it ran with real touch on the iOS Simulator and a Pixel 5.
- **A pause via click and the following reveal could race with the 250 ms hide** → A mouse press never
  schedules a hide. Covered by the state tests.
- **A 1/30 s step can show no change on 24 fps footage, and skips a frame at 60 fps** → Accepted, and
  labelled "step". Storing frame rates is the upgrade path.
- **"Repeat" in English is also an ascent type shown in the same caption** (`ascents_form_typeRepeat`) →
  Kept by request, and the button's icon and centered position separate them. German is distinct:
  `Wiederholung` for the ascent, `Wiederholen` for the button. Worth a look during driving.
- **Hiding controls could conflict with screen reader use** → They stay in the accessibility tree and
  reveal on focus. VoiceOver is checked in the sweep, as a virtual cursor may not fire focus events.
- **WCAG status of auto-hide is unsettled** ([w3c/wcag#2007](https://github.com/w3c/wcag/issues/2007)) →
  Pausing stops the timer and keyboard focus holds the controls. No setting is added.

## Migration Plan

None. The change is client-only, and rollback is a revert. Hiding lands first in `tasks.md`, so it can
ship before the playback features if the change has to be split.
