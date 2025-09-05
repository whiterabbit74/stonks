# 🚀 Premium Trading Strategy Backtester

**Тестировщик торговых стратегий IBS** — интерактивное веб‑приложение для тестирования торговых стратегий на исторических данных. Поддерживает загрузку CSV, конструктор стратегий, бэктестинг, визуализацию графиков на `lightweight‑charts`, локальное хранение датасетов на сервере и e2e/юнит‑тесты.

---

## 🚀 Развертывание

### 🎯 Быстрый алгоритм

**Продакшен:**
```bash
./super-reliable-deploy.sh  # Развернуть (свежий код из GitHub)
./check-deployment.sh       # Проверить состояние
```

**Разработка:**
```bash
./quick-deploy.sh      # Быстрое обновление и перезапуск
./check-deployment.sh  # Проверка
```

Подробный справочник по скриптам: [`SCRIPTS.md`](SCRIPTS.md)
Расширённое руководство по системе развертывания: [`DEPLOYMENT.md`](DEPLOYMENT.md)

Рекомендации:
- Всегда используйте `./super-reliable-deploy.sh` для продакшена
- После деплоя выполняйте `./check-deployment.sh`
- При проблемах: `./health-check.sh` → при необходимости `./rollback.sh`

---

## 🏗️ Архитектура и окружение

### Переменные окружения

Правильная схема (реализована в проекте):
```
project/
├── server/
│   ├── .env              # все секреты и конфигурация (не в git)
│   ├── .env.example      # шаблон (в git)
│   └── ...
├── docker-compose.yml    # только системные переменные и тома
└── ...
```

`server/.env` (пример локально):
```env
# Порт API
PORT=3001

# CORS для dev
FRONTEND_ORIGIN=http://localhost:5173

# Базовая авторизация (в prod пароль обязателен)
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=

# Интеграции (опционально)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
TWELVE_DATA_API_KEY=
POLYGON_API_KEY=

# Предпочитаемый провайдер котировок (опционально)
PREFERRED_API_PROVIDER=alpha_vantage

# Идентификатор сборки (используется фронтендом)
BUILD_ID=dev
```

`docker-compose.yml` — только системные переменные и тома (не дублируйте секреты):
```yaml
environment:
  - PORT=3001
  - DATASETS_DIR=/data/datasets
  - SETTINGS_FILE=/data/state/settings.json
  - WATCHES_FILE=/data/state/telegram-watches.json
  - SPLITS_FILE=/data/state/splits.json
```

Безопасность:
- `server/.env` не коммитится
- Секреты — только в `server/.env` или Docker secrets
- В `docker-compose.yml` — системные переменные и тома

---

## ⚙️ Быстрый старт (локально)

Требования: Node.js 18+ (рекомендуется 18 или 20)

Установка и запуск фронтенда:
```bash
npm install
npm run dev
```
Откройте `http://localhost:5173` (точный порт покажет Vite).

Сборка и предпросмотр (для e2e/предпрод):
```bash
npm run build
npm run preview
```
По умолчанию предпросмотр на `http://localhost:4173`.

---

## 🗄️ Локальный сервер датасетов (`server/`)

Позволяет сохранять/загружать датасеты, управлять сплитами и интеграциями.

Установка и запуск:
```bash
cd server
npm install
npm run dev
```
API доступен на `http://localhost:3001`.

Базовые эндпоинты:
- `GET /api/status` — статус
- `GET /api/datasets` — метаданные датасетов
- `GET /api/datasets/:id` — датасет с данными
- `POST /api/datasets` — создать
- `PUT /api/datasets/:id` — обновить
- `DELETE /api/datasets/:id` — удалить

Дополнительно:
- `POST /api/datasets/:id/refresh?provider=alpha_vantage|finnhub`
- `GET /api/quote/:symbol?provider=alpha_vantage|finnhub`
- `GET /api/splits`, `GET/PUT/PATCH/DELETE /api/splits/:symbol[/date]`
- `POST /api/telegram/notify`, `POST /api/telegram/test`
- `POST /api/auth/login`, `GET /api/auth/check`, `POST /api/auth/logout`

Переменные окружения сервера (локально): см. блок «Переменные окружения» выше.

---

## 🐳 Запуск через Docker Compose

1) Подготовка
- Установите Docker и Docker Compose
- Создайте `server/.env` (или используйте Docker secrets); ориентир — `server/.env.example`
- Данные и конфиги хранятся в именованных томах, git на них не влияет

2) Старт (prod):
```bash
docker compose pull
docker compose up -d
```
- Фронтенд: `http://localhost/`
- API: `/api/*` → контейнер `server:3001`

3) Старт (dev):
```bash
docker compose --profile dev up --build -d
```

