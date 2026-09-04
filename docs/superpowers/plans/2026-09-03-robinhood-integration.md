# Роадмап: интеграция Robinhood (Agentic Account) зеркально к Webull

Дата: 2026-09-03, переписан 2026-09-04 под Go-стек. Статус: план, код не менялся.
Источник переноса: соседний проект `/Users/mymac/Work/apps/robinhood` (TradeDeck, Swift).

> **Правка от 2026-09-04.** Первая редакция этого документа была написана против легаси-стека
> React + Node (`src/`, `server/`). Это ошибка: рабочий стек — **Go (`go/internal/`) + ванильный
> JS SPA (`go/web/js/app.js`)**. Ниже всё переписано под Go. React не трогаем и не расширяем.

---

## 0. Что надо сделать

1. Вкладку «Брокер» переименовать в **Webull**, рядом сделать **Robinhood** такой же структуры.
2. Научить Go-сервер торговать через официальный **Robinhood Trading MCP** на **Agentic-счёте**.
3. Добавить Robinhood как провайдера котировок и дневных баров (~5 лет).
4. В настройках — по три тумблера на брокера: включено / разрешить входы / разрешить выходы.
5. Брокеры работают **зеркально**: одно и то же решение стратегии исполняется на обоих счетах.
6. Только целые акции (в Go это уже так, см. §5.3).

### 0.1. Предусловие, которое нельзя обойти

`docs/audit-go/ROADMAP.md`, **Блок 0** — 12 находок, ломающих торговлю (сделка пишется по факту
отправки, а не исполнения; цена сделки — котировка, а не филл; выход не пишет P&L; зависший
трекер навсегда блокирует тикер; нет `recover()` в фоновых горутинах). Пока Блок 0 не закрыт,
**второй брокер только удвоит ущерб**: фантомная позиция будет теперь на двух счетах.

**Robinhood начинать после закрытия Блока 0.** Это не пожелание — это порядок работ.

---

## 1. Ответы на заданные вопросы

### 1.1. Тип счёта — limited margin, PDT не применяется

Принято как данность со слов пользователя. Что из этого следует для кода:

* **Плечо на Agentic-счетах Robinhood не включено** («margin borrowing is not yet enabled for
  Agentic accounts»). Limited margin даёт только торговлю неотстоявшимися средствами, не заём.
  Значит `entryCapitalMode` со значениями `margin_125…margin_200` на Robinhood **фактически
  упрётся в потолок buying power** и превратится в `cash_100`. Это не ошибка — просто на
  Robinhood множитель > 1 не даст эффекта. В UI Robinhood-панели это надо честно написать.
* PDT не применяем, специальных ограничителей на число входов в неделю **не пишем**.
* Pre-trade alerts из `review_equity_order` всё равно читаем — там приходит и buying power,
  и halt инструмента. Отказ по alert логируем и не отправляем ордер.

### 1.2. Чем работаем с Robinhood из Go

**Свой тонкий MCP-клиент на `net/http`, ~200 строк.** Обоснование:

* `go/go.mod` не имеет **ни одной прямой зависимости** — только indirect от sqlite. Дом-стиль:
  всё пишется руками. `internal/webull/client.go` (356 строк) — ровно такой же ручной HTTP-клиент
  с подписью, ретраями и логированием. MCP-клиент ляжет рядом как `internal/robinhood/client.go`.
* MCP поверх Streamable HTTP — это JSON-RPC 2.0 в POST: `initialize` → запомнить заголовок
  `Mcp-Session-Id` → `notifications/initialized` → `tools/call`. Ответ приходит либо
  `application/json`, либо `text/event-stream` (строки `data: {...}`) — обработать оба.
* Альтернатива: официальный `github.com/modelcontextprotocol/go-sdk` (поддерживает Streamable
  HTTP и экспериментальный клиентский OAuth). Он рабочий, но тянет первую прямую зависимость
  и свой OAuth-слой, который всё равно придётся подпирать нашим хранилищем токенов в SQLite.
  **Берём ручной вариант.** SDK — запасной, если ручной упрётся в неожиданности протокола.

Заголовки запроса:

```
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
Mcp-Session-Id: <из ответа initialize, кроме самого initialize>
```

### 1.3. Авторизация копированием ссылки — да, так и делаем

Именно этого вы и просили, и это **проще**, чем поднимать локальный listener. Robinhood после
согласия редиректит браузер на `http://127.0.0.1:<порт>/callback?code=...&state=...`. Страница
не откроется (слушателя нет) — но **вся нужная информация уже в адресной строке**.

Флоу в UI (вкладка Robinhood, таб «Подключение»):

1. Кнопка **«Получить ссылку»** → `POST /api/autotrade/robinhood/oauth/start`.
   Сервер генерит `code_verifier`, `code_challenge`, `state`, кладёт их в SQLite и возвращает
   готовый authorization URL.
2. UI показывает URL в поле «только чтение» с кнопкой «Копировать» и текстом:
   *«Откройте в десктопном браузере, войдите в Robinhood, разрешите доступ. Браузер попробует
   открыть страницу на 127.0.0.1 и покажет ошибку — это нормально. Скопируйте адрес из адресной
   строки целиком и вставьте ниже.»*
3. Поле **«Вставьте адрес после разрешения»** + кнопка «Подключить» →
   `POST /api/autotrade/robinhood/oauth/complete` с телом `{"callbackUrl": "http://127.0.0.1:53682/callback?code=...&state=..."}`.
