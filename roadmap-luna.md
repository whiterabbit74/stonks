# Roadmap Luna: повторный полный аудит `mktorder.com`

Дата повторного аудита: **2026-09-03**  
Режим: **read-only** (только чтение кода, истории и тестов; production не запускался и не изменялся)  
Аудитный `HEAD` до добавления этого файла: `5271314`  
Эффективное дерево исходников: совпадает с `48a82ba` (`git diff 48a82ba HEAD` пуст)  
Legacy-источник для сравнения: родитель `9fbd4a5^` — прежние Node.js/Express/React файлы  
Текущий стек: Go HTTP-сервис + vanilla JavaScript SPA; React и Express удалены коммитом `9fbd4a5`.

## Короткий вердикт

**RED: автоторговлю включать нельзя.**

В текущем контуре исполнения подтверждены риски, которые могут привести к повторной заявке, неверному связыванию заявки с локальной сделкой, ложной записи исполнения, потере трекера после перезапуска или пропуску обязательной T-1 попытки. Это не косметические расхождения интерфейса: до исправления P0-блокеров нельзя считать торговлю надёжной.

По расчётам не найдено доказанной формульной ошибки только статическим сравнением и текущими golden-тестами. Но полноценного автоматического сравнения Go с реальным legacy-рантаймом нет, поэтому parity (полное совпадение поведения старой и новой системы) не доказан.

По UI в статическом коде найдены основные страницы, вкладки, формы и кнопки; подтверждённой пропажи крупного элемента только по исходникам нет. Runtime-проверка (реальное открытие каждой страницы, сценарии кликов, таблицы, мобильные размеры и ошибки API) не выполнялась, поэтому визуальная и поведенческая эквивалентность пока **AMBER**, а не PASS.

## Как читать приоритеты

- **P0 — стоп-фактор.** Возможна реальная финансовая потеря, повторная заявка, неправильная позиция или потеря контроля над торговлей. До закрытия — только dry-run (симуляция без заявки) и ручная сверка.
- **P1 — высокий риск.** Нарушается контракт со старой системой, данные могут стать неполными или эксплуатационный контур может дать ложный зелёный статус. Закрыть до production-canary (ограниченный безопасный запуск).
- **P2 — средний риск.** Защита, наблюдаемость, производительность или крайние случаи. Закрыть до полноценного rollout; отдельные пункты могут быть приняты с явным решением владельца.

Формулировка «подтверждено» означает, что дефект виден в текущем Go-коде и/или в проверяемом сравнении с legacy. Формулировка «нужно проверить» означает пробел доказательства, а не выдуманную ошибку.

## 1. Границы и достоверность аудита

Проверены:

- полный Go-репозиторий: HTTP API, расчёты, SQLite-хранилище, провайдеры, Webull, scheduler (планировщик), live execution (исполнение заявок), трекеры, Telegram/T-1, деплой и Docker;
- legacy-маршруты и критичные функции из `9fbd4a5^`, включая T-1, актуализацию цен, импорт календаря и выбор тикеров;
- статический inventory страниц и вкладок в `go/INVENTORY.md` и `go/web/js/app.js`;
- текущие unit/integration тесты, golden-файлы (эталонные результаты), race detector (поиск гонок) и `go vet` (статический анализ Go).

Не выполнялись в этой read-only итерации:

- запуск production/VPS, реальные заявки, тестовая покупка, изменение токенов, Telegram или Webull;
- браузерный runtime-проход по всем экранам и сравнение скриншотов с legacy;
- запуск старого Node/React и автоматический cross-language diff (сравнение одного набора входов в двух рантаймах);
- проверка содержимого пользовательского untracked-файла `docs/mcp/robinhood-tools.live.json` — он сохранён как есть и в аудит не включён.

### Проверки, выполненные в этой итерации

Команды запускались из фактического Go-модуля `/Users/mymac/Work/sites/mktorder_com/go`:

| Проверка | Результат |
|---|---|
| `go test -race ./...` | PASS; все пакеты прошли, включая `httpapi`, `live`, `scheduler`, `store`, `webull` |
| `go vet ./...` | PASS |
| `node --check go/web/js/api.js` | PASS |
| `node --check go/web/js/app.js` | PASS |
| `node --check go/web/js/charts.js` | PASS |
| запуск `go test ./...` из корня репозитория | невалидный запуск: в корне нет `go.mod`; повтор из `/go` прошёл |

Зелёные тесты означают, что текущие тестовые сценарии проходят. Они не закрывают проблемы, для которых нет теста: order identity (идентичность заявки), отказоустойчивость после сбоя, production schema (схема существующей БД), runtime UI и реальный legacy diff.

## 2. Подтверждённые P0-блокеры live-торговли

### LIVE-P0-001 — временный `not found` навсегда закрывает трекер

**Где:** `go/internal/live/track.go:232-299`, особенно `pollTracker` и строки `259-261`.

**Факт:** при `ErrOrderNotFound` трекер немедленно финализируется как `expired`. Legacy при ошибке трекера повторно планировал polling (опрос статуса), не превращая первый отказ чтения в терминальное состояние.

**Риск:** Webull может ещё не видеть заявку сразу после submit (отправки). Если первый запрос статуса получает временный 404, локальный трекер исчезает. Реальная позиция может остаться без журнала; после этого следующий цикл может решить, что вход свободен.

**Минимальное исправление:** разделить `definitely_not_found`, `temporarily_unavailable` и `terminal_rejected`; для 404 использовать bounded retry (ограниченный по времени повтор) через order detail/open orders/history, а до окончательной сверки держать entry-block (запрет нового входа). Истечение SLA (контрольного времени) должно создавать operator attention, а не автоматически разрешать новый вход.

**Acceptance:** тесты на 404 → 404 → filled, 404 → rejected и 404 после перезапуска; ни в одном сценарии новая entry-заявка не разрешается до доказанного terminal state или ручной сверки.

### LIVE-P0-002 — ответ брокера не всегда привязан к запрошенному `clientOrderId`

**Где:** `go/internal/live/autotrade.go:580-604`, `go/internal/live/webull_broker.go:241-285`.

