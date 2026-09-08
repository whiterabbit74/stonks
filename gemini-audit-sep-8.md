# Глубокий аудит Core-логики T-1: Мультиброкерность, Изоляция, Same-Day Flip и Рейт-лимиты

- **Дата**: 2026-09-08
- **Ветка / HEAD**: `a7d81f3` (`perf: брокеры обрабатываются параллельно, а не по очереди`)
- **Режим**: Read-Only аудит торговой логики (код и база данных не модифицировались)
- **Целевой файл отчёта**: `gemini-audit-sep-8.md`

---

## 1. Введение и цели аудита

Цель аудита — досконально перепроверить самое главное ядро системы: **логику T-1 (за 1 минуту до закрытия биржи)**:
1. **Простая торговая парадигма**: «Есть сигнал на вход — покупаем. Есть сигнал на выход — продаем. Все работает надежно и быстро, как молоток».
2. **Same-Day Flip (Выход и вход в один день на закрытии)**: продать старую позицию по сигналу выхода и в ту же минуту успеть купить новую акцию с наименьшим IBS.
3. **Полная независимость брокеров**: Webull и Robinhood должны работать абсолютно автономно. Проблемы, ошибки, задержки или специфические ограничения одного брокера не должны влиять на другого.
4. **Рейт-лимит Webull (250 мс)**: запросы не чаще 1 раза в 250 мс, отсутствие 429 ошибок и задержек, сжигающих драгоценное время закрывающей минуты.
5. **Торговля топ-10 акциями США рыночными ордерами (MARKET)** в регулярную сессию (быстрое исполнение).

В ходе аудита весь связанный код был исследован строка за строкой, декомпозирован на детальный псевдокод и протестирован на мысленных сценариях отказа. Было выявлено **12 дефектов и уязвимостей** (из них 6 критических уровня P1), которые блокируют работу или искажают состояние системы.

---

## 2. Детальный псевдокод текущей реализации (AS-IS)

Ниже представлен сквозной псевдокод ядра T-1 в текущей версии репозитория с явными отметками мест возникновения багов `[БАГ #X]`.

