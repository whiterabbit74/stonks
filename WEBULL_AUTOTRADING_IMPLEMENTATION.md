# Webull Autotrading: Plan And Implementation

## Goal

Добавить в проект backend-контур автоторговли по текущей IBS-логике с Webull OpenAPI:

- принимать торговое решение по watched tickers;
- выбирать минимальный IBS ниже порога входа;
- закрывать открытую позицию при достижении порога выхода;
- работать в `dry-run` по умолчанию;
- уметь отправлять реальные equity orders в Webull после явного включения;
- не хранить секреты в `settings.json`, только в `server/.env`.

## What Was Added

### 1. Webull client

Добавлен модуль [`server/src/services/webullClient.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/webullClient.js), который умеет:

- собирать Webull signature по правилам из `webull-api-full.md`;
- выполнять signed HTTP requests;
- вызывать:
  - `GET /openapi/account/list`
  - `GET /openapi/assets/balance`
  - `GET /openapi/assets/positions`
  - `POST /openapi/auth/token/create`
  - `POST /openapi/auth/token/check`
  - `POST /openapi/trade/order/preview`
  - `POST /openapi/trade/order/place`
  - `POST /openapi/trade/order/cancel`
  - `GET /openapi/trade/order/detail`

### 2. Autotrade engine

Добавлен модуль [`server/src/services/autotrade.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/autotrade.js).

Что он делает:

- читает `settings.autoTrading`;
- берёт список тикеров из `telegramWatches` и/или из `autoTrading.symbols`;
- получает intraday range + quote через Finnhub;
- считает текущий IBS;
- если позиции нет:
  - выбирает тикер с минимальным IBS среди тех, где `IBS <= lowIBS`;
- если позиция открыта:
  - ищет сигнал выхода по `IBS >= highIBS`;
- собирает Webull equity order;
- при `dryRun=true` только возвращает решение;
- при `dryRun=false` отправляет `preview` и `place order`, затем синхронизирует локальную trade history.

### 3. API routes

Добавлен маршрут [`server/src/routes/autotrade.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/routes/autotrade.js):

- `GET /api/autotrade/config`
- `PATCH /api/autotrade/config`
- `GET /api/autotrade/status`
- `POST /api/autotrade/evaluate`
- `POST /api/autotrade/execute`
- `GET /api/autotrade/webull/account`
- `POST /api/autotrade/webull/token/create`
- `POST /api/autotrade/webull/token/check`

### 4. Scheduler integration

В [`server/server.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/server.js) добавлен вызов `runAutoTradingSchedulerTick()` в окно перед закрытием рынка.

Текущее поведение:

- scheduler проверяет автоторговлю в последние ~2 минуты;
- фактическое исполнение допускается только в `executionWindowSeconds`;
- повторная попытка в одном и том же 20-секундном bucket блокируется.

### 5. Settings and env

Расширены:

- [`server/src/services/settings.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/settings.js)
- [`server/src/config/index.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/config/index.js)
- [`server/.env.example`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/.env.example)

Новые env:

- `WEBULL_APP_KEY`
- `WEBULL_APP_SECRET`
- `WEBULL_ACCESS_TOKEN`
- `WEBULL_ACCOUNT_ID`
- `WEBULL_API_PROTOCOL`
- `WEBULL_API_HOST`
- `WEBULL_API_PORT`

## Current Autotrade Config

`settings.autoTrading`:

```json
{
  "enabled": false,
  "dryRun": true,
  "provider": "finnhub",
  "lowIBS": 0.1,
  "highIBS": 0.75,
  "executionWindowSeconds": 90,
  "allowNewEntries": true,
  "allowExits": true,
  "onlyFromTelegramWatches": true,
  "symbols": "",
  "sizingMode": "notional",
  "fixedQuantity": 1,
  "fixedNotionalUsd": 1000,
  "maxPositionUsd": 1000,
  "allowFractionalShares": false,
  "orderType": "MARKET",
  "timeInForce": "DAY",
  "supportTradingSession": "CORE",
  "maxSlippageBps": 25,
  "previewBeforeSend": true,
  "cancelOpenOrdersBeforeEntry": false,
  "notes": ""
}
```

## Implementation Plan

### Phase 1. Safe launch

- Заполнить `WEBULL_*` переменные.
- Проверить `GET /api/autotrade/webull/account`.
- Если аккаунт под 2FA, создать токен через `POST /api/autotrade/webull/token/create`.
- Подтвердить токен в Webull App.
- Проверить токен через `POST /api/autotrade/webull/token/check`.
- Держать `dryRun=true`, `enabled=false`.

### Phase 2. Strategy validation

- Настроить `telegramWatches` как торговый universe.
- Проверить `POST /api/autotrade/evaluate`.
- Сверить выбор тикера с текущим IBS регламентом.
- Сверить sizing и тип ордера.

