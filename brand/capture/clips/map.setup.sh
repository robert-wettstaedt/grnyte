#!/usr/bin/env bash
# Not recorded: put the map in a REPRODUCIBLE framing showing the four sector donuts.
#
# Searching a block fits the map to it at a fixed zoom with fixed padding, so closing the sheet
# leaves a known centre; clearing the query brings the other pins back without moving the map;
# two taps of the map's own zoom-out button then land the donut framing. That last step is the
# load-bearing one: the [-]/[+] controls animate about the exact view centre and constrain to
# integer zooms, so [-][-] then [+][+] returns the map PIXEL FOR PIXEL and map.py can hard-code
# where The Roof will be. A pinch cannot: two identical pinch round-trips measured 32pt apart,
# which is wider than the 12pt pin, so the tap missed and the take ended on a dead screen.
#
# PRECONDITION: the app is on /explore. See topo.setup.sh.
set -euo pipefail
C="${COMPANION:-localhost:10882}"
t() { idb --companion "$C" ui tap "$1" "$2" >/dev/null; }

# Kill geolocation tracking first. If it is on, the map recentres on the first fix, which
# mid-take yanks the framing with nothing on screen to explain it - and before the take it
# quietly reframes the whole clip a zoom step wider with the donuts overlapping. Nothing fails;
# it just looks different from every other variant, which only a side-by-side catches.
#
# READ the control rather than trying to turn it off blind. A pointerdrag on the map is supposed
# to release tracking (geolocation.ts) and twice did not, so this samples the button - purple
# when active, white or charcoal when not - and taps it only when it is on. Tapping it blind
# would turn tracking ON half the time, which is the same bug with the sign flipped.
# Settle first. The button paints inactive and only turns purple once the first fix lands, so
# probing the instant the map mounts reads "off" on a map that is about to start tracking - and
# the run that did that came back with the control lit in the clip's opening frame.
sleep 4
GEO_SHOT="${TMPDIR:-/tmp}/grnyte-geo.png"
xcrun simctl io booted screenshot "$GEO_SHOT" >/dev/null 2>&1
# (1160, 1990) device px = the centre of the geolocate button at 3x.
set -- $(ffmpeg -v error -i "$GEO_SHOT" -vf "crop=2:2:1160:1990" -f rawvideo -pix_fmt rgb24 - \
  2>/dev/null | od -An -tu1 -N3)
if [ "$(( $1 - $2 ))" -gt 40 ]; then
  echo "geolocation: tracking is on ($1,$2,$3), switching it off" >&2
  t 387 663
  sleep 2
fi

t 333 94 # clears a previous query; harmless focus tap when the field is already empty
sleep 2
t 210 94
sleep 2
idb --companion "$C" ui text "The Roof" >/dev/null
sleep 3
t 201 187 # the single BLOCKS result -> block sheet, map fitted to the block
sleep 5

t 370 329 # close the sheet; the map keeps the fitted centre
sleep 3

# Everything below happens while the filter still hides every other block, so there is exactly
# one red circle on screen and no guessing which one it is.
#
# The fit leaves The Roof in the top quarter (it pads for the sheet that was covering the rest),
# which after zooming out puts the donut cluster against the search bar. So: find it, drag it to
# the middle, find it again. The zoom controls are exact inverses, so the second measurement is
# still right after map.py zooms back in.
IDBPY="${IDBPY:-/opt/homebrew/opt/idb-cli/libexec/bin/python3}"
"$IDBPY" "$(dirname "$0")/../findpin.py"
CAPTURE_DIR="$(cd "$(dirname "$0")/.." && pwd)" "$IDBPY" - <<'PY'
import json, os, sys
here = os.environ['CAPTURE_DIR']
sys.path.insert(0, here)
from rig import Rig
pin = json.load(open(os.path.join(here, 'raw', 'pin.json')))
r = Rig()
r.wait(0.3)
# Also the pointerdrag that guarantees geolocation tracking is off before the take.
r.drag([(pin['x'], pin['y']), (201, 430)], duration=0.6)
r.wait(1.2)
r.run('map-centre')
PY
sleep 2
"$IDBPY" "$(dirname "$0")/../findpin.py"

t 333 94 # clear the query so every pin comes back, framing untouched
sleep 4

t 377 585 # zoom out: block pins -> sector donuts
sleep 1.2
t 377 585
sleep 2.5
