# Autotrade audit roadmap

Аудит read-only подсистемы автоторговли. Состояние кода: `main @ 76272c1` плюс незакоммиченные
правки в `go/internal/live/autotrade.go`, `go/internal/live/telegram.go`,
`go/internal/scheduler/scheduler.go` (см. `P1-8`, `P1-1`, `P1-3` — они учтены).

На момент аудита: `go test ./...` зелёные, `go test -race ./internal/live/ ./internal/scheduler/`
чисто. Все находки статические, ни одна не воспроизводится существующими тестами.

Формат каждой задачи: где → что сейчас → почему неверно → что сделать → чем закрыть.
Пути указаны от корня репозитория (`go/...`), символы — по именам функций, не по номерам строк.

---

## Порядок выполнения

| Этап | Задачи | Условие перехода дальше |
|---|---|---|
| 0 | P0-1 … P0-6 | Все шесть регресс-тестов из раздела «Чем закрыть» проходят |
| 1 | P1-1 … P1-9 | Тест «две книги» и тест дедлайна T-1 проходят |
| 2 | P2-1 … P2-8 | UI и движок дают одинаковый ответ на вопрос «войдёт ли сегодня» |
| 3 | P3-1 … P3-4 | — |

Зависимости между задачами:

- `P0-1` меняет точку входа исполнения. Делать первым: `P1-3`, `P2-1`, `P2-2` опираются на
  результат.
- `P0-2` и `P1-8` — одна и та же форма проблемы (вечная блокировка без выхода). Разумно делать
  одним заходом и одним UI-экраном.
- `P1-1` (дедлайн) должен идти до `P1-2` (разнос планировщика по горутинам), иначе дедлайн
  придётся протаскивать дважды.

---

# Этап 0 — блокирующие

## P0-1. `Execute` при одном брокере не проверяет ни флаги брокера, ни его книгу

**Где:** `go/internal/live/autotrade.go` → `func (e *Engine) Execute(trigger string)`;
`go/internal/live/execute_all.go` → `executeAll`, `submitEvaluated`, `brokerFlags`.

**Что сейчас:**

```go
func (e *Engine) Execute(trigger string) EvalResult {
    ev := e.Evaluate()
    snaps := e.brokerSnapshot()
    if len(snaps) > 1 {
        return e.executeAll(ev, trigger, corr, snaps)   // корректный путь
    }
    ...
    if len(snaps) == 1 { br, name = snaps[0].br, snaps[0].name } else { br = e.defaultBroker() }
    return e.submitEvaluated(ev, trigger, corr, name, br)
}
```

`ev.Decision` приходит из `Evaluate()`, а там:

- книга: `e.booksFor("webull", e.defaultBroker(), brokerTrades)` — жёстко `"webull"` и
  `e.Broker`;
- разрешения: `allowExits := anyAllow(cfg, "allowExits")`, `allowEntries := anyAllow(cfg,
  "allowNewEntries")` — истинно, если флаг стоит **хотя бы у одного** брокера.

`submitEvaluated` из проверок конфигурации делает только `ev.AutoTrading["enabled"]`.
`brokerFlags()` вызывается исключительно из `executeAll`.

**Почему неверно:**

1. `brokers.webull.enabled = false` при единственном Webull не останавливает торговлю — галочка
   «Включено» в настройках не читается на этом пути.
2. `brokers.robinhood.allowNewEntries = true` при выключенном Webull разрешает вход **на Webull**
   через `anyAllow`.
3. Конфигурация «только Robinhood» (нет `WEBULL_APP_KEY` → `e.Broker == nil`, RH прикреплён через
   `AttachBroker`): `booksFor("webull", nil, rows)` даёт `held = {}` и `open = nil`, потому что
   `heldSymbolsOn(nil)` возвращает пустую карту, а `OpenBrokerTradeFor(rows, "webull")` не видит
   строк с `broker = "robinhood"`. Решение — `entry` поверх уже открытой позиции Robinhood.
   Guard по pending-трекеру это не ловит: трекер уже финализирован fill-ом.

**Что сделать:**

- Убрать ветку `len(snaps) > 1`. `Execute` всегда идёт через `executeAll`, включая случаи с одним
  и с нулём брокеров.
- В `executeAll` обработать `len(snaps) == 0`: вернуть `ev` с
  `Decision.reason = "no_broker_configured"` и залогировать `execution_skipped`.
- `Evaluate()` оставить как есть (это витрина для UI и Telegram), но добавить в `EvalResult` поле
  с решениями по брокерам, чтобы UI не показывал webull-решение как общее. Минимально: заполнять
  `ev.Broker` картой `{broker: decision}` и на пути одного брокера тоже.

**Чем закрыть:** тесты в `go/internal/live/execute_all_test.go`:

1. один брокер `webull`, `autoTrading.enabled=true`, `brokers.webull.enabled=false`, сигнал входа
   есть → заявка не отправлена, в логе `execution_skipped` с `reason=...`;
2. один брокер `webull`, `brokers.webull.allowNewEntries=false`,
   `brokers.robinhood.allowNewEntries=true` → входа нет;