**Факт:** `orderLanded` при несовпадении `clientOrderId` всё равно считает ответ подтверждением, если в нём есть любой непустой статус (`orderStatusField`). `LiveBroker.OrderDetail` также возвращает ответ с распознанным статусом без обязательной проверки, что ID ответа равен запрошенному ID; `ErrOrderNotFound` создаётся только при неизвестном статусе и пустом ID.

**Риск:** unrelated order (чужая или другая заявка) может быть принята за свою. Это способно ложно завершить retry, записать чужое исполнение в свою сделку или скрыть необходимость повторной сверки.

**Минимальное исправление:** строгая проверка ID на каждом пути ответа, включая fallback open-orders/history. При отсутствии ID — только `unmatched/unknown`, никогда не `landed/filled`. Дополнительные признаки (account, symbol, side, quantity, временное окно) использовать как защиту, но не как замену уникальному ID.

**Acceptance:** fixtures с правильным ID, другим ID, пустым ID, вложенным ID, конфликтующими ID и malformed JSON; mismatched response не меняет tracker и не создаёт trade record.

### LIVE-P0-003 — журнал может придумать цену/количество и не обновить partial fill

**Где:** `go/internal/live/trade_record.go:90-173`.

**Факты:**

- если брокер не вернул цену, используется локальная quote price;
- если брокер не вернул filled quantity, используется заказанное количество;
- если запись с тем же client ID уже есть, функция выходит без upsert обновления накопленного partial fill;
- broker trade и monitor trade вставляются/обновляются отдельными операциями, ошибки SQL в строках `169-172` игнорируются.

**Риск:** локальный P&L (прибыль/убыток), количество и статус могут не соответствовать фактическому исполнению. Partial fill может навсегда остаться частичным или стать полным без подтверждения. Две таблицы могут разойтись, после чего reconcile (сверка) начнёт работать с ложной картиной.

**Минимальное исправление:** не считать сделку filled без подтверждённых broker fill price и cumulative fill quantity; неизвестные поля переводить в `unconfirmed`, а не заполнять догадкой. Делать idempotent upsert (повторяемое обновление по уникальному ID) с cumulative quantity. Запись broker/monitor/link выполнять транзакцией или через durable outbox (надёжная очередь повторной записи), ошибки не скрывать.

**Acceptance:** тесты на zero/missing price, partial 1→2→full, duplicate poll, restart между двумя таблицами и SQL failure; P&L строится только из broker facts.

### LIVE-P0-004 — ошибка сохранения tracker игнорируется

**Где:** `go/internal/live/autotrade.go:618-628`, `startTracking`.

**Факт:** `SaveOrderTracker` вызывается через `_ =`; даже если SQLite не записал tracker, код запоминает его только в памяти и запускает polling.

**Риск:** после рестарта процесса заявка уже существует у брокера, но локальный tracker потерян. Вторая заявка может быть отправлена, а первая — не отражена в журнале.

**Минимальное исправление:** persistence-first: сначала надёжно сохранить tracker в БД, затем запускать in-memory polling. При ошибке сохранения — не продолжать обычный live flow, фиксировать `execution_unknown`, блокировать entry и выдавать оператору actionable alert (сообщение с конкретным действием).

**Acceptance:** искусственная ошибка `SaveOrderTracker` блокирует дальнейшую entry и сохраняет correlation ID; перезапуск восстанавливает каждый accepted/ambiguous order.

### LIVE-P0-005 — T-1 помечается выполненным до исполнения и отправки отчёта

**Где:** `go/internal/live/telegram.go:211-228`, `ClaimAggregateT1`; legacy: `9fbd4a5^:server/src/services/telegramAggregation.js:811-817`.

**Факт:** Go атомарно claim-ит (захватывает) `t1_sent` до consistency-check, выполнения и Telegram send. В legacy `state.t1Sent` становился true только после успешного `sendTelegramMessage` (`resp.ok`).

**Риск:** crash, сеть или ошибка Telegram после claim оставляет день в `already_sent`; обязательная T-1 попытка и/или отчёт не повторяются. При падении между claim и order flow система теряет единственный торговый шанс, хотя в БД уже стоит признак выполненного T-1.

**Минимальное исправление:** state machine `started → execution_result_saved → report_sent`, lease (аренда с TTL) для зависшего запуска и idempotency key (ключ повторяемости). Не путать «попытка начата», «заявка принята» и «отчёт доставлен». После crash восстановление должно продолжать безопасную стадию, не создавать вторую заявку.

**Acceptance:** matrix crash/failure до execution, после submit, после fill, до/после Telegram; один T-1 execution максимум, но failed notification может повториться; status восстанавливается после restart.

### LIVE-P0-006 — ошибки чтения состояния могут выглядеть как flat

**Где:**

- `go/internal/live/autotrade.go:199-219`: `brokerTrades, _ := ListTrades`;
- `go/internal/live/track.go:409-427`: `awaitFlatAfterExit` игнорирует ошибку `ListTrades`;
- `go/internal/live/monitor.go:18-21`: `Consistency` игнорирует ошибки обеих таблиц;
- `go/internal/live/autotrade.go:707-735`: ошибка `Positions` игнорируется при построении `Account`;
- `go/internal/live/webull_broker.go:210-238`: неожиданный формат positions может стать пустым списком вместо ошибки.

**Риск:** DB outage, schema mismatch или malformed broker response могут превратиться в «нет открытой позиции». Это может разрешить новый entry рядом с реально существующей позицией или преждевременно разрешить re-entry после exit.

**Минимальное исправление:** typed snapshot (снимок с состоянием `ok/unknown/error`) и fail-closed (при неизвестности торговля блокируется). Любая ошибка журнала, позиций или order query должна быть видима вызывающему коду; `[]` допустим только после проверенного успешного ответа с валидной схемой.

**Acceptance:** fault injection для SQLite, broker 500, timeout, 200 с неправильной JSON-формой и частичного ответа; каждый случай блокирует новую заявку и оставляет diagnostic reason.

## 3. Высокие риски логики исполнения и parity

### LIVE-P1-001 — `CanSubmit` проверяет наличие токена, но не готовность брокера

