#!/usr/bin/env bash
# Trim one raw take to the landing clip, composite the touch dots, extract the poster.
#   ./capture/cut.sh topo 2.4 8            # dots on, from the take's own timeline
#   ./capture/cut.sh topo 2.4 8 --nudge -0.1 --fade 0.2
#
# fps=30 + -fps_mode cfr is load bearing: simctl records VARIABLE frame rate and only emits a
# frame when the screen changes, so a static hold becomes a multi-second gap that plays as a
# freeze followed by a jump. Passing that through untouched is what made the first cut stutter.
#
# -ss/-t go AFTER -i (as a trim filter), never before: these files report a bogus 600 fps and
# input seeking lands on the wrong moment.
#
# Poster is frame zero of the cut, never a separate screenshot: anything else shows a visible
# jump the moment playback starts. Frame zero must therefore be a calm rest state, because for
# reduced-motion visitors, Low Power Mode and anything not yet scrolled into view, the poster
# IS the clip.
set -euo pipefail

NAME="${1:?usage: cut.sh <name> <start-seconds> <duration-seconds> [--nudge S] [--no-dots] [--fade S] [--crf N]}"
START="${2:?}"
DUR="${3:?}"
shift 3

NUDGE=0        # hand correction to dot alignment, seconds (+ moves dots later)
DOTS=1
FADE=0         # fade to black at both ends, seconds; 0 = freeze-and-cut seam
# Measured, not assumed: at the real display width (238 CSS px, so 476 device px at 2x) frames
# from CRF 26, 28, 30 and 32 are indistinguishable - route names, grade chips and the selection
# border are all still crisp at 32. CRF 26 costs 2.0MB for the same 11s that 30 does in 740KB.
# Judge any change to this by downscaling a text-heavy frame to 476px, never at full size.
CRF=30
BAR=19171B    # status bar band colour to repaint to; light takes want FCFAF7. See below.
W=604
H=1314
while [ $# -gt 0 ]; do
  case "$1" in
    --nudge) NUDGE="$2"; shift 2 ;;
    --out) OUT_OVERRIDE="$2"; shift 2 ;;
    --no-dots) DOTS=0; shift ;;
    --fade) FADE="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --bar) BAR="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/raw/$NAME.mp4"
TL="$DIR/raw/$NAME.timeline.json"
REC="$DIR/raw/$NAME.rec.json"
# --out writes a segment somewhere else, for a clip spliced from more than one take. Its poster
# is skipped: the finished clip's poster must be frame zero of the SPLICE, not of a segment.
OUT="${OUT_OVERRIDE:-$DIR/../static/shot-$NAME.mp4}"
POSTER="$DIR/../static/shot-$NAME.jpg"
DOTDIR="$DIR/raw/$NAME.dots"
SRC_W="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$SRC")"
IDBPY="${IDBPY:-/opt/homebrew/opt/idb-cli/libexec/bin/python3}"

# fps=30 first so everything downstream is on a CFR timeline, then clone the last frame for
# three seconds: a take that ENDS on a still hold stops emitting frames, so the stream runs
# out before the hold does and the cut would come back short with no error.
VF="fps=30,tpad=stop_mode=clone:stop_duration=3,trim=start=$START:duration=$DUR,setpts=PTS-STARTPTS"

# Repaint the iOS status bar band. The installed PWA cached the OLD manifest, whose
# `theme_color` was the brand purple (#8E43B2), and iOS paints an installed app's status bar
# from the manifest it read at install time - so every take carries a band the shipped app no
# longer has. Dark takes get a purple one; LIGHT takes get a dark grey one, which is just as
# wrong against a light app, so the replacement is a flag (`--bar`) and not a constant.
# Reinstalling would mean reshooting every approved clip; keying the flat fill out and laying
# the right colour behind it gives the same pixels. Keyed rather than boxed so the clock,
# signal and battery glyphs survive.
#
# 186px = 62pt of safe area at 3x, measured. The key colour is SAMPLED from the take rather
# than hard-coded: it differs between appearances and H.264 shifts it by a couple of levels
# either way. (0.25*W, 8) is inside the band, right of the clock and left of the island.
KEY="$("$IDBPY" -c "
import subprocess, sys
w = $SRC_W
px = subprocess.run(['ffmpeg','-v','error','-i','$SRC','-frames:v','1','-vf',
                     'crop=2:2:%d:8' % (w // 4), '-f','rawvideo','-pix_fmt','rgb24','-'],
                    check=True, capture_output=True).stdout
sys.stdout.write('%02X%02X%02X' % tuple(px[0:3]))
")"
echo "status bar: #$KEY -> #$BAR" >&2
BAND="split[sb_full][sb_crop];[sb_crop]crop=$SRC_W:186:0:0,colorkey=0x$KEY:0.07:0.04[sb_keyed];"
BAND="$BAND color=c=0x$BAR:s=${SRC_W}x186[sb_bg];[sb_bg][sb_keyed]overlay=0:0:shortest=1[sb_fix];"
BAND="$BAND [sb_full][sb_fix]overlay=0:0"

VF="$VF,$BAND,scale=$W:$H"

if [ "$DOTS" = 1 ] && [ -f "$TL" ]; then
  # overlay.py aligns the scripted timeline to the take itself (see align() there): the
  # recorder starts late AND the companion plays the queued stream about 6% slow, so neither
  # end of the clip lands where the script says. --nudge corrects the fit by hand.
  rm -rf "$DOTDIR"
  # Ink follows the bar: a light take gets a black dot. A white one over the light theme's
  # near-white sheet is invisible for the whole sheet drag.
  INK=white
  case "$BAR" in [Ff]*) INK=black ;; esac
  "$IDBPY" "$DIR/overlay.py" "$TL" "$DOTDIR" --src "$SRC" --start "$START" --dur "$DUR" \
    --nudge "$NUDGE" --width "$W" --height "$H" --ink "$INK" >&2
  FC="[0:v]$VF[v];[v][1:v]overlay=0:0:format=auto[o]"
else
  FC="[0:v]$VF[o]"
fi

if [ "$FADE" != 0 ]; then
  FADE_OUT=$(perl -e "printf '%.3f', $DUR - $FADE")
  FC="${FC%\[o\]},fade=t=in:st=0:d=$FADE,fade=t=out:st=$FADE_OUT:d=$FADE[o]"
fi
FC="${FC%\[o\]},format=yuv420p[o]"

if [ "$DOTS" = 1 ] && [ -d "$DOTDIR" ]; then
  ffmpeg -y -loglevel error -i "$SRC" -framerate 30 -i "$DOTDIR/%05d.png" \
    -filter_complex "$FC" -map "[o]" \
    -an -fps_mode cfr -c:v libx264 -crf "$CRF" -preset slow -movflags +faststart "$OUT"
else
  ffmpeg -y -loglevel error -i "$SRC" -filter_complex "$FC" -map "[o]" \
    -an -fps_mode cfr -c:v libx264 -crf "$CRF" -preset slow -movflags +faststart "$OUT"
fi

printf '%s  %s\n' "$(du -h "$OUT" | cut -f1)" "$OUT"
if [ -z "${OUT_OVERRIDE:-}" ]; then
  ffmpeg -y -loglevel error -i "$OUT" -frames:v 1 -q:v 4 "$POSTER"
  printf '%s  %s\n' "$(du -h "$POSTER" | cut -f1)" "$POSTER"
fi
