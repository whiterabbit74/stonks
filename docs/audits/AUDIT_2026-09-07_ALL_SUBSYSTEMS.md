# Полный аудит всех подсистем mktorder_com — 2026-09-07 (HEAD `83675be`)

Проведён в соответствии с [`ASSIGNMENT_FULL_AUDIT.md`](./ASSIGNMENT_FULL_AUDIT.md) в режиме строгого **read-only** (без правок продуктового кода, без деплоя, без коммитов, без SSH на прод).

---

## 1. Сводка и текущий статус проекта

- **Текущий HEAD:** `83675be` (ветка `main`, опережает `origin/main` на 18 локальных коммитов).
- **Прод на VPS:** работает на образе `stonks-server:368a00b`.
- **Автотесты:**
  - `go test -race ./...` (включая `TZ=Pacific/Auckland` и `TZ=America/Los_Angeles`) — **PASS** по всем 17 пакетам.
  - `go vet ./...` — **0 предупреждений**.
  - `node go/web/js/charts_map_test.cjs` и `node go/web/js/errtext_test.cjs` — **PASS** (20 тестов).
  - `bash -n` по всем shell-скриптам (`deploy.sh`, `health-check.sh`, `backup-from-server.sh`, `cleanup-server.sh`, `test-telegram.sh`) — синтаксис корректен.
- **Статус находок прошлых аудитов:** AUD-001..AUD-051 закрыты в коде на HEAD (последняя пачка AUD-043..AUD-051 закрыта коммитами `da50d49..83675be`).
- **Итог данного полного аудита:** выявлено **10 новых проблем и скрытых рисков** (из них 2 уровня P1, 6 уровня P2, 2 уровня P3).

---

## 2. Вердикты по всем 15 подсистемам

