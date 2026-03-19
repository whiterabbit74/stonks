#!/bin/bash
# One-time cleanup: archive legacy JSON files on server after SQLite migration
# Run ONCE after successful deploy that includes DB migration
# Usage: ./migrate-json-cleanup.sh

set -e

SERVER="ubuntu@146.235.212.239"
STONKS_DIR="~/stonks/server"

echo "🔍 Проверяем что данные успешно мигрированы в SQLite..."

# Check DB has data before touching JSON
DB_CHECK=$(ssh "$SERVER" "
  docker exec stonks-server node -e \"
    const db = require('./server/src/db').getDb();
    const datasets = db.prepare('SELECT COUNT(*) AS n FROM dataset_meta').get().n;
    const splits   = db.prepare('SELECT COUNT(*) AS n FROM splits').get().n;
    const trades   = db.prepare('SELECT COUNT(*) AS n FROM trades').get().n;
    const watches  = db.prepare('SELECT COUNT(*) AS n FROM telegram_watches').get().n;
    const calendar = db.prepare('SELECT COUNT(*) AS n FROM calendar').get().n;
    console.log(JSON.stringify({ datasets, splits, trades, watches, calendar }));
  \" 2>/dev/null
" 2>/dev/null || echo "ERROR")

if echo "$DB_CHECK" | grep -q "ERROR"; then
    echo "❌ Не удалось проверить БД. Отмена."
    exit 1
fi

echo "📊 Данные в SQLite: $DB_CHECK"

# Parse counts — require at least splits or calendar to be present
SPLITS=$(echo "$DB_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['splits'])" 2>/dev/null || echo "0")
CALENDAR=$(echo "$DB_CHECK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['calendar'])" 2>/dev/null || echo "0")

if [ "$SPLITS" -eq 0 ] && [ "$CALENDAR" -eq 0 ]; then
    echo "⚠️  SQLite пуст (splits=0, calendar=0) — миграция не прошла или данных не было."
    echo "Запусти деплой сначала: ./deploy.sh"
    exit 1
fi

echo "✅ SQLite содержит данные. Продолжаем."
echo ""

# Backup JSON files
BACKUP_NAME="json-final-backup-$(date +%Y%m%d_%H%M%S)"
echo "💾 Архивируем JSON-файлы в ~/stonks-backups/$BACKUP_NAME.tar.gz ..."

ssh "$SERVER" "
  cd $STONKS_DIR
  FILES=()
  [ -f splits.json ]             && FILES+=(splits.json)
  [ -f trade-history.json ]      && FILES+=(trade-history.json)
  [ -f telegram-watches.json ]   && FILES+=(telegram-watches.json)
  [ -f trading-calendar.json ]   && FILES+=(trading-calendar.json)
  [ -f settings.json ]           && FILES+=(\"\")  # keep settings.json — still in use

  # Remove settings.json from list (it's still used)
  FILES=()
  [ -f splits.json ]             && FILES+=(splits.json)
  [ -f trade-history.json ]      && FILES+=(trade-history.json)
  [ -f telegram-watches.json ]   && FILES+=(telegram-watches.json)
  [ -f trading-calendar.json ]   && FILES+=(trading-calendar.json)

  if [ \${#FILES[@]} -eq 0 ]; then
    echo 'Нет JSON-файлов для архивации — уже удалены.'
    exit 0
  fi

  echo \"Найдены: \${FILES[*]}\"
  mkdir -p ~/stonks-backups
  tar -czf ~/stonks-backups/$BACKUP_NAME.tar.gz -C $STONKS_DIR \"\${FILES[@]}\"
  echo \"✅ Архив создан: ~/stonks-backups/$BACKUP_NAME.tar.gz\"
  ls -lh ~/stonks-backups/$BACKUP_NAME.tar.gz

  echo ''
  echo '🗑️  Удаляем JSON-файлы...'
  for f in \"\${FILES[@]}\"; do
    rm -f \$f && echo \"  удалён: \$f\"
  done
  echo '✅ Готово.'
"

echo ""
echo "🎉 JSON-файлы заархивированы и удалены."
echo "   Бекап: ~/stonks-backups/$BACKUP_NAME.tar.gz"
echo "   settings.json оставлен (ещё используется сервером)"
echo ""
echo "   Восстановить при необходимости:"
echo "   ssh $SERVER 'tar -xzf ~/stonks-backups/$BACKUP_NAME.tar.gz -C ~/stonks/server/'"
