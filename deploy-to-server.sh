#!/bin/bash

# 🚀 ПРОСТАЯ КОМАНДА ДЛЯ ЗАЛИВКИ КОДА НА СЕРВЕР
# Использование: ./deploy-to-server.sh

set -e

SERVER="ubuntu@146.235.212.239"
PROJECT_DIR="~/stonks"

echo "🔧 ШАГ 1: Собираем свежий frontend..."
npm run build

echo "📦 ШАГ 2: Создаем архив с обновлениями..."
tar -czf fresh-deploy.tgz dist/ server/server.js

echo "📤 ШАГ 3: Копируем на сервер..."
scp fresh-deploy.tgz "$SERVER":~

echo "🔄 ШАГ 4: Обновляем на сервере и перезапускаем..."
ssh "$SERVER" "
cd $PROJECT_DIR && \
echo 'Распаковываем...' && \
tar -xzf ~/fresh-deploy.tgz && \
echo 'Обновляем файлы...' && \
# Файлы уже в правильных местах благодаря Docker volumes
echo 'Серверный код обновлен автоматически' && \
echo 'Перезапускаем сервисы...' && \
docker compose restart && \
sleep 10 && \
echo 'Проверяем статус...' && \
docker ps --format 'table {{.Names}}\t{{.Status}}' && \
echo 'Проверяем доступность...' && \
curl -s -I https://tradingibs.site/ | head -1 && \
echo 'Готово! ✅'
"

echo "�� ШАГ 5: Очищаем временные файлы..."
rm fresh-deploy.tgz

echo ""
echo "🎉 ГОТОВО! Код залит на сервер."
echo "🌐 Проверь: https://tradingibs.site"
