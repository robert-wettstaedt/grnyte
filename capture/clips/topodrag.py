#!/usr/bin/env python3
"""Probe clip: the topo pan alone. Scratch."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rig import Rig  # noqa: E402

r = Rig()
r.wait(0.9)
r.drag([(245, 165), (228, 245), (203, 330), (186, 425)], duration=1.6, label='follow the line')
r.wait(1.4)
r.run('topodrag')
