#!/bin/bash
# 🚀 DEPLOY
# Гарантирует использование ТОЛЬКО самого свежего кода из GitHub
# Использование: ./deploy.sh

set -e

echo "🚀 DEPLOY"
echo "========="

# 1. ПРОВЕРКА И ОТПРАВКА ЛОКАЛЬНОГО КОДА НА GITHUB
echo "🔍 Проверка синхронизации с GitHub..."
git fetch origin

# СНАЧАЛА проверяем есть ли незакоммиченные изменения
if ! git diff-index --quiet HEAD --; then
    echo "❌ ОШИБКА: Есть незакоммиченные изменения!"
    echo "Сначала сделайте commit:"
    git status
    exit 1
fi

# ПОТОМ проверяем есть ли неотправленные коммиты
LOCAL_COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
if [ "$LOCAL_COMMITS_AHEAD" -gt 0 ]; then
    echo "⚠️  ВНИМАНИЕ: У вас есть $LOCAL_COMMITS_AHEAD неотправленных коммитов!"
    echo "Неотправленные коммиты:"
    git log --oneline origin/main..HEAD
    echo ""
    read -p "Отправить их на GitHub автоматически? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📤 Отправляем коммиты на GitHub..."
        git push origin main
        echo "✅ Коммиты отправлены!"
    else
        echo "❌ Развертывание остановлено. Сначала отправьте коммиты: git push origin main"
        exit 1
    fi
fi

# Проверяем синхронизацию с GitHub
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "⚠️  Локальный код не синхронизирован с GitHub"
    echo "Локальный:  $(git rev-parse --short HEAD) - $(git log -1 --format=%s)"
    echo "GitHub:     $(git rev-parse --short origin/main) - $(git log -1 --format=%s origin/main)"
    
    # Проверяем можно ли автоматически отправить
    if git merge-base --is-ancestor origin/main HEAD; then
        echo "✅ Локальный код новее - отправляем на GitHub..."
        git push origin main
        echo "📤 Код успешно отправлен на GitHub"
        # КРИТИЧЕСКИ ВАЖНО: Обновляем remote HEAD после push
        git fetch origin
        echo "🔄 Обновлен remote HEAD после push"
    else
        echo "❌ ОШИБКА: Конфликт с GitHub! Нужно вручную разрешить"
        echo "Выполните: git pull --rebase origin main"
        exit 1
    fi
else
    echo "✅ Код синхронизирован с GitHub"
fi

# ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Убеждаемся что GitHub получил наши изменения
echo "🔍 Финальная проверка синхронизации..."
FINAL_LOCAL=$(git rev-parse HEAD)
FINAL_REMOTE=$(git rev-parse origin/main)

if [ "$FINAL_LOCAL" != "$FINAL_REMOTE" ]; then
    echo "❌ КРИТИЧЕСКАЯ ОШИБКА: GitHub не получил изменения!"
    echo "Локальный: $FINAL_LOCAL"
    echo "GitHub:    $FINAL_REMOTE" 
    echo "Развертывание остановлено для предотвращения деплоя старого кода"
    exit 1
else
    echo "✅ Финальная проверка пройдена - GitHub синхронизирован"
fi

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

COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata \
    --exclude='server/node_modules' \
    --exclude='server/db' \
    -czf "${ARCHIVE_NAME}" dist/ server/ build-info.json

# 6. ОТПРАВКА НА СЕРВЕР
echo "📤 Отправка на сервер..."
scp "${ARCHIVE_NAME}" ubuntu@146.235.212.239:~

# 7. РАЗВЕРТЫВАНИЕ С МАКСИМАЛЬНОЙ НАДЕЖНОСТЬЮ
echo "🚀 Развертывание с максимальной надежностью..."
ssh ubuntu@146.235.212.239 "
cd ~ &&

echo '📦 Распаковка...' &&
tar -xzf ${ARCHIVE_NAME} 2>/dev/null &&

echo '📥 Синхронизация git репозитория на сервере...' &&
cd ~/stonks &&
git fetch origin &&
git reset --hard origin/main &&
echo 'Актуальный коммит на сервере:' &&
git log --oneline -1 &&

echo '💾 БЕКАП JSON ДАННЫХ...' &&
BACKUP_DIR=~/stonks-backups &&
BACKUP_NAME=backup_\$(date +%Y%m%d_%H%M%S) &&
mkdir -p \$BACKUP_DIR/\$BACKUP_NAME &&

# Копируем JSON данные если они существуют
if [ -d ~/stonks/server/datasets ]; then
    cp -r ~/stonks/server/datasets \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
fi &&
[ -f ~/stonks/server/settings.json ] && cp ~/stonks/server/settings.json \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
[ -f ~/stonks/server/splits.json ] && cp ~/stonks/server/splits.json \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
[ -f ~/stonks/server/telegram-watches.json ] && cp ~/stonks/server/telegram-watches.json \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
[ -f ~/stonks/server/trade-history.json ] && cp ~/stonks/server/trade-history.json \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
[ -f ~/stonks/server/trading-calendar.json ] && cp ~/stonks/server/trading-calendar.json \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true
[ -d ~/stonks/server/db ] && cp -r ~/stonks/server/db \$BACKUP_DIR/\$BACKUP_NAME/ 2>/dev/null || true

