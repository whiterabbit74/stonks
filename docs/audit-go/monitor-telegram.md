# Аудит: монитор рынка / Telegram / целостность данных — Node vs Go

Область: server/src/services/{telegramAggregation,trades,priceActualization,emaAlerts,marketDataIntegrity,monitorConsistency,telegram,dates}.js
vs go/internal/live/{monitor,telegram,telegram_t11,actualize,ema,integrity,engine,transport,calendar_import}.go,
go/internal/scheduler/scheduler.go, go/internal/ibs/ibs.go, go/internal/store/live_persist.go, go/internal/httpapi/live_handlers.go.

Границы: автотрейд через Webull (autotrade.go, webull_broker.go, track.go, sizing.go) не аудируется по существу —
только отмечается, если расхождение из зоны аудита туда протекает.

---

### [CRITICAL] evalWatch тихо подменяет отсутствующую живую котировку вчерашним дневным баром — и это течёт в реальные торговые решения

- **Node:** `server/src/services/telegramAggregation.js:402-461` — при ошибке `fetchTodayRangeAndQuote` (сеть, провайдер лежит, невалидный range) код попадает в `catch`, выставляет `rec.fetchError` и `rec.rtFresh = false`, но **`rec.dataOk` остаётся `false`** (инициализировано на строке 380 и никогда не перезаписывается в catch-ветке). Тикер полностью исключается из решений: T-1 цикл делает `if (!rec.dataOk) continue;` (строка 560). Аналогично `server/src/services/autotrade.js:562-591` (`evaluateMarketSnapshotForSymbols`) — при ошибке квоты строка помечается `ok: false` и не участвует в выборе `best`/exit-кандидата. Ни один путь принятия торгового решения никогда не считает IBS по дневному бару вместо реалтайм-котировки.
- **Go:** `go/internal/live/telegram.go:355-415` (`evalWatch`). Если `e.quotes().Quote(sym, provider)` вернул ошибку (или котировка есть, но `ibsFromQuote` не смог посчитать), `ok` остаётся `false` после первого блока. Далее:
  ```go
  bars, adj, _ := e.DB.GetOHLC(sym)
  ...
  if !ok || price <= 0 {
      if len(bars) > 0 {
          last := bars[len(bars)-1]
          if !ok {
              vals := indicators.IBS(bars)
              ibsVal = vals[len(vals)-1]   // IBS ПРОШЛОГО дневного бара
              ok = true                    // <-- тихо помечает как валидные данные
          }
          if price <= 0 {
              price = last.Close           // цена вчерашнего закрытия
          }
      }
  }
  ...
  ev.ok = true
  ev.ibs = ibsVal
  ev.entry = ibs.IsEntrySignal(ibsVal, low)
  ev.exit  = ibs.IsExitSignal(ibsVal, high)
  ```
  `ev.rtFresh` остаётся `false` (выставляется только внутри успешного блока квоты), но ничто ниже по стеку это не проверяет.
- **Расхождение:** Go способен выставить `ev.ok = true` и посчитать entry/exit-сигнал по **вчерашнему дневному бару**, когда реалтайм-провайдер недоступен, вместо того чтобы пропустить тикер, как делает Node. `evalWatch` — общая функция: она же используется в `go/internal/live/autotrade.go:216-221` (`Evaluate()`) для реального выбора кандидата на вход/выход. Условие выбора там — `q["ok"] == true` (autotrade.go:249) и `row != nil && ibs.IsExitSignal(...)` (autotrade.go:232) — **`rtFresh` нигде не проверяется**, то есть протухшие данные способны реально инициировать `Execute()` → ордер у брокера.
- **Сценарий отказа:** Finnhub/провайдер отдаёт 5xx или таймаут ровно в T-1 (16:00 ET минус 1 минута) для тикера с историческим IBS вчера < lowIBS. Node в этот момент просто не увидит сигнал (безопасный пропуск). Go посчитает IBS по вчерашнему close/low/high, признает сигнал валидным и абсолютно легитимным для входа, и `executeWebullSignal`-эквивалент (`Execute`) отправит реальный ордер по цене вчерашнего закрытия/текущей псевдо-цене — то есть сделка совершается не на основе сегодняшних данных вообще.
- **Фикс:** в `evalWatch` убрать фолбэк на `indicators.IBS(bars)`/`last.Close` для `ev.ok`/`ev.entry`/`ev.exit` (или хотя бы завести отдельное поле, не участвующее в `Evaluate()`/`Execute()`), и/или требовать `ev.rtFresh == true` в `autotrade.go` перед тем как считать `q["ok"]` пригодным для решения — то есть привести к поведению Node: нет свежей котировки — тикер не участвует в принятии решения в этот проход.

