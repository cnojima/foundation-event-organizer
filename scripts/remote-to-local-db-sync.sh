#!/usr/bin/env bash
# Sync the production SQLite DB from Fly down to ./data/app.db for local testing.
# Stop `npm run dev` before running — the dev server holds the local DB open.

set -euo pipefail

REMOTE_PATH="/data/app.db"
LOCAL_PATH="./data/app.db"

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
  BACKUP="${LOCAL_PATH}.${TS}.bak"
  echo "Backing up local DB to $BACKUP"
  mv "$LOCAL_PATH" "$BACKUP"
  # Keep WAL/SHM with the backup so the snapshot is self-consistent;
  # the new download is a single fully-flushed file with no companions.
  [ -f "${LOCAL_PATH}-wal" ] && mv "${LOCAL_PATH}-wal" "${BACKUP}-wal"
  [ -f "${LOCAL_PATH}-shm" ] && mv "${LOCAL_PATH}-shm" "${BACKUP}-shm"
fi

echo "Downloading $REMOTE_PATH..."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && fly ssh sftp get --machine "$MACHINE_ID" "$REMOTE_PATH")
mv "$TMP/$(basename "$REMOTE_PATH")" "$LOCAL_PATH"

SIZE=$(ls -lh "$LOCAL_PATH" | awk '{print $5}')
echo "Done. $LOCAL_PATH ($SIZE)"