| № | Подсистема | Вердикт | Ключевые замечания / Находки |
|---|---|---|---|
| 1 | **Пороги IBS и паритет live ↔ бэктест ↔ SPA** | **PASS** | Строгие неравенства (`< lowIBS`, `> highIBS`), 0.10 не вход, 0.75 не выход. Паритет проверен в Go и JS. |
| 2 | **Live-движок (monitor, autotrade, sizing, safety)** | **FAIL** | Отмена открытых ордеров перед входом на Robinhood падает из-за передачи `ref_id` вместо `order_id` (AUD-053). Data race на `RobinhoodBroker.account` (AUD-054). Частичный выход сбрасывает флаги `is_test`/`is_hidden` (AUD-055). |
| 3 | **Трекеры заявок, журнал, идемпотентность** | **FAIL** | Идемпотентность и fail-closed при сбое записи трекера работают, но `SplitCloseTrade` в `db.go` теряет флаги `is_test`, `is_hidden` и оставляет рассинхрон `quantity` vs `filled_qty` (AUD-055). |
| 4 | **Брокеры (Webull и Robinhood)** | **FAIL** | Webull: `ResolveInstrumentID` берет первый попавшийся инструмент без сверки тикера (AUD-052). Robinhood: `CancelOrder` передает не тот ID (AUD-053). Data race на кэше аккаунта (AUD-054). |
| 5 | **Планировщик T-11 / T-1 / after-close** | **PASS** | Календарь NYSE, укороченные дни, изоляция T-11 превью от T-1 решений, ожидание завершения тика при остановке (`sync.WaitGroup`). |
| 6 | **Telegram-транспорт мониторинга** | **FAIL** | В `execute_all.go` текст ошибки брокера `res.Error` вставляется в HTML-сообщение без `html.EscapeString` (AUD-057). При ошибках с `<` или `&` Telegram отклоняет запрос (400 Bad Request), и критический алерт оператору не доставляется. |
| 7 | **HTTP API, auth, calc, live handlers** | **PASS (с оговоркой P3)** | Fail-closed auth (503 при пустом пароле), сессии `HttpOnly` / `SameSite=Lax`, CSRF/Origin проверки, буферизация JSON в `writeJSON`. Оговорка: потенциальный `math.Inf` на голых `float64` и отображение `—` вместо `∞` в SPA (AUD-060). |
| 8 | **Vanilla SPA** | **PASS** | Даты только в строковом `YYYY-MM-DD`, никаких `new Date()`. `esc()` экранирует HTML. Локальный vendor `lightweight-charts`. Тесты `charts_map_test.cjs` и `errtext_test.cjs` зелёные. |
| 9 | **Store / SQLite** | **FAIL** | WAL-режим, `foreign_keys=ON`, `busy_timeout=5000`, `SetMaxOpenConns(1)`. Права 0600 на БД и 0700 на каталог. Дефект: `SplitCloseTrade` не сохраняет мета-колонки сделки (AUD-055). |
| 10 | **Даты и календарь NYSE** | **PASS** | Полная изоляция от системной таймзоны сервера через пакет `tradingdate`. Проверено под `TZ=Pacific/Auckland`. |
| 11 | **Бэктест, метрики, плечо, опционы, сплиты** | **PASS** | Формула ликвидации плеча учитывает свободный кэш (AUD-047). Маркировка капитала на следующем открытии исправлена (AUD-051). Защита от деления на 0 и NaN в Блэке-Шоулзе. |
| 12 | **Провайдеры OHLC** | **FAIL** | `robinhoodQuote` при отсутствии данных возвращает HTTP 200 с `price = 0` вместо ошибки 404 (AUD-056). В отличие от Finnhub, Webull и TwelveData, которые строго валидируют `price > 0`. |
| 13 | **Эксплуатация, деплой, контейнеры, секреты** | **FAIL** | `deploy.sh` не перезапускает и не перечитывает Caddy при изменении `Caddyfile` (AUD-059). `backup-from-server.sh` копирует SQLite WAL вживую через `docker cp` без `sqlite3 .backup` (AUD-058). Битые ссылки в документации и скриптах (AUD-061). |
| 14 | **MCP YouTube** | **PASS** | Сервис полностью демонтирован из инфраструктуры. Caddy отдает 404 на `/mcp/transcribe*`. Код чист. |
| 15 | **Наблюдаемость и ложные статусы** | **PASS (с оговоркой P2)** | Доступ к логам структурирован (`http-access.jsonl`, `autotrade_logs`). Оговорка: потеря Telegram-алертов из-за неэкранированного HTML (AUD-057). |

---

## 3. Детальный разбор выявленных дефектов

### [P1] AUD-052 — Webull `ResolveInstrumentID` выбирает неверный инструмент без проверки тикера

