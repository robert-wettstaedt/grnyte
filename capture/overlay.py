#!/usr/bin/env python3
"""Render the touch-dot overlay for one take. Scratch, dies with capture/.

Apple's App Store preview rules permit "graphic elements, such as touch hotspots" and ban
animated hands, so this draws an abstract dot and never a finger. It has to be composited
here rather than captured: `defaults write com.apple.iphonesimulator ShowSingleTouches 1`
draws indicators in the Simulator WINDOW but they never reach `simctl io recordVideo`
output, which is why scripted coordinates are the only source.

The dot leads each gesture by LEAD seconds. That is anticipation, not decoration: at this
display size the eye has to arrive before the payoff or the payoff is the thing it blinks
through.

Writes a PNG sequence at the CUT resolution; cut.sh overlays it after the scale.
"""

import argparse
import json
import math
import os
import struct
import subprocess
import zlib

PT_TO_PX = 604.0 / 402.0  # cut is 604 wide, device is 402 points
DIAM_PT = 44.0  # the iOS hit target; smaller than this disappears at 238 CSS px
# The dot's colour. White over the dark app; a white dot on the light theme's near-white sheet
# is invisible for the whole sheet drag, which is the one gesture that most needs to be read.
INK = 255
FILL = 0.40
STROKE = 0.95
STROKE_W = 2.2
# How far ahead of the touch the dot appears, and it is set by the WORST gesture, not an average.
# Alignment pins the dot to the touch; how long after the touch the app moves is the app's
# business, and it differs per surface - a scroll view swallows a threshold first, a pan responds
# on the same frame. Measured on one take at LEAD 0.22 the dot-to-motion gap came out 0.27 /
# 0.23 / 0.33 / 0.17 / 0.07s across the five gestures, and the 0.07 read as the dot arriving WITH
# the movement rather than before it. At 0.40 the spread is 0.43 / 0.33 / 0.43 / 0.27 / 0.23, so
# even the most responsive gesture keeps a real anticipation beat. Re-measure rather than nudge:
# compare "first frame with a dot" against "first frame that moved" per gesture.
# Upper bound: consecutive gestures are 0.55s apart, and FALL + this must stay under that.
LEAD = 0.40
RISE = 0.14  # fade + scale in
FALL = 0.15  # fade out after the lift
# Short and faint on purpose. At 0.26s with seven ghosts the tail reads as a CHAIN of separate
# circles trailing the dot rather than as motion blur, which is worse than no trail at all.
TRAIL = 0.16  # seconds of path drawn behind a moving dot


def png(width, height, buf):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += buf[y * stride : (y + 1) * stride]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
        + chunk(b'IEND', b'')
    )


def blend(buf, w, h, cx, cy, r, alpha):
    """One anti-aliased dot: translucent disc plus a hard rim so it survives a photo."""
    if alpha <= 0.004 or r <= 0:
        return
    x0, x1 = max(0, int(cx - r - 2)), min(w - 1, int(cx + r + 2))
    y0, y1 = max(0, int(cy - r - 2)), min(h - 1, int(cy + r + 2))
    inner = r - STROKE_W
    for y in range(y0, y1 + 1):
        dy = y + 0.5 - cy
        row = y * w * 4
        for x in range(x0, x1 + 1):
            dx = x + 0.5 - cx
            d = math.sqrt(dx * dx + dy * dy)
            disc = min(max(r - d + 0.5, 0.0), 1.0)
            if disc <= 0:
                continue
            ring = min(max(min(d - inner + 0.5, r - d + 0.5), 0.0), 1.0)
            a = max(FILL * disc, STROKE * ring) * alpha
            if a <= 0.004:
                continue
            i = row + x * 4
            old = buf[i + 3] / 255.0
            out = a + old * (1 - a)
            buf[i] = buf[i + 1] = buf[i + 2] = INK
            buf[i + 3] = int(out * 255 + 0.5)


def envelope(t, t0, t1):
    """Alpha and scale for a dot whose touch runs t0..t1."""
    if t < t0 - LEAD or t > t1 + FALL:
        return 0.0, 1.0
    if t < t0:
        u = (t - (t0 - LEAD)) / RISE
        if u >= 1:
            return 1.0, 1.0
        u = min(max(u, 0.0), 1.0)
        return u, 0.8 + 0.2 * u
    if t <= t1:
        return 1.0, 1.0
    return max(0.0, 1.0 - (t - t1) / FALL), 1.0