```python
# -------------------------------------------------------------------------
# ШАГ 1: ТИК ПЛАНИРОВЩИКА (go/internal/scheduler/scheduler.go)
# -------------------------------------------------------------------------
function RunTick(now):
    if not IsTradingDay(now): return
    until = sessionCloseMin - nowMin
    
    # Окно T-1: за 1 минуту до закрытия (until in [0, 1])
    if until in [0, 1]:
        # Вызов агрегации с флагом DryRun = false
        runTelegramAggregation(until=until)
            -> Engine.Aggregate(until=until, DryRun=false, UpdateState=true)


# -------------------------------------------------------------------------
# ШАГ 2: АГРЕГАЦИЯ И ОРКЕСТРАЦИЯ T-1 (go/internal/live/telegram.go)
# -------------------------------------------------------------------------
function Engine.Aggregate(minutesUntilClose, opts):
    # 2.1. Проверка состояния: отправлялся ли уже T-1 сегодня?
    if t1Sent: return "already_sent"
    
    # 2.2. Загрузка списка наблюдения и открытых сделок
    watches = db.ListWatches()
    brokerTrades = db.ListTrades("broker_trades")
    
    # 2.3. Префетч котировок по всем тикерам списка (топ-10 акций)
    # [БАГ #8, #12]: 8 параллельных воркеров обращаются к Webull;
    # каждый запрос встает в глобальную 250ms очередь awaitRequestSlot
    prefetchQuotes(watchSyms, providerChain)
    
    # 2.4. Захват lease на попытку T-1 (защита от повторного тика)
    att = db.BeginT1Attempt(...)
    if att.Skip: return att.Reason
    
    # 2.5. Расчет окна исполнения (дедлайн = закрытие биржи - 5 сек)
    # [БАГ #12]: w.ctx создается из context.Background() БЕЗ context.WithDeadline
    w = t1Window(opts.Ctx)
    
    # 2.6. Проверка согласованности (consistencyWindow)
    # [БАГ #8]: heldSymbolsByBrokerBooks делает запрос GET /account/positions к Webull (ЧТЕНИЕ 1)
    snap = consistencyWindow(w)
    blocking = BlockingMismatch(snap)
    
    # [БАГ #10]: Если у Webull есть ручная/незаписанная позиция, выставляется entryBlocked[webull]=true!
    w.entryBlocked = entryBlockedBrokers(snap)
    
    # 2.7. Предполётная сверка заявок (t1BrokerReconcile)
    # Параллельно опрашивает открытые ордера у Webull и Robinhood
    # Webull: GET /order/list
    # Robinhood: get_equity_orders
    busy, entryOnly, skipReasons = t1BrokerReconcile(w)
    w.busySymbols = busy
    
    # 2.8. Исполнение ордеров (runT1Orders)
    exitRes, entryRes, waitFill = runT1Orders(w, today)
    
    # [БАГ #2]: Перезапись брокерских результатов!
    out.Executed = exitRes.Executed || entryRes.Executed
    if entryRes.Executed:
        out.Broker = entryRes.Broker  # Стирает результаты сделок pass 1 (exitRes.Broker)!
    else:
        out.Broker = exitRes.Broker
        
    # 2.9. Формирование и отправка отчёта в Telegram
    # [БАГ #2]: appendExec форматирует все сделки под одним заголовком и направлением!
    text = buildT1Text(..., exitRes, entryRes)
    SendTelegram(text)


# -------------------------------------------------------------------------
# ШАГ 3: ДВУХПРОХОДНЫЙ ЦИКЛ ОРДЕРОВ T-1 (go/internal/live/telegram.go)
# -------------------------------------------------------------------------
function Engine.runT1Orders(w, today):
    # --- ПРОХОД 1: executeWindow ---
    # Предполагается как проход "выходов", но на самом деле исполняет
    # и выходы, и входы для всех брокеров!
    exitRes = executeWindow(w, "telegram_t1")
    
    # effectiveDecision выбирает "exit", если хоть один брокер выходил,
    # даже если другой брокер в этот же момент успешно вошел (купил)!
    action = effectiveDecision(exitRes)["action"]
    
    # [БАГ #1]: Если Webull купил, а Robinhood продал:
    # action == "exit", exitRes.Executed == true.
    if action != "exit" or not exitRes.Executed:
        return exitRes, entryRes, false
        
    # brokers содержит только тех, у кого action == "exit"
    brokers = exitingBrokers(exitRes)  # например, ["robinhood"]
    
    # Ожидание исполнения выхода в журнале (до 5 сек)
    # [БАГ #1, #7]: Если Robinhood не успел исполниться, pendingExitFor возвращает tracker Robinhood.
    # Вход Webull на втором проходе отменяется целиком!
    if awaitFlatAfterExit(brokers):
        # Ожидание очистки ленты позиций брокера (до 3 сек)
        # [БАГ #8, #19]: Опрос heldSymbolsOn каждые 500 мс на Webull вызывает 429 Too Many Requests!
        awaitBrokerBooksFlat(w, brokers)
        
        # --- ПРОХОД 2: повторный вход (Same-Day Re-Entry) ---
        entryRes = executeWindow(w, "telegram_t1")
        return exitRes, entryRes, false

    # Если выход завис или отклонен брокером:
    pending, err = pendingExitFor(brokers)
    if pending != nil:
        # [БАГ #1]: Блокирует вход ДЛЯ ВСЕХ БРОКЕРОВ, включая тех, кто давно вышел!
        return exitRes, entryRes, waitFill=true
        
    # Ретрай выхода при реджекте...
    ...


# -------------------------------------------------------------------------
# ШАГ 4: ВЫПОЛНЕНИЕ ДЛЯ ВСЕХ БРОКЕРОВ (go/internal/live/execute_all.go)
# -------------------------------------------------------------------------
function Engine.executeAll(w, ev, trigger, corr, snaps):
    # ev.books уже прочитаны в EvaluateWindow:
    # [БАГ #8]: EvaluateWindow повторно дергает GET /account/positions у Webull (ЧТЕНИЕ 2)
    
    for each broker in snaps (Webull, Robinhood) in parallel:
        executeOneBroker(w, ev, trigger, corr, broker.name, broker.br):
            
            # 4.1. Проверка книг и позиции
            open, held, heldErr = booksForBroker(ev, name, br)
            
            # 4.2. Принятие торгового решения
            decision = decideLiveAction(ev.Quotes, ev.Symbols, held, heldErr, open)
            
            # [БАГ #3]: В booksForHeld отфильтрован open, но held всё еще содержит проданную акцию!
            # len(held) > 0 => decideLiveAction возвращает "broker_position_exists"! Вход блокирован!
            
            # 4.3. Проверка блокировок
            if decision.action == "entry" and w.entryBlocked[name]:
                # [БАГ #10]: Если был unrecorded position на выходе, entryBlocked блокирует вход!
                return none("consistency_mismatch")
                
            # 4.4. Отправка ордера
            submitEvaluated(w, ev, brokerName, br):
                # Проверка reservations, pending tracker...
                
                # Расчет размера позиции:
                # [БАГ #4]: resolveEntryBalanceSizing берет cash_balance ($12),
                # игнорируя $25,000 в unsettled_cash и net_liquidation_value!
                # Результат: qty = 0 => ошибка "Calculated order quantity is zero"!
                qty = sizeOrder(action, symbol, br, w)
                
                # Отмена открытых ордеров перед входом:
                # [БАГ #9]: Повторный HTTP-запрос GET /order/list к Webull перед самой отправкой ордера!
                if action == "entry":
                    cancelOpenOrdersBeforeEntry(w, symbol, br)
                    
                # Отправка маркет-ордера:
                # Webull:
                # [БАГ #11]: c.ResolveInstrumentID(symbol) -> GET /instrument/list (без кэша, 250ms)
                #            c.PlaceOrderCtx -> POST /order/place (250ms)
                #            c.OrderDetailCtx -> GET /order/detail (250ms)
                # Robinhood:
                #            get_equity_tradability
                #            review_equity_order
                #            place_equity_order
                res = placeMarket(w, symbol, side, qty, br)
                
                # Старт отслеживания
                startTracking(res, ...)


# -------------------------------------------------------------------------
# ШАГ 5: ТРЕКИНГ И ФИКСАЦИЯ ФИЛЛОВ (go/internal/live/track.go & trade_record.go)
# -------------------------------------------------------------------------
function Engine.pollTracker(tracker):
    detail, err = br.OrderDetail(tracker.clientOrderId)
    
    # [БАГ #5]: У Robinhood при лаге листинга findOrder возвращает nil => ErrOrderNotFound!
    if errors.Is(err, ErrOrderNotFound):
        # Немедленно финализирует трекер как "terminal_absent"!
        # runT1Orders считает, что ордер пропал, и шлет повторный SELL! ДВОЙНАЯ ПРОДАЖА!
        finalizeTracker(tracker, "terminal_absent")
        return true
        
    # Извлечение статуса и исполненного объема:
    # [БАГ #6]: fillQtyFrom НЕ ЗНАЕТ поле "cumulative_quantity" от Robinhood!
    reportedQty = fillQtyFrom(detail)  # для Robinhood возвращает 0!
    
    recordFill(tracker, detail, status):
        # Если статус "partially_filled", но reportedQty == 0:
        # Частичное исполнение молча игнорируется и отбрасывается!
```

