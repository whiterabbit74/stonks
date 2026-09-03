# Roadmap полного аудита Go-версии mktorder.com

Дата аудита: 2026-09-03  
Проверяемый HEAD: ae5ebafe7f011d10b4372a7e42b58a230df4a77d  
Объект сравнения: старый React + Node/Express против нового Go API + vanilla JS SPA.  
Режим: read-only. Исходный код, базы, внешние сервисы и торговые счета не изменялись.

## Итоговый вердикт

Переписывание пока нельзя принимать как эквивалентную и безопасную замену старого стека, а автоторговлю нельзя включать в боевом режиме. Есть несколько P0-рисков, которые могут привести к реальному ордеру не того размера, к фантомной позиции, к неверному P&L или к остановке торгового процесса:

1. В production compose включён live test BUY: docker-compose.yml:12-15 задаёт WEBULL_ENABLE_LIVE_TEST_BUY=true.
2. Go создаёт сделку сразу после submit, а не после подтверждённого broker fill: go/internal/live/autotrade.go:340-368.
3. Цена и количество входа берутся из котировки решения, а не из фактического исполнения.
4. После выхода Go не записывает цену выхода, P&L и длительность.
5. При недоступной live-котировке Go считает сигнал по последнему дневному бару и разрешает действие: go/internal/live/telegram.go:378-414.
6. Статус исполнения извлекается поиском подстроки FILLED в сыром JSON и может принять частичное или вообще не то исполнение за полное.
7. Пороговые значения и разрешения на вход/выход имеют опасные значения при отсутствующих ключах; произвольный PATCH конфигурации не валидируется.
8. В UI/API потеряны критичные операторские возможности: применение сплитов, редактирование брокерской сделки, пагинация и экспорт журнала, диагностика raw JSON.
9. Go API потерял ограничения тела запроса, rate limiting и часть защитных HTTP-заголовков.
10. Схема БД создаётся через CREATE TABLE IF NOT EXISTS без версии миграций, поэтому существующая Node-БД не имеет безопасного upgrade-контракта.

До закрытия P0/P1 из разделов A и S боевой контур должен оставаться выключенным. P2/P3 ниже — не повод разрешать торговлю, но обязательная часть доведения Go-сайта до функционального паритета.

## Как проводился аудит

Проверены сквозные цепочки, а не отдельные файлы:

- экран React/vanilla JS → клиентский API → Go route → сервис → БД;
- сигнал IBS/EMA → выбор тикера → sizing → broker request → tracker → fill → записи trades;
- dataset/splits/calendar → расчёты → графики и таблицы;
- auth/session → API input/output → Caddy/Docker/deploy/backup;
- scheduler → actualization → Telegram aggregation → auto execution.

Для каждой оставленной находки выполнена вторая проверка по соседним вызовам Go-кода и старому TypeScript/Node-контракту. Предположения, которые нельзя подтвердить чтением кода, вынесены в раздел runtime proof и не объявлены подтверждённым дефектом.

Подробные исходные отчёты сохранены в том же checkout:

- [autotrade-manual.md](docs/audit-go/autotrade-manual.md)
- [calc-backtest.md](docs/audit-go/calc-backtest.md)
- [metrics-and-api.md](docs/audit-go/metrics-and-api.md)
- [monitor-telegram.md](docs/audit-go/monitor-telegram.md)
- [performance-manual.md](docs/audit-go/performance-manual.md)
- [security-manual.md](docs/audit-go/security-manual.md)
- [security.md](docs/audit-go/security.md)
- [ui-data-enhance.md](docs/audit-go/ui-data-enhance.md)
- [ui-settings-broker-shell.md](docs/audit-go/ui-settings-broker-shell.md)
- [ui-stocks-ema-options.md](docs/audit-go/ui-stocks-ema-options.md)
- [ui-watches-calendar-splits.md](docs/audit-go/ui-watches-calendar-splits.md)

В checkout уже был отдельный коммит ae5ebaf с этими audit-материалами; он сохранён. Этот файл — итоговая Luna-сводка, нормализованный порядок работ и acceptance-gate, а не изменение продукта.

## Агентский проход

Запущены 15 независимых read-only проходов, все на gpt-5.6-luna с reasoning medium. Ни один агент не запускал live Webull/Telegram, не ставил/отменял ордера и не менял файлы.

| ID сессии | Область | Статус |
|---|---|---|
| 01a067ed-5e92-7742-8cd3-9081de8787c3 | security Go | completed |
| 01a067ed-46d8-7e13-aa4e-818518329739 | финансовые edge cases | completed |
| 01a067ed-443d-75d2-8f25-2723ea1ef18d | UI parity React/Go | completed |
| 01a067ed-305a-73c2-8342-38550d7793e1 | verification parity | completed |
| 01a067ed-20a8-72e1-ba95-4af355808324 | persistence/concurrency | completed |
| 01a067ed-1eaa-7640-a50c-482d63fe09cb | strategy parity | completed |
| 01a067ed-1375-77c2-b39c-88a4a77aa34b | Go correctness/robustness | completed |
| 01a067ed-0f4b-7a53-8404-c89d9fb6eec7 | Go frontend static audit | completed |
| 01a067ed-0d99-7290-aab1-642bc754c632 | auto-trading React/Go | completed |
| 01a067ed-097e-74c0-9f28-05ca4b98b633 | API contract | completed |
| 01a067ed-091b-70c1-91e2-9c5f88fc9b80 | performance | completed |
| 01a067ed-0570-7062-9bb8-cff20e418f9e | backtest parity | completed |
| 01a067ed-0567-7152-906e-634a75c7bda6 | deployment/ops | completed |
| 01a067ed-054d-71b1-a0a5-ed0179306f27 | calculations | completed |
| 01a067ed-052d-7302-9874-4d9e6dd18e95 | options backtests | completed |

## Приоритеты

