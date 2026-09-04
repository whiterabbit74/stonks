# Карта работ: Robinhood (Agentic Account) зеркально к Webull

Дата: 2026-09-03, финальная редакция 2026-09-04. Статус: план, код не менялся.
Стек: **Go (`go/internal/`) + ванильный JS SPA (`go/web/js/app.js`)**.
Источник переноса: `/Users/mymac/Work/apps/robinhood` (TradeDeck, Swift).

> Первая редакция была написана против легаси React + Node (`src/`, `server/`) — это была ошибка,
> всё переписано под Go. `src/` и `server/` не трогаем.

---

## 0. Задача

1. Вкладку «Брокер» переименовать в **Webull**, рядом сделать **Robinhood** такой же структуры.
2. Торговать через официальный **Robinhood Trading MCP** на **Agentic-счёте**.
3. Robinhood — **полноценный источник данных**: котировки, дневные бары, обновление датасетов.
4. В настройках по три тумблера на брокера: включено / разрешить входы / разрешить выходы.
5. Брокеры работают **зеркально**: одно решение стратегии исполняется на обоих счетах.
6. Только целые акции.
7. **Постоянно знать, живой ли доступ к каждому брокеру, и предупреждать при проблемах.**

### 0.1. Принятые решения

| Вопрос | Решение |
|---|---|
| Тип счёта Robinhood | limited margin, PDT не применяем |
| База множителя маржи | **вариант C**: `net_liq − стоимость открытых позиций` (§3) |
| Robinhood как источник данных | полноценный: котировки + история + автообновление датасетов |
| Размер позиции при зеркалировании | на каждом брокере от **его собственного** баланса |
| Авторизация Robinhood | копирование callback-URL руками, без listener (§5.3) |
| MCP-клиент | свой на `net/http`, без зависимостей (§5.2) |

### 0.2. Предусловие, которое нельзя обойти

`docs/audit-go/ROADMAP.md`, **Блок 0** — 12 находок, ломающих торговлю: сделка пишется по факту
отправки ордера, а не исполнения; цена сделки — котировка, а не филл; выход не пишет P&L;
зависший трекер навсегда блокирует тикер; нет `recover()` в фоновых горутинах.

Второй брокер поверх этого **удвоит ущерб** — фантомная позиция будет на двух счетах.
Robinhood начинается после закрытия Блока 0.

---

## 1. Мониторинг доступа к брокерам

Вынесено первым разделом, потому что это отдельная работа, нужная **независимо** от Robinhood,
и потому что при ревизии нашлась регрессия.

### 1.1. Найденная регрессия: Go потерял предупреждения о токене Webull

Node (`server/src/services/webullToken.js`) при ежедневной проверке слал в Telegram
предупреждение, если статус токена не `NORMAL` **или** до истечения осталось ≤ 3 дней,
с инструкцией, как перевыпустить.

Go (`internal/scheduler/scheduler.go:208` `RunTokenHealth`) **только записывает статус в БД**.
Ни одного вызова Telegram. Проверено: `grep` по `internal` не находит ни отправки, ни расчёта
`daysLeft`. В `docs/audit-go/ROADMAP.md` этой находки нет — она новая.

**Следствие:** токен Webull может протухнуть, и вы узнаете об этом в момент, когда T-1 не сможет
отправить ордер. Это надо чинить до Robinhood, а не после.

### 1.2. Как умирает доступ у каждого брокера

**Webull — два независимых способа:**

* **срок.** У токена есть дата истечения, она приходит в ответе `CheckToken`;
* **простой.** Webull инвалидирует токен после ~15 дней **без аутентифицированных запросов**.
  Одной проверки статуса недостаточно: запрос статуса несёт токен в теле и за использование
  не считается.

Go это уже лечит правильно: `TokenHealth()` (`internal/live/autotrade.go:111`) после успешного
`CheckToken` со статусом `NORMAL` делает `e.Broker.Account()` — вот этот аутентифицированный
вызов и есть keep-alive. Логика перенесена из Node корректно, ломать её нельзя.

Отдельно грамотная деталь, которую надо сохранить и повторить для Robinhood
(`scheduler.go:212-217`): если проверка **не дозвонилась** до брокера, статус `UNKNOWN`
**не перезаписывает** ранее подтверждённый. Иначе сетевой сбой понизил бы здоровый токен,
и следующий ордер ушёл бы с непонятным фолбэком.

**Robinhood — иначе, keep-alive «активностью» не нужен:**

* Доступ держится на OAuth. Access-token живёт `expires_in: 344000` секунд ≈ **3,98 суток**
  (значение из реального ответа token-эндпоинта, зафиксированного в баг-репорте
  `anthropics/claude-code#65895`).
* Продление — `grant_type=refresh_token`, не «сходить куда-нибудь аутентифицированно».
* Срок жизни **refresh**-токена Robinhood не документирует. Считаем, что он конечен и может
  ротироваться: если в ответе пришёл новый `refresh_token` — перезаписываем.

