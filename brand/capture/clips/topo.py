#!/usr/bin/env python3
"""Topo clip, long cut. Starts on The Roof's block page (topo.setup.sh gets there, unrecorded).

Beats: open the topo -> raise the sheet -> select Sit Start (its line lights, the others dim)
-> zoom -> travel the line to the topout. Five states in 10.1s, which is longer than the 7s a
two-beat loop holds; the beats earn it.

Zoom is a PINCH, not the double-tap this flow was drafted with. A double-tap is a fixed 250ms
d3 transition - too fast to read at 238 CSS px and impossible to slow down - and double-tapping
on or near a line toggles the highlight out from under you. A pinch is continuous, takes as
long as you give it, and cannot reach the line handlers.

Coordinates are POINTS on a 402x874 screen. Screenshots are 3x that.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rig import Rig  # noqa: E402

r = Rig()

r.wait(0.9)  # opening hold; this frame is the poster
r.tap(120, 620, label='open topo')  # block photo -> full-bleed viewer
r.wait(1.6)  # 500ms sheet slide + nav + image fade

# Grip only: a finger-up gesture on the route list is always a native scroll, and the sheet can
# only be raised by the pill at the very top (Handle.svelte sets isDraggingFromHandle).
#
# Drag almost all the way to the 0.5 detent, whose grip sits at ~485. The sheet follows the
# finger and only SNAPS on release, so stopping short leaves the dot to vanish and the sheet to
# jump the rest on its own: ending at 598 left a 113pt jump with no finger on screen to explain
# it. The long `settle` matters as much - the library projects release velocity, and a quick
# lift from here sails past 0.5 and lands on 0.75, which shrinks the photo to a thumbnail.
#
# `track='edge'` is what actually makes the dot sit on the grip. The sheet swallows a threshold
# AND falls behind during fast motion, so no fixed relationship to the finger holds: overlay.py
# finds the grip pill in every frame and welds the dot to it. `takeup` still shapes the FINGER
# path so the sheet travels the right distance.
r.drag([(201, 687), (201, 600), (201, 521)], duration=0.9, settle=0.30, takeup=33,
       track='edge', label='raise sheet')

# The gap is not padding. Back to back, the first dot's 150ms fade-out overlaps the second
# dot's 220ms lead-in, so two dots are on screen at once and it reads as two fingers. One
# thumb has to let go and land again, and 0.9s is what that looks like with a read in it.
r.wait(0.9)

# No scroll beat. Raising the sheet already brings Sit Start on screen, so the 70pt scroll that
# used to sit here bought nothing but 2.2s. Its cost: the row ends up against the bottom edge,
# so the "Show on map / Details" strip the selection expands is off screen. The beat's payoff is
# on the PHOTO - the line brightens, the other three drop to 0.33 - and that is fully visible.
# 838, measured off the settled frame: the row spans ~811-855pt and 838 is clear of both the row
# border and the home indicator zone.
r.tap(119, 838, label='select Sit Start')
r.wait(1.3)

# Radius and duration are BOTH about smoothness, not about framing. idb expands a pinch into
# |r*scale - r| / 10 steps (SimulatorHIDEvent.swift), so a small radius over a long duration is
# a slideshow: r=60/scale 2.2/1.3s measured 9.3 fps on screen, which is exactly what "choppy"
# was. r=90 over 0.5s measures 32 fps. Fingers sit at centerX +/- r, so r much past ~150 puts
# them in the iOS edge zones and the gesture stops working altogether.
# radius 80, not 90. At 90 the fingers end at centerX +/- 198 on a 402pt screen, i.e. ON the
# edges, so the last steps were sometimes dropped and the zoom landed somewhere different every
# take. That is what made the pan headroom below wander between 94.5pt, 63.2pt and 41.3pt.
r.pinch(200, 267, 2.2, duration=0.5, radius=80, label='zoom in')
r.wait(0.9)

# One held drag along a curve: the finger mirrors the line, so the rock travels down the route
# instead of sliding sideways. Panning is dead at k=1, which is why this follows the zoom.
#
# No `takeup` and no `track` here, and that is the finding rather than an omission: d3-zoom pans
# one-to-one with the finger from the first touchmove and does NOT clamp over this distance, so
# finger, image and dot are the same thing. Earlier readings that said otherwise - a ceiling that
# wandered between 41 and 110pt - came from frame-to-frame correlation whose search window was
# too narrow for a fast diagonal pan, and it under-reported every time. Checked instead with
# per-frame change magnitude, which cannot saturate: the photo is still moving at 2.33s and
# stops only when the finger does.
r.drag([(245, 165), (228, 245), (203, 330), (186, 425)], duration=1.6, label='follow the line')
r.wait(1.4)  # closing hold, on the topout

r.run('topo')
