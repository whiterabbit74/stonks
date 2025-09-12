#!/bin/bash
# 🔍 ПРОВЕРКА РАЗВЕРТЫВАНИЯ
# Показывает текущее состояние сервера и файлов

echo "🔍 ПРОВЕРКА РАЗВЕРТЫВАНИЯ"
echo "========================="

# 1. Проверка локальной версии
echo "📋 ЛОКАЛЬНАЯ ВЕРСИЯ:"
echo "Git commit: $(git rev-parse --short HEAD)"
echo "Последнее изменение: $(git log -1 --format='%h %s (%ar)' --date=relative)"
echo ""

# 2. Проверка состояния сервера
echo "🖥️  СОСТОЯНИЕ СЕРВЕРА:"
ssh ubuntu@146.235.212.239 "
echo 'Контейнеры:'
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null || echo 'Ошибка подключения к Docker'

echo -e '\nСвежие файлы:'
docker exec stonks-frontend find /usr/share/nginx/html/assets -name 'index-*.js' -exec ls -la {} \\; 2>/dev/null | head -3 || echo 'Контейнер недоступен'

echo -e '\nМетаданные сборки:'
cat ~/stonks/build-info.json 2>/dev/null || echo 'Метаданные не найдены'

echo -e '\nAPI статус:'
timeout 5 curl -s https://tradingibs.site/api/status | head -1 2>/dev/null || echo 'API недоступен'
"

# 3. Проверка доступности сайта
echo -e "\n🌐 ДОСТУПНОСТЬ САЙТА:"
if curl -s -I https://tradingibs.site/ | grep -q "200"; then
    echo "✅ Сайт доступен (HTTP 200)"
else
    echo "❌ Сайт недоступен"
fi

# 4. Проверка файлов
echo -e "\n📁 ПРОВЕРКА ФАЙЛОВ:"
if curl -s -I https://tradingibs.site/assets/index-CXHW5NKd.js | grep -q "200"; then
    echo "✅ JavaScript файл доступен"
else
    echo "❌ JavaScript файл недоступен"
fi

if curl -s -I https://tradingibs.site/assets/index-CAqIJNVc.css | grep -q "200"; then
    echo "✅ CSS файл доступен"
else
    echo "❌ CSS файл недоступен"
fi

echo ""
echo "💡 РЕКОМЕНДАЦИИ:"
echo "   • Для развертывания используйте: ./deploy.sh"
echo "   • Для проверки здоровья: ./health-check.sh"