---

## 3. Систематический реестр выявленных дефектов (AUD-073 .. AUD-084)

| ID | Уровень | Подсистема | Краткое описание дефекта |
|---|---|---|---|
| **AUD-073** | **P1 (Критический)** | `live/telegram.go`, `live/track.go` | **Взаимная блокировка брокеров при выходе/входе.** `awaitFlatAfterExit(brokers)` требует закрытия позиций у *всех* выходивших брокеров одновременно. Если выход Webull исполнился за 400 мс, а Robinhood задержался на 5 секунд (или дал сбой), `pendingExitFor` блокирует повторный вход (`waitFill=true`) для обоих брокеров. Webull лишается входа из-за чужой задержки. |
| **AUD-074** | **P1 (Критический)** | `live/telegram.go`, `live/execute_all.go` | **Искажение отчёта Telegram и потеря сделок в `out.Broker`.** При одновременном выходе одного брокера и входе другого на проходе 1, `effectiveDecision` признает весь прогон «выходом». В Telegram уходит ложное сообщение (например, «Webull: SELL AAPL», хотя Webull купил NVDA). На проходе 2 `out.Broker` перезаписывается результатами `entryRes`, стирая факт покупки Webull из системного ответа. |
| **AUD-075** | **P1 (Критический)** | `live/autotrade.go`, `live/sizing.go` | **Блокировка Same-Day Re-Entry из-за неочищенного `held`.** `closedTodayFor` в `booksForHeld` не дает продать проданную сегодня бумагу второй раз, но оставляет её в карте `held`. В `decideLiveAction` проверка `len(held) > 0` видит эту запись и отвечает `broker_position_exists`, полностью блокируя повторный вход в тот же день при малейшей задержке брокерского API. |
| **AUD-076** | **P1 (Критический)** | `live/sizing.go` | **Схлопывание объема позиции до 0 из-за остаточного `cash_balance`.** При выходе из позиции средства на Webull и Robinhood зачисляются в `unsettled_cash`/`day_buying_power`. Если на счете оставалось хотя бы $5-$10 старого остатка, `extractCashBalance` возвращает этот остаток вместо `net_liquidation_value`. Ордер на вход рассчитывается на $5, дает 0 акций и падает с ошибкой. |
| **AUD-077** | **P1 (Критический)** | `live/robinhood_broker.go`, `live/track.go` | **Ложный `terminal_absent` и дублирование ордеров Robinhood при лаге листинга.** Если ордер Robinhood не появился в `get_equity_orders` мгновенно, `OrderDetailCtx` возвращает `ErrOrderNotFound` вместо `ErrOrderUnavailable`. Трекер тут же финализируется как `terminal_absent`. Система решает, что ордер выхода не выставился, и шлет **второй SELL MARKET**, удваивая продажу. |
| **AUD-078** | **P1 (Критический)** | `live/order_parse.go`, `live/trade_record.go` | **Потеря частичных исполнений Robinhood из-за `cumulative_quantity`.** Robinhood возвращает исполненный объем в поле `cumulative_quantity`. Функция `fillQtyFrom` проверяет только `filled_qty`, `cum_qty`, `deal_quantity`. При частичном исполнении `reportedQty` признается равным 0, и сделка молча отбрасывается без записи в журнал. |
| **AUD-079** | **P2 (Высокий)** | `live/track.go` | **Голодание опроса трекеров в `awaitFlatAfterExit`.** `pendingExitFor(brokers)` всегда берет первого брокера по алфавиту (`robinhood`). Пока Robinhood висит в ожидании, трекер Webull не опрашивается вообще. Филл Webull простаивает до тех пор, пока Robinhood не завершит свой ордер. |
| **AUD-080** | **P2 (Высокий)** | `webull/client.go`, `live/autotrade.go`, `live/sizing.go` | **Каскадные 429 Too Many Requests на `/account/positions` Webull.** Эндпоинт позиций Webull лимитирован 1 запросом в 2 секунды. Логика T-1 вызывает его 3-5 раз за 10 секунд (в `consistencyWindow`, `EvaluateWindow`, `sizeOrder`, `awaitBrokerBooksFlat`). Каждый 429 включает экспоненциальный бэкофф (1с + 2с), сжигая до 6-9 секунд внутри закрывающей минуты. |
| **AUD-081** | **P2 (Высокий)** | `live/execute_all.go`, `live/autotrade.go` | **Лишний блокирующий запрос `cancelOpenOrdersBeforeEntry`.** `t1BrokerReconcile` уже проверяет висящие заявки и выставляет `busySymbols`. Повторный вызов `cancelOpenOrdersBeforeEntry` перед входом делает лишний сетевой запрос к брокеру, который при малейшем сетевом сбое или 429 бракует чистый вход ошибкой `open_orders_unavailable`. |
| **AUD-082** | **P2 (Высокий)** | `live/telegram.go`, `live/autotrade.go` | **Вечная блокировка входа `w.entryBlocked` после закрытия ручной позиции.** Если у брокера была позиция мимо журнала, она закрывается по сигналу выхода. Но флаг `entryBlocked`, рассчитанный в начале минуты, передается на второй проход входа без пересчета, блокируя повторный вход ошибкой `consistency_mismatch`. |
| **AUD-083** | **P3 (Средний)** | `webull/client.go` | **Отсутствие кэширования `instrument_id` Webull.** На каждый ордер (выход, вход, ретрай) делается отдельный HTTP-запрос к `/instrument/list`. Для топ-10 акций США эти идентификаторы статичны. Лишний запрос тратит слот 250 мс и добавляет задержку перед MARKET-ордером. |
| **AUD-084** | **P3 (Средний)** | `live/deadline.go` | **Отсутствие context deadline в `w.ctx`.** `w.deadline` существует как структура, но `w.ctx` передается как `context.Background()`. При зависании TCP-сокета на стороне брокера контекст не обрывает запрос по наступлению дедлайна T-1. |