3. `e.Broker == nil`, прикреплён только `robinhood`, в `broker_trades` открытая строка с
   `broker="robinhood"`, сигнал входа есть → решение `none`, заявка не отправлена;
4. брокеров нет вовсе → `Execute` не паникует, отдаёт `none`.

---

## P0-2. Статус `execution_unknown` навсегда блокирует входы

**Где:** `go/internal/store/live_persist.go` → `listBlockingTrackers`, `ListPendingTrackers`;
`go/internal/live/track.go` → `markExecutionUnknown`, `pollTracker`, `expireStaleTrackers`;
`go/internal/store/robinhood.go` → `AnyPendingTrackerFor`, `FindPendingTrackerBroker`.

**Что сейчас:**

```sql
-- ListPendingTrackers
WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent','execution_unknown')
-- listBlockingTrackers
WHERE status NOT IN ('filled','cancelled','canceled','rejected','expired','terminal_absent')
```

`listBlockingTrackers` питает `AnyPendingTrackerFor`, который в `submitEvaluated` гасит любой вход
(`reason: "pending_tracker"`). `ListPendingTrackers` питает `PollTrackers`, `ResumeTrackers`,
`expireStaleTrackers`.

**Почему неверно:** трекер со статусом `execution_unknown` больше никогда не опрашивается, не
истекает и не может быть закрыт, но продолжает блокировать входы. Ни HTTP-эндпоинта, ни кнопки в
SPA для его разбора нет (`grep -rn "execution_unknown" --include='*.go' --include='*.js'` даёт
только запись и два SQL-фильтра). При этом заявка могла реально исполниться — тогда позиция
существует, а в `broker_trades` её нет, и `Consistency` выдаст
`live_broker_position_without_journal`, который входит в `blockingMismatchCodes` и остановит
весь T-1.

**Что сделать:**

1. Вернуть `execution_unknown` в `ListPendingTrackers` — листинг брокера обычно догоняет, и
   следующий `OrderDetail` разрешит статус сам. Чтобы это не крутилось вечно, добавить в
   `expireStaleTrackers` отдельную ветку: `execution_unknown` со `staleDay == true`
   переводится в терминальный `unresolved` только после успешного (не ошибочного) ответа брокера
   либо по явному действию оператора.
2. Добавить эндпоинт разрешения: `POST /api/autotrade/trackers/{clientOrderId}/resolve` с телом
   `{"outcome":"filled"|"absent","filledPrice":num,"filledQty":num,"note":string}`.
   - `absent` → `finalizeTracker(t, "terminal_absent")` (сработает `deletePhantom`);
   - `filled` → синтетический `detail` и `finalizeTrackerStatus(t, detail, "filled")`, чтобы
     `recordFill` записал строку в журнал.
   - В обоих случаях писать `logAuto("tracker_resolved_manually", ...)` с автором действия.
3. В SPA, вкладка `autotrade` (`go/web/js/app.js`, блок `Pending / last tracked orders`):
   строки со статусом `execution_unknown` и `tracker_persist_failed` подсвечивать и давать две
   кнопки «Исполнено у брокера» / «Заявки нет», обе с `window.confirm`.

**Чем закрыть:** тест в `go/internal/live/p0_listing_lag_test.go`:

- брокер отдаёт `ErrOrderUnavailable` дольше `ListingLagWait` → статус `execution_unknown`,
  вход заблокирован;
- затем брокер начинает отвечать `filled` → следующий `PollTrackers` записывает сделку и снимает
  блокировку без ручного вмешательства;
- отдельный тест: `resolve` с `outcome=absent` снимает блокировку и удаляет фантомную строку.

---

## P0-3. Кнопка «Закрыть» на странице Robinhood отправляет SELL в Webull

**Где:** `go/web/js/app.js` — рендер `pageBroker`, ветка `tab === 'positions'`
(`data-close-pos`), и обработчик ниже:

```js
root.querySelectorAll('[data-close-pos]').forEach((b) => b.addEventListener('click', async () => {
  if (!window.confirm('Закрыть позицию ' + b.dataset.closePos + ' рыночным ордером в Webull?')) return;
  try { const r = await API.closePosition(b.dataset.closePos); ... }
}));
```

**Почему неверно:** `pageBroker` общий для `/webull` и `/robinhood`
(`const kind = state.page === '/robinhood' ? 'robinhood' : 'webull'`), а обработчик жёстко зовёт
`API.closePosition` → `POST /api/autotrade/webull/close-position`. `API.rhClose` объявлен в
`go/web/js/api.js` и не используется нигде. Текст подтверждения на странице Robinhood говорит
«в Webull». Если тикер держится на обоих счетах — продаётся не та позиция.

**Что сделать:** в обработчике взять тот же `kind`, что и в рендере, и вызвать
`kind === 'robinhood' ? API.rhClose(sym) : API.closePosition(sym)`; в тексте `confirm`
подставлять имя брокера. Проверить тем же способом остальные общие обработчики вкладки
(`auto-test-buy` → `API.testBuy` — webull-эндпоинт, см. `P2-3`).

