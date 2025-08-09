## Trading Strategies Backtester (React + TypeScript + Vite)

Интерактивное веб‑приложение для тестирования торговых стратегий на исторических данных. Поддерживает загрузку CSV, конструктор стратегий, бэктестинг, визуализацию графиков на основе `lightweight-charts`, сохранение датасетов на локальный сервер и e2e/юнит‑тесты.

### Основные возможности
- **Загрузка данных**: импорт CSV (пример в `public/sample-data.csv`), предпросмотр и хранение в памяти
- **Конструктор стратегий**: шаблоны и настраиваемые условия
- **IBS Mean Reversion**: реализована и покрыта тестами
- **Визуализация**: свечной график цены, линия доходности, метрики, журнал сделок
- **Сохранение датасетов**: локальный Express‑сервер (`server/`) с REST API и библиотекой датасетов
- **Тестирование**: Vitest (юнит) и Playwright (e2e + a11y аудиты)

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
Откройте приложение в браузере: `http://localhost:5173` (порт может отличаться; актуальный порт будет показан в терминале).

### Сборка и предпросмотр (для e2e и прод‑режима)
```bash
npm run build
npm run preview
```
Превью по умолчанию на `http://localhost:4173`.

## Локальный сервер для датасетов

Факультативный бэкенд в `server/` позволяет сохранять и загружать датасеты между сессиями.

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
- `GET /api/datasets/:id` — датасет с данными
- `POST /api/datasets` — создать
- `PUT /api/datasets/:id` — обновить
- `DELETE /api/datasets/:id` — удалить

3) Формат файла датасета (`server/datasets/*.json`):
```json
{
  "name": "AAPL_2024-01-15",
  "ticker": "AAPL",
  "uploadDate": "2024-01-15T10:30:00.000Z",
  "dataPoints": 1000,
  "dateRange": { "from": "2023-01-01", "to": "2024-01-01" },
  "data": [{ "date": "2023-01-01", "open": 100, "high": 105, "low": 99, "close": 103, "volume": 1000000 }]
}
```

Подробности: `START_SERVER.md` и `server/README.md`.

## Запуск через Docker Compose

### 1) Подготовка
- Установите Docker и Docker Compose
- Создайте `.env` в корне (для переменных подстановки в compose):
```
ADMIN_USERNAME=dimazru@gmail.com
ADMIN_PASSWORD=your-strong-password
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### 2) Старт
```
docker compose up --build -d
```
- Фронтенд: `http://localhost:5173`
- API: проксируется через фронтенд `/api/*` → контейнер `server:3001`

Датасеты и настройки монтируются как тома из `server/` (чтобы изменения сохранялись между перезапусками).

### 3) Остановка
```
docker compose down
```

Примечания
- Nginx в контейнере фронтенда проксирует `/api` на сервис `server`.
- При первом входе используйте логин/пароль из `.env`.
- Для прод‑режима рекомендуем поставить прокси с HTTPS (напр. Caddy/Traefik) над `frontend`.

## Настройка реальных рыночных данных (опционально)

Сервер может подтягивать котировки от провайдеров (Alpha Vantage, Finnhub, Twelve Data). См. `API_SETUP_GUIDE.md`.

Кратко:
```bash
cd server
cp .env.example .env
# Добавьте ключи API и провайдера в .env
npm start
```

Если квоты API превышены или ключи не заданы, приложение использует fallback‑логику или тестовые данные.

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

# Запустить конкретный браузер
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# UI‑режим
npm run test:e2e:ui
```
Конфигурация размещена в `playwright.config.ts`. Для e2e по умолчанию запускается сборка и предпросмотр (`npm run build && npm run preview`) на `http://localhost:4173`.

## Скрипты npm (корень)
- `dev`: запуск dev‑сервера Vite
- `build`: сборка приложения
- `preview`: локальный предпросмотр сборки
- `lint`: запуск ESLint
- `test`, `test:run`: юнит‑тесты (Vitest)
- `test:e2e*`: e2e‑тесты (Playwright)
- `test:all`: юнит + e2e
- `test:ci`: режим для CI

Скрипты сервера находятся в `server/package.json` (`dev`, `start`).

## Структура проекта

```
trading_strategies/
├── src/                    # фронтенд (React + TS)
│   ├── components/         # UI‑компоненты (графики, формы, дашборд)
│   ├── lib/                # логика бэктеста, индикаторы, API‑клиент
│   ├── stores/             # состояние (zustand)
│   └── types/              # типы
├── server/                 # Express‑сервер для датасетов и внешних API
├── e2e/                    # Playwright‑тесты и фикстуры
├── public/                 # статические файлы (в т.ч. sample CSV)
├── README.md               # этот файл
└── ...                     # конфиги, отчёты тестов
```

## Полезные заметки
- Если сервер не запущен, функции сохранения/библиотека датасетов будут недоступны (см. `START_SERVER.md`).
- Для графиков используется `lightweight-charts`. При ошибках импорта убедитесь, что используется корректная версия и синтаксис импорта.
- Пример использования и сценарий проверки исправлений — в `TESTING_GUIDE.md`.

## Используемые технологии
- React 19, TypeScript 5, Vite 7, TailwindCSS
- Zustand, clsx, lucide‑react, papaparse
- lightweight‑charts
- Vitest, Testing Library, Playwright, axe‑core

## Лицензия
Не указана.