---

## 4. Подробный разбор дефектов и сценарии сбоев

### AUD-073 [P1]: Взаимная блокировка брокеров в `runT1Orders`
#### Механизм
В `go/internal/live/telegram.go:55-68`:
```go
brokers := exitingBrokers(exitRes)
if e.awaitFlatAfterExit(brokers) {
    e.awaitBrokerBooksFlat(w, brokers)
    entryRes = e.executeWindow(w, "telegram_t1")
    return exitRes, entryRes, false
}
pending, err := e.pendingExitFor(brokers)
if err != nil || pending != nil {
    _ = e.DB.AppendAutotradeLog("t1_entry_blocked_waiting_exit_fill")
    return exitRes, entryRes, true
}
```
А в `go/internal/live/track.go:789-806`:
```go
func (e *Engine) journalFlat(brokers []string) (bool, error) {
    ...
    for _, b := range brokerScope(brokers) {
        if store.OpenBrokerTradeFor(rows, b) != nil {
            return false, nil
        }
    }
    return true, nil
}
```
Если оба брокера выходят (`brokers = ["robinhood", "webull"]`), функция `journalFlat` вернет `true` **только тогда, когда закрылись позиции у обоих брокеров**.

#### Сценарий катастрофы
1. 15:59:00: У Webull открыта позиция AAPL, у Robinhood открыта позиция SPY. У обоих сигнал выхода.
2. Отправляются два SELL ордера.
3. Маркет-ордер Webull на NASDAQ исполняется моментально (за 350 мс). В журнале `broker_trades` позиция Webull закрыта.
4. У Robinhood возникает сетевая задержка MCP или задержка биржевого шлюза (ордер исполняется 6 секунд).
5. `awaitFlatAfterExit` крутит цикл до 10 попыток (5 секунд). На всех попытках `journalFlat` возвращает `false` (так как Robinhood еще не закрыт).
6. Цикл завершается по таймауту.
7. Проверяется `pendingExitFor(brokers)`. Он возвращает незакрытый трекер Robinhood.
8. `runT1Orders` пишет в лог `t1_entry_blocked_waiting_exit_fill` и выходит с `waitFill=true`.
9. **Результат**: Webull **полностью закрыт, свободен и готов к покупке новой акции**, но его повторный вход **заблокирован** из-за медлительности Robinhood! Вход не состоялся.

---

### AUD-074 [P1]: Искажение Telegram-отчёта и стирание исполнения в `out.Broker`
#### Механизм
В `go/internal/live/telegram.go:297-303`:
```go
exitRes, entryRes, waitFill = e.runT1Orders(w, today)
out.Executed = exitRes.Executed || entryRes.Executed
if entryRes.Executed {
    out.Broker = entryRes.Broker
} else {
    out.Broker = exitRes.Broker
}
```
И в `buildT1Text` (`go/internal/live/telegram.go:413-453`):
```go
appendExec := func(res EvalResult, dry bool) {
    dec := effectiveDecision(res)
    action, _ := dec["action"].(string)
    sym := fmt.Sprint(dec["symbol"])
    verb := "Открываем"; side := "BUY"
    if action == "exit" { verb = "Закрываем"; side = "SELL" }
    head := fmt.Sprintf("• %s %s по %s (IBS %s)", verb, sym, priceS, ibsS)
    ...
    for name, one := range execOutcomes(res.Broker) {
        ...
        outcomes = append(outcomes, fmt.Sprintf("• %s: %s MARKET отправлен (%v шт.)", label, side, qty))
    }
}
```

#### Сценарий катастрофы
1. Webull свободен (нет позиций). Сигнал на вход в NVDA.
2. Robinhood держит MSFT. Сигнал на выход из MSFT.
3. Первый проход `exitRes = executeWindow`:
   - Webull покупает NVDA (BUY 10 шт.).
   - Robinhood продает MSFT (SELL 50 шт.).
4. `effectiveDecision(exitRes)`: так как в `BrokerDecisions` есть "exit", функция выбирает решение Robinhood (MSFT, SELL).
5. `appendExec(exitRes)` формирует заголовок: `• Закрываем MSFT...`
6. Далее цикл печатает брокеров из `res.Broker`:
   - `Robinhood: SELL MARKET отправлен (50 шт.)`
   - `Webull: SELL MARKET отправлен (10 шт.)` ‼️
   В Telegram отправляется сообщение, что **Webull продал MSFT**, хотя Webull **купил NVDA**!
7. Затем Robinhood закрывается и на втором проходе (`entryRes`) покупает NVDA.
8. В `Aggregate`: `entryRes.Executed == true`.
9. `out.Broker = entryRes.Broker` — в `entryRes.Broker` лежат только данные Robinhood!
10. Данные о покупке Webull на первом проходе **безвозвратно удаляются** из `out.Broker`. Внешнее API считает, что Webull ничего не делал.

---

### AUD-075 [P1]: Блокировка Same-Day Re-Entry из-за неочищенного `held`
#### Механизм
В `go/internal/live/autotrade.go:528-541`:
```go
for _, sym := range syms {
    if closedTodayFor(rows, name, sym, today) {
        continue
    }
    open = map[string]any{"symbol": sym, ...}
    break
}
return open, held, heldErr
```
И в `decideLiveAction` (`go/internal/live/autotrade.go:457`):
```go
if open == nil && allowEntries {
    if heldErr != nil { return none("broker_positions_unavailable", nil, nil) }
    if len(held) > 0 { return none("broker_position_exists", nil, nil) }
    ...
}
```

#### Сценарий катастрофы
1. Брокер продал AAPL в 15:59:05.
2. В журнале сделка AAPL закрыта.
3. В 15:59:08 запускается второй проход для входа.
4. Вызывается `booksForHeld`. Позиция AAPL еще присутствует в ответе брокера `/account/positions` (стандартный лаг брокерской ленты 1-2 секунды).
5. `closedTodayFor` видит, что AAPL закрыт сегодня, и не создает синтетический `open`. Поэтому `open == nil`.
6. **НО** `booksForHeld` возвращает оригинальную карту `held`, где AAPL по-прежнему лежит!
7. `decideLiveAction` видит `open == nil` и проверяет: `len(held) > 0`.
8. Так как в `held` остался AAPL, условие выполняется!
9. `decideLiveAction` возвращает `none("broker_position_exists")`!
10. **Результат**: вход на закрытии сорван. Вместо покупки лучшей акции система утверждает, что «у брокера уже есть позиция».

---

### AUD-076 [P1]: Схлопывание объема позиции до 0 из-за остаточного `cash_balance`
#### Механизм
В `go/internal/live/sizing.go:266-285`:
```go
buyingPower = extractEntryFundsFromBalance(root)
cash := extractCashBalance(root)
if cash > 0 {
    baseCapital = cash
} else {
    ...
    baseCapital = extractNetLiquidation(root) - mv
}
```

#### Сценарий катастрофы
1. Депозит инвестора на Webull: $30,000.
2. Была открыта позиция на $29,985. На остатке оставалось $15.00 живых денег.
3. В 15:59 позиция закрывается (продано на $30,000).
4. Деньги от продажи поступают на брокерский счет в статус `unsettled_cash` (клиринг T+1), при этом `day_buying_power` = $30,000, `net_liquidation_value` = $30,015.
5. Поле `cash_balance` брокера по-прежнему равно **$15.00** (так как клиринг не прошел).
6. Вызывается расчет размера позиции для входа:
7. `extractCashBalance` возвращает `$15.00`.
8. Проверка `if cash > 0` дает `true`!
9. `baseCapital` принимается равным **$15.00** вместо $30,015!
10. Функция `ComputeOrderQuantity`: при цене акции $150 расчет дает `$15 / $150 = 0.1` акции.
11. Округление `math.Floor(0.1)` дает `0` акций!
12. Вызов падает с фатальной ошибкой:
    `"Calculated order quantity is zero; increase funds or reduce price"`.
13. **Результат**: вход сорван из-за ложного расчета капитала.

---

### AUD-077 [P1]: Ложный `terminal_absent` и дублирование ордеров Robinhood
#### Механизм
В `go/internal/live/robinhood_broker.go:303-305`:
```go
if found == nil {
    return nil, fmt.Errorf("%w: client_order_id %s not in orders response", ErrOrderNotFound, clientOrderID)
}
```
И в `go/internal/live/track.go:360-363`:
```go
if errors.Is(derr, ErrOrderNotFound) {
    e.finalizeTracker(t, "terminal_absent")
    return true, nil
}
```

#### Сценарий катастрофы
1. Robinhood отправляет ордер SELL на 100 акций AAPL через `place_equity_order`. Ордер принят шлюзом.
2. Немедленно вызывается `pollTracker`.
3. Запрос `get_equity_orders` еще не успел проиндексировать свежий ордер в базе Robinhood (лаг 100-300 мс).
4. `findOrder` не находит ордер и возвращает `ErrOrderNotFound`.
5. `pollTracker` классифицирует ошибку как `terminal_absent` и немедленно **уничтожает трекер**!
6. В `runT1Orders` трекер выхода больше не числится в pending, а позиция в журнале не закрыта.
7. Срабатывает строка 69 `telegram.go`:
   `_ = e.DB.AppendAutotradeLog("t1_exit_rejected_retry")`
8. `runT1Orders` делает повторный вызов `executeWindow`!
9. Отправляется **второй ордер SELL на 100 акций AAPL**!
10. **Результат**: двойная продажа одних и тех же акций на бирже (попытка входа в шорт или отказ брокера по марже).

---

### AUD-078 [P1]: Потеря частичных исполнений Robinhood из-за `cumulative_quantity`
#### Механизм
В `go/internal/live/order_parse.go:56-66`:
```go
func fillQtyFrom(detail map[string]any) float64 {
    return firstPositive(
        detail["filled_qty"],
        detail["filled_quantity"],
        detail["cum_qty"],
        detail["deal_quantity"],
    )
}
```
API Robinhood для исполненного объема использует стандартное поле `cumulative_quantity` (документировано в API Robinhood и тестах `robinhood_broker_test.go:718`).

#### Сценарий катастрофы
1. Отправлен ордер на покупку 100 акций.
2. Robinhood исполняет частично: 40 акций, статус `partially_filled`, `cumulative_quantity = "40.000000"`.
3. `fillQtyFrom` проверяет поля и не находит `cumulative_quantity`. Возвращает `0`.
4. В `recordFill` (`trade_record.go:201`):
   `if status != "filled" && !(reportedQty > 0) { return }`
5. Так как `reportedQty == 0`, функция делает `return`!
6. 40 реально купленных акций **не попадают в журнал**, не создают позицию, а в логах операция бесследно пропадает.

---

### AUD-080 [P2]: Каскадные 429 Too Many Requests на эндпоинте позиций Webull
#### Механизм
Лимит эндпоинта `/account/positions` Webull составляет строго **1 запрос в 2 секунды**. Глобальный рейт-лимитер `MinRequestInterval = 250ms` защищает только от общей частоты вызовов OpenAPI, но не защищает конкретный эндпоинт позиций от лимита в 2 секунды.
При наступлении T-1 происходят вызовы:
1. `consistencyWindow`: GET `/account/positions` (t = 0.0s) -> OK (200).
2. `EvaluateWindow`: GET `/account/positions` (t = 0.25s) -> **HTTP 429**!
   - Бэкофф: пауза 1.0 сек.
   - Повтор: (t = 1.25s) -> все еще < 2 сек -> **HTTP 429**!
   - Бэкофф: пауза 2.0 сек.
   - Повтор: (t = 3.25s) -> OK (200).
   - Потеряно **3.25 секунды**.
3. `sizeOrder`: GET `/account/positions` (t = 3.5s) -> снова **HTTP 429**!
   - Потеряно еще **3.0 секунды**.
