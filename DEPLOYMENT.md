# 🚀 Развертывание Trading Backtester

## Быстрое развертывание (рекомендуется)

### 1. Подготовка сервера

```bash
# Скачайте свежий код
git clone https://github.com/whiterabbit74/stonks.git
cd stonks

# Создайте .env файл
cp server/.env.example server/.env
```

### 2. Настройка переменных окружения

Отредактируйте `server/.env`:

```bash
# Обязательные настройки
DOMAIN=tradingibs.site
ADMIN_USERNAME=admin@tradingibs.site
ADMIN_PASSWORD=ваш_пароль

# API ключи (минимум один)
ALPHA_VANTAGE_API_KEY=ваш_ключ

# SSL (staging по умолчанию)
TLS_CA=https://acme-staging-v02.api.letsencrypt.org/directory
```

### 3. Запуск

```bash
# Запуск в продакшене
docker compose up -d

# Или для разработки
docker compose --profile dev up -d
```

## Ручное конфигурирование (что делал AI раньше)

Если нужно ручное конфигурирование:

### 1. Обновление Caddyfile
```bash
# Было: example.com
# Стало: tradingibs.site
cat > caddy/Caddyfile <<EOF
tradingibs.site {
  tls {
    ca https://acme-staging-v02.api.letsencrypt.org/directory
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
```

### 2. Проверка .env файла
Убедитесь, что в `server/.env` есть все необходимые переменные.

### 3. Запуск сервисов
```bash
docker compose up -d
```

## Переменные окружения

### Обязательные
- `DOMAIN` - ваш домен
- `ADMIN_USERNAME` - логин администратора
- `ADMIN_PASSWORD` - пароль администратора

### Рекомендуемые
- `ALPHA_VANTAGE_API_KEY` - API ключ для данных
- `TLS_CA` - SSL сертификаты (staging или production)

### Опциональные
- `TELEGRAM_BOT_TOKEN` - для Telegram уведомлений
- `TELEGRAM_CHAT_ID` - ID чата для уведомлений

## Устранение проблем

### SSL проблемы
```bash
# Проверить статус SSL
curl -I https://your-domain.com

# Перезапустить Caddy
docker compose restart caddy
```

### Проблемы с данными
```bash
# Проверить volumes
docker volume ls | grep stonks

# Проверить данные в контейнерах
docker exec stonks-server-1 ls -la /data/datasets
```

### Логи
```bash
# Логи всех сервисов
docker compose logs

# Логи конкретного сервиса
docker compose logs caddy
docker compose logs server
docker compose logs frontend
```</contents>
</xai:function_call">Создал инструкцию по развертыванию
