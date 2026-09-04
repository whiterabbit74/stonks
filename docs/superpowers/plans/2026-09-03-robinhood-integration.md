# Роадмап: интеграция Robinhood (Agentic Account) наравне с Webull

Дата: 2026-09-03. Статус: план, код не менялся.
Автор задачи: перенести брокерскую интеграцию Robinhood из соседнего проекта
`/Users/mymac/Work/apps/robinhood` (TradeDeck) в `mktorder_com`.

---

## 0. Что именно надо сделать (в одном абзаце)

Сейчас в проекте один брокер — Webull. Вкладка `/broker` называется «Брокер», внутри
`WebullAccountPage.tsx`, а исполнение сигналов зашито в `executeWebullSignal()` и вызывается
напрямую из T-1 монитора. Надо: **(1)** переименовать текущую вкладку в «Webull»;
**(2)** сделать вторую, точно такую же по структуре вкладку «Robinhood»; **(3)** научить сервер
торговать через официальный **Robinhood Trading MCP** на **Agentic-счёте**; **(4)** добавить
Robinhood как источник котировок и исторических дневных баров (~5 лет); **(5)** в настройках
для **каждого** брокера отдельно показать переключатели «Разрешить входы» / «Разрешить выходы».
Стратегия (IBS) остаётся ровно одна и та же — меняется только исполнитель.

---

## 1. Проверенные факты о Robinhood (не выдумывать заново)

### 1.1 Никакого `robin_stocks`, логина и пароля

Соседний проект TradeDeck прямо запрещает неофициальный API (`docs/mcp/robinhood-capabilities.md`,
раздел «Главный принцип», и `docs/architecture.md` §12). Мы придерживаемся того же:
**только официальный MCP-сервер**, никакого `api.robinhood.com/oauth2/token/` с username/password,
никакого `device_token`/`challenge`-флоу, никакого scraping.

Единственная точка входа:

```text
https://agent.robinhood.com/mcp/trading
```

Транспорт — **Streamable HTTP MCP** (не SSE-only). Проверено живым запросом: сервер отвечает
`401` с заголовком

```text
www-authenticate: Bearer resource_metadata="https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading"
access-control-expose-headers: Mcp-Session-Id
```

то есть это стандартный RFC 9728 challenge и сессия живёт в заголовке `Mcp-Session-Id`.

### 1.2 Торговля — только на Agentic Account

`get_accounts` возвращает у каждого счёта поле `agentic_allowed`. Ровно один счёт торгуемый.
`place_equity_order` / `review_equity_order` / `cancel_equity_order` **отклоняются**, если
`account_number` не принадлежит agentic-счёту. Все read-инструменты работают по всем счетам:
Robinhood даёт агенту read-доступ к номерам счетов, позициям, балансам, истории транзакций
и вотчлистам — по всем счетам пользователя.

Условия (проверено по справке Robinhood 2026-09-04):

* нужен основной individual investing account в хорошем состоянии;
* всего у пользователя может быть до 10 self-directed individual счетов;
* продукт **не помечен** как beta и не требует waitlist;
* открыть Agentic Account и авторизовать агента можно **только с десктопа**: «You can only open
  an agentic account and authenticate your agent on a desktop device». С мобильного онбординг-URL
  надо скопировать и открыть в десктопном браузере;
* ответственность за сделки агента — на пользователе, и агент может торговать без подтверждения,
  если ему это разрешено.

### 1.3 Живые схемы инструментов

Схемы уже сняты в соседнем проекте: `/Users/mymac/Work/apps/robinhood/docs/mcp/tools.live.json`
(62 инструмента, снято 2026-08-25). **Скопируй этот файл в `docs/mcp/robinhood-tools.live.json`
и сверяйся с ним**, а на этапе 2 пересними свежий `tools/list` после подключения.

Нужные нам инструменты и их обязательные аргументы (дословно из `tools.live.json`):

| Tool | required | ключевые optional |
|---|---|---|
| `get_accounts` | — | — |
| `get_portfolio` | `account_number` | — |
| `get_equity_positions` | `account_number` | `cursor` |
| `get_equity_quotes` | `symbols[]` | до 20 символов, иначе пропадёт `closes` |
| `get_equity_historicals` | `symbols[]`, `start_time` | `end_time`, `interval`, `bounds`, `adjustment_type` |
| `get_equity_tradability` | `account_number`, `symbols[]` (≤10) | — |
| `get_equity_orders` | `account_number` | `state`, `symbol`, `order_id`, `created_at_gte`, `placed_agent`, `cursor` |
| `review_equity_order` | `account_number`, `symbol`, `side`, `type` | `quantity`/`dollar_amount`, `limit_price`, `time_in_force`, `market_hours` |
| `place_equity_order` | `account_number`, `symbol`, `side`, `type` | то же + `ref_id` (идемпотентность!) |
| `cancel_equity_order` | `account_number`, `order_id` | — |
| `get_realized_pnl` | `account_number` | `span`/`start_date`+`end_date`, `timezone` |
| `get_pnl_trade_history` | `account_number` | `span`, `symbol`, `cursor` |

Важные правила ордеров (из описания `place_equity_order`):

* `type`: `market` | `limit` | `stop_market` | `stop_limit`.
* `time_in_force`: `gfd` | `gtc` (по умолчанию `gfd`). **Аналог Webull `DAY` — это `gfd`.**
* `market_hours`: `regular_hours` (дефолт) | `extended_hours` | `all_day_hours`.
  В неосновных сессиях исполняются **только limit**; `market`/`stop_*` там отклоняются.
  Мы торгуем на закрытии в RTH → всегда `regular_hours`.
* Ровно одно из `quantity` или `dollar_amount`; `dollar_amount` — только с `type=market`.
* Дробные акции — только `type=market` + `regular_hours`, до 6 знаков.
  **В проекте покупка целыми лотами (коммит `17eb4cd`), поэтому `quantity` — целое строкой.**
* `ref_id` — UUID-ключ идемпотентности. Апстрим дедуплицирует по нему. При ретрае транспорта
  слать **тот же** `ref_id`. Это прямой аналог `client_order_id` в Webull.
