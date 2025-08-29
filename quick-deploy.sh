#!/bin/bash
# �� ОДНА КОМАНДА ДЛЯ ВСЕГО
# Использование: ./quick-deploy.sh

set -e

echo "🎯 Быстрое развертывание..."
npm run build && \
tar -czf deploy.tgz dist/ server/server.js && \
scp deploy.tgz ubuntu@146.235.212.239:~ && \
ssh ubuntu@146.235.212.239 "cd ~/stonks && tar -xzf ~/deploy.tgz && docker compose restart && sleep 5 && docker ps --format 'table {{.Names}}\t{{.Status}}'" && \
rm deploy.tgz && \
echo "✅ ГОТОВО! https://tradingibs.site"