def sample_path(samples, t):
    if t <= samples[0][0]:
        return samples[0][1], samples[0][2]
    if t >= samples[-1][0]:
        return samples[-1][1], samples[-1][2]
    lo, hi = 0, len(samples) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if samples[mid][0] <= t:
            lo = mid
        else:
            hi = mid
    a, b = samples[lo], samples[hi]
    span = b[0] - a[0]
    f = 0.0 if span <= 0 else (t - a[0]) / span
    return a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f


def frame_times(src):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pts_time',
         '-of', 'csv=p=0', src],
        capture_output=True, text=True, check=True,
    ).stdout.replace(',', ' ').split()
    return [float(x) for x in out]


# When a gesture first MOVES something, in script time and in events. A drag or a pinch moves
# from its own start; a tap moves nothing until touch-up, because that is where the click fires
# and what you see is the app's response to it.
def onset(e):
    tap = e['t1'] - e['t0'] < 0.3
    return (e['t1'], e.get('i1', 0)) if tap else (e['t0'], e.get('i0', 0))


def align(src, tl):
    """Fit the script's clock to the take's, measured rather than assumed.

    Two things are wrong with taking the script at face value. The recorder starts some hundreds
    of ms after `simctl io` is launched, and the companion plays the queued stream slightly slow.

    The second one is not a percentage of elapsed time, which is the mistake worth not repeating.
    Each queued event costs the companion a fixed sliver to dispatch, so the lag grows with the
    EVENT COUNT: a one-second drag emits ~120 of them and a one-second hold emits one. Fitting a
    rate against wall-clock time therefore lands at both ends of a clip and drifts in the middle,
    which is exactly where it showed - a dot half a beat off a sheet drag in the middle of a take
    whose first and last gestures were both perfect.

    So the model is `raw = offset + script_time + event_index * eps`, and both unknowns fall out
    of the take for free. simctl emits a frame only when the screen CHANGES, so a still hold
    emits nothing and the frame stream is a map of when things moved:
      anchor A - the second frame in the file is the first gesture's response;
      anchor B - the last cluster of frames is the last gesture.
    If either looks implausible, fall back to offset-only.
    """
    pts = frame_times(src)
    evs = sorted(tl, key=lambda e: e['t0'])
    if len(pts) < 3 or not evs:
        return 0.0, 0.0

    a_ges, a_i = onset(evs[0])
    a_raw = pts[1]
    b_ges, b_i = onset(evs[-1])

    # Last CLUSTER of frames, not the last gap: a take ends on a still hold, and the one or two
    # stray frames after it would otherwise be mistaken for the final gesture.
    clusters, cur = [], [pts[0]]
    for prev, nxt in zip(pts, pts[1:]):
        if nxt - prev > 0.25:
            clusters.append(cur)
            cur = []
        cur.append(nxt)
    clusters.append(cur)
    real = [c for c in clusters if len(c) >= 5]
    if not real or b_i - a_i < 20:
        return a_raw - a_ges - a_i * 0.0, 0.0
    b_raw = real[-1][0]

    eps = ((b_raw - a_raw) - (b_ges - a_ges)) / (b_i - a_i)
    if not -0.0005 <= eps <= 0.01:  # ~1.3ms is normal; anything near 10ms is a misfit, not a clock
        return a_raw - a_ges, 0.0
    return a_raw - a_ges - a_i * eps, eps