**Чем закрыть:** проверка в `go/internal/httpapi/ui_test.go` или в
`go/web/js/charts_map_test.cjs`-стиле: в исходнике `app.js` обработчик `data-close-pos` содержит
обе ветки и не содержит безусловного `API.closePosition`.

---

## P0-4. Гейт здоровья Webull сравнивает разные словари статусов

**Где:** `go/internal/live/execute_all.go` → `storedHealthStatus`;
`go/internal/live/autotrade.go` → `CanSubmit`; `go/internal/scheduler/scheduler.go` →
`webullHealthJob`; `go/internal/store/db.go` → `UpsertWebullHealth`;
`go/internal/store/live_persist.go` → `SaveWebullToken`.

**Что сейчас:**

```go
func (e *Engine) storedHealthStatus(name string) string {
    if name == "robinhood" {
        return strings.ToUpper(strings.TrimSpace(e.DB.GetRobinhoodOAuth().LastCheckStatus))
    }
    return strings.ToUpper(strings.TrimSpace(e.DB.GetWebullToken().LastCheckStatus))
}
// использование:
if st == HealthNeedsReauth || st == HealthMissing { ...skip... }
```

В `webull_token.last_check_status` пишется сырой статус Webull: `TokenHealth()` кладёт туда
ответ `CheckToken` (`NORMAL`, `PENDING`, …), `webullHealthJob` — то же значение через
`UpsertWebullHealth(todayET, recorded, ...)`, где `recorded := raw`.

**Почему неверно:** `HealthNeedsReauth = "NEEDS_REAUTH"`, `HealthMissing = "MISSING"` — этих строк
в колонке не бывает никогда. Гейт мёртв. Маппинг существует (`ClassifyWebullHealth` в
`go/internal/live/health.go`, там `PENDING` → `NEEDS_REAUTH`), но применяется только к выдаче
`BrokersHealth` для UI. У Robinhood ветка работает, потому что `robinhoodHealthJob` пишет уже
нормализованное значение через `RecordedHealth`.

**Что сделать:** одно из двух, второе предпочтительнее.

- (a) В `storedHealthStatus` для webull прогонять через `ClassifyWebullHealth(row.Token,
  row.LastCheckStatus, row.ExpiresAt, e.now())`.
- (b) Симметрично Robinhood: в `webullHealthJob` записывать в `last_check_status` уже
  классифицированное значение, а сырой ответ Webull хранить отдельной колонкой
  `last_check_raw` (миграция в `initSchema` + `HasColumn`-гейт в `/readyz`).

Заодно: `BrokersHealth` возвращает `RecordedHealth(w.LastCheckStatus, st)`, то есть при
недоступности отдаёт в поле `status` сырое `NORMAL`, а SPA сравнивает с `'OK'` и красит в
красный (см. `P2-8`) — вариант (b) закрывает и это.

**Чем закрыть:** тест в `go/internal/live/health_test.go` + `execute_all_test.go`:
токен со статусом `PENDING` → `CanSubmit() == false` и `executeAll` пропускает брокера с
`reason=NEEDS_REAUTH`.

---

## P0-5. Пустой список мониторинга запирает открытую позицию

**Где:** `go/internal/live/autotrade.go` → `decideLiveAction`;
`go/internal/live/telegram.go` → `Aggregate`.

**Что сейчас:**

```go
func decideLiveAction(quotes, symbols, held, heldErr, open, allowEntries, allowExits) map[string]any {
    if len(symbols) == 0 {
        return none("empty_symbol_universe", nil, nil)   // раньше ветки выхода
    }
    if open != nil && allowExits { ... }
```

и раньше по стеку, в `Aggregate`:

```go
watches, _ := e.DB.ListWatches()
if len(watches) == 0 {
    emaAlerts := e.EvaluateEMAAlerts()
    if len(emaAlerts) == 0 { out.Reason = "no_watches"; return out, nil }
}
```

`configuredSymbols` строится исключительно из `ListWatches()`.

**Почему неверно:** список наблюдения определяет, **что покупать**. Он не должен определять,
**закрывать ли то, что уже куплено**. Убрали тикер со страницы «Мониторинг», пока позиция
открыта — выход не исполнится никогда, а `UpdatePositions` ещё и снимет `isOpenPosition` с
исчезнувшей записи.

**Что сделать:**

1. В `decideLiveAction` перенести проверку `len(symbols) == 0` **после** блока
   `if open != nil && allowExits`. Для выхода символ берётся из `open["symbol"]`, а не из
   `symbols`.
2. Котировка для символа открытой позиции должна запрашиваться всегда: в `Evaluate` добавить
   символ из `open` в список для `prefetchQuotes` и в `quotes`, даже если его нет в
   `configuredSymbols`. Пороги для него — из `cfg` (watch-строки уже нет).
3. В `Aggregate` не возвращать `no_watches`, если `store.OpenBrokerTrade(...)` даёт открытую
   строку: такой день обязан дойти до исполнения и до отчёта.

**Чем закрыть:** тест в `go/internal/live/correctness_test.go`: открытая позиция по `AAPL`,
`ListWatches()` пуст, котировка даёт IBS выше `highIBS` → решение `exit`, SELL отправлен.

---