4) Остановка:
```bash
docker compose down
```

Пути данных и миграция:
- `DATASETS_DIR=/data/datasets`
- `SETTINGS_FILE=/data/state/settings.json`
- `WATCHES_FILE=/data/state/telegram-watches.json`
- `SPLITS_FILE=/data/state/splits.json`
При первом старте пустых томов entrypoint автоматически перенесёт данные из `server/*` в тома.

Secrets:
- Простой вариант: `env_file: server/.env`
- Усиленный: Docker secrets в `/run/secrets/*` (entrypoint подхватит, если переменная не задана)
- Не дублируйте значения в `environment`, чтобы не перебить `env_file`

Бэкапы томов:
```bash
# Резервная копия
docker run --rm -v stonks_datasets:/v -v $(pwd):/b busybox sh -c 'cd /v && tar czf /b/stonks_datasets.tgz .'
docker run --rm -v stonks_state:/v -v $(pwd):/b busybox sh -c 'cd /v && tar czf /b/stonks_state.tgz .'

# Восстановление
docker run --rm -v stonks_datasets:/v -v $(pwd):/b busybox sh -c 'cd /v && tar xzf /b/stonks_datasets.tgz'
docker run --rm -v stonks_state:/v -v $(pwd):/b busybox sh -c 'cd /v && tar xzf /b/stonks_state.tgz'
```

---

## 📈 Реальные рыночные данные (опционально)

Поддерживаются Alpha Vantage, Finnhub, Twelve Data, Polygon. Установите ключи (локально — `server/.env`, в Docker — корневой `.env` или secrets):
```env
ALPHA_VANTAGE_API_KEY=...
FINNHUB_API_KEY=...
TWELVE_DATA_API_KEY=...
POLYGON_API_KEY=...
```
Затем используйте UI или клиент `src/lib/api.ts`.

---

## 🧪 Тестирование

Юнит‑тесты (Vitest):
```bash
npm run test        # интерактивно
npm run test:run    # одноразовый прогон
```

E2E‑тесты (Playwright):
```bash
npx playwright install   # однократно установить браузеры
npm run test:e2e
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit
npm run test:e2e:ui      # UI‑режим
```
E2E автоматически собирают проект и запускают предпросмотр (`npm run build && npm run preview`) на `http://localhost:4173`.

Скрипты npm (корень): `dev`, `build`, `build:check`, `preview`, `lint`, `test*`.
Скрипты сервера — в `server/package.json` (`dev`, `start`).

---

## 🧱 Структура проекта

```
trading_strategies/
├── src/                    # фронтенд (React + TS)
│   ├── components/         # графики, формы, дашборды, сплиты, Telegram
│   ├── lib/                # бэктест‑логика, индикаторы, метрики, API‑клиент
│   ├── stores/             # состояние (zustand)
│   └── types/              # типы
├── server/                 # Express‑сервер (datasets, splits, quotes, Telegram, auth)
├── public/                 # статические файлы (sample CSV)
├── docker/                 # Dockerfile фронта, nginx.conf, entrypoint
├── caddy/                  # Caddyfile (прод HTTPS)
├── README.md               # этот файл
└── ...                     # конфиги, отчёты тестов, скрипты
```

Настройки фронтенда:
- `VITE_BUILD_ID` — отображается в футере
- Базовый путь `/`, прокси `/api`
- Клиент `src/lib/api.ts` использует относительный `/api`

Используемые технологии:
- React 19, TypeScript 5, Vite 7, Tailwind CSS
- Zustand, clsx, lucide‑react, papaparse, lightweight‑charts
- Vitest, Testing Library, Playwright, axe‑core

Лицензия: не указана.

---

## 🌐 Прод‑деплой с HTTPS через Caddy

`docker-compose.yml` содержит сервисы `server`, `frontend`, `caddy`. Caddy принимает 80/443 и проксирует `/api/*` → `server:3001`, остальные запросы — `frontend:80`.

Пример `caddy/Caddyfile`:
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

Команды:
```bash
docker compose down
docker compose up -d --build
```
Проверка:
- `https://example.com/` — SPA
- `https://example.com/api/status` — 200 OK

TLS‑сертификаты выпускаются автоматически (Let’s Encrypt).

---

## 📌 Примечания

- Минимум 2 ГБ RAM для сборки фронтенда (лучше 4 ГБ). На слабых серверах включите swap или собирайте фронтенд локально/в CI
- В Docker сборка фронта проходит в стадии `builder` с `NODE_OPTIONS=--max-old-space-size=256`
- В runtime у сервера используются только прод‑зависимости
- Для быстрого деплоя без пересборки фронта можно положить готовый `dist` и заменить стадию сборки во фронтенд‑Dockerfile на `COPY dist /usr/share/nginx/html`

