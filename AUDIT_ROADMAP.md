# Аудит-роадмап (верифицированный)

Источник находок: PR #241 «Audit roadmap: full-subsystem read-only audit» (аудит по дереву `3176141`).
Проверка находок: по текущему `main` (`d090f36`). Каждый пункт ниже
**перепроверен по коду**; неподтверждённые пункты вынесены в раздел 4.

Что прогнано в этой проверке (аудит этого сделать не мог — не было Go-тулчейна):

- `go vet ./...` — PASS
- `TZ=Pacific/Auckland go test ./...` — PASS
- `TZ=America/Los_Angeles go test -race ./...` — PASS (все 15 пакетов)

Закрытие Phase 0–3 (кроме [R] и Phase 4): см. хэши у пунктов в §3.

---

## 1. Подтверждённые находки

### P0 — контур денег/данных

**AU-P0-1. Telegram-сообщения об исполнении жёстко говорят «Webull».** ✅ подтверждено
`live/track.go:486` («Webull исполнено»), `:491` («Webull статус заявки»),
`live/trade_record.go:148` («Webull: частичное исполнение»), `:255` («Webull: проскальзывание»).
Брокер в трекере известен (`t["broker"]`), в `reduceOpenQuantity` он уже используется корректно —
это недоделка, а не ограничение. Оператор при исполнении на Robinhood идёт проверять Webull.

**AU-P0-2. `pollTracker` опрашивает чужой трекер через defaultBroker.** ✅ подтверждено
`live/track.go:287-294`: `br := e.defaultBroker()`, имя брокера учитывается только если
`BrokerNamed(name) != nil`. При отвязанном брокере трекер Robinhood опрашивается Webull'ом, и
`ErrOrderNotFound` (`track.go:303-306`) уводит трекер в `terminal_absent` → `deletePhantom`
удалит открытую строку журнала по ответу **другого** брокера.

**AU-P0-3. Guard pending-трекера fail-open на ошибке БД.** ✅ подтверждено
`store/robinhood.go:107-121` (`AnyPendingTrackerFor`) и `:123-141` (`FindPendingTrackerBroker`)
при `err != nil` возвращают `nil`; `live/execute_all.go:126-141` трактует `nil` как «pending нет»
и разрешает заявку. Сбой чтения `order_trackers` = разрешённый дубль входа.

**AU-P0-4. `Consistency()` видит одну broker-позицию и только default-брокера.** ✅ подтверждено
`live/monitor.go:33` — `store.OpenBrokerTrade(broker)` = первая открытая строка любого брокера
(в аудите указана `OpenBrokerTradeFor(rows,"")` — это она же под другим именем);
`monitor.go:119` → `liveHeldSymbols()` → `heldSymbolsOn(e.defaultBroker())`
(`live/autotrade.go:397-398`). Вторая одновременная позиция на втором брокере в сверке невидима.
Торговые гейты (`booksFor`, `autotrade.go:387-388`) брокеров различают — дыра диагностическая.

**AU-P0-5. Импорт календаря навсегда пишет «дыры» ответа как праздники.** ✅ подтверждено
`live/calendar_import.go`: цикл по будням `start..end`, любой день, отсутствующий в ответе Webull,
пишется в `holidays` (удаления нет вообще), а `meta["webullCoverageThrough"] = end` ставится
безусловно, независимо от того, сколько дней реально вернул Webull. Ложный holiday →
`IsTradingDay` тихо пропускает T-11/T-1 и актуализацию в настоящий торговый день.
Расчётный календарь `tradingdate.NYSEHolidayDates` как валидатор не используется.

### P1 — ложь о состоянии

**AU-P1-1. Окно T-11/T-1 в одном последовательном тике.** ✅ подтверждено
`scheduler/scheduler.go:140` — единственный тикер 20 c, все джобы в `RunTick` последовательно;
окно `until ∈ [10..12] ∪ [0..2]` (`:191`), но `RunTelegramAggregation` (`:411-413`) и
`live/telegram.go:143-149` отбрасывают всё, кроме `until == 11` / `until == 1`. Задержка тика
>60 c вокруг нужной минуты молча съедает сообщение дня; lease защищает от дублей T-1, не от пропуска.