4. В итоге закрывающая минута тратит до **9 секунд** на пустые ожидания в ретраях 429 ошибки на избыточных чтениях одного и того же состояния.

---

## 5. Целевая архитектура и эталонный псевдокод (TO-BE)

Чтобы логика работала безупречно и надежно, «как молоток», архитектура T-1 должна строиться на следующих фундаментальных принципах:

### Принципы эталонной архитектуры:
1. **Строгая поброкерная конвейеризация (Per-Broker Isolation)**:
   Оркестрация T-1 не должна быть глобальной двухпроходной машиной. Каждый брокер должен иметь свой собственный независимый пайплайн `ExecuteBrokerT1`:
   - Если Webull нужно закрыть AAPL и открыть NVDA — он делает это в своем темпе.
   - Если Robinhood нужно только войти в NVDA — он входит сразу, не дожидаясь Webull.
   - Если у Robinhood произошла ошибка — Webull даже не знает об этом и завершает свои сделки.
2. **Атомарный Same-Day Flip**:
   Для брокера, имеющего позицию к выходу:
   `Отправка SELL -> Ожидание Fill -> Обновление баланса (NLV) -> Отправка BUY`.
3. **Единый снимок позиций (Zero Redundant Reads)**:
   Позиции брокера читаются **ровно 1 раз** в начале T-1 для каждого брокера и используются совместно в сверке, оценке и расчете размера ордера выхода.
4. **Безопасное определение капитала (NLV-First Sizing)**:
   Если у брокера нет открытых позиций, базовый капитал — это `Net Liquidation Value` за вычетом резерва, что автоматически учитывает как `cash_balance`, так и `unsettled_cash`.

### Эталонный псевдокод ядра T-1:

```python
# =========================================================================
# ЭТАЛОННЫЙ ПСЕВДОКОД: ПОЛНОСТЬЮ АВТОНОМНЫЙ МУЛЬТИБРОКЕРСКИЙ T-1
# =========================================================================

function RunT1Workflow(opts):
    w = createExecutionWindow(deadline = sessionClose - 5_sec)
    
    # 1. Единый префетч котировок для всех тикеров наблюдения
    quotes = prefetchWatchQuotes(w)
    
    # 2. Параллельный запуск изолированных брокерских конвейеров
    brokers = ["webull", "robinhood"]
    results = ConcurrentMap()
    
    parallel_for broker in brokers:
        results[broker] = ExecuteBrokerPipeline(broker, quotes, w)
        
    # 3. Формирование раздельного отчета без смешивания брокеров
    report = BuildIndependentTelegramReport(results)
    SendTelegram(report)


function ExecuteBrokerPipeline(broker, quotes, w):
    pipelineResult = {
        "broker": broker,
        "exit": None,
        "entry": None,
        "errors": []
    }
    
    # Проверка доступности и токена брокера
    if not isBrokerHealthy(broker):
        pipelineResult.errors.append("broker_unhealthy")
        return pipelineResult

    # ---------------------------------------------------------------------
    # ФАЗА 1: ЧТЕНИЕ СОСТОЯНИЯ (РОВНО ОДНО ЧТЕНИЕ НА БРОКЕРА!)
    # ---------------------------------------------------------------------
    # Одно чтение позиций кормит и сверку, и decision, и sizing выхода!
    positions, posErr = broker.readPositions(w)
    if posErr:
        pipelineResult.errors.append("positions_unavailable: " + posErr)
        # Выход невозможен без знания позиции, вход заблокирован
        return pipelineResult

    journalOpenTrade = db.getOpenTrade(broker)
    
    # Сверка: выявляем тикер, требующий закрытия
    # Приоритет: позиция у брокера закрывается всегда!
    heldSymbol, heldQty = extractHeldPosition(positions)
    
    # ---------------------------------------------------------------------
    # ФАЗА 2: ОЦЕНКА СИГНАЛОВ ВЫХОДА (EXIT EVALUATION)
    # ---------------------------------------------------------------------
    needsExit = False
    if heldSymbol != None and heldQty > 0:
        quote = quotes[heldSymbol]
        if quote != None and isExitSignal(quote.ibs, quote.highThreshold):
            needsExit = True
            
    # ---------------------------------------------------------------------
    # ФАЗА 3: ИСПОЛНЕНИЕ ВЫХОДА (ЕСЛИ ЕСТЬ СИГНАЛ)
    # ---------------------------------------------------------------------
    if needsExit:
        # Размер выхода строго равен количеству у брокера (heldQty)
        # Никаких повторных запросов позиций!
        exitOrder = broker.placeMarketOrder(symbol=heldSymbol, side="SELL", qty=heldQty, w=w)
        pipelineResult.exit = exitOrder
        
        if not exitOrder.submitted:
            pipelineResult.errors.append("exit_submit_failed: " + exitOrder.error)
            return pipelineResult
            
        # Ожидание исполнения маркет-ордера на ликвидной акции (до 5 сек)
        # Опрашивает ТОЛЬКО трекер этого конкретного брокера!
        fillConfirmed = awaitOrderFill(broker, exitOrder.id, timeout=5_sec, w=w)
        if not fillConfirmed:
            pipelineResult.errors.append("exit_fill_timeout")
            # Не входим, пока выход не подтвержден (защита от овернайт плеча)
            return pipelineResult
            
        # Сброс локальной картины позиций: брокер теперь чист!
        heldSymbol = None
        heldQty = 0
        positions = []

    # ---------------------------------------------------------------------
    # ФАЗА 4: ОЦЕНКА СИГНАЛОВ ВХОДА (ENTRY EVALUATION)
    # ---------------------------------------------------------------------
    # Если брокер чист (был чист изначально или успешно вышел):
    if heldSymbol == None or heldQty == 0:
        candidate = selectLowestIbsCandidate(quotes)
        
        if candidate != None:
            # -----------------------------------------------------------------
            # ФАЗА 5: ИСПОЛНЕНИЕ ВХОДА (ENTRY EXECUTION)
            # -----------------------------------------------------------------
            # Чтение баланса для сайзинга (1 запрос)
            account = broker.readAccount(w)
            
            # Корректный расчет доступного капитала (NLV-First):
            # Если позиций нет, капитал = Net Liquidation Value (включая unsettled_cash)
            entryFunds = calculateEntryFunds(account, mode=broker.capitalMode)
            
            # Расчет количества целых акций
            qty = floor( (entryFunds * (1 - reservePct)) / candidate.price )
            
            if qty > 0:
                entryOrder = broker.placeMarketOrder(symbol=candidate.symbol, side="BUY", qty=qty, w=w)
                pipelineResult.entry = entryOrder
                if not entryOrder.submitted:
                    pipelineResult.errors.append("entry_submit_failed: " + entryOrder.error)
            else:
                pipelineResult.errors.append("calculated_qty_zero")
        else:
            pipelineResult.entry = {"action": "none", "reason": "no_signal"}
            
    return pipelineResult
```