* `market-on-close` **не поддерживается**. Как и у Webull, мы шлём market-ордер в окне T-1.

Состояния ордера (из `get_equity_orders.state`):
`new, queued, confirmed, unconfirmed, partially_filled, filled, cancelled, rejected, failed, voided`.
Финальные: `filled, cancelled, rejected, failed, voided`.

### 1.4 Исторические бары

`get_equity_historicals`:

* `start_time` **обязателен**, RFC3339 UTC (`'2021-09-03T00:00:00Z'`).
* `interval='day'` для дневных баров (интервалы фиксированные, сервер не агрегирует).
* `bounds='regular'` (RTH) — то, что нам нужно.
* `adjustment_type='split'` — **дефолт и правильный выбор для бэктеста** (сплит-скорректированные
  цены, без дивидендной корректировки). Это ровно наш `adjustment: 'split_only'`.
* До **10 символов** за вызов.
* У бара есть флаг `interpolated` — синтетический бар-заглушка. **Такие бары надо отбрасывать**,
  иначе они испортят IBS (`high == low` → деление на ноль).
* Глубина: по постановке задачи ~5 лет. Публично Robinhood это **не документирует** —
  поиск по официальным статьям и сторонним обзорам ничего не дал.
  **Это надо подтвердить эмпирически на этапе 2**
  (запросить `start_time` = сегодня минус 10 лет и посмотреть, с какой даты реально приходят бары),
  и записать фактическое значение в `docs/mcp/robinhood-tools.live.json` рядом.

### 1.5 Тип счёта, PDT и расчёты — это ограничивает саму стратегию

Проверено по официальным справочным статьям Robinhood (2026-09-04):

* Agentic-счёт открывается **либо как cash, либо как limited margin**; существующий cash можно
  апгрейднуть до limited margin в Investing Settings.
* **Margin borrowing на Agentic-счетах не включён.** Limited margin даёт только право торговать
  неотстоявшимися средствами, но не плечо. То есть режимы `margin_125…margin_200` из
  `src/lib/autotrade-config.ts` на Robinhood **работать не будут** — их надо скрывать или
  жёстко зажимать по фактическому buying power из `get_portfolio`.
* **Cash-счёт:** «you must wait 1 business day for funds from closing stock and option positions
  to settle before trading». Day trades не ограничены, но **денег на следующий вход не будет
  до T+1**. Для нашей стратегии (вышли — и в тот же/следующий день зашли снова) это блокер.
* **Limited margin:** торгуем неотстоявшимися деньгами сразу, но **действует PDT** — правило
  применяется к full и limited margin счетам даже без включённого margin investing, и
  не применяется к cash-счетам. Под $25 000 это не более 3 day trades за 5 рабочих дней.

**Вывод для реализации:** ни один из двух режимов не даёт «свободно входим и выходим каждый день».
Поэтому адаптер Robinhood **обязан** уважать pre-trade alerts из `review_equity_order`
(там приходят и PDT, и buying power) и отказываться от входа, а не отправлять ордер вслепую.
Вопрос «cash или limited margin» задан пользователю в §10.

## 2. АВТОРИЗАЦИЯ — самая важная часть

### 2.1 Что отдаёт сам Robinhood (проверено живыми запросами 2026-09-04)

`GET https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading`:

```json
{
  "authorization_servers": ["https://agent.robinhood.com/mcp/trading"],
  "bearer_methods_supported": ["header"],
  "resource": "https://agent.robinhood.com/mcp/trading",
  "scopes_supported": ["internal"]
}
```

`GET https://agent.robinhood.com/.well-known/oauth-authorization-server`:

```json
{
  "issuer": "https://agent.robinhood.com/mcp/trading",
  "authorization_endpoint": "https://robinhood.com/oauth",
  "token_endpoint": "https://api.robinhood.com/oauth2/token/",
  "registration_endpoint": "https://agent.robinhood.com/oauth/trading/register",
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["internal"]
}
```

Читается это так:

1. **Публичный клиент** (`token_endpoint_auth_methods_supported: ["none"]`) — client_secret нет
   и не будет. Ровно как в TradeDeck: `OAuthConfiguration(authentication: .none(clientID:))`.
2. **PKCE S256 обязателен.**
3. **Dynamic Client Registration поддержан** — `registration_endpoint` есть.
   `client_id` не хардкодится: его надо один раз получить регистрацией и сохранить.
4. Единственный scope — `internal`.
5. Токен обменивается на `https://api.robinhood.com/oauth2/token/`, refresh — тот же endpoint
   с `grant_type=refresh_token`.

### 2.2 Как оператор получает код авторизации (пошагово, руками, один раз)

Это **не** headless-флоу. Никакого SMS/TOTP/challenge-id, как в неофициальном API. Это обычный
OAuth 2.1 authorization code + PKCE, где `code` прилетает в redirect на **loopback**.

TradeDeck делает ровно это (`macOS/Sources/Data/RobinhoodMCPClient.swift`,
класс `RobinhoodAuthPresenter`): поднимает TCP-listener на `127.0.0.1` на случайном порту
49152–65535, redirect_uri = `http://127.0.0.1:<port>/callback`, открывает браузер, ловит
`GET /callback?code=...&state=...`, отвечает «You can close this window».

Наш серверный аналог (этап 4, `robinhoodAuth.js`):

**Шаг 0 (единожды, руками).** Оператор в **десктопном браузере** открывает Agentic Account
в Robinhood и завершает онбординг. Без этого `agentic_allowed` не появится ни у одного счёта.

**Шаг 1. Регистрация клиента (DCR).** Сервер один раз делает:

```http
POST https://agent.robinhood.com/oauth/trading/register
Content-Type: application/json

{
  "client_name": "mktorder",
  "redirect_uris": ["http://127.0.0.1:<port>/api/autotrade/robinhood/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "internal"
}
```

Ответ содержит `client_id` (и, возможно, `client_id_issued_at`). **Сохранить `client_id`
в SQLite** (таблица `robinhood_oauth`, см. §4). При смене `redirect_uris` придётся
перерегистрироваться — поэтому **порт redirect должен быть фиксированным**, а не случайным,
как в TradeDeck. Возьми порт из env: `ROBINHOOD_OAUTH_REDIRECT_PORT` (дефолт 53682).