4. Сервер парсит URL, сверяет `state`, обменивает `code` на токены, сохраняет, стирает pending.

Никакого listener'а, никакого проброса портов, работает при сервере в докере на удалёнке.
Ровно то, что вы описали.

> Единственное требование к `redirect_uri`: он должен **побайтово совпадать** с тем, что был
> зарегистрирован через DCR и передан в authorize. Возьми фиксированный
> `http://127.0.0.1:53682/callback` и захардкодь константой — менять его нельзя, иначе
> перерегистрация клиента.

### 1.4. Зеркальный режим

Одно решение стратегии → исполняется на всех включённых брокерах. У каждого брокера свой
`enabled` / `allowNewEntries` / `allowExits` и **своя строка открытой позиции** в `broker_trades`.
Ошибка одного брокера не отменяет исполнение на другом.

### 1.5. Только целые акции

В Go это уже так и есть: `ComputeOrderQuantity` (`internal/live/sizing.go:177`) делает
`math.Floor` **безусловно**, тумблера дробных акций больше нет — он был удалён вместе с
`sizingMode`/`orderType`/`timeInForce` как «ручка, тихо противоречащая бэктесту».
Адаптер Robinhood обязан слать `quantity` как **целое число строкой** (`"12"`, не `"12.0"`).

Исключение — выход: `PositionQuantity` (`sizing.go:203`) возвращает **фактическое** количество
у брокера без округления, потому что сплит может оставить дробь и `Floor` продал бы 7 из 7.5.
На Robinhood это работает так же — продаём то, что вернул `get_equity_positions`.

---

## 2. ОТВЕТ ПРО МАРЖУ WEBULL: от какой суммы считается процент

Короткий ответ: **от свободных денег (`cash_balance`), а не от buying power.**
Buying power используется только как **верхний ограничитель**.

Код: `go/internal/live/sizing.go:152-169` (`resolveEntryBalanceSizing`) и `:177` (`ComputeOrderQuantity`).

### 2.1. Три величины

| Величина | Функция | Что берётся, по порядку до первого положительного |
|---|---|---|
| `baseCapital` — **база множителя** | `extractEntryBaseCapital` (`sizing.go:138`) | `asset.cash_balance` → `root.total_cash_balance` → `root.cash_balance` → `asset.net_liquidation_value` → `root.total_net_liquidation_value` → `root.net_liquidation_value` |
| `buyingPower` — **потолок** | `extractEntryFundsFromBalance` (`sizing.go:132`) | для CORE: `day_buying_power` → `overnight_buying_power` → `night_trading_buying_power` → `option_buying_power` → `cash_balance` → `net_liquidation_value`, затем root-поля |
| `entryFunds` — **что реально тратим** | `resolveEntryBalanceSizing` | см. формулу ниже |

`asset` — это запись из `account_currency_assets` с `currency == "USD"` (или первая, если USD нет).

### 2.2. Формула

```
multiplierBase = baseCapital > 0 ? baseCapital : buyingPower      // фолбэк!
entryFunds     = multiplierBase * multiplier                      // 1.0 / 1.25 / 1.5 / 1.75 / 2.0
entryFunds     = min(entryFunds, buyingPower)                     // жёсткий потолок
quantity       = floor( (entryFunds / (1 + reservePct)) / price ) // reservePct: 0.022 у standard_safe
```

### 2.3. Что это значит на числах

Пусть `cash_balance = 10 000`, `day_buying_power = 40 000`, цена = 100, режим `margin_150`
(multiplier 1.5, reservePct 0).

```
baseCapital = 10 000
entryFunds  = 10 000 × 1.5 = 15 000
min(15 000, 40 000) = 15 000
quantity = floor(15 000 / 100) = 150 акций
```

То есть «маржа 150%» = **полтора раза от кэша**, а не полтора раза от покупательской
способности. Если бы считалось от buying power, вышло бы 600 акций.

Режим `standard_safe` (multiplier 1, reservePct 2.2%): `entryFunds = 10 000`,
`funds = 10 000 / 1.022 = 9 784`, `quantity = floor(97.84) = 97` акций. Запас 2.2% — это
поправка на правило Webull для market buy, а не на риск.

### 2.4. Где база множителя перестаёт быть кэшем

Важное уточнение: `baseCapital` — это не «кэш или buying power», у него **свой список
кандидатов**, и до buying power он доходит в последнюю очередь (`sizing.go:145`):

```
asset.cash_balance
  → root.total_cash_balance
  → root.cash_balance
  → asset.net_liquidation_value          ← вот здесь база перестаёт быть кэшем
  → root.total_net_liquidation_value
  → root.net_liquidation_value
```

И только если **все шесть** оказались ≤ 0, `resolveEntryBalanceSizing` подставляет
`multiplierBase = buyingPower` (`sizing.go:157`). То есть множитель применяется к buying power
не «часто», а только когда payload баланса пришёл пустым или битым.

Реальный риск — не эта крайняя ветка, а **`net_liquidation_value`**. Это стоимость всего счёта:
кэш **плюс рыночная стоимость открытых позиций**. Пока мы входим только будучи «плоскими»,
`net_liq ≈ cash`, и подстановка корректна — она как раз спасает случай limited margin, когда
`cash_balance` временно 0 из-за неотстоявшихся денег.

Ломается это, когда на счёте есть позиция, о которой мы не знаем (ручная сделка, или зеркальная
на другом брокере, если счета связаны). Тогда:

