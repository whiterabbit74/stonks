#!/bin/bash
# 📨 Тестовый скрипт для проверки Telegram уведомлений

set -e

echo "🔍 ТЕСТИРОВАНИЕ TELEGRAM УВЕДОМЛЕНИЙ"
echo "===================================="

# Получаем настройки с сервера
echo "📡 Получаем настройки с сервера..."
SETTINGS_RESPONSE=$(curl -s "https://mktorder.com/api/settings" || echo "")

if [ -z "$SETTINGS_RESPONSE" ]; then
    echo "❌ Сервер недоступен или не отвечает"
    exit 1
fi

echo "📋 Ответ сервера (первые 200 символов):"
echo "${SETTINGS_RESPONSE:0:200}..."

# Парсим Telegram настройки
BOT_TOKEN=$(echo "$SETTINGS_RESPONSE" | grep -o '"botToken":"[^"]*"' | cut -d'"' -f4 || echo "")
CHAT_ID=$(echo "$SETTINGS_RESPONSE" | grep -o '"chatId":"[^"]*"' | cut -d'"' -f4 || echo "")

echo ""
echo "🔐 Найденные настройки:"
echo "   Bot Token: ${BOT_TOKEN:0:10}...****** (длина: ${#BOT_TOKEN})"
echo "   Chat ID: $CHAT_ID"

# Проверяем валидность настроек
if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
    echo "❌ Telegram настройки не найдены или пусты"
    echo "   Проверьте настройки в разделе 'Настройки > Telegram' на сайте"
    exit 1
fi

if [ "${#BOT_TOKEN}" -lt 20 ]; then
    echo "❌ Bot Token слишком короткий (возможно, маскированный)"
    echo "   Введите новый Bot Token в настройках сайта"
    exit 1
fi

# Тестируем отправку сообщения
echo ""
echo "📤 Отправляем тестовое сообщение..."

MESSAGE="🧪 Тест уведомлений
📅 Дата: $(date '+%Y-%m-%d %H:%M:%S')
🚀 Скрипт развертывания работает корректно!

✅ Если вы видите это сообщение, уведомления настроены правильно"

TELEGRAM_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "chat_id=${CHAT_ID}" \
     -d "text=${MESSAGE}" \
     -d "parse_mode=Markdown" 2>&1)

echo "🔍 Ответ Telegram API:"
echo "$TELEGRAM_RESPONSE"

if echo "$TELEGRAM_RESPONSE" | grep -q '"ok":true'; then
    echo ""
    echo "✅ УСПЕХ! Сообщение отправлено в Telegram"
    echo "   Проверьте ваш Telegram чат"
else
    echo ""
    echo "❌ ОШИБКА отправки в Telegram"
    
    if echo "$TELEGRAM_RESPONSE" | grep -q "chat not found"; then
        echo "   Проблема: Chat ID не найден"
        echo "   Решение: Убедитесь, что бот добавлен в чат и Chat ID правильный"
    elif echo "$TELEGRAM_RESPONSE" | grep -q "bot was blocked"; then
        echo "   Проблема: Бот заблокирован пользователем"
        echo "   Решение: Разблокируйте бота в Telegram"
    elif echo "$TELEGRAM_RESPONSE" | grep -q "Unauthorized"; then
        echo "   Проблема: Неправильный Bot Token"
        echo "   Решение: Проверьте правильность Bot Token в настройках"
    else
        echo "   Неизвестная ошибка - см. ответ API выше"
    fi
    
    exit 1
fi

echo ""
echo "🎉 Telegram уведомления работают корректно!"
echo "   Теперь скрипт развертывания будет отправлять уведомления"