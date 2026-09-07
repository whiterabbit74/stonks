# Полный аудит проблем и ошибок торговой логики — 2026-09-07

- **Цель**: выявить все проблемы, ошибки, краевые случаи и логические дефекты во всей торговой логике (`/goal`).
- **HEAD коммита**: `c1be71c` (ветка `main`, все предыдущие тесты `go test ./...` проходят).
- **Режим**: Read-only аудит и отчёт. Продуктовый код, тесты, конфигурация и прод не изменялись.
- **Предыдущие закрытые дефекты**: AUD-039..AUD-042 закрыты в коммитах `cd124fd`..`c1be71c`. Настоящий аудит исследует код глубже и выявляет ранее не замеченные проблемы.

---

## Резюме находок (Новые дефекты AUD-043 .. AUD-051)

| ID | Уровень | Подсистема | Краткое описание |
|---|---|---|---|
| **AUD-043** | **P1** | `live/track.go`, `live/telegram.go` | `awaitFlatAfterExit` блокирует same-day re-entry в мультиброкерском режиме из-за глобальной проверки `store.OpenBrokerTrade` и нефильтрованного `FindPendingTracker`. При закрытии позиции на одном брокере (например, Webull) наличие открытой позиции на другом (Robinhood) ложно трактуется как сбой выхода, логируется `t1_exit_rejected_retry`, и повторный вход отменяется. |
| **AUD-044** | **P1** | `live/trade_record.go` | Частичное исполнение заявки на выход (`reduceOpenQuantity`) уменьшает открытое количество акций, но не создаёт запись закрытой сделки и не фиксирует реализованный PnL. Прибыль/убыток по частично проданным акциям безвозвратно теряется из журнала и финансовой отчётности. |
| **AUD-045** | **P1** | `live/autotrade.go` | `cancelOpenOrdersBeforeEntry` не отменяет открытые заявки на Robinhood перед новым входом, поскольку ожидает поля `client_order_id`/`clientOrderId` и `status`, тогда как Robinhood API использует `ref_id` и `state`. Заявки молча пропускаются. |
| **AUD-046** | **P2** | `store/db.go` | Алгоритм `round6` (`float64(int(v*1e6+0.5))/1e6`) систематически искажает любой отрицательный PnL из-за усечения `int()` в Go в сторону нуля: `-100.0` превращается в `-99.999999`, `-1.0` в `-0.999999`. Все убыточные сделки в БД сохраняются с дефектом в шестом знаке. |
| **AUD-047** | **P2** | `backtest/margin.go` | `SimulateMargin` рассчитывает цену маржин-колла без учёта свободных денежных средств на счёте (`cash`), формулой `pos.borrowed / (qty * (1 - maintFrac))`. При частичном использовании плеча (например, 20%) позиция ложно ликвидируется даже при превышении капитала счёта над маржинальным требованием в 13 раз. В `single.go:104` расчёт сделан верно. |
| **AUD-048** | **P2** | `backtest/single.go` | `RunSinglePosition` при закрытии позиции в конце истории по `end_of_data` обновляет итоговый капитал с вычетом комиссии выхода, но не вызывает `replaceFinalDailyValue` для кривой эквити. В результате `FinalValue` не совпадает с `Metrics.NetProfit` и последней точкой графика эквити. |
| **AUD-049** | **P2** | `backtest/options.go` | `RunMultiOptions` полностью теряет открытые опционные позиции на конец истории: в отличие от акций, они не закрываются с причиной `end_of_data` и не добавляются в возвращаемый срез `trades`, искажая `TotalTrades`, `WinRate` и `ProfitFactor`. |
| **AUD-050** | **P2** | `live/monitor.go` | `liveConsistencyIssues` проверяет только факт наличия открытых позиций у брокера при плоском журнале (`len(held) > 0 && OpenBrokerTradeFor == nil`), но не сверяет тикер позиции при непустом журнале. Если брокер держит SPY, а в журнале записан QQQ, расхождение не детектируется и блокировка не выставляется. |
| **AUD-051** | **P2** | `backtest/clean.go` | Режим `CleanOptions.EntryExecution == "nextOpen"` в `clean.go` допускает фазовую ошибку (look-ahead) в расчёте эквити дня сигнала `i`: списывает стоимость покупки по цене завтрашнего открытия `nextBar.Open` и переоценивает купленные акции по сегодняшней цене закрытия `bar.Close`, искажая эквити на день раньше реального входа. |