**Шаг 2. Формирование ссылки.** Сервер генерит:

* `code_verifier` — 43–128 символов из `[A-Za-z0-9-._~]` (`crypto.randomBytes(32)` → base64url);
* `code_challenge = base64url(sha256(code_verifier))`;
* `state` — случайный UUID (защита от CSRF).

и строит URL:

```text
https://robinhood.com/oauth
  ?response_type=code
  &client_id=<client_id>
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fapi%2Fautotrade%2Frobinhood%2Foauth%2Fcallback
  &scope=internal
  &state=<state>
  &code_challenge=<challenge>
  &code_challenge_method=S256
  &resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

`resource` — RFC 8707, MCP-спека его требует. Если Robinhood его проигнорирует — не страшно.

**Шаг 3. Что делает человек.** Сервер **не открывает браузер сам** (он может быть в докере).
Вместо этого:

* `POST /api/autotrade/robinhood/oauth/start` возвращает `{ authorizationUrl, state, expiresAt }`;
* фронт на вкладке Robinhood показывает большую кнопку «Подключить Robinhood» → открывает URL
  в новой вкладке **того же браузера, где сидит оператор**;
* оператор логинится в Robinhood (если не залогинен), видит consent-экран агента, жмёт «Разрешить»;
* Robinhood редиректит на `http://127.0.0.1:53682/...?code=...&state=...`.

> ⚠️ **Ловушка развёртывания — решено в пользу варианта A.** Redirect идёт на loopback
> **браузера пользователя**, а не сервера. Если сервер в докере/на удалёнке, `127.0.0.1:53682`
> из браузера оператора никуда не попадёт.
>
> Публичные источники по поводу нелокальных redirect_uri противоречивы: в баг-репорте Cursor
> у Robinhood **захардкожен allowlist** под конкретный предрегистрированный клиент
> (`cursor://anysphere.cursor-mcp/oauth/callback`), а loopback `http://localhost:8787/callback`
> отбивался с «Mismatching Redirect URI» и 403 на authorize. Это про **чужой предрегистрированный
> client_id**, а не про DCR. При этом соседний TradeDeck через DCR ходит на
> `http://127.0.0.1:<случайный порт>/callback` и работает — то есть Robinhood, судя по всему,
> сверяет loopback-редиректы по RFC 8252 §7.3, игнорируя порт.
>
> **Решение:** делаем вариант **A** — OAuth проходится на машине оператора (loopback),
> полученный `refresh_token` + `client_id` переносятся на прод через
> `PUT /api/autotrade/robinhood/token`, ровно как сейчас переносится токен Webull.
> HTTPS-redirect на домен приложения **проверить на этапе 2**, но не закладываться на него.

**Шаг 4. Обмен кода на токен.** Callback-роут проверяет `state`, затем:

```http
POST https://api.robinhood.com/oauth2/token/
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<тот же самый redirect_uri>
&client_id=<client_id>
&code_verifier=<code_verifier>
&resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

Ответ — `{ access_token, refresh_token, expires_in, token_type: "Bearer", scope }`.
Сохранить всё в SQLite. Ответить в браузер простой HTML-страницей «Готово, окно можно закрыть».

**Шаг 5. Refresh.** Перед каждым обращением, если `expires_at - now < 120 сек`:

```http
POST https://api.robinhood.com/oauth2/token/
grant_type=refresh_token&refresh_token=<...>&client_id=<...>&scope=internal
```

Если refresh-токен ротируется (в ответе пришёл новый) — **перезаписать**. Если refresh вернул
`400/401` — токен мёртв, надо снова шаг 2–4 руками. Тогда: пометить статус `NEEDS_REAUTH`,
отправить Telegram-предупреждение (по образцу `webullToken.js` → `RENEWAL_INSTRUCTION`)
и **блокировать** отправку ордеров, не притворяясь, что всё хорошо.

**Шаг 6. Использование.** Каждый MCP-запрос: `Authorization: Bearer <access_token>` +
`Mcp-Session-Id` от `initialize`. На `401` — один раз рефрешнуть и повторить; на второй `401` —
`NEEDS_REAUTH`.

### 2.3 Чем ходить в MCP из Node

Сервер — CommonJS (`server/package.json`, `require` везде), а `@modelcontextprotocol/sdk` — ESM.
Два варианта:

* **Вариант A (рекомендуемый): свой тонкий JSON-RPC клиент на `fetch`.** MCP поверх Streamable
  HTTP — это ~150 строк: `initialize` → сохранить `Mcp-Session-Id` → `notifications/initialized`
  → `tools/call`. Никаких зависимостей, полный контроль над retry/логами, ложится в тот же стиль,
  что `webullClient.js` (`requestWebull`). Заголовки: `Content-Type: application/json`,
  `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2025-06-18`.
  Ответ может прийти как `text/event-stream` — распарсить строки `data: {...}`.
* **Вариант B:** `const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')`
  внутри async-функции. Работает в Node 26, но тянет зависимость и свой OAuth-слой, который
  всё равно придётся подпирать нашим хранилищем токенов.

**Берём A.** OAuth пишем сами (он у нас уже описан выше поштучно).

---

## 3. Архитектурное решение: брокер как плагин

### 3.1 Проблема

Сейчас Webull зашит по именам. Точки, где это видно:

* `server/src/services/autotrade.js` — `executeWebullSignal()`, `closeWebullPositionMarket()`,
  `buyWebullTestMarket()`, `getWebullDashboardSnapshot()`, `buildWebullRuntimeConfig()`;
* `server/src/services/telegramAggregation.js:576` и `:667` — **прямые вызовы `executeWebullSignal`
  из T-1**. Это главный шов;
* `server/src/routes/autotrade.js` — все URL вида `/autotrade/webull/*`;
* `server/src/db/index.js` — таблица `webull_token`, таблица `broker_trades` **без колонки брокера**;
* фронт — `/broker` → `WebullAccountPage.tsx`.

### 3.2 Решение