- P0 — stop-ship: возможна потеря денег, реальный нежелательный ордер, повреждение торгового состояния или полное отсутствие авторизации.
- P1 — высокий: нарушен основной контракт, есть риск остановки торговли, порчи данных, утечки или существенной деградации.
- P2 — средний: функциональный/API/UX-дефект, который мешает эксплуатации или снижает надёжность.
- P3 — низкий: локальная визуальная, accessibility или поддерживаемость-проблема.
- R — обязательное runtime-доказательство: статического чтения недостаточно.

## Нулевая фаза: зафиксировать oracle и безопасный режим

Сделать до любых исправлений live-контура.

| ID | Работа | Результат |
|---|---|---|
| G0.1 | Зафиксировать старый Node/React как reference implementation, но не считать сгенерированные из него golden-файлы независимым oracle. | Для каждого сценария есть версия, commit и fixture. |
| G0.2 | Ввести контракты для order lifecycle, trade lifecycle, settings, dataset, splits, watches, calendar и всех calc endpoints. | Есть таблица request/response/status/error и допустимых состояний. |
| G0.3 | Зафиксировать timezone America/New_York, торговый календарь, округления денег/количества и правила обработки missing/zero. | Одинаковый результат в UTC+13, UTC−8 и ET. |
| G0.4 | На тестовом broker adapter описать submitted, partial, filled, rejected, cancelled, expired, timeout, duplicate и restart. | Ни один сценарий не требует реального Webull. |
| G0.5 | Немедленно убрать live test BUY из production-конфигурации и запретить deploy с true через preflight. | В production test BUY недоступен по умолчанию и явно подтверждается только в изолированном sandbox. |

## Фаза A: автоторговля и деньги — первой, до включения live

### A0. Немедленный стоп-фактор

| ID | Severity | Доказательство | Что сделать |
|---|---|---|---|
| A0 | P0 | docker-compose.yml:12-15; go/internal/httpapi/live_handlers.go:171-197; go/internal/live/autotrade.go:513-544 | Убрать WEBULL_ENABLE_LIVE_TEST_BUY=true из production compose, сделать fail-closed default, добавить deploy check и отдельный sandbox profile. Запретить live auto-trade до прохождения всех A1-A18. |

### A1-A18. Полный execution lifecycle

| ID | Severity | Расхождение и риск | Точные места |
|---|---:|---|---|
| A1 | P0 | Запись broker_trades и monitor trades создаётся по res.Submitted. REJECTED/CANCELLED оставляет open-фантом, после чего вход блокируется и выход пытается продать несуществующую позицию. | Go go/internal/live/autotrade.go:340-368; tracker go/internal/live/track.go:150-182. Node ждёт filled: server/src/services/autotrade.js:974-983. |
| A2 | P0 | Entry price и quantity берутся из quote и рассчитанного qty, а не из filled_price/filled_qty. P&L и позиция не соответствуют сделке, частичный fill теряется. | Go autotrade.go:351-358, track.go:150-182; Node autotrade.js:1108-1122. |
| A3 | P0 | При выходе патчится только status и exitDate; exit price, P&L, P&L percent, holding days и exit IBS отсутствуют. Статистика фильтрует такие сделки. | Go autotrade.go:359-368; store/db.go:720-783; Go UI app.js:810. |
| A4 | P0 | Формат quantity всегда %.0f. При fractional position 1.73 order становится 2: rejection или непреднамеренный short. | Go go/internal/live/webull_broker.go:75-80; sizing.go:216-220,282; Node autotrade.js:771. |
| A5 | P0 | Auto Evaluate использует глобальные lowIBS/highIBS, хотя monitor evalWatch читает per-symbol watch. Сигнал Telegram и order decision расходятся. | Go autotrade.go:201-220; telegram.go:355-414; Node autotrade.js:542,1878-1900. |
| A6 | P0 | Отсутствующий lowIBS/highIBS через type assertion превращается в 0. high=0 делает выход истинным почти всегда, low=0 запрещает любой вход. | Go autotrade.go:201-202,232-255; telegram.go:356-363. |
| A7 | P0 | Settings() заменяет вложенный autoTrading целиком при JSON unmarshal; частичный PATCH может стереть пороги и flags. Node делает deep merge и запрещает такой путь. | Go store/db.go:603-611; server.go:328-347; Node settings.js:83-96 и routes/settings.js:66-68. |
| A8 | P0 | PATCH autotrade/config принимает произвольные поля, не проверяет диапазоны IBS, enum, sizing, order/session и не удаляет dryRun. | Go autotrade.go:28-48; Node autotrade.js:493 и далее. |
| A9 | P0 | Нет recover в фоновых горутинах. Неожиданный тип broker JSON, index out of range или panic может завершить весь процесс вместе с торговым scheduler. | Go scheduler/scheduler.go:131-146; live/track.go:118-148; indicators/indicators.go:130-133. |
| A10 | P1 | Tracker после 64 попыток тихо завершает goroutine, но остаётся pending навсегда; Execute больше не торгует по symbol/action. | Go live/track.go:128-148; store/live_persist.go:140-163. |
| A11 | P0 | Статус распознаётся поиском FILLED/EXECUTED во всём сыром JSON. Имена filled_quantity и PARTIAL_FILLED дают ложное полное исполнение. | Go live/webull_broker.go:89-100. |
| A12 | P1 | Poller не извлекает вложенный data.orders[0]/list[0]/items[0]; fallback передаёт весь JSON в NormalizeOrderStatus. | Go live/webull_broker.go:200-215; live/track.go:161-165; Node autotrade.js:797. |
| A13 | P1 | configuredSymbols строит объединение явного symbols и watches. Старый onlyFromTelegramWatches использовал пересечение, поэтому Go может торговать исключённым тикером. | Go live/autotrade.go:547-577; Node autotrade.js:528. |
| A14 | P1 | Отсутствующие allowExits/allowNewEntries включаются в true. Для money path default должен быть fail-closed, а старый контракт трактовал отсутствие как false. | Go live/autotrade.go:203-210. |
| A15 | P1 | Выход патчит первую открытую broker trade без проверки symbol, затем аналогично ищет первую monitor trade. Можно закрыть запись другого тикера. | Go live/autotrade.go:359-368; store.OpenBrokerTrade. |
| A16 | P1 | timeInForce и supportTradingSession захардкожены DAY и CORE, хотя sizing читает supportTradingSession. Объём и фактический order contract расходятся. | Go live/webull_broker.go:75-80; live/sizing.go:129-137. |
| A17 | P1 | orderType, maxSlippageBps, previewBeforeSend и executionWindowSeconds видны в настройках, но Go их не применяет. UI обещает защиту, которой нет. | Go store/db.go:590-598; поиск consumers в go/internal. |
| A18 | P1 | Два источника polling: scheduler PollTrackers и отдельный trackerWheel. Внутренняя map защищает часть повторов, но нет durable in-flight/lease при рестарте и межпроцессном запуске. | Go scheduler/scheduler.go:155; live/track.go:105-147. |

