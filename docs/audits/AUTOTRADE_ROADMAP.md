# Autotrade audit roadmap

Рабочий чеклист автоторговли. Аудит был read-only против `main @ 76272c1`; код с тех пор
закрыл этапы 0 и 2 целиком и большую часть 1 и 3. Этот файл — очередь оставшегося, а не
снимок того дерева.

Текущий `HEAD`: `3176141` (*Bound T-1 order placement by the session close*), 2026-09-04.
Рядом лежит `ROADMAP.md` — более ранний live-readiness аудит против `382a052`; он не очередь
исполнения.

Формат открытой задачи: где → что сейчас → почему неверно → что сделать → чем закрыть.
Пути от корня репозитория (`go/...`), символы — по именам функций, не по номерам строк.

Пуш и деплой по этому файлу не запускать. Правило — в `CLAUDE.md`, раздел
«Пуш и деплой — только по прямой просьбе».

---

## Статус

| ID | Тема | Статус | Закрыто |
|---|---|---|---|
| P0-1 | `Execute` всегда через `executeAll` | закрыто | `1f1fa97` |
| P0-2 | `execution_unknown` больше не вечная блокировка | закрыто | `274d882` |
| P0-3 | «Закрыть» на Robinhood не шлёт SELL в Webull | закрыто | `274d882` |
| P0-4 | Гейт здоровья Webull читает классифицированный статус | закрыто | `ac91a1e` |
| P0-5 | Пустой мониторинг не запирает открытую позицию | закрыто | `4209a05` |
| P0-6 | Тело ответа брокера на placement проверяется | закрыто | `16051f9` |
| P1-1 | Бюджет T-1 ограничен закрытием сессии | закрыто | `3176141` |
| P1-2 | Планировщик однопоточный, тик блокируется | **открыто** | |
| P1-3 | Fill / сверка / проекция / `skipPlace` без измерения брокера | **открыто** | |
| P1-4 | Частичный выход не дозакрывается | **открыто** | |
| P1-5 | Отмена своих заявок не работает для Robinhood | **открыто** | |
| P1-6 | Резерв на проскальзывание во всех режимах капитала | закрыто | `6e4f820` |
| P1-7 | Telegram HTML без экранирования | **открыто** | |
| P1-8 | Снятие `trackerPersistFail` | закрыто | `274d882` |
| P1-9 | Подпись брокера в уведомлениях и гонка кэша RH | **открыто** | |
| P2-1 | UI читает Entries/Exits так же, как движок | закрыто | `381fe9f` |
| P2-2 | Мастер-тумблер больше не переписывает Webull | закрыто | `381fe9f` |
| P2-3 | Вкладка автоторговли разделена по брокеру | закрыто | `381fe9f` |
| P2-4 | Окно исполнения и порог проскальзывания описаны честно | закрыто | `381fe9f` + `6e4f820` |
| P2-5 | `CLAUDE.md` описывает T-11 / T-1, как код | закрыто | `1fd2a60` |
| P2-6 | Robinhood-котировка без постмаркета; провайдер в UI | закрыто | `381fe9f` |
| P2-7 | Ротация `autotrade_logs` после закрытия | закрыто | `991a977` |
| P2-8 | `lastModifiedAt` и health-статус в UI | закрыто | `ac91a1e` |
| P3-1 | SQLite с токенами — `0600` / каталог `0700` | закрыто | `2940eca` |
| P3-2 | Потолок тестовой покупки Robinhood | закрыто | `2940eca` |
| P3-3 | Замер удержания SQLite на T-1 | **открыто** | |
| P3-4 | Модель CSRF зафиксирована в `ENVIRONMENT.md` | закрыто | `2940eca` |

Этап 0 закрыт. Этап 2 закрыт. Этап 1 — шесть из девяти. Этап 3 — три из четырёх.

---

## Порядок оставшегося