- **Где:** [`go/internal/webull/client.go:408-429`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/webull/client.go#L408-L429), вызов в [`go/internal/live/webull_broker.go:66`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/webull_broker.go#L66).
- **Суть проблемы:**
  Функция `ResolveInstrumentID(symbol string)` отправляет запрос к Webull API `/openapi/trade/instrument/list?symbols={symbol}` и выполняет обход строк через `flatten(resp.Data)`. Она берет **первую попавшуюся запись**, содержащую `instrument_id`, не проверяя, совпадает ли `symbol` или `disSymbol` из ответа с запрошенным тикером.
- **Почему это баг и риск денег:**
  Эндпоинт инструментов Webull на запрос `symbols=AAPL` возвращает список всех инструментов, подпадающих под маску, включая деривативы, варранты или привилегированные акции (например, `AAPLW` или смежные тикеры). Если первым в ответе вернется не базовый тикер, `PlaceMarketCfg` отправит рыночный боевой ордер на совершенно другой инструмент.
- **Как воспроизвести / проверить:**
  Замокать ответ Webull `/instrument/list?symbols=AAPL` массивом `[{"symbol":"AAPLW","instrument_id":"9999"},{"symbol":"AAPL","instrument_id":"1111"}]`. Вызов `ResolveInstrumentID("AAPL")` вернет `"9999"` вместо `"1111"`.

---

### [P1] AUD-053 — Robinhood `CancelOrder` передает `ref_id` (UUID клиента) вместо серверного `order_id`

- **Где:** [`go/internal/live/robinhood_broker.go:311-322`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/robinhood_broker.go#L311-L322) и [`go/internal/live/autotrade.go:1408-1422`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/autotrade.go#L1408-L1422).
- **Суть проблемы:**
  Спецификация MCP-инструмента Robinhood `cancel_equity_order` (`docs/mcp/robinhood-tools.live.json:253`) требует параметр `"order_id": "Order UUID from get_equity_orders"` (серверный идентификатор ордера, возвращаемый брокером).
  Однако метод `cancelOpenOrdersBeforeEntry` берет `id := clientOrderIDOf(m)` (клиентский `ref_id` UUID) и вызывает `br.CancelOrder(id)`. В `RobinhoodBroker.CancelOrder` этот клиентский ID напрямую подставляется в `order_id` вызова `cancel_equity_order`.
- **Почему это баг и риск блокировки торговли:**
  Брокер Robinhood не находит ордер по чужому `ref_id` в поле `order_id` и возвращает ошибку (404 / Order not found). В коде `cancelOpenOrdersBeforeEntry`:
  ```go
  if err := br.CancelOrder(id); err != nil {
      return fmt.Errorf("%w: %s (%v)", ErrOpenOrderCancelFailed, sym, err)
  }
  ```
  Ошибка отмены приводит к возврату `ErrOpenOrderCancelFailed`, что полностью **блокирует вход в позицию на Robinhood**.
- **Как воспроизвести / проверить:**
  Вызвать `RobinhoodBroker.CancelOrder(clientUUID)` при наличии открытого ордера. Брокер возвратит ошибку, так как ожидает серверный UUID из ответа `place_equity_order` / `get_equity_orders`.

---

### [P2] AUD-054 — Состояние гонки (Data Race) на `RobinhoodBroker.account`

- **Где:** [`go/internal/live/robinhood_broker.go:21, 341-346, 352-361`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/robinhood_broker.go#L21) и [`go/internal/httpapi/robinhood.go:96`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/httpapi/robinhood.go#L96).
- **Суть проблемы:**
  Поле `RobinhoodBroker.account` представляет собой обычную строку без `sync.Mutex` или атомиков.
  Метод `ResetAccount()` сбрасывает `b.account = ""` при вызове HTTP-эндпоинта `GET /api/autotrade/robinhood/dashboard?refresh=1`. Одновременно с этим фоновый планировщик в цикле `RunTick` вызывает `agenticAccountCtx`, который читает `b.account` и перезаписывает его (`b.account = acct`).
- **Почему это баг:**
  Одновременное несинхронизированное чтение и запись строки в Go — это классический data race, способный приводить к повреждению указателя/длины строки или аварийному завершению процесса под нагрузкой.
- **Как проверить:**
  Запустить тест с флагом `-race`, параллельно вызывая `ResetAccount()` и `agenticAccount()`.

---

### [P2] AUD-055 — `SplitCloseTrade` сбрасывает флаги `is_test` и `is_hidden` и оставляет рассинхрон `filled_qty`

- **Где:** [`go/internal/store/db.go:1590-1616`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/store/db.go#L1590-L1616) и [`go/internal/live/trade_record.go:387`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/trade_record.go#L387).
- **Суть проблемы:**
  При частичном выходе из позиции вызывается `SplitCloseTrade`. Новая закрытая часть сделки создается через:
  ```sql
  INSERT INTO table (id, symbol, status, entry_date, entry_price, entry_ibs, source, quantity, exit_date, exit_price, exit_ibs, pnl_absolute, pnl_percent, holding_days, notes)
  SELECT ...
  ```
  В списке колонок отсутствуют `is_test`, `is_hidden`, `entry_time`, `exit_time`, `lot_id`, `filled_qty`.
- **Почему это баг:**
  1. Если закрываемая сделка была тестовой (`is_test = 1`), то созданная закрытая часть получает значение по умолчанию `is_test = 0` и превращается в **боевую сделку**, искажая всю реальную статистику PnL и винрейта!
  2. Если сделка была скрыта (`is_hidden = 1`), закрытая часть становится видимой (`is_hidden = 0`).
  3. Для оставшейся открытой сделки выполняется `UPDATE table SET quantity=? WHERE id=?`, но поле `filled_qty` не изменяется, что приводит к некорректному соотношению `quantity < filled_qty`.
- **Как воспроизвести / проверить:**
  Создать тестовую сделку с `is_test = 1, quantity = 10, filled_qty = 10`. Вызвать `SplitCloseTrade` на 4 акции. Закрытая строка в БД будет иметь `is_test = 0`.

---

### [P2] AUD-056 — `robinhoodQuote` возвращает `price = 0` со статусом HTTP 200 при отсутствии данных

- **Где:** [`go/internal/providers/robinhood.go:41-65, 110-129`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/providers/robinhood.go#L41-L65).
- **Суть проблемы:**
  В `robinhoodQuote`:
  ```go
  open := robinhoodFloat(q, "open", "open_price")
  cur := robinhoodFloat(q, "last_trade_price", "price", "close")
  return QuotePayload{
      Range:   map[string]any{"open": open, "high": high, "low": low},
      Quote:   map[string]any{"open": open, "high": high, "low": low, "current": cur, "prevClose": prev},
      DateKey: tradingdate.TodayNYSE(time.Now()),
  }, nil
  ```
  Если инструмент не найден или котировка пустая, `cur` и `open` равны `0.0`, но функция возвращает `err == nil`.
  Для сравнения, `finnhubQuote`, `webullQuote` и `twelvePrice` проверяют `if current == 0` и возвращают ошибку `404 Not Found`.
- **Почему это баг:**
  Вызывающая сторона считает ответ успешным и использует котировку `0.0`, что приводит к ложному обрушению цены на графике или делению на ноль при расчете индикаторов.
- **Как проверить:**
  Запросить котировку по несуществующему тикеру через провайдер `robinhood` — эндпоинт отдаст HTTP 200 с ценой 0.

---

### [P2] AUD-057 — Потеря критических Telegram-алертов из-за неэкранированного HTML в ошибках

- **Где:** [`go/internal/live/execute_all.go:264-266`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/execute_all.go#L264-L266) и [`go/internal/live/transport.go:72`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/transport.go#L72).
- **Суть проблемы:**
  В `HTTPTelegram.Send` установлен режим `"parse_mode": "HTML"`.
  При сбое отправки ордера в `execute_all.go` формируется сообщение:
  ```go
  _ = e.Send(e.chat(), fmt.Sprintf(
      "<b>%s: статус отправки неизвестен</b>\n%s • %s • %v шт.\nclientOrderId: %s\nОшибка: %s\nПовтор не отправлен...",
      label, symbol, side, qty, res.ClientOrderID, res.Error))
  ```
  Поле `res.Error` не проходит через `html.EscapeString`.
- **Почему это баг:**
  Ошибки сети, апстрим-прокси или HTTP-ответов часто содержат символы `<`, `>`, `&` (например, `502 Bad Gateway: <html>...` или XML-ответы). Telegram API отклоняет такие сообщения с ошибкой `400 Bad Request: can't parse entities`, в результате чего **оператор не получает критическое уведомление о зависшем или непроверенном ордере**.
- **Как проверить:**
  Сформировать событие с `res.Error = "connection error: <nil> & timeout"`. Вызов `e.Send` упадет с ошибкой парсинга HTML на стороне Telegram.

---

### [P2] AUD-058 — Небезопасное горячее копирование SQLite WAL в `backup-from-server.sh`

- **Где:** [`backup-from-server.sh:28`](file:///Users/mymac/Work/sites/mktorder_com/backup-from-server.sh#L28).
- **Суть проблемы:**
  Скрипт делает прямое копирование файлов через Docker:
  `docker cp stonks-server:/data/db/. "$REMOTE_DIR"/staging/db/`
- **Почему это баг:**
  SQLite работает в режиме WAL (`journal_mode(WAL)`). Прямое копирование файлов `trading.db`, `trading.db-wal` и `trading.db-shm` в момент, когда сервер выполняет запись или чекпоинт, может привести к созданию неконсистентного или поврежденного бэкапа (corrupt database).
  Безопасное горячее резервное копирование SQLite требует использования утилиты `sqlite3 /data/db/trading.db ".backup ..."` либо SQL-команды `VACUUM INTO`.
- **Как проверить:**
  Сверить с официальной документацией SQLite «How To Corrupt An SQLite Database File» (раздел 2.2: Concurrently reading database files while writes are active without SQLite backup API).

---

### [P2] AUD-059 — `deploy.sh` не обновляет и не перезагружает Caddy при изменении конфигурации

- **Где:** [`deploy.sh:126`](file:///Users/mymac/Work/sites/mktorder_com/deploy.sh#L126).
- **Суть проблемы:**
  Команда обновления сервисов на сервере жестко ограничена одним контейнером:
  `docker compose up -d --no-build --force-recreate server`
- **Почему это баг:**
  Если в коммите были изменены `caddy/Caddyfile` или параметры Caddy в `docker-compose.yml`, обычный запуск `./deploy.sh` **не перезапускает и не перезагружает Caddy**. Новые правила маршрутизации, заголовки безопасности или редиректы не вступают в силу до ручного вмешательства на VPS.
- **Как проверить:**
  Внести изменение в `caddy/Caddyfile`, запустить `./deploy.sh` — контейнер Caddy продолжит работать без изменений со старым аптаймом и конфигом.

---

### [P3] AUD-060 — Риск сериализации `math.Inf` на голых `float64` и отображение `—` вместо `∞` в UI

- **Где:** [`go/internal/httpapi/calc.go:130-136, 158, 183-186`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/httpapi/calc.go#L130) и [`go/web/js/app.js:416`](file:///Users/mymac/Work/sites/mktorder_com/go/web/js/app.js#L416).
- **Суть проблемы:**
  1. В структурах `PerformanceMetrics` и `BacktestMetrics` реализован метод `MarshalJSON()`, заменяющий `math.IsInf` и `math.IsNaN` на `nil` (null в JSON). Однако в таких ответах, как `calcSingle`, `calcEMA` и `calcOptionsMulti`, поля `finalValue`, `maxDrawdown` и `deviation` отдаются как сырые `float64` вне структур метрик. В гипотетическом сценарии бесконечности на этих полях `json.NewEncoder` вернет ошибку кодирования (HTTP 500 `encode failed`).
  2. В `go/web/js/app.js:416` функция `fmt(n)` содержит ветку `if (!Number.isFinite(n)) return '∞'`. Но поскольку бэкенд преобразует бесконечность в `null`, фронтенд попадает в `if (n == null) return '—'`, и знак бесконечности пользователю никогда не отображается.
- **Как проверить:**
  Сверить вывод фронтенда при метрике с нулевым убытком — отображается прочерк вместо символа бесконечности.

---

### [P3] AUD-061 — Несуществующий скрипт `auto-update.sh` и устаревшая документация в `.env.example`

- **Где:** [`cleanup-server.sh:146`](file:///Users/mymac/Work/sites/mktorder_com/cleanup-server.sh#L146) и [`.env.example:26-31`](file:///Users/mymac/Work/sites/mktorder_com/.env.example#L26-L31).
- **Суть проблемы:**
  1. В конце работы `cleanup-server.sh` выводится рекомендация: `log_info "3. Настройте автообновление: ./auto-update.sh daemon"`. Однако скрипт `auto-update.sh` отсутствует в репозитории.
  2. В `.env.example` подробно описаны переменные `MCP_BEARER_TOKENS` для контейнера YouTube MCP transcribe, который был ранее удален из проекта.
- **Как проверить:**
  Выполнить поиск `auto-update.sh` по кодовой базе (0 результатов).

---

## 4. Что проверено и признано чистым (False Positives / Not a Bug)

1. **Таймзоны и даты в бэктесте и планировщике:**
   Пакет `tradingdate` оперирует исключительно чистыми строками `YYYY-MM-DD`. Тестирование под `TZ=Pacific/Auckland` подтверждает полное отсутствие дрейфа дат при переходе через полночь.
2. **Fail-Closed аутентификация в HTTP API:**
   При незаданном или пустом `ADMIN_PASSWORD` сервер гарантированно отвечает HTTP 503 на любые запросы.
3. **Защита от CSRF и проверка Origin:**
   Комбинация `SameSite=Lax` для сессионной куки и строгой валидации заголовков `Origin` / `Sec-Fetch-Site` в middleware `checkOrigin` надежно блокирует межсайтовые мутирующие запросы (`POST`, `PUT`, `PATCH`, `DELETE`).
4. **Паритет логики IBS:**
   Строгое соблюдение порогов: `ibs < lowIBS` для входа и `ibs > highIBS` для выхода. Ровно 0.10 или 0.75 сигналами не являются. Паритет между `go/internal/ibs`, бэктестом и графиками на JS полностью сохранен.
5. **Ликвидация при маржинальной торговле:**
   Формула цены маржин-колла в `internal/backtest/margin.go` (`(borrowed - cash) / den`) корректно учитывает свободные денежные средства портфеля, предотвращая ложные ликвидации (AUD-047 подтвержден).

---

## 5. Предлагаемые строки для внесения в `REGISTRY.md`

*(Строки подготовлены для включения в реестр при следующем цикле исправлений)*

```markdown
| AUD-052 | 2026-09-07 | live/webull | client.go:408 | ResolveInstrumentID берет первый инструмент без проверки совпадения тикера | P1 | OPEN |
| AUD-053 | 2026-09-07 | live/rh | robinhood_broker.go:311 | CancelOrder передает ref_id (клиентский UUID) вместо серверного order_id | P1 | OPEN |
| AUD-054 | 2026-09-07 | live/rh | robinhood_broker.go:21 | Data race на RobinhoodBroker.account между ResetAccount() и фоновым движком | P2 | OPEN |
| AUD-055 | 2026-09-07 | store | db.go:1590 | SplitCloseTrade сбрасывает is_test и is_hidden в 0 и оставляет старый filled_qty | P2 | OPEN |
| AUD-056 | 2026-09-07 | providers | robinhood.go:60 | robinhoodQuote возвращает price=0 с 200 OK вместо ошибки 404 при отсутствии котировки | P2 | OPEN |
| AUD-057 | 2026-09-07 | live/telegram | execute_all.go:265 | Неэкранированный res.Error в HTML-сообщении Telegram приводит к 400 Bad Request и потере алерта | P2 | OPEN |
| AUD-058 | 2026-09-07 | ops | backup-from-server.sh:28 | Горячее копирование SQLite WAL через docker cp без sqlite3 .backup или VACUUM INTO | P2 | OPEN |
| AUD-059 | 2026-09-07 | ops | deploy.sh:126 | deploy.sh не перезапускает и не перезагружает Caddy при изменении Caddyfile | P2 | OPEN |
| AUD-060 | 2026-09-07 | api/calc | calc.go:130 | Потенциальный math.Inf на голых float64 и отображение прочерка вместо бесконечности в UI | P3 | OPEN |
| AUD-061 | 2026-09-07 | docs/ops | cleanup-server.sh:146 | Рекомендация несуществующего ./auto-update.sh и устаревшие MCP-секреты в .env.example | P3 | OPEN |
```
