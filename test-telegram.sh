#!/bin/bash
# Sends a test Telegram message using TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
# from the environment (the HTTP API no longer returns botToken).

set -euo pipefail

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"

if [ -z "$TOKEN" ] || [ -z "$CHAT" ]; then
    echo "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (they are not in GET /api/settings)."
    exit 1
fi

MESSAGE="Test from test-telegram.sh $(date '+%Y-%m-%d %H:%M:%S')"
TELEGRAM_RESPONSE=$(curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "chat_id=${CHAT}" \
     --data-urlencode "text=${MESSAGE}")

echo "$TELEGRAM_RESPONSE"
echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true'