**Практический вывод.** Для Robinhood «keep-alive» — это **обновляться по расписанию, даже когда
не торгуем**. Если сервер простоит выходные и рефрешнётся только в понедельник в T-1, есть шанс
обнаружить мёртвый refresh-токен ровно в момент, когда нужно отправить ордер. Поэтому рефреш
идёт в том же ежедневном health-джобе, а не лениво по первому запросу.

### 1.3. Единая модель здоровья

Один статус на брокера, одинаковый для обоих:

| Статус | Значение | Торговля |
|---|---|---|
| `OK` | доступ подтверждён живым запросом | разрешена |
| `EXPIRING_SOON` | подтверждён, но осталось ≤ 3 дней | разрешена, шлём предупреждение |
| `NEEDS_REAUTH` | брокер отказал в аутентификации | **заблокирована** |
| `UNREACHABLE` | не дозвонились (сеть, 5xx, таймаут) | **предыдущий статус сохраняется** |
| `MISSING` | учётные данные не заданы | заблокирована |

`UNREACHABLE` — намеренно не «плохой» статус: он ничего не говорит о доступе. Правило из
`scheduler.go:212-217` распространяем на оба брокера.

### 1.4. Что делать в коде

**Обобщить health-джоб.** `RunTokenHealth(db, deps, todayET, now)` (`scheduler.go:208`) сейчас
жёстко про Webull. Превратить в цикл по брокерам:

```go
func RunBrokerHealth(db *store.DB, deps Deps, todayET string, now time.Time) []BrokerHealth
```

Для каждого брокера — своя проверка:

* **Webull:** `CheckToken` → при `NORMAL` дополнительный `Account()` как keep-alive (как сейчас);
* **Robinhood:** если до `expires_at` меньше суток — `Refresh()`; затем лёгкий read-вызов
  (`get_accounts`) как подтверждение, что токен реально принимается сервером.

Дедупликация по `last_health_check_date` и бэкофф по `last_health_check_attempt_at` уже есть
в схеме `webull_token` — повторить те же поля в `robinhood_oauth`.

**Предупреждения в Telegram.** Один текст-шаблон на обоих брокеров:

* шлём **на переход** в `NEEDS_REAUTH` / `MISSING` / `EXPIRING_SOON`, а не на каждую попытку —
  иначе при затяжной проблеме получится спам раз в сутки;
* повторяем, если состояние держится дольше 3 суток;
* при возврате в `OK` — одно сообщение «доступ восстановлен», чтобы не гадать;
* в тексте — что именно делать: для Webull перевыпустить токен, для Robinhood пройти
  копи-паст-авторизацию заново, со ссылкой на нужную вкладку.

Хранить последний отправленный статус, чтобы отличать переход от повтора — колонка
`last_alerted_status` в обеих таблицах токенов.

**Блокировка торговли.** `NEEDS_REAUTH` и `MISSING` у брокера означают, что **этот** брокер
исключается из зеркального цикла. Второй продолжает торговать. В логе T-1 — явная строка
«Robinhood: пропущен, требуется переавторизация», а не молчание.

**Эндпоинт и UI.** `GET /api/brokers/health` → массив `{broker, status, checkedAt, expiresAt,
daysLeft, detail}`. В SPA:

* бейдж состояния в шапке каждой брокерской вкладки;
* строка в настройках рядом с тумблерами брокера;
* если статус плохой — тумблеры не блокируем (пусть настройка живёт), но рядом пишем, что
  торговля по этому брокеру фактически остановлена.

---

## 2. Как считается размер позиции (и что в этом меняется)

### 2.1. Как сейчас

Код: `internal/live/sizing.go:152-169` (`resolveEntryBalanceSizing`) и `:177` (`ComputeOrderQuantity`).

| Величина | Функция | Кандидаты, до первого положительного |
|---|---|---|
| `baseCapital` — база множителя | `extractEntryBaseCapital` (`sizing.go:138`) | `asset.cash_balance` → `root.total_cash_balance` → `root.cash_balance` → `asset.net_liquidation_value` → `root.total_net_liquidation_value` → `root.net_liquidation_value` |
| `buyingPower` — потолок | `extractEntryFundsFromBalance` (`sizing.go:125`) | `day_buying_power` → `overnight_buying_power` → `night_trading_buying_power` → `option_buying_power` → `cash_balance` → `net_liquidation_value`, затем root-поля |

`asset` — запись из `account_currency_assets` с `currency == "USD"` (или первая, если USD нет).

```
multiplierBase = baseCapital > 0 ? baseCapital : buyingPower
entryFunds     = multiplierBase × multiplier          // 1.0 / 1.25 / 1.5 / 1.75 / 2.0
entryFunds     = min(entryFunds, buyingPower)         // потолок
quantity       = floor( (entryFunds / (1 + reservePct)) / price )
```

