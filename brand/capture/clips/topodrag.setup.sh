#!/usr/bin/env bash
# Not recorded: topo viewer, sheet raised, Sit Start selected, zoomed in. Probe clip.
set -euo pipefail
C="${COMPANION:-localhost:10882}"
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANION="$C" bash "$DIR/topo.setup.sh"
idb --companion "$C" ui tap 120 620 >/dev/null
sleep 4
COMPANION="$C" CAPTURE_DIR="$(cd "$DIR/.." && pwd)" \
  "${IDBPY:-/opt/homebrew/opt/idb-cli/libexec/bin/python3}" - <<'PY'
import os
import sys
sys.path.insert(0, os.environ['CAPTURE_DIR'])
from rig import Rig
r = Rig()
r.wait(0.3)
r.drag([(201, 687), (201, 600), (201, 523)], duration=0.9, settle=0.30, takeup=33)
r.wait(1.0)
r.drag([(201, 800), (201, 755), (201, 710)], duration=0.6, ease='out', takeup=20)
r.wait(1.0)
r.tap(119, 768)
r.wait(1.0)
r.pinch(200, 267, 2.2, duration=0.5, radius=80)
r.wait(1.4)
r.run('topodrag-setup')
PY
