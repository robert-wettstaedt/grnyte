#!/usr/bin/env python3
"""Locate the one red block pin on screen and write its POINT coordinate for a clip to tap.

Hard-coding the pin was wrong. The map clip has to tap a 12pt circle after a scripted zoom, and
where that circle lands depends on the framing the setup started from - a light-mode run whose
map had been recentred by geolocation put it 40pt off and the take ended on a dead screen with
nothing to say it had failed. Measuring costs one screenshot.

Run this while a search filter is still applied, so exactly one block pin is drawn: the filtered
map is the only moment the target is unambiguous. The map's own zoom controls are exact inverses
(see map.setup.sh), so a coordinate measured before [-][-] is still valid after [+][+].

No PIL here; ffmpeg decodes straight to raw RGB at 402x874, which makes pixel indices POINTS.
"""

import json
import os
import subprocess
import sys

W, H = 402, 874
UDID = os.environ.get('UDID', '245A53D9-0CF6-45DC-B251-C99194E02A34')


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'raw', 'pin.json')
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'findpin.png')
    subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', tmp], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', tmp, '-vf', f'scale={W}:{H}', '-f', 'rawvideo',
         '-pix_fmt', 'rgb24', '-'],
        check=True, capture_output=True,
    ).stdout

    # Pin fill is #ef4444. The locate button is the same red when tracking is on, so the whole
    # bottom-right control column is out of bounds; so is the top bar, which carries the logo.
    xs, ys, n = 0, 0, 0
    for y in range(110, H - 60):
        row = y * W * 3
        for x in range(8, W - 8):
            if x > 345 and y > 480:
                continue
            i = row + x * 3
            r, g, b = raw[i], raw[i + 1], raw[i + 2]
            if r > 195 and g < 115 and b < 115 and r - max(g, b) > 80:
                xs += x
                ys += y
                n += 1

    if n < 30:
        print(f'findpin: only {n} pin pixels, refusing to guess', file=sys.stderr)
        sys.exit(1)
    pin = {'x': round(xs / n, 1), 'y': round(ys / n, 1), 'pixels': n}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as fh:
        json.dump(pin, fh)
    print(f"findpin: pin at {pin['x']}, {pin['y']} ({n} px)", file=sys.stderr)


if __name__ == '__main__':
    main()
