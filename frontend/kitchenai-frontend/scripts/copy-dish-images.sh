#!/usr/bin/env bash
# Copy generated dish PNGs from Cursor assets into the project dishes folder.
set -euo pipefail
SRC="${CURSOR_ASSETS:-$HOME/.cursor/projects/Users-bhavyajain-Downloads-Projects-Kitchenai/assets}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/assets/dishes/masters"
mkdir -p "$DEST"
copied=0
for f in "$SRC"/*.png; do
  [[ -f "$f" ]] || continue
  id="$(basename "$f" .png)"
  [[ "$id" == image-* ]] && continue
  if [[ ! -f "$DEST/$id.png" ]]; then
    cp "$f" "$DEST/$id.png"
    copied=$((copied + 1))
  fi
done
total=$(find "$DEST" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
echo "Copied $copied new images. Total in dishes/masters/: $total"