**AU-P1-3. Цена исполнения 0 журналируется как настоящая.** ✅ подтверждено
`live/trade_record.go:113-115` ставит `unconfirmedPrice`, `:165-170` пишет только лог
`fill_price_unconfirmed` — сама строка сделки создаётся с ценой 0 и никак не помечена; PnL считается
по нулю, в UI это выглядит как реальная цена.

**AU-P1-4. Guard актуализации ставится только при полном успехе.** ✅ подтверждено
`live/actualize.go:83-86`: `lastActualizationDate` пишется только при `out.Count > 0`. Если провайдер
лёг целиком, окно `after ∈ [15..31]` (`scheduler.go:213`) перезапускает полный проход каждые 20 c.

**AU-P1-5. Без импортированного календаря `CloseMin` = 16:00 всегда.** ✅ подтверждено по коду
(`TradingSession` на пустом календаре), короткие дни без Webull-креды невидимы. Реальное поведение
провайдера в такой день — [R].

### P2 — качество/эксплуатация

**AU-P2-1. SQL-апдейты журнала с игнорированием ошибок.** ✅ подтверждено
`live/trade_record.go:176,177,205,207,278` — `_, _ = e.DB.SQL.Exec(...)`. Контур денежный, а
расхождение потом не увидит `Consistency` (AU-P0-4).

**AU-P2-2. Robinhood `agenticAccount()` не читает сохранённый account из БД.** ✅ подтверждено
`live/robinhood_broker.go:252-270`: кэш только в памяти (`b.account`), в БД пишется
(`SaveRobinhoodAccount`), но при старте не читается → лишний `get_accounts` в контуре T-1.

**AU-P2-3. `CancelOrder` шлёт наш идентификатор в поле `order_id`.** ✅ подтверждено
`live/robinhood_broker.go:229-236`. Сегодня вызывается с настоящими id Robinhood, контракт соблюдён,
но имя параметра и отсутствие `asUUID` делают любой будущий вызов с ref_id тихо неверным.

**AU-P2-5. Расчётный календарь не знает историю правил.** ✅ подтверждено
`tradingdate/holidays.go:70` — Juneteenth (`ObservedFixed(year, June, 19)`) включён для **всех** лет,
хотя NYSE в этот день работала до 2022. `ShortDayName` (`:124-129`) помечает `12-24` и `07-03`
сокращённым днём безусловно; когда 25.12/04.07 выпадает на субботу, наблюдаемый выходной — пятница,
т.е. **полное** закрытие, а не early close (2021-12-24, 2026-07-03, 2027-12-24).

**AU-P2-6. Псевдо-версионирование схемы.** ✅ подтверждено
`store/db.go:276-320`: `ensureColumn` покрывает 10 колонок 5 таблиц, остальные новые колонки живут
только в `CREATE TABLE IF NOT EXISTS` (для существующей таблицы — no-op);
`UPDATE schema_meta SET version=1` безусловно. Механизма версий нет, fail-fast «схема новее кода» нет.

**AU-P2-8. calc-хендлеры молча дефолтят битый JSON.** ✅ подтверждено
`httpapi/calc.go:60-64` — `readCalc` делает `_ = readJSON(...)`. Соседний `calcClean` (`:66-73`) уже
отвечает 400 — т.е. поведение внутри одного файла несогласовано.

**AU-P2-9. Нет graceful shutdown.** ✅ подтверждено
`cmd/server/main.go:49` — `ListenAndServe` без `signal.Notify`/`Shutdown`; in-flight расчёт на
десятки секунд обрывается по SIGTERM.

**AU-P2-10. Мёртвые переменные в compose/.env.example.** ✅ подтверждено (с поправкой)
`docker-compose.yml:21-25` и `.env.example:39-43` передают `DB_DIR`, `SETTINGS_FILE`, `WATCHES_FILE`,
`SPLITS_FILE`, `TRADE_HISTORY_FILE` — в Go-коде **0 упоминаний**; `TLS_CA`, `DOMAIN` — тоже 0.
Реально читаемых `FRONTEND_ORIGIN`, `WEBULL_TOKEN_EXPIRES_AT`, `WEBULL_LIVE_TEST_BUY_MAX_QUANTITY`,
`ROBINHOOD_ENABLE_LIVE_TEST_BUY` в `.env.example` нет.
**Поправка к аудиту:** `WEBULL_ENABLE_LIVE_TEST_BUY` в `.env.example` есть, а `ADMIN_USERNAME`
не мёртвая — читается в `httpapi/server.go:63`.