**Где:** `go/internal/live/autotrade.go:172-184`, `TokenHealth`, `go/internal/live/config.go`.

**Факт:** running может стать true при `enabled=true`, `Broker != nil` и `hasToken=true`. Не требуется `NORMAL` token health, подтверждённый account ID, успешный account/positions snapshot, разрешённый конкретный флаг (`allowNewEntries`/`allowExits`) и корректная broker readiness state.

**Риск:** UI и health endpoint могут показывать «работает», когда заявки реально нельзя или опасно отправлять. Один общий running-флаг скрывает различие между entry, exit и monitoring.

**Исправление/приёмка:** ввести отдельный readiness result для `entry`, `exit`, `monitor`, `t1`; любой `UNKNOWN`, expired, PENDING, account/positions error даёт false для submit. Покрыть переходы `MISSING → PENDING → NORMAL → EXPIRED/UNKNOWN` и запрет entry при `allowNewEntries=false`.

### LIVE-P1-002 — held positions учитывают только положительное количество

**Где:** `go/internal/live/autotrade.go:321-344`.

**Факт:** `liveHeldSymbols` добавляет символ только при `q > 0`. Short/negative quantity, zero с malformed payload и нераспознанные типы не формируют блокирующее состояние.

**Риск:** позиция, которую стратегия не умеет безопасно обслуживать, может не попасть в guard и не остановить новую entry.

**Исправление/приёмка:** явно описать поддерживаемое направление; любое ненулевое или неоднозначное количество должно стать `position_unknown` и блокировать entry, если short не поддержан. Добавить тесты long/short/zero/invalid.

### LIVE-P1-003 — test-buy защищён только переменной окружения

**Где:** `go/internal/httpapi/live_handlers.go:182-208`, `go/internal/live/autotrade.go:870-902`.

**Факт:** endpoint разрешается при `WEBULL_ENABLE_LIVE_TEST_BUY=true`; он не требует включённого autotrading, token status `NORMAL`, готового account snapshot или отдельного runtime approval.

**Риск:** ошибочно включённый env-флаг превращает защищённый административный endpoint в прямой buy path при нездоровом состоянии интеграции.

**Исправление/приёмка:** отдельный capability gate (явное право и состояние) + token/account readiness + audit reason; в production по умолчанию disabled. Тест на каждый отказ и на отсутствие фактической заявки при любом отказе.

### LIVE-P1-004 — `Executed` означает submit, а не fill

**Где:** `go/internal/live/autotrade.go:462-501`, особенно строка `469`.

**Факт:** `ev.Executed = res.Submitted`. Поле/API/UI с именем Executed становится true, когда брокер только принял отправку; фактическое исполнение появляется позднее через tracker.

**Риск:** оператор, T-1 отчёт и внешняя автоматизация могут считать позицию открытой/закрытой до fill. Это осложняет retry и создаёт ложное подтверждение торговли.

**Исправление/приёмка:** разделить `decision`, `submitted`, `accepted`, `partially_filled`, `filled`, `rejected`, `unknown`; сохранить backward-compatible поле только с однозначной документацией. UI и Telegram должны показывать фактическую фазу.

### LIVE-P1-005 — ошибка чтения open orders не останавливает новый entry

**Где:** `go/internal/live/autotrade.go:911-951`, `cancelOpenOrdersBeforeEntry`.

**Факт:** `OpenOrders` вызывается один раз; ошибка игнорируется, после чего entry может продолжиться.

**Риск:** существующая заявка системы может быть не замечена и заполниться одновременно с новой.

**Исправление/приёмка:** retry read; при окончательной ошибке — entry blocked. Отмена только собственных заявок сейчас является правильной защитой от чужих manual orders (ручных заявок) и должна сохраниться.

### PARITY-P1-001 — Go молча выбросил legacy universe-настройки

**Где:** `go/internal/live/config.go:88-188`; legacy `getConfiguredSymbols` в `9fbd4a5^:server/src/services/autotrade.js`.

**Факт:** legacy поддерживал `autoTrading.symbols` и `onlyFromTelegramWatches`, включая явный список и пересечение со watches. Go sanitizer удаляет эти поля, а `configuredSymbols` всегда берёт только monitoring watches.

**Риск:** сохранённая старая конфигурация может начать торговать другой вселенной символов или вообще перестать торговать символом без явного migration error. Комментарий в Go объясняет упрощение, но это всё равно поведенческое расхождение.

**Решение:** либо вернуть совместимый режим, либо сделать явную versioned migration: показать пользователю, что поля удалены, записать audit event и потребовать подтверждения новой universe. Молча отбрасывать настройку нельзя.

**Acceptance:** таблица входов legacy config → точно определённый Go result; старые данные либо дают тот же список, либо миграция явно останавливает live до подтверждения.

### PARITY-P1-002 — импорт календаря покрывает 30 дней вместо legacy шести месяцев

**Где:** `go/internal/live/calendar_import.go:12-125`, особенно `start+29`; legacy calendar import в `9fbd4a5^:server/src/routes/calendar.js`.

**Факт:** Go делает один запрос на окно 30 дней и сохраняет `webullCoverageThrough=end`. Legacy импортировал покрытие примерно на шесть месяцев чанками до 29 дней.

**Риск:** будущие holidays/half-days после первого месяца отсутствуют. Планировщик может использовать неверное время закрытия или пропустить торговый/неторговый день.

**Исправление/приёмка:** вернуть chunked import до legacy horizon либо зафиксировать новый горизонт как осознанное изменение. Coverage должен быть проверен на непрерывность, а частичный импорт — не маскироваться как полный.

### PARITY-P1-003 — post-close actualization изменила scope и окно запуска

**Где:** `go/internal/live/actualize.go:72-125`, `go/internal/scheduler/scheduler.go:194-199`; legacy `9fbd4a5^:server/src/services/priceActualization.js:64-79`.

**Факты:**

- Go добавляет все тикеры из `ListTickers` (все datasets), а legacy собирал watches + EMA alerts;
- Go scheduler запускает actualization через 15–31 минут после close, legacy целился в 16–30 минут.

**Риск:** лишние запросы к провайдеру, quota exhaustion (исчерпание лимита), длинный последовательный tick и рост вероятности пропуска узкого торгового окна. Это одновременно parity- и performance-регресс.

