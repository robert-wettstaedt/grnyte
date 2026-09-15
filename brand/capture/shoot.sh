#!/usr/bin/env bash
# Record one landing clip off the booted simulator.
#   ./capture/shoot.sh topo
# Writes capture/raw/<name>.mp4 plus <name>.timeline.json (the scripted gestures, which
# overlay.py turns into touch dots) and <name>.rec.json (when the recorder started, which
# is what aligns the two).
#
# Gestures live in capture/clips/<name>.py and run through capture/rig.py, NOT through
# `idb ui swipe`: a swipe is a straight line at constant velocity and lifts at the end, so
# it can neither trace a curve nor read as a thumb. See rig.py.
set -euo pipefail

NAME="${1:?usage: shoot.sh <clip-name>}"
UDID="${UDID:-245A53D9-0CF6-45DC-B251-C99194E02A34}"
# idb hangs enumerating physical devices on Xcode 26; the companion must be started
# with --only simulator. See capture/README.md.
COMPANION="${COMPANION:-localhost:10882}"
IDBPY="${IDBPY:-/opt/homebrew/opt/idb-cli/libexec/bin/python3}"
SETTLE="${SETTLE:-1.5}"   # recorder warm-up before the first gesture
TAIL="${TAIL:-1.2}"       # dead air after the last one, so the closing hold exists
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/raw/$NAME.mp4"
mkdir -p "$DIR/raw"

[ -f "$DIR/clips/$NAME.py" ] || { echo "no gesture script: capture/clips/$NAME.py" >&2; exit 1; }

# 9:41, full battery, full bars. A real clock and a half battery both pull the eye.
xcrun simctl status_bar "$UDID" override \
  --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

# Anything that should not be in the take (navigation to the starting screen) goes in
# clips/<name>.setup.{py,sh} and runs before the recorder starts.
for ext in py sh; do
  S="$DIR/clips/$NAME.setup.$ext"
  if [ -f "$S" ]; then
    echo "setup: $S" >&2
    if [ "$ext" = py ]; then COMPANION="$COMPANION" "$IDBPY" "$S"; else COMPANION="$COMPANION" bash "$S"; fi
  fi
done

REC_AT=$(perl -MTime::HiRes -e 'printf "%.4f", Time::HiRes::time()')
xcrun simctl io "$UDID" recordVideo --codec h264 --mask ignored -f "$OUT" &
REC=$!
printf '{"rec_at": %s, "settle": %s}\n' "$REC_AT" "$SETTLE" > "$DIR/raw/$NAME.rec.json"

perl -e "select undef,undef,undef,$SETTLE"
COMPANION="$COMPANION" "$IDBPY" "$DIR/clips/$NAME.py"
perl -e "select undef,undef,undef,$TAIL"

kill -INT "$REC"
wait "$REC" 2>/dev/null || true
echo "wrote $OUT" >&2
