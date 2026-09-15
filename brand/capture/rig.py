#!/usr/bin/env python3
"""Gesture engine for the landing clips. Scratch, dies with capture/.

Why this exists instead of `idb ui swipe`: a swipe is a straight line at constant velocity
and it ENDS WITH A LIFT, so chained swipes are N separate flicks, not one drag. But in idb's
HID protocol a touch MOVE is just another DOWN at a new point, so DOWN..DOWN..UP with delays
between is one held drag along any path, with any easing. That is the only way to trace a
curved route line and the only way to make a drag look like a thumb rather than a machine.

Everything is queued up front and paced companion-side (HIDDelay -> Task.sleep, in stream
order), so the timeline this writes is exact and capture/overlay.py can composite the touch
dots from it rather than guessing.

Coordinates are POINTS (402x874 on the iPhone 17 Pro). Screenshots are 3x that.
"""

import asyncio
import json
import logging
import math
import os
import sys
import time

from idb.common.types import HIDDelay, HIDDirection, HIDPinch, HIDPress, HIDTouch, Point, TCPAddress
from idb.grpc.client import Client

HZ = 60.0  # sample rate for drags; smoothness comes from easing, not from more points


def ease_in_out(x):
    return 4 * x * x * x if x < 0.5 else 1 - ((-2 * x + 2) ** 3) / 2


def ease_out(x):
    return 1 - (1 - x) ** 3


LINEAR = lambda x: x  # noqa: E731
EASES = {'inout': ease_in_out, 'out': ease_out, 'linear': LINEAR}


def catmull_rom(points, t):
    """Position at 0..1 along a Catmull-Rom spline through every waypoint.

    Waypoints, not control points: authoring a drag means naming places on the screen the
    finger should actually pass over (the nodes of a route line), not Bezier handles.
    """
    pts = [points[0]] + list(points) + [points[-1]]
    segs = len(pts) - 3
    u = min(max(t, 0.0), 1.0) * segs
    i = min(int(u), segs - 1)
    s = u - i
    p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
    s2, s3 = s * s, s * s * s

    def axis(a, b, c, d):
        return 0.5 * ((2 * b) + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3)

    return (axis(p0[0], p1[0], p2[0], p3[0]), axis(p0[1], p1[1], p2[1], p3[1]))