Ввести **интерфейс брокерского адаптера** и реестр. Не переписывать `autotrade.js` целиком:
вынести из него только то, что реально брокероспецифично.

Новый файл `server/src/brokers/index.js`:

```js
// Реестр брокеров. Ключ = brokerId ('webull' | 'robinhood').
const adapters = {
  webull: require('./webullAdapter'),
  robinhood: require('./robinhoodAdapter'),
};
function getBrokerAdapter(brokerId) { ... }
function listBrokerIds() { return Object.keys(adapters); }
```

Контракт адаптера (`server/src/brokers/types.md` — просто документ, JS без типов):

```js
{
  id: 'robinhood',
  label: 'Robinhood',

  // здоровье соединения
  async getConnectionSummary(),        // { configured, hasAccessToken, hasAccountId, ... }
  async getAccountSnapshot(),          // { accounts, balance, positions }
  async getDashboardSnapshot(opts),    // + openOrders, orderHistory, fetchedAt

  // исполнение
  async submitEntry({ symbol, quantity, currentPrice, clientOrderId }),
  async submitExit({ symbol, quantity, currentPrice, clientOrderId }),
  async cancelOpenOrders(symbol),
  async getOrderStatus(clientOrderId),  // → { status, filledQty, avgPrice, brokerOrderId }
  async getPositionQuantity(symbol),

  // сайзинг
  async getBuyingPower(),               // число USD

  // котировки (опционально)
  async fetchTodayRangeAndQuote(symbol),
}
```

`executeWebullSignal` переименовать в **`executeBrokerSignal({ brokerId, action, ... })`** и оставить
в нём всю общую механику, которая уже написана и работает: трекеры (`pendingOrderTrackers`),
резервации (`orderSubmissionReservations`), поллинг статуса (`TRACKING_DELAYS_MS`),
логи (`appendAutotradeEvent`), запись сделки (`finalizeTrackedTrade`), Telegram-уведомления.
Брокероспецифичными остаются только вызовы `adapter.submitEntry/submitExit/getOrderStatus`.

> **Оставить `executeWebullSignal` как тонкий алиас** `(args) => executeBrokerSignal({ brokerId: 'webull', ...args })`
> — чтобы не ломать существующие тесты (`server/src/services/__tests__/t1-parity.test.js`,
> `t1-aggregate-parity.test.js`) одним коммитом.

### 3.3 Ключевое решение по одновременной работе двух брокеров

**Предположение (озвучено пользователю, при возражении — переделать):** брокеры работают
**независимо и параллельно**. У каждого свой флаг `enabled`, свои `allowNewEntries`/`allowExits`
и **своя открытая позиция**. Один и тот же сигнал IBS может исполниться и на Webull, и на
Robinhood одновременно — это «зеркалирование» одной стратегии на два счёта.

Следствия:

* `broker_trades` получает колонку `broker`;
* `getCurrentOpenBrokerTrade()` → `getCurrentOpenBrokerTrade(brokerId)`;
* T-1 в `telegramAggregation.js` прогоняет цикл исполнения **по каждому включённому брокеру**,
  а решение (какой тикер, вход/выход) считается **один раз** и общее.

Альтернатива, если пользователь захочет иначе: один «активный» брокер в настройках. Она проще,
но тогда «Разрешить входы/выходы для webull и для robinhood» теряет смысл — значит выбран
параллельный вариант.

---

## 4. Изменения схемы БД (`server/src/db/index.js`)

Все — через существующий механизм `ALTER TABLE ... ADD COLUMN` в массиве миграций
(там уже так делается, ошибки «duplicate column» глотаются).

**4.1 Колонка брокера в сделках.**

```sql
ALTER TABLE broker_trades ADD COLUMN broker TEXT NOT NULL DEFAULT 'webull';
CREATE INDEX IF NOT EXISTS idx_broker_trades_broker_status ON broker_trades(broker, status);
```

Дефолт `'webull'` корректно размечает всю существующую историю.

**4.2 Новая таблица OAuth-состояния Robinhood.**

```sql
CREATE TABLE IF NOT EXISTS robinhood_oauth (
    id                  TEXT PRIMARY KEY CHECK (id = 'current'),
    client_id           TEXT,
    access_token        TEXT,
    refresh_token       TEXT,
    token_type          TEXT,
    scope               TEXT,
    expires_at          TEXT,          -- ISO8601 UTC
    account_number      TEXT,          -- agentic_allowed=true счёт
    last_check_status   TEXT,          -- OK | NEEDS_REAUTH | ERROR
    last_check_at       TEXT,
    last_health_check_date TEXT,
    created_at          TEXT,
    updated_at          TEXT
);
```

**4.3 Временное состояние PKCE** (живёт минуты, можно в памяти процесса; в SQLite — только если
хочется переживать рестарт во время авторизации):

```sql
CREATE TABLE IF NOT EXISTS robinhood_oauth_pending (
    state          TEXT PRIMARY KEY,
    code_verifier  TEXT NOT NULL,
    redirect_uri   TEXT NOT NULL,
    created_at     TEXT NOT NULL
);
```

Чистить записи старше 15 минут.

> **Секреты в БД.** `refresh_token` — это полный доступ к счёту. Файл SQLite обязан лежать
> в `/data` с правами 600 и **не попадать в бэкапы, которые куда-то уезжают**. Проверить
> `server/scripts/security-regression-check.js` — добавить туда правило, что `refresh_token`
> и `access_token` не должны появляться в логах и в ответах API (см. `redactSensitivePayload`
> в `webullClient.js` — переиспользовать её).

---

## 5. Изменения настроек (`server/src/services/settings.js`)

### 5.1 Текущая форма

`settings.autoTrading` — плоский объект с `enabled`, `allowNewEntries`, `allowExits`,
`lowIBS`, `highIBS`, `provider`, `entryCapitalMode`, ... (см. `getDefaultSettings()`).

### 5.2 Целевая форма

Разделить на **общую стратегию** и **на-брокера**:

```js
autoTrading: {
  // ---- общее (стратегия одна на всех) ----
  lowIBS: 0.1,
  highIBS: 0.75,
  executionWindowSeconds: 90,
  onlyFromTelegramWatches: true,
  symbols: '',
  provider: 'finnhub',            // провайдер котировок для IBS
  entrySizingMode: 'balance',
  entryCapitalMode: 'standard_safe',
  sizingMode: 'notional',
  fixedQuantity: 1,
  fixedNotionalUsd: 1000,
  maxPositionUsd: 0,
  allowFractionalShares: false,
  maxSlippageBps: 25,
  notes: '',
  lastModifiedAt: null,

  // ---- на брокера ----
  brokers: {
    webull: {
      enabled: false,
      allowNewEntries: true,
      allowExits: true,
      orderType: 'MARKET',
      timeInForce: 'DAY',
      supportTradingSession: 'CORE',
      previewBeforeSend: true,
      cancelOpenOrdersBeforeEntry: false,
    },
    robinhood: {
      enabled: false,
      allowNewEntries: true,
      allowExits: true,
      orderType: 'MARKET',          // → type: 'market'
      timeInForce: 'DAY',           // → 'gfd'
      marketHours: 'regular_hours',
      previewBeforeSend: true,      // → review_equity_order перед place
      cancelOpenOrdersBeforeEntry: false,
    },
  },
}
```

### 5.3 Обязательная миграция настроек (backward compat)

В `normalizeAutoTradingSettings()` добавить: если `brokers` отсутствует — собрать
`brokers.webull` из старых плоских полей (`enabled`, `allowNewEntries`, `allowExits`,
`orderType`, `timeInForce`, `supportTradingSession`, `previewBeforeSend`,
`cancelOpenOrdersBeforeEntry`), а `brokers.robinhood` — из дефолтов с `enabled: false`.
Старые плоские поля **оставить в объекте на чтение** ещё один релиз, чтобы ничего не упало,
но писать только в `brokers.*`.

`sanitizeAutoTradingConfig()` (`autotrade.js:493`) расширить: принимать
`{ brokers: { robinhood: { allowNewEntries: false } } }` — точечный merge по брокеру,
булевы поля валидировать так же, как сейчас.

### 5.4 Провайдеры котировок / данных

Добавить `'robinhood'` в белые списки:

* `sanitizeAutoTradingConfig`, строка с `['finnhub', 'webull']` → `['finnhub', 'webull', 'robinhood']`;
* `server/src/routes/quotes.js:152, :220` — массивы разрешённых провайдеров;
* `src/components/ui/ProviderBadge.tsx` — `PROVIDER_OPTIONS` += `{ value: 'robinhood', label: 'Robinhood' }`;
* `src/lib/api.ts` — union-типы провайдера (строки 429, 1017, 1083) += `'robinhood'`.

**Важно:** в отличие от Webull, Robinhood **умеет** отдавать историю. Поэтому в
`server/src/routes/quotes.js:225` блок, который возвращает 400 для Webull, **не** копировать
на Robinhood — вместо этого добавить `case 'robinhood'` в
`fetchHistoricalMarketData()` (`server/src/services/dataIngestion.js:130`).

---

## 6. Backend: пофайловый план

### Фаза 1 — фундамент, без торговли

**Новый `server/src/services/robinhoodOauth.js`:**

```
getStoredOauth()                 // строка из robinhood_oauth
saveClientRegistration(clientId)
buildRedirectUri()               // из env ROBINHOOD_OAUTH_REDIRECT_BASE + путь
registerClient()                 // POST /oauth/trading/register, идемпотентно
startAuthorization()             // → { authorizationUrl, state }; кладёт PKCE в pending
completeAuthorization(code, state) // обмен на токен, чистка pending
getAccessToken()                 // с авто-refresh, единственная точка выдачи Bearer
refreshAccessToken()
revoke()                         // wipe строки
getStatus()                      // { connected, expiresAt, accountNumber, lastCheckStatus }
```

Дисциплина: один мьютекс (`async-mutex`, он уже в зависимостях) вокруг refresh, чтобы
параллельные вызовы не сожгли refresh-токен гонкой.

**Новый `server/src/services/robinhoodMcpClient.js`** — по образцу `webullClient.js`:

```
ensureSession()                  // initialize → Mcp-Session-Id, кэш в модуле
callTool(name, args)             // tools/call, парсинг text/event-stream, 401 → 1 refresh + retry
listTools()                      // tools/list, для диагностики
```

Плюс сырое логирование в файл — **точная калька** с `appendWebullRawLog` /
`getCurrentWebullRawLogPath` / `redactSensitivePayload`. Новая константа
`ROBINHOOD_RAW_LOG_FILE` в `server/src/config/index.js` рядом с `WEBULL_RAW_LOG_FILE`.
**Обязательно редактировать `Authorization` и токены в логах.**

**Новый `server/src/providers/robinhood.js`** — рыночные данные:

```
fetchTodayRangeAndQuote(symbol)          // через get_equity_quotes
fetchBatchTodayRangeAndQuote(symbols)    // батч ≤20
fetchFromRobinhood(symbol, startTs, endTs) // get_equity_historicals, interval=day
```

`fetchFromRobinhood` обязан возвращать ровно тот же формат строк, что и остальные провайдеры
(см. `normalizeFetchedRows` в `dataIngestion.js`), с **датой-строкой `YYYY-MM-DD`**.

> 🔴 **ДАТЫ.** Читай `CLAUDE.md`, раздел «Даты: почему в проекте нет таймзон». MCP отдаёт
> `begins_at` в RFC3339 UTC. Превращать в торговую дату **только** срезом первых 10 символов
> ISO-строки (`'2026-09-03T13:30:00Z'.slice(0,10)`) — и то лишь после проверки, что для
> `interval=day, bounds=regular` время всегда 00:00Z или 13:30Z (то есть срез не переносит день).
> **Проверить это на живом ответе на этапе 2 и записать вывод в док.** Если время окажется
> 20:00Z/21:00Z (закрытие сессии в UTC) — срез всё равно даёт правильный день; опасно только
> если бы время было ≥ 00:00 следующих суток. `new Date()` на торговой дате — запрещён.

**Конфиг `server/src/config/index.js`:**

