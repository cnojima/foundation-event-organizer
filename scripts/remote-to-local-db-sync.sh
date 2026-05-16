#!/usr/bin/env bash
# Sync the production SQLite DB from Fly down to ./data/app.db for local testing.
# Stop `npm run dev` before running — the dev server holds the local DB open.
#
# Usage: scripts/remote-to-local-db-sync.sh [--keep N]
#   --keep N    retain the N newest backup folders under ./data/backups
#               (default 10). Older folders are deleted after a successful sync.

set -euo pipefail

REMOTE_PATH="/data/app.db"
LOCAL_PATH="./data/app.db"
BACKUP_ROOT="./data/backups"
KEEP=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    --keep=*) KEEP="${1#*=}"; shift ;;
    -h|--help)
      sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! [[ "$KEEP" =~ ^[0-9]+$ ]]; then
  echo "--keep must be a non-negative integer, got: $KEEP" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required: brew install jq" >&2
  exit 1
fi

# Run from the project root so fly.toml is discoverable for the initial status call.
cd "$(dirname "$0")/.."

echo "Resolving app + machine ID from fly status..."
STATUS=$(fly status --json)
export FLY_APP=$(echo "$STATUS" | jq -r '(.Name // .name) // empty')
MACHINE_ID=$(echo "$STATUS" | jq -r '(.Machines // .machines)[0].id // empty')
if [ -z "$FLY_APP" ] || [ -z "$MACHINE_ID" ]; then
  echo "Could not parse app name or machine ID from fly status output" >&2
  exit 1
fi
echo "App: $FLY_APP  Machine: $MACHINE_ID"

echo "Checkpointing remote WAL..."
fly ssh console --machine "$MACHINE_ID" -C 'node --input-type=commonjs -e "require(\"/app/node_modules/better-sqlite3\")(\"/data/app.db\").pragma(\"wal_checkpoint(TRUNCATE)\")"'

mkdir -p "$(dirname "$LOCAL_PATH")"

if [ -f "$LOCAL_PATH" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${BACKUP_ROOT}/${TS}"
  echo "Backing up local DB to $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  # Move all three SQLite files together so the backup is a self-consistent
  # snapshot. The new download is a single fully-flushed file with no
  # companions, so wiping -wal/-shm from ./data here is correct.
  base="$(basename "$LOCAL_PATH")"
  mv "$LOCAL_PATH" "$BACKUP_DIR/$base"
  [ -f "${LOCAL_PATH}-wal" ] && mv "${LOCAL_PATH}-wal" "$BACKUP_DIR/${base}-wal"
  [ -f "${LOCAL_PATH}-shm" ] && mv "${LOCAL_PATH}-shm" "$BACKUP_DIR/${base}-shm"
fi

echo "Downloading $REMOTE_PATH..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && fly ssh sftp get --machine "$MACHINE_ID" "$REMOTE_PATH")
mv "$TMP/$(basename "$REMOTE_PATH")" "$LOCAL_PATH"

# Retention: drop older backup folders, keep the KEEP most recent. Timestamp
# names sort lexicographically by creation order, so reverse-sort gives
# newest-first. Skipped when KEEP=0 (treat as "keep everything").
if [ -d "$BACKUP_ROOT" ] && [ "$KEEP" -gt 0 ]; then
  pruned=0
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    rm -rf "${BACKUP_ROOT:?}/${dir:?}"
    pruned=$((pruned + 1))
  done < <(cd "$BACKUP_ROOT" && ls -1d -- */ 2>/dev/null \
            | sed 's:/$::' \
            | sort -r \
            | tail -n +$((KEEP + 1)))
  if [ "$pruned" -gt 0 ]; then
    echo "Pruned $pruned old backup folder(s) (kept $KEEP newest)."
  fi
fi

SIZE=$(ls -lh "$LOCAL_PATH" | awk '{print $5}')
echo "Done. $LOCAL_PATH ($SIZE)"