**Исправление/приёмка:** сначала восстановить legacy scope или документированно принять новый scope с измеренным бюджетом. Зафиксировать точное окно, timezone и поведение при пропущенном тике; тесты на границах 15/16/30/31.

### PARITY-P1-004 — legacy и Go tracker имеют разную семантику ошибки

Это дополнительное подтверждение `LIVE-P0-001`: legacy reschedule-ил ошибки polling, Go превращает один `ErrOrderNotFound` в `expired`. Исправлять нужно общий state machine, а не добавлять отдельный retry только для одного endpoint.

## 4. Хранилище и целостность данных

### DATA-P1-001 — миграция SQLite не доводит старую production-схему до текущей

**Где:** `go/internal/store/db.go:228-261`.

**Факт:** `migrateSchema` добавляет только `order_trackers.attempts`, `order_trackers.updated_at` и `autotrade_logs.kind`. Legacy production migrations создавали/добавляли trade-поля `source`, `is_hidden`, `is_test`, `broker_order_id`, `client_order_id`, `filled_qty`, `quantity`, `linked_broker_trade_id`, а также EMA/token/broker-related columns. `ensureColumn` игнорирует ошибку `ALTER TABLE`.

**Риск:** новый бинарник на существующей БД может падать на SELECT/INSERT/UPDATE или тихо работать с неполной схемой. Игнор ошибки миграции делает deployment зелёным при фактически несовместимой БД.

**Исправление/приёмка:** versioned migrations в транзакции, список обязательных колонок/индексов/constraints, fail startup при невозможности миграции. Перед production — read-only `PRAGMA table_info/index_list` на копии реальной БД и rehearsal upgrade/rollback.

### DATA-P1-002 — guard исторических рядов слабее legacy integrity pipeline

**Где:** `go/internal/httpapi/integrity.go:8-35` и refresh/save handlers.

**Факт:** текущий `validateBars` проверяет непустой ряд, даты, дубликаты, порядок и `high < low`. Legacy `marketDataIntegrity.js` также нормализовал finite numbers (конечные числа), positive closes, split-like gaps (скачки, похожие на split), known split boundaries, merge validation и alerts. Go refresh может сохранить payload после более слабой проверки и не создаёт equivalent alert pipeline.

**Риск:** split, provider corruption или NaN/невалидные цены могут попасть в dataset и исказить IBS, индикаторы, доходность и таблицы.

**Исправление/приёмка:** единый integrity validator до записи; finite/positive/price relationship/volume bounds, split-aware handling, duplicate and date checks, quarantine (изоляция подозрительного payload), audit alert. Обновление данных и metadata split должны быть атомарными.

### DATA-P1-003 — reconcile может вернуть «applied» после неудачной записи

**Где:** `go/internal/live/monitor.go:190-266`.

**Факт:** `Reconcile` формирует applied actions, а `applyConsistencyAction` игнорирует часть ошибок InsertTrade/raw SQL и продолжает.

**Риск:** UI/оператор видит успешную сверку, хотя monitor/broker projection не исправлена. Следующий live decision основывается на старом состоянии.

**Исправление/приёмка:** action result с `applied/failed/blocked`, транзакция для связанной операции, проверка postcondition и повторяемый operation ID. Никогда не добавлять действие в `appliedActions` без успешного postcondition.

### DATA-P2-001 — GET calendar может иметь побочный write

**Где:** `go/internal/httpapi/server.go:953+` (`handleGetCalendar`) и `SaveCalendar` path.

**Факт:** если календарь отсутствует/нормализуется, GET способен записать default calendar.

**Риск:** read-only запрос меняет состояние и затрудняет аудит, caching и rollback.

**Решение:** убрать write из GET или явно документировать bootstrap как отдельную idempotent mutation. Для audit/read endpoints предпочтителен чистый GET.

## 5. HTTP/API и безопасность

### API-P1-001 — mutation handlers игнорируют malformed JSON и часть DB errors

**Где:** `go/internal/httpapi/server.go:210+` (`readJSON`), `live_handlers.go:25,48,64,98,127,173,191,223`, `server.go:1092-1243,1564-1568`, `calc.go:62,160,191,210,220`.

**Факты:** многие handlers делают `_ = readJSON`; некоторые также игнорируют результат `Patch/Delete/Insert`. `readJSON` ограничивает тело 5 MB, но декодирует только один JSON value и не проверяет trailing bytes/второй value.

**Риск:** malformed body может превратиться в нулевые значения и получить HTTP 200; mutation может не сохраниться, но UI считает её успешной. Для broker/trade/autotrade это особенно опасно.

**Исправление/приёмка:** общий decoder: размер, ровно один JSON value, EOF после него, отказ от неизвестных критичных полей; каждый mutation обязан проверять decode и DB error. Контрактные тесты на `{}`, `{} garbage`, два JSON объекта, пустое тело, wrong types и DB failure.

### API-P1-002 — `/api/status` — liveness, но выдаётся как readiness

**Где:** `go/internal/httpapi/server.go:282-291`, Docker healthcheck и `health-check.sh`.

**Факт:** endpoint всегда пишет `status: ok`, `connected: true`; `Counts()` errors игнорируются. Docker/Caddy проверяют этот публичный 200 endpoint и не проверяют auth configuration, schema, scheduler, data integrity, broker/token readiness.

**Риск:** контейнер может быть «healthy», когда приложение не готово к обслуживанию или торговле. Deploy завершится зелёным при ложной готовности.

**Исправление/приёмка:** разделить `/healthz` (процесс жив) и `/readyz` (БД/миграции/необходимые зависимости), отдельный protected trading readiness. Возвращать non-2xx при broken DB/schema и не смешивать liveness с permission to trade.

### SEC-P1-001 — CSRF boundary пропускает mutation без Origin

**Где:** `go/internal/httpapi/ratelimit.go:144-160`.

**Факт:** для state-changing `/api` запросов неправильный Origin блокируется, но отсутствующий Origin пропускается. Cookie-authenticated mutation (изменение сессией в cookie) не требует CSRF token.

