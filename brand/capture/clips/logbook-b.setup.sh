#!/usr/bin/env bash
# Not recorded: anna's profile, scrolled to the top, pyramid showing All sends.
#
# Top of the page is the whole payload and also the safety line: header stats, the contribution
# calendar (month labels only, no year) and the grade pyramid all fit above "Recent sessions",
# whose day headings print an absolute date beyond seven days. Scroll one notch further and the
# clip is dated.
#
# PRECONDITION: the app is signed in as anna, anywhere with the tab bar visible (no sheet open).
set -euo pipefail
C="${COMPANION:-localhost:10882}"
t() { idb --companion "$C" ui tap "$1" "$2" >/dev/null; }
sw() { idb --companion "$C" ui swipe "$1" "$2" "$3" "$4" --duration "$5" >/dev/null; }

t 338 840 # Profile tab
sleep 5

# Scroll to the top BEFORE touching the pyramid. Feed and profile share one scrolling <main>
# that survives the route swap, so on arrival the page sits wherever the last take left it, and
# a tap at a fixed coordinate lands on whatever happens to be there rather than on the filter.
for _ in 1 2 3 4; do
  sw 201 250 201 820 0.35
  sleep 1
done
sleep 2

t 275 574 # All sends, whatever the last take left
sleep 2