---

## 6. Рекомендации по устранению проблем

Для приведения кодовой базы в идеальное состояние рекомендуются следующие точечные изменения (в соответствии с философией *ponytail*):

1. **Разделение циклов брокеров в `runT1Orders`**:
   Перенести логику `exit -> await_flat -> entry` внутрь горутины каждого брокера в `executeOneBroker`. Устранить зависимость `awaitFlatAfterExit` от чужих брокеров.
2. **Исправление сайзинга в `sizing.go` (`resolveEntryBalanceSizing`)**:
   Когда позиций нет (`len(positions) == 0` или `open == nil`), определять `baseCapital = extractNetLiquidation(root)`. Не использовать старый `cash_balance`, если он меньше `net_liquidation_value`.
3. **Фильтрация `held` в `booksForHeld`**:
   Удалять символы, удовлетворяющие `closedTodayFor`, непосредственно из возвращаемой карты `held`, чтобы `decideLiveAction` не блокировал вход по `broker_position_exists`.
4. **Исправление лага листинга Robinhood**:
   В `RobinhoodBroker.OrderDetailCtx` при отсутствии ордера в `get_equity_orders` возвращать `ErrOrderUnavailable` вместо `ErrOrderNotFound`, чтобы задействовать стандартный механизм ожидания `listingLagExpired` и предотвратить ложную повторную продажу.
5. **Поддержка `cumulative_quantity` в `order_parse.go`**:
   Добавить `detail["cumulative_quantity"]` в список проверяемых полей функции `fillQtyFrom`.
6. **Кэширование чтения `/account/positions` внутри T-1**:
   Передавать уже прочитанные в начале T-1 книги `books` во все последующие вызовы (`EvaluateWindow`, `sizeOrder` выхода), устраняя каскадные 429 ошибки Webull.
7. **Кэширование `ResolveInstrumentID`**:
   Добавить `sync.Map` для сопоставления `symbol -> instrument_id` в `webull.Client`, так как тикеры топ-10 акций статичны.
8. **Раздельное форматирование в `buildT1Text`**:
   Генерировать строки решений индивидуально по каждому брокеру из `res.BrokerDecisions[name]`, полностью исключив подстановку общего заголовка `effectiveDecision` для разных инструментов.

---

## 7. Заключение

Аудит подтвердил, что базовая идея торговой стратегии (IBS Mean-Reversion на топ-10 акциях США рыночными ордерами на закрытии) математически проста и эффективна. Однако текущая реализация страдала от **избыточного межброкерского связывания (coupling)**, скрытых каскадных рейт-лимитов Webull (2 сек на эндпоинт позиций) и тонких дефектов учета капитала после выхода.

Устранение найденных дефектов по эталонному псевдокоду раздела 5 обеспечит абсолютно автономную, надежную работу каждого брокера, без зависаний и ложных блокировок.