| Очередь | Задачи | Условие |
|---|---|---|
| 1 | P1-3, затем P1-4 и P1-5 | Тест «две книги»: позиция и pending-exit на `robinhood` не мешают входу на `webull`; `skipPlace` per-broker |
| 2 | P1-2 | Долгая задача не съедает тик T-1; пропуск минуты `until == 1` не пропускает торговый день |
| 3 | P1-7, P1-9 | Аварийное Telegram-сообщение с `<`/`&` уходит; подпись совпадает с брокером трекера; `-race` на кэше счёта RH |
| 4 | P3-3 | Есть замер, батч логов котировок; `MaxOpenConns` без замера не трогать |

`P1-1` уже закрыт, дедлайн протаскивать в P1-2 второй раз не нужно: `execWindow` есть.
`P1-4` опирается на per-broker журнал из P1-3 — иначе дозакрытие остатка уйдёт не тому брокеру.

Автоторговлю на двух брокерах одновременно не включать, пока открыт P1-3.

---

# Очередь

## P1-2. Планировщик однопоточный, тяжёлые задачи выполняются прямо в тике

**Где:** `go/internal/scheduler/scheduler.go` → `StartWith`, `RunTick`;
`go/internal/live/actualize.go` → `actualizeDelay`
(`PRICE_ACTUALIZATION_REQUEST_DELAY_MS`, по умолчанию 15000 мс на тикер).

**Что сейчас:** единственная горутина в `StartWith` на каждом тике синхронно вызывает
`RunTick`. Тот внутри того же стека дергает `RunTelegramAggregation`, `eng.PollTrackers`,
`RunTokenHealth`, `RunPriceActualization`, `RunCalendarExtend`. `Actualize` спит 15 с + джиттер
перед каждым тикером, кроме первого. `RunTelegramAggregation` по-прежнему выходит сразу, если
`until != 11 && until != 1`.

**Почему неверно:** на 20 тикерах постзакрытийная актуализация держит цикл около пяти минут —
всё это время трекеры не опрашиваются. `time.Ticker` при занятом получателе глотает тики (буфер
1), поэтому длинный `Aggregate` может съесть минуту `until == 11` или `until == 1`.

**Что сделать:**

1. Разнести задачи по независимым горутинам с собственными «уже выполняется» флагами
   (`atomic.Bool` на задачу), тик остаётся диспетчером и никогда не блокируется.
2. Аггрегацию T-11/T-1 оставить приоритетной: она не должна ждать актуализацию или health-check.
3. Окно аггрегации сделать устойчивым к пропуску тика: помимо `until == 11 || until == 1`
   разрешить срабатывание, если минута окна уже прошла, но лизинг/`aggregate_send_state` за
   сегодня ещё не выставлены и до закрытия остаётся больше маржи безопасности.

**Чем закрыть:** тест в `go/internal/scheduler/scheduler_test.go`: задача-долгожитель (спит 60 с)
не мешает `RunTick` выполнить аггрегацию на следующем тике; пропуск ровно минуты `until == 1` не
приводит к пропуску торгового дня.

---

## P1-3. Ожидание fill, сверка и проекция позиций не знают о брокерах

**Где:** `go/internal/live/track.go` → `awaitFlatAfterExit`;
`go/internal/live/monitor.go` → `Consistency`, `UpdatePositions`;
`go/internal/live/actualize.go` → `UpdatePositions`;
`go/internal/live/telegram.go` → `openMonitorTrade`, `runT1Orders`;
`go/internal/live/autotrade.go` → `t1BrokerReconcile`.

**Что сейчас:**

```go
func (e *Engine) awaitFlatAfterExit() bool {
    rows, _ := e.DB.ListTrades("broker_trades")
    if store.OpenBrokerTrade(rows) == nil { return true }   // без имени брокера
    t := e.DB.FindPendingTracker("", "exit")                // без имени брокера
    ...
}
```

`Consistency` строит `openB := store.OpenBrokerTrade(broker)` — первую открытую строку любого
брокера. `UpdatePositions` проецирует ту же одну строку на watches. `t1BrokerReconcile` при
открытой заявке **любого** брокера возвращает `skipPlace=true` на весь цикл.