## P0-6. Тело ответа брокера на размещение заявки не проверяется

**Где:** `go/internal/live/webull_broker.go` → `PlaceMarketCfg` (`placed, err := c.PlaceOrder(...)`,
далее `_ = placed`); `go/internal/webull/client.go` → `Request` (ошибка только по HTTP-статусу);
`go/internal/live/robinhood_broker.go` → `PlaceMarketCfg`.

**Что сейчас:**

```go
placed, err := c.PlaceOrder(c.AccountID, order)
if err != nil { return OrderResult{...Error: err.Error()}, err }
...
_ = placed
return OrderResult{Submitted: true, ClientOrderID: cid, ...}, nil
```

`webull.Client.Request` формирует ошибку только при `StatusCode < 200 || >= 300`. Ответ 200 с
телом вида `{"code":"...","msg":"..."}` проходит как успех. У Robinhood аналогично: результат
`place_equity_order` парсится только ради статуса, `Submitted: true` ставится безусловно.

**Почему неверно:** отклонённая заявка отчитывается как отправленная. Оператор получает
в Telegram «BUY MARKET отправлен», в `EvalResult.Executed` стоит `true`, `startTracking` заводит
трекер, который позже дойдёт до `terminal_absent` — но торговый день уже потерян, а отчёт врал.

**Что сделать:**

1. В `webull.Client.Request` после разбора тела проверять бизнес-код: если в ответе есть
   `code`/`error_code` и он не пустой и не `"200"`/`"0"`/`"success"` — возвращать ошибку с этим
   кодом и сообщением (список допустимых значений вынести константой, чтобы поведение было
   явным).
2. В `LiveBroker.PlaceMarketCfg` перестать игнорировать `placed`: извлечь из ответа
   `client_order_id`/`order_id`; если `client_order_id` присутствует и не равен отправленному
   `cid` — вернуть `Submitted: false` + `Ambiguous: true` (пусть решает `placeMarket`/трекер), а
   не тихо считать успехом.
3. В `RobinhoodBroker.PlaceMarketCfg`: если в разобранном ответе есть `state`/`status`,
   маппящийся в `rejected`/`cancelled`, — `Submitted: false` с текстом ошибки; если ответ вообще
   не содержит распознаваемой заявки — `Ambiguous: true`.

**Чем закрыть:** тесты в `go/internal/webull/client_test.go` и
`go/internal/live/webull_broker_test.go`: HTTP 200 с телом-ошибкой → `Submitted == false`;
200 с чужим `client_order_id` → `Ambiguous == true`, повторная отправка не происходит.
Аналогично в `robinhood_broker_test.go`.

---

# Этап 1 — надёжность исполнения

## P1-1. Бюджет времени T-1 не помещается в минуту до закрытия

**Где:** `go/internal/webull/client.go` → `FromEnv` (`Timeout: 15 * time.Second`);
`go/internal/live/autotrade.go` → `submitAttempts = 3`, `submitRetryStep = 750ms`,
`placeMarket`, `orderLanded`, `retryBrokerRead`;
`go/internal/live/track.go` → `exitFillWaitAttempts = 10`, `exitFillWaitStep = 500ms`;
незакоммиченный `t1BrokerReconcile` в `autotrade.go`.

**Что сейчас:** худший случай одной отправки — `3 × (15s place + 15s OrderDetail + 0.75s)` ≈ 90 с.
Плюс `sizeOrder` с `retryBrokerRead` (ещё до 3 × 15 с на `Account`/`Positions`), плюс
`cancelOpenOrdersBeforeEntry` (`OpenOrders` с ретраями), плюс `awaitFlatAfterExit` до 5 с, плюс
повторный `Execute` для входа. Незакоммиченный `t1BrokerReconcile` добавляет `PollTrackers` и по
два обращения к каждому брокеру, каждое с тремя попытками. Всё это стартует за 60 секунд до
колокола.

**Почему неверно:** заявка с `support_trading_session: "CORE"` и `time_in_force: "DAY"`, ушедшая
после закрытия основной сессии, будет отклонена. Стратегия торгует по цене закрытия — «попробуем
завтра» не является допустимым исходом.

**Что сделать:**

1. В начале T-1-цикла вычислить дедлайн: `deadline = closeTime(ET) - safetyMargin` (маржа
   конфигурируемая, по умолчанию 5 с). `closeTime` уже есть — `e.sessionCloseMin()`.
2. Протащить `context.Context` с этим дедлайном от `Aggregate` через `Execute` →
   `submitEvaluated` → `placeMarket` → `Broker.PlaceMarketCfg` → `webull.Client.Request`
   (`http.NewRequestWithContext`) и в `robinhood.Service.CallTool`.
3. `submitAttempts`/`retryBrokerRead` прекращают попытки, когда до дедлайна меньше, чем занял
   прошлый вызов. При исчерпании — `logAuto("execution_deadline_exceeded", ...)` и уведомление,
   а не молчаливый провал.
4. Таймаут HTTP-клиента брокера сделать явным и меньшим для торгового пути (например 5 с),
   оставив 15 с для фоновых задач; сейчас он один на всё.

