#!/usr/bin/env bash
# One manifest screenshot off the booted simulator.
#   ./capture/still.sh topo        # -> static/screenshot-topo.jpg
#
# These are the PWA manifest's `screenshots`, which app stores and install dialogs show. They
# are NOT the landing clips' posters: a poster is 604px wide (sized for a 238 CSS px figure) and
# is a re-encoded CRF 30 video frame chosen to be a calm FIRST frame, which is a different job
# from being the most informative still. Drive the app to the state you want, then run this.
#
# Same status bar repaint as cut.sh, for the same reason: the simulator's install cached the old
# manifest's theme_color, so the band is wrong in both appearances. See capture/README.md.
set -euo pipefail

NAME="${1:?usage: still.sh <name>, e.g. topo}"
BAR="${BAR:-19171B}"          # light-theme stills want FCFAF7
UDID="${UDID:-245A53D9-0CF6-45DC-B251-C99194E02A34}"
W=1024                        # every narrow screenshot must share one aspect ratio; this is it
DIR="$(cd "$(dirname "$0")" && pwd)"
SHOT="$DIR/raw/still-$NAME.png"
OUT="$DIR/../static/screenshot-$NAME.jpg"
mkdir -p "$DIR/raw"

xcrun simctl status_bar "$UDID" override \
  --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null

SRC_W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$SHOT")
# Sampled, not hard-coded: the band differs per appearance. (0.25*W, 8) is inside it, right of
# the clock and left of the island.
KEY=$(ffmpeg -v error -i "$SHOT" -vf "crop=2:2:$((SRC_W / 4)):8" -f rawvideo -pix_fmt rgb24 - \
  | od -An -tx1 -N3 | tr -d ' \n' | tr 'a-f' 'A-F')
echo "status bar: #$KEY -> #$BAR" >&2

ffmpeg -y -loglevel error -i "$SHOT" -filter_complex \
  "[0:v]split[full][crop];[crop]crop=$SRC_W:186:0:0,colorkey=0x$KEY:0.07:0.04[keyed]; \
   color=c=0x$BAR:s=${SRC_W}x186[bg];[bg][keyed]overlay=0:0:shortest=1[fix]; \
   [full][fix]overlay=0:0,scale=$W:-2[o]" -map "[o]" -q:v 4 "$OUT"

printf '%s  %s  %s\n' \
  "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$OUT")" \
  "$(du -h "$OUT" | cut -f1)" "$OUT"