Колонка `broker` в `broker_trades` и в `order_trackers` уже есть, и
`OpenBrokerTradeFor`/`FindPendingTrackerBroker` уже умеют её учитывать — эти пути просто не
используют.

**Почему неверно:** открытая позиция на Robinhood блокирует повторный вход на Webull;
`Consistency` выдаёт `live_broker_position_without_journal` на ровном месте, а этот код входит в
`blockingMismatchCodes` и останавливает **весь** T-1 у всех брокеров. Одна незакрытая заявка у
любого брокера ставит `skipPlace` для всех.

**Что сделать:**

1. `awaitFlatAfterExit(broker string)` — `OpenBrokerTradeFor(rows, broker)` и
   `FindPendingTrackerBroker("", "exit", broker)`. Вызов из `runT1Orders` — по каждому брокеру,
   который реально отправил выход (список брать из результата `executeAll`).
2. `Consistency()` → `ConsistencyFor(broker)` плюс агрегат по всем брокерам.
   `BlockingMismatch` должен возвращать множество «брокер → проблема», а `Aggregate` —
   пропускать только затронутых, а не весь цикл.
3. `UpdatePositions` — проекция на watch-строки должна учитывать позиции всех брокеров
   (`isOpenPosition` = держит хотя бы один); поле `currentTradeId` требует решения, какой из
   двух журналов показывать — зафиксировать в комментарии.
4. `t1BrokerReconcile` — `skipPlace` должен быть per-broker, а не глобальный.

**Чем закрыть:** тест «две книги» в `go/internal/live/execute_all_test.go`: открытая позиция и
pending-exit на `robinhood` не мешают входу на `webull`; `Consistency` не выдаёт блокирующих
кодов, когда каждая позиция объяснена журналом своего брокера. Отдельный тест:
`t1BrokerReconcile` при рабочей заявке на `robinhood` не ставит `skipPlace` для `webull`.

---

## P1-4. Частичное исполнение выхода не дозакрывается

**Где:** `go/internal/live/trade_record.go` → `recordFill`, ветка
`if partial { ... if action == "exit" { e.reduceOpenQuantity(...); return } }`.

**Что сейчас:** остаток уменьшает `quantity` в `broker_trades` и `trades`, трекер финализируется,
в Telegram уходит «частичное исполнение». Новая заявка на остаток не ставится ни сейчас, ни на
следующем T-1: `decideLiveAction` выдаст `exit` только если IBS снова окажется выше `highIBS`.
Лог `order_partially_filled` для входа уже есть.

**Почему неверно:** позиция остаётся частично открытой в состоянии, которого стратегия не
предусматривает, и никакой автоматики для её закрытия нет.

**Что сделать:**

1. После `reduceOpenQuantity` при `action == "exit"` и остатке > 0 — повторная рыночная заявка на
   остаток в том же цикле, с собственным лимитом попыток (1–2) и с проверкой дедлайна из `P1-1`
   (`execWindow`). Брокера брать из `meta.Broker`, не из `e.Broker`.
2. Если дозакрыть не удалось — статус позиции пометить явно (поле `notes` или отдельный флаг) и
   отправить уведомление с прямым указанием: «остаток N шт., требуется ручное закрытие».
3. Вход не менять: при частичном входе в журнал пишется `reportedQty`. В отчёт T-1 должен
   попадать уже существующий лог `order_partially_filled`.

**Чем закрыть:** тест в `go/internal/live/correctness_test.go`: выход исполнен на 60 %, брокер
подтверждает вторую заявку → позиция закрыта, в журнале одна закрытая строка; вариант, где
вторая заявка отклонена → позиция остаётся с остатком и уходит уведомление.

---

## P1-5. Отмена собственных заявок перед входом не работает для Robinhood

**Где:** `go/internal/live/autotrade.go` → `cancelOpenOrdersBeforeEntry`;
`go/internal/live/robinhood_broker.go` → `CancelOrder`, `collectOrders`.