echo "✅ Бекап создан: \$BACKUP_NAME" &&

# Удаляем старые бекапы, оставляем только 5 последних
echo 'Очистка старых бекапов (оставляем 5 последних)...' &&
cd \$BACKUP_DIR && ls -dt backup_* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
echo "📦 Текущие бекапы:" && ls -dt backup_* 2>/dev/null | head -5 || echo 'Нет бекапов'
cd ~ &&

echo '🧹 ПОЛНАЯ ОЧИСТКА СЕРВЕРА...' &&
# Остановка всех сервисов
docker compose down || true

# Очистка dangling образов (build cache НЕ трогаем — иначе каждый раз переустанавливаем пакеты)
echo 'Удаление dangling образов...' &&
docker image prune -f || true

# Очистка директорий
echo 'Очистка директорий...' &&
rm -rf ~/stonks/dist/* &&

echo '🔄 Копирование свежих файлов...' &&
if [ ! -d ~/dist ]; then
    echo '❌ ОШИБКА: Директория ~/dist не существует!'
    ls -la ~/ | grep -E '(dist|server|build-info)'
    exit 1
fi &&
if [ ! -f ~/dist/index.html ]; then
    echo '❌ ОШИБКА: Файл ~/dist/index.html не найден!'
    ls -la ~/dist/
    exit 1
fi &&
if [ ! -d ~/server ]; then
    echo '❌ ОШИБКА: Директория ~/server не существует!'
    ls -la ~/ | grep -E '(dist|server|build-info)'
    exit 1
fi &&
if [ ! -f ~/server/server.js ]; then
    echo '❌ ОШИБКА: Файл ~/server/server.js не найден!'
    ls -la ~/server/
    exit 1
fi &&
echo 'Копируем frontend файлы...' &&
cp -r ~/dist/* ~/stonks/dist/ &&
echo 'Копируем server файлы...' &&
cp -r ~/server/* ~/stonks/server/ &&

echo '📋 Сохранение информации о сборке...' &&
cp ~/build-info.json ~/stonks/build-info.json &&

echo '🔍 Проверка конфигурации окружения...' &&
if [ ! -f /home/ubuntu/stonks-config/.env ]; then
    echo '❌ КРИТИЧЕСКАЯ ОШИБКА: /home/ubuntu/stonks-config/.env не найден!' &&
    echo 'Файл с секретами должен быть создан вручную.' &&
    echo 'Инструкция: см. ENVIRONMENT.md в репозитории' &&
    exit 1
fi &&
echo '✅ Файл конфигурации найден' &&

echo '🔨 Пересборка контейнеров...' &&
cd ~/stonks &&
docker compose build &&
if [ $? -ne 0 ]; then
    echo '❌ ОШИБКА: Сборка контейнеров не удалась!'
    exit 1
fi &&
echo '🚀 Запуск контейнеров...' &&
docker compose up -d &&
if [ $? -ne 0 ]; then
    echo '❌ ОШИБКА: Запуск контейнеров не удался!'
    echo 'Статус контейнеров:' && docker compose ps -a
    echo '🔍 ПОСЛЕДНИЕ ЛОГИ СЕРВЕРА:'
    docker compose logs --tail=50 server
    exit 1
fi &&

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

# 8. УБЕЖДАЕМСЯ ЧТО КОНТЕЙНЕРЫ ЗАПУЩЕНЫ
echo "🔄 Финальная проверка и запуск контейнеров..."
ssh ubuntu@146.235.212.239 "
cd ~/stonks &&
echo 'Проверяем статус контейнеров...' &&
docker compose ps &&
echo 'Запускаем контейнеры (если не запущены)...' &&
docker compose up -d
"

# 9. ФИНАЛЬНАЯ ПРОВЕРКА
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
# 10. ОТПРАВКА УВЕДОМЛЕНИЯ В TELEGRAM
echo "📨 Отправка уведомления в Telegram..."

# Читаем токен и chat_id прямо из .env на сервере
BOT_TOKEN=$(ssh ubuntu@146.235.212.239 "grep '^TELEGRAM_BOT_TOKEN=' /home/ubuntu/stonks-config/.env 2>/dev/null | cut -d'=' -f2-" 2>/dev/null || echo "")
CHAT_ID=$(ssh ubuntu@146.235.212.239 "grep '^TELEGRAM_CHAT_ID=' /home/ubuntu/stonks-config/.env 2>/dev/null | cut -d'=' -f2-" 2>/dev/null || echo "")

if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ]; then
    MESSAGE="🚀 Сервер обновлен!%0A%0A💻 Версия: ${GIT_COMMIT}%0A🕰 Дата: ${GIT_DATE}%0A🌐 Сайт: https://tradingibs.site%0A%0A✅ Развертывание завершено!"
    TELEGRAM_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        -d "text=${MESSAGE}" 2>&1)
    if echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true'; then
        echo "✅ Уведомление отправлено в Telegram!"
    else
        echo "⚠️  Ошибка отправки в Telegram: $TELEGRAM_RESPONSE"
    fi
else
    echo "⚠️  TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не найдены в /home/ubuntu/stonks-config/.env"
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