**Чем закрыть:** тест в `go/internal/live/p1_roadmap_test.go`: брокер-заглушка спит 20 с,
`e.Now` пришпилен к `15:59:00 ET` → `Execute` завершается до `16:00:00`, заявка не отправлена
повторно, в логе `execution_deadline_exceeded`.

---

## P1-2. Планировщик однопоточный, тяжёлые задачи выполняются прямо в тике

**Где:** `go/internal/scheduler/scheduler.go` → `StartWith` (`time.NewTicker(20 * time.Second)`),
`RunTick`; `go/internal/live/actualize.go` → `actualizeDelay`
(`PRICE_ACTUALIZATION_REQUEST_DELAY_MS`, по умолчанию 15000 мс на тикер).

**Что сейчас:** `RunTick` синхронно вызывает `RunTelegramAggregation`, `eng.PollTrackers`,
`RunTokenHealth`, `RunPriceActualization`, `RunCalendarExtend`. `Actualize` спит 15 с + джиттер
перед каждым тикером, кроме первого.

**Почему неверно:** на 20 тикерах постзакрытийная актуализация держит цикл около пяти минут —
всё это время трекеры не опрашиваются. `time.Ticker` при занятом получателе глотает тики (буфер
1), поэтому длинный `Aggregate` может съесть минуту `until == 11` или `until == 1`: окна
проверяются по точному значению минут (`RunTelegramAggregation` реагирует только на 11 и 1).

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
`go/internal/live/monitor.go` → `Consistency`, `UpdatePositions`, `liveHeldSymbols`;
`go/internal/live/telegram.go` → `openMonitorTrade`, `runT1Orders`;
незакоммиченный `t1BrokerReconcile` в `autotrade.go`.

**Что сейчас:**

```go
func (e *Engine) awaitFlatAfterExit() bool {
    rows, _ := e.DB.ListTrades("broker_trades")
    if store.OpenBrokerTrade(rows) == nil { return true }   // без имени брокера
    t := e.DB.FindPendingTracker("", "exit")                // без имени брокера
    ...
}
func (e *Engine) liveHeldSymbols() (map[string]float64, error) {
    return e.heldSymbolsOn(e.defaultBroker())               // только webull
}
```

`Consistency` строит `openB := store.OpenBrokerTrade(broker)` — первую открытую строку любого
брокера — и сравнивает с позициями только `defaultBroker`.

**Почему неверно:** колонка `broker` в `broker_trades` и в `order_trackers` уже есть, и
`OpenBrokerTradeFor`/`FindPendingTrackerBroker` уже умеют её учитывать — эти пути просто не
используют. Следствия: открытая позиция на Robinhood блокирует повторный вход на Webull;
`Consistency` выдаёт `live_broker_position_without_journal` на ровном месте, а этот код входит в
`blockingMismatchCodes` и останавливает **весь** T-1 у всех брокеров. Незакоммиченный
`t1BrokerReconcile` усиливает эффект: одна незакрытая заявка у любого брокера ставит `skipPlace`
для всех.

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
кодов, когда каждая позиция объяснена журналом своего брокера.

---

## P1-4. Частичное исполнение выхода не дозакрывается

**Где:** `go/internal/live/trade_record.go` → `recordFill`, ветка
`if partial { ... if action == "exit" { e.reduceOpenQuantity(...); return } }`.

**Что сейчас:** остаток уменьшает `quantity` в `broker_trades` и `trades`, трекер финализируется,
в Telegram уходит «частичное исполнение». Новая заявка на остаток не ставится ни сейчас, ни на
следующем T-1: `decideLiveAction` выдаст `exit` только если IBS снова окажется выше `highIBS`.

**Почему неверно:** позиция остаётся частично открытой в состоянии, которого стратегия не
предусматривает, и никакой автоматики для её закрытия нет.

**Что сделать:**

1. После `reduceOpenQuantity` при `action == "exit"` и остатке > 0 — повторная рыночная заявка на
   остаток в том же цикле, с собственным лимитом попыток (1–2) и с проверкой дедлайна из `P1-1`.
2. Если дозакрыть не удалось — статус позиции пометить явно (поле `notes` или отдельный флаг) и
   отправить уведомление с прямым указанием: «остаток N шт., требуется ручное закрытие».
3. Симметрично проверить вход: при частичном входе в журнал пишется `reportedQty` — это уже
   верно, менять не нужно, но добавить лог `order_partially_filled` в отчёт T-1.

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
нет. Даже при совпадении `CancelOrder` кладёт наш `ref_id` в поле `order_id`:

```go
_, err = b.tool("cancel_equity_order", map[string]any{"account_number": acct, "order_id": clientOrderID})
```

**Почему неверно:** незакрытая заявка на том же тикере доживает до входа и может исполниться
поверх нового объёма. Тихий пропуск (`id == ""` → `continue`) не логируется как проблема.

**Что сделать:**

1. Добавить в список ключей `ref_id` (и `refId`) при извлечении идентификатора.
2. Хранить соответствие `ref_id → внутренний order id` в трекере (новая колонка
   `broker_order_id` в `order_trackers`, заполняется из ответа `place_equity_order` и из
   `OrderDetail`); `RobinhoodBroker.CancelOrder` отменять по внутреннему id.