**Риск:** клиент/нестандартный браузер, который не отправляет Origin, обходит текущую проверку. Это не надо считать полноценной CSRF-защитой.

**Исправление/приёмка:** reject missing Origin/Referer для cookie mutation либо добавить synchronizer CSRF token; Bearer/test-auth paths разделить. Покрыть браузерные и API-клиенты.

### SEC-P1-002 — `TRUST_PROXY` и X-Forwarded-For зависят от ручной конфигурации

**Где:** `go/internal/httpapi/ratelimit.go:62-91`, `docker-compose.yml:11-18`.

**Факт:** любое значение `TRUST_PROXY`, кроме false-like, включает доверие к rightmost XFF. Это корректно только если единственный trusted proxy действительно переписывает/добавляет XFF так, как предполагает код.

**Риск:** при прямом доступе или изменении reverse-proxy клиент сможет подделывать IP и обходить rate limit (лимит запросов) / login limiter, либо все пользователи окажутся одним bucket.

**Исправление/приёмка:** доверять только известным proxy CIDR/peer, валидировать цепочку, убрать boolean-only switch; интеграционный тест через реальный Caddy topology и direct exposure.

### SEC-P2-001 — проверка web path использует небезопасный prefix comparison

**Где:** `go/internal/httpapi/server.go:1593-1600`.

**Факт:** containment проверяется `strings.HasPrefix(full, s.WebDir)`, а не `filepath.Rel`/границей каталога.

**Риск:** при специально подобранных путях с общим prefix (например, sibling directory) защита от выхода из web root может быть хрупкой. Нужен regression test, чтобы подтвердить exploitability для всех OS/path forms.

**Исправление/приёмка:** `filepath.Abs` + `filepath.Rel`, reject `..` и outside root; тесты URL-encoded traversal, symlink policy и sibling-prefix.

### SEC-P2-002 — rate limiter растёт в памяти до большого числа IP buckets

**Где:** `go/internal/httpapi/ratelimit.go:27-59`.

**Факт:** cleanup запускается только когда `len(buckets) > 20000`; до этого bucket сохраняется на каждый новый ключ.

**Риск:** множество поддельных IP/прокси-ключей увеличивает память и lock contention. Это availability (доступность) риск, не bypass только одной проверки.

**Исправление/приёмка:** bounded LRU/TTL cleanup на каждом N запросе, верхний предел и метрики eviction; нагрузочный тест с большим числом ключей.

### SEC-P2-003 — custom HTTP clients допускают неограниченные timeout/body

**Где:** `go/internal/webull/client.go:145-155`, `go/internal/providers/client.go` (`get`), injected `http.Client` paths.

**Факт:** default timeout не задаётся для уже переданного `&http.Client{}`; response читается через `io.ReadAll` без отдельного лимита размера.

**Риск:** зависший provider request удерживает scheduler/worker; большой ответ расходует память и может сорвать торговое окно.

**Исправление/приёмка:** context deadline на каждый внешний вызов, transport-level timeout, `io.LimitReader`, лимит по endpoint и typed timeout. Тест на slow body и oversized body.

### SEC-P1-004 — malformed Finnhub arrays могут вызвать panic

**Где:** `go/internal/providers/client.go:349-355`.

**Факт:** после получения `t,o,h,l,c,v` код индексирует все массивы по длине `ts` без проверки равенства длин.

**Риск:** повреждённый или изменившийся ответ провайдера вызывает panic/срыв текущего scheduler tick. Recovery предотвращает падение всего процесса, но не предотвращает пропуск работы и не даёт корректные данные.

**Исправление/приёмка:** validate lengths, finite numbers, status and ordering before indexing; provider response becomes typed error and dataset remains unchanged.

## 6. Расчёты и backtest parity

### CALC-P1-001 — нет запускаемого differential harness Go ↔ legacy

**Что есть сейчас:** `go/internal/backtest` и `go/testdata/goldens` покрывают ряд сценариев (single, buy-at-close, no-stop-loss, options, BAC4, EMA, margin, IBS/metrics) и текущие тесты проходят.

**Чего нет:** автоматического запуска того же fixture через legacy Node и Go с одинаковыми входными OHLC, calendar, splits, timezone, provider snapshot и settings, с нормализацией JSON и числовой tolerance.

**Риск:** golden-файл подтверждает соответствие ожидаемому файлу, но не доказывает соответствие старой реализации. Ошибка может быть одинаково закреплена в новом golden.

**Roadmap:**

1. извлечь из legacy deterministic fixtures и зафиксировать hash входных рядов;
2. написать один runner, который выдаёт JSON по каждому endpoint/strategy в обоих рантаймах;
3. сравнивать trades, dates, entry/exit, IBS, P&L, holding days, options metrics, margin sizing и error cases;
4. задавать явную tolerance только там, где отличается floating-point representation (представление дробей), а не скрывать расхождение округлением;
5. сохранить mismatch corpus как regression tests.

**Acceptance:** ноль unexplained mismatches (необъяснённых расхождений) на полном corpus; каждое намеренное изменение имеет migration note и отдельный expected output.

### CALC-P1-002 — malformed calc requests превращаются в default/zero request

**Где:** `go/internal/httpapi/calc.go:62,160,191,210,220`.

**Факт:** несколько calculator handlers игнорируют `readJSON`; часть полей имеет zero-value. Ошибочный JSON может получить обычный расчёт/HTTP 200 вместо 400.

**Риск:** пользователь получает правдоподобный, но рассчитанный не по введённым данным результат; это особенно опасно для leverage, initial capital, options и margin.

**Исправление/приёмка:** общий strict decoder и обязательная валидация request schema; явно отличать omitted от explicit zero, если zero допустим. Негативные API tests обязательны для каждой стратегии.

### CALC-VERIFY-001 — специальные края требуют доказательства, но дефект не утверждается без diff

Нужно отдельно прогнать legacy/Go corpus для:

- timezone/NYSE day boundaries, holidays, short sessions и holding-cap;
- split-like gaps и adjusted/unadjusted close;
- IBS на равных high/low, missing/invalid quote и strict `< lowIBS`/`> highIBS` порогах;
- buy-at-close, no-stop-loss, BAC4 и same-day re-entry;
- EMA crossing/index, options expiry/assignment и margin buying power;
- quantity/P&L/rounding и explicit zero values.