**Что сейчас:**

```go
id := strings.TrimSpace(fmt.Sprint(firstNonEmpty(m["client_order_id"], m["clientOrderId"])))
if id == "" || id == "<nil>" { continue }
if !e.DB.IsOwnOrder(id) { ...; continue }
if err := br.CancelOrder(id); err != nil { ... }
```

Заявки Robinhood несут `ref_id` и внутренний `id`; ключей `client_order_id`/`clientOrderId` у них
нет. Даже при совпадении `CancelOrder` кладёт наш `ref_id` в поле `order_id`.

**Почему неверно:** незакрытая заявка на том же тикере доживает до входа и может исполниться
поверх нового объёма. Тихий пропуск (`id == ""` → `continue`) не логируется как проблема.

**Что сделать:**

1. Добавить в список ключей `ref_id` (и `refId`) при извлечении идентификатора.
2. Хранить соответствие `ref_id → внутренний order id` в трекере (колонка `broker_order_id` в
   `order_trackers` уже есть в схеме — заполнять из ответа `place_equity_order` и из
   `OrderDetail`); `RobinhoodBroker.CancelOrder` отменять по внутреннему id.
3. Если идентификатор не удалось определить — не молчать, а `logAuto("open_order_id_unresolved",
   ...)` и считать это блокирующим для входа (лучше пропустить день, чем войти поверх чужой
   заявки).

**Чем закрыть:** тест в `go/internal/live/robinhood_broker_test.go`: открытая заявка с `ref_id`,
принадлежащая движку, отменяется; чужая — нет; заявка без распознаваемого id блокирует вход.

---

## P1-7. Telegram: `parse_mode=HTML` без экранирования подставляемого текста

**Где:** `go/internal/live/transport.go` → `HTTPTelegram.Send`
(`"parse_mode": "HTML"`); все вызовы `e.Send(...)` с `fmt.Sprintf`, в частности
`markExecutionUnknown`, `startTracking` (ошибка сохранения трекера), `submitEvaluated`
(«статус отправки неизвестен»), `warnOnSlippage`, `finalizeTrackerStatus`.

**Что сейчас:** символы, статусы и **тексты ошибок брокера** вставляются в разметку как есть.
`HTTPTelegram.Send` при 400 не повторяет отправку без `parse_mode`.

**Почему неверно:** `<` или `&` в сообщении брокера ломают разметку, Telegram отвечает 400, и
сообщение не уходит вовсе. Это касается именно аварийных уведомлений — того единственного класса
сообщений, ради которого канал существует.

**Что сделать:**

