#!/bin/bash
# Download a full backup from the production server
# Usage: ./backup-from-server.sh

set -e
umask 077

SERVER="ubuntu@146.235.212.239"
BACKUP_DIR="$HOME/stonks-local-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/backup-$TIMESTAMP"
REMOTE_DIR="/tmp/stonks-backup.$TIMESTAMP.$$"

mkdir -p "$DEST"

trap 'ssh "$SERVER" "rm -rf \"$REMOTE_DIR\"" >/dev/null 2>&1 || true' EXIT

echo "📦 Копируем данные из контейнеров на сервере..."
ssh "$SERVER" "
  set -e
  umask 077
  mkdir -m 700 \"$REMOTE_DIR\"
  mkdir -p \"$REMOTE_DIR\"/staging/db
  mkdir -p \"$REMOTE_DIR\"/staging/datasets
  mkdir -p \"$REMOTE_DIR\"/staging/state

  echo '  → db...'
  docker cp stonks-server:/data/db/. \"$REMOTE_DIR\"/staging/db/

  echo '  → datasets...'
  docker cp stonks-server:/data/datasets/. \"$REMOTE_DIR\"/staging/datasets/

  echo '  → state...'
  docker cp stonks-server:/data/state/. \"$REMOTE_DIR\"/staging/state/ 2>/dev/null || true

  echo '  → архивируем...'
  tar -czf \"$REMOTE_DIR\"/stonks-backup.tar.gz -C \"$REMOTE_DIR\"/staging .
  rm -rf \"$REMOTE_DIR\"/staging
  chmod 600 \"$REMOTE_DIR\"/stonks-backup.tar.gz
  echo 'Размер архива:' \$(du -sh \"$REMOTE_DIR\"/stonks-backup.tar.gz | cut -f1)
"

echo "⬇️  Скачиваем..."
scp "$SERVER:$REMOTE_DIR/stonks-backup.tar.gz" "$DEST/stonks-backup.tar.gz"

echo "🧹 Удаляем временный файл на сервере..."
ssh "$SERVER" "rm -rf \"$REMOTE_DIR\""

echo ""
echo "✅ Готово: $DEST/stonks-backup.tar.gz"
echo "   Размер: $(du -sh "$DEST/stonks-backup.tar.gz" | cut -f1)"
echo ""
echo "   Распаковать: tar -xzf $DEST/stonks-backup.tar.gz -C $DEST/"