def grip_track(src, fps, width, height, first=0):
    """Find the bottom sheet's grip pill in every frame and follow it. Cut-resolution pixels.

    Nothing else worked, and the failures are worth keeping because each looked reasonable.
    Lagging the finger by the swallowed threshold assumes the sheet then tracks one-to-one; it
    does not, it also falls behind during fast motion, and the dot ended 43px off the grip mid
    drag. Frame-to-frame correlation disagreed with itself by 20% between passes. Taking the
    first near-black row as the sheet's top edge works only while the photo is full-bleed - the
    moment the sheet rises the photo letterboxes, the stage beside it is near-black too, and the
    edge jumps to a phantom. Worse, that detector was also what I VERIFIED with, so it agreed
    with itself and I shipped it twice.

    So: find the thing itself. The grip is a short bright pill on a dark panel - bright at the
    centre, dark a quarter of the way out either side - and what separates it from a bright patch
    of rock is that the row above it is sheet panel, dark across the FULL width including the
    middle. From the second frame on it is tracked in a window around where it just was, because
    it moves smoothly and only ever upward, which kills the remaining lookalikes.

    Reads the raw take, which never has dots drawn on it.
    """
    # The WHOLE take, indexed from zero. No `-ss` before `-i`: these files report a bogus frame
    # rate and input seeking lands on the wrong moment, which silently shifted this array against
    # the timeline and drew the dot a fixed distance below the grip - looking exactly like a
    # tracking failure when the tracking was fine.
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', src,
         '-vf', f'fps={fps},scale={width}:{height}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        check=True, capture_output=True,
    ).stdout
    n = len(raw) // (width * height)
    cx, left, right = int(width * 0.5), int(width * 0.28), int(width * 0.72)
    cols = [int(width * f) for f in (0.08, 0.25, 0.5, 0.75, 0.92)]

    # Polarity, read off the take rather than assumed: in dark mode the grip is a bright pill on
    # a dark panel, in light mode a dark pill on a near-white one. The dark-only test silently
    # found nothing in a light take and the weld reported the sheet moving 0.0pt - which looks
    # like a tracking bug and is really a theme. The bottom rows are sheet, whatever the screen.
    seed_f = raw[max(0, min(first, n - 1)) * width * height:][: width * height]
    light = sum(seed_f[(height - 12) * width : (height - 2) * width]) / (10 * width) > 128

    def look(f, lo, hi):
        for y in range(max(150, lo), min(height - 60, hi)):
            r = y * width
            # The thresholds are tight on purpose. At >100 the dark-mode test also matched the
            # breadcrumb one row down (purple text at ~172), consistently enough to look right
            # in a spreadsheet. Light-mode values measured the same way: pill ~11, panel ~249.
            if light:
                hit = f[r + cx] < 60 and f[r + left] > 205 and f[r + right] > 205
                clear = min(f[(y - 9) * width + x] for x in cols) > 205
            else:
                hit = f[r + cx] > 195 and f[r + left] < 70 and f[r + right] < 70
                clear = max(f[(y - 9) * width + x] for x in cols) < 48
            if hit and clear:
                return y
        return None

    # The window has to cover the fastest the pill ever moves. At +/-40 it outran the window
    # mid-drag, the search fell through to the breadcrumb ~52px below, and the dot rode that for
    # the rest of the gesture: perfect at both ends, visibly wrong in between.
    # Seeded at `first`, not at frame zero. In a full clip frame zero is a different screen
    # entirely - the block page, with no sheet on it - so a scan there locks onto whatever
    # happens to match and the tracker never finds the real grip: it reported the sheet moving
    # 0.0pt. Seed where the gesture starts, where the sheet is on screen and at rest.
    out = [0] * n
    seed = None
    for i in range(max(0, min(first, n - 1)), n):
        f = raw[i * width * height : (i + 1) * width * height]
        found = look(f, 150, height - 60) if seed is None else look(f, out[i - 1] - 140, out[i - 1] + 24)
        if found is None:
            found = out[i - 1] if seed is not None else 0
        if seed is None and found:
            seed = found
        out[i] = found
    for i in range(min(first, n) - 1, -1, -1):  # before the gesture the sheet has not moved
        out[i] = out[i + 1] if i + 1 < n else 0
    return out


def content_travel(src, t0, t1, fps, width, height):
    """How far the SCREEN actually moved, frame by frame, over one gesture.

    For a surface that neither swallows a threshold nor tracks one-to-one - a zoomed photo whose
    pan is clamped to the image bounds - no scripted distance matches what the viewer sees. The
    clamp is not even stable between takes, because it depends on exactly where the pinch landed:
    measured 107.2pt on one take and 67.2pt on the next from an identical script.

    The touch dot is composited afterwards, though, so it does not have to follow the finger. It
    can follow the IMAGE, measured off this very take, and then it is glued to the rock by
    construction however far the app decided to go.

    Returns cumulative vertical travel in POINTS, one entry per frame from t0.
    """
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-ss', str(t0), '-i', src, '-t', str(t1 - t0),
         '-vf', f'fps={fps},scale={width}:{height}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        check=True, capture_output=True,
    ).stdout
    n = len(raw) // (width * height)
    frames = [raw[i * width * height : (i + 1) * width * height] for i in range(n)]
    out, cum = [0.0], 0.0
    for a, b in zip(frames, frames[1:]):
        best, shift = None, 0
        for dy in range(-6, 34):
            tot = cnt = 0
            for y in range(150, min(height - 20, 620), 10):
                ya = y + dy
                if not (0 <= ya < height):
                    continue
                for x in range(160, min(width - 20, 460), 10):
                    tot += abs(a[ya * width + x] - b[y * width + x])
                    cnt += 1
            if cnt > 100 and (best is None or tot / cnt < best):
                best, shift = tot / cnt, dy
        cum += -shift * 402.0 / width  # negative dy means the content moved DOWN
        out.append(cum)
    return out


