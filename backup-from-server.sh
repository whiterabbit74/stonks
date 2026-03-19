#!/bin/bash
# Download a full backup from the production server
# Usage: ./backup-from-server.sh

set -e

SERVER="ubuntu@146.235.212.239"
BACKUP_DIR="$HOME/stonks-local-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/backup-$TIMESTAMP"

mkdir -p "$DEST"

echo "📦 Копируем данные из контейнеров на сервере..."
ssh "$SERVER" "
  set -e
  rm -rf /tmp/stonks-backup-staging
  mkdir -p /tmp/stonks-backup-staging/db
  mkdir -p /tmp/stonks-backup-staging/datasets
  mkdir -p /tmp/stonks-backup-staging/state

  echo '  → db...'
  docker cp stonks-server:/data/db/. /tmp/stonks-backup-staging/db/

  echo '  → datasets...'
  docker cp stonks-server:/data/datasets/. /tmp/stonks-backup-staging/datasets/

  echo '  → state...'
  docker cp stonks-server:/data/state/. /tmp/stonks-backup-staging/state/ 2>/dev/null || true

  echo '  → архивируем...'
  tar -czf /tmp/stonks-backup.tar.gz -C /tmp/stonks-backup-staging .
  rm -rf /tmp/stonks-backup-staging
  echo 'Размер архива:' \$(du -sh /tmp/stonks-backup.tar.gz | cut -f1)
"

echo "⬇️  Скачиваем..."
scp "$SERVER":/tmp/stonks-backup.tar.gz "$DEST/stonks-backup.tar.gz"

echo "🧹 Удаляем временный файл на сервере..."
ssh "$SERVER" "rm -f /tmp/stonks-backup.tar.gz"

echo ""
echo "✅ Готово: $DEST/stonks-backup.tar.gz"
echo "   Размер: $(du -sh "$DEST/stonks-backup.tar.gz" | cut -f1)"
echo ""
echo "   Распаковать: tar -xzf $DEST/stonks-backup.tar.gz -C $DEST/"
