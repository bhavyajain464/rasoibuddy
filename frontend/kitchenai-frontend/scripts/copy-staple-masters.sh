#!/usr/bin/env bash
# Copy Cursor-generated PNGs into assets/staples/masters/{id}.png
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${CURSOR_ASSETS:-$HOME/.cursor/projects/Users-bhavyajain-Downloads-Projects-Kitchenai/assets}"
MASTERS="$ROOT/assets/staples/masters"
mkdir -p "$MASTERS"

if [[ $# -eq 0 ]]; then
  echo "Usage: copy-staple-masters.sh id [id ...]"
  exit 1
fi

for id in "$@"; do
  src="$SRC/${id}.png"
  dest="$MASTERS/${id}.png"
  if [[ ! -f "$src" ]]; then
    echo "missing: $src" >&2
    continue
  fi
  cp "$src" "$dest"
  echo "copied $id"
done