Старые пункты о «неверном EMA index» и отдельных options-copy ошибках в этот roadmap не перенесены как подтверждённые: текущий код содержит соответствующие fixes, а без differential run это было бы недоказанным утверждением.

## 7. UI и функциональная эквивалентность

### UI-STATIC — что подтверждено по исходникам

В `go/INVENTORY.md` и `go/web/js/app.js` есть следующие основные маршруты:

| Раздел | Текущие страницы/вкладки |
|---|---|
| Data | `/data`, `/enhance`, `/results → /stocks` |
| Stocks | `price`, `tickerCharts`, `equity`, `exposure`, `drawdown`, `trades`, `profit`, `duration`, `monthlyContribution`, `splits`, `buyhold`, `openDayDrawdown`, `buyAtClose`, `buyAtClose4`, `noStopLoss`, `options` |
| Tools | `/ema`, `/multi-ticker-options`, `/calendar`, `/split` |
| Monitoring | `/watches` с summary/trades/watches/ema |
| Broker | `/broker` с overview/positions/orders/fills/journal/autotrade/monitor/logs |
| Settings | general/api/telegram/interface/autotrade |

Статически присутствуют формы/действия для datasets, enhancement, calculations, EMA, options, calendar, splits, watches, broker, settings и autotrade/test-buy. Поэтому «кнопка отсутствует» или «таблица заменена» нельзя честно подтвердить только grep-ом.

### UI-P1-001 — runtime UI parity не доказана

**Что нужно сделать:** построить route/tab matrix и пройти её на desktop 1440px, tablet и mobile viewport:

| Для каждого route/tab проверить | Доказательство |
|---|---|
| наличие/отсутствие блока, кнопки, формы и таблицы | DOM snapshot + screenshot |
| default state, empty state, loading state, API 4xx/5xx и retry | captured network response + screenshot |
| enabled/disabled/hidden action по settings/permissions | state matrix |
| sort/filter/pagination/export/import и submit result | сценарий клика + response |
| responsive layout, overflow, sticky headers и touch targets | 3 viewport screenshots |
| back/refresh/direct URL и сохранение selected dataset/tab | browser trace |

Сравнивать нужно с теми же legacy fixtures, а не с памятью о дизайне. Каждое расхождение заносить отдельным `UI-P1-*` item с URL, viewport, expected/actual и screenshot path.

### UI-P1-002 — auth bootstrap fail-open в frontend

**Где:** `go/web/js/app.js:4830-4845`.

**Факт:** ошибка auth check, отличная от 401 (например, network/500/503), выставляет `state.user=true` и запускает protected UI. Backend затем может всё равно вернуть 503, но интерфейс уже выглядит авторизованным.

**Риск:** оператор принимает состояние UI за доступность сервиса; при проблеме auth часть действий/данных выглядит как пустая ошибка вместо явного locked/unavailable.

**Исправление/приёмка:** только подтверждённый 200 с валидным user считается authenticated; network/5xx — `auth_unknown` с retry/lock screen. Сценарии expired session, auth service down и backend 503.

### UI-P2-001 — swallowed API errors создают пустые, но правдоподобные экраны

**Где:** `app.js` загрузка datasets/settings/status и соответствующие Go handlers, которые возвращают пустые списки при скрытой ошибке.

**Риск:** «нет таблицы/нет блока» может быть не parity-дефектом, а скрытой ошибкой данных. Пользователь не отличает empty от unavailable.

**Исправление/приёмка:** typed UI states `loading/empty/error/stale`; error banner с request ID; не заменять 500 пустым массивом. В route matrix обязателен backend failure case.

## 8. Scheduler, performance и надёжность

### PERF-P1-001 — последовательный scheduler может превысить торговое окно

**Где:** `go/internal/scheduler/scheduler.go:136-199`, `go/internal/live/actualize.go:121+`, `ResumeTrackers`.

**Факты:** scheduler выполняет tracker polling, token health, aggregation и actualization последовательно; actualization делает задержку около 15 секунд + jitter между символами; current scope включает все dataset tickers.

**Риск:** при нескольких тикерах один tick становится длиннее границ T-1/T-0 или следующего scheduler interval. Нет отдельного deadline/бюджета для критичного order path.

**Исправление/приёмка:** измерить p50/p95/p99 длительность по job; отделить critical T-1 execution от post-close actualization, добавить context deadlines, backpressure и missed-window alert. Не распараллеливать blind: provider rate limit и order idempotency должны быть определены заранее.

### PERF-P2-001 — HTTP server/provider limits должны быть единым контрактом

Сейчас body limit есть только на входящем JSON API (5 MB), а внешние provider response и некоторые HTTP clients не имеют такого же bounded contract. Унифицировать timeout, response limit, retry budget и cancellation; добавить нагрузочные тесты для slow provider, 100+ tickers, concurrent UI requests и restart.

### REL-P1-001 — recovery только пишет лог и может пропустить работу

`RunTick` имеет recover, что защищает процесс от падения, но после panic текущий tick прекращён. Для торговли этого недостаточно: нужен durable job outcome, alert и следующий безопасный retry, а не просто log line.

## 9. Deployment и operations

### OPS-P1-001 — deploy script меняет внешний Git и разрушает remote working tree

**Где:** `deploy.sh:14-33,66-75`.

**Факт:** script сам делает `git push origin main`, а на VPS — `git reset --hard origin/main`.

**Риск:** deploy неожиданно меняет remote history/ветку и удаляет remote uncommitted changes. Это не read-only и не безопасная граница release.

**Исправление/приёмка:** push — отдельный явный CI/developer action; deploy принимает immutable commit/image digest (неизменяемый идентификатор образа), проверяет его на сервере и никогда не hard-reset-ит рабочие изменения без отдельного подтверждённого backup/abort flow.

### OPS-P1-002 — dirty-tree guard не видит untracked-файлы, backup не включает datasets

**Где:** `deploy.sh:14-18,82-107`; `backup-from-server.sh:17-29`.