**Доки.** ✅ подтверждено: `go/INVENTORY.md` не содержит ни `robinhood/oauth`, ни `brokers/health`,
ни `trackers`, ни `readyz` (0 вхождений каждого).

### P3

- **AU-P3-1** `store/robinhood.go:15-26` — `GetRobinhoodOAuth` глотает ошибку скана: сбой БД
  неотличим от «не подключено». ✅
- **AU-P3-10** `httpapi/server.go:633` — статика через `io.ReadAll` без лимита и без кэш-заголовков
  вместо `http.ServeFile`. ✅
- **AU-P3-11** `web/js/api.js:11` — `Content-Type: application/json` ставится и на GET. ✅
- **AU-P3-12** `web/js/app.js:1468` — `API.authCheck()` внутри `navigate()`, т.е. сетевой запрос на
  **каждый** переход. ✅
- **AU-P3-13** `web/js/api.js:23-28` — `_unauthorizedFired` сбрасывается таймером 800 мс; при серии
  401 редирект на login может не сработать. ✅
- **UI 5.1.3** `app.js:1447-1452` — `toast()` перерисовывает `#overlay-root` целиком, таймер 2.5 c
  не отменяется при новом тосте. ✅
- **UI 5.1.4** `app.js:3687-3690` — `/broker` молча редиректит на `/webull` без объяснения. ✅
- **UI 5.1.2** `app.js:4212` — hero-чарт пересоздаётся (`Charts.destroy()` + `Charts.hero`) при любой
  смене параметра вместо `setData`. ✅ (перф-нит, не баг)

---

## 2. Находки аудита, **не подтвердившиеся** на текущем дереве

| Пункт аудита | Вердикт | Почему |
|---|---|---|
| 5.1.1 «полный пересбор shell при каждом `renderPage()`» | **Неверно** | `app.js:2918-2921`: shell собирается только если `#page-root` отсутствует, слушатели вешаются один раз через `bindShellOnce()`. Перерисовываются лишь `#page-root` и `#overlay-root`. |
| 5.1.8 «смена темы оставит старые цвета чартов» | **Неверно** | `app.js:2783-2795`: тумблер темы делает `applyTheme()` → `Charts.destroy()` → `afterRender()`, чарты пересоздаются с новым `isDark()`. |
| `WEBULL_ENABLE_LIVE_TEST_BUY` отсутствует в `.env.example` | **Неверно** | Присутствует. |
| `ADMIN_USERNAME` — мёртвая переменная Node-стека | **Неверно** | Читается в `httpapi/server.go:63`. |
| Раздел 9 п.1 «Go-тулчейна нет, тесты не прогнаны» | **Устарело** | `go vet`, `go test`, `-race` под двумя TZ — PASS (см. шапку). |

Дрейф ссылок (косметика): `scheduler.go:404-412` → фактически `:411-418`;
`monitor.go` использует `OpenBrokerTrade`, а не `OpenBrokerTradeFor`.

---

## 3. Роадмап

### Phase 0 — контур денег (гейт: без этого не торговать на двух брокерах одновременно)

1. **AU-P0-2** — закрыто `70b48b7`. `pollTracker` не падает на default, если named broker отвязан; `execution_unknown` + алерт.
2. **AU-P0-3** — закрыто `422bb35`. Pending-tracker API возвращает `(row, error)`; ошибка БД → `journal_unavailable`, не дубль.
3. **AU-P0-5** — закрыто `42ce972`. Coverage только по факту ответа Webull; фейк-holiday на хвосте не пишется. Удаление дня — существующий PATCH `/api/trading-calendar/day`.
4. **AU-P0-1** — закрыто `70b48b7` + `28e3423`. `brokerLabel()` в сообщениях исполнения / частичного / проскальзывания.
5. **AU-P0-4** — закрыто `30a4f57`. Consistency по всем открытым `broker_trades` и каждому подключённому брокеру.

**Гейт 0:** fault-injection тесты зелёные на `d090f36`.

### Phase 1 — планировщик, календарь, сообщения