**Ответ на вопрос «от какой суммы считается процент маржи»: от свободных денег
(`cash_balance`), а не от покупательской способности.** Buying power — только потолок.

Пример: кэш 10 000, day buying power 40 000, цена 100, режим «Маржа 150%»
→ `10 000 × 1.5 = 15 000` → `min(15 000, 40 000)` → **150 акций**.
От buying power вышло бы 600.

Режим `standard_safe` (multiplier 1, reservePct 2.2%): `10 000 / 1.022 = 9 784` → **97 акций**.
Запас 2.2% — поправка на правило Webull для market buy, не риск-менеджмент.

### 2.2. Что чиним — вариант C

Проблема — четвёртый кандидат, `net_liquidation_value`. Это стоимость всего счёта: кэш
**плюс рыночная стоимость открытых позиций**.

Когда это спасает: limited margin, деньги после закрытия не отстоялись, `cash_balance = 0`,
но деньги реально есть. Без подстановки мы бы отказались от входа зря.

Когда вредит: на счёте лежит позиция вне нашего журнала. Тогда `net_liq` — деньги, **уже
вложенные**, и вход считается от них повторно:

```
cash = 0, net_liq = 10 000 (всё в позиции), day_buying_power = 8 000
baseCapital = 10 000 → entryFunds = 10 000 → min(10 000, 8 000) = 8 000
```

Покупка на 8 000 при нулевом кэше, за счёт маржи под уже удерживаемую позицию.

**Решение (принято):**

```
baseCapital = cash_balance,     если > 0
            иначе net_liq − Σ(рыночная стоимость открытых позиций)
```

Позиции уже запрашиваются через `Broker.Positions()` — данные под рукой, лишнего вызова нет.
В нормальном случае даёт то же, что `cash_balance`; при чужой позиции корректно её вычитает.
Если результат ≤ 0 — **отказ от входа с явной ошибкой**, без фолбэка на buying power.

Требования к реализации:

* стоимость позиции берётся из полей брокера, а не считается как `qty × текущая котировка`,
  если брокер отдаёт готовое значение;
* если позиции не удалось прочитать — это `UNREACHABLE`-ситуация, а не «считаем, что их нет».
  Отказ от входа, лог, без молчаливого продолжения;
* фолбэк `multiplierBase = buyingPower` (`sizing.go:157`) **удаляется**;
* отдельный тест фиксирует старое поведение как изменённое намеренно (§8).

### 2.3. Для Robinhood

У Robinhood нет `account_currency_assets`. `get_portfolio` даёт свою разбивку и buying power,
`get_equity_positions` — позиции. Адаптер приводит их к той же форме, чтобы работала **та же
самая** `resolveEntryBalanceSizing` — переиспользуем, не дублируем.

Плеча на Agentic-счёте нет («margin borrowing is not yet enabled for Agentic accounts»), поэтому
`buyingPower ≈ baseCapital`, и множители `margin_125…200` там срежутся потолком. В UI
Robinhood-панели это надо подписать честно, а не делать вид, что режим работает.

---

## 3. Проверенные факты о Robinhood

### 3.1. Только официальный путь

Никакого `robin_stocks`, логина/пароля, `device_token`, SMS-challenge. TradeDeck это прямо
запрещает (`docs/mcp/robinhood-capabilities.md`, «Главный принцип»).

Точка входа: `https://agent.robinhood.com/mcp/trading`, транспорт Streamable HTTP.
Проверено живым запросом — на неавторизованный POST приходит:

```
HTTP/2 401
www-authenticate: Bearer resource_metadata="https://agent.robinhood.com/.well-known/oauth-protected-resource/mcp/trading"
access-control-expose-headers: Mcp-Session-Id
```

### 3.2. OAuth-метаданные (живые запросы 2026-09-04)

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

Публичный клиент без секрета, PKCE S256 обязателен, DCR поддержан, единственный scope `internal`.

### 3.3. Ответ token-эндпоинта содержит нестандартные поля

