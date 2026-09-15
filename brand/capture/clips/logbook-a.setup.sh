#!/usr/bin/env bash
# Not recorded: the Activity feed, scrolled to the top.
#
# Scrolling to the top explicitly is not belt-and-braces. Feed and profile share one scrolling
# <main> that survives the route swap, so whatever the last take left behind is where this one
# starts, and a feed that opens part-scrolled shows day dividers older than seven days - which
# is where relative time flips to an absolute "Sep 6, 2026" and dates the clip forever.
#
# PRECONDITION: the app is signed in as anna, anywhere with the tab bar visible (no sheet open).
set -euo pipefail
C="${COMPANION:-localhost:10882}"
t() { idb --companion "$C" ui tap "$1" "$2" >/dev/null; }
sw() { idb --companion "$C" ui swipe "$1" "$2" "$3" "$4" --duration "$5" >/dev/null; }

t 201 840 # Feed tab
sleep 5
for _ in 1 2 3 4; do
  sw 201 250 201 820 0.35
  sleep 1
done
sleep 2

# The "N new activities" pill is a live query, sticky at the top of the list, and it stays until
# someone taps it. It would sit in the middle of the opening frame. Tapping where it renders
# merges the rows; if it is absent the tap lands on the first day divider and does nothing.
t 201 206
sleep 3
for _ in 1 2; do
  sw 201 250 201 820 0.35
  sleep 1
done
sleep 2