### Phase 3. Controlled execution

- Включить `enabled=true`, но оставить `dryRun=true`.
- Несколько сессий собрать логи решений.
- После проверки перевести в `dryRun=false`.

### Phase 4. Hardening

Рекомендованные следующие доработки:

- отдельный журнал `autotrade-history.json`;
- idempotency по `client_order_id` и `dateKey/action/symbol`;
- reconcile локальной позиции с Webull positions;
- отмена открытых ордеров перед повторным входом;
- Telegram/UI alerts по результату `preview/place`;
- UI-панель управления автоторговлей;
- fallback market-data provider на случай отказа Finnhub;
- E2E smoke-тест на `dry-run` цикл.

## Important Limitations

### Already covered

- `dryRun` включён по умолчанию;
- секреты не пишутся в `settings.json`;
- торговля ограничена одной активной позицией, как в текущей логике проекта;
- используется только `EQUITY` order flow.

### Not covered yet

- нет подтверждённой по документации схемы всех response payloads Webull;
- нет gRPC-подписки на order status events;
- нет MQTT market streaming;
- нет синхронизации открытых заявок из Webull перед отправкой новых;
- нет server-side retry policy при `429/417`;
- нет explicit поддержки options/futures/crypto в стратегии.

### Practical trading caveat

Документация Webull в файле подтверждает обычные `MARKET`/`LIMIT` equity orders, но не описывает MOC/LOC-поток для точного исполнения “на закрытии”.
Поэтому текущая реализация технически исполняет сигнал в узком окне перед close, а не гарантирует официальную биржевую механику `market-on-close`.

## What Webull Gives For Free And What Is Limited

Ниже только то, что следует из `webull-api-full.md`.

### Free or clearly available without paid market-data add-on

- Trading API после одобрения OpenAPI и открытия US brokerage account:
  - account list
  - account balance
  - account positions
  - order preview
  - order place / replace / cancel
  - order history / order detail / open orders
- Test environment:
  - публичные test accounts;
  - test app key / secret;
  - токены в test environment валидны по умолчанию.
- Event Contracts market data:
  - явно указано как `Free for use - retail clients only`.

### Paid / restricted / not free by default

- US stocks / ETFs / night session market data:
  - нужен отдельный OpenAPI market data subscription для `Level 1` и `Level 2`;
  - подписка из мобильного приложения или QT не считается;
  - одновременно доступно только одно устройство.
- Futures market data:
  - доступ требует paid subscription;
  - модуль подписки “under active development”.

### Ambiguous in docs

- Crypto market data:
  - в таблице fees строка есть, но явная цена не указана;
  - из документа нельзя надёжно вывести, что она бесплатная.

## Main Webull Limits From The Docs

### Access and lifecycle

- OpenAPI application review: обычно `1-2 working days`.
- Менять app info / generate key / reset key: не более `3` раз в день.
- Если 2FA включена:
  - token verification window: `5 minutes`;
  - token становится `INVALID`, если по нему нет API-вызовов `15` дней подряд.

### Trading API limits

- Account list: `10 requests / 30s`
- Account balance: `2 / 2s`
- Account positions: `2 / 2s`
- Order preview: `150 / 10s`
- Place orders: `600 / 60s`
- Replace orders: `600 / 60s`
- Cancel orders: `600 / 60s`
- Order history: `2 / 2s`
- Open orders: `2 / 2s`
- Order detail: `2 / 2s`
- Create token: `10 / 30s`
- Check token: `10 / 30s`

### Market Data API limits

- Global market-data limit: `600 requests / minute`
- Stock bars: `600 / minute`
- Crypto snapshot: `1 request / second / app key` and global `600 / minute`
- Crypto bars: `1 request / second / app key` and global `600 / minute`
- Event snapshot/depth/bars: `600 / minute`
- Futures snapshot/depth/bars: `1 request / second / app key`

## Files Changed

- [`server/server.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/server.js)
- [`server/src/config/index.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/config/index.js)
- [`server/src/services/settings.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/settings.js)
- [`server/src/services/webullClient.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/webullClient.js)
- [`server/src/services/autotrade.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/services/autotrade.js)
- [`server/src/routes/autotrade.js`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/src/routes/autotrade.js)
- [`server/.env.example`](/Users/q/Work/MAINPROJECTS/site_tradingibs/server/.env.example)

## Validation Done

- `node --check server/server.js`
- `node --check server/src/services/webullClient.js`
- `node --check server/src/services/autotrade.js`
- `node --check server/src/routes/autotrade.js`

## Next Recommended Step

Проверить руками:

1. `GET /api/autotrade/config`
2. `PATCH /api/autotrade/config` с `dryRun=true`, `enabled=true`
3. `POST /api/autotrade/evaluate`
4. `GET /api/autotrade/webull/account`
5. только потом `POST /api/autotrade/execute`
