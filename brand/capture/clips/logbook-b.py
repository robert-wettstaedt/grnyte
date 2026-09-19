#!/usr/bin/env python3
"""Logbook clip, second half: anna's profile. Spliced after logbook-a by capture/splice.sh.

One beat - filter the grade pyramid to flashes and back. That is the only real motion the
profile has: neither the contribution calendar nor the pyramid animates on mount (the bars carry
a 150ms height transition but are created at their final height), so a straight hold here would
record as a freeze. Switching the filter recomputes every bar and the transition plays.

It is also the right beat for the size. At 206 CSS px a sentence is texture, but bars changing
height and colour bands appearing and disappearing read at any size.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rig import Rig  # noqa: E402

r = Rig()

r.wait(1.2)  # arrival hold: the cut lands here, so it has to be still long enough to read
r.tap(350, 574, label='flashes only')
r.wait(1.3)
r.tap(275, 574, label='all sends')
r.wait(1.6)  # closing hold

r.run('logbook-b')
