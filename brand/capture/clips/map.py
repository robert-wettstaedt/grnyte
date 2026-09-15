#!/usr/bin/env python3
"""Map clip. Starts on the sector donuts (map.setup.sh frames them, unrecorded).

Two beats: zoom in and the four grade-histogram donuts resolve into individual blocks carrying
their route counts, then open one and its topo photo rises with the sheet. The payoff of both
is graphic - a donut, a pin, a photo - which is the only kind that survives a 206 CSS px tile.

The zoom is the map's own [+] control rather than a pinch. A pinch looks more native but is not
reproducible here: OpenLayers snaps to an integer zoom on release, so two identical pinch
round-trips landed 32pt apart, the scripted tap missed the 12pt pin, and the take ended on a
dead screen with nothing to show it had failed. The buttons animate about the exact view centre,
so The Roof returns to wherever map.setup.sh measured it before zooming out.

There is no return-to-start, so the loop seam is a cut between two stills (Notion's shipped
pattern): the discontinuity is content, not motion. A matched loop would need the last beat to
undo itself, and the block sheet cannot be swiped away - `disableClosing` clamps a downward drag
to a title bar, and the X navigates back to a map that never refits.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from rig import Rig  # noqa: E402

pin = json.load(open(os.path.join(HERE, 'raw', 'pin.json')))

r = Rig()

r.wait(1.2)  # opening hold; this frame is the poster

# Crossing zoom 14 is what swaps sector donuts for block pins; labels arrive with them at 15.
r.tap(377, 546, label='zoom in')
r.wait(0.55)
r.tap(377, 546, label='zoom in')
r.wait(1.6)

r.tap(pin['x'], pin['y'], label='open The Roof')  # the 12pt circle, not the label under it
r.wait(2.8)  # 300ms map refit + 500ms sheet slide + the topo image, then the closing hold

r.run('map')