### A19-A28. Исполнение, токен, календарь и согласование

| ID | Severity | Дефект | Точные места и план |
|---|---:|---|---|
| A19 | P1 | Ошибка SaveOrderTracker игнорируется после принятия broker order. При падении БД/процесса ордер может остаться без durable recovery. | autotrade.go:345-349. Нужен transactional outbox/idempotency key и обязательная ошибка до повторного submit. |
| A20 | P1 | Нет durable idempotency на broker request. In-memory reservation исчезает при рестарте, а submit и local state не образуют атомарную операцию. | autotrade.go:285-349. Добавить unique execution key, lease и reconcile-before-submit. |
| A21 | P0 | При ошибке live quote Go подставляет последний daily bar и выставляет ok=true; Node отказывается от действия. Это реальный stale-signal order path. | telegram.go:378-414; Node autotrade.js:571-592. |
| A22 | P1 | TokenHealth возвращает UNKNOWN при ошибке, но scheduler всё равно записывает дату health check и не повторяет попытку в тот же день. | live/autotrade.go:113-142; scheduler.go:190-197. |
| A23 | P2 | CheckToken сохраняет токен с пустым expiresAt, а отдельные token endpoints возвращают сырые provider maps. Нарушен жизненный цикл metadata и увеличена поверхность утечки. | autotrade.go:145-163; httpapi/live_handlers.go:199-218. |
| A24 | P1 | ClosePosition только отправляет market sell и возвращает submit; tracker, fill reconciliation и обновление local trades не запускаются. | autotrade.go:503-510; live_handlers.go:158-168. |
| A25 | P1 | POST autotrade/execute не проверяет trading day/session самостоятельно. Ручной вызов может уйти вне разрешённого окна, тогда как scheduler проверяет календарь только в своём цикле. | live_handlers.go:135-137; scheduler.go:161-177. |
| A26 | P1 | Scheduler требует точную минуту until=11 или 1 после предварительного окна 10-12/0-2. Downtime/clock jitter может навсегда пропустить aggregation. | scheduler.go:170-174,200-207. |
| A27 | P1 | Consistency формирует только три простых issue, а proposedActions пуст; Reconcile(apply) вызывает UpdatePositions и ставит applied=true независимо от результата. | live/monitor.go:16-95. |
| A28 | P2 | SyncCalendar получает raw calendar, но возвращает saved=false и не сохраняет данные. Состояние календаря после успешного sync не меняется. | live/monitor.go:97-105. |

### Приёмка фазы A

Фаза считается закрытой только после fake-broker integration tests для каждого terminal status, partial fill, nested payload, timeout, duplicate request, restart между submit и fill, DB failure после submit, wrong ticker, stale quote, missing config и outside-session call. В БД должны быть проверяемые инварианты:

- одна фактическая позиция имеет одну broker trade и одну monitor projection;
- rejected/cancelled/expired не создают open trade;
- filled запись содержит fill price и fill quantity;
- partial fill не превращается в полное;
- закрытие атомарно пишет exit price, P&L, duration и статус;
- повторный scheduler tick не создаёт второй order;
- любое сомнение в котировке или конфиге блокирует order.

## Фаза B: API, persistence и данные

