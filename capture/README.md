# Landing clip capture

Scratch. Delete with `capture/` once the clips ship.

## Once per machine

```sh
# idb hangs enumerating physical devices on Xcode 26; simulators only.
idb_companion --udid 245A53D9-0CF6-45DC-B251-C99194E02A34 --only simulator &
# prints {"grpc_port":N}; export COMPANION=localhost:N if it is not 10882
```

The simulator needs the grnyte PWA installed from the preview
(<https://macbook-pro.tail5ffd65.ts.net:9173>, Share > Add to Home Screen) and signed in as
`anna@grnyte.rocks`. A home-screen web app has its own storage, so signing in inside Safari does not
carry over.

## Shooting

```sh
npm run preview                 # 4173, fronted by Tailscale on 9173. NOT 4178 - check the port
./capture/shoot.sh map          # -> capture/raw/map.mp4 + .timeline.json + .rec.json
./capture/cut.sh map 0.9 6.6    # -> static/shot-map.mp4 + shot-map.jpg
./capture/variant.sh dark-en    # the whole set, into capture/variants/<name>/
```

Every clip is a pair: `clips/<name>.setup.sh` navigates to the starting screen unrecorded, and
`clips/<name>.py` is the recorded gesture script. **Both assume the app is on `/explore` with no
sheet open** (the logbook pair only needs the tab bar visible). Check with a screenshot before
rolling; there is no way to force a route, because a home-screen web app cannot be launched or
terminated with `simctl`.

`shot-logbook.mp4` is two takes: `logbook-a` (feed) and `logbook-b` (profile), joined by
`splice.sh`. That is the clip's one permitted hard cut.

## Why the gestures are Python and not `idb ui swipe`

`idb ui swipe` is a straight line at constant velocity and it **ends with an explicit lift**, so
chaining swipes gives N separate flicks rather than one drag. But in idb's HID protocol a touch
_move_ is just another DOWN at a new point, so `DOWN(p0) .. DOWN(pn), UP` is a single held drag
along any path with any easing. `rig.py` does that over idb's own gRPC client; `clips/*.py` are
waypoints and durations.

`idb ui tap` and `rig.py` both take **points** (402x874). Screenshots are **pixels** (1206x2622).
Divide by 3.

## Things that cost hours, in the order they bit

- **A pinch is only as smooth as its step count.** idb expands a pinch into
  `|r*scale - r| / 10` steps, so radius and duration decide the frame rate, not the look you
  wanted. `r=60, scale=2.2, 1.3s` measured **9.3 fps** on screen - that is what "choppy" is.
  `r=90, scale=2.2, 0.5s` measures **32 fps**. Fingers sit at `centerX +/- r`, so a radius past
  ~150 puts them in the iOS edge zones and the gesture silently stops working.
- **Measure the frame rate, do not eyeball it.** `ffprobe -show_entries frame=pts_time` on the raw
  take, bucketed against the timeline, tells you which gesture is stuttering. Every other gesture
  in these clips runs 30-47 fps; only the pinch ever did not.
- **simctl emits a frame only when the screen CHANGES.** A still hold emits nothing at all. That
  is why `cut.sh` runs `fps=30 -fps_mode cfr` (a hold becomes duplicated frames, not a gap) and
  `tpad=clone` (a take ENDING on a hold stops early, and the cut would come back short with no
  error). It is also what makes alignment free: the take's second frame IS the first gesture's
  response, so `overlay.py` fits the timeline to the take instead of trusting the clock.
- **The companion plays a queued stream ~6% slow.** Over eleven seconds that is half a second by
  the end, which is twice the touch dot's lead-in. `overlay.py: align()` measures the rate from
  two anchors rather than assuming 1.0.
- **`send_events` returns when the stream is QUEUED, not played.** Without the wait in `rig.run`
  the process exits early and `shoot.sh` kills the recorder mid-gesture.
- **Do not hard-code a map pin.** Where a pin lands after a scripted zoom depends on the framing
  the setup started from; a light-mode run put it 40pt off and the take ended on a dead screen
  with nothing to say it had failed. `findpin.py` measures it while the search filter still hides
  every other block. Relatedly, OpenLayers snaps to an integer zoom on release, so two identical
  **pinch** round-trips landed 32pt apart - the map clip zooms with the `[+]` control, which
  animates about the exact view centre and is an exact inverse of `[-]`.
- **A killed `shoot.sh` leaves the recorder wedged.** Every later attempt fails with "Host
  recording is already in progress" and `pkill` will not clear it. Only `simctl shutdown` + `boot`
  does, and that resets appearance, status bar, location and the home-screen layout.
- **`ffmpeg -ss` before `-i`** seeks unreliably on these files (they report a bogus 600 fps).
  `cut.sh` trims with a filter instead; do the same when checking frames.
- **`raw/` holds whatever variant was shot LAST.** Re-cutting `raw/map.mp4` to reship the map clip
  quietly replaced the dark English take with a light German one: the cut succeeded, the file
  looked right in a listing, and only a frame told the truth. Reship from `variants/<name>/`, and
  reshoot before re-cutting from `raw/`. Same class of mistake as the segment clobber below it.
- **Rebuild the preview mid-session and the app grows a banner.** "A new version is ready /
  Reload" is the `StatusBar` update notice, it is sticky until tapped, and it will sit at the top
  of every take from then on. Tap Reload before shooting. The reload also clears whatever the map
  was tracking, which is worth having anyway.
- **Theme** follows the simulator (`xcrun simctl ui <udid> appearance light|dark`) because the
  app's Theme setting is System. **Locale** is a cookie, so it changes in the app's own settings.

## Touch dots

Apple's App Store preview rules permit "graphic elements, such as touch hotspots" and ban animated
hands, so `overlay.py` draws an abstract dot and never a finger. It has to be composited:
`ShowSingleTouches` draws indicators in the Simulator _window_ but they never reach
`simctl io recordVideo` output. The dot leads each gesture by 220ms, which is anticipation rather
than decoration - at 238 CSS px the eye has to arrive before the payoff or it blinks through it.

`cut.sh --no-dots` turns them off; `--nudge S` shifts them if a fit ever looks wrong.

## The purple status bar

An installed iOS PWA paints its status bar from the `theme_color` in the manifest it read **at
install time**, and the simulator's install predates the fix: it cached `#8E43B2`, so every take
carries a purple band the shipped app does not have. `vite.config.ts` is on `#19171b` now, and a
freshly installed copy is correct.

Reinstalling would mean signing in again and reshooting every approved clip, so `cut.sh` repaints
the band instead: key the flat fill out of the top 186px (62pt of safe area at 3x) and lay
`#19171b` behind it. Keyed rather than boxed, so the clock, signal and battery survive. It is a
no-op on a take that was already neutral.

## Manifest screenshots

`static/screenshot-*.jpg` are the PWA manifest's `screenshots`, shown by install dialogs and
store listings. They are the app in use - topo viewer, region map, logbook - because that is what
the member is for; 1.0 pointed them at the landing page only because there was nothing else.

They are NOT the clips' posters. A poster is 604px wide (sized for a 238 CSS px figure), is a
re-encoded CRF 30 video frame, and is chosen to be a calm FIRST frame - `shot-topo.jpg` is the
block page, not the topo viewer the clip exists to show.

```bash
./capture/still.sh topo        # drive the app to the state first; -> static/screenshot-topo.jpg
```

`still.sh` repaints the status bar exactly as `cut.sh` does and scales to 1024 wide, because
every `narrow` entry has to share one aspect ratio. The wide one is a 1638x1024 browser against
`npm run dev`, signed in as the fixture's `anna`; set the browser's geolocation near the fixture
or the block card reads "6,476 km away".

## Quality settings

`cut.sh` encodes at CRF 30, **measured not assumed**: downscale a text-heavy frame to 476px (the
real display width at 2x) and CRF 26, 28, 30 and 32 are indistinguishable, while CRF 26 costs
2.0MB for eleven seconds that CRF 30 does in 740KB. Judge any change that way, never at full size.

Keep the width at 604 (`scale=604:-2`). The landing frame is `aspect-9/19.5` with `object-cover`,
and mixing widths across the three shots gives visibly inconsistent sharpness in one row.