3. Если идентификатор не удалось определить — не молчать, а `logAuto("open_order_id_unresolved",
   ...)` и считать это блокирующим для входа (лучше пропустить день, чем войти поверх чужой
   заявки).

**Чем закрыть:** тест в `go/internal/live/robinhood_broker_test.go`: открытая заявка с `ref_id`,
принадлежащая движку, отменяется; чужая — нет; заявка без распознаваемого id блокирует вход.

---

## P1-6. Сайзинг без запаса на проскальзывание в маржинальных режимах

**Где:** `go/internal/live/sizing.go` → `capitalModes`, `ComputeOrderQuantity`.

**Что сейчас:**

```go
var capitalModes = map[string]struct{ multiplier, reservePct float64 }{
    "standard_safe": {1, 0.022},
    "cash_100":      {1, 0},
    "margin_125":    {1.25, 0},
    ... margin_200: {2, 0},
}
quantity := math.Floor((availableFunds / (1 + reservePct)) / currentPrice)
```

`currentPrice` — котировка на момент решения T-1, заявка рыночная.

**Почему неверно:** резерв есть только у `standard_safe`. В остальных режимах количество считается
впритык к покупательной способности; если цена на исполнении выше котировки решения, брокер
отклонит заявку по недостатку средств — ровно в ту минуту, когда повторить некогда.

**Что сделать:**

1. Ввести минимальный резерв для всех режимов (не меньше 0.5 %), параметр вынести в конфиг
   автоторговли (`entryReservePct`) с санитайзом в `sanitizeAutoTradingConfig`.
2. Связать резерв с `maxSlippageBps`: логично брать `max(minReserve, maxSlippageBps/10000)` —
   тогда настройка, которая сейчас только отчитывается (см. `P2-4`), начинает что-то значить.
3. Описать в UI, что резерв вычитается до расчёта количества.

**Чем закрыть:** тест в `go/internal/live/sizing_test.go`: для каждого режима капитала
`qty * currentPrice <= availableFunds * (1 - minReserve)`.

---

## P1-7. Telegram: `parse_mode=HTML` без экранирования подставляемого текста

**Где:** `go/internal/live/transport.go` → `HTTPTelegram.Send`
(`"parse_mode": "HTML"`); все вызовы `e.Send(...)` с `fmt.Sprintf`, в частности
`markExecutionUnknown`, `startTracking` (ошибка сохранения трекера), `submitEvaluated`
(«статус отправки неизвестен»), `warnOnSlippage`, `finalizeTrackerStatus`.

**Что сейчас:** символы, статусы и **тексты ошибок брокера** вставляются в разметку как есть.

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

## P1-8. Блокировку `trackerPersistFail` нечем снять

**Где:** `go/internal/live/autotrade.go` → `startTracking`, `persistTrackerBlock`,
`trackerPersistBlocked` (**незакоммиченная правка в рабочем дереве**).

**Что сейчас:** правка добавила персист в `settings["trackerPersistFail"][broker] = true`, так что
флаг переживает рестарт. Снятия нет ни в коде, ни в API, ни в UI.

**Почему неверно:** предохранитель верный (заявка ушла, трекера нет — входить дальше нельзя), но
выход из состояния не предусмотрен: входы у брокера выключены навсегда до ручной правки настроек
в БД.

**Что сделать:** тот же механизм, что в `P0-2` — эндпоинт и кнопка снятия с обязательной записью
причины в `autotrade_logs`; в тексте уведомления указать, что нужно проверить у брокера и как
снять блокировку.

**Чем закрыть:** тест: неудачная запись трекера ставит флаг, он виден после пересоздания
`Engine`, снимается только явным вызовом снятия.

---

## P1-9. Подпись брокера в уведомлениях и гонка на кэше счёта Robinhood

**Где:** `go/internal/live/track.go` → `finalizeTrackerStatus` (`"<b>Webull исполнено</b>"`,
`"<b>Webull статус заявки</b>"`); `go/internal/live/trade_record.go` → `warnOnSlippage`,
сообщение о частичном исполнении; `go/internal/live/robinhood_broker.go` → поле `account`.

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

# Этап 2 — конфигурация, UI, документация

## P2-1. UI показывает «Entries / Exits: да» там, где движок читает «нет»

**Где:** `go/web/js/app.js`, вкладка `autotrade`:
`${ac.allowNewEntries !== false ? 'да' : 'нет'} / ${ac.allowExits !== false ? 'да' : 'нет'}`;
`go/internal/live/config.go` → `allowFlag` (отсутствующий ключ = `false`, это задокументировано в
комментарии).

**Что сделать:** привести UI к трактовке движка (`=== true ? 'да' : 'нет'`) и показывать
разрешения **по брокеру** из `ac.brokers[...]`, а не одно общее значение.

**Чем закрыть:** проверка в `go/internal/httpapi/ui_test.go` на отсутствие `!== false` в этой
строке.

---

## P2-2. Мастер-тумблер молча переписывает настройки Webull