| ID | Severity | Расхождение | Доказательство / план |
|---|---:|---|---|
| D1 | P1 | SQLite ohlc хранит только OHLC, adj_close и integer volume; rawOpen/rawClose/splitFactor/priceBasis не round-trip. Split-aware EMA и отображение реальной цены теряют данные. | store/db.go:301-321,335-385; types/types.go:3-17. Расширить схему миграцией и проверить старые БД. |
| D2 | P0 | GET dataset запускает split detector и может сам записать сплиты и необратимо переписать цены, хотя Node требует явного apply-splits. | httpapi/server.go:358-384; httpapi/splits_apply.go; Node routes/datasets.js:254-284. |
| D3 | P1 | POST/PUT dataset не запускает evaluateDatasetPayloadIntegrity/evaluateOhlcMergeIntegrity и не предупреждает о дубликатах, gaps, split cliffs или неправильных OHLC. | Node data integrity services; Go savePayload:427-440. |
| D4 | P1 | PUT dataset обнуляет отсутствующие companyName/tag/uploadDate вместо merge с существующими metadata. | server.go:417-435; store.SaveDataset:358-363. |
| D5 | P1 | Refresh читает enhancerProvider вместо resultsRefreshProvider, запрашивает 40 лет и полностью заменяет dataset вместо incremental merge. | server.go:442-478; Node price/data refresh services. |
| D6 | P1 | GET dataset/:id/metadata делегирует полный GET с OHLC и возможной мутацией вместо лёгкого metadata response. | server.go:387-389. |
| D7 | P1 | Некорректный JSON в PUT/PATCH splits проглатывается; PUT с nil может удалить все splits и ответить 200. Ошибки DB также проглатываются. | server.go:609-630. |
| D8 | P2 | Dataset/split mutations непоследовательно возвращают ok и success; Go теряет обновлённый список и эхо объекта, которое ждёт старый API. | server.go:427-440,609-630; metrics-and-api.md. |
| D9 | P0 | React getMonitorTradeHistory вызывает GET /api/trades и ожидает object с trades/openTrade/total/lastUpdated, Go отдаёт голый array. | src/lib/api.ts:764-790; src/types/index.ts:313-318; server.go:834-842. |
| D10 | P0 | GET /api/broker-trades тоже отдаёт array вместо BrokerTradeHistoryResponse; POST/PATCH возвращают только ok вместо созданной/обновлённой записи. | src/types/index.ts:357-387; server.go:844-899. |
| D11 | P1 | InsertTrade сохраняет только 8 полей, PatchTrade обновляет только status/dates/prices/notes/isHidden; теряются IBS, quantity, isTest, link и broker/client IDs. COALESCE не позволяет очистить nullable поля. | store/db.go:700-872. |
| D12 | P1 | ListTrades не применяет includeHidden и не возвращает linkedBrokerTradeId, brokerOrderId, clientOrderId, filledQty; скрытые записи попадают в обычную историю/метрики. | store/db.go:786-817; src/lib/api.ts:764-789. |
| D13 | P1 | Большое число mutation handlers игнорирует decode/DB errors; watch patch может обратиться к nil map, splits malformed body стирает данные, delete может ответить success после DB failure. | server.go:338-347,609-630,770-831,844-902. |
| D14 | P1 | MergeOHLC — read-modify-write; конкурентные refresh/actualize могут потерять строки. | store/db.go:MergeOHLC и SaveDataset. Нужна транзакционная upsert-модель с revision/lock. |
| D15 | P1 | Schema init — inline CREATE IF NOT EXISTS, без migration table/version/preflight. Существующая Node schema может не иметь необходимых колонок. | store/db.go:45-215; Node server/src/db/index.js:97-104,206-228. |
| D16 | P2 | calc handlers часто игнорируют malformed JSON; black-scholes принимает invalid S/K/T/sigma и сериализует NaN как null/невалидный результат. | httpapi/calc.go:59-70,90-183. |
| D17 | P1 | tickersOrOne вызывает IBS на empty bars; indicators.IBS не защищает empty slice, поэтому malformed/empty request может вызвать panic. | calc.go:219-236; indicators/indicators.go:130-133. |
| D18 | P2 | calc/options и options-multi считают metrics с hardcoded initial capital 10000, а calc/indicators hardcodes SMA20/EMA20/RSI14 без API параметров. | calc.go:90-138. Сверить с параметрами старого endpoints. |
| D19 | P2 | handleTestProvider не поддерживает polygon, хотя Settings UI его предлагает. | server.go:1072-1114. |
| D20 | P2 | Dataset meta/health/status скрывают реальную ошибку: handleDashboard игнорирует error, /api/status сообщает connected=true после Open без Ping/readiness, handlePatchDatasetMeta игнорирует JSON error. | live_handlers.go:148-151; server.go:549-578 и status handler. |
| D21 | P1 | CloseMonitorTrade делает read-check-update неатомарно, принудительно ставит минимум 1 holding day и использует wall clock вместо injectable now. Два close могут перезаписать друг друга. | store/db.go:720-783. |
| D22 | P2 | DateKey и IsValid принимают строки по форме, но не всегда проверяют реальную дату; provider timestamps/holiday boundaries могут сдвинуть торговый день. | tradingdate/date.go; src/lib/date-utils.ts. |
| D23 | P2 | SaveDataset берёт date range из первого/последнего входного элемента и приводит volume к int64 без сортировки/проверки диапазона. | store/db.go:343-381. |
| D24 | P2 | Webull raw/account/token responses и provider errors требуют redaction/shape normalization; сейчас части endpoint возвращают map как есть. | live_handlers.go:139-218; providers/client.go:73-86. |

## Фаза C: расчёты, индикаторы и backtest parity

### C1-C14. Подтверждённые несовпадения или опасные контракты

| ID | Severity | Расхождение | Доказательство / план |
|---|---:|---|---|
| C1 | P0 | Go системно считает явный 0 как unset и подставляет default. Самый опасный пример: margin capitalUsagePct=0 означает 0% в TS, но 100% в Go. | backtest/margin.go:65-68 против src/lib/margin-simulation.ts:55-76. |
| C2 | P1 | maintenanceMarginPct=0: TS clamp даёт 1%, Go default даёт 25%; разные liquidation trigger. | margin.go:69-74 против margin-simulation.ts:75-77. |
| C3 | P1 | EMA sell-zone loop сохраняет индексы lots, затем splices slice; следующий индекс может обратиться к другому lot или быть пропущен. TS итерирует object references. | backtest/ema.go:432-482 против src/lib/ema-zone-strategy.ts:305-348. |
| C4 | P1 | Go EMA preparation не получает rawData и rawByDate остаётся пустым; вместе с потерей raw fields в SQLite split-aware price basis не повторяет React. | backtest/ema.go:148-187; TickerIndexed:14-19; store/db.go:301-321. |
| C5 | P2 | RunOptions/RunMultiOptions shallow-copy trade и меняет caller Context pointer; повторный прогон на тех же данных получает побочный эффект. | backtest/options.go:115-186,189-340; сравнение optionsBacktest.ts. |
| C6 | P2 | clean.go добавляет второй fallback maxHoldDays из RiskManagement при Parameters.MaxHoldDays=0; это не единое правило defaulting. | backtest/clean.go:41-44. |
| C7 | P1 | Single position: leverage=0 подменяется 1 в Go, а TS берёт заданное значение и защищает расчёт margin; explicit zero semantics расходятся. | backtest/single.go:114-117; src/lib/singlePositionBacktest.ts:388-400. |
| C8 | P2 | OptionsConfig riskFreeRate=0, expirationWeeks=0, maxHoldingDays=0 заменяются defaults; 0% risk-free — валидный input. | backtest/options.go:33-43; src/lib/optionsBacktest.ts:69. |
| C9 | P2 | Индикаторный API выдаёт фиксированные параметры, а не параметры запроса; несоответствие особенно заметно на SMA/EMA/RSI custom period. | httpapi/calc.go:127-138. |
| C10 | P1 | Некорректные input values в calc endpoints не отклоняются до math; NaN/Inf и empty arrays не имеют единого error contract. | httpapi/calc.go:59-183; optionsmath. |
| C11 | P2 | В проекте несколько несовпадающих определений CAGR, contribution scenario и profit factor; часть различий унаследована TS, но Go не закрепляет единую публичную семантику. | metrics-and-api.md; src/lib/backtest-statistics.ts, metrics.ts; go/internal/metrics. |
| C12 | P2 | Final liquidation/end-of-data не всегда входит в equity/max drawdown, а sparse ticker exposure использует fallback; это model-risk даже при совпадении двух реализаций. | metrics-and-api.md; backtest/ema.go и options.go. |
| C13 | P2 | Volatility игнорирует window в обеих реализациях, expiration считает пятницу без полной holiday logic; это наследованный дефект модели, который нельзя оставлять неоговорённым в acceptance. | optionsmath; src/lib/optionsBacktest.ts. |
| C14 | P2 | Trading date validation допускает формально похожие, но календарно невозможные даты; Go и TS используют разные части time/UTC/NYSE conventions. | tradingdate/date.go; src/lib/date-utils.ts. |