class Rig:
    def __init__(self, companion=None):
        self.companion = companion or os.environ.get('COMPANION', 'localhost:10882')
        self.events = []
        self.timeline = []
        self.t = 0.0
        # What the COMPANION will execute, which is not len(self.events). One queued HIDPinch
        # expands companion-side into ~2*steps+4 touch and delay events, and the lag that
        # overlay.py fits accrues per executed event. Counting the queued message as one made
        # the model over-charge everything before a pinch and put its dots a beat late.
        self.cost = 0

    # -- primitives ---------------------------------------------------------------

    def wait(self, seconds):
        self.events.append(HIDDelay(duration=seconds))
        self.cost += 1
        self.t += seconds
        return self

    def tap(self, x, y, hold=0.08, label=''):
        """A tap. `hold` is the press duration; 80ms is a relaxed human tap."""
        # i0/i1 are event indices, not decoration. The companion runs a queued stream slightly
        # slow, and the lag accrues PER EVENT rather than per second - a drag emits ~120 of them
        # a second, a hold emits one - so overlay.py places the touch dots against the event
        # count. Timing them against wall-clock alone lands at both ends and drifts in between.
        i0 = self.cost
        self._down(x, y)
        self.wait(hold)
        i1 = self.cost
        self._up(x, y)
        self.timeline.append(
            {'kind': 'tap', 't0': self.t - hold, 't1': self.t, 'i0': i0, 'i1': i1, 'x': x, 'y': y, 'label': label}
        )
        return self

    def double_tap(self, x, y, pause=0.09, hold=0.06, label=''):
        """d3-zoom needs both taps within 500ms and the second within 10px of the first."""
        self.tap(x, y, hold=hold, label=label)
        self.wait(pause)
        self.tap(x, y, hold=hold, label='')
        return self

    def drag(self, waypoints, duration, ease='inout', settle=0.09, takeup=0.0, label='', track=False, pre_dt=0.018):
        """One held drag along a smooth curve through every waypoint.

        `settle` repeats the final point before the lift: that is idb's own anti-inertia
        trick (SimulatorHIDEvent.swift), and without it a scroll view keeps flinging after
        the finger is gone, which on camera reads as the app overshooting.

        `takeup` is measured, not taste. A surface that decides whether you meant to drag it
        SWALLOWS the first stretch rather than crossing a line and catching up. Measured so far:
        ~20pt on a WebKit scroll view (feed, route list) and ~33pt on svelte-bottom-sheet
        (290pt of finger moved the list 270.2pt; 163.7pt moved the sheet 131.1pt).

        The finger still travels the whole distance - the app needs that - but the DOT is drawn
        lagging it by exactly `takeup` of arc length. The touch dot is composited afterwards, so
        it is not obliged to sit on the HID coordinate; the only thing that has to be true is
        that it looks attached to whatever is moving. Lagging it makes that literally true: the
        dot starts on the grip, holds still for the moment the surface ignores, then tracks the
        surface one-to-one and ends on the grip. Chasing the finger instead put the dot 33pt past
        the grip by the end, and hiding the slack put it 33pt - fifty device pixels - short of the
        grip at the start. Both were visible; this is neither.

        Author the FULL finger travel: takeup + however far the surface should actually move.
        """
        fn = EASES[ease]
        n = max(2, int(duration * HZ))
        dt = duration / n

        # Arc-length table, so the lag can be applied in POINTS along a curve rather than in
        # spline parameter, which is not proportional to distance.
        marks = [catmull_rom(waypoints, k / 600) for k in range(601)]
        run = [0.0]
        for a, b in zip(marks, marks[1:]):
            run.append(run[-1] + math.dist(a, b))

        def at_length(length):
            length = min(max(length, 0.0), run[-1])
            lo, hi = 0, len(run) - 1
            while hi - lo > 1:
                mid = (lo + hi) // 2
                lo, hi = (mid, hi) if run[mid] <= length else (lo, mid)
            span = run[hi] - run[lo]
            f = 0.0 if span <= 0 else (length - run[lo]) / span
            return (marks[lo][0] + (marks[hi][0] - marks[lo][0]) * f,
                    marks[lo][1] + (marks[hi][1] - marks[lo][1]) * f)

        def length_at(u):
            x = min(max(u, 0.0), 1.0) * 600
            lo = min(int(x), 599)
            return run[lo] + (run[lo + 1] - run[lo]) * (x - lo)

        # Spend the slack in two frames rather than over the easing, so the dot's stationary
        # moment at the grip is ~66ms and not a visible pause.
        u0 = 0.0
        if takeup > 0:
            while u0 < 1.0 and length_at(u0) < takeup:
                u0 += 1 / 600

        samples = []
        t0 = self.t
        i0 = self.cost

        def emit(u):
            p = catmull_rom(waypoints, u)
            self._down(*p)
            d = at_length(length_at(u) - takeup)
            # Each sample carries its own event index, because the drift inside a long drag is
            # the whole point: by the last sample the companion is further behind than at first.
            samples.append([round(self.t - t0, 4), round(d[0], 2), round(d[1], 2), self.cost])
            return p

        p = emit(0.0)
        for k in range(1, 3):
            if u0 <= 0:
                break
            self.wait(pre_dt)
            p = emit(u0 * k / 2)
        for i in range(1, n + 1):
            self.wait(dt)
            p = emit(u0 + (1 - u0) * fn(i / n))
        i1 = self.cost
        self.wait(settle)
        self._up(*p)
        self.timeline.append(
            {'kind': 'drag', 't0': t0, 't1': self.t, 'i0': i0, 'i1': i1, 'samples': samples, 'label': label, 'track': track}
        )
        return self

    def pinch(self, x, y, scale, duration, radius=70, label=''):
        """Two-finger pinch, paced companion-side. scale>1 zooms in."""
        i0 = self.cost
        self.events.append(HIDPinch(center=Point(x=x, y=y), scale=scale, duration=duration, radius=radius))
        # What the companion unrolls this into, from SimulatorHIDEvent.pinchAt: two touches and a
        # delay per step, plus a duplicated last point and the lift. `steps` is the same formula
        # that decides how smooth the zoom looks (see the topo clip), so this and the frame rate
        # move together.
        steps = max(2, int(abs(radius * scale - radius) / 10))
        self.cost += 2 * steps + 4
        self.timeline.append(
            {
                'kind': 'pinch',
                't0': self.t,
                't1': self.t + duration,
                'i0': i0,
                'i1': self.cost,
                'x': x,
                'y': y,
                'scale': scale,
                'radius': radius,
                'label': label,
            }
        )
        self.t += duration
        return self

    # -- internals ----------------------------------------------------------------

    def _down(self, x, y):
        self.events.append(HIDPress(action=HIDTouch(point=Point(x=x, y=y)), direction=HIDDirection.DOWN))
        self.cost += 1

    def _up(self, x, y):
        self.events.append(HIDPress(action=HIDTouch(point=Point(x=x, y=y)), direction=HIDDirection.UP))
        self.cost += 1

    # -- run ----------------------------------------------------------------------

    def run(self, name):
        host, _, port = self.companion.rpartition(':')
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', f'{name}.timeline.json')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sent = []

        async def go():
            async with Client.build(
                address=TCPAddress(host=host, port=int(port)), logger=logging.getLogger('rig'), use_tls=False
            ) as client:
                # Wall clock at the moment the companion starts executing the stream. cut.sh
                # subtracts the recorder's own start from this to place the touch dots. It has
                # to be taken here and not in shoot.sh: building the client above costs about a
                # second, which is four times the dot's lead-in.
                sent.append(time.time())
                await client.send_events(self.events)
                # send_events returns once the stream is QUEUED; the companion is still
                # playing it back. Without this wait the process exits early and shoot.sh
                # kills the recorder mid-gesture, silently truncating the closing hold.
                await asyncio.sleep(self.t - (time.time() - sent[0]) + 0.15)

        asyncio.run(go())
        with open(out, 'w') as fh:
            json.dump({'duration': self.t, 'sent_at': sent[0] if sent else None, 'events': self.timeline}, fh, indent=1)
        print(f'{name}: {self.t:.2f}s, {len(self.events)} events, {len(self.timeline)} gestures -> {out}',
              file=sys.stderr)
