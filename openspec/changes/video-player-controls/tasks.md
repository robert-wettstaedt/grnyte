# Tasks

## 0. Subtract first

- [x] 0.1 `MediaViewer.svelte` and `MediaStage.svelte`: have the stage report zoom 1 at mount, then delete `syncedFileId`, its zoom and fallback resets, and the `stageZoom = 1` in `commit`. Verify zooming a photo, paging with an arrow and `?media=` back navigation all leave swipe working on the next item, and paging away from a forced iframe fallback removes the touch arrows.
- [x] 0.2 `MediaStage.svelte`: delete the `onended` handler. Verify the play button shows the play icon when a video ends, in Chrome, Firefox and Safari.

## 1. Visibility state

- [x] 1.1 Add `createMediaChrome` in `src/lib/components/Media/chrome.svelte.ts` (visible, reset, toggle, reveal, playing, holds, and a `timed`, `manual` or `pinned` mode) with `chrome.svelte.test.ts` under fake timers covering: 3 s hide only while playing, paused never auto-hides, a manual hide stays hidden while paused, a hold blocks the timer and restarts it on release, 250 ms cancellable hide, `manual` has no timer, `pinned` ignores toggle. Verify each test red by breaking its branch once.
- [x] 1.2 Add the `surface` attachment to the same module: mouse hover hold, `:focus-visible` focus hold with reveal, and a press hold until release. Extend the test file, including that a focused element not matching `:focus-visible` sets no hold, and verify red.

## 2. Wire hiding into the surfaces

- [x] 2.1 `MediaViewer.svelte`: create the chrome, pass it to `MediaStage`, apply hidden classes and the `surface` attachment to header and arrows, and combine the header's `chromeOpacity` with visibility. Verify by typecheck and by the header fading with a temporary manual toggle.
- [x] 2.2 `MediaViewer.svelte`: hold `sheet` while `shareOpen`, `sourceOpen` or `confirmOpen` is true. Verify by opening share over a playing video and watching the controls stay.
- [x] 2.3 `f/[id]/+page.svelte`: create the chrome, pass it to `MediaStage`, apply it to the toolbar and not the logo, bind the open state of its currently uncontrolled `ConfirmDialog` and `RemovalChoice`, and hold `sheet` from them and `shareOpen`. Verify `page.svelte.test.ts` still passes and the logo stays on screen when hidden.
- [x] 2.4 `MediaStage.svelte`: accept `chrome`, derive its `mode` for video, photo, preparing, unavailable and fallback, call `reset` at mount, add `bind:seeking` and `bind:readyState`, and report the derived `actuallyPlaying`. Verify a preparing video and a forced iframe fallback keep their controls.
- [x] 2.5 `MediaStage.svelte`: make the footer `pointer-events-none` with controls `pointer-events-auto` only while visible, apply the hidden classes and the `surface` attachment, and hold `sheet` for the ascent details. Do the same pass-through for the viewer header. Verify a tap on the footer's empty gradient toggles, and a tap where delete sits while hidden opens nothing.

## 3. Press handling

- [x] 3.1 `MediaStage.svelte`: replace `clickToTogglePlay` with handling that classifies by the preceding `pointerdown`: touch and pen toggle, mouse plays or pauses a video and toggles a photo. Verify at 375x667 with touch emulation and at 1280x800 with a mouse.
- [x] 3.2 `MediaStage.svelte`: reveal on mouse `pointermove` with non-zero movement on videos only, and hide the cursor while hidden over a video. Verify the mouse reveals a hidden video and does not reveal a hidden photo.
- [x] 3.3 (iOS Simulator and Pixel 5 driven; pinch and zoomed pan confirmed by hand on the Pixel) Drive real touch on the iOS Simulator and an Android device or emulator: single tap, double-tap zoom with visible and hidden controls, swipe page, swipe dismiss, pinch, zoomed pan. Verify no toggle on a drag and no flicker on a quick double-tap, and record any d3 interaction in `design.md`.

## 4. Layout

- [x] 4.1 `MediaStage.svelte`: move to two rows, the seek bar with both times above a row with play, a spacer and mute. Verify at 375x667 and 1280x800 in English and German that nothing wraps or clips.
- [x] 4.2 Swap `p-3` for `p-safe-3` on the footer and viewer header, and offset the share page's corner clusters the same way. Verify with an emulated inset.

## 5. Sound

- [x] 5.1 `MediaStage.svelte`: add a `let` in `<script module>`, seed `muted` from it, and write it only from the mute button. Verify by unmuting, paging, and reading the next video's state, and that a reload starts muted.
- [x] 5.2 `src/lib/videos/hls.ts`: retry muted on `NotAllowedError` only, in both branches, with `hls.test.ts` covering retry on `NotAllowedError` and no retry on `AbortError`. Verify both tests red by mutating the error check.