### Что уже совпадает

Побайтовая/формульная сверка не выявила регрессии в IBS thresholds, IBS indicator normal cases, основных SMA/EMA/RSI, большинстве metrics constants, HMAC-SHA1 Webull signing, BAC4 date indexing и обычной clean/single commission логике. Это не заменяет расширенные edge-case fixtures.

### Приёмка фазы C

Для каждой стратегии нужен независимый набор fixtures, созданный вручную или из сохранённого бизнес-примера: empty, one bar, equal high/low, explicit zero, negative/NaN, leverage, monthly contributions, partial split, EMA multiple lots and sell zones, options expiry/max hold, margin liquidation. Сравнение должно проверять trades, context, equity, drawdown, exposure, metrics и JSON schema, а не только finalValue.

## Фаза D: UI и функциональный паритет

Полный UI-ledger вынесен в четыре подробных отчёта; ниже перечислены все оставленные группы несоответствий и их приоритет. React refs и Go refs приведены в документах из раздела «Как проводился аудит».

### D-data: /data и /enhance

| ID | Severity | Потерянная или сломанная возможность |
|---|---:|---|
| UI-D1 | P1 | Enhance получает splits, но Go не передаёт их при save; новый ticker теряет split events. |
| UI-D2 | P2 | Enhance не сохраняет companyName; карточка не показывает название компании. |
| UI-D3 | P3 | Dataset cards не используют catalog companyName как fallback. |
| UI-D4 | P2 | Нет live ticker autocomplete, listbox, ArrowUp/Down, Enter/Escape и loaded/download markers. |
| UI-D5 | P2 | Нет global/per-card loading guard; двойной клик запускает параллельные saves. |
| UI-D6 | P2 | Ошибка initial dataset load превращается в пустой список без баннера. |
| UI-D7 | P2 | /data всегда рисует Online вместо checking/online/offline status. |
| UI-D8 | P2 | Refresh dataset не блокирует кнопку и не показывает spinner. |
| UI-D9 | P1 | Refresh игнорирует resultsRefreshProvider и берёт enhancerProvider. |
| UI-D10 | P3 | uploadDate и dateRange показываются сырым ISO/YYYY-MM-DD вместо локального ET-формата. |
| UI-D11 | P3 | Потерян ticker badge рядом с company name. |
| UI-D12 | P3 | Ошибка refresh — исчезающий toast вместо закрываемого persistent banner. |
| UI-D13 | P3 | Поиск ticker не нормализует uppercase во время ввода. |
| UI-D14 | P3 | Metadata modal не блокирует кнопки на время сохранения. |

### D-settings/broker/shell: /settings и /broker

| ID | Severity | Потерянная или сломанная возможность |
|---|---:|---|
| UI-S1 | P2 | Нет React range slider для watch threshold и модалки с provider limits. |
| UI-S2 | P3 | Потеряны описания auto-actualization и типов комиссий; commission controls не disabled по типу. |
| UI-S3 | P3 | Нет last updated indicator для autotrading settings. |
| UI-B1 | P1 | Время и даты Webull/order/logs выводятся сырыми ISO вместо America/New_York. |
| UI-B2 | P2 | Autotrade/broker logs представлены JSON-заглушкой без человекочитаемого разделения. |
| UI-B3 | P1 | Read-only autotrade config урезан примерно до 4 строк вместо полного набора настроек. |
| UI-B4 | P2 | Token status не показывает все source/daysLeft/lastCheckAt поля в исходном виде. |
| UI-B5 | P1 | Нет raw JSON diagnostic panels для broker payloads. |
| UI-B6 | P2 | Close/test BUY показывают только toast и не показывают submitted→filled/rejected lifecycle/raw response. |
| UI-B7 | P2 | В monitor table нет Open/today open и отдельной кнопки actualize для тикера. |
| UI-B8 | P2 | Нет Client Order ID и Broker Order ID в журнале. |
| UI-B9 | P0 | Нет EditBrokerTradeModal: невозможно полноценно закрыть/поправить broker trade, exit IBS, isTest и notes. |
| UI-B10 | P1 | Manual broker trade form не повторяет React validation. |
| UI-B11 | P1 | Полностью отсутствуют ErrorBoundary, ErrorConsole, window.onerror и unhandledrejection UI. |
| UI-B12 | P1 | Кнопка Settings Test Polygon не работает: Go отвечает Unknown provider. |
| UI-B13 | P2 | Числовые и строковые settings limits не валидируются в UI и Go. |
| UI-B14 | P2 | После login всегда redirect на /data; исходный protected route теряется. |
| UI-B15 | P2 | Навигация не делает повторную auth-check/глобально не обрабатывает 401. |
| UI-B16 | P3 | Нет live-follow системной темы в режиме Auto. |

