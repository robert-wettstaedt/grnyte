#!/usr/bin/env python3
"""Probe clip: the sheet drag alone. Scratch."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rig import Rig  # noqa: E402

r = Rig()
r.wait(0.9)
r.drag([(201, 687), (201, 600), (201, 523)], duration=0.9, settle=0.30, takeup=33, track='edge', label='raise sheet')
r.wait(1.4)
r.run('sheet')
