#!/bin/bash

set -e

echo "=== УМНОЕ ОБНОВЛЕНИЕ КОДА С ГИТХАБ ==="
echo "🔧 Этот скрипт сохраняет важные файлы при обновлении"

# Проверяем, что мы в правильной директории
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Запустите скрипт из корневой папки проекта"
    exit 1
fi

# Проверяем SSL конфигурацию перед обновлением
echo "🔒 Проверяю SSL конфигурацию..."

# Check if Caddyfile exists and check for staging
if [ -f "caddy/Caddyfile" ]; then
    if grep -q "staging" caddy/Caddyfile; then
        echo "⚠️  ВНИМАНИЕ: Найдены STAGING настройки в Caddyfile!"
        echo "   Это может привести к использованию тестовых SSL сертификатов."
        echo ""
        echo "   Рекомендуется обновить до production настроек:"
        echo "   TLS_CA=https://acme-v02.api.letsencrypt.org/directory"
        echo ""
        read -p "Продолжить с текущими настройками? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Обновление отменено пользователем"
            exit 1
        fi
    else
        echo "✅ SSL конфигурация выглядит корректной"
    fi
else
    echo "⚠️  Caddyfile не найден, будет создан новый"
fi

# Создаем бэкап важных файлов
timestamp=$(date +"%Y%m%d_%H%M%S")
backup_name="smart_backup_${timestamp}"
echo "📦 Создаю бэкап важных файлов: ${backup_name}"

mkdir -p ~/backups
tar -czf ~/backups/${backup_name}.tar.gz \
    --exclude='node_modules' \
    --exclude='*.tar.gz' \
    --exclude='dist' \
    docker-compose.yml \
    server/.env \
    caddy/Caddyfile \
    docker/nginx.conf \
    2>/dev/null || true

# Скачиваем новый код
echo "⬇️  Скачиваем новый код с GitHub..."
cd /tmp
rm -rf stonks-update
git clone https://github.com/whiterabbit74/stonks.git stonks-update
cd stonks-update

# Умное обновление файлов
echo "🔄 Обновляю файлы умно..."
cd ~/stonks

# Сохраняем важные файлы
echo "💾 Сохраняю важные файлы..."
cp docker-compose.yml docker-compose.yml.backup 2>/dev/null || true
cp server/.env server/.env.backup 2>/dev/null || true
cp caddy/Caddyfile caddy/Caddyfile.backup 2>/dev/null || true
cp docker/nginx.conf docker/nginx.conf.backup 2>/dev/null || true

# Обновляем только исходный код
echo "📝 Обновляю исходный код..."
if [ -d "/tmp/stonks-update/src" ]; then
    cp -r /tmp/stonks-update/src/* ./src/ 2>/dev/null || true
    echo "✅ Исходный код обновлен"
fi

# Обновляем package.json если он изменился
if [ -f "/tmp/stonks-update/package.json" ]; then
    if ! diff -q package.json /tmp/stonks-update/package.json >/dev/null 2>&1; then
        echo "📦 Обновляю package.json..."
        cp /tmp/stonks-update/package.json ./package.json
        cp /tmp/stonks-update/package-lock.json ./package-lock.json 2>/dev/null || true
        echo "⚠️  Рекомендуется пересобрать node_modules: npm install"
    fi
fi

# Восстанавливаем важные файлы
echo "🔧 Восстанавливаю важные файлы..."
cp docker-compose.yml.backup docker-compose.yml 2>/dev/null || true
cp server/.env.backup server/.env 2>/dev/null || true
cp caddy/Caddyfile.backup caddy/Caddyfile 2>/dev/null || true
cp docker/nginx.conf.backup docker/nginx.conf 2>/dev/null || true

# Останавливаем сервисы
echo "🛑 Останавливаю сервисы..."
docker compose down

# Пересобираем frontend (только если изменились исходники)
echo "🔨 Пересобираю frontend..."
docker compose build --no-cache frontend

# Запускаем сервисы
echo "🚀 Запускаю сервисы..."
docker compose up -d

# Ожидаем запуска
sleep 20

# Проверяем работу и SSL
echo "✅ Проверяю работу..."
if curl -k -I https://tradingibs.site/ | head -3 | grep -q "200"; then
    echo "✅ HTTP соединение работает"

    # Проверяем SSL сертификат
    if curl -I https://tradingibs.site/ 2>/dev/null | grep -q "HTTP/2"; then
        echo "✅ SSL сертификат валиден (HTTP/2)"
    else
        echo "⚠️  SSL сертификат может быть проблемным"
    fi
else
    echo "❌ HTTP соединение не работает"
fi

# Очищаем временные файлы
rm -rf /tmp/stonks-update
rm -f docker-compose.yml.backup server/.env.backup caddy/Caddyfile.backup docker/nginx.conf.backup 2>/dev/null || true

echo ""
echo "🎉 УМНОЕ ОБНОВЛЕНИЕ ЗАВЕРШЕНО!"
echo ""
echo "📁 Бэкап сохранен: ~/backups/${backup_name}.tar.gz"
echo ""
echo "Что сохранилось:"
echo "✅ docker-compose.yml"
echo "✅ server/.env"
echo "✅ caddy/Caddyfile"
echo "✅ docker/nginx.conf"
echo "✅ node_modules (если был)"
echo "✅ dist (скомпилированные файлы)"
echo ""
echo "Что обновилось:"
echo "🔄 src/ (исходный код)"
echo "🔄 package.json (если изменился)"