### D-stocks/EMA/options: /stocks, /ema, /multi-ticker-options

| ID | Severity | Потерянная или сломанная возможность |
|---|---:|---|
| UI-R1 | P0 | Trades table имеет hard cap 200, нет pagination и export. |
| UI-R2 | P2 | Потеряны Deposit/$ и leverage columns, IBS/index price diagnostics и визуальная подсветка проблемных значений. |
| UI-R3 | P1 | Options tab лишён параметров и equity graph. |
| UI-R4 | P1 | BuyAtClose tab лишён controls и graph. |
| UI-R5 | P1 | BuyAtClose4 tab лишён своего universe, leverage slider и graph. |
| UI-R6 | P1 | NoStopLoss параметры/4 режима выхода/плечо/take-profit захардкожены или потеряны. |
| UI-R7 | P1 | Monthly contributions лишились controls, comparison, equity и metrics. |
| UI-R8 | P1 | Нет сравнения margin vs no-margin. |
| UI-R9 | P2 | EMA spreads используют текущие unsaved zones, пресеты не защищены от duplicate name. |
| UI-R10 | P0 | Pro price chart потерял markers, EMA/IBS/volume/splits, ticker cards и большую часть TradingChart поведения. |
| UI-R11 | P1 | EMA price chart не рисует EMA и buy/sell zones; deviation chart не показывает zones/markers/legend. |
| UI-R12 | P2 | Exposure chart потерял area fill, 100% reference и average exposure. |
| UI-R13 | P1 | Ticker cards не показывают метрики/price/refresh. |
| UI-R14 | P1 | Profit-factor и duration analysis потеряли histogram/distribution/breakdown. |
| UI-R15 | P1 | Multi-ticker splits tab запрашивает splits по state.ticker, не по рассчитанным тикерам. |
| UI-R16 | P2 | Equity/drawdown/exposure charts без range switch, crosshair tooltip и header metrics; drawdown без stats/fill. |
| UI-R17 | P3 | Reset tickers показывается всегда; даты сделок ISO; нет dirty-parameters warning и HelpTooltip/StrategyInfoCard. |

### D-watches/calendar/splits

| ID | Severity | Потерянная или сломанная возможность |
|---|---:|---|
| UI-W1 | P0 | В Go UI нет явной кнопки apply-splits. |
| UI-W2 | P1 | Import JSON формата symbol/events перебирается как object entries и создаёт неправильные тикеры. |
| UI-W3 | P1 | EMA alerts нельзя enable/disable и менять nextAction. |
| UI-W4 | P2 | Create EMA cycle потерял «Близость, %» и «Инфо-уровень, %». |
| UI-W5 | P1 | Manual monitor close заменён prompt одной цены; потеряны date, live quote и exit IBS. |
| UI-W6 | P1 | Edit monitor trade потерял entryIBS, exitIBS, quantity, isHidden, isTest и link. |
| UI-W7 | P1 | Нет полноценного manual trade history UI и CSV/JSON export. |
| UI-W8 | P1 | Manual trade не ограничен watches и не блокирует duplicate open position. |
| UI-W9 | P2 | Update prices/positions теряет детализацию результата и ошибки. |
| UI-W10 | P2 | Calendar Webull import показывает generic toast вместо результата. |
| UI-W11 | P2 | Клик по дню не показывает details и не предзаполняет current type/name. |
| UI-W12 | P2 | Watches table без column sorting и per-row consistency badge. |
| UI-W13 | P2 | Watch row теряет entryDate/entryIBS; position status без цветного badge. |
| UI-W14 | P1 | monitorStats и React calculateMonitorTradeMetrics считают netProfit/profitFactor на разной основе. |
| UI-W15 | P1 | isHidden trades не фильтруются и загрязняют history/statistics. |
| UI-W16 | P1 | Большинство create/edit/delete forms не показывает API error; rejected promise становится молчаливым сбоем. |
| UI-W17 | P2 | Consistency panel схлопывает severity и issues в две визуальные сущности вместо отдельных карточек и действий. |
| UI-W18 | P2 | Formatting metrics теряет знак плюс и денежную/процентную точность. |
| UI-W19 | P2 | Calendar лишён keyboard navigation, swipe и aria-разметки day cells. |
| UI-W20 | P3 | Calendar legend хардкодит early close 13:00; «Сегодня» не disabled в текущем месяце; edit разрешён на weekend. |
| UI-W21 | P3 | Нет skeleton/loading states, async Webull buttons не показывают busy state. |
| UI-W22 | P3 | Есть мёртвый data-ds handler; split export без timestamp; ticker create без trim; нет mobile card layout и Seeking Alpha helper-link. |
| UI-W23 | P2 | Нет отдельного current-position banner, open trade не гарантированно сверху, lastUpdated/count не показываются. |

### UI acceptance

Сделать route-level matrix для /data, /enhance, /stocks, /ema, /broker, /watches, /calendar, /split и /settings. Для каждой страницы проверить:

- desktop 1440, tablet 1024, mobile 390;
- loading, empty, 401, 4xx, 5xx, timeout, malformed response;
- keyboard-only, focus, screen reader labels, mobile gestures;
- повторный клик, back/forward, refresh, loss of network;
- parity screenshot и behavior trace against React.

## Фаза E: безопасность