Зафиксировано в `anthropics/claude-code#65895` — реальный ответ:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 344000,
  "refresh_token": "...",
  "scope": "internal",
  "backup_code": "...",
  "mfa_code": "...",
  "user_uuid": "..."
}
```

`backup_code`, `mfa_code`, `user_uuid` — не из стандарта OAuth. **Декодер обязан игнорировать
неизвестные поля.** Именно на этом, по описанию бага, спотыкался клиент Claude Code: HTTP 200,
валидный токен в теле, а сохранялась пустая строка. В Go `json.Unmarshal` в структуру лишние
поля игнорирует по умолчанию — главное не включать `DisallowUnknownFields`.

Запрос — `application/x-www-form-urlencoded`, ответ — JSON. Не перепутать.

### 3.4. Условия Agentic-счёта

* нужен основной individual investing account в хорошем состоянии; до 10 self-directed счетов;
* продукт не beta, waitlist не нужен;
* **открыть счёт и авторизовать агента можно только с десктопа**: «You can only open an agentic
  account and authenticate your agent on a desktop device»;
* агент получает read-доступ ко **всем** счетам, торговать может **только** на Agentic;
* ответственность за сделки агента — на пользователе.

### 3.5. Инструменты MCP

Живой дамп: `/Users/mymac/Work/apps/robinhood/docs/mcp/tools.live.json` (62 инструмента, 2026-08-25).
**Скопировать в `docs/mcp/robinhood-tools.live.json`**, на этапе 2 переснять свежий `tools/list`.

| Tool | required | важное |
|---|---|---|
| `get_accounts` | — | `agentic_allowed` у каждого счёта |
| `get_portfolio` | `account_number` | стоимость по классам + buying power |
| `get_equity_positions` | `account_number` | `cursor` |
| `get_equity_quotes` | `symbols[]` | ≤ 20 символов |
| `get_equity_historicals` | `symbols[]`, `start_time` | ≤ 10 символов |
| `get_equity_tradability` | `account_number`, `symbols[]` | ≤ 10 символов |
| `get_equity_orders` | `account_number` | `state`, `symbol`, `order_id`, `cursor` |
| `review_equity_order` | `account_number`, `symbol`, `side`, `type` | pre-trade alerts |
| `place_equity_order` | те же | `ref_id` — идемпотентность |
| `cancel_equity_order` | `account_number`, `order_id` | — |

Правила ордеров (дословно из описаний в дампе):

* `type`: `market` \| `limit` \| `stop_market` \| `stop_limit`. Нам нужен `market`.
* `time_in_force`: `gfd` \| `gtc`, дефолт `gfd`. Наш `DAY` — это `gfd`.
* `market_hours`: `regular_hours` (дефолт) \| `extended_hours` \| `all_day_hours`.
  Вне основной сессии исполняются только limit; `market` там отклоняется. Мы всегда `regular_hours`.
* Ровно одно из `quantity` / `dollar_amount`.
* `ref_id` — UUID, апстрим дедуплицирует по нему; при ретрае слать **тот же**.
  Прямой аналог `client_order_id` в Webull.
* **Market-on-close не поддерживается** — как и у Webull, шлём market в окне T-1.

Состояния: `new, queued, confirmed, unconfirmed, partially_filled, filled, cancelled, rejected,
failed, voided`. Финальные — последние пять.

### 3.6. Исторические бары

* `start_time` обязателен, RFC3339 UTC (`"2021-09-04T00:00:00Z"`);
* `interval: "day"`, `bounds: "regular"`, `adjustment_type: "split"` — дефолт и правильный
  выбор для бэктеста (сплит-скорректировано, без дивидендов);
* флаг `interpolated` — синтетическая заглушка. **Отбрасывать**, иначе `high == low` и IBS
  делится на ноль;
* **глубина публично не документирована.** Заявленные ~5 лет проверяются эмпирически на этапе 2.

> 🔴 **ДАТЫ.** `CLAUDE.md`, раздел «Даты», и `internal/tradingdate`. MCP отдаёт `begins_at`
> в RFC3339 UTC. Торговая дата — **срез первых 10 символов строки**, не `time.Parse` + `Format`.
> На этапе 2 снять живой ответ и записать время суток для `interval=day, bounds=regular`.
> Тесты обязаны совпадать в `TZ=Pacific/Auckland` и `TZ=America/Los_Angeles`.

---

## 4. Авторизация Robinhood

### 4.1. Флоу копированием ссылки

Listener не поднимаем. Robinhood редиректит на `http://127.0.0.1:53682/callback?code=...&state=...`,
страница не открывается — но вся информация уже в адресной строке.

1. Кнопка **«Получить ссылку»** → `POST /api/autotrade/robinhood/oauth/start`.
2. UI показывает URL в поле только для чтения + кнопка «Копировать» + текст:
   *«Откройте в десктопном браузере, войдите в Robinhood, разрешите доступ. Браузер попробует
   открыть 127.0.0.1 и покажет ошибку — это нормально. Скопируйте адрес из адресной строки
   целиком и вставьте ниже.»*
3. Поле **«Вставьте адрес после разрешения»** + «Подключить» →
   `POST /api/autotrade/robinhood/oauth/complete` с `{"callbackUrl": "..."}`.
4. Сервер парсит URL, сверяет `state`, меняет `code` на токены, стирает pending.

Работает при сервере в докере на удалёнке, публичных роутов не требует.

> `redirect_uri` обязан **побайтово совпадать** с зарегистрированным в DCR и переданным
> в authorize. Фиксированная константа `http://127.0.0.1:53682/callback`, менять нельзя —
> иначе перерегистрация клиента.

### 4.2. Шаги