**Где:** `go/web/js/app.js` → обработчик `#auto-enable` (`API.saveAutoConfig({ enabled: on })`);
`go/internal/live/brokers.go` → `sanitizeBrokers`.

**Что сейчас:** при отсутствии ключа `brokers` во входе срабатывает плоская ветка
`sanitizeBrokers`, и `enabled`/`allowNewEntries`/`allowExits` копируются в `brokers.webull` из
верхнего уровня (`nextFlat`). Robinhood при этом не трогается.

**Почему неверно:** кнопка «Включить автоторговлю» на вкладке брокера сбрасывает индивидуальные
разрешения Webull и не включает Robinhood — асимметрия, невидимая в интерфейсе.

**Что сделать:** выбрать одно из двух и зафиксировать в комментарии `sanitizeBrokers`:
(a) плоские поля больше не мигрируют в `brokers` (только явный `brokers` в запросе), а кнопка шлёт
полный объект; либо (b) плоские поля применяются ко **всем** известным брокерам одинаково.
Вариант (a) предпочтительнее: у мастер-тумблера уже есть своя роль — `autoTrading.enabled`
проверяется в `submitEvaluated` и гасит всё разом.

**Чем закрыть:** тест в `go/internal/live/engine_test.go`: `PatchAutoConfig({"enabled": true})` не
изменяет `brokers.webull.allowNewEntries`.

---

## P2-3. Вкладка автоторговли на странице Robinhood — целиком про Webull

**Где:** `go/web/js/app.js` → `pageBroker`, ветка `tab === 'autotrade'`; `BROKER_TABS`.

**Что сейчас:** панель токена Webull (создать / проверить / сохранить), строка «Webull подключен»,
кнопка «BUY AAL 1 шт» на webull-эндпоинт рендерятся и на `/robinhood`. Per-broker флаги из
`brokers` на вкладке не показываются вовсе.

**Что сделать:** разделить вкладку на общую часть (решение, тикеры, пороги, трекеры этого брокера)
и брокерскую (токен для Webull, OAuth-статус для Robinhood); тестовую покупку направлять по
`kind` (`API.testBuy` / `API.rhTestBuy`).

---

## P2-4. «Окно исполнения» и «Порог проскальзывания» описаны как предохранители, которыми не являются

**Где:** `go/web/js/app.js` (карточка настроек на вкладке автоторговли);
`go/internal/live/autotrade.go` → `executionWindowApplies` (только `manual_execute` и
`scheduler`), `outsideExecutionWindow`; `go/internal/live/trade_record.go` → `warnOnSlippage`.

**Что сделать:** в карточке на вкладке автоторговли повторить оговорку, которая уже есть на
странице настроек: окно не применяется к регулярному T-1, а порог проскальзывания — только
уведомление постфактум. Если по `P1-6` порог начнёт влиять на сайзинг — обновить текст.

---

## P2-5. `CLAUDE.md` обещает T-2, код и UI работают на T-1

**Где:** `CLAUDE.md`, раздел «Trading Workflow Ground Rules»: «Two minutes before the close
capture the latest IBS readings … and base entry decisions on these values»;
`go/internal/scheduler/scheduler.go` → окно `until >= 0 && until <= 2`, но
`RunTelegramAggregation` реагирует только на `until == 1`;
`go/internal/live/telegram.go` → `StageMinutes`, `Aggregate` (`case 1: stage = "confirmations"`);
`go/internal/live/telegram.go` → `quoteCacheTTL = 20 * time.Second`.

**Что сейчас:** котировки снимаются заново на T-1 (кэш живёт 20 с) и там же принимается решение.
Текст в SPA («За минуту до закрытия…») соответствует коду, а `CLAUDE.md` — нет.

**Что сделать:** решение принимает владелец стратегии. Либо привести код к спецификации (снимать
IBS на T-2 и решать на этих значениях — тогда нужен явный снапшот, а не кэш котировок), либо
обновить `CLAUDE.md`. Сейчас документ вводит в заблуждение, а ни один тест расхождение не ловит,
потому что тесты написаны под реализацию.

---

## P2-6. Robinhood — необъявленный резервный источник котировок

**Где:** `go/internal/live/config.go` → `realtimeQuoteProviders = []string{"finnhub", "webull",
"robinhood"}` (комментарий рядом утверждает, что Robinhood ещё нужно добавить, — устарел),
`quoteProviderChain`; `go/internal/providers/robinhood.go` → `robinhoodQuote`;
`go/web/js/app.js` — в настройках выбираются только Finnhub и Webull.

**Что сейчас:** цепочка всегда добавляет Robinhood третьим. В `robinhoodQuote` поле `current`
берётся как `first(..., "last_trade_price", "last_extended_hours_trade_price", "price", "close")`
— то есть постмаркетная цена может попасть внутрь дневного диапазона основной сессии.

**Почему неверно:** `ibsFromQuote` клампит результат в `[0,1]`, поэтому вместо явного мусора
получится ровно `0` или `1` — «идеальный» сигнал входа или выхода, построенный на постмаркетной
цене.