6. **AU-P1-1** — закрыто `47676f8`. Claim слота + алерт пропущенного T-11/T-1; в JobLog есть `duration_ms` (гистограмма p50/p95 — не отдельный пайплайн).
7. **AU-P1-4** — закрыто `8347d72`. `lastActualizationAttemptDate` + лимит 3 попытки/день.
8. **AU-P1-5** — закрыто `47676f8` (расчётный short/holiday) + `2a56605` (виджет на Календарь/Мониторинг).
9. **AU-P1-3** — закрыто `d3bb33d`. Неподтверждённая цена → SQL NULL + заметка `fill_price_unconfirmed`.
10. **AU-P2-5** — закрыто `04cb27c`. Juneteenth с 2022; пятница перед субботним праздником — полный выходной.

**Гейт 1:** пропуск T-11 даёт алерт; короткий день без импорта — из `tradingdate`.

### Phase 2 — схема, HTTP, наблюдаемость

11. **AU-P2-6** — закрыто `dd98e5c`. `SchemaVersion=2`, миграции в транзакции, fail-fast если version > кода.
12. **AU-P2-1** — закрыто `1f73940`. Ошибка SQL-апдейта журнала логируется и ставит persist-block входа.
13. **AU-P2-9** — закрыто `ab22926`. SIGTERM → stop scheduler + `Shutdown` 60s.
14. **AU-P2-8** — закрыто `a32bf3c`. `readCalc`: битый JSON → 400.
15. **AU-P2-2/3** — закрыто `38c0722`. `account_number` из БД; CancelOrder отвергает non-UUID.
16. **AU-P2-10 + доки** — закрыто `14d2847`. Мёртвые env убраны; kill-switch'и и INVENTORY дописаны.
17. **AU-P3-1** — закрыто `422bb35`. `GetRobinhoodOAuthErr`; `T1ExecutionFinished` → `(bool, error)`.

**Гейт 2:** `go vet` / `go test` / `-race` PASS на `d090f36`.

### Phase 3 — UI/UX/перф

18. **AU-P3-12** — закрыто `2a56605`. `authCheck` не на каждый `navigate()`.
19. **AU-P3-13** — закрыто `493af08`. Debounce 401 по timestamp.
20. **AU-P3-10** — закрыто `a5842aa`. ServeFile + Cache-Control (js/css no-cache, fonts immutable).
21. **UI 5.1.2/5.1.3** — закрыто `2a56605`. `Charts.setHeroData`; toast `clearTimeout`.
22. **UI 5.1.4** — закрыто `2a56605` (тост про перенос `/broker` → `/webull`). **UI 5.1.5** единый error vs empty на брокерах — ещё открыт.
23. Доступность — закрыто `2a56605`. `role="dialog"` / `aria-modal`, focus-trap, Esc.
24. **AU-P3-11** — закрыто `493af08`. Content-Type не ставится на GET.

### Phase 4 — глубина (не блокер)

- Политика добора частичного входа (сейчас недобор = уменьшенная позиция с полным IBS-риском).
- MCP-сервер и youtube-клиент: полный разбор + тесты.
- Остатки прошлого `ROADMAP.md`: дифференциальная сверка бэктеста, корпус edge-кейсов сплитов,
  CSRF-токен, runbook бэкапа/восстановления (БД 0600, `restrictDBPerms` уже есть).

---

## 4. Требует runtime — статикой не закрывается [R]

1. **AU-P2-4** — пагинация `get_equity_orders` у Robinhood (`OrdersByState`/`OrderDetail` тянут весь
   список и фильтруют на клиенте). Нужен контракт MCP-тула.
2. Попадают ли rejected-заявки Robinhood в выдачу `get_equity_orders` — иначе после любого сбоя
   отправки всегда Ambiguous и rejected не распознаётся как rejected.
3. Политика Webull по остатку при `partially_filled`.
4. Семантика early-close/holiday у Webull-календаря против фактических торгов.
5. Ложные срабатывания детектора сплитов на сильных гэпах (допуск 3%).
6. Runtime SPA: все страницы обоих брокеров, мобильный UX, медленная сеть, гонка «быстрый переход
   пока летит fetch».
7. Миграция реальной прод-БД и репетиция восстановления.

---

## 5. Правило обновления

Документ живёт, пока открыт хотя бы один пункт AU-*. Каждое закрытие — коммит, в котором пункт
помечен закрытым с указанием хэша. Пункты [R] не считаются закрытыми по статике.