---

### [CRITICAL] Reconcile/Consistency в Go не переносит автопочинку рассинхрона monitor/broker — и два из трёх «блокирующих» кодов никогда не производятся

- **Node:** `server/src/services/monitorConsistency.js` — `getMonitorConsistencySnapshot()` строит полноценный набор диагнозов через `linkedBrokerTradeId`/`canAdoptOpenMonitor`/`sameDayClosedBrokerMatches`: коды `linked_monitor_trade_closed_in_broker` (autoFixable), `linked_monitor_trade_missing_broker_match` (blocking, error), `legacy_monitor_trade_missing_link` (autoFixable), `legacy_monitor_trade_can_close_from_broker_history` (autoFixable), `legacy_monitor_trade_ambiguous_broker_match` (blocking, error), `monitor_trade_without_broker_position`/`broker_trade_without_monitor_projection` (только если `source !== 'manual'`). `reconcileMonitorState({apply: true})` реально применяет все `autoFixable` действия через `applyConsistencyAction` (строки 217-266): закрывает orphaned monitor-сделку из истории брокера, линкует legacy-сделку. Вызывается на каждый прогон `runTelegramAggregation` (aggregation.js:324) и на старте сервера (server.js:157).
- **Go:** `go/internal/live/monitor.go:16-95`. `Consistency()` реализует только 3 самых простых случая (monitor open/broker flat; broker open/monitor flat; symbol mismatch) — **без** учёта `source !== 'manual'`, **без** `linkedBrokerTradeId`, **без** `canAdoptOpenMonitor`, **без** `sameDayClosedBrokerMatches`. `autoFixable` всегда `false` — поля в issue-объекте это подтверждают (нет даже такого ключа, в отличие от Node). `Reconcile(apply bool)` (строки 84-95) при `apply=true` вызывает только `e.UpdatePositions()` — никакого `applyConsistencyAction`-аналога, никакой автопочинки monitor/broker связки нет вообще.
- **Расхождение:** (1) Коды `linked_monitor_trade_missing_broker_match` и `legacy_monitor_trade_ambiguous_broker_match` перечислены в Go в `blockingMismatchCodes` (monitor.go:10-14) и проверяются в `BlockingMismatch()`/T-1 (`telegram.go:166` `blocking := BlockingMismatch(snap)`), но `Consistency()` **никогда их не производит** — блокировка входа в T-1 в этих двух сценариях в Go не сработает никогда, хотя в Node сработала бы и остановила бы отправку ордера. (2) Полностью отсутствует саморазрешение (auto-heal) состояния — если monitor-сделка осиротела относительно уже закрытой в истории брокера сделки, Node тихо её закроет и снова разрешит вход, а Go будет вечно висеть в `monitor_trade_without_broker_position` (или тише — вообще ничего не заметит, т.к. Go не проверяет `linkedBrokerTradeId`).
- **Сценарий отказа:** Рестарт процесса/сеть моргнула ровно между исполнением ордера у брокера и записью monitor-сделки; либо ручное закрытие позиции в Webull напрямую. Node сам починит стейт на следующем прогоне агрегации. Go будет либо вечно считать позицию открытой (блокируя новые входы через `openTradeAfterExit`/`open != nil` в Evaluate), либо, если по каким-то причинам символы совпали по `sameDayOpenBrokerMatch`, тихо пропустит реальный mismatch, который Node бы поймал как `error`/blocking.
- **Фикс:** портировать `linkedBrokerTradeId`/`canAdoptOpenMonitor`/`sameDayClosedBrokerMatches` логику и `applyConsistencyAction` в Go, либо явно задокументировать сужение функциональности и убрать мёртвые коды из `blockingMismatchCodes`, если их правда решили не реализовывать (но тогда снять с них флаг "blocking" в комментариях/поведении, раз они не воспроизводимы).

---

---

# Дополнено вручную (агент прерван на лимите API)

### [HIGH] Актуализация цен полностью лишилась троттлинга запросов к провайдеру

