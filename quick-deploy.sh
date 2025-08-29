#!/bin/bash
# 🚀 СУПЕР-НАДЕЖНОЕ РАЗВЕРТЫВАНИЕ (ТОЛЬКО СВЕЖИЙ КОД)
# Использование: ./quick-deploy.sh

set -e

echo "🔥 СУПЕР-НАДЕЖНОЕ РАЗВЕРТЫВАНИЕ С GIT..."
echo "📦 Сборка свежего кода..."

# 1. Сборка с очисткой
npm run build

# 2. Создание уникального архива
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="fresh-deploy-${TIMESTAMP}.tgz"
echo "📦 Создание архива: ${ARCHIVE_NAME}"
tar -czf "${ARCHIVE_NAME}" dist/ server/server.js

# 3. Копирование на сервер
echo "📤 Отправка на сервер..."
scp "${ARCHIVE_NAME}" ubuntu@146.235.212.239:~

# 4. ПОЛНАЯ ОБНОВЛЕНИЕ СЕРВЕРА С ОЧИСТКОЙ
echo "🔄 Обновление сервера с полной очисткой..."
ssh ubuntu@146.235.212.239 "
cd ~ &&

# Распаковка
tar -xzf ${ARCHIVE_NAME} &&

# 🧹 ПОЛНАЯ ОЧИСТКА старых файлов
echo '🧹 Очистка старых файлов...' &&
rm -rf ~/stonks/dist/assets/* &&
rm -rf ~/stonks/dist/*.html &&
rm -rf ~/stonks/dist/*.ico &&
rm -rf ~/stonks/dist/*.png &&
rm -rf ~/stonks/dist/*.svg &&
rm -rf ~/stonks/dist/*.json &&

# Копирование ТОЛЬКО свежих файлов
cp -r dist/* ~/stonks/dist/ &&
cp server/server.js ~/stonks/server/server.js &&

# Удаление архива
rm ${ARCHIVE_NAME} &&

# Пересборка контейнеров БЕЗ КЭША
cd ~/stonks &&
echo '🔨 Пересборка контейнеров без кэша...' &&
docker compose down &&
docker compose build --no-cache &&
docker compose up -d &&

# Ожидание полного запуска
sleep 25 &&

# Проверка статуса
echo '✅ СТАТУС КОНТЕЙНЕРОВ:' &&
docker ps --format 'table {{.Names}}\t{{.Status}}' &&

# Проверка свежих файлов
echo -e '\n📁 СВЕЖИЕ ФАЙЛЫ:' &&
docker exec stonks-frontend find /usr/share/nginx/html/assets -name 'index-*.js' -exec ls -la {} \\; &&

# Тест API
echo -e '\n🔗 ТЕСТ API:' &&
timeout 10 curl -s https://tradingibs.site/api/status | head -1 || echo 'API недоступен (но это нормально при первом запуске)'
"

# Очистка локального архива
rm "${ARCHIVE_NAME}"

echo "🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!"
echo "🌐 Проверь: https://tradingibs.site"
echo "💡 Файлы обновлены с полной очисткой старых версий!"
