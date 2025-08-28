#!/bin/bash

# SSL Certificate Validation Script
# This script checks the validity and type of SSL certificate

set -e

DOMAIN=${DOMAIN:-"tradingibs.site"}
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔒 ПРОВЕРКА SSL СЕРТИФИКАТА"
echo "=========================="
echo "Домен: $DOMAIN"
echo ""

# Function to print status
status() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check 1: Basic connectivity
echo "1. Проверка подключения..."
if curl -I --max-time 10 https://$DOMAIN/ 2>/dev/null | grep -q "HTTP/"; then
    status "Подключение к HTTPS работает"
else
    error "Не удается подключиться к HTTPS"
    exit 1
fi

# Check 2: SSL certificate details
echo ""
echo "2. Проверка SSL сертификата..."
CERT_INFO=$(openssl s_client -connect $DOMAIN:443 -servername $DOMAIN < /dev/null 2>/dev/null | openssl x509 -noout -dates -subject -issuer -fingerprint -sha256 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "$CERT_INFO"

    # Check if it's production or staging
    if echo "$CERT_INFO" | grep -q "Let's Encrypt"; then
        if echo "$CERT_INFO" | grep -q "STAGING"; then
            error "СЕРТИФИКАТ STAGING! Это тестовый сертификат!"
            echo ""
            echo "Для получения production сертификата:"
            echo "1. Обновите переменные окружения:"
            echo "   TLS_CA=https://acme-v02.api.letsencrypt.org/directory"
            echo "2. Перезапустите сервисы:"
            echo "   docker compose restart caddy"
        else
            status "PRODUCTION сертификат Let's Encrypt"
        fi
    else
        warning "Неизвестный издатель сертификата"
    fi
else
    error "Не удалось получить информацию о сертификате"
    exit 1
fi

# Check 3: Certificate validity period
echo ""
echo "3. Проверка срока действия..."
NOT_BEFORE=$(echo "$CERT_INFO" | grep "notBefore" | cut -d'=' -f2)
NOT_AFTER=$(echo "$CERT_INFO" | grep "notAfter" | cut -d'=' -f2)

echo "Выдан: $NOT_BEFORE"
echo "Истекает: $NOT_AFTER"

# Calculate days until expiration
EXPIRY_DATE=$(date -d "$NOT_AFTER" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$NOT_AFTER" +%s 2>/dev/null)
CURRENT_DATE=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_DATE - CURRENT_DATE) / 86400 ))

if [ $DAYS_LEFT -gt 30 ]; then
    status "Сертификат действителен еще $DAYS_LEFT дней"
elif [ $DAYS_LEFT -gt 7 ]; then
    warning "Сертификат истекает через $DAYS_LEFT дней"
else
    error "СЕРТИФИКАТ ИСТЕКАЕТ ЧЕРЕЗ $DAYS_LEFT ДНЕЙ!"
fi

# Check 4: Domain validation
echo ""
echo "4. Проверка домена..."
SUBJECT=$(echo "$CERT_INFO" | grep "subject=" | cut -d'=' -f2-)
if echo "$SUBJECT" | grep -q "$DOMAIN"; then
    status "Домен в сертификате соответствует: $DOMAIN"
else
    error "Домен в сертификате НЕ соответствует!"
    echo "Ожидалось: $DOMAIN"
    echo "В сертификате: $SUBJECT"
fi

# Check 5: Local configuration check
echo ""
echo "5. Проверка локальной конфигурации..."

# Check Caddyfile
if [ -f "caddy/Caddyfile" ]; then
    if grep -q "staging" caddy/Caddyfile; then
        warning "Caddyfile содержит 'staging' настройки!"
        echo "Рекомендуется проверить и обновить до production."
    else
        status "Caddyfile выглядит корректно"
    fi
else
    warning "Caddyfile не найден"
fi

# Check environment variables
if [ -f ".env" ]; then
    if grep -q "staging" .env 2>/dev/null; then
        warning ".env содержит 'staging' настройки!"
    else
        status "Файл .env выглядит корректно"
    fi
else
    warning "Файл .env не найден"
fi

echo ""
echo "🎉 ПРОВЕРКА ЗАВЕРШЕНА!"
echo ""
echo "Полезные команды:"
echo "  docker compose logs caddy    - логи Caddy"
echo "  docker compose restart caddy - перезапустить Caddy"
echo "  ./check-ssl.sh              - повторная проверка"