- **Node:** `services/priceActualization.js:55-61, 83-91` — между тикерами выдерживается пауза `PRICE_ACTUALIZATION_REQUEST_DELAY_MS` (по умолчанию 15000 мс) плюс случайный джиттер до `PRICE_ACTUALIZATION_DELAY_JITTER_MS` (2000 мс). Обе переменные читаются в `config/index.js:56-61` и вынесены в документацию (CLAUDE.md, ENVIRONMENT.md).
- **Go:** `live/actualize.go:71-83` — цикл `for _, sym := range symbols` вызывает `qs.Historical(...)` подряд без единой паузы. Проверено grep'ом: `PRICE_ACTUALIZATION_*` **не читается нигде** в `go/internal`, а `time.Sleep` встречается ровно один раз — в бэкоффе трекера ордеров (`live/track.go:46`).
- **Сценарий отказа:** актуализация обходит объединение watch-тикеров, EMA-алертов и всех датасетов. При десятке тикеров это десяток запросов подряд. Alpha Vantage на бесплатном тарифе — порядка 5 запросов в минуту; провайдер отдаёт ошибку лимита либо временно блокирует ключ. Дальше `out.Failed` наполняется, `Success` становится ложью, и цены не обновляются вовсе.
- **Фикс:** вернуть паузу с джиттером между тикерами, читая те же переменные окружения.

### [HIGH] Актуализация каждый раз запрашивает 40 лет истории по каждому тикеру

- **Go:** `live/actualize.go:69-70` — `start := end - 40*365*24*60*60`, то есть при каждом запуске по каждому тикеру запрашивается полная сорокалетняя история, затем `MergeOHLC`.
- **Эффект:** объём ответов на порядки больше необходимого (нужен, по сути, последний бар), время выполнения и расход квоты провайдера растут пропорционально. В связке с отсутствием троттлинга (см. выше) это гарантированное упирание в лимиты.
- **Фикс:** инкрементальная догрузка за последние несколько дней, как это делал Node.

### [MEDIUM] IBS по живой котировке не ограничивается диапазоном [0, 1]

- **Node:** `services/autotrade.js:575` — `Math.max(0, Math.min(1, (currentPrice - low) / (high - low)))`.
- **Go:** `live/telegram.go:450` — `return (cur - low) / (high - low), true`, без ограничения.
- **Расхождение:** когда текущая цена выходит за пределы сообщённого провайдером дневного диапазона (обычная ситуация — котировка обновляется быстрее, чем high/low дня), Go выдаёт значения меньше нуля или больше единицы.
- **Эффект:** булев результат входа/выхода в большинстве случаев совпадает, но **выбор кандидата на вход различается**: вход берёт тикер с минимальным IBS, и без ограничения значение −0.2 выигрывает у −0.05, тогда как в Node оба сжаты до 0 и порядок определяется иначе. Плюс в Telegram и в UI показываются значения вида «−20 %» и «130 %».
- **Фикс:** добавить ограничение диапазоном, как в Node.
- **Отдельно проверено и расхождением НЕ является:** ветка `high <= low` в `telegram.go:447` (возврат 0.5) недостижима — `providers.NormalizeIntradayRange` (`providers/client.go:437-439`) в этом случае возвращает nil. Порт `NormalizeIntradayRange` в остальном дословный.

### [INFORMATIONAL] Проверено и расхождений не найдено

- **Пороги IBS.** `go/internal/ibs/ibs.go` — дословный порт `server/src/utils/ibsSignals.js`: строгие сравнения, те же дефолты 0.1/0.75, та же обработка нечисловых значений. Инлайновых сравнений порогов в `go/internal/live` не обнаружено.
- **Индикатор IBS.** `indicators/indicators.go:130-148` побайтово соответствует `src/lib/indicators.ts:169-205`, включая возврат 0.5 для некорректных баров и для нулевого диапазона.
- **Идемпотентность T-1.** `store/live_persist.go:210-222 ClaimAggregateT1` использует условный `UPDATE ... WHERE t1_sent = 0` и проверяет `RowsAffected` — атомарный захват, корректно защищающий от двойного исполнения, в том числе после рестарта (состояние в БД, а не в памяти).
- **Ожидание исполнения выхода перед входом.** `live/telegram.go:180-190` — вход выполняется только если нет незавершённого трекера выхода; это соответствует поведению Node.
- **Входящий Telegram-бот.** Ни Node, ни Go не опрашивают Telegram (`getUpdates`/webhook отсутствуют в обеих версиях) — команды инициируются только из UI. Расхождением не является.
- **Дедупликация EMA-алертов.** В Go есть `MarkEMATriggered` (`live/ema.go:212-218`), в Node — поля `last_triggered_*`. Механизм присутствует в обеих версиях.
- **Инвариант дат.** Тесты Go проходят одинаково в `TZ=Pacific/Auckland` (UTC+13) и `TZ=America/Los_Angeles` (UTC−8); `go test -race ./internal/live/... ./internal/scheduler/...` — без гонок.