```js
ROBINHOOD_MCP_URL: process.env.ROBINHOOD_MCP_URL || 'https://agent.robinhood.com/mcp/trading',
ROBINHOOD_OAUTH_REDIRECT_BASE: process.env.ROBINHOOD_OAUTH_REDIRECT_BASE || 'http://127.0.0.1:53682',
ROBINHOOD_ACCOUNT_NUMBER: process.env.ROBINHOOD_ACCOUNT_NUMBER || '',  // опционально, иначе из get_accounts
```

**Роуты `server/src/routes/robinhood.js`** (подключить в `server/server.js` рядом с `autotradeRoutes`):

```
POST   /api/autotrade/robinhood/oauth/start      → { authorizationUrl }
GET    /api/autotrade/robinhood/oauth/callback   → HTML «готово» (публичный? нет — см. ниже)
POST   /api/autotrade/robinhood/oauth/disconnect
GET    /api/autotrade/robinhood/oauth/status
PUT    /api/autotrade/robinhood/token            → ручная заливка refresh_token (вариант A из §2.2)
GET    /api/autotrade/robinhood/account
GET    /api/autotrade/robinhood/dashboard
GET    /api/autotrade/robinhood/tools            → tools/list, диагностика
POST   /api/autotrade/robinhood/close-position
POST   /api/autotrade/robinhood/test-buy
```

> ⚠️ **Callback и аутентификация.** `server/server.js:122` вешает `auth.requireAuth` на всё.
> Redirect от Robinhood придёт **без** нашей сессионной куки, если оператор открыл ссылку
> в другом браузере/инкогнито. Варианта два: (а) сказать оператору «открывай ссылку в том же
> браузере, где залогинен в приложении» — тогда кука есть и ничего менять не надо; (б) вынести
> callback-роут **до** `requireAuth` и защитить его одноразовым `state`, который и так есть.
> **Выбрать (б)**: `state` — криптослучайный, одноразовый, с TTL 10 минут, этого достаточно;
> в белый список исключений `requireAuth` добавить ровно этот один путь. Не забудь про CSP/helmet.

### Фаза 2 — адаптер и исполнение

**`server/src/brokers/webullAdapter.js`** — обёртка над существующим `webullClient.js`.
Кода почти нет, только переименование аргументов под контракт §3.2.

**`server/src/brokers/robinhoodAdapter.js`:**

* `getAccountNumber()` — `get_accounts`, найти запись с `agentic_allowed === true`,
  закэшировать в `robinhood_oauth.account_number`. **Если такой записи нет — бросать понятную
  ошибку «Agentic Account не подключён», а не выбирать первый счёт.**
* `submitEntry({ symbol, quantity, clientOrderId })`:
  1. `get_equity_tradability({ account_number, symbols: [symbol] })` — проверить торгуемость;
  2. если `previewBeforeSend` — `review_equity_order(...)`, разобрать alerts.
     **PDT-alert и «недостаточно buying power» → отказ, лог `execution_blocked`, Telegram.**
  3. `place_equity_order({ account_number, symbol, side: 'buy', type: 'market',
     quantity: String(целое), time_in_force: 'gfd', market_hours: 'regular_hours',
     ref_id: clientOrderId })`.
  `clientOrderId` — **UUID** (Robinhood требует UUID в `ref_id`; Webull-овский формат может не
  подойти — генерить `crypto.randomUUID()` и хранить как есть, без снятия дефисов).
* `submitExit(...)` — то же с `side: 'sell'`, `quantity` = фактическое количество из
  `get_equity_positions` (продаём позицию целиком, коммит `17eb4cd`).
* `getOrderStatus(clientOrderId)` — `get_equity_orders({ account_number, ... })`, найти по
  `ref_id`/`client_order_id`; вернуть нормализованный статус и `filledQty`/средний филл.
  **Маппинг статусов Robinhood → внутренние** сделать в отдельной чистой функции
  `normalizeRobinhoodOrderStatus(raw)` рядом с существующей `normalizeWebullOrderStatus`
  (`autotrade.js:806`) и покрыть unit-тестом.
* `cancelOpenOrders(symbol)` — `get_equity_orders({ state: 'queued'|'confirmed', symbol })`
  → `cancel_equity_order` по каждому.
* `getBuyingPower()` — `get_portfolio({ account_number })`.

**Рефакторинг `autotrade.js`:**

1. `executeWebullSignal` → `executeBrokerSignal({ brokerId, ... })`, внутри —
   `const adapter = getBrokerAdapter(brokerId)`; все `placeOrder/previewOrder/getOrderDetail`
   заменить вызовами адаптера.
2. Ключи трекеров и резерваций (`trackerKeyFor`, `reservationKeyFor`) — **добавить `brokerId`**,
   иначе Webull и Robinhood будут блокировать друг друга.
3. `getCurrentOpenBrokerTrade()` → принимает `brokerId`.
4. `evaluateAutoTradeCycle()` — считает решение один раз, но открытые позиции проверяет
   по каждому включённому брокеру; возвращает `decisionsByBroker`.
5. `runAutoTradingSchedulerTick()` — `autoTrading.enabled` заменить на
   «есть хотя бы один брокер с `enabled: true`»; `schedulerKey` дополнить `brokerId`.
6. Экспортировать `executeWebullSignal` как алиас — не ломать тесты.

### Фаза 3 — T-1

`server/src/services/telegramAggregation.js`, строки ~576 (exit) и ~667 (entry):
заменить одиночный `executeWebullSignal(...)` на цикл по включённым брокерам:

```js
for (const brokerId of getEnabledBrokerIds(autoTrading, 'exit')) {
  const res = await executeBrokerSignal({ brokerId, action: 'exit', ... });
  ...
}
```

где `getEnabledBrokerIds(cfg, action)` возвращает брокеров с `enabled &&
(action === 'entry' ? allowNewEntries : allowExits)`.

Требования:

* **Ошибка одного брокера не должна прерывать другого** — каждый вызов в свой try/catch,
  результат агрегируется.
* Событие `t1_signal_confirmed` получает поле `broker`. То же — все `appendAutotradeEvent`.
* Текст T-1 сообщения в Telegram: показывать строку на брокера,
  например `• Robinhood: вход AAPL 12 шт — отправлен` / `• Webull: заблокирован (PDT)`.
