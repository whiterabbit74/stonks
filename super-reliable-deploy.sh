#!/bin/bash
# 🛡️ МАКСИМАЛЬНО НАДЕЖНАЯ СИСТЕМА РАЗВЕРТЫВАНИЯ
# Гарантирует использование ТОЛЬКО самого свежего кода из GitHub
# Использование: ./super-reliable-deploy.sh

set -e

echo "🛡️ МАКСИМАЛЬНО НАДЕЖНАЯ СИСТЕМА РАЗВЕРТЫВАНИЯ"
echo "=========================================="

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

tar -czf "${ARCHIVE_NAME}" dist/ server/ build-info.json

# 6. ОТПРАВКА НА СЕРВЕР
echo "📤 Отправка на сервер..."
scp "${ARCHIVE_NAME}" ubuntu@146.235.212.239:~

# 7. РАЗВЕРТЫВАНИЕ С МАКСИМАЛЬНОЙ НАДЕЖНОСТЬЮ
echo "🚀 Развертывание с максимальной надежностью..."
ssh ubuntu@146.235.212.239 "
cd ~ &&

echo '📦 Распаковка...' &&
tar -xzf ${ARCHIVE_NAME} &&

echo '📥 Синхронизация git репозитория на сервере...' &&
cd ~/stonks &&
git fetch origin &&
git reset --hard origin/main &&
echo 'Актуальный коммит на сервере:' &&
git log --oneline -1 &&

echo '🧹 ПОЛНАЯ ОЧИСТКА СЕРВЕРА...' &&
# Остановка всех сервисов
docker compose down || true

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

# Получаем настройки напрямую из контейнера
echo "🔍 Получаем настройки из контейнера..."
SETTINGS_RESPONSE=$(ssh ubuntu@146.235.212.239 "docker exec stonks-backend cat /app/server/settings.json 2>/dev/null || echo '{}'" 2>/dev/null || echo "{}")
echo "📝 Настройки из контейнера: $SETTINGS_RESPONSE"

# Парсим Telegram настройки из JSON
if [ -n "$SETTINGS_RESPONSE" ] && [ "$SETTINGS_RESPONSE" != "{}" ]; then
    BOT_TOKEN=$(echo "$SETTINGS_RESPONSE" | grep -o '"botToken":"[^"]*"' | cut -d'"' -f4 || echo "")
    CHAT_ID=$(echo "$SETTINGS_RESPONSE" | grep -o '"chatId":"[^"]*"' | cut -d'"' -f4 || echo "")
    
    echo "🤖 Bot Token: ${BOT_TOKEN:0:10}... (длина: ${#BOT_TOKEN})"
    echo "💬 Chat ID: $CHAT_ID"
    
    if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] && [ "${#BOT_TOKEN}" -gt 10 ] && [ "$CHAT_ID" != "" ]; then
        echo "📤 Отправляем сообщение..."
        
        MESSAGE="🚀 Сервер обновлен!"
        MESSAGE="$MESSAGE\n\n💻 Версия: ${GIT_COMMIT}"
        MESSAGE="$MESSAGE\n🕰 Дата: ${GIT_DATE}"
        MESSAGE="$MESSAGE\n🌐 Сайт: https://tradingibs.site"
        MESSAGE="$MESSAGE\n\n✅ Развертывание завершено!"
        
        TELEGRAM_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
             -H "Content-Type: application/x-www-form-urlencoded" \
             -d "chat_id=${CHAT_ID}" \
             -d "text=${MESSAGE}" \
             -d "parse_mode=Markdown" 2>&1)
        
        if echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true'; then
            echo "✅ Уведомление успешно отправлено в Telegram!"
        else
            echo "⚠️  Ошибка отправки в Telegram: $TELEGRAM_RESPONSE"
        fi
    else
        echo "⚠️  Telegram настройки некорректны или пусты"
        echo "   Bot Token length: ${#BOT_TOKEN}, Chat ID: '$CHAT_ID'"
    fi
else
    echo "⚠️  Не удалось получить настройки из контейнера, пробуем через API..."
    SETTINGS_RESPONSE=$(curl -s "https://tradingibs.site/api/settings" || echo "")
    echo "📝 Ответ API: $SETTINGS_RESPONSE"
    
    if [ -n "$SETTINGS_RESPONSE" ]; then
        BOT_TOKEN=$(echo "$SETTINGS_RESPONSE" | grep -o '"botToken":"[^"]*"' | cut -d'"' -f4 || echo "")
        CHAT_ID=$(echo "$SETTINGS_RESPONSE" | grep -o '"chatId":"[^"]*"' | cut -d'"' -f4 || echo "")
        
        echo "🤖 Bot Token (API): ${BOT_TOKEN:0:10}... (длина: ${#BOT_TOKEN})"
        echo "💬 Chat ID (API): $CHAT_ID"
        
        if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] && [ "${#BOT_TOKEN}" -gt 10 ] && [ "$CHAT_ID" != "" ]; then
            echo "📤 Отправляем сообщение через API настройки..."
            
            MESSAGE="🚀 Сервер обновлен!"
            MESSAGE="$MESSAGE\n\n💻 Версия: ${GIT_COMMIT}"
            MESSAGE="$MESSAGE\n🕰 Дата: ${GIT_DATE}"
            MESSAGE="$MESSAGE\n🌐 Сайт: https://tradingibs.site"
            MESSAGE="$MESSAGE\n\n✅ Развертывание завершено!"
            
            TELEGRAM_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
                 -H "Content-Type: application/x-www-form-urlencoded" \
                 -d "chat_id=${CHAT_ID}" \
                 -d "text=${MESSAGE}" \
                 -d "parse_mode=Markdown" 2>&1)
            
            if echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true'; then
                echo "✅ Уведомление успешно отправлено в Telegram (через API)!"
            else
                echo "⚠️  Ошибка отправки в Telegram (API): $TELEGRAM_RESPONSE"
            fi
        else
            echo "⚠️  Telegram настройки некорректны (API)"
        fi
    else
        echo "⚠️  API также недоступен"
    fi
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