**Шаг 0, руками, единожды.** Оператор в **десктопном** браузере открывает Agentic Account
и завершает онбординг. Без этого ни у одного счёта не будет `agentic_allowed: true`.

**Шаг 1 — DCR, единожды, сервер:**

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

`client_id` из ответа → `robinhood_oauth.client_id`. Повторно не регистрировать.

> В баг-репорте Cursor у Robinhood был захардкожен allowlist под их **предрегистрированный**
> client_id (`cursor://...`), и loopback отбивался «Mismatching Redirect URI». Это про чужой
> предрегистрированный клиент, не про DCR: TradeDeck через собственную DCR ходит на
> `http://127.0.0.1:<порт>/callback` и работает. Если DCR откажет на loopback — на этапе 2
> попробовать HTTPS-домен; если откажет и он — это блокер, писать отдельно.

**Шаг 2 — authorization URL:** `code_verifier` (32 байта `crypto/rand` → base64url),
`code_challenge = base64url(sha256(verifier))`, `state` одноразовый с TTL 15 минут.

```
https://robinhood.com/oauth
  ?response_type=code&client_id=<id>
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback
  &scope=internal&state=<state>
  &code_challenge=<challenge>&code_challenge_method=S256
  &resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

**Шаг 3 — человек:** копирует ссылку → браузер → «Разрешить» → копирует адрес ошибки → вставляет.

**Шаг 4 — обмен:**

```http
POST https://api.robinhood.com/oauth2/token/
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<code>
&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback
&client_id=<id>&code_verifier=<verifier>
&resource=https%3A%2F%2Fagent.robinhood.com%2Fmcp%2Ftrading
```

Ответ — JSON с лишними полями (§3.3), их игнорируем.

**Шаг 5 — refresh:** за 24 часа до `expires_at` (запас большой, потому что жизнь токена ~4 суток),
плюс принудительно в ежедневном health-джобе. `grant_type=refresh_token&refresh_token=...&client_id=...&scope=internal`.
Новый `refresh_token` в ответе — перезаписать. 400/401 — `NEEDS_REAUTH` (§1.3).
Обёртка вокруг refresh — `sync.Mutex`, чтобы гонка не сожгла токен.

**Шаг 6 — использование:** `Authorization: Bearer`. На 401 — один refresh и повтор;
на второй 401 — `NEEDS_REAUTH`.

---

## 5. Изменения в Go

### 5.1. Схема БД (`internal/store/db.go`)

```sql
ALTER TABLE broker_trades ADD COLUMN broker TEXT NOT NULL DEFAULT 'webull';
CREATE INDEX IF NOT EXISTS idx_broker_trades_broker_status ON broker_trades(broker, status);

ALTER TABLE webull_token ADD COLUMN last_alerted_status TEXT;   -- §1.4

