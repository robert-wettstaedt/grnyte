#!/usr/bin/env bash
# Not recorded: The Roof's topo viewer, sheet at its opening detent. Scratch probe clip -
# one gesture per take so a sync problem can be judged on its own.
set -euo pipefail
C="${COMPANION:-localhost:10882}"
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANION="$C" bash "$DIR/topo.setup.sh"
idb --companion "$C" ui tap 120 620 >/dev/null
sleep 4