* `recordTradeEntry`/`recordTradeExit` (монитор) остаются **одним** набором — монитор ведёт
  логическую стратегию. А `broker_trades` — по брокеру. Проверить
  `server/src/services/monitorConsistency.js`: сверка «монитор vs брокер» теперь должна
  сверять монитор с **каждым** брокером и репортить mismatch на брокера.
* `getBlockingMonitorMismatch()` — решить, блокирует ли рассинхрон одного брокера торговлю
  на другом. **Предложение: нет, не блокирует** — блокируется только «свой» брокер.

---

## 7. Frontend: пофайловый план

### 7.1 Переименование текущей вкладки в Webull

| Файл | Что |
|---|---|
| `src/components/AppRouter.tsx:46` | `'/broker'` → `'/webull'` в `routePreloaders` |
| `src/components/AppRouter.tsx:177` | `{ to: '/broker', label: 'Брокер' }` → `{ to: '/webull', label: 'Webull' }` |
| `src/components/AppRouter.tsx:188` | то же во втором списке навигации |
| `src/components/AppRouter.tsx:443` | `<Route path="/broker" ...>` → `path="/webull"` |
| `src/components/ui/BottomNav.tsx:9` | `to: '/broker', label: 'Брокер'` → `'/webull', 'Webull'` |

**Обязательно добавить редирект** `<Route path="/broker" element={<Navigate to="/webull" replace />} />`,
иначе у пользователя сломаются закладки. И проверить `src/components/__tests__/AppRouter.test.tsx` —
там есть проверки навигации.

Строку `RENEWAL_INSTRUCTION` в `server/src/services/webullToken.js:9` («кнопка на /broker»)
поправить на `/webull`.

### 7.2 Новая вкладка Robinhood

Новый файл `src/components/RobinhoodAccountPage.tsx`. **Структуру копировать 1-в-1** с
`WebullAccountPage.tsx` (те же табы: `overview | positions | orders | deals | autotrade |
monitoring | trades | logs`, те же `InfoCard` / `SectionPanel` / `RawJson`).

Отличия:

* **Новый таб `connection`** (первым, если не подключено): кнопка «Подключить Robinhood»,
  статус OAuth (`connected / expires at / account_number / NEEDS_REAUTH`), кнопка «Отключить»,
  и текст-инструкция про десктопный браузер и Agentic Account.
* На `overview`: `get_portfolio` вместо баланса Webull — маппинг полей другой,
  писать свою `extractRobinhoodPortfolioSummary()`.
* На `autotrade`: показывать `allowNewEntries/allowExits` **именно робингудовские**
  (`autotradeConfig.brokers.robinhood.*`).
* `deals` — вместо истории ордеров Webull можно взять `get_pnl_trade_history`.

> Прежде чем копипастить 1745 строк: вынести общие куски (`InfoCard`, `SectionPanel`, `RawJson`,
> `formatMoney`, `formatDateTime`, `formatLogLine`, `normalizeTrackedStatus`) в
> `src/components/broker/shared.tsx` и импортировать в обе страницы. Иначе через месяц это
> два расходящихся файла по 1700 строк. **Это не «улучшение сверх задачи», а условие того,
> что вторая вкладка вообще будет поддерживаемой.**

Маршрут: `/robinhood`, лейбл `Robinhood`, иконка — любая из `lucide-react` (например `Landmark`).
Добавить во все три места навигации (`AppRouter` ×2 + `BottomNav`) и в `routePreloaders`.

### 7.3 Настройки: «Разрешить входы / Разрешить выходы» по брокерам

`src/components/AppSettings.tsx`, компонент `AutotradeTab` (строка 44). Сейчас там редактируются
только `enabled`, `provider`, `entryCapitalMode` через локальный pending-state и одну кнопку
«Сохранить».

Надо: под общими настройками — **две панели**, «Webull» и «Robinhood», в каждой три
`ToggleSwitch`:

* «Автоторговля включена» → `brokers.<id>.enabled`
* «Разрешить входы» → `brokers.<id>.allowNewEntries`
* «Разрешить выходы» → `brokers.<id>.allowExits`

Сохраняются той же кнопкой, тем же `onSaveConfig` (`PATCH /api/autotrade/config`), в теле —
только изменённые поля, вложенно: `{ brokers: { robinhood: { allowExits: false } } }`.

В панели Robinhood, если OAuth не подключён, показывать бейдж «Не подключено» и ссылку на
`/robinhood`, а тумблеры делать `disabled`.

### 7.4 Типы

`src/types/index.ts:438` — `AutoTradingConfig`:

```ts
export interface BrokerAutoTradingConfig {
  enabled: boolean;
  allowNewEntries: boolean;
  allowExits: boolean;
  orderType: string;
  timeInForce: string;
  previewBeforeSend: boolean;
  cancelOpenOrdersBeforeEntry: boolean;
  supportTradingSession?: string;   // только webull
  marketHours?: string;             // только robinhood
}

export interface AutoTradingConfig {
  // ... общие поля ...
  brokers: Record<'webull' | 'robinhood', BrokerAutoTradingConfig>;
  /** @deprecated читать из brokers.webull */
  enabled?: boolean;
  allowNewEntries?: boolean;
  allowExits?: boolean;
}
```

`AutotradeConfigResponse.webull` → добавить `robinhood` того же вида (не удалять `webull`,
чтобы не сломать `WebullAccountPage`).

`src/lib/api.ts` — новые методы по образцу существующих (строки 873–925):
`getRobinhoodDashboard`, `startRobinhoodOauth`, `getRobinhoodOauthStatus`,
`disconnectRobinhood`, `closeRobinhoodPosition`, `robinhoodTestBuy`.

---

## 8. Тесты (что обязательно покрыть)

Существующие, которые нельзя сломать:
`server/src/services/__tests__/t1-parity.test.js`, `t1-aggregate-parity.test.js`,
`webullToken.test.js`, `src/components/__tests__/AppRouter.test.tsx`,
`WebullAccountPage.trades.test.tsx`, `ui/__tests__/BottomNav.test.tsx`, `ProviderBadge.test.tsx`.