**Факты:** `git diff-index --quiet` не обнаруживает untracked file; deploy backup копирует только db+state, хотя отдельный backup script копирует db+datasets+state.

**Риск:** релиз может пройти с незамеченными локальными артефактами, а rollback потеряет datasets или будет неполным. Текущий `docs/mcp/robinhood-tools.live.json` — конкретный пример untracked-файла, который должен быть явно виден release guard.

**Исправление/приёмка:** `git status --porcelain` должен быть empty по release policy; перед deploy создавать и проверять backup db+datasets+state, manifest/size/hash; restore rehearsal на отдельной копии.

### OPS-P1-003 — container health проверяет только liveness

**Где:** `docker/go.runtime.Dockerfile`, `docker-compose.yml:35-39`, `health-check.sh`, Caddy `depends_on`.

**Факт:** healthcheck вызывает публичный `/api/status`, который сейчас отвечает 200 даже при проблемах Counts; Caddy ждёт только порядок старта, не readiness.

**Исправление/приёмка:** health endpoints из `API-P1-002`, `depends_on: condition: service_healthy` где применимо, smoke test через публичный домен, authenticated readiness, rollback при любом failed gate. Отдельно сохранить хорошие текущие меры: runtime image non-root, server bind на loopback, MCP read-only/cap-drop/no-new-privileges.

### OPS-P2-001 — observability не различает неизвестное, неуспешное и принятое

Нужны correlation ID, broker request/order IDs, attempt number, phase, typed error, DB write result и alert severity в одной схеме. Raw provider payload нельзя писать без redaction (удаления токенов/секретов), но без безопасного diagnostic context расследование ambiguous order занимает слишком много времени.

## 10. Что уже проверено и не считается открытым дефектом

Это не заменяет release gates, но не следует повторно заносить следующие старые находки без новых доказательств:

- основные HTTP paths/methods текущего Go API совпадают с legacy route inventory; отсутствующий крупный endpoint не подтверждён;
- live quote path блокирует сигнал при недоступной realtime quote; старый риск «торговать вчерашним daily bar как live» для текущего `evalWatch` не подтверждён;
- текущий `handleGetDataset` только обнаруживает split hints и не записывает догаданный split прямо из GET; старый GET-mutation finding закрыт;
- отмена open orders ограничена заявками, созданными этим engine; это более безопасная защита чужих manual orders и её не нужно заменять отменой всех заявок;
- production auth при пустом `ADMIN_PASSWORD` fail-closed (возвращает unavailable), а cookie имеет HttpOnly/SameSite и Secure в production;
- Caddy содержит security headers/CSP, body cap и HTTPS-настройки; это не отменяет CSRF/proxy/readiness gaps выше;
- scheduler/tracker recover предотвращает падение процесса; он не закрывает необходимость durable retry/alert после panic;
- текущие IBS/metrics/date tests и goldens проходят; это проверка текущего контракта, не доказательство полного legacy parity.

## 11. Пошаговый roadmap до зелёного релиза

### Phase 0 — freeze и безопасная инвентаризация

1. Оставить autotrading выключенным; запретить `test-buy` в production.
2. На read-only копии production БД снять `PRAGMA table_info`, индексы, pending trackers, open broker/monitor trades и token health.
3. Сделать проверяемый backup **db + datasets + state**, записать hash/size/creation time и выполнить restore rehearsal.
4. Сверить у брокера все open orders/positions с локальными таблицами; ambiguous cases не исправлять автоматически.
5. Ввести один incident/runbook документ с owner, stop-trading procedure и правилами ручной сверки.

**Gate 0:** известны все незакрытые позиции и заявки; backup восстановим; нет автоматического пути, который при неизвестности создаёт новый entry.

### Phase 1 — order state machine и durable execution

Закрыть `LIVE-P0-001…006`, затем `LIVE-P1-001…005`:

- strict order identity и immutable correlation;
- persistence-first tracker, versioned state, retries с bounded deadline;
- confirmed fill facts и cumulative partial-fill upsert;
- atomic broker/monitor projection или durable outbox;
- fail-closed snapshots для DB/positions/open orders;
- T-1 lease/state machine, отделённые submit/fill/report phases;
- explicit entry/exit readiness и test-buy capability gate.

**Gate 1:** fault-injection suite проходит; после каждого crash point система либо безопасно продолжает один order flow, либо блокирует торговлю и требует оператора. Ни одного duplicate order, phantom fill или lost tracker.

### Phase 2 — legacy parity для live decisions

Закрыть `PARITY-P1-001…004`:

- versioned migration legacy autotrade config;
- calendar horizon/chunking и coverage validation;
- exact actualization symbols/window;
- scheduler deadlines, missed-window semantics и timezone tests;
- документировать каждое намеренное изменение legacy behavior.

**Gate 2:** таблица decision parity на одном наборе clocks/quotes/settings даёт одинаковые action/reason/symbol/thresholds; расхождения либо исправлены, либо явно подписаны как approved change.

### Phase 3 — schema, data, API contracts

Закрыть `DATA-P1-*`, `API-P1-*`, `SEC-P1-004` и связанные P2:

- versioned migrations на копии реальной БД;
- full integrity validator/quarantine;
- strict JSON decoder и обязательная обработка всех mutation/DB errors;
- `/healthz` versus `/readyz` versus trading readiness;
- provider shape/timeout/body validation;
- typed reconcile results и postconditions.

**Gate 3:** malformed input никогда не мутирует данные и не возвращает ложный 200; broken DB/provider даёт typed non-2xx или blocked state; dataset rollback проверен.

### Phase 4 — differential calculations

Закрыть `CALC-P1-001`, `CALC-P1-002`, `CALC-VERIFY-001`:

- legacy/Go runner и fixture hashes;
- full strategy/edge-case corpus;
- exact JSON schema and numeric tolerance policy;
- regression corpus for every discovered mismatch.

**Gate 4:** zero unexplained output mismatch, включая ошибки и empty/zero inputs; golden обновляется только вместе с зафиксированным объяснением изменения.

### Phase 5 — UI/runtime parity

Закрыть `UI-P1-001`, `UI-P1-002`, `UI-P2-001`:

