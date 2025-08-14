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
# Авторизация (если ADMIN_PASSWORD пуст, auth отключена):
ADMIN_USERNAME=dimazru@gmail.com
ADMIN_PASSWORD=
# Telegram (опционально):
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Провайдеры рын. данных (опционально):
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
```

## Запуск через Docker Compose

### 1) Подготовка
- Установите Docker и Docker Compose
- Создайте файл `.env` в корне репозитория (используется в `docker-compose.yml`):
```
ADMIN_USERNAME=dimazru@gmail.com
ADMIN_PASSWORD=your-strong-password
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Для CORS сервера (если обращение не через nginx фронтенда):
FRONTEND_ORIGIN=http://localhost:5173
# Для маркировки сборок:
BUILD_ID=prod-001
# Ключи провайдеров котировок (опционально):
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
```

### 2) Старт
```
docker compose up --build -d
```
- Фронтенд: `http://localhost/stonks/`
- API: доступно через фронтенд‑прокси `/stonks/api/*` → контейнер `server:3001`

Датасеты и настройки монтируются как тома из `server/`, чтобы сохранялись между перезапусками.

### 3) Остановка
```
docker compose down
```

Примечания
- Nginx в контейнере фронтенда обслуживает SPA под базовым путём `/stonks` и проксирует `/stonks/api` на сервис `server`.
- Путь логина: `/stonks/login/`. При отсутствии `ADMIN_PASSWORD` защита отключена.
- Для прод‑режима рекомендуем внешний прокси с HTTPS (например, Caddy/Traefik) поверх сервиса `frontend`.

## Реальные рыночные данные (опционально)

Сервер умеет подтягивать котировки от провайдеров (Alpha Vantage, Finnhub):
1. Установите ключи в окружение (локально в `server/.env`, либо в корневом `.env` для Docker):
```env
ALPHA_VANTAGE_API_KEY=...
FINNHUB_API_KEY=...
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
- При сборке через Docker используется базовый путь `/stonks` и прокси `/stonks/api`
- Клиент `src/lib/api.ts` автоматически выбирает `/stonks/api`, если приложение открыто под `/stonks`

## Используемые технологии
- React 19, TypeScript 5, Vite 7, Tailwind CSS
- Zustand, clsx, lucide‑react, papaparse, lightweight‑charts
- Vitest, Testing Library, Playwright, axe‑core

## Лицензия
Не указана.

## Примечания по деплою
- При работе за реверс‑прокси сервер настроен `app.set('trust proxy', true)` — корректно определяется IP клиента для лимитов логина. Убедитесь, что прокси пробрасывает заголовки `X-Forwarded-For` и `X-Forwarded-Proto`.
- Cookie аутентификации выдаются с флагами `HttpOnly` и `Secure` (в проде). Для корректной работы используйте HTTPS в продакшене.