CREATE TABLE IF NOT EXISTS robinhood_oauth (
    id                  TEXT PRIMARY KEY CHECK (id = 'current'),
    client_id           TEXT,
    access_token        TEXT,
    refresh_token       TEXT,
    token_type          TEXT,
    scope               TEXT,
    expires_at          TEXT,
    account_number      TEXT,
    last_check_status   TEXT,
    last_check_at       TEXT,
    last_alerted_status TEXT,
    last_health_check_date       TEXT,
    last_health_check_attempt_at TEXT,
    created_at          TEXT,
    updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS robinhood_oauth_pending (
    state         TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    redirect_uri  TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
```

Дефолт `'webull'` размечает всю существующую историю.
`store.OpenBrokerTrade(trades)` (`internal/live/telegram.go:482`) → принимает `broker`.

> **Секреты.** `refresh_token` — полный доступ к счёту. SQLite в `/data`, права 600.
> В логах — никогда. Готовый механизм редактирования: `redactSecrets`
> (`internal/providers/client.go:120`) — переиспользовать его, а не писать свой.

### 5.2. MCP-клиент

Свой, на `net/http`, ~200 строк, `internal/robinhood/client.go`. Обоснование: `go.mod` не имеет
**ни одной прямой зависимости**, а `internal/webull/client.go` (356 строк) — точно такой же
ручной HTTP-клиент. MCP поверх Streamable HTTP — это JSON-RPC в POST:
`initialize` → запомнить `Mcp-Session-Id` → `notifications/initialized` → `tools/call`.

```
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
Mcp-Session-Id: <из initialize>
```

Ответ приходит либо `application/json`, либо `text/event-stream` (строки `data: {...}`) —
обработать оба. Альтернатива — официальный `github.com/modelcontextprotocol/go-sdk`; рабочая,
но тянет первую прямую зависимость и свой OAuth-слой поверх нашего хранилища. Запасной вариант.

### 5.3. Интерфейс брокера — он уже есть

`internal/live/engine.go:59` объявляет `type Broker interface` с 14 методами, `MemoryBroker`
(`internal/live/transport.go`) его реализует для тестов. **Готовый шов, изобретать нечего.**

Пять методов — не про исполнение, а про Webull как источник данных. Разделить:

```go
// Торговля. Реализуют оба брокера.
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

// Webull-специфика: токены, календарь, сплиты. Robinhood не реализует.
type WebullExtras interface {
    CreateToken() (map[string]any, error)
    CheckToken(token string) (map[string]any, error)
    Calendar() ([]byte, error)
    CalendarDays(start, end string) ([]map[string]any, error)
    RawSplits(symbol string) ([]map[string]any, error)
}
```

Вызовы `e.Broker.CreateToken()` и др. (`autotrade.go:94,123,154`) → type assertion.
Приём уже используется: `PlaceMarketCfg` сделан через опциональный `marketCfgPlacer`
(`autotrade.go:509`).

### 5.4. Engine: один брокер → карта

`internal/live/engine.go:79` — `Broker Broker` → `Brokers map[string]Broker`.
`EnvBrokerDB(db)` (`engine.go:117`) → `EnvBrokersDB(db)`.

`Engine.Execute(trigger)` (`autotrade.go:371`) — главная точка. Разделить:

1. `Evaluate()` считает решение **один раз** — оно общее;
2. `Execute()` идёт циклом по брокерам с
   `enabled && (action == "entry" ? allowNewEntries : allowExits)` **и** статусом здоровья
   не `NEEDS_REAUTH`/`MISSING` (§1.4);
3. каждый брокер в своём блоке с восстановлением после ошибки; падение одного **не отменяет**
   другого; результаты агрегируются в `EvalResult`.

`sizeOrder` (`sizing.go:249`) принимает брокера аргументом и зовёт `Account()` и `Positions()`
**у него** — размер считается от собственного баланса счёта. Кэшировать баланс между брокерами нельзя.

Трекеры (`internal/live/track.go`, `store.ListPendingTrackers`) — **ключ обязан включать
`broker`**, иначе брокеры заблокируют друг друга по одному тикеру.

`Execute` вызывается из T-1 (`internal/live/telegram.go:35,45,53,57`) — **сигнатуру не меняем**,
мультиброкерность прячется внутри. Минимальный диff в самом опасном месте.

### 5.5. Настройки (`internal/store/db.go:649`)

`mergeMaps` уже сливает вложенные карты по ключам, вложенный `brokers` безопасен.

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

Миграция: если `brokers` нет, а плоские `enabled`/`allowNewEntries`/`allowExits` есть — перенести
их в `brokers.webull`. Плоские ключи оставить на чтение ещё релиз.

`PATCH /api/autotrade/config` (`handleAutoConfigPatch`) — **валидировать вложенные поля белым
списком**. Напоминание из аудита, находка 0.6: сейчас патч не валидирует ничего, `{"lowIBS": 5}`
проходит. Не расширять дыру на `brokers`.

Находка 0.10: отсутствующий `allowExits`/`allowNewEntries` трактовать как **false**, не true.

### 5.6. Новые пакеты

**`internal/robinhood/oauth.go`:**
```
RegisterClient() (clientID string, err error)
BuildAuthorizationURL() (url, state string, err error)
CompleteFromCallbackURL(rawURL string) error
AccessToken() (string, error)   // единственная точка выдачи, авто-refresh под мьютексом
Refresh() error
Status() (Status, error)
Revoke() error
```

**`internal/robinhood/client.go`** — MCP (§5.2).

**`internal/live/robinhood_broker.go`** — реализация `Broker`, по образцу `webull_broker.go` (372 строки):

* `accountNumber()` — `get_accounts`, найти `agentic_allowed == true`, закэшировать.
  **Нет такого — ошибка «Agentic Account не подключён»**, а не «взять первый счёт».
* `PlaceMarket(symbol, side, qty)`:
  1. `get_equity_tradability`;
  2. `review_equity_order` — разобрать alerts, при блокирующем отказать;
  3. `place_equity_order{account_number, symbol, side, type:"market",
     quantity: strconv.FormatFloat(qty, 'f', 0, 64), time_in_force:"gfd",
     market_hours:"regular_hours", ref_id: uuid}`.
* `OrderDetail(refID)` — `get_equity_orders`, найти по `ref_id`, вернуть статус + `filled_qty` +
  среднюю цену филла. Маппинг статусов — отдельная чистая функция рядом с
  `internal/live/order_parse.go`, с unit-тестом на все 10 состояний.
* `Account()` / `Positions()` — `get_portfolio` / `get_equity_positions`, привести к форме,
  которую понимает `sizing.go` (§2.3).
* `CancelOrder`, `OpenOrders`, `OrderHistory` — прямые обёртки.

**Целые акции.** `ComputeOrderQuantity` (`sizing.go:177`) уже делает `math.Floor` безусловно,
тумблера дробных нет — он был удалён вместе с `sizingMode`/`orderType`/`timeInForce`.
Адаптер шлёт `quantity` целым числом строкой (`"12"`, не `"12.0"`).
Исключение — выход: `PositionQuantity` (`sizing.go:203`) возвращает **фактическое** количество
без округления, потому что сплит может оставить дробь и `Floor` продал бы 7 из 7.5.

### 5.7. Robinhood как источник данных

* `internal/providers/client.go:178` — `case "robinhood"` в `Historical()`. Заглушку «провайдер
  не поддерживает историю» **не копировать**: это ветка Webull (`client.go:187`).
* `internal/providers/client.go:202` — `case "robinhood"` в `Quote()` рядом с `finnhub`/`webull`:
  `get_equity_quotes` даёт настоящий интрадей, а не синтетику из дневных баров.
* `internal/live/config.go:262` — `"robinhood"` в `realtimeQuoteProviders`. В коде уже стоит
  комментарий, предвосхищающий это: *«Add "robinhood" here once the provider client implements
  a real-time quote»*. Попадание в список означает и участие в `quoteProviderChain` — резервном
  переборе провайдеров при отказе основного.
* Белые списки: `internal/httpapi/server.go:734` (`refreshProvider`, автообновление датасетов)
  и `:1288` — добавить `"robinhood": true`. Плюс поля настроек `enhancerProvider` /
  `resultsRefreshProvider` / `resultsQuoteProvider`.
* **Батчи.** `get_equity_historicals` — до 10 символов, `get_equity_quotes` — до 20.
  Загрузчик режет список на пачки, а не шлёт по одному.
* **Токен может умереть** — в отличие от API-ключа Alpha Vantage. При `NEEDS_REAUTH`
  автообновление через Robinhood не ретраится вслепую, отдаёт понятную ошибку и падает на
  следующий провайдер в цепочке. Предупреждение — через общий механизм §1.4, не своё.
* **Глубина.** Если подтвердится ~5 лет, Robinhood не может быть единственным источником для
  более глубоких датасетов: он обновляет свежий хвост, глубокая история за Alpha Vantage /
  Polygon. Сшивка баров по дате без дублей и дыр — механизм уже есть
  (`internal/httpapi/integrity.go`, `docs/data-quality/`), переиспользовать.

### 5.8. HTTP-роуты (`internal/httpapi/server.go:185-198`)

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
GET  /api/brokers/health                          → §1.4
```

Все под общей авторизацией, публичных исключений нет: код приходит вставкой в форму.
`internal/httpapi/mux_test.go:43-48` — добавить новые пути.

### 5.9. SPA (`go/web/js/app.js`)

* `app.js:10,17,27` — три места навигации: `{ to: '/broker', label: 'Брокер' }` →
  `{ to: '/webull', label: 'Webull' }`, рядом `{ to: '/robinhood', label: 'Robinhood' }`.
* Роутер: `/broker` → редирект на `/webull`, закладки не ломаем.
* Страница Robinhood — те же табы (`overview | positions | orders | deals | autotrade |
  monitoring | trades | logs`) **плюс первый таб «Подключение»** (§4.1). Рендер табов вынести
  в общие хелперы и переиспользовать для обоих брокеров — копировать блок на 250 строк нельзя.
* `app.js:732` и `:2588` — списки провайдеров: `robinhood: 'Robinhood'`.
* Настройки: две панели по три тумблера (`brokers.webull.*`, `brokers.robinhood.*`) плюс строка
  здоровья доступа (§1.4). В панели Robinhood подписать, что множители маржи там не работают.
* Бейдж состояния доступа в шапке обеих брокерских вкладок.

---

## 6. Тесты

Не сломать: `internal/live/correctness_test.go`, `safety_test.go`, `engine_test.go`,
`sizing_test.go`, `webull_broker_test.go`, `internal/httpapi/live_api_test.go`,
`mux_test.go`, `handlers_test.go`.

Новые:

1. `internal/robinhood/oauth_test.go` — `code_challenge == base64url(sha256(verifier))`;
   `state` одноразовый и с TTL; разбор вставленного callback-URL, включая мусор вокруг;
   отказ при чужом `state`; **ответ token-эндпоинта с лишними полями `backup_code`/`mfa_code`/
   `user_uuid` парсится успешно** (§3.3); ротация refresh-токена; `NEEDS_REAUTH` при 400.
2. `internal/live/robinhood_broker_test.go` — на моке `CallTool`: `quantity` целым строкой;
   `gfd` + `regular_hours`; `ref_id` UUID и **тот же при ретрае**; отказ при
   `agentic_allowed != true`; отказ по блокирующему alert из review; маппинг всех 10 статусов.
3. `internal/providers/robinhood_test.go` — `interpolated: true` отбрасывается; дата
   `YYYY-MM-DD`; порядок по возрастанию; батчи по 10.
4. **Сайзинг, вариант C** — `baseCapital = cash`, когда кэш есть;
   `= net_liq − стоимость позиций`, когда кэша нет; отказ при результате ≤ 0;
   **фолбэк на buying power удалён** (тест фиксирует новое поведение как намеренное).
5. **Мультиброкерный T-1** — оба брокера получают одно решение; ошибка одного не мешает другому;
   при `allowNewEntries: false` у Robinhood вход только на Webull; трекеры не мешают друг другу;
   брокер в `NEEDS_REAUTH` исключается, второй торгует.
6. **Здоровье доступа** — переход в `NEEDS_REAUTH` шлёт ровно одно сообщение, повтор через
   3 суток; `UNREACHABLE` не понижает подтверждённый статус; возврат в `OK` шлёт одно сообщение.
7. Таймзоны: `TZ=Pacific/Auckland go test ./...` и `TZ=America/Los_Angeles go test ./...` —
   результаты совпадают. Плюс `go test -race ./...` и `go vet ./...`.

---

## 7. Порядок работ (по коммиту на пункт)

| # | Что | Готово, когда |
|---|---|---|
| 0 | **Закрыть Блок 0 из `docs/audit-go/ROADMAP.md`** | автоторговля на одном брокере безопасна |
| 1 | **Вернуть Telegram-предупреждения о токене Webull** (§1.1) | протухающий токен даёт сообщение за 3 дня |
| 2 | **Сайзинг, вариант C** (§2.2) | тесты §6.4 зелёные, фолбэк на BP удалён |
| 3 | Скопировать `tools.live.json` → `docs/mcp/robinhood-tools.live.json` | файл в репо |
| 4 | Разведка вживую: DCR, `tools/list`, `get_accounts`, `get_equity_historicals` на 10 лет назад; зафиксировать глубину и формат `begins_at` | выводы дописаны сюда |
| 5 | Миграции БД (§5.1) | идемпотентны, история размечена как `webull` |
| 6 | `internal/robinhood/oauth.go` + роуты + таб «Подключение» | оператор вставил URL, статус `OK` |
| 7 | `internal/robinhood/client.go` + `GET /robinhood/tools` + лог с редактированием секретов | `tools/list` отдаёт 62 инструмента, в логе нет токенов |
| 8 | Обобщённый health-джоб на оба брокера + `GET /api/brokers/health` + бейджи (§1.4) | оба статуса видны, предупреждения приходят на переход |
| 9 | Robinhood в `internal/providers` — котировки, история, автообновление (§5.7) | история приходит, `interpolated` отброшены, батчи по 10 |
| 10 | Настройки: `brokers.*` + миграция + валидация патча | старый `settings.json` читается без потерь |
| 11 | SPA: настройки, две панели по три тумблера + здоровье | тумблеры переживают перезагрузку |
| 12 | SPA: `/broker` → `/webull` + редирект + навигация | старая закладка работает |
| 13 | Разделение `Broker` / `WebullExtras`, `Engine.Brokers` — **с одним брокером в карте** | все существующие тесты зелёные без правок |
| 14 | `internal/live/robinhood_broker.go` + `test-buy` на 1 акцию дешёвого тикера | ордер прошёл, дошёл до `filled`, сделка с `broker='robinhood'` |
| 15 | Зеркальный `Execute` по карте брокеров | dry-run T-1 показывает обе строки |
| 16 | Полная страница `/robinhood` | визуальный паритет с Webull |
| 17 | Тесты §6 + TZ + `-race` + `go vet` | всё зелёное |

Пункты 1–2 идут до Robinhood: они чинят то, что уже сейчас работает неправильно, и делать это
надо один раз, пока код не начал считать деньги на двух счетах.
Пункт 13 отдельным коммитом **до** появления Robinhood — рефакторинг проверяется существующими
тестами, а не смешивается с новым брокером.

---

## 8. Чего не делать

* Не использовать `robin_stocks`, `pyrh`, `api.robinhood.com` с логином/паролем, `device_token`,
  `challenge_type`, MFA-кодами. Только официальный MCP.
* Не хардкодить `client_id` — он из DCR и лежит в БД.
* Не включать `DisallowUnknownFields` при разборе ответа token-эндпоинта (§3.3).
* Не логировать `Authorization`, `access_token`, `refresh_token`, `code_verifier`, номера счетов.
* Не менять `redirect_uri` после регистрации.
* Не звать `place_equity_order` на счёте с `agentic_allowed != true`.
* Не превращать торговую дату в `time.Time` ради форматирования. `internal/tradingdate` + срез строки.
* Не трогать `src/` и `server/` — мёртвый React/Node-стек.
* Не менять пороги IBS: вход `ibs < lowIBS`, выход `ibs > highIBS`, строго через `internal/ibs`.
* Не добавлять дробные акции.
* Не понижать подтверждённый статус доступа из-за сетевого сбоя (§1.3).
