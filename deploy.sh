#!/bin/bash

# 🚀 Trading Backtester - Production Deployment Script
# This script automates the deployment process

set -e

echo "🚀 Начинаем развертывание Trading Backtester..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${DOMAIN:-"tradingibs.site"}
TLS_CA=${TLS_CA:-"https://acme-v02.api.letsencrypt.org/directory"}

echo -e "${YELLOW}Конфигурация:${NC}"
echo "  DOMAIN: $DOMAIN"
echo "  TLS_CA: $TLS_CA"

# Warning for staging certificates
if [[ "$TLS_CA" == *"staging"* ]]; then
    echo -e "${RED}⚠️  ВНИМАНИЕ: Используется STAGING SSL сертификат!${NC}"
    echo -e "${RED}   Это тестовый сертификат, который не будет доверен браузерами.${NC}"
    echo -e "${RED}   Для продакшена используйте: TLS_CA=https://acme-v02.api.letsencrypt.org/directory${NC}"
    echo ""
fi

# Function to print status
status() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    error "Запустите скрипт из корневой папки проекта (где находится docker-compose.yml)"
fi

# Check if .env file exists
if [ ! -f "server/.env" ]; then
    warning "Файл server/.env не найден. Создаю из шаблона..."
    cp server/.env.example server/.env
    warning "Отредактируйте server/.env с вашими настройками!"
    echo "Нажмите Enter чтобы продолжить или Ctrl+C для выхода"
    read
fi

# Update Caddyfile with current domain
status "Обновляю Caddyfile..."
cat > caddy/Caddyfile <<EOF
# Dynamic domain from environment variable
{$DOMAIN:$DOMAIN} {
  tls {
    ca {$TLS_CA:$TLS_CA}
  }

  encode gzip
  log {
    output file /var/log/caddy/access.log
  }

  handle /api/** {
    reverse_proxy server:3001
  }

  handle {
    reverse_proxy frontend:80
  }
}
EOF

# Set environment variables for docker-compose
export DOMAIN=$DOMAIN
export TLS_CA=$TLS_CA

# Stop existing services
status "Останавливаю существующие сервисы..."
docker compose down || true

# Start services
status "Запускаю сервисы..."
docker compose up -d

# Wait for services to start
status "Жду запуска сервисов..."
sleep 15

# Check service status
status "Проверяю статус сервисов..."
docker compose ps

# Test the application
status "Тестирую приложение..."
if curl -k -s -o /dev/null -w "%{http_code}" https://$DOMAIN/api/status | grep -q "200"; then
    status "✅ Приложение успешно запущено!"
    status "🌐 Доступно по адресу: https://$DOMAIN"
else
    warning "⚠️ API недоступен. Проверьте логи:"
    docker compose logs server
fi

echo ""
echo -e "${GREEN}🎉 Развертывание завершено!${NC}"
echo ""
echo "Полезные команды:"
echo "  docker compose logs          - посмотреть логи"
echo "  docker compose restart       - перезапустить сервисы"
echo "  docker compose down          - остановить сервисы"
echo ""
echo "Мониторинг:"
echo "  docker compose ps           - статус сервисов"
echo "  docker compose logs -f      - следить за логами"</contents>
</xai:function_call">Создал автоматический скрипт развертывания