| ID | Severity | Проблема | Доказательство / план |
|---|---:|---|---|
| S1 | P0 | Пустой ADMIN_PASSWORD вне production отключает auth полностью. Misconfigured compose/host открывает весь API. | httpapi/server.go:191-216; fail closed regardless NODE_ENV. |
| S2 | P1 | Rate limiting потерян: unlimited login brute force, bcrypt, calc, autotrade и provider calls. | Node server.js:76-77 имел limiters; Go/Caddy не имеют. |
| S3 | P1 | Нет MaxBytesReader/strict JSON/trailing garbage/DisallowUnknownFields; calc and provider bodies have no cardinality cap. | server.go:172-175; calc.go; providers/client.go:73-86. |
| S4 | P1 | Cookie auth_token без Secure; direct host port 3001 опубликован в compose. | server.go:273-277; docker-compose.yml:26-27. |
| S5 | P1 | CSP и frame-ancestors потеряны; Go SPA строит HTML конкатенацией строк. | caddy/Caddyfile:13-18; server.go serveWeb; Node helmet config. |
| S6 | P1 | Provider transport error может вернуть url.Error с полным URL и API key браузеру. | providers/client.go:140,168,192,248,281,312,349; server.go:1117-1126. |
| S7 | P2 | Webull token хранится plaintext в SQLite и token create/check могут вернуть raw token/provider data. | store/db.go:176-186; live_handlers.go:199-218. |
| S8 | P2 | Tracked .env.server подтверждён git ls-files; провести secret scan, rotation и исключить credentials из repository. Значения не читались и не выводились. | .env.server tracked mode 100644. |
| S9 | P2 | Нет CSRF token protection, только SameSite=Lax; особенно важно для mutating cookie-auth routes. | server.go auth/cookie handlers. |
| S10 | P2 | Plaintext password fallback не constant-time; это унаследовано Node, но Go должен запретить его в production. | server.go:263-268. |
| S11 | P2 | randomToken игнорирует crypto/rand error; malformed PATCH/settings and many live handlers ignore JSON errors. | server.go:254,306,317,341; live_handlers.go:25,48,64,98. |
| S12 | P2 | Telegram send принимает произвольный ChatID из request body вместо allowlisted configured chat; требуется product decision, но authorization boundary открыт. | live_handlers.go:20-41. |
| S13 | P2 | Telegram transport logs full response/error body; проверить redaction of tokens, chat IDs and provider payloads. | live/transport.go:42-53. |
| S14 | P2 | autotrade logs limit не ограничен сверху; отрицательные/очень большие значения могут создать лишнюю работу. | live_handlers.go:153-155; live persistence. |
| S15 | P2 | Runtime container запускается root; DB parent dirs создаются 0755. Webull token file protection не задаётся явно 0600. | docker/go.Dockerfile:8-22; store/db.go:26-30. |
| S16 | P2 | HTTP server имеет только ReadHeaderTimeout, нет Read/Write/Idle timeout и graceful shutdown. | go/cmd/server/main.go:37-42. |
| S17 | P2 | Backup копирует живые Docker volumes, глушит cp errors, не делает checksum и restore drill. | deploy.sh:138-176; backup-from-server.sh:22-33. |
| S18 | P2 | Caddy access log path не mounted; CSP/X-Frame headers отсутствуют; frontend dependency в compose не соответствует root proxy. | caddy/Caddyfile:9-18,37-40; compose caddy volumes/depends_on. |

### Проверено и не объявлено уязвимостью

Статически не подтверждены SQL injection, XSS, SSRF и path traversal в Go SPA; экранирование innerHTML проверено. Webull request signing/HMAC-SHA1 соответствует Node. TLS certificate verification не отключена. Эти проверки остаются regression tests, но не являются findings.

## Фаза F: скорость и операционная надёжность

| ID | Severity | Проблема | Доказательство / план измерения |
|---|---:|---|---|
| P1 | P1 | Каждая evalWatch загружает весь OHLC dataset и пересчитывает IBS с начала. Нет last-bar cache. | live/telegram.go:378-390; store/db.go:301-321. Ввести bounded cache/incremental query, измерить lock wait. |
| P2 | P1 | Actualize запрашивает до 40 лет для каждого ticker вместо Node incremental 7-day window. | live/actualize.go:69-83; Node priceActualization.js:138-150. |
| P3 | P1 | Между provider requests нет Node throttle/jitter; burst приводит к 429 и непредсказуемому неполному обновлению. | live/actualize.go:72-83; Node priceActualization.js:276-300. |
| P4 | P1 | SQLite SetMaxOpenConns(1) сериализует heavy dataset reads, backtests и live writes. | store/db.go:30-35. Оценить WAL/read connection design, busy timeout и DB queue. |
| P5 | P2 | renderPage пересоздаёт всю SPA и графики при каждом state update. | go/web/js/app.js:2133-2151; React has component-local updates. |
| P6 | P1 | Calc API принимает неограниченные bars/trades/tickers и считает в том же процессе, что и trading scheduler. | server.go:172-175; calc.go. Нужны body/row/ticker/time budgets and cancellation. |
| P7 | P2 | tracker goroutines не имеют context cancellation и scheduler stop не ждёт их завершения. | live/track.go:105-147; scheduler.go:132-145. |
| P8 | P2 | Manual update-all и scheduler actualization могут выполняться параллельно; нет in-flight guard. | live_handlers.go:89-91; scheduler.go:175-179; live/actualize.go. |
| P9 | P2 | Go browser api.js fetch без timeout/retry; React API client имеет AbortController 30s и до 3 GET retries. | go/web/js/api.js:1-17; src/lib/api.ts:64-164. |
| P10 | P3 | Charts и options paths делают полные sort/slice/map и унаследованный O(D×T) поиск. Это не обязательно Go regression, но нужен benchmark. | go/internal/backtest/options.go:59-340; src/lib/optionsBacktest.ts:64-401; go/web/js/charts.js. |

### Операционные дефекты

| ID | Severity | Проблема |
|---|---:|---|
| OPS1 | P1 | main использует ListenAndServe без SIGTERM/SIGINT Shutdown, без drain scheduler/tracker и без graceful DB close sequence. |
| OPS2 | P1 | Нет schema migration/version preflight; deploy не знает, совместима ли production DB с текущим binary. |
| OPS3 | P1 | deploy.sh останавливает compose до rebuild/copy, не blue/green/atomic; неудача оставляет downtime. |
| OPS4 | P2 | Backup не подтверждает успешное копирование и не тестирует restore; retention хранится локально, offsite/checksum отсутствуют. |
| OPS5 | P2 | health-check считает любой Up healthy, проверяет старые MCP/music endpoints и hardcodes старый frontend bundle hash. |
| OPS6 | P2 | /api/status сообщает DB connected без Ping/read/write/dependency readiness. |
| OPS7 | P2 | deploy-go.sh сам делает git push origin main и удалённый reset --hard; скрипт не запускался, но это опасный operational contract и должен быть explicit/manual. |
| OPS8 | P2 | DEPLOYMENT.md заявляет rollback/auto-update/check scripts, которые не образуют проверяемый atomic rollback workflow. |

