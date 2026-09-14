#!/usr/bin/env bash
# Not recorded: Explore map -> The Roof's block page.
#
# PRECONDITION: the app is on /explore with the search bar visible. Searching rather than
# tapping the pin is deliberate - a pin moves with the map framing, the search field does not.
# A home-screen web app cannot be launched or terminated with simctl (its only bundles are
# WebKit push helpers) and HOME + icon only RESUMES it, so there is no way to force a known
# route except through the UI.
set -euo pipefail
C="${COMPANION:-localhost:10882}"
t() { idb --companion "$C" ui tap "$1" "$2" >/dev/null; }

t 333 94 # clear any previous query; `ui text` APPENDS, it does not replace
sleep 2
t 210 94 # search field
sleep 2
idb --companion "$C" ui text "The Roof" >/dev/null
sleep 3
t 201 187 # the single BLOCKS result
sleep 5   # sheet slide + the 1024px topo derivative
