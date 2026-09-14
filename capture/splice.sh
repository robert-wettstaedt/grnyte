#!/usr/bin/env bash
# Join segments into one clip and take the poster from the joined file.
#   ./capture/splice.sh logbook a.mp4 b.mp4
#
# The logbook clip is the only one with a cut in it, and it is shot as two takes rather than one
# because feed and profile share the same scrolling <main>: SvelteKit only resets window scroll,
# so a feed scrolled 400px hands the profile the same offset and the cut lands past the header,
# on dated "Recent sessions" rows. Two takes also mean the cut lands exactly where it should
# instead of wherever a tab tap happened to fall.
#
# Segments come out of cut.sh with identical codec settings, so -c copy is exact and re-encoding
# would only add a generation of loss.
set -euo pipefail

NAME="${1:?usage: splice.sh <name> <segment.mp4>...}"
shift
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/../static/shot-$NAME.mp4"
POSTER="$DIR/../static/shot-$NAME.jpg"
LIST="$DIR/raw/$NAME.concat.txt"

: > "$LIST"
for f in "$@"; do
  [ -f "$f" ] || { echo "missing segment: $f" >&2; exit 1; }
  printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" >> "$LIST"
done

ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy -movflags +faststart "$OUT"
ffmpeg -y -loglevel error -i "$OUT" -frames:v 1 -q:v 4 "$POSTER"

printf '%s  %s\n' "$(du -h "$OUT" | cut -f1)" "$OUT"
printf '%s  %s\n' "$(du -h "$POSTER" | cut -f1)" "$POSTER"