## 6. Speed and stepping

- [x] 6.1 Add `step-back`, `step-forward` and `rotate-ccw` to `icons.ts`. Verify by typecheck on `IconName`.
- [x] 6.2 i18n: add `media_repeat`, `media_speed`, `media_stepBack` and `media_stepForward` to both `messages/en.json` and `messages/de.json` through `add-i18n-keys`, proposing "Repeat" / "Wiederholen", "Speed" / "Geschwindigkeit", "Step back" / "Schritt zurück", "Step forward" / "Schritt vor". Verify keys are sorted and contain no em-dashes.
- [x] 6.3 `MediaStage.svelte`: add the speed button and picker with `Modal` and `MenuRow`, bind `playbackRate`, and hold `sheet` while open. Verify picking 0.5x changes speed, the label reads `0,5x` in German, and paging resets to 1x.
- [x] 6.4 `MediaStage.svelte`: add step buttons, shown only while paused through `motion()`, writing `videoEl.currentTime` directly with no clamp of our own. Verify position changes by about 1/30 s, stays at 0:00 when stepping back at the start, and stops at the end when stepping forward, and add a clamp only if a browser fails that.

## 7. Repeat

- [x] 7.1 `MediaStage.svelte`: add `bind:ended`, and reveal the chrome when it turns true. Verify a video that ends with hidden controls brings them back.
- [x] 7.2 `MediaStage.svelte`: render the centered Repeat button while ended and visible, with a transition through `motion()`, calling the existing `togglePlay`. Verify it restarts from 0:00 keeping sound and speed, in Chrome, Firefox and Safari, and verify a tap hides it and the last frame stays, the next tap restores it, and seeking back removes it.

## 8. Keyboard

- [x] 8.1 Add `mediaKeyAction` in `src/lib/components/Media/keys.ts` with `keys.test.ts`, covering every mapped key, Space on a focused button, typing in a field, a focused range input, an open sheet, step keys while playing, and speed limits. Verify red by breaking the guards once.
- [x] 8.2 `MediaStage.svelte`: perform the actions from `<svelte:window onkeydown>`, each revealing the controls. Verify at 1280x800 with every key, and that `j` and `l` still page.

## 9. Buffering and poster

- [x] 9.1 `MediaStage.svelte`: extract the spinner to a snippet and show it from the derived `buffering`, with `skeleton-hold` for the 250 ms delay. Verify by throttling the network, including that the controls do not reveal and that a refused autoplay shows no endless spinner.
- [x] 9.2 `MediaStage.svelte`: add `poster` from a derived string. Verify playback does not restart when a readiness probe updates, and a missing poster draws no broken image.

## 10. Stage wiring tests

- [x] 10.1 Add `MediaStage.svelte.test.ts` at the rendered stage: a tap does not pause, a mouse click does, Repeat shows only when ended, step buttons only while paused, sound carries to the next mount and speed resets to 1x. Write these alongside groups 3 and 5 to 8, one test before each edit, and verify each seen red.

## 11. Verification sweep

- [x] 11.1 Over the touched paths, run `npx prettier --write`, `npx eslint`, `npx vitest run --project browser` for the new tests and `page.svelte.test.ts`, and typecheck with `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json`. Verify all pass, and run `svelte-autofixer` on the changed Svelte files.
- [x] 11.2 Run `npm run lint:duplication` and `npm run lint:unused`. Verify no `[NEW]` clones and no unused exports.
- [x] 11.3 Drive the running app at 375x667 and 1280x800, in both the in-app viewer and `/f/<id>` while signed out, through the spec's scenarios, in English and German and with reduced motion. Verify against `specs/media/video-controls/spec.md`, and close the browser pages afterwards.
- [ ] 11.4 (needs a person with a real iPhone) Drive on a real iPhone over Tailscale: seek bar not fighting the system bottom-edge swipe, sound refused then muted, no endless spinner when Low Power Mode refuses autoplay, and a VoiceOver pass reaching hidden controls. Verify each, and record any failure in `design.md`.

## 12. Tooltips

- [x] 12.1 Add `MediaToolTip`, which puts `KbdTooltip` on a span around a button, with tests that the name and key are visible on hover and keyboard focus and hidden otherwise. Verify both seen red.
- [x] 12.2 Wrap every viewer and `/f` button with its key, add `aria-keyshortcuts`, and leave the seek bar without one. Verify the attribute tests seen red, and that speed, share and delete still open with the tooltip closed.
- [x] 12.3 Restate the brand focus ring in `MEDIA_TOOL`. Verify a computed two-tone ring on a tabbed button and in a screenshot.
- [x] 12.4 Rerun the verification sweep over these paths. Verify in Chrome at 1280 and 375 and in Firefox at 1280.

## Workflow follow-up

- Offer `/review-loop` after implementation, then archive the change once review is done.
