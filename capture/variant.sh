#!/usr/bin/env bash
# Shoot and cut the whole set for one theme/locale variant.
#   ./capture/variant.sh dark-en          # -> capture/variants/dark-en/*.mp4
#
# Only one variant ships. The rest exist because the fixture, the sign-in and the simulator are
# all set up right now and will not be later, and because a variant is nearly free once the
# gesture scripts exist: this is the whole reason the beats live in capture/clips/*.py instead of
# in someone's head.
#
# PRECONDITION: the app is on /explore, signed in as anna, in the theme and locale you want.
set -euo pipefail

VARIANT="${1:?usage: variant.sh <name>, e.g. dark-en}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="$DIR/variants/$VARIANT"
C="${COMPANION:-localhost:10882}"
mkdir -p "$OUTDIR" "$DIR/raw/seg"

# What cut.sh repaints the iOS status bar to. The simulator's install cached the old manifest's
# theme_color, so the band is wrong in BOTH appearances - purple in dark, dark grey in light.
# These are app.html's COLORS, which is what the shipped app puts there.
case "$VARIANT" in
  light-*) BAR=FCFAF7 ;;
  *) BAR=19171B ;;
esac
t() { idb --companion "$C" ui tap "$1" "$2" >/dev/null; }

# Cut windows below were tuned once against the dark/en takes. shoot.sh's settle is fixed and
# cut.sh aligns the dots off the take itself, so they carry across variants.
# Measured off the clip's own last frame, not guessed: the viewer back arrow sits at (31, 531)
# with the sheet at the 0.5 detent, and 36pt of error lands on the photo instead.
leave_topo() { t 31 531; sleep 3; t 370 329; sleep 3; }   # viewer back arrow, then the sheet X
leave_sheet() { t 370 329; sleep 3; }
leave_tab() { t 69 840; sleep 4; }                        # Explore tab

TAIL=0.5 "$DIR/shoot.sh" topo >/dev/null 2>&1
"$DIR/cut.sh" topo 1.1 10.1 --bar "$BAR" --out "$OUTDIR/topo.mp4" | tail -1
leave_topo

TAIL=0.5 "$DIR/shoot.sh" map >/dev/null 2>&1
"$DIR/cut.sh" map 0.9 6.6 --bar "$BAR" --out "$OUTDIR/map.mp4" | tail -1
leave_sheet

# Segment names carry the variant. They did not once, and a later variant run silently
# overwrote the segment a hand splice was about to reuse: the shipped clip ended up with an
# English feed cutting to a German profile, which only showed up in a screenshot of the page.
TAIL=0.5 "$DIR/shoot.sh" logbook-a >/dev/null 2>&1
"$DIR/cut.sh" logbook-a 0.95 4.1 --bar "$BAR" --out "$DIR/raw/seg/$VARIANT-a.mp4" | tail -1
TAIL=0.5 "$DIR/shoot.sh" logbook-b >/dev/null 2>&1
"$DIR/cut.sh" logbook-b 0.6 4.1 --bar "$BAR" --out "$DIR/raw/seg/$VARIANT-b.mp4" | tail -1
ffmpeg -y -loglevel error -f concat -safe 0 \
  -i <(printf "file '%s'\nfile '%s'\n" "$DIR/raw/seg/$VARIANT-a.mp4" "$DIR/raw/seg/$VARIANT-b.mp4") \
  -c copy -movflags +faststart "$OUTDIR/logbook.mp4"
printf '%s  %s\n' "$(du -h "$OUTDIR/logbook.mp4" | cut -f1)" "$OUTDIR/logbook.mp4"
leave_tab

echo "variant $VARIANT done -> $OUTDIR"