1. Добавить `tgEscape(s string) string` (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`) и применить ко
   всем подставляемым значениям; теги `<b>` остаются в шаблоне, а не в данных.
2. В `HTTPTelegram.Send` при ответе 400 с описанием, содержащим `can't parse entities`,
   повторить отправку без `parse_mode` — сообщение важнее оформления.

**Чем закрыть:** тест в `go/internal/live/transport_telegram_test.go`: символ и текст ошибки с
`<`/`&` дают корректно экранированное тело; заглушка, возвращающая 400 на HTML, приводит к
повторной отправке в plain text.

---

## P1-9. Подпись брокера в уведомлениях и гонка на кэше счёта Robinhood

**Где:** `go/internal/live/track.go` → `finalizeTrackerStatus` (`"<b>Webull исполнено</b>"`,
`"<b>Webull статус заявки</b>"`); `go/internal/live/trade_record.go` → `warnOnSlippage`,
сообщение о частичном исполнении; `go/internal/live/robinhood_broker.go` → `agenticAccount`.

**Что сейчас:** все финальные уведомления подписаны «Webull», хотя `t["broker"]` в трекере есть.
`RobinhoodBroker.agenticAccount()` пишет `b.account` без синхронизации, а к одному экземпляру
брокера параллельно ходят колёса трекеров (`go e.trackerWheel(...)`), тик планировщика и
HTTP-обработчики.

**Что сделать:**

1. Функция `brokerLabel(name string) string` (`webull` → `Webull`, `robinhood` → `Robinhood`),
   применить во всех уведомлениях; имя брать из `t["broker"]` / `meta.Broker`.
2. `RobinhoodBroker`: `mu sync.Mutex` вокруг чтения/записи `account`, либо `atomic.Pointer`.

**Чем закрыть:** тест на текст уведомления для трекера с `broker="robinhood"`; тест с
параллельным вызовом `Positions()`/`Account()` из нескольких горутин под `-race`.

---

## P3-3. Вся БД сериализована на одном соединении

**Где:** `go/internal/store/db.go` → `Open` (`SetMaxOpenConns(1)`, `busy_timeout=5000`).

Решение осознанное (WAL + `modernc.org/sqlite`), но на T-1 в одну очередь встают: чтение
настроек и наблюдений, журнал, трекеры, лизинг, лог каждой попытки котировки, плюс параллельные
запросы из открытого браузера.

**Что сделать:** замерить время удержания соединения на T-1 (лог с длительностью каждого запроса
за минуту до закрытия); вынести логирование котировок в буфер с батч-записью после отправки
заявок. Менять `MaxOpenConns` без замеров не нужно.

**Чем закрыть:**

1. Тест, что `MaxOpenConns` остаётся 1 (`go/internal/store/db_test.go`).
2. Буфер `logQuoteProblem` с flush после `Execute`: при пачке неудачных котировок T-1 не делает
   отдельный `INSERT` на каждую попытку до отправки заявки.
3. Лог длительности запросов внутри T-1-цикла (`db_hold_ms` или эквивалент) — достаточно, чтобы
   следующий замер читался из `autotrade_logs`, без смены `MaxOpenConns`.

---

# Закрыто

Кратко, что изменилось и чем это ловится. Исходная формулировка аудита сохранена в git:
`git show 2940eca:AUTOTRADE_ROADMAP.md`.

## Этап 0

- **P0-1** `1f1fa97`. `Execute` / `ExecuteCtx` / `executeWindow` всегда идут через `executeAll`,
  включая ноль и одного брокера. Тесты: `go/internal/live/execute_all_test.go`.
- **P0-2** `274d882`. `execution_unknown` снова в `ListPendingTrackers`; ручной resolve
  `POST /api/autotrade/trackers/{id}/resolve`; в SPA кнопки «Исполнено у брокера» / «Заявки нет».
  Тесты: `go/internal/live/p0_listing_lag_test.go`, `go/internal/httpapi/tracker_resolve_test.go`.
- **P0-3** `274d882`. Обработчик `data-close-pos` ветвится по `kind`. Тест:
  `TestBrokerCloseHandlerDispatchesByKind`.
- **P0-4** `ac91a1e`. `webullHealthJob` пишет классифицированный статус, сырой — в
  `last_check_raw`. Тесты: `go/internal/live/p0_4_webull_health_test.go`, `health_test.go`.
- **P0-5** `4209a05`. Выход смотрит на открытую строку, а не на список watches. Тест:
  `go/internal/live/correctness_test.go`.
- **P0-6** `16051f9`. Бизнес-код в теле Webull и `state` Robinhood больше не проходят как
  успех. Тесты: `go/internal/webull/client_test.go`, `webull_broker_test.go`,
  `p0_6_rejected_order_test.go`, `robinhood_broker_test.go`.

## Этап 1 (закрытая часть)

- **P1-1** `3176141`. `execWindow` с дедлайном `close − safetyMargin`; HTTP/MCP берут
  `context`. Тест: `go/internal/live/p1_roadmap_test.go`.
- **P1-6** `6e4f820`. Минимальный резерв 0.5 % во всех режимах, `entryReservePct`, связь с
  `maxSlippageBps`. Тест: `go/internal/live/sizing_test.go`.
- **P1-8** `274d882`. Снятие `trackerPersistFail` через API и кнопку в SPA. Тест:
  `go/internal/live/p1_8_tracker_persist_block_test.go`.

## Этап 2

- **P2-1 … P2-4, P2-6** `381fe9f` (P2-4 дополнительно подправлен в `6e4f820` после того, как
  порог проскальзывания начал влиять на сайзинг). Тесты: `go/internal/httpapi/ui_test.go`,
  `engine_test.go`, `go/internal/providers/client_test.go`.
- **P2-5** `1fd2a60`. В `CLAUDE.md` зафиксированы T-11 (обзор) и T-1 (решение и заявки).
- **P2-7** `991a977`. Ротация после закрытия, настройки `autotradeLogRetentionDays` /
  `autotradeLogMaxRows`. Тест: `go/internal/scheduler/log_rotation_test.go`.
- **P2-8** `ac91a1e`. `sanitizeAutoTradingConfig` штампует `lastModifiedAt` часами движка;
  health в UI больше не сравнивает сырое `NORMAL` с `'OK'`.

## Этап 3 (закрытая часть)

- **P3-1, P3-2, P3-4** `2940eca`. `store.Open` ставит `0600`/`0700`; тестовая покупка RH
  повторяет потолок Webull; CSRF-модель и оговорка про `TRUST_PROXY` — в `ENVIRONMENT.md`.

---

# Что не трогать

Эти места разобраны и работают правильно; при рефакторинге по открытым задачам их поведение
должно сохраниться, желательно под теми же тестами.

- **Идемпотентность отправки.** `placeMarket` выбирает `client_order_id` до запроса; после сбоя
  `orderLanded` спрашивает брокера именно по этому id; `ErrOrderUnavailable` трактуется как «не
  знаем» (`Ambiguous`), а не как «заявки нет». `go/internal/live/autotrade.go`.
- **Разделение состояний T-1.** `BeginT1Attempt` / `MarkT1ExecutionFinished` /
  `MarkT1ReportSent` разводят «исполнение завершено» и «отчёт отправлен», поэтому упавшая отправка
  в Telegram не приводит к повторным заявкам. `go/internal/store/live_persist.go`.
- **Пороги IBS.** Живой путь и бэктест ходят через `ibs.IsEntrySignal` / `ibs.IsExitSignal`;
  строгость сравнения с обеих сторон закреплена тестами.
- **Проверка целостности цен.** `EvaluatePriceIntegrity` блокирует сигналы при неучтённом сплите.
  `go/internal/live/integrity.go`.
- **Цепочка котировок.** High, low и current всегда от одного провайдера; провайдеры с дневными
  барами (`alpha_vantage`, `twelve_data`, `polygon`) сознательно исключены из живого решения.
  `last_extended_hours_trade_price` не является кандидатом на `current` (P2-6).
- **Инвариант дат.** Торговая дата остаётся строкой `YYYY-MM-DD` на всех путях автоторговли;
  `time.Time` появляется только на wall-clock с явной зоной `America/New_York`.
- **Защита от чужих заявок.** `IsOwnOrder` не даёт отменить заявку, которую движок не ставил
  (`foreign_order_left_open`).
- **Одно соединение SQLite.** `MaxOpenConns=1` — осознанно. P3-3 меряет, не меняет.

---

# Проверка после каждого этапа

```bash
cd go && go vet ./... && TZ=Pacific/Auckland go test ./... && TZ=America/Los_Angeles go test ./...
```

```bash
cd go && go test -race ./internal/live/ ./internal/scheduler/ ./internal/store/
```

```bash
rg "time.Parse|new Date\(|toISOString|toLocaleDateString" go --glob '!*_test.go'
```

Каждое совпадение последнего grep должно быть либо wall-clock с явной биржевой зоной, либо явно
зафиксированный UTC на границе с внешним API.

После закрытия пункта: обновить строку в таблице «Статус», перенести текст из «Очередь» в
«Закрыто» с хешем коммита. Не пушить и не деплоить без прямой просьбы.