def motion_clusters(pts, gap=0.22, least=4):
    """When the screen actually moved, straight off the take. simctl emits a frame only on a
    change, so runs of frames separated by stillness ARE the gestures."""
    groups, cur = [], [pts[0]]
    for prev, nxt in zip(pts, pts[1:]):
        if nxt - prev > gap:
            groups.append(cur)
            cur = []
        cur.append(nxt)
    groups.append(cur)
    return [g for g in groups if len(g) >= least]


def snap_to_motion(raw, pts, tol=0.45):
    """Pin each gesture to the frame where its own effect starts.

    The offset+per-event model below gets the ORDER right and the ends nearly exact, but it
    still drifts a couple of hundred ms in the middle of a long take - one queued event does
    not cost the companion the same as the next, and no single constant fixes that. Rather
    than keep tuning the constant, use it only to decide WHICH burst of motion belongs to
    which gesture, then move each gesture onto that burst. The take is the measurement; the
    model is just the index into it.

    A take has more bursts than gestures (a sheet released mid-travel snaps on its own, an
    image fades in), so this matches by nearest-within-tolerance in order and leaves anything
    it cannot place alone rather than guessing.
    """
    starts = [c[0] for c in motion_clusters(pts)]
    if not starts:
        return raw
    used = -1
    for ev in raw:
        onset = ev['rt1'] if ev['rt1'] - ev['rt0'] < 0.3 else ev['rt0']
        best, bi = None, None
        for i, s in enumerate(starts):
            if i <= used:
                continue
            d = abs(s - onset)
            if best is None or d < best:
                best, bi = d, i
        if bi is None or best > tol:
            continue
        used = bi
        shift = starts[bi] - onset
        ev['rt0'] += shift
        ev['rt1'] += shift
        if 'rsamples' in ev:
            for s in ev['rsamples']:
                s[0] += shift
    return raw