- route/tab/control matrix из текущего inventory и legacy;
- desktop/tablet/mobile screenshots и DOM/network traces;
- loading/empty/error/permission states;
- table columns, sorting, export/import, forms, disabled buttons и direct links;
- исправить frontend auth fail-open и swallowed errors.

**Gate 5:** каждый expected control имеет actual evidence; нет необъяснённой missing/extra UI surface; 4xx/5xx не превращаются в пустой успешный экран.

### Phase 6 — security, performance, deploy

Закрыть `SEC-*`, `PERF-*`, `OPS-*`, `REL-*`:

- CSRF token/missing-Origin policy и trusted proxy boundary;
- path containment, bounded rate limiter, provider deadlines/response caps;
- p95/p99 measurements для scheduler, quote, actualization и critical T-1 path;
- deploy без implicit push/hard reset, clean-tree policy с untracked, immutable image;
- full backup/restore and readiness smoke tests;
- alerting на tracker unknown, token expiry, scheduler panic, skipped T-1 и schema mismatch.

**Gate 6:** staged canary на sandbox/paper account; затем минимальный production canary только после ручного sign-off, без auto scale-up. Для live допускается только подтверждённый order/position reconciliation.

## 12. Финальные release gates

Live можно считать готовым только если одновременно выполнены все условия:

- P0 findings: **0 открытых**;
- P1 findings: **0 без owner/approved exception**;
- differential calculations: PASS на полном corpus;
- UI matrix: PASS на трёх viewport-классах и error states;
- `go test -race ./...`, `go vet ./...`, provider/API fault tests: PASS;
- production schema migration и restore rehearsal: PASS;
- health/readiness не дают зелёный статус при broken DB/token/scheduler;
- order tracker после restart восстанавливается, mismatched/unknown broker response блокирует entry;
- T-1 failure можно безопасно повторить, но duplicate execution невозможно;
- backup, alerting, rollback и stop-trading runbook проверены человеком;
- после canary получены реальные broker position/order records и они совпали с локальным журналом.

## 13. Ledger Luna Medium-агентов

Было запущено **28 специализированных Luna Medium** сессий по live execution, config, store, math, indicators, API, HTTP security, UI, performance, deploy и whole-repo направлениям.

Важно: агенты нарушили read-only isolation — начали создавать файлы и коммиты. Поэтому их тексты и находки **не приняты как доказательства**; ниже только журнал для контроля статусов. Все пункты roadmap выше перепроверены мной по текущему `HEAD`, legacy-истории и тестам.

| Агент | ID | Статус |
|---|---:|---|
| `luna-live-execution` | `64190` | stopped/invalidated, exit 130, report rejected |
| `luna-live-config` | `21118` | stopped/invalidated, exit 130, report rejected |
| `luna-http-security` | `69523` | stopped/invalidated, exit 130, report rejected |
| `luna-store-integrity` | `21600` | stopped/invalidated, exit 130, report rejected |
| `luna-backtest-parity` | `66348` | stopped/invalidated, exit 130, report rejected |
| `luna-options-margin` | `64867` | stopped/invalidated, exit 130, report rejected |
| `luna-indicators-strategies` | `78447` | stopped/invalidated, exit 130, report rejected |
| `luna-api-contract` | `65204` | stopped/invalidated, exit 130, report rejected |
| `luna-ui-parity` | `48096` | stopped/invalidated, exit 130, report rejected |
| `luna-go-ui-static` | `66498` | stopped/invalidated, exit 130, report rejected |
| `luna-ui-runtime` | `31996` | stopped/invalidated, exit 130, report rejected |
| `luna-performance` | `44623` | stopped/invalidated, exit 130, report rejected |
| `luna-deploy-ops` | `58082` | stopped/invalidated, exit 130, report rejected |
| `luna-tests-quality` | `64097` | stopped/invalidated, exit 130, report rejected |
| `luna-time-finance` | `78839` | stopped/invalidated, exit 130, report rejected |
| `luna-whole-repo` | `2732` | stopped/invalidated, exit 130, report rejected |
| `luna-live-execution-rerun` | `54087` | stopped/invalidated, exit 130, report rejected |
| `luna-live-config-risk-rerun` | `62438` | stopped/invalidated, exit 130, report rejected |
| `luna-store-integrity-rerun` | `27672` | stopped/invalidated, exit 130, report rejected |
| `luna-math-parity-rerun` | `55444` | stopped/invalidated, exit 130, report rejected |
| `luna-indicators-strategies-rerun` | `56563` | stopped/invalidated, exit 130, report rejected |
| `luna-api-contract-rerun` | `17162` | stopped/invalidated, exit 130, report rejected |
| `luna-http-security-rerun` | `33039` | stopped/invalidated, exit 130, report rejected |
| `luna-ui-static-parity-rerun` | `35734` | stopped/invalidated, exit 130, report rejected |
| `luna-ui-js-behavior-rerun` | `32673` | stopped/invalidated, exit 130, report rejected |
| `luna-performance-concurrency-rerun` | `74928` | stopped/invalidated, exit 130, report rejected |
| `luna-deploy-ops-rerun` | `34624` | stopped/invalidated, exit 130, report rejected |
| `luna-whole-repo-rerun` | `42313` | stopped/invalidated, exit 130, report rejected |

Отдельно был завершён зависший ACP process `62005`; сейчас активных `agentclientprotocol`/`codex-acp`/`luna` процессов нет.

Агентские изменения были убраны из рабочего дерева и сохранены отдельно в `/tmp/mktorder-luna-agent-artifacts-20260903-rerun3/` для аварийного восстановления. Агентский commit `bce9625` был отменён `9c15055`, последующий агентский commit `05f318b` — `5271314`. Пользовательский `docs/mcp/robinhood-tools.live.json` не удалялся и не включался в cleanup.

## 14. Правило обновления этого roadmap

Каждый найденный дефект добавлять с ID, severity, точным path/function, expected/actual, risk, owner и acceptance test. Если проблема найдена в одном общем helper-е (например, order identity, JSON decoder, broker read), искать все callers и обновлять один общий пункт, а не закрывать только первое место. Пункт переводить в `closed` только после кода, теста и evidence соответствующего release gate.