```
cash_balance = 0, net_liquidation_value = 10 000 (всё в позиции), day_buying_power = 8 000
baseCapital = 10 000            ← деньги, которые уже вложены
entryFunds  = 10 000 × 1 = 10 000
min(10 000, 8 000) = 8 000      ← потолок срезал, но не до нуля
```

Покупка на 8 000 при нулевом кэше — за счёт маржи под уже удерживаемую позицию.
Потолок `min(entryFunds, buyingPower)` ущерб ограничивает, но не отменяет: у Webull с настоящей
маржой buying power бывает вдвое больше кэша, и потолок в этом случае не помогает.

Решение по этой ветке — вопрос 1 в §9.

### 2.5. И про Robinhood

У Robinhood нет `account_currency_assets`. `get_portfolio` даёт свою разбивку и buying power.
Адаптер обязан вернуть в общий формат две величины:
`baseCapital` = свободный кэш счёта, `buyingPower` = поле buying power из `get_portfolio`.
Дальше работает та же самая `resolveEntryBalanceSizing` — **переиспользуем, не дублируем**.
Поскольку плеча на Agentic-счёте нет, `buyingPower ≈ baseCapital` и множитель > 1 срежется потолком.

---

## 3. Проверенные факты о Robinhood MCP

### 3.1. Только официальный путь

Никакого `robin_stocks`, логина/пароля, `device_token`, SMS-challenge. TradeDeck это прямо
запрещает (`docs/mcp/robinhood-capabilities.md` §«Главный принцип»), и мы придерживаемся того же.

Единственная точка входа: `https://agent.robinhood.com/mcp/trading`.
Транспорт — Streamable HTTP. Проверено живым запросом: на неавторизованный POST приходит

```
HTTP/2 401
www-authenticate: Bearer resource_metadata="https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading"
access-control-expose-headers: Mcp-Session-Id
```

