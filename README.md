# 🚀 Premium Trading Strategy Backtester

**Тестировщик торговых стратегий IBS** - превращает ваши торговые стратегии в data-driven инсайты

## 🚀 РАЗВЕРТЫВАНИЕ (4 уровня надежности)

### 🛡️ МАКСИМАЛЬНО НАДЕЖНОЕ РАЗВЕРТЫВАНИЕ
**Рекомендуется для продакшена - гарантирует ТОЛЬКО свежий код из GitHub**
```bash
./super-reliable-deploy.sh
```
**Что делает:**
- ✅ Синхронизирует с последним коммитом GitHub
- ✅ Полностью очищает старые файлы
- ✅ Пересобирает контейнеры без кэша
- ✅ Сохраняет метаданные о версии
- ✅ Проверяет целостность сборки

### ⚡ БЫСТРОЕ РАЗВЕРТЫВАНИЕ
**Для разработки и быстрого тестирования**
```bash
./quick-deploy.sh
```
**Что делает:** Собирает → упаковывает → загружает → перезапускает → проверяет ✅

### 🔧 С ПОДРОБНЫМ ВЫВОДОМ
**Для отладки и мониторинга**
```bash
./deploy-to-server.sh
```
**Что делает:** То же самое, но показывает каждый шаг

### 🤖 С УМНЫМИ ПРОВЕРКАМИ (на сервере)
```bash
# На сервере
./deploy.sh        # Умное развертывание с бэкапами
./health-check.sh  # Проверка здоровья системы
```

---

# 🏗️ Trading Strategies Backtester - Архитектура проекта

## 📍 Структура хранения переменных окружения

### ✅ ПРАВИЛЬНАЯ СТРУКТУРА (реализована в проекте):

```
stonks/
├── server/
│   ├── .env                    # ← ВСЕ секретные переменные
│   ├── .env.example           # ← Шаблон (в Git)
│   └── ...
├── docker-compose.yml         # ← Только системные переменные
└── ...
```

#### 1️⃣ `server/.env` - ВСЕ секретные и конфигурационные переменные:
```env
# Авторизация
ADMIN_USERNAME=your_email@example.com
ADMIN_PASSWORD=your_secure_password

# API ключи
ALPHA_VANTAGE_API_KEY=your_key
FINNHUB_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token

# Настройки приложения
FRONTEND_ORIGIN=https://tradingibs.site
BUILD_ID=prod-20250826-0348
PREFERRED_API_PROVIDER=alpha_vantage
```

#### 2️⃣ `docker-compose.yml` - ТОЛЬКО системные переменные:
```yaml
environment:
  - PORT=3001                      # Системный порт
  - DATASETS_DIR=/data/datasets   # Пути к томам
  - SETTINGS_FILE=/data/state/settings.json
  # ❌ НЕ секретные переменные!
```

### 🔒 Безопасность:

- **`.env` файлы НИКОГДА не коммитятся в Git**
- **Секретные переменные только в `server/.env`**
- **Docker-compose содержит только системные настройки**

### 🚨 Ранее была проблема дублирования:

**❌ Неправильная структура (была до исправления):**
```yaml
# server/.env
ADMIN_USERNAME=user
ADMIN_PASSWORD=pass

# docker-compose.yml (дублирование!)
environment:
  - ADMIN_USERNAME=${ADMIN_USERNAME}  # Конфликт!
  - ADMIN_PASSWORD=${ADMIN_PASSWORD}  # Конфликт!
```

**✅ Правильная структура (сейчас):**
```yaml
# server/.env - ВСЕ секреты
ADMIN_USERNAME=user
ADMIN_PASSWORD=pass

# docker-compose.yml - Только системные
environment:
  - PORT=3001
  - DATASETS_DIR=/data/datasets
```

---

# 🚨 ВАЖНО: Проблема потери файлов при обновлении кода

## ❌ Что происходит при неправильном обновлении:

При использовании `rm -rf *` для замены кода теряются:

