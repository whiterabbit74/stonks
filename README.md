# Trading IBS Backtester

Интерактивное приложение для тестирования и сопровождения торговых сценариев на исторических данных. Репозиторий объединяет React/Vite frontend для анализа и Express API для хранения датасетов, мониторинга, уведомлений и служебных интеграций.

## Что умеет проект

- загружать и хранить датасеты с OHLC-данными
- запускать бэктесты и показывать метрики, сделки и графики
- работать со страницами `Акции`, `Опционы`, `Календарь`, `Сплиты`, `Мониторинг`, `Брокер`
- поддерживать Telegram watches, историю сделок и серверные настройки
- использовать внешние провайдеры котировок и Webull-интеграции
- запускаться локально без Docker и разворачиваться через Docker Compose

## Торговая логика IBS в проекте

- входы выполняются только на закрытии торговой сессии
- перед закрытием используются актуальные значения IBS
- новый инструмент выбирается из мониторинга по минимальному IBS ниже порога
- после закрытия позиции возможен повторный вход в тот же день

## Стек

**Frontend**
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- lightweight-charts

**Backend**
- Node.js
- Express 5
- better-sqlite3
- multer
- helmet
- bcrypt

**Тесты и инфраструктура**
- Vitest
- Testing Library
- Playwright
- Docker Compose
- Nginx
- Caddy

## Быстрый старт

Требования:
- Node.js 18+
- npm

### 1. Установите зависимости

```bash
npm install
cd server
npm install
```

### 2. Подготовьте окружение

Для локальной разработки удобнее всего взять шаблон [server/.env.example](server/.env.example) и создать свой `server/.env`.

```bash
cp server/.env.example server/.env
```

Минимум, который обычно нужно проверить или переопределить локально:

```env
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=
```

API-ключи, Telegram и Webull-параметры опциональны и нужны только для соответствующих сценариев.

### 3. Запустите API

```bash
cd server
npm run dev
```

Сервер будет доступен на `http://localhost:3001`.

### 4. Запустите frontend

В отдельном терминале:

```bash
npm run dev
```

Frontend поднимется на `http://localhost:5173`. В dev-режиме Vite проксирует запросы `/api` на `http://localhost:3001`.

Для быстрой проверки интерфейса можно использовать пример данных из [public/sample-data.csv](public/sample-data.csv).

## Тестирование

```bash
npm run test:run
npm run test:e2e
```

Полезные команды:

```bash
npm run lint
npm run build
npm run preview
```

Если Playwright запускается впервые:

```bash
npx playwright install
```

## Docker и деплой

В репозитории есть production-oriented `docker-compose.yml`. Он поднимает три сервиса:

- `server` - Express API
- `frontend` - собранный frontend за Nginx
- `caddy` - reverse proxy и TLS

Основной сценарий запуска:

```bash
docker compose up -d --build
```

Что важно знать:

- compose-файл по умолчанию ожидает production env в `/home/ubuntu/stonks-config/.env`
- данные и состояние выносятся в Docker volumes
- для серверного обслуживания в репозитории есть [deploy.sh](deploy.sh), [health-check.sh](health-check.sh) и [cleanup-server.sh](cleanup-server.sh)

Если нужен именно локальный режим разработки, проще использовать `npm run dev` для frontend и `cd server && npm run dev` для API.

## Переменные окружения

Сервер умеет подхватывать настройки из нескольких мест. Для локальной разработки обычно достаточно `server/.env`, а для production в текущем compose используется внешний файл `/home/ubuntu/stonks-config/.env`.

Порядок загрузки для dev-окружения:

- `~/stonks-config/.env`
- `server/.env`
- корневой `.env`
- переменные процесса

Наиболее важные переменные:

- `PORT`
- `FRONTEND_ORIGIN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ALPHA_VANTAGE_API_KEY`
- `FINNHUB_API_KEY`
- `TWELVE_DATA_API_KEY`
- `POLYGON_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `WEBULL_APP_KEY`
- `WEBULL_APP_SECRET`
- `WEBULL_ACCESS_TOKEN`
- `WEBULL_ACCOUNT_ID`

Подробный шаблон находится в [server/.env.example](server/.env.example).

## Структура проекта

```text
.
├── src/              # frontend: страницы, компоненты, hooks, lib
├── server/           # backend: routes, services, middleware, providers
├── public/           # статические файлы и sample CSV
├── docker/           # Dockerfile и runtime-конфиги
├── caddy/            # Caddyfile для reverse proxy/TLS
├── deploy.sh         # серверный деплой
├── health-check.sh   # диагностика окружения
└── README.md
```

## Полезные файлы

- [server/README.md](server/README.md) - детали серверной архитектуры и API
- [ENVIRONMENT.md](ENVIRONMENT.md) - работа с переменными окружения
- [PROVIDERS.md](PROVIDERS.md) - заметки по провайдерам рыночных данных

## Статус

Проект активно развивается. Если вы обновляете документацию, лучше сверять README с реальными `package.json`, `docker-compose.yml` и файлами в `server/src/routes`, чтобы команды и эндпоинты не расходились с кодом.