## Фаза G: тестовый контур и доказательство готовности

### Текущее фактическое состояние

| Проверка | Результат |
|---|---|
| go test ./... | PASS |
| go test -race ./... | PASS; race detector означает обнаруженные гонки в проверенных тестах не зафиксированы, но не доказывает broker/runtime safety |
| go vet ./... | PASS |
| npm run build:check | PASS; Vite build успешен |
| npm run lint | FAIL: BuyAtClose4Simulator.tsx:165 react-refresh/only-export-components; WebullAccountPage.tsx:756 missing effect dependency warning |
| npm run test:run | 97 files: 92 passed, 4 failed, 1 skipped; 575 tests: 553 passed, 21 failed, 1 skipped |
| Причина Node test failures | server/node_modules/better-sqlite3 собран с NODE_MODULE_VERSION 141, текущий Node v26.8.1 требует 147. Падения происходят в DB-backed Node integration tests и не являются доказательством Go-дефекта. |
| Live Webull/Telegram | НЕ запускались; реальные orders/cancel/positions не трогались |
| Server/browser E2E | Не объявлены пройденными; сервер не запускался в рамках audit |

### Пробелы, которые закрыть до release

1. Golden-файлы сейчас генерируются из текущих TS/JS через scripts/dump-go-goldens.ts; это хороший smoke parity, но не независимый oracle.
2. EMA golden содержит только один end_of_data trade и не покрывает multiple lots/sell-zone splice — именно там находится C3.
3. store package не содержит _test.go при большом объёме lifecycle/persistence кода.
4. Нет полного route-by-route security matrix для auth, malformed JSON, body limits, hidden trades и error status.
5. Нет fake broker contract suite для partial/reject/cancel/timeout/restart/idempotency.
6. Нет полного browser E2E Go SPA и responsive/accessibility proof.
7. Нет измерений p50/p95 latency, heap/alloc, GC, SQLite lock wait, provider payload size и chart FPS.
8. Нет теста на fixed timezone; manifest goldens сообщает unset timezone.

### Обязательные gates перед разрешением live

Gate 1 — безопасность: S1-S7, S9, S11, S16 и A0 закрыты, secret scan чист, compose не публикует небезопасный test BUY.  
Gate 2 — execution: A1-A26 с fake broker и restart tests зелёные.  
Gate 3 — data: D1-D7, D11-D15 и migrations проверены на копии production DB.  
Gate 4 — calculation: C1-C10 fixtures дают согласованный JSON и выбранные model decisions документированы.  
Gate 5 — UI/API: D9-D10, UI-B5/UI-B9/UI-R1/UI-W1 закрыты; Playwright smoke проходит на всех маршрутах.  
Gate 6 — operations: graceful shutdown, backup+restore drill, health/readiness, rollback и rate-limit load test доказаны.  
Gate 7 — canary: только dry-run/fake broker, затем sandbox, затем минимальный лимит с ручным approval и постоянным reconciliation monitor.

## Рекомендуемый порядок реализации

1. A0 + S1/S4/S6/S7: выключить опасный путь, fail-closed auth, redaction и cookie/port hardening.
2. A1-A4, A11-A12, A19-A20, A24: исправить фактический order/fill lifecycle и durable recovery.
3. A5-A10, A13-A18, A21-A28: закрыть конфиг, stale data, tracker, session, calendar и reconciliation.
4. D2-D7, D11-D15: schema migrations, integrity, split semantics, atomic persistence и API contracts.
5. C1-C10: explicit presence/zero parsing, EMA lots, options/margin validation и independent differential fixtures.
6. D9-D10 и критичные UI: response shapes, apply-splits, broker edit, trades pagination/export, raw diagnostics.
7. S2/S3/S5/S8-S18: rate limits, size/time budgets, CSP, CSRF, secrets, non-root, backups and deploy safety.
8. P1-P10/OPS1-OPS8: benchmark, cache, incremental actualization, single-flight, graceful shutdown and rollback.
9. Остальной UI-ledger P2/P3, accessibility, mobile и polish.
10. Повторить весь audit после каждого логического блока и прогнать acceptance gates. Одна исправленная точка не считается закрытием класса проблемы: искать тот же паттерн по всему go/internal и go/web.

## Отсечённые ложные срабатывания

Не включать в backlog как подтверждённые Go-регрессии:

- «Дефолты settings не совпадают» по watchThreshold/provider/default symbols: старый runtime читает серверные Node defaults, и они совпадают с Go для этих полей; React store-only defaults не являются source of truth.
- «high <= low всегда даёт 0.5»: ветка недостижима после NormalizeIntradayRange.
- «Go потерял limit orders»: live Node сам форсировал MARKET.
- «Go не поддерживает multipart»: server.go:391-412 поддерживает multipart.
- SingleTickerPage: в текущем React route dead и не входит в фактический продуктовый surface.
- XSS, SQLi, SSRF и path traversal: статические проверки не дали подтверждённого exploit.

Эти исключения важны: roadmap не должен чинить различия, которые не являются частью работающего старого контракта, но каждое исключение надо сохранить в regression checklist.

## Ограничение результата

Этот документ — read-only аудит и план работ. В рамках текущего задания не исправлялись source files, не запускались production/sandbox services, не выполнялись внешние сетевые торговые операции и не делался push. Следующий шаг — реализовать фазы A0/A1 в отдельном согласованном change-set, после чего повторить fake-broker и differential verification; до этого любые live orders должны оставаться запрещены.