### 3.2. OAuth-метаданные (проверено живыми запросами 2026-09-04)

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
  "scopes_supported": ["internal"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

`GET .../.well-known/oauth-protected-resource/mcp/trading`:

```json
{
  "authorization_servers": ["https://agent.robinhood.com/mcp/trading"],
  "bearer_methods_supported": ["header"],
  "resource": "https://agent.robinhood.com/mcp/trading",
  "scopes_supported": ["internal"]
}
```

Выводы: публичный клиент без секрета, PKCE S256 обязателен, DCR поддержан, scope один — `internal`.

### 3.3. Условия Agentic-счёта

Проверено по справке Robinhood 2026-09-04:

* нужен основной individual investing account в хорошем состоянии; до 10 self-directed счетов;
* продукт не beta, waitlist не нужен;
* **открыть счёт и авторизовать агента можно только с десктопа**: «You can only open an agentic
  account and authenticate your agent on a desktop device»;
* агент получает read-доступ ко **всем** счетам (номера, позиции, балансы, история, вотчлисты),
  но торговать может **только** на Agentic-счёте;
* ответственность за сделки агента — на пользователе.

### 3.4. Живые схемы инструментов

Уже сняты: `/Users/mymac/Work/apps/robinhood/docs/mcp/tools.live.json` (62 инструмента, 2026-08-25).
**Скопировать в `docs/mcp/robinhood-tools.live.json`**, на этапе 2 пересиять свежий `tools/list`.

| Tool | required | важные optional |
|---|---|---|
| `get_accounts` | — | возвращает `agentic_allowed` у каждого счёта |
| `get_portfolio` | `account_number` | стоимость по классам + buying power |
| `get_equity_positions` | `account_number` | `cursor` |
| `get_equity_quotes` | `symbols[]` | ≤ 20 символов, иначе пропадёт `closes` |
| `get_equity_historicals` | `symbols[]`, `start_time` | `end_time`, `interval`, `bounds`, `adjustment_type`; ≤ 10 символов |
| `get_equity_tradability` | `account_number`, `symbols[]` | ≤ 10 символов |
| `get_equity_orders` | `account_number` | `state`, `symbol`, `order_id`, `created_at_gte`, `cursor` |
| `review_equity_order` | `account_number`, `symbol`, `side`, `type` | `quantity`, `limit_price`, `time_in_force`, `market_hours` |
| `place_equity_order` | те же + | `ref_id` — ключ идемпотентности |
| `cancel_equity_order` | `account_number`, `order_id` | — |

Правила ордеров (дословно из описаний в `tools.live.json`):

* `type`: `market` \| `limit` \| `stop_market` \| `stop_limit`. Нам нужен `market`.
* `time_in_force`: `gfd` \| `gtc`, дефолт `gfd`. **Наш `DAY` — это `gfd`.**
* `market_hours`: `regular_hours` (дефолт) \| `extended_hours` \| `all_day_hours`.
  В неосновных сессиях исполняются только limit; `market` там отклоняется. Мы всегда
  `regular_hours` — торгуем в окне T-1 до закрытия.
* Ровно одно из `quantity` / `dollar_amount`; `dollar_amount` только с `type=market`.
* `ref_id` — UUID. Апстрим дедуплицирует по нему; при ретрае слать **тот же**.
  Это прямой аналог `client_order_id` в Webull.
* **Market-on-close не поддерживается** — как и у Webull, шлём market в окне T-1.

Состояния ордера: `new, queued, confirmed, unconfirmed, partially_filled, filled, cancelled,
rejected, failed, voided`. Финальные — последние пять.

### 3.5. Исторические бары

`get_equity_historicals`:

* `start_time` обязателен, RFC3339 UTC (`"2021-09-04T00:00:00Z"`);
* `interval: "day"`, `bounds: "regular"`, `adjustment_type: "split"` (дефолт, и это ровно то,
  что нужно бэктесту — сплит-скорректировано, без дивидендов);
* у бара есть флаг `interpolated` — синтетическая заглушка. **Такие бары отбрасывать**, иначе
  `high == low` и IBS делится на ноль;
* **глубина публично не документирована** — ни официальные статьи, ни сторонние обзоры цифры
  не дают. Заявленные ~5 лет проверяются эмпирически на этапе 2.

> 🔴 **ДАТЫ.** `CLAUDE.md`, раздел «Даты: почему в проекте нет таймзон», и `internal/tradingdate`.
> MCP отдаёт `begins_at` в RFC3339 UTC. Торговая дата получается **срезом первых 10 символов
> строки**, а не через `time.Parse` + `Format`. На этапе 2 снять живой ответ и записать, какое
> там время суток для `interval=day, bounds=regular` — если это 00:00Z или 13:30Z, срез
> безопасен. Тесты обязаны совпадать в `TZ=Pacific/Auckland` и `TZ=America/Los_Angeles`.

---

## 4. АВТОРИЗАЦИЯ: пошагово

### Шаг 0 — руками, единожды
Оператор в **десктопном** браузере открывает Agentic Account в Robinhood и завершает онбординг.
Без этого ни у одного счёта не будет `agentic_allowed: true`.

### Шаг 1 — DCR, единожды, сервер

```http
POST https://agent.robinhood.com/oauth/trading/register
Content-Type: application/json

{
  "client_name": "mktorder",
  "redirect_uris": ["http://127.0.0.1:53682/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "internal"
}
```

Ответ содержит `client_id`. Сохранить в `robinhood_oauth.client_id`. Повторно не регистрировать.

> Известная тонкость: в баг-репорте Cursor у Robinhood был захардкожен allowlist под их
> **предрегистрированный** client_id (`cursor://...`), и loopback отбивался «Mismatching Redirect
> URI». Это про чужой предрегистрированный клиент, не про DCR. TradeDeck через собственную DCR
> ходит на `http://127.0.0.1:<порт>/callback` и работает. Если DCR всё же откажет на loopback —
> на этапе 2 попробовать HTTPS-домен приложения; если откажет и он — писать в задачу как блокер.

### Шаг 2 — authorization URL, сервер

* `code_verifier` — 43–128 символов из `[A-Za-z0-9-._~]` (`crypto/rand` 32 байта → base64url);
* `code_challenge = base64url(sha256(code_verifier))`;
* `state` — `crypto/rand`, одноразовый, TTL 15 минут.

```
https://robinhood.com/oauth
  ?response_type=code
  &client_id=<client_id>
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback
  &scope=internal
  &state=<state>
  &code_challenge=<challenge>
  &code_challenge_method=S256
  &resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

### Шаг 3 — человек
Копирует URL из UI → открывает в десктопном браузере → логинится → жмёт «Разрешить» →
браузер уходит на `127.0.0.1:53682` и показывает ошибку соединения → **копирует адрес из
адресной строки целиком** → вставляет в поле в UI → «Подключить».

### Шаг 4 — обмен, сервер

```http
POST https://api.robinhood.com/oauth2/token/
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback
&client_id=<client_id>
&code_verifier=<verifier>
&resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

Ответ: `{ access_token, refresh_token, expires_in, token_type, scope }` → в SQLite.

### Шаг 5 — refresh
За 120 секунд до `expires_at`:
`grant_type=refresh_token&refresh_token=<...>&client_id=<...>&scope=internal`.
Если пришёл новый `refresh_token` — **перезаписать** (ротация). Если 400/401 — токен мёртв:
статус `NEEDS_REAUTH`, Telegram-предупреждение (по образцу webull-токена), **отправка ордеров
блокируется**. Обёртка вокруг refresh — `sync.Mutex`, чтобы параллельные вызовы не сожгли токен гонкой.

### Шаг 6 — использование
Каждый вызов: `Authorization: Bearer`. На 401 — один refresh и повтор; на второй 401 — `NEEDS_REAUTH`.

---

## 5. Изменения в Go

### 5.1. Схема БД (`internal/store/db.go`)

Миграции — рядом с существующими `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` (проверить, как
там сделаны добавления колонок, и повторить механизм).

```sql
ALTER TABLE broker_trades ADD COLUMN broker TEXT NOT NULL DEFAULT 'webull';
CREATE INDEX IF NOT EXISTS idx_broker_trades_broker_status ON broker_trades(broker, status);

CREATE TABLE IF NOT EXISTS robinhood_oauth (
    id                TEXT PRIMARY KEY CHECK (id = 'current'),
    client_id         TEXT,
    access_token      TEXT,
    refresh_token     TEXT,
    token_type        TEXT,
    scope             TEXT,
    expires_at        TEXT,
    account_number    TEXT,
    last_check_status TEXT,
    last_check_at     TEXT,
    created_at        TEXT,
    updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS robinhood_oauth_pending (
    state         TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    redirect_uri  TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
```

Дефолт `'webull'` корректно размечает всю существующую историю.
`store.OpenBrokerTrade(trades)` (`internal/live/telegram.go:482`) → принимает `broker`.

> **Секреты.** `refresh_token` — полный доступ к счёту. Файл SQLite в `/data`, права 600.
> В логах — никогда: посмотреть, как `internal/webull/client.go` редактирует чувствительные
> поля, и переиспользовать тот же механизм.

### 5.2. Интерфейс брокера — он уже есть

`internal/live/engine.go:59` объявляет `type Broker interface` с 14 методами, и `MemoryBroker`
(`transport.go`) его уже реализует для тестов. **Это готовый шов, изобретать нечего.**

Проблема: пять методов — не про исполнение, а про Webull как источник данных:
`CreateToken`, `CheckToken`, `Calendar`, `CalendarDays`, `RawSplits`.

**Разделить интерфейс:**

```go
// Всё, что нужно для торговли. Реализуют оба брокера.
type Broker interface {
    PlaceMarket(symbol, side string, qty float64) (OrderResult, error)
    CloseMarket(symbol string) (OrderResult, error)
    Account() (map[string]any, error)
    Positions() ([]any, error)
    OrderDetail(clientOrderID string) (map[string]any, error)
    OpenOrders() ([]any, error)
    OrderHistory(start, end string) ([]any, error)
    CancelOrder(clientOrderID string) error
}

// Webull-специфика: токены, календарь, сплиты. Robinhood это не реализует.
type WebullExtras interface {
    CreateToken() (map[string]any, error)
    CheckToken(token string) (map[string]any, error)
    Calendar() ([]byte, error)
    CalendarDays(start, end string) ([]map[string]any, error)
    RawSplits(symbol string) ([]map[string]any, error)
}
```

Места, где сейчас `e.Broker.CreateToken()` и т. п. (`autotrade.go:94,123,154`), переводятся
на type assertion `if x, ok := e.brokerByID("webull").(WebullExtras); ok`.
`PlaceMarketCfg` уже сделан через опциональный `marketCfgPlacer` (`autotrade.go:509`) — тот же приём.

### 5.3. Engine: один брокер → карта брокеров

`internal/live/engine.go:79` — `Broker Broker` заменить на:

```go
Brokers map[string]Broker   // "webull", "robinhood"
```

`EnvBrokerDB(db)` (`engine.go:117`) → `EnvBrokersDB(db)`, собирает карту из того, что настроено.

`Engine.Execute(trigger)` (`autotrade.go:371`) — **главная точка**. Сейчас решение и исполнение
слиты. Разделить:

1. `Evaluate()` считает решение **один раз** — оно общее для всех брокеров;
2. `Execute()` прогоняет цикл по брокерам, у которых
   `enabled && (action == "entry" ? allowNewEntries : allowExits)`;
3. каждый брокер — в своём блоке с восстановлением после ошибки; падение одного **не отменяет**
   другого; результаты агрегируются в `EvalResult`.

`sizeOrder` (`sizing.go:249`) — принимает брокера аргументом, а не берёт `e.Broker`.

Трекеры (`internal/live/track.go`, `store.ListPendingTrackers`) — **ключ обязан включать
`broker`**, иначе Webull и Robinhood будут блокировать друг друга по одному тикеру.

`Execute` вызывается из T-1 в `internal/live/telegram.go:35,45,53,57` — **сигнатуру не меняем**,
мультиброкерность прячется внутри. Это минимизирует диff в самом опасном месте.

### 5.4. Настройки (`internal/store/db.go:649`)

`mergeMaps` уже сливает вложенные карты по ключам, так что вложенный `brokers` безопасен.

```go
"autoTrading": map[string]any{
    "provider": "finnhub", "lowIBS": 0.1, "highIBS": 0.75,
    "executionWindowSeconds": 90, "entryCapitalMode": "standard_safe",
    "maxSlippageBps": 25, "lastModifiedAt": nil,
    "brokers": map[string]any{
        "webull":    map[string]any{"enabled": false, "allowNewEntries": true, "allowExits": true},
        "robinhood": map[string]any{"enabled": false, "allowNewEntries": true, "allowExits": true},
    },
},
```

**Миграция:** если `brokers` нет, а плоские `enabled`/`allowNewEntries`/`allowExits` есть —
перенести их в `brokers.webull`. Плоские ключи оставить на чтение ещё релиз.

`PATCH /api/autotrade/config` (`httpapi/server.go:186` → `handleAutoConfigPatch`) — **обязательно
валидировать вложенные поля белым списком**. Напоминание из аудита: находка 0.6 — сейчас патч
не валидирует ничего, `{"lowIBS": 5}` проходит. Не расширять эту дыру на `brokers`.

Правило из находки 0.10: отсутствующий `allowExits`/`allowNewEntries` трактовать как **false**,
а не true. Для торгового контура отказ должен быть закрытым.

### 5.5. Новые пакеты

**`internal/robinhood/oauth.go`:**
```
RegisterClient() (clientID string, err error)
BuildAuthorizationURL() (url, state string, err error)
CompleteFromCallbackURL(rawURL string) error
AccessToken() (string, error)     // единственная точка выдачи, с авто-refresh под мьютексом
Refresh() error
Status() (Status, error)
Revoke() error
```

**`internal/robinhood/client.go`** — MCP по образцу `internal/webull/client.go`:
```
ensureSession() error             // initialize → Mcp-Session-Id
CallTool(name string, args map[string]any) (map[string]any, error)
ListTools() ([]map[string]any, error)
```
Разбор `text/event-stream` и `application/json`. Ретраи и логирование — переиспользовать то,
что уже есть у Webull-клиента.

**`internal/live/robinhood_broker.go`** — реализация `Broker`, по образцу `webull_broker.go` (372 строки):

* `accountNumber()` — `get_accounts`, найти `agentic_allowed == true`, закэшировать.
  **Если такого нет — ошибка «Agentic Account не подключён», а не «взять первый счёт».**
* `PlaceMarket(symbol, side, qty)`:
  1. `get_equity_tradability`;
  2. `review_equity_order` — разобрать alerts, при блокирующем отказать;
  3. `place_equity_order{account_number, symbol, side, type:"market",
     quantity: strconv.FormatFloat(qty, 'f', 0, 64), time_in_force:"gfd",
     market_hours:"regular_hours", ref_id: uuid}`.
* `OrderDetail(refID)` — `get_equity_orders`, найти по `ref_id`, вернуть статус + `filled_qty` +
  средняя цена филла. Маппинг статусов — отдельная чистая функция рядом с существующим
  разбором в `internal/live/order_parse.go`, с unit-тестом.
* `Account()` — `get_portfolio`, привести к форме, которую понимает `sizing.go`
  (см. §2.5): дать поля, из которых `extractEntryBaseCapital` возьмёт кэш, а
  `extractEntryFundsFromBalance` — buying power.
* `CancelOrder`, `OpenOrders`, `OrderHistory`, `Positions` — прямые обёртки.

**`internal/providers/`** — Robinhood как источник котировок (`get_equity_quotes`) и истории
(`get_equity_historicals`). Посмотреть, как устроен `providers/client.go`, и добавить туда же.
В отличие от Webull, Robinhood **умеет** отдавать историю — блокирующую заглушку не копировать.

### 5.6. HTTP-роуты (`internal/httpapi/server.go:185-198`)

Добавить рядом, тем же `wrap(...)`:

```
POST /api/autotrade/robinhood/oauth/start        → { authorizationUrl }
POST /api/autotrade/robinhood/oauth/complete     → { callbackUrl } → { ok }
POST /api/autotrade/robinhood/oauth/disconnect
GET  /api/autotrade/robinhood/oauth/status
GET  /api/autotrade/robinhood/account
GET  /api/autotrade/robinhood/dashboard
GET  /api/autotrade/robinhood/tools
POST /api/autotrade/robinhood/close-position
POST /api/autotrade/robinhood/test-buy
```

**Все — под общей авторизацией**, никаких публичных исключений: callback-роут нам не нужен,
код приходит вставкой в форму. Это ещё один плюс копи-паст-флоу.

`internal/httpapi/mux_test.go:43-48` — добавить новые пути в список.

### 5.7. SPA (`go/web/js/app.js`, 3341 строка)

* `app.js:10,17,27` — три места навигации: `{ to: '/broker', label: 'Брокер' }` →
  `{ to: '/webull', label: 'Webull' }`, рядом добавить `{ to: '/robinhood', label: 'Robinhood' }`.
* Роутер: `/broker` → редирект на `/webull` (закладки не ломаем).
* `app.js:2543` — заголовок «Кабинет Webull» уже правильный, не трогать.
* Страница Robinhood — те же табы (`overview | positions | orders | deals | autotrade |
  monitoring | trades | logs`) **плюс первый таб «Подключение»** с флоу из §1.3.
  Рендер-функции табов вынести в общие хелперы и переиспользовать для обоих брокеров —
  копировать блок на 250 строк второй раз нельзя.
* `app.js:732` и `:2588` — списки провайдеров: добавить `robinhood: 'Robinhood'`.
* Настройки: две панели с тремя тумблерами каждая (`brokers.webull.*`, `brokers.robinhood.*`).
  Если Robinhood не подключён — бейдж «Не подключено», тумблеры `disabled`, ссылка на `/robinhood`.
* В панели Robinhood подписать, что множители маржи там не работают (§1.1).

---

## 6. Тесты

Существующие, которые нельзя сломать: `internal/live/correctness_test.go`,
`safety_test.go`, `engine_test.go`, `sizing_test.go`, `webull_broker_test.go`,
`internal/httpapi/live_api_test.go`, `mux_test.go`, `handlers_test.go`.

Новые:

1. `internal/robinhood/oauth_test.go` — `code_challenge == base64url(sha256(verifier))`;
   `state` одноразовый и с TTL; разбор вставленного callback-URL, включая мусор вокруг;
   отказ при чужом `state`; ротация refresh-токена; `NEEDS_REAUTH` при 400.
2. `internal/live/robinhood_broker_test.go` — на моке `CallTool`: `quantity` — целое строкой;
   `gfd` + `regular_hours`; `ref_id` — UUID и **тот же при ретрае**; отказ при
   `agentic_allowed != true`; отказ по блокирующему alert из review; маппинг всех 10 статусов.
3. `internal/providers/robinhood_test.go` — `interpolated: true` отбрасывается; дата —
   `YYYY-MM-DD`; порядок по возрастанию.
4. **Мультиброкерный T-1** — оба брокера получают одно решение; ошибка одного не мешает другому;
   при `allowNewEntries: false` у Robinhood вход уходит только на Webull; трекеры не мешают друг другу.
5. `sizing_test.go` — расширить: `baseCapital` берётся из кэша, а не из buying power;
   потолок `min(..., buyingPower)`; фолбэк при нулевом кэше (зафиксировать текущее поведение
   тестом, чтобы решение из §2.4 было осознанным изменением, а не случайным).
6. Таймзонный прогон: `TZ=Pacific/Auckland go test ./...` и `TZ=America/Los_Angeles go test ./...`
   — результаты обязаны совпадать. Плюс `go test -race ./...` и `go vet ./...`.

---

## 7. Порядок работ (по коммиту на пункт)

| # | Что | Готово, когда |
|---|---|---|
| 0 | **Закрыть Блок 0 из `docs/audit-go/ROADMAP.md`** | автоторговля на одном брокере безопасна |
| 1 | Скопировать `tools.live.json` → `docs/mcp/robinhood-tools.live.json` | файл в репо |
| 2 | Разведка вживую: DCR, `tools/list`, `get_accounts`, `get_equity_historicals` на 10 лет назад; зафиксировать глубину и формат `begins_at` | выводы дописаны в этот док |
| 3 | Миграции БД (`broker` в `broker_trades`, две таблицы OAuth) | идемпотентны, история размечена как `webull` |
| 4 | `internal/robinhood/oauth.go` + роуты + таб «Подключение» с копи-паст-флоу | оператор вставил URL, статус «connected» |
| 5 | `internal/robinhood/client.go` + `GET /robinhood/tools` + лог с редактированием секретов | `tools/list` отдаёт 62 инструмента, в логе нет токенов |
| 6 | Robinhood в `internal/providers` (котировки + история) | история за 5 лет приходит, `interpolated` отброшены |
| 7 | Настройки: `brokers.*` + миграция плоских ключей + валидация патча | старый `settings.json` читается без потери значений |
| 8 | SPA: настройки с двумя панелями по три тумблера | тумблеры переживают перезагрузку |
| 9 | SPA: `/broker` → `/webull` + редирект + навигация | старая закладка работает |
| 10 | Разделение `Broker` / `WebullExtras`, `Engine.Brokers` — **с одним брокером в карте** | все существующие тесты зелёные без правок |
| 11 | `internal/live/robinhood_broker.go` + `test-buy` на 1 акцию дешёвого тикера | ордер прошёл, дошёл до `filled`, сделка записана с `broker='robinhood'` |
| 12 | Зеркальный `Execute` по карте брокеров | dry-run T-1 показывает обе строки |
| 13 | Полная страница `/robinhood` | визуальный паритет с Webull |
| 14 | Тесты §6 + TZ-прогон + `-race` + `go vet` | всё зелёное |

Пункт 10 отдельным коммитом **до** появления Robinhood — так рефакторинг проверяется
существующими тестами, а не смешивается с новым брокером.

---

## 8. Чего не делать

* Не использовать `robin_stocks`, `pyrh`, `api.robinhood.com` с логином/паролем, `device_token`,
  `challenge_type`, MFA-кодами. Только официальный MCP.
* Не хардкодить `client_id` — он из DCR и лежит в БД.
* Не логировать `Authorization`, `access_token`, `refresh_token`, `code_verifier`, номера счетов.
* Не менять `redirect_uri` после регистрации.
* Не звать `place_equity_order` на счёте с `agentic_allowed != true`.
* Не превращать торговую дату в `time.Time` ради форматирования. `internal/tradingdate` + срез строки.
* Не трогать `src/` и `server/` — это мёртвый React/Node-стек.
* Не менять пороги IBS ни для одного брокера: вход `ibs < lowIBS`, выход `ibs > highIBS`,
  строго через `internal/ibs`.
* Не добавлять брокеру дробные акции. Только целые (§1.5).

---

## 9. Осталось спросить

### Вопрос 1. Что считать базой для множителя маржи, если кэша на счёте нет

**Как сейчас.** База — `cash_balance`. Если он ≤ 0, берётся `net_liquidation_value` — полная
стоимость счёта вместе с открытыми позициями (§2.4). Ошибки при этом не возникает, вход просто
считается от другого числа.

**Когда это правильно.** Limited margin, деньги после закрытия ещё не отстоялись:
`cash_balance = 0`, но реально они есть. Подстановка `net_liq` даёт верную сумму, и без неё
мы бы отказались от входа на ровном месте.

**Когда это неправильно.** На счёте лежит позиция, которой нет в нашем журнале — ручная сделка,
остаток от сбоя, что угодно. Тогда `net_liq` — это деньги, которые **уже вложены**, и вход
считается от них повторно. Потолок `buyingPower` ущерб срезает, но у Webull с настоящей маржой
buying power бывает вдвое больше кэша, так что срезает он не сильно.

**Варианты:**

* **A. Оставить как есть.** Ничего не делаем. Риск живёт, но проявляется только при позиции
  вне журнала.
* **B. Отказывать входу, если `cash_balance ≤ 0`.** Максимально строго, но ломает нормальный
  сценарий с неотстоявшимися деньгами — а у вас limited margin именно для этого.
* **C (рекомендую). Считать `baseCapital = net_liq − стоимость открытых позиций`.**
  Это и есть «свободные деньги» в честном смысле. Позиции всё равно уже запрашиваются
  (`Broker.Positions()`), данные под рукой. В нормальном случае даёт тот же ответ, что и
  `cash_balance`, а при чужой позиции — правильно её вычитает.
* **D. Оставить логику, но при подстановке `net_liq` писать предупреждение в лог и в Telegram.**
  Дёшево, не меняет поведение, но даёт видимость. Можно совместить с C как первый шаг.

**Что мне нужно от вас:** выбрать A / B / C / D. Если C — это отдельная задача до Robinhood,
потому что сайзинг общий для обоих брокеров и чинить его надо один раз.

---

### Решено: Robinhood — полноценный источник данных

Подтверждено пользователем 2026-09-04: Robinhood нужен **и для обновления датасетов**, а не
только как пункт в выпадающем списке. Что это добавляет к плану (учтено в §5.5 и §7):

* **Диспетчер провайдеров.** `internal/providers/client.go:178` — добавить `case "robinhood"`
  в `Historical()`. Заглушку «провайдер не поддерживает историю» **не копировать**: это ветка
  Webull (`client.go:187`), у Robinhood история есть.
* **Реалтайм-котировки.** `internal/providers/client.go:200` — `case "robinhood"` в `Quote()`
  рядом с `finnhub`/`webull`, потому что `get_equity_quotes` даёт настоящий интрадей, а не
  синтетику из дневных баров.
* **Живой IBS.** `internal/live/config.go:262` — добавить `"robinhood"` в
  `realtimeQuoteProviders`. В коде уже стоит комментарий, предвосхищающий это:
  *«Add "robinhood" here once the provider client implements a real-time quote»*.
  Попадание в этот список означает и участие в `quoteProviderChain` — резервном переборе
  провайдеров, когда основной отвалился.
* **Белые списки.** `internal/httpapi/server.go:734` (`refreshProvider`, автообновление
  датасетов) и `:1288` — добавить `"robinhood": true`. Плюс `settings`-поля
  `enhancerProvider` / `resultsRefreshProvider` / `resultsQuoteProvider`.
* **Батч из 10.** `get_equity_historicals` берёт до 10 символов за вызов, `get_equity_quotes` —
  до 20. Загрузчик обязан резать список на пачки, а не слать по одному.

**Отдельный риск, которого нет у других провайдеров.** Alpha Vantage и Polygon работают по
API-ключу, который не протухает сам. Robinhood работает по OAuth-токену, который **протухает**.
Если refresh отвалился, автообновление датасетов замолчит — и молча, потому что это фоновая
задача. Требования:

* при `NEEDS_REAUTH` автообновление через Robinhood **не пытается ходить и не ретраится
  вслепую**, а сразу отдаёт понятную ошибку;
* Telegram-предупреждение шлётся один раз на переход в `NEEDS_REAUTH`, не на каждую попытку
  (по образцу того, как это сделано для токена Webull);
* если Robinhood выбран как `resultsRefreshProvider` и он мёртв — падать на следующий
  провайдер в цепочке, а не оставлять датасет без обновления.

**Ограничение по глубине.** Если на этапе 2 подтвердится, что Robinhood отдаёт ~5 лет,
он **не может быть единственным источником** для датасетов, которые глубже. Политика:
Robinhood обновляет свежий хвост, глубокая история остаётся за Alpha Vantage / Polygon.
Дозагрузка обязана сшивать бары по дате без дублей и без дыр — механизм слияния в проекте уже
есть (`docs/data-quality/`, `internal/httpapi/integrity.go`), переиспользовать его, а не писать свой.

---

### Решено: размер позиции считается на каждом брокере отдельно

Подтверждено пользователем 2026-09-04. Зеркальность — про **решение стратегии**, а не про
количество акций. Для каждого счёта размер считается от **его собственного** баланса через ту же
`resolveEntryBalanceSizing`. Webull с 20 000 купит 200 акций по 100, Robinhood с 5 000 — 50.
Каждый счёт работает на полную, ни один ордер не отобьётся по недостатку средств.

Следствие для кода: `sizeOrder` (`internal/live/sizing.go:249`) принимает брокера аргументом
и вызывает `Account()` **у него**, а не у `e.Broker`. Кэшировать баланс между брокерами нельзя.

---

## 10. Единственный открытый вопрос

### Что считать базой для множителя маржи, если кэша на счёте нет

**Как сейчас.** База — `cash_balance`. Если он ≤ 0, берётся `net_liquidation_value` — полная
стоимость счёта вместе с открытыми позициями (§2.4). Ошибки не возникает, вход просто считается
от другого числа.

**Когда это правильно.** Limited margin, деньги после закрытия ещё не отстоялись:
`cash_balance = 0`, но реально они есть. Подстановка `net_liq` даёт верную сумму, и без неё
мы бы отказались от входа на ровном месте.

**Когда это неправильно.** На счёте лежит позиция, которой нет в нашем журнале — ручная сделка,
остаток от сбоя, что угодно. Тогда `net_liq` — это деньги, которые **уже вложены**, и вход
считается от них повторно. Потолок `buyingPower` ущерб срезает, но у Webull с настоящей маржой
buying power бывает вдвое больше кэша, так что срезает он не сильно.

**Варианты:**

* **A. Оставить как есть.** Риск живёт, но проявляется только при позиции вне журнала.
* **B. Отказывать входу при `cash_balance ≤ 0`.** Строго, но ломает нормальный сценарий
  с неотстоявшимися деньгами — а limited margin у вас именно для этого.
* **C (рекомендую). `baseCapital = net_liq − стоимость открытых позиций`.** Это и есть
  «свободные деньги» в честном смысле. Позиции всё равно уже запрашиваются
  (`Broker.Positions()`), данные под рукой. В нормальном случае даёт тот же ответ, что и
  `cash_balance`, а при чужой позиции правильно её вычитает.
* **D. Оставить логику, но при подстановке `net_liq` писать предупреждение в лог и Telegram.**
  Дёшево, поведение не меняет, даёт видимость. Совмещается с C как первый шаг.

**Почему это надо решить до Robinhood:** сайзинг общий для обоих брокеров, чинить его надо
один раз и до того, как он начнёт считать деньги на двух счетах.