---

## Подробный разбор дефектов

### AUD-043 [P1]: Блокировка same-day re-entry в мультиброкерском режиме

#### Локализация
- [`go/internal/live/track.go:707-739`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/track.go#L707-L739)
- [`go/internal/live/telegram.go:50-77`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/telegram.go#L50-L77)

#### Механизм
В `telegram.go` функция `runT1Orders` выполняет цикл закрытия позиции и последующего входа в ту же сессию (same-day re-entry):
```go
if e.awaitFlatAfterExit() {
    entryRes = e.executeWindow(w, "telegram_t1")
    return exitRes, entryRes, false
}
pending, err := e.DB.FindPendingTracker("", "exit")
if err != nil || pending != nil {
    _ = e.DB.AppendAutotradeLog("t1_entry_blocked_waiting_exit_fill")
    return exitRes, entryRes, true
}
_ = e.DB.AppendAutotradeLog("t1_exit_rejected_retry")
exitRes = e.executeWindow(w, "telegram_t1")
```
А `awaitFlatAfterExit` и `journalFlat` в `track.go` реализованы следующим образом:
```go
func (e *Engine) awaitFlatAfterExit() bool {
    for attempt := 0; attempt < exitFillWaitAttempts; attempt++ {
        if flat, err := e.journalFlat(); err == nil && flat {
            return true
        }
        t, err := e.DB.FindPendingTracker("", "exit")
        if err != nil || t == nil {
            return false
        }
        e.pollOneTracker(t)
        e.sleep(exitFillWaitStep)
    }
    flat, err := e.journalFlat()
    return err == nil && flat
}

func (e *Engine) journalFlat() (bool, error) {
    rows, err := e.DB.ListTrades("broker_trades")
    if err != nil {
        return false, err
    }
    return store.OpenBrokerTrade(rows) == nil, nil
}
```
Обратите внимание на вызов `store.OpenBrokerTrade(rows)`:
`store.OpenBrokerTrade` эквивалентен `OpenBrokerTradeFor(rows, "")` и возвращает **первую попавшуюся открытую сделку любого брокера**!

#### Сценарий отказа
1. На счёте Robinhood открыта позиция по SPY (сигнала на выход нет, позиция удерживается).
2. На счёте Webull открыта позиция по QQQ. В окне T-1 поступает сигнал на выход из QQQ (`ibs > 0.75`).
3. Webull отправляет рыночный ордер на продажу QQQ. Создаётся трекер выхода.
4. Вызывается `awaitFlatAfterExit()`.
5. Трекер Webull опрашивается и получает статус `filled`. Сделка по QQQ на Webull успешно закрыта!
6. Но `journalFlat()` вызывает `store.OpenBrokerTrade(rows) == nil`. Позиция Robinhood по SPY всё ещё открыта, поэтому `journalFlat()` возвращает `false`!
7. На следующей итерации `t, err := e.DB.FindPendingTracker("", "exit")` возвращает `nil`, так как трекер Webull уже завершён (`status='filled'`).
8. Строка 716: `if err != nil || t == nil { return false }` — `awaitFlatAfterExit()` немедленно возвращает `false`!
9. В `runT1Orders` управление переходит к строке 57: `pending` равен `nil`.
10. Выполняется строка 62: `e.DB.AppendAutotradeLog("t1_exit_rejected_retry")`! Система ошибочно решает, что ордер на выход был отклонён брокером!
11. Вызывается повторный `executeWindow(w, "telegram_t1")`!
12. **Последствия**:
    - Новый вход на освободившемся счёте Webull (например, покупка нового тикера с минимальным IBS) полностью блокируется и не отправляется.
    - В лог пишется ложное сообщение `t1_exit_rejected_retry` и `t1_exit_failed`, сбивающее оператора с толку.
    - Производится попытка повторно закрыть уже закрытую позицию.

#### Рекомендация
1. Сделать `awaitFlatAfterExit` и `journalFlat` брокеро-зависимыми: принимать `broker string`.
2. В `journalFlat` вызывать `store.OpenBrokerTradeFor(rows, broker) == nil`.
3. В `awaitFlatAfterExit` и `runT1Orders` использовать `FindPendingTrackerBroker("", "exit", broker)` вместо глобального поиска.

---

### AUD-044 [P1]: Потеря акций и нефиксированный PnL при частичном выходе

#### Локализация
- [`go/internal/live/trade_record.go:172-185, 355-387`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/trade_record.go#L172-L185)

#### Механизм
В `trade_record.go` при получении частичного исполнения заявки на выход:
```go
partial := reportedQty > 0 && orderedQty > 0 && reportedQty < orderedQty-1e-9
if partial {
    ...
    if action == "exit" {
        e.reduceOpenQuantity(symbol, clientOrderID, brokerName, reportedQty, fillPrice)
        return
    }
}
```
А функция `reduceOpenQuantity`:
```go
func (e *Engine) reduceOpenQuantity(symbol, preferID, broker string, sold, exitPrice float64) {
    ...
    cur := asFloat(t["quantity"])
    left := cur - sold
    if left <= 1e-9 {
        if err := e.closeTradeWithPnL(table, fmt.Sprint(t["id"]), exitPrice, ...); err != nil { ... }
        continue
    }
    _ = e.execJournalSQL("", broker, "reduce_open_qty",
        `UPDATE `+table+` SET quantity=? WHERE id=?`, left, t["id"])
}
```

#### Сценарий отказа
1. Было куплено 10 акций по $100 (вложено $1000). В журнале: `quantity = 10`.
2. Поступает сигнал на выход. Отправляется ордер на продажу 10 акций.
3. Биржа исполняет частично: продано 4 акции по $120. Оставшиеся 6 акций в стакане.
4. Срабатывает `reduceOpenQuantity`:
   `UPDATE broker_trades SET quantity = 6 WHERE id = ...`
5. Функция делает `return`.
6. **Что произошло**:
   - 4 проданные акции испарились из открытой позиции.
   - Никакой закрытой сделки на 4 акции не создано.
   - Заработанная прибыль `$20 * 4 = $80` нигде не посчитана и не записана в `pnl_absolute` / `pnl_percent`.
   - В журнале остаётся открытая сделка на 6 акций с ценой входа $100.
7. Когда оставшиеся 6 акций закрываются (например, по $130), `CloseTradePair` считает PnL:
   `(130 - 100) * 6 = $180`.
8. Общий фактический PnL позиции был `$80 + $180 = $260`. Но в журнале навсегда записано только `$180`! `$80` стёрты без следа.
9. Если же остаток заявки был отменён биржей, 4 акции реально проданы, а в журнале вечно висит незакрытая позиция на 6 акций, искажая баланс портфеля.

#### Рекомендация
При частичном выходе (`action == "exit"`, `left > 1e-9`):
1. Выполнять разделение (split) сделки: уменьшать `quantity` исходной открытой сделки до `left`.
2. Вставлять в журнал закрытую сделку на количество `sold` с `exit_price = fillPrice`, рассчитанным `pnl_absolute = (fillPrice - entryPrice) * sold` и статусом `closed`.

---

### AUD-045 [P1]: Несрабатывание отмены открытых заявок на Robinhood перед входом

#### Локализация
- [`go/internal/live/autotrade.go:1390-1425`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/autotrade.go#L1390-L1425)

#### Механизм
Перед размещением ордера на вход движок обязан отменить старые зависшие заявки по данному тикеру:
```go
func (e *Engine) cancelOpenOrdersBeforeEntry(br Broker, symbol string) ([]string, error) {
    ...
    for _, row := range rows {
        ...
        st := NormalizeOrderStatus(fmt.Sprint(firstNonEmpty(m["status"], m["order_status"], m["orderStatus"])))
        if IsFinalOrderStatus(st) {
            continue
        }
        id := strings.TrimSpace(fmt.Sprint(firstNonEmpty(m["client_order_id"], m["clientOrderId"])))
        if id == "" || id == "<nil>" {
            continue
        }
```
Однако в структуре данных ордера Robinhood:
1. Идентификатором клиентского ордера является поле `ref_id` (UUID), а не `client_order_id` или `clientOrderId`! (См. `order_parse.go:100`: `firstNonEmpty(m["client_order_id"], m["clientOrderId"], m["ref_id"])`).
2. Статусом ордера в Robinhood является поле `state` (значения: `queued`, `confirmed`, `unconfirmed`, `new`), а не `status` или `order_status`! (См. `robinhood_broker.go:566`: `first(detail, "state", "status")`).

#### Сценарий отказа
1. На счёте Robinhood висит неисполненная лимитная или зависшая рыночная заявка по акции `XYZ`.
2. В окне T-1 принимается решение о входе по `XYZ`.
3. Вызывается `cancelOpenOrdersBeforeEntry`.
4. Для заявки Robinhood `firstNonEmpty(m["client_order_id"], m["clientOrderId"])` возвращает пустую строку `""`.
5. Срабатывает проверка `if id == "" { continue }`.
6. Заявка пропускается! Старый ордер не отменяется.
7. Отправляется новый ордер на вход. В результате на бирже оказываются две конкурирующие заявки на покупку, что приводит либо к ошибке `insufficient buying power`, либо к нежелательному двойному набору позиции.

#### Рекомендация
В `cancelOpenOrdersBeforeEntry` использовать существующую утилиту `clientOrderIDOf(m)` из `order_parse.go` и учитывать поле `state` при нормализации статуса (или использовать `firstNonEmpty(m["status"], m["order_status"], m["orderStatus"], m["state"])`).

---

### AUD-046 [P2]: Искажение отрицательного PnL из-за бага округления в `round6`

#### Локализация
- [`go/internal/store/db.go:1359-1361`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/store/db.go#L1359-L1361)

#### Механизм
В `db.go` функция `round6` реализована как:
```go
func round6(v float64) float64 {
    return float64(int(v*1e6+0.5)) / 1e6
}
```
В языке Go приведение вещественного числа к целому `int(...)` осуществляет **усечение к нулю (truncation toward zero)**, а не математическое округление вниз.
Для любого отрицательного числа `v < 0`:
- При `v = -100.0`:
  `v * 1e6 + 0.5 = -100000000.0 + 0.5 = -99999999.5`
  `int(-99999999.5) = -99999999` (усечение к нулю!)
  `-99999999 / 1e6 = -99.999999`!
- При `v = -1.0` результат `-0.999999`.
- При `v = -10.5` результат `-10.499999`.

#### Доказательство
Тест запускался напрямую:
```
round6(-100.0) = -99.999999 (ожидалось -100.000000)
round6(-1.0)   = -0.999999  (ожидалось -1.000000)
round6(-10.5)  = -10.499999 (ожидалось -10.500000)
```
Именно этот баг виден в историческом отчёте `AUDIT_2026-09-07.md:103`:
`row: exitPrice:0 pnlAbsolute:-99.999999 pnlPercent:-99.999999 status:closed`
Все убыточные сделки, закрытые через `TradeCloseFields`, содержат артефакт `.999999` в базе данных.

#### Рекомендация
Заменить реализацию на стандартную библиотечную функцию:
```go
func round6(v float64) float64 {
    return math.Round(v*1e6) / 1e6
}
```

---

### AUD-047 [P2]: Ложный маржин-колл в `SimulateMargin` при наличии свободного кэша

#### Локализация
- [`go/internal/backtest/margin.go:116-121`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/backtest/margin.go#L116-L121)

#### Механизм
В `SimulateMargin` расчёт критической цены маржин-колла реализован так:
```go
canLiq := date > pos.entryDate
den := pos.quantity * (1 - maintFrac)
maintPriceRaw := math.Inf(1)
if den > 0 {
    maintPriceRaw = pos.borrowed / den
}
maintPrice := math.Min(pos.entryPrice, math.Max(0, maintPriceRaw))
hit := canLiq && bar.Low <= maintPrice
```
Обратите внимание: в формуле `pos.borrowed / den` **полностью отсутствует переменная `cash` (свободные средства на счёте)**!
Формула выведена из предположения, что `cash == 0`:
`Капитал счёта = Cash + Рыночная стоимость акции - Заёмные средства`
Требование биржи по поддержке (Maintenance Margin 25%):
`Капитал счёта ≥ maintFrac * Рыночная стоимость`
`Cash + P * Qty - Borrowed ≥ maintFrac * P * Qty`
`Cash - Borrowed ≥ P * Qty * (maintFrac - 1)`
`P * Qty * (1 - maintFrac) ≤ Borrowed - Cash`
`P ≤ (Borrowed - Cash) / (Qty * (1 - maintFrac))`

Сравните с правильной формулой в [`single.go:104`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/backtest/single.go#L104):
```go
price := (borrowed - freeCapital) / den
```
В `single.go` вычитание `freeCapital` присутствует. А в `margin.go` оно забыто!

#### Сценарий отказа
1. Депозит $10,000. Параметр использования капитала `usage = 0.20` (20%), плечо `leverage = 2`.
2. Позиция открыта на $4,000 (маржа $2,000, заёмные средства $2,000).
3. На счёте остаётся свободный кэш: $8,000.
4. Акция куплена по $100 (40 акций).
5. `den = 40 * 0.75 = 30`.
6. По формуле `margin.go`: `maintPriceRaw = 2000 / 30 = $66.67`.
7. Если цена падает до $66.00:
   - Стоимость акций: `40 * $66 = $2,640`.
   - Требуемая маржа (25%): `$2,640 * 0.25 = $660`.
   - Фактический капитал счёта: `Кэш ($8,000) + Акции ($2,640) - Долг ($2,000) = $8,640`!
   - Капитал счёта ($8,640) в **13 раз превышает** требование маржи ($660)! Никакого маржин-колла и близко нет.
   - Однако `SimulateMargin` фиксирует `bar.Low <= 66.67` и **ликвидирует позицию с фиксацией огромного ложного убытка**!

#### Рекомендация
В `margin.go:119` вычитать свободные средства:
```go
maintPriceRaw = (pos.borrowed - cash) / den
```

---

### AUD-048 [P2]: Рассинхронизация `FinalValue` и `Metrics.NetProfit` в `RunSinglePosition`

#### Локализация
- [`go/internal/backtest/single.go:351-399`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/backtest/single.go#L351-L399)

#### Механизм
В `RunSinglePosition` при наличии открытой позиции на последнем баре:
1. Позиция закрывается с причиной `end_of_data` (строка 380).
2. Вычисляется комиссия выхода `exitCommission` и чистый PnL `totalPnL` (с учётом комиссии выхода).
3. Пересчитывается `totalPortfolio`:
   `freeCapital = math.Max(0, freeCapital + totalCashInvested + totalPnL)`
   `totalPortfolio = freeCapital + totalInvested`
4. В конце функции:
   ```go
   m = metrics.BacktestMetrics(trades, equity, initial, contribs)
   finalValue = totalPortfolio
   ```
5. **Проблема**: функция `metrics.BacktestMetrics` берёт финальное значение из кривой эквити:
   `finalValue := equity[len(equity)-1].Value`
   `netProfit := finalValue - initialCapital - contribTotal`
6. В `single.go` нигде не вызывается `replaceFinalDailyValue(equity, lastBar.Date, totalPortfolio, initial)`!
   (Тогда как в `clean.go:220` и `margin.go:237` этот вызов присутствует именно для этого!).

#### Последствия
- `res.FinalValue` содержит вычтенную комиссию закрытия `exitCommission`.
- `res.Equity[len(equity)-1].Value` и `res.Metrics.NetProfit` **не содержат** вычета комиссии выхода!
- В веб-интерфейсе последняя точка на графике доходности не совпадает с числом в блоке «Итоговый капитал», а `NetProfit != FinalValue - InitialCapital`.

#### Рекомендация
Перед вызовом `metrics.BacktestMetrics` в `single.go` добавить:
```go
replaceFinalDailyValue(equity, lastBar.Date, totalPortfolio, initial)
```

---

### AUD-049 [P2]: Потеря открытых опционов на конец истории в `RunMultiOptions`

#### Локализация
- [`go/internal/backtest/options.go:240-260`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/backtest/options.go#L240-L260)

#### Механизм
В `RunMultiOptions` во время прохода по дням открытые опционные сделки хранятся в срезе `active []types.Trade`. При закрытии опциона (экспирация, max hold days, take profit) сделка переносится в срез `trades`.
Однако по окончании цикла по датам:
```go
    portfolioValue = currentCapital + openVal
    equity = append(equity, types.EquityPoint{Date: dateStr, Value: portfolioValue, Drawdown: 0})
}
applyDrawdown(equity, initial)
finalValue = portfolioValue
return
```
Позиции, оставшиеся в `active`, **не закрываются** и **не добавляются в `trades`**!

#### Последствия
- Возвращаемый срез `trades` теряет все сделки, которые были открыты на момент окончания теста.
- В хендлере `httpapi/calc.go:157`:
  `m := metrics.New(trades, eq, cfg.InitialCapital, nil).All()`
  Метрики `TotalTrades`, `WinRate`, `ProfitFactor`, `AverageWin`, `AverageLoss` рассчитываются без учёта этих сделок.
- В таблице сделок пользователь не видит открытых на конец периода позиций, хотя в `finalValue` их стоимость включена.
- Это единственный движок бэктеста в проекте, где отсутствует блок закрытия `end_of_data`.

#### Рекомендация
После цикла по датам закрывать оставшиеся позиции в `active` по текущей теоретической цене Black-Scholes последнего дня с причиной `end_of_data` и добавлять их в `trades`.

---

### AUD-050 [P2]: Отсутствие проверки соответствия тикера live-позиции журналу

#### Локализация
- [`go/internal/live/monitor.go:303-329`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/live/monitor.go#L303-L329)

#### Механизм
В `monitor.go` функция `liveConsistencyIssues` проверяет консистентность между позициями брокера и локальным журналом:
```go
func (e *Engine) liveConsistencyIssues(brokerRows []map[string]any, w execWindow) []map[string]any {
    var issues []map[string]any
    for _, nb := range e.brokerSnapshot() {
        held, heldErr := e.heldSymbolsOn(nb.br, w)
        ...
        if len(held) > 0 && store.OpenBrokerTradeFor(brokerRows, nb.name) == nil {
            ...
            issues = append(issues, map[string]any{
                "code": "live_broker_position_without_journal", ...
            })
        }
    }
    return issues
}
```
Функция проверяет только случай `len(held) > 0 && store.OpenBrokerTradeFor(...) == nil`.
Если же у брокера открыта позиция по `SPY`, а в локальном журнале `broker_trades` числится открытая позиция по `QQQ`:
- `len(held) > 0` истинно (`SPY`).
- `store.OpenBrokerTradeFor(brokerRows, nb.name)` **не nil** (он находит запись `QQQ`).
- Условие `if` не срабатывает! Никакой ошибки `liveConsistencyIssues` не генерирует!

#### Последствия
При расхождении тикеров система мониторинга сообщает `ok: true`, и блокировка `BlockingMismatch` не активируется, позволяя системе работать в рассинхронизированном состоянии до момента выхода.

#### Рекомендация
В `liveConsistencyIssues` добавить проверку: если `open := store.OpenBrokerTradeFor(...)` не nil, проверить, что символ `open["symbol"]` присутствует в `held`. Если у брокера открыт другой тикер — генерировать ошибку `live_broker_symbol_mismatch`.

---

### AUD-051 [P2]: Фазовый сдвиг эквити в `clean.go` при `EntryExecution == "nextOpen"`

#### Локализация
- [`go/internal/backtest/clean.go:78-94, 161-165`](file:///Users/mymac/Work/sites/mktorder_com/go/internal/backtest/clean.go#L78-L94)

#### Механизм
В `clean.go` при входе по цене открытия следующего дня (`opt.EntryExecution == "nextOpen"`):
В день `i`, когда обнаружен сигнал входа:
```go
if opt.EntryExecution == "nextOpen" {
    quantity := wholeShares(investmentAmount / nextBar.Open)
    position = &cleanPosition{
        entryDate: nextBar.Date, entryPrice: nextBar.Open,
        quantity: quantity, entryIndex: i + 1, ...
    }
    currentCapital -= totalCost + entryCommission
}
```
А в конце итерации дня `i`:
```go
totalValue := currentCapital
if position != nil {
    totalValue += position.quantity * bar.Close
}
return totalValue
```
В день `i` (в момент закрытия сессии) позиция **ещё не существует** — ордер должен исполниться только завтра на открытии!
Однако в эквити дня `i` уже списан капитал (`currentCapital -= totalCost`) и добавлена стоимость позиции, переоцененная по `bar.Close` (закрытию дня `i`)!
Если между закрытием дня `i` и открытием дня `i+1` произошёл гэп (например, закрытие $100, а открытие $110), то на день `i` эквити резко проседает на `(110 - 100) * quantity`, хотя трейдер в этот момент находился на 100% в деньгах.

#### Рекомендация
При `nextOpen` создание позиции и списание капитала должно активироваться только на шаге `i+1`, либо на шаге `i` эквити должно возвращать `currentCapital` до списания средств на будущий вход.

---

## Системный аудит 10 ключевых подсистем

### 1. Пороги IBS и паритет live ↔ бэктест ↔ SPA
- **Статус**: КОРРЕКТНО (после исправления AUD-039 и AUD-042).
- **Проверка**: Все три контура используют единый источник истины `internal/ibs`. Пороги по умолчанию: `lowIBS = 0.10`, `highIBS = 0.75`. Условия строгие: `ibs < lowIBS` для входа, `ibs > highIBS` для выхода. При значении ровно `0.10` сигнал входа не формируется. Валидация входных данных на HTTP API строго проверяет числовые типы (AUD-042).

### 2. Live-движок: monitor, autotrade, sizing, safety
- **Статус**: ВЫЯВЛЕНЫ ДЕФЕКТЫ (AUD-043, AUD-045, AUD-050).
- **Проверка**:
  - Тайминг окон T-11 и T-1 соблюдается строго.
  - Sizing (`ComputeOrderQuantity`) корректно применяет `math.Floor` (только целые акции) и удерживает буфер безопасности `EffectiveReservePct`.
  - Предел проскальзывания `maxSlippageBps` работает в режиме предупреждения (не срывает рыночный выход).
  - В мультиброкерском режиме обнаружен дефект блокировки повторного входа (AUD-043) и неотмены ордеров Robinhood (AUD-045).

### 3. Трекеры заявок, журнал, идемпотентность
- **Статус**: ВЫЯВЛЕН ДЕФЕКТ (AUD-044).
- **Проверка**:
  - Идемпотентность обеспечена генерацией `clientOrderId` (UUID) до отправки запроса брокеру.
  - Повторные слепые MARKET-ордера исключены: при сетевых сбоях статус переходит в `ambiguous` с сохранением трекера.
  - Частичное исполнение выхода (AUD-044) стирает проданные акции без записи закрытия и фиксации PnL.

### 4. Брокеры: Webull и Robinhood
- **Статус**: ВЫЯВЛЕН ДЕФЕКТ (AUD-045).
- **Проверка**:
  - Токены и OAuth-состояния изолированы по брокерам.
  - Маппинг статусов Robinhood корректно переводит `confirmed`/`queued` в `working`.
  - Однако пре-входная отмена заявок `cancelOpenOrdersBeforeEntry` не видит ордеров Robinhood из-за `ref_id` vs `client_order_id` (AUD-045).

### 5. Планировщик T-11 / T-1 / after-close
- **Статус**: КОРРЕКТНО.
- **Проверка**:
  - Запуск по тикеру 20 секунд с обработкой паники.
  - Границы окон `until >= 10 && until <= 11` (T-11) и `until >= 0 && until <= 1` (T-1) гарантируют своевременный запуск.
  - Календарь биржи проверяет праздники и сокращенные дни. При нечитаемом календаре система fail-closed (не запускает торги вслепую).

### 6. Telegram-транспорт мониторинга
- **Статус**: КОРРЕКТНО.
- **Проверка**:
  - Отправка сообщений T-11 (обзор) и T-1 (решения/исполнение).
  - Экранирование HTML-тегов, форматирование тикеров и цен корректны.

### 7. HTTP API, auth, calc, live handlers
- **Статус**: КОРРЕКТНО.
- **Проверка**:
  - Пустой пароль `ADMIN_PASSWORD` переводит API в fail-closed (503).
  - Watch-пороги строго валидируются.
  - Обработка ошибок в транзакциях возвращает 500 без фиктивного `ok: true`.

### 8. Vanilla SPA
- **Статус**: КОРРЕКТНО (после исправления AUD-041).
- **Проверка**:
  - Торговые даты отображаются строго как строки `YYYY-MM-DD` без вызова опасных конструкций `new Date()`.
  - PnL сделок отображается в деньгах с учётом количества акций.

### 9. Store / SQLite
- **Статус**: ВЫЯВЛЕН ДЕФЕКТ (AUD-046).
- **Проверка**:
  - Миграции схемы (включая v5) отработали корректно.
  - Функция округления `round6` искажает отрицательные числа (AUD-046).

### 10. Даты и календарь NYSE
- **Статус**: КОРРЕКТНО.
- **Проверка**:
  - Торговые даты строковые. Все манипуляции через `tradingdate`.
  - Расчёт времени привязан к Нью-Йорку (`America/New_York`).
  - Тесты зелёные при локальных таймзонах `Pacific/Auckland` и `America/Los_Angeles`.

---

## Предлагаемые строки для `docs/audits/REGISTRY.md`

```markdown
| AUD-043 | `awaitFlatAfterExit` блокирует same-day re-entry в мультиброкерском режиме из-за глобальной проверки `store.OpenBrokerTrade` и нефильтрованного `FindPendingTracker`. При закрытии позиции на одном брокере наличие открытой позиции на другом ложно трактуется как сбой выхода, логируется `t1_exit_rejected_retry`, и повторный вход отменяется | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-043; `go/internal/live/track.go:715,738`; `go/internal/live/telegram.go:53` | OPEN | - | Требуется передавать имя брокера в `awaitFlatAfterExit`, вызывать `OpenBrokerTradeFor(rows, broker)` и фильтровать трекеры по брокеру |
| AUD-044 | Частичное исполнение выхода (`reduceOpenQuantity`) уменьшает открытое количество акций, но не создаёт запись закрытой сделки и не фиксирует реализованный PnL. Прибыль/убыток по частично проданным акциям безвозвратно теряется из журнала | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-044; `go/internal/live/trade_record.go:183,355-387` | OPEN | - | При частичном выходе сплитовать сделку: закрывать проданную часть с фиксацией PnL и оставлять открытым остаток |
| AUD-045 | `cancelOpenOrdersBeforeEntry` не отменяет открытые заявки на Robinhood перед новым входом, так как проверяет поля `client_order_id`/`clientOrderId` и `status`, тогда как Robinhood использует `ref_id` и `state` | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-045; `go/internal/live/autotrade.go:1401,1405` | OPEN | - | Использовать `clientOrderIDOf(m)` и поддержать `state` в нормализации статусов |
| AUD-046 | Алгоритм `round6` систематически искажает любой отрицательный PnL из-за усечения `int()` в Go в сторону нуля (`-100.0` превращается в `-99.999999`) | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-046; `go/internal/store/db.go:1360` | OPEN | - | Заменить формулу на `math.Round(v*1e6)/1e6` |
| AUD-047 | `SimulateMargin` рассчитывает цену ликвидации без учёта свободных денежных средств (`cash`), формулой `pos.borrowed / (qty * (1 - maintFrac))`. Вызывает ложный маржин-колл при частичном плече и огромном запасе кэша | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-047; `go/internal/backtest/margin.go:116-121` | OPEN | - | Использовать формулу `(pos.borrowed - cash) / den`, синхронизировав с `single.go:104` |
| AUD-048 | `RunSinglePosition` при закрытии позиции по `end_of_data` не вызывает `replaceFinalDailyValue` для кривой эквити, приводя к расхождению `FinalValue` и `Metrics.NetProfit` на величину комиссии выхода | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-048; `go/internal/backtest/single.go:351-399` | OPEN | - | Добавить вызов `replaceFinalDailyValue(equity, lastBar.Date, totalPortfolio, initial)` перед расчётом метрик |
| AUD-049 | `RunMultiOptions` теряет открытые опционные позиции на конец истории: они не закрываются с причиной `end_of_data` и не попадают в срез `trades` | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-049; `go/internal/backtest/options.go:254-260` | OPEN | - | Добавить блок закрытия `end_of_data` для опционов в конце бэктеста |
| AUD-050 | `liveConsistencyIssues` не проверяет соответствие тикера реальной позиции брокера тикеру в локальном журнале при ненулевом портфеле | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-050; `go/internal/live/monitor.go:315` | OPEN | - | Добавить проверку совпадения тикера открытой сделки в журнале с тикерами в `held` |
| AUD-051 | `CleanOptions.EntryExecution == "nextOpen"` в `clean.go` допускает фазовую ошибку в расчёте эквити дня сигнала `i`, переоценивая позицию по сегодняшнему закрытию до реальной покупки на завтрашнем открытии | `docs/audits/AUDIT_2026-09-07_TRADING_LOGIC.md` §AUD-051; `go/internal/backtest/clean.go:87-94,161-165` | OPEN | - | Активировать позицию и списывать средства только на шаге `i+1` |
```