**Что сделать:** убрать `last_extended_hours_trade_price` из кандидатов на `current` для расчёта
IBS; показать Robinhood в выборе провайдера в UI либо убрать из `realtimeQuoteProviders`;
привести комментарий в `config.go` в соответствие с кодом.

**Чем закрыть:** тест в `go/internal/providers/client_test.go`: ответ с
`last_extended_hours_trade_price` вне диапазона `[low, high]` не даёт годной котировки.

---

## P2-7. Таблица `autotrade_logs` растёт без ограничения

**Где:** `go/internal/store/live_persist.go` → `AppendAutotradeLogKind`,
`autotradeLogCap = 500` (ограничивает только чтение).

**Что сделать:** ротация в постзакрытийной задаче — удалять записи старше N дней или оставлять
последние M строк; N/M вынести в настройки. Учесть, что `logQuoteProblem` пишет строку на каждую
неудачную попытку каждого провайдера по каждому тикеру.

---

## P2-8. Мелкие расхождения времени и статусов

- `go/internal/live/config.go` → `sanitizeAutoTradingConfig` пишет
  `next["lastModifiedAt"] = time.Now()...` вместо `e.now()`; сохранение конфигурации не
  подчиняется тестовым часам. Передать часы движка в функцию.
- `go/internal/live/health.go` → `BrokersHealth` возвращает `RecordedHealth(w.LastCheckStatus, st)`,
  то есть при недоступности отдаёт в поле `status` сырое `NORMAL`; SPA сравнивает с `'OK'` и
  красит в красный. Закрывается вариантом (b) из `P0-4`.

---

# Этап 3 — эксплуатация и безопасность

## P3-1. Файл SQLite с токенами брокеров создаётся без ограничения прав

**Где:** `go/internal/store/db.go` → `Open` (только `os.MkdirAll(filepath.Dir(path), 0o755)`).

Токен Webull (`webull_token.token`) и OAuth-пара Robinhood (`access_token`, `refresh_token`)
лежат в открытом виде; файл создаётся по umask, обычно `0644`. `.env` на VPS при этом держат в
`600` — БД защищена слабее, чем секреты, которые она дублирует.

**Что сделать:** после `sql.Open` сделать `os.Chmod(path, 0o600)` (и для `-wal`, `-shm`);
каталог — `0o700`. Отдельно рассмотреть шифрование токенов на уровне приложения ключом из
окружения.

---

## P3-2. Тестовая покупка на Robinhood без ограничения количества

**Где:** `go/internal/httpapi/robinhood.go` → `handleRobinhoodTestBuy`;
для сравнения `go/internal/live/autotrade.go` → `TestBuy` (потолок 1 шт. по умолчанию,
`WEBULL_LIVE_TEST_BUY_MAX_QUANTITY`, жёсткий предел 100, проверка на целое).

**Что сделать:** повторить ограничения Webull: `ROBINHOOD_LIVE_TEST_BUY_MAX_QUANTITY`, проверка
`qty == math.Trunc(qty)`, дефолт 1.

---

## P3-3. Вся БД сериализована на одном соединении

**Где:** `go/internal/store/db.go` → `Open` (`SetMaxOpenConns(1)`, `busy_timeout=5000`).

Решение осознанное (WAL + `modernc.org/sqlite`), но на T-1 в одну очередь встают: чтение
настроек и наблюдений, журнал, трекеры, лизинг, лог каждой попытки котировки, плюс параллельные
запросы из открытого браузера.

**Что сделать:** замерить время удержания соединения на T-1 (лог с длительностью каждого запроса
за минуту до закрытия); вынести логирование котировок в буфер с батч-записью после отправки
заявок. Менять `MaxOpenConns` без замеров не нужно.

---

## P3-4. Модель CSRF не зафиксирована в документации

**Где:** `go/internal/httpapi/server.go` → `handleLogin` (cookie `SameSite=Lax`, `HttpOnly`),
`auth`, `cookieToken`; `go/internal/httpapi/ratelimit.go` → `checkOrigin`, `originAllowed`,
`trustProxy`.

Комбинация рабочая: `SameSite=Lax` плюс проверка `Origin`/`Sec-Fetch-Site` для всех мутирующих
методов, отдельного CSRF-токена нет. Но эндпоинты, отправляющие живые заявки
(`POST /api/autotrade/execute`, `.../close-position`, `.../test-buy`), защищены тем же уровнем,
что и чтение настроек.

**Что сделать:** зафиксировать это как осознанное решение в `ENVIRONMENT.md`, включая
предупреждение: `TRUST_PROXY` включать только когда впереди действительно стоит Caddy, иначе
`X-Forwarded-For` позволит обойти лимитер логина.

---

# Что не трогать

Эти места разобраны и работают правильно; при рефакторинге по задачам выше их поведение должно
сохраниться, желательно под теми же тестами.

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
- **Инвариант дат.** Торговая дата остаётся строкой `YYYY-MM-DD` на всех путях автоторговли;
  `time.Time` появляется только на wall-clock с явной зоной `America/New_York`. Нарушений не
  найдено.
- **Защита от чужих заявок.** `IsOwnOrder` не даёт отменить заявку, которую движок не ставил
  (`foreign_order_left_open`).

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
