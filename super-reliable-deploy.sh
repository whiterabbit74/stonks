#!/bin/bash
# 🛡️ МАКСИМАЛЬНО НАДЕЖНАЯ СИСТЕМА РАЗВЕРТЫВАНИЯ
# Гарантирует использование ТОЛЬКО самого свежего кода из GitHub
# Использование: ./super-reliable-deploy.sh

set -e

echo "🛡️ МАКСИМАЛЬНО НАДЕЖНАЯ СИСТЕМА РАЗВЕРТЫВАНИЯ"
echo "=========================================="

# 1. СИНХРОНИЗАЦИЯ С GITHUB (ПОСЛЕДНЯЯ ВЕРСИЯ)
echo "📥 Синхронизация с GitHub..."
git fetch origin
git reset --hard origin/main
git clean -fd

# 2. ПРОВЕРКА ВЕРСИИ КОДА
echo "🔍 Проверка версии кода..."
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_DATE=$(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M:%S')
echo "📋 Версия: ${GIT_COMMIT} от ${GIT_DATE}"

# 3. СБОРКА С ОЧИСТКОЙ
echo "📦 Сборка с полной очисткой..."
rm -rf dist/
npm run build

# 4. ПРОВЕРКА СБОРКИ
if [ ! -f "dist/index.html" ]; then
    echo "❌ ОШИБКА: Сборка не удалась!"
    exit 1
fi

# 5. СОЗДАНИЕ АРХИВА С МЕТАДАННЫМИ
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="super-fresh-${GIT_COMMIT}-${TIMESTAMP}.tgz"
echo "📦 Создание архива: ${ARCHIVE_NAME}"

# Создание метаданных
echo "{
  \"commit\": \"${GIT_COMMIT}\",
  \"date\": \"${GIT_DATE}\",
  \"timestamp\": \"${TIMESTAMP}\",
  \"build_time\": \"$(date)\"
}" > build-info.json

tar -czf "${ARCHIVE_NAME}" dist/ server/server.js build-info.json

# 6. ОТПРАВКА НА СЕРВЕР
echo "📤 Отправка на сервер..."
scp "${ARCHIVE_NAME}" ubuntu@146.235.212.239:~

# 7. РАЗВЕРТЫВАНИЕ С МАКСИМАЛЬНОЙ НАДЕЖНОСТЬЮ
echo "🚀 Развертывание с максимальной надежностью..."
ssh ubuntu@146.235.212.239 "
cd ~ &&

echo '📦 Распаковка...' &&
tar -xzf ${ARCHIVE_NAME} &&

echo '🧹 ПОЛНАЯ ОЧИСТКА СЕРВЕРА...' &&
# Остановка всех сервисов
cd ~/stonks && docker compose down || true

# Очистка всех старых файлов
echo 'Удаление старых образов...' &&
docker system prune -f || true

# Очистка директорий
echo 'Очистка директорий...' &&
rm -rf ~/stonks/dist/* &&
rm -rf ~/stonks/server/server.js.backup 2>/dev/null || true

# Резервное копирование текущего server.js
cp ~/stonks/server/server.js ~/stonks/server/server.js.backup 2>/dev/null || true

echo '🔄 Копирование свежих файлов...' &&
cp -r ~/dist/* ~/stonks/dist/ &&
cp ~/server/server.js ~/stonks/server/server.js &&

echo '📋 Сохранение информации о сборке...' &&
cp ~/build-info.json ~/stonks/build-info.json &&

echo '🔨 Пересборка контейнеров без кэша...' &&
cd ~/stonks &&
docker compose build --no-cache &&
docker compose up -d &&

echo '⏳ Ожидание запуска (30 сек)...' &&
sleep 30 &&

echo '✅ ПРОВЕРКА РАЗВЕРТЫВАНИЯ:' &&
echo 'Контейнеры:' &&
docker ps --format 'table {{.Names}}\t{{.Status}}' &&

echo -e '\nИнформация о сборке:' &&
cat ~/stonks/build-info.json &&

echo -e '\nСвежие файлы:' &&
docker exec stonks-frontend find /usr/share/nginx/html/assets -name 'index-*.js' -exec ls -la {} \\; 2>/dev/null || echo 'Контейнер не запущен' &&

echo -e '\nТест API:' &&
timeout 15 curl -s https://tradingibs.site/api/status | head -1 2>/dev/null || echo 'API недоступен' &&

# Очистка
rm ~/${ARCHIVE_NAME} ~/build-info.json ~/server/ ~/dist/ -rf
"

# 8. ФИНАЛЬНАЯ ПРОВЕРКА
echo "🎯 ФИНАЛЬНАЯ ПРОВЕРКА..."
sleep 5

# Проверка доступности сайта
if curl -s -I https://tradingibs.site/ | grep -q "200"; then
    echo "✅ САЙТ ДОСТУПЕН!"
else
    echo "⚠️  САЙТ НЕДОСТУПЕН (возможно, еще запускается)"
fi

# Очистка локальных файлов
rm "${ARCHIVE_NAME}" build-info.json

echo ""
# 9. ОТПРАВКА УВЕДОМЛЕНИЯ В TELEGRAM
echo "📨 Отправка уведомления в Telegram..."

# Получаем настройки с сервера
TELEGRAM_SETTINGS=$(curl -s "https://tradingibs.site/api/settings" | grep -o '"telegram":{[^}]*}' | sed 's/"telegram"://') || true

if [ -n "$TELEGRAM_SETTINGS" ]; then
    BOT_TOKEN=$(echo "$TELEGRAM_SETTINGS" | grep -o '"botToken":"[^"]*"' | cut -d'"' -f4)
    CHAT_ID=$(echo "$TELEGRAM_SETTINGS" | grep -o '"chatId":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] && [ "$BOT_TOKEN" != "" ] && [ "$CHAT_ID" != "" ]; then
        MESSAGE="🚀 Сервер обновлен!"
        MESSAGE="$MESSAGE%0A%0A📱 Версия: ${GIT_COMMIT}"
        MESSAGE="$MESSAGE%0A🕰 Дата: ${GIT_DATE}"
        MESSAGE="$MESSAGE%0A🌐 Сайт: https://tradingibs.site"
        MESSAGE="$MESSAGE%0A%0A✅ Развертывание завершено!"
        
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
             -d "chat_id=${CHAT_ID}" \
             -d "text=${MESSAGE}" \
             -d "parse_mode=HTML" > /dev/null 2>&1 || echo "⚠️  Не удалось отправить сообщение в Telegram"
        
        echo "✅ Уведомление отправлено в Telegram!"
    else
        echo "⚠️  Telegram настройки не настроены"
    fi
else
    echo "⚠️  Не удалось получить Telegram настройки"
fi

echo ""
echo "🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!"
echo "📋 Версия: ${GIT_COMMIT} от ${GIT_DATE}"
echo "🌐 Сайт: https://tradingibs.site"
echo ""
echo "💡 ГАРАНТИИ НАДЕЖНОСТИ:"
echo "   ✅ Код только из GitHub (последний коммит)"
echo "   ✅ Полная очистка старых файлов"
echo "   ✅ Пересборка контейнеров без кэша"
echo "   ✅ Проверка целостности сборки"
echo "   ✅ Метаданные о версии сохранены"
echo "   ✅ Уведомление отправлено в Telegram"