- **node_modules/** - зависимости (400+ пакетов, ~500MB)
- **dist/** - скомпилированные файлы
- **server/.env** - конфигурация сервера (пароли, API ключи)
- **caddy/Caddyfile** - конфигурация веб-сервера
- **docker-compose.yml** - конфигурация Docker
- **Docker volumes** - базы данных и кэш
- ***.tar.gz бэкапы**

## ✅ Решение: Используйте умное обновление

```bash
# Вместо ручного обновления используйте:
./smart-update.sh

# Этот скрипт:
# ✅ Сохраняет все важные файлы
# ✅ Обновляет только исходный код
# ✅ Создает бэкап перед обновлением
# ✅ Пересобирает только необходимые компоненты
```

## 📋 Что делает smart-update.sh:

1. **Создает бэкап** важных файлов
2. **Скачивает** новый код с GitHub
3. **Обновляет** только исходный код (src/)
4. **Сохраняет** все конфигурационные файлы
5. **Пересобирает** frontend
6. **Запускает** сервисы

## 🔧 Ручное восстановление (если файлы уже потеряны):

```bash
# 1. Восстановить из бэкапа
cd ~/backups
tar -xzf stonks_backup_YYYYMMDD_HHMMSS.tar.gz -C ~/stonks

# 2. Или использовать smart-update.sh
./smart-update.sh
```

---

## Trading Strategies Backtester (React + TypeScript + Vite)

Интерактивное веб‑приложение для тестирования торговых стратегий на исторических данных. Поддерживает загрузку CSV, конструктор стратегий, бэктестинг, визуализацию графиков на основе `lightweight-charts`, сохранение датасетов на локальный сервер, управление сплитами и e2e/юнит‑тесты.

### Основные возможности
- **Загрузка данных**: импорт CSV (пример в `public/sample-data.csv`), предпросмотр и хранение в памяти
- **Конструктор стратегий**: готовые шаблоны и настраиваемые условия
- **IBS Mean Reversion**: реализована стратегия IBS и чистый режим бэктеста
- **Визуализация**: свечной график цены, линия доходности, метрики, журнал сделок
- **Сохранение датасетов**: локальный Express‑сервер (`server/`) с REST API и библиотекой датасетов
- **Управление сплитами**: просмотр/редактирование сплит‑событий по тикерам
- **Уведомления в Telegram**: наблюдения за тикерами (опционально)
- **Тестирование**: Vitest (юнит) и Playwright (e2e + a11y‑аудиты)

## Быстрый старт

### Предварительные требования
- Node.js 18+ (рекомендуется 18 или 20)

### Установка зависимостей (фронтенд)
```bash
npm install
```

### Запуск приложения (разработка)
```bash
npm run dev
```
Откройте `http://localhost:5173` (порт может отличаться; актуальный порт будет показан в терминале).

### Сборка и предпросмотр (для e2e и прод‑режима)
```bash
npm run build
npm run preview
```
Превью по умолчанию на `http://localhost:4173`.

## Локальный сервер для датасетов

Факультативный бэкенд в `server/` позволяет сохранять/загружать датасеты, управлять сплитами и выполнять интеграции (quote API, Telegram).

1) Установка и запуск:
```bash
cd server
npm install
npm run dev
```
Сервер доступен на `http://localhost:3001`.

2) Базовые эндпоинты API:
- `GET /api/status` — статус
- `GET /api/datasets` — список датасетов (метаданные)
- `GET /api/datasets/:id` — конкретный датасет с данными
- `POST /api/datasets` — создать
- `PUT /api/datasets/:id` — обновить
- `DELETE /api/datasets/:id` — удалить

Дополнительно:
- `POST /api/datasets/:id/refresh?provider=alpha_vantage|finnhub` — дозагрузка хвоста
- `GET /api/quote/:symbol?provider=alpha_vantage|finnhub` — котировка в реальном времени
- `GET /api/splits` — карта всех сплитов по тикерам
- `GET/PUT/PATCH/DELETE /api/splits/:symbol[/date]` — управление сплитами
- `POST /api/telegram/notify`, `POST /api/telegram/test` — уведомления (если настроен Telegram)
- `POST /api/auth/login`, `GET /api/auth/check`, `POST /api/auth/logout` — базовая авторизация (опционально)

3) Переменные окружения сервера (пример `server/.env` для локалки):
```env
PORT=3001
# Разрешённый фронтенд-оригин для CORS (dev):
FRONTEND_ORIGIN=http://localhost:5173
# Авторизация (если ADMIN_PASSWORD пуст, auth отключена в dev; в prod — запросы будут отклонены):
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=
# Telegram (опционально):
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Провайдеры рын. данных (опционально):
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
TWELVE_DATA_API_KEY=
POLYGON_API_KEY=
```

## Запуск через Docker Compose

### 1) Подготовка
- Установите Docker и Docker Compose
- Создайте файл `server/.env` (или используйте Docker secrets). Пример: `server/.env.example`.
- Никаких данных и конфигов больше не хранится в git: они живут в Docker‑томах.

### 2) Старт (prod)
```
docker compose pull
docker compose up -d
```
- Фронтенд: `http://localhost/`
- API: `/api/*` → контейнер `server:3001`

Данные и конфиги живут в именованных томах Docker: `stonks_datasets` и `stonks_state`. Git‑операции не влияют на содержимое томов.

### 3) Старт (dev)
Профиль `dev` оставляет удобные bind‑mount’ы в рабочую директорию репозитория:
```
docker compose --profile dev up --build -d
```

### 4) Остановка
```
docker compose down
```

Примечания
- Nginx в контейнере фронтенда обслуживает SPA на корне `/` и проксирует `/api` на сервис `server`.
- Путь логина: `/login/`. При отсутствии `ADMIN_PASSWORD` защита отключена в dev, в prod — API может вернуть 503 до конфигурации.
- Для прод‑режима рекомендуем внешний прокси с HTTPS (например, Caddy/Traefik) поверх сервиса `frontend`.

### Пути данных и миграция
- Стандартные пути в контейнере задаются переменными окружения:
  - `DATASETS_DIR=/data/datasets`
  - `SETTINGS_FILE=/data/state/settings.json`
  - `WATCHES_FILE=/data/state/telegram-watches.json`
  - `SPLITS_FILE=/data/state/splits.json`
- При первом старте, если том пустой, entrypoint выполняет однократную миграцию:
  - Копирует `server/datasets` → `/data/datasets`
  - Копирует `server/settings.json`, `telegram-watches.json`, `splits.json` → `/data/state/*`

### Secrets
- Для простого случая используйте `env_file: server/.env` (см. пример `server/.env.example`).
- Для повышенной безопасности используйте Docker secrets и монтируйте их в `/run/secrets/*` (entrypoint автоматически загрузит значения, если соответствующая переменная не установлена).
- Не дублируйте переменные в секции `environment`, чтобы не перебить `env_file`.

### Бэкапы томов
```
# Резервная копия
docker run --rm -v stonks_datasets:/v -v $(pwd):/b busybox sh -c 'cd /v && tar czf /b/stonks_datasets.tgz .'
docker run --rm -v stonks_state:/v -v $(pwd):/b busybox sh -c 'cd /v && tar czf /b/stonks_state.tgz .'

# Восстановление
docker run --rm -v stonks_datasets:/v -v $(pwd):/b busybox sh -c 'cd /v && tar xzf /b/stonks_datasets.tgz'
docker run --rm -v stonks_state:/v -v $(pwd):/b busybox sh -c 'cd /v && tar xzf /b/stonks_state.tgz'
```

## Реальные рыночные данные (опционально)

Сервер умеет подтягивать котировки от провайдеров (Alpha Vantage, Finnhub, Twelve Data, Polygon):
1. Установите ключи в окружение (локально в `server/.env`, либо в корневом `.env` для Docker):
```env
ALPHA_VANTAGE_API_KEY=...
FINNHUB_API_KEY=...
TWELVE_DATA_API_KEY=...
POLYGON_API_KEY=...
```
2. Используйте соответствующие операции клиента API (см. `src/lib/api.ts`) или UI.

При отсутствии ключей сервер вернёт понятные ошибки, фронтенд использует fallback‑поведение.

## Тестирование

### Юнит‑тесты (Vitest)
```bash
npm run test        # интерактивно
npm run test:run    # одноразовый прогон
```

### E2E‑тесты (Playwright)
```bash
# Однократно установить браузеры
npx playwright install

# Запуск e2e
npm run test:e2e

# Конкретный браузер
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# UI‑режим
npm run test:e2e:ui
```
Конфигурация — `playwright.config.ts`. Для e2e автоматически запускается сборка и предпросмотр (`npm run build && npm run preview`) на `http://localhost:4173`.

## Скрипты npm (корень)
- `dev`: запуск dev‑сервера Vite
- `build`: сборка приложения
- `build:check`: типизация + сборка
- `preview`: локальный предпросмотр сборки
- `lint`: запуск ESLint
- `test`, `test:run`: юнит‑тесты (Vitest)
- `test:e2e*`: e2e‑тесты (Playwright)
- `test:all`: юнит + e2e
- `test:ci`: режим для CI

Скрипты сервера — в `server/package.json` (`dev`, `start`).

## Структура проекта

```
trading_strategies/
├── src/                    # фронтенд (React + TS)
│   ├── components/         # UI‑компоненты (графики, формы, дашборд, сплиты, Telegram)
│   ├── lib/                # логика бэктеста, индикаторы, метрики, API‑клиент
│   ├── stores/             # состояние (zustand)
│   └── types/              # типы
├── server/                 # Express‑сервер (датасеты, сплиты, quotes, Telegram, auth)
├── public/                 # статические файлы (в т.ч. sample CSV)
├── docker/                 # Dockerfile фронтенда, nginx.conf
├── README.md               # этот файл
└── ...                     # конфиги, отчёты тестов, скрипты
```

## Настройки фронтенда
- `VITE_BUILD_ID` — отображается в футере как идентификатор сборки
- При сборке через Docker используется базовый путь `/` и прокси `/api`
- Клиент `src/lib/api.ts` использует относительный `/api` без привязки к субпути

## Используемые технологии
- React 19, TypeScript 5, Vite 7, Tailwind CSS
- Zustand, clsx, lucide‑react, papaparse, lightweight‑charts
- Vitest, Testing Library, Playwright, axe‑core

## Лицензия
Не указана.

## Продовый деплой с HTTPS через Caddy

В корне добавлен `docker-compose.yml` с тремя сервисами: `server`, `frontend`, `caddy`. Caddy принимает 80/443 и проксирует:
- `/api/*` → `server:3001`
- `/` → `frontend:80`

`caddy/Caddyfile` (пример для домена `example.com`):
```
example.com {
  encode gzip
  log {
    output file /var/log/caddy/access.log
  }
  handle_path /api/* {
    reverse_proxy server:3001
  }
  handle {
    reverse_proxy frontend:80
  }
}
```

Команды для прод‑развертывания:
```
docker compose down
docker compose up -d --build
```
Проверка:
- `https://example.com/` → SPA
- `https://example.com/api/status` → 200 ok

TLS‑сертификаты выпускаются автоматически (Let’s Encrypt) — дополнительные ключи не нужны.

## Требования к ресурсам и сборке
- Для сборки фронтенда рекомендуется минимум 2 ГБ RAM (оптимально 4 ГБ).
- На слабых серверах включите swap (2–4 ГБ) либо собирайте фронтенд локально/в CI.
- В Dockerfile фронта билд проходит в стадии `builder` с `NODE_OPTIONS=--max-old-space-size=256`.
- В runtime используются только прод‑зависимости (`npm ci --omit=dev` используется для сервера; для фронтенда dev‑deps ставятся в builder‑стадии).

Вариант быстрого деплоя без пересборки фронта:
- Соберите фронт локально/в CI, положите артефакт `dist` в релиз;
- В `docker/frontend.Dockerfile` можно заменить стадию сборки на простой `COPY dist /usr/share/nginx/html`.

## Права и тома сервера
- Смонтированная `server/datasets` должна быть доступна пользователю контейнера (uid/gid 1000). На хосте:
```
sudo chgrp -R 1000 server/datasets && sudo chmod -R 2775 server/datasets
```

## Примечания по деплою
- При работе за реверс‑прокси сервер настроен `app.set('trust proxy', true)` — корректно определяется IP клиента для лимитов логина. Убедитесь, что прокси пробрасывает заголовки `X-Forwarded-For` и `X-Forwarded-Proto`.
- Cookie аутентификации выдаются с флагами `HttpOnly` и `Secure` (в проде). Для корректной работы используйте HTTPS в продакшене.