def to_raw(tl, off, eps):
    """Restate every gesture on the take's clock, so the frame loop never converts back."""
    out = []
    for ev in tl:
        e = dict(ev)
        i0 = ev.get('i0', 0)
        e['rt0'] = off + ev['t0'] + i0 * eps
        e['rt1'] = off + ev['t1'] + ev.get('i1', i0) * eps
        if ev['kind'] == 'drag':
            e['rsamples'] = [
                [off + ev['t0'] + s[0] + (s[3] if len(s) > 3 else i0) * eps, s[1], s[2]] for s in ev['samples']
            ]
        out.append(e)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('timeline')
    ap.add_argument('outdir')
    ap.add_argument('--src', required=True, help='the raw take, used to align the timeline')
    ap.add_argument('--start', type=float, required=True, help='cut start in the raw take')
    ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--nudge', type=float, default=0.0)
    ap.add_argument('--fps', type=float, default=30.0)
    ap.add_argument('--width', type=int, default=604)
    ap.add_argument('--height', type=int, default=1314)
    ap.add_argument('--ink', choices=('white', 'black'), default='white',
                    help='dot colour; light-theme takes want black')
    a = ap.parse_args()
    global INK
    INK = 255 if a.ink == 'white' else 0

    tl = json.load(open(a.timeline))['events']
    off, eps = align(a.src, tl)
    tl = snap_to_motion(to_raw(tl, off, eps), frame_times(a.src))

    # `track='edge'` welds the dot to the sheet's top edge: it keeps whatever offset it had on
    # the first frame, for the whole gesture, whatever the sheet does in between. Nothing about
    # the finger is used after that, which is the point.
    for ev in tl:
        if ev['kind'] != 'drag' or ev.get('track') != 'edge':
            continue
        s = ev['rsamples']
        # Seed the scan just before the gesture, not at frame zero: in the full clip frame
        # zero is the block page and the scan locks onto something that is not the grip.
        edge = grip_track(a.src, a.fps, a.width, a.height, first=int(max(0.0, s[0][0] - 0.45) * a.fps))
        scale_y = a.height / 874.0

        def grip_at(when):
            """Interpolated, and used for BOTH the offset and every sample. Taking the offset
            from the floor index while sampling with interpolation disagreed by whatever the
            grip moved in that one frame - 52px at the start of a drag - and that difference
            became a constant error along the entire path."""
            fi = when * a.fps  # absolute: `edge` covers the whole take from zero
            lo = min(int(fi), len(edge) - 2) if len(edge) > 1 else 0
            g = min(max(fi - lo, 0.0), 1.0)
            return edge[lo] + (edge[min(lo + 1, len(edge) - 1)] - edge[lo]) * g

        # Stored for the draw loop rather than baked into the samples. The sample times have
        # been shifted by snap_to_motion to line the gesture up with the take, so looking the
        # grip up at a SAMPLE time asks where the grip was at a moment that no longer matches
        # the frame being painted - about four frames out, which during the drag is a steady
        # 48px lag that appears the instant the sheet starts moving.
        ev['_grip'] = edge
        # Measured while the sheet is still AT REST. snap_to_motion puts the gesture's start on
        # the frame where motion is already underway, so reading the grip there bakes in however
        # far it had travelled - a constant 48px that put the dot permanently below the pill.
        ev['_hold'] = s[0][2] * scale_y - grip_at(max(0.0, s[0][0] - 0.3))
        ev['_fps'] = a.fps
        lo, hi = int(s[0][0] * a.fps), min(int(s[-1][0] * a.fps), len(edge) - 1)
        print(f"track: {ev.get('label')} welded to the grip, which moved "
              f'{(edge[lo] - edge[hi]) * 402.0 / a.width:.1f}pt during the drag')
    print(f'align: gesture t=0 at {off:.3f}s, {eps * 1000:.2f}ms per event, then snapped to motion')
    r = DIAM_PT * PT_TO_PX / 2.0
    sx = a.width / 402.0
    sy = a.height / 874.0
    os.makedirs(a.outdir, exist_ok=True)
    frames = int(round(a.dur * a.fps))
    drawn = 0
    for f in range(frames):
        t = a.start + f / a.fps + a.nudge  # this cut frame's position in the raw take
        buf = bytearray(a.width * a.height * 4)
        hit = False
        for ev in tl:
            alpha, scale = envelope(t, ev['rt0'], ev['rt1'])
            if alpha <= 0:
                continue
            hit = True
            if ev['kind'] == 'drag':
                s = ev['rsamples']
                rel = min(max(t, s[0][0]), s[-1][0])

                # Two clocks, deliberately. The x comes from the sample path, which is clamped to
                # the gesture so the dot waits at the first waypoint during the lead-in. The
                # welded y comes from the UNCLAMPED frame time, because the grip's real position
                # at that frame is the answer at every moment - including the lead-in, where it
                # is simply still at rest. Feeding the clamped time to the weld instead asked
                # where the grip was once the drag had begun, and put the dot above the handle
                # before anything had moved.
                def place(path_t, grip_t, _ev=ev, _s=s):
                    px, py = sample_path(_s, path_t)
                    if '_grip' in _ev:
                        g = _ev['_grip']
                        fi = grip_t * _ev['_fps']
                        lo = min(int(fi), len(g) - 2) if len(g) > 1 else 0
                        w = min(max(fi - lo, 0.0), 1.0)
                        py = (g[lo] + (g[min(lo + 1, len(g) - 1)] - g[lo]) * w + _ev['_hold']) / sy
                    return px, py

                back = TRAIL
                steps = 6
                for i in range(steps, 0, -1):
                    lag = back * i / steps
                    if rel - lag < s[0][0]:
                        continue
                    px, py = place(rel - lag, t - lag)
                    blend(buf, a.width, a.height, px * sx, py * sy, r * (0.55 + 0.4 * (1 - i / steps)),
                          alpha * 0.30 * (1 - i / steps))
                px, py = place(rel, t)
                blend(buf, a.width, a.height, px * sx, py * sy, r * scale, alpha)
            elif ev['kind'] == 'pinch':
                span = max(ev['rt1'] - ev['rt0'], 1e-6)
                u = min(max((t - ev['rt0']) / span, 0.0), 1.0)
                u = 4 * u * u * u if u < 0.5 else 1 - ((-2 * u + 2) ** 3) / 2
                # idb places the two fingers HORIZONTALLY at centerX +/- radius, same y
                # (SimulatorHIDEvent.swift pinchAt). Drawing them on a diagonal would put the
                # dots somewhere the touches never were.
                rad = ev['radius'] * (1 + (ev['scale'] - 1) * u)
                for sgn in (-1, 1):
                    blend(buf, a.width, a.height, (ev['x'] + sgn * rad) * sx, ev['y'] * sy,
                          r * scale, alpha)
            else:
                press = 1.0
                if ev['rt0'] <= t <= ev['rt1']:
                    press = 0.86  # the dot dips on contact, so a tap reads as a press
                blend(buf, a.width, a.height, ev['x'] * sx, ev['y'] * sy, r * scale * press, alpha)
        if hit:
            drawn += 1
        open(os.path.join(a.outdir, f'{f:05d}.png'), 'wb').write(png(a.width, a.height, buf))
    print(f'{frames} frames, {drawn} with a dot -> {a.outdir}')


if __name__ == '__main__':
    main()