Новые:

1. **`robinhoodOauth.test.js`** — PKCE: `code_challenge` = base64url(sha256(verifier)); `state`
   одноразовый; refresh при истёкшем токене; ротация refresh-токена; `NEEDS_REAUTH` при 400.
2. **`robinhoodAdapter.test.js`** — на моках `callTool`: сборка аргументов `place_equity_order`
   (целое `quantity` строкой, `gfd`, `regular_hours`, `ref_id` = UUID); отказ при
   `agentic_allowed !== true`; маппинг статусов; отказ по PDT-alert из review.
3. **`robinhood-historicals.test.js`** — парсинг `get_equity_historicals`: отбрасывание
   `interpolated: true`, дата = `YYYY-MM-DD`, порядок по возрастанию, отсутствие `new Date()`.
4. **Таймзонный прогон** — `npm run test:tz` (UTC+13 и UTC−8). Результаты обязаны совпадать.
   Это главный тест на то, что даты не поехали.
5. **`t1-multibroker.test.js`** — T-1 с двумя включёнными брокерами: оба получают сигнал;
   падение одного не мешает другому; при `allowNewEntries: false` у Robinhood вход уходит
   только на Webull.
6. **Frontend** — `AppRouter.test.tsx`: `/broker` редиректит на `/webull`, `/robinhood` рендерится;
   `AppSettings`: тумблеры пишут вложенный patch.
7. **`security-regression-check.js`** — добавить проверку, что `access_token`/`refresh_token`
   не утекают в `/api/autotrade/robinhood/*` ответы и в raw-лог.

---

## 9. Порядок работ (по коммиту на пункт)

| # | Что | Готово, когда |
|---|---|---|
| 1 | Скопировать `tools.live.json` в `docs/mcp/robinhood-tools.live.json`, оформить `docs/robinhood-integration.md` | файл в репо |
| 2 | **Разведка вживую:** DCR с HTTPS-redirect (проходит или нет?), `tools/list`, `get_accounts`, `get_equity_historicals` на 10 лет назад — записать фактическую глубину и формат `begins_at` | выводы дописаны в док |
| 3 | Миграции БД (`broker` в `broker_trades`, `robinhood_oauth`) | миграции идемпотентны, старая история размечена как `webull` |
| 4 | `robinhoodOauth.js` + роуты OAuth + вкладка `/robinhood` с одним табом «Подключение» | оператор нажал кнопку, прошёл consent, статус «connected» |
| 5 | `robinhoodMcpClient.js` + `GET /autotrade/robinhood/tools` + raw-лог с редактированием секретов | `tools/list` отдаёт 62 инструмента, в логе нет токенов |
| 6 | `providers/robinhood.js` (котировки + история), в белые списки провайдеров | `/api/history/:symbol?provider=robinhood` отдаёт 5 лет дневных баров |
| 7 | Настройки: `brokers.*` в `settings.js`, миграция плоских полей, `sanitizeAutoTradingConfig` | старый `settings.json` читается без потери значений |
| 8 | UI настроек: две панели с тремя тумблерами | тумблеры сохраняются и переживают перезагрузку |
| 9 | Переименование `/broker` → `/webull` + редирект + вся навигация | старая закладка работает |
| 10 | Вынос общих компонентов в `components/broker/shared.tsx` | обе страницы собираются, тесты зелёные |
| 11 | `brokers/index.js` + `webullAdapter.js`, `executeWebullSignal` → `executeBrokerSignal` + алиас | `t1-parity` тесты зелёные без правок |
| 12 | `robinhoodAdapter.js` + `test-buy` на 1 акцию дешёвого тикера | реальный ордер прошёл, статус дошёл до `filled`, сделка записалась с `broker='robinhood'` |
| 13 | T-1 мультиброкерный цикл | dry-run T-1 (`forceSend` + `test: true`) показывает обе строки |
| 14 | Полная вкладка `/robinhood` (все табы) | визуальный паритет с Webull |
| 15 | Тесты из §8 + `npm run test:tz` + `npm run build:check` + `npm run lint` | всё зелёное |

---

## 10. Открытые вопросы к пользователю (задать до этапа 3)

1. **Параллельные брокеры или один активный?** План написан под параллельные (см. §3.3).
2. ~~Где живёт OAuth-redirect~~ — **решено:** loopback на машине оператора, токен переносится
   на прод руками (§2.2). Подтвердить на этапе 2, что DCR не принимает HTTPS-домен.
3. **Одинаковый ли размер позиции на обоих счетах?** Сейчас сайзинг общий (`entryCapitalMode`),
   но buying power у счетов разный. Предложение: сайзинг считать **на брокера**, от его
   собственного `get_portfolio` / `getAccountBalance` — иначе на меньшем счёте ордер отобьётся.
4. **Cash или limited margin на Agentic-счёте, и меньше ли на нём $25 000?** См. §1.5 — это
   решает, упрёмся мы в PDT (3 day trades / 5 дней) или в T+1 расчёты. Третьего варианта нет,
   плечо на Agentic-счетах отключено.
5. **Robinhood как источник исторических данных для датасетов** — только новый провайдер в
   списке, или ещё и автоматический refresh датасетов через него?

---

## 11. Чего НЕ делать

* Не использовать `robin_stocks`, `pyrh`, `robinhood-node`, `api.robinhood.com` с логином/паролем,
  `device_token`, `challenge_type`, MFA-кодами. Только официальный MCP.
* Не хардкодить `client_id` — он получается через DCR и хранится в БД.
* Не логировать `Authorization`, `access_token`, `refresh_token`, `code_verifier`, номера счетов.
* Не звать `place_equity_order` на счёте с `agentic_allowed !== true` — он всё равно отклонит,
  но лучше не пытаться.
* Не превращать торговую дату в `Date`. Читай `CLAUDE.md` §«Даты».
* Не удалять `executeWebullSignal` до того, как T-1 тесты переписаны.
* Не менять пороги IBS ни для одного брокера — вход `ibs < lowIBS`, выход `ibs > highIBS`,
  строго через `server/src/utils/ibsSignals.js`.
