#!/usr/bin/env python3
"""Logbook clip, first half: the Activity feed. Spliced to logbook-b by capture/splice.sh.

One beat - a slow scroll down the log. The scroll is deliberately about twice as slow as a real
thumb: at 206 CSS px the reader needs time to see that each row is a person, a route, a grade
and a rating, and a native-speed flick reads as a blur with no content.

It also stops well short of a week back. Day dividers and card timestamps flip from "3 days ago"
to an absolute "Sep 6, 2026" at exactly seven days (relativeTime.ts), and a dated frame ages the
clip the moment it ships.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rig import Rig  # noqa: E402

r = Rig()

r.wait(1.1)  # opening hold; this frame is the poster for the whole spliced clip

# ease='out', not the default 'inout'. Two reasons, and the second one is not cosmetic. A flick
# starts fast and decelerates; that is what a thumb does. And an ease-IN covers about 2% of the
# distance in its first 15%, which on a scroll view is under WebKit's drag threshold, so nothing
# moves for a quarter of a second. cut.sh aligns the touch dots off the take's FIRST MOVING
# FRAME, so that dead quarter-second silently pushed every dot in the clip that much late.
r.drag(
    # Authored as the FULL finger travel; `takeup` is the 20pt WebKit swallows before the list
    # starts following, so the dot is drawn for 720->430 and the rows move exactly that far.
    [(201, 740), (201, 650), (201, 520), (201, 430)],
    duration=1.3,
    ease='out',
    takeup=20,  # measured on this surface: see rig.drag
    label='scroll the log',
)
r.wait(1.4)

# The cut to the profile is the clip's one edit, and this is what motivates it. Without the tap
# on screen the profile just appears, which reads as a glitch rather than as a navigation.
r.tap(338, 840, label='open profile')
r.wait(0.35)  # cut lands here, before the new page paints

r.run('logbook-a')
