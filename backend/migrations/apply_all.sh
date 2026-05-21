#!/usr/bin/env bash
# Apply all migrations in order. Usage: ./apply_all.sh [database_name]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${1:-kitchenai}"
for f in $(ls "$DIR"/[0-9]*.sql 2>/dev/null | sort); do
  echo "Applying $(basename "$f") ..."
  psql -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
done
echo "Done."
