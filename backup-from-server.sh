#!/bin/bash
# Download a full backup from the production server
# Usage: ./backup-from-server.sh
#
# The database is copied with SQLite's own VACUUM INTO, not with docker cp:
# trading.db runs in WAL mode while the server writes to it, so a file-level
# copy can catch a torn page or a WAL that does not match the main file
# (AUD-058). VACUUM INTO reads inside a transaction and writes one complete,
# already checkpointed database — the archive holds no -wal / -shm files.

set -euo pipefail
umask 077

SERVER="${STONKS_SERVER:-ubuntu@146.235.212.239}"
CONTAINER="${STONKS_CONTAINER:-stonks-server}"
BACKUP_DIR="$HOME/stonks-local-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/backup-$TIMESTAMP"
REMOTE_DIR="/tmp/stonks-backup.$TIMESTAMP.$$"

mkdir -p "$DEST"

trap 'ssh "$SERVER" "rm -rf \"$REMOTE_DIR\"" >/dev/null 2>&1 || true' EXIT

echo "📦 Копируем данные из контейнеров на сервере..."
ssh "$SERVER" REMOTE_DIR="$REMOTE_DIR" CONTAINER="$CONTAINER" bash -s <<'REMOTE'
set -e
umask 077
mkdir -m 700 "$REMOTE_DIR"
mkdir -p "$REMOTE_DIR"/staging/db
mkdir -p "$REMOTE_DIR"/staging/datasets
mkdir -p "$REMOTE_DIR"/staging/state

# Runs inside a throwaway container on the server's own volumes. The snapshot
# is verified before it counts as a backup: a bad copy must fail here, not on
# the day it is restored.
cat > "$REMOTE_DIR"/vacuum.sh <<'SH'
set -e
apk add --no-cache sqlite >/dev/null
sqlite3 /data/db/trading.db "VACUUM INTO '/backup/trading.db'"
check=$(sqlite3 /backup/trading.db 'PRAGMA integrity_check')
if [ "$check" != ok ]; then
  echo "integrity_check: $check" >&2
  exit 1
fi
chown "$OWNER" /backup/trading.db
SH

echo '  → db (VACUUM INTO живой БД)...'
docker run --rm \
  --volumes-from "$CONTAINER" \
  -v "$REMOTE_DIR"/staging/db:/backup \
  -v "$REMOTE_DIR"/vacuum.sh:/vacuum.sh:ro \
  -e OWNER="$(id -u):$(id -g)" \
  alpine sh /vacuum.sh

echo '  → datasets...'
docker cp "$CONTAINER":/data/datasets/. "$REMOTE_DIR"/staging/datasets/

echo '  → state...'
docker cp "$CONTAINER":/data/state/. "$REMOTE_DIR"/staging/state/ 2>/dev/null || true

echo '  → архивируем...'
tar -czf "$REMOTE_DIR"/stonks-backup.tar.gz -C "$REMOTE_DIR"/staging .
rm -rf "$REMOTE_DIR"/staging "$REMOTE_DIR"/vacuum.sh
chmod 600 "$REMOTE_DIR"/stonks-backup.tar.gz
echo 'Размер архива:' "$(du -sh "$REMOTE_DIR"/stonks-backup.tar.gz | cut -f1)"
REMOTE

echo "⬇️  Скачиваем..."
scp "$SERVER:$REMOTE_DIR/stonks-backup.tar.gz" "$DEST/stonks-backup.tar.gz"

echo "🧹 Удаляем временный файл на сервере..."
ssh "$SERVER" "rm -rf \"$REMOTE_DIR\""

echo ""
echo "✅ Готово: $DEST/stonks-backup.tar.gz"
echo "   Размер: $(du -sh "$DEST/stonks-backup.tar.gz" | cut -f1)"
echo ""
echo "   Распаковать: tar -xzf $DEST/stonks-backup.tar.gz -C $DEST/"
