# Аудит автоторговли: Node `server/src/services/autotrade.js` (2189 стр.) vs Go `go/internal/live/*` (~1300 стр.)

Проверено вручную, построчно. Все находки подтверждены чтением обоих исходников.

---

## A1. [CRITICAL] Сделка записывается в БД по факту ОТПРАВКИ ордера, а не по факту исполнения

- **Node:** `autotrade.js:1078` `pollTrackedOrder` → `autotrade.js:974` `finalizeTracker` → `autotrade.js:852` `finalizeTrackedTrade`. Локальная запись сделки создаётся **только** внутри `if (status === 'filled')` (`autotrade.js:982`), с реальными `tracker.fillPrice` и `tracker.filledQty`, полученными от брокера.
- **Go:** `go/internal/live/autotrade.go:340-358`. Внутри `if res.Submitted { ... }` сразу делается `InsertTrade("broker_trades", ...)` и `InsertTrade("trades", ...)`. `res.Submitted` означает лишь «HTTP-запрос на постановку ордера прошёл», а не «ордер исполнен».
- **Сценарий отказа:** ордер отклонён брокером (недостаток средств, halt по тикеру, нерыночные часы, отказ риск-контроля) или отменён. У Webull это возвращается асинхронно, статусом `REJECTED`/`CANCELLED` при опросе. В Go запись `status: "open"` уже создана и **никогда не удаляется** — `pollOneTracker` (`track.go:139-176`) при финальном статусе не трогает таблицы сделок вообще.
- **Последствие:** появляется фантомная открытая позиция. Дальше `Evaluate()` (`autotrade.go:212`) видит `open != nil` → ветка входа больше никогда не отрабатывает, а ветка выхода пытается продать то, чего нет (`sizeOrder` вернёт «No broker position found»). **Автоторговля встаёт намертво после первого же отклонённого ордера и требует ручного вмешательства в БД.**
- **Фикс:** переносить запись сделки в `pollOneTracker` под `status == "filled"`, как в Node; при `cancelled/rejected/expired` — не создавать запись (и удалять, если создана).

## A2. [CRITICAL] Цена сделки записывается по котировке на момент решения, а не по цене исполнения

- **Node:** `autotrade.js:983` передаёт `price: tracker.fillPrice`, где `fillPrice` извлекается из ответа брокера (`autotrade.js:1108-1114`: `filled_price ?? avg_price ?? average_price ?? filled_avg_price ?? deal_price`). Количество — `tracker.filledQty` (`autotrade.js:1115-1122`).
- **Go:** `autotrade.go:353` и `:357` — `"entryPrice": quotePrice(ev, symbol)`, то есть цена из котировки на момент принятия решения (`sizing.go:262`). Цена и количество исполнения нигде не читаются: `pollOneTracker` (`track.go:139`) не извлекает ни `filled_price`, ни `filled_qty`.
- **Последствие:** для рыночного ордера на закрытии реальная цена почти всегда отличается от котировки за минуту до. Весь P&L, вся статистика монитора и все отчёты считаются от цены, по которой сделки не было. При частичном исполнении количество тоже неверно.
- **Фикс:** извлекать `filled_price`/`filled_qty` в `pollOneTracker` (набор ключей — как в Node) и писать сделку этими значениями.

## A3. [CRITICAL] Выход не пишет ни цену выхода, ни P&L

- **Node:** `trades.js:278`, `:417`, `:531` — при закрытии считается `calculateTradePnl(entryPrice, exitPrice)` и пишутся `exitPrice`, `pnlAbsolute`, `pnlPercent`, `holdingDays`, `exitIBS`, `exitDecisionTime`.
- **Go:** `autotrade.go:360-368` — `PatchTrade` только с `{"status": "closed", "exitDate": ev.TodayKey}`. Ни `exitPrice`, ни `pnl`, ни `pnlPercent`, ни длительности.
- **Последствие:** все сделки, закрытые автоторговлей, попадают в историю без финансового результата. Панель статистики монитора в SPA (`go/web/js/app.js:810` `monitorStats` фильтрует `Number.isFinite(Number(t.pnlPercent))`) их **полностью игнорирует** → win rate, суммарный P&L, средняя длительность считаются только по сделкам, закрытым вручную. Ручной путь `store/db.go:720 CloseMonitorTrade` P&L считает — то есть данные в одной таблице получаются разнородными.
- **Фикс:** использовать общий код закрытия (тот же, что в `CloseMonitorTrade`) и в брокерском пути.

## A4. [CRITICAL] Дробные акции: количество в ордере всегда округляется до целого

- **Node:** `autotrade.js:771` — `quantity: autoTrading.allowFractionalShares ? quantity.toFixed(5)... : String(quantity)`.
- **Go:** `webull_broker.go:75` — `"quantity": fmt.Sprintf("%.0f", qty)` **всегда**, без учёта `allowFractionalShares`.
- **При этом** расчёт количества дробные акции поддерживает: `sizing.go:216-220` при `allowFractionalShares` даёт `math.Floor(q*100000)/100000`, а `sizing.go:282` (выход) возвращает дробный остаток позиции.
- **Сценарий отказа:** включён `allowFractionalShares`, позиция 1.73 акции, сигнал на выход. `sizeOrder` → 1.73, payload → `"2"`. `%.0f` округляет к ближайшему, то есть **вверх**. Продаём 2 акции при наличии 1.73 → отказ брокера либо непреднамеренный шорт на 0.27. На входе — покупка большего объёма, чем позволяет расчёт по средствам.
- **Фикс:** форматировать количество по `allowFractionalShares`, как в Node.

## A5. [CRITICAL] Пороги IBS в автоторговле берутся глобальные, персональные пороги тикера игнорируются

- **Node:** `autotrade.js:542` `getThresholdsForSymbol(symbol, autoTrading)` — берёт `watch.lowIBS`/`watch.highIBS` конкретного тикера, и только при их отсутствии откатывается на глобальный конфиг. Используется и на выходе (`autotrade.js:1878`), и на входе (`autotrade.js:1900` через `item.thresholds.lowIBS`).
- **Go:** `autotrade.go:201-202` читает `low`/`high` один раз из глобального `cfg`, затем `autotrade.go:215` формирует синтетический watch `{"symbol": sym, "lowIBS": low, "highIBS": high}` — реальная запись watch не читается вовсе.
- **Ключевой момент:** монитор-путь при этом **честно** использует персональные пороги — `telegram.go:111` вызывает `e.evalWatch(sym, w, provider)` с настоящей записью watch из БД (`db.go:620` `ListWatches` возвращает `highIBS`/`lowIBS` по каждому тикеру).
- **Последствие:** монитор и автотрейдер расходятся в решении по одному и тому же тикеру. Телеграм пишет «вход по AAPL», автотрейдер не входит (или наоборот). Ровно тот класс рассинхрона, против которого в CLAUDE.md введён единый `ibsSignals`.
- **Фикс:** в `Evaluate()` читать watch-записи из `e.DB.ListWatches()` и передавать их в `evalWatch`, как это делает `Aggregate`.

## A6. [CRITICAL] Отсутствие ключа порога в конфиге приводит к немедленной ликвидации позиции

- **Go:** `autotrade.go:201-202` — `low, _ := cfg["lowIBS"].(float64)`. При отсутствии ключа type assertion даёт `0.0` без ошибки. Далее `autotrade.go:215` кладёт в watch **явный** `0.0`, поэтому фолбэк в `evalWatch` (`telegram.go:356-363`, срабатывает только при `w["lowIBS"] == nil`) не применяется. В `ibs.IsExitSignal(v, 0.0)` (`ibs/ibs.go:44`) `resolveThreshold` возвращает 0.0 как валидное число.
- **Результат:** `highIBS = 0` → условие выхода `ibs > 0` истинно для **любой** нормальной котировки → на ближайшем T-1 открытая позиция продаётся по рынку. Симметрично `lowIBS = 0` → `ibs < 0` ложно всегда → вход не происходит никогда.
- **Node так не ломается:** `settings.js:88-92` при каждом чтении настроек делает `{...defaults.autoTrading, ...stored.autoTrading}`, поэтому отсутствующий порог всегда подменяется дефолтом; плюс `isIbsExitSignal(ibs, undefined)` → `resolveThreshold(undefined, 0.75)`.
- **Как ключ может пропасть:** см. A7 — `json.Unmarshal` в Go **заменяет** вложенную карту целиком, а не сливает её с дефолтом.
- **Фикс:** различать «ключ отсутствует» и «ключ равен нулю»; при отсутствии подставлять `ibs.DefaultLowIBS`/`DefaultHighIBS`; отдельно — отвергать `highIBS == 0` как заведомо некорректный.

## A7. [CRITICAL] Настройки: вложенный `autoTrading` не сливается с дефолтами, а заменяется целиком

- **Node:** `settings.js:83-96` — `readSettings()` при каждом чтении собирает `{...defaults, ...stored, autoTrading: {...defaults.autoTrading, ...stored.autoTrading}}`. Частично сохранённый конфиг автоматически «долечивается» дефолтами.
- **Go:** `store/db.go:603-611` — `out := defaultSettings(); json.Unmarshal([]byte(data), &out)`. Для `map[string]any` `json.Unmarshal` перезаписывает значение ключа верхнего уровня **целиком**. Если в сохранённом JSON есть `"autoTrading": {"enabled": true}`, то весь дефолтный `autoTrading` (`db.go:589-598`, включая `lowIBS`, `highIBS`, `allowExits`) исчезает.
- **Как это достижимо:** `handlePatchSettings` (`server.go:338-347`) слепо мержит любой ключ верхнего уровня, включая `autoTrading`. **В Node этот путь явно закрыт:** `routes/settings.js:66-68` возвращает `400 autoTrading must be updated through /api/autotrade/config`. Аналогично `handlePutSettings` (`server.go:328-336`) сохраняет тело запроса как есть, тогда как Node (`routes/settings.js:30-34`) специально переносит `autoTrading` и `polygonApiKey` из текущих настроек.
- **Оговорка:** текущая SPA этот путь не задевает — форма настроек удаляет ключи автоторговли перед отправкой (`app.js:2843-2846`). То есть это не активный баг UI, а снятая защита: любой сторонний клиент, ручной `curl` или будущая правка формы молча уничтожит пороги, а Go-слой сливания это не восстановит (см. A6).
- **Фикс:** вернуть 400 на `autoTrading` в PATCH/PUT `/api/settings`; сделать в `Settings()` рекурсивный мерж вложенных карт с дефолтами.

## A8. [CRITICAL] `PATCH /api/autotrade/config` не валидирует и не ограничивает значения

- **Node:** `autotrade.js:493` `sanitizeAutoTradingConfig` — белый список булевых и числовых полей, зажим `lowIBS`/`highIBS` в `[0,1]`, `executionWindowSeconds >= 15`, `maxSlippageBps` в `[0,1000]`, enum-проверки `provider ∈ {finnhub, webull}`, `entrySizingMode ∈ {balance, quantity, notional}`, `orderType ∈ {MARKET, LIMIT}`, `timeInForce ∈ {DAY, GTC}`, `supportTradingSession ∈ {CORE, ALL, N}`, плюс `delete next.dryRun`.
- **Go:** `autotrade.go:28-49` `PatchAutoConfig` — `for k, v := range updates { cur[k] = v }`. Никакого белого списка, никаких зажимов, никаких enum-проверок, `dryRun` не удаляется.
- **Последствие:** `PATCH {"lowIBS": 5}` → условие входа `ibs < 5` истинно для **любого** тикера → на ближайшем T-1 покупается тикер с минимальным IBS независимо от сигнала. `PATCH {"highIBS": -1}` → выход никогда. `PATCH {"entrySizingMode": "мусор"}` → падает в ветку `balance` (`sizing.go:210`) вместо ошибки. Плюс в настройки попадает произвольный мусор, который потом сериализуется обратно клиенту.
- **Фикс:** портировать `sanitizeAutoTradingConfig` целиком.

## A9. [CRITICAL] Ни одной `recover()` во всём Go-коде — паника в фоновой горутине убивает торговый сервис

- **Проверено:** `rg "recover\(\)" go/internal` — ноль совпадений.
- **Где это критично:** `scheduler.go:132-146` — единственная горутина с тикером 20 с, из неё вызываются `PollTrackers()`, `RunTokenHealth`, `Aggregate` → `Execute` → HTTP к брокеру → разбор JSON с type assertion'ами. `track.go:118 trackerWheel` — отдельная горутина на каждый ордер. `net/http` восстанавливает панику только в горутине обработчика запроса; паника в **фоновой** горутине завершает весь процесс.
- **Сценарий:** брокер вернул поле неожиданного типа → `map[string]any` type assertion → nil map / index out of range → процесс умирает. Если это произошло после отправки ордера на вход, но до опроса статуса — позиция открыта, а сервис лежит, и `restart: unless-stopped` поднимет его уже без знания о том, чем закончился ордер (`ResumeTrackers` (`track.go:95`) поможет только если запись трекера успела сохраниться).
- **Фикс:** `defer recover()` с логированием в `RunTick`, в `trackerWheel` и в каждой запускаемой горутине; отдельно — recover-middleware на HTTP.

## A10. [HIGH] Зависший трекер навсегда блокирует торговлю по тикеру

- **Go:** `store/live_persist.go:140` `ListPendingTrackers` выбирает всё, у чего статус не в `('filled','cancelled','canceled','rejected','expired')`. Срока жизни и предельного числа попыток нет. `trackerWheel` (`track.go:118`) делает максимум 64 попытки (с потолком задержки 60 с, ~57 минут) и молча выходит, **не переводя трекер в финальный статус**.
- **Далее** `Execute` (`autotrade.go:285`) при наличии pending-трекера возвращает `pending_<action>_tracker_exists` и не торгует. Никогда.
- **Node:** `finalizeTracker` (`autotrade.js:974`) всегда вызывается и делает `pendingOrderTrackers.delete(trackerId)` (`autotrade.js:1073`), в том числе при нефинальном статусе через `statusOverride`.
- **Фикс:** таймаут трекера (например, финализировать как `expired` по истечении торгового дня) и очистка при старте.

## A11. [HIGH] Определение «ордер исполнен» по подстроке в сыром JSON

- **Go:** `webull_broker.go:92-95` — `raw := strings.ToUpper(string(detail.Raw)); if strings.Contains(raw, "FILLED") || strings.Contains(raw, "EXECUTED") { status = "filled" }`.
- **Проблема:** поиск идёт по всему телу ответа, **включая имена полей**. Ответ Webull на детали ордера содержит поля вида `filled_quantity`, `filled_price`, `avg_filled_price` — в верхнем регистре это `FILLED_QUANTITY`, что содержит `FILLED`. То есть условие истинно практически всегда, независимо от реального статуса. Дополнительно `PARTIAL_FILLED` тоже содержит `FILLED` и будет засчитан как полное исполнение.
- **Node:** `normalizeWebullOrderStatus` (`autotrade.js:806`) сравнивает **точное** значение поля статуса со списком, `PARTIAL_FILLED` отображается в отдельный `partially_filled`, который **не** финальный (`autotrade.js:819`).
- **Аналогично** `track.go:157`: при `status == "unknown"` вызывается `NormalizeOrderStatus(fmt.Sprint(detail["raw"]))` — на вход подаётся весь JSON, `switch` не совпадает ни с чем, срабатывает `default: strings.ToLower(s)` и статусом становится вся строка JSON.
- **Фикс:** брать статус только из поля; переиспользовать `NormalizeOrderStatus`, убрать подстрочный поиск.

## A12. [HIGH] Не разбирается вложенный ответ брокера при опросе статуса ордера

- **Node:** `extractOrderDetailPayload` (`autotrade.js:797`) спускается в `payload.data`, затем в `data.orders[0]` / `data.list[0]` / `data.items[0]`. Если статус всё равно `unknown` — есть **резервный путь** `findOrderSnapshotByClientOrderId` (`autotrade.js:1269`), который ищет ордер в списке ордеров по `client_order_id`.
- **Go:** `webull_broker.go:205-215` `OrderDetail` делает лишь `resp.Data.(map[string]any)` — во вложенность не спускается. Резервного поиска по списку ордеров нет вовсе.
- **Последствие:** если Webull отдаёт детали ордера завёрнутыми (а именно эту вложенность чинили коммиты `bd62be8`/`af12593` на фронте), Go не найдёт статус, трекер никогда не станет финальным → см. A10, торговля блокируется.
- **Фикс:** портировать `extractOrderDetailPayload` и резервный поиск по `client_order_id`.

## A13. [HIGH] Универсум тикеров: Go даёт объединение там, где Node даёт пересечение

- **Node:** `getConfiguredSymbols` (`autotrade.js:528`): если `!onlyFromTelegramWatches` и явный список непуст → **только** явный список. Иначе берутся watch-тикеры, и если явный список непуст — `watchSymbols.filter(s => explicitSymbols.includes(s))`, то есть **пересечение**.
- **Go:** `configuredSymbols` (`autotrade.go:547-577`): сначала безусловно добавляются явные символы, затем при `onlyWatches || len(out) == 0` **дописываются** все watch-тикеры — получается **объединение**.
- **Сценарий:** `onlyFromTelegramWatches = true`, `symbols = "AAPL"`, watches = MSFT, AMZN. Node вернёт пустой список (AAPL не в watches) и торговать не будет. Go вернёт `[AAPL, MSFT, AMZN]` и может купить любой из трёх.
- **Последствие:** торговля инструментами, которые в старой логике были исключены.
- **Фикс:** портировать логику Node дословно.

## A14. [HIGH] `allowExits` / `allowNewEntries` при отсутствии ключа: Node — выключено, Go — включено

- **Node:** `autotrade.js:1878` `if (openTrade && autoTrading.allowExits)` — `undefined` ложно, действие **не** выполняется. То же для `allowNewEntries` (`autotrade.js:1899`).
- **Go:** `autotrade.go:203-210` — при отсутствии ключа явно выставляется `true`.
- **Последствие:** на неполном конфиге (см. A7) Go торгует там, где Node молчал. Для торгового контура это неверное направление отказа: должно быть fail-closed.
- **Фикс:** дефолт `false` при отсутствии ключа, как в Node.

## A15. [HIGH] Выход закрывает первую попавшуюся открытую сделку монитора, возможно по другому тикеру

- **Go:** `autotrade.go:363-368` — `mon, _ := e.DB.ListTrades("trades"); if openM := store.OpenBrokerTrade(mon); openM != nil { PatchTrade("trades", openM["id"], ...) }`. `OpenBrokerTrade` (`live_persist.go:224`) возвращает **первую** запись со `status == "open"` **без сверки тикера**.
- **Node:** `closeMonitorTradeFromBrokerTrade` (`autotrade.js:878`) закрывает сделку, связанную с конкретной брокерской сделкой, а в резервной ветке (`autotrade.js:894-901`) явно проверяет `openMonitorTrade.symbol === toSafeTicker(symbol)`.
- **Последствие:** при наличии более одной открытой записи (что достижимо через A1) закрывается чужая сделка.
- **Фикс:** искать открытую сделку по тикеру и по связи с брокерской записью.

## A16. [HIGH] Конфигурационные поля ордера игнорируются: `timeInForce`, `supportTradingSession`

- **Go:** `webull_broker.go:79-80` — `"time_in_force": "DAY"`, `"support_trading_session": "CORE"` захардкожены.
- **Node:** `autotrade.js:772-773` — `autoTrading.timeInForce || 'DAY'`, `autoTrading.supportTradingSession || 'CORE'`.
- **Особая непоследовательность:** `supportTradingSession` в Go **используется** — но только для выбора источника покупательной способности (`sizing.go:129-137`: при `"N"` берётся `night_trading_buying_power`). То есть объём считается под ночную сессию, а ордер отправляется с `CORE`. Ордер либо не исполнится вне основной сессии, либо исполнится не тем объёмом.
- **Фикс:** брать оба поля из конфига.

## A17. [MEDIUM] Мёртвые настройки автоторговли: UI их показывает, Go не читает

Присутствуют в дефолтах (`store/db.go:589-598`) и в форме настроек, но **нигде** в Go-коде не читаются (проверено grep'ом по `go/internal`):
- `orderType` и `maxSlippageBps` — в Node строят лимитную цену (`autotrade.js:747` `buildOrderPrice`). Оговорка: в живом пути Node сам форсирует `orderType: 'MARKET'` (`autotrade.js:1210`, `:1539`), так что лимитные ордера и там не отправляются. Настройка вводит в заблуждение в обеих версиях, но в Go она мертва полностью.
- `previewBeforeSend` — Node пишет событие `order_preview_skipped` (`autotrade.js:1604`).
- `executionWindowSeconds` — не используется в Go нигде.
- **Фикс:** либо реализовать, либо убрать из UI, чтобы переключатели не создавали ложного ощущения контроля.

## A18. [MEDIUM] Гонка: один и тот же трекер опрашивается двумя путями одновременно

- **Go:** `scheduler.go:151` каждые 20 с вызывает `PollTrackers()`, который проходит по **всем** pending-трекерам и вызывает `pollOneTracker`. Параллельно на каждый ордер работает своя горутина `trackerWheel` (`track.go:118`), вызывающая `pollOneTracker` для того же трекера. Синхронизации между ними нет.
- **Последствие:** двойные обращения к API брокера, дублирующиеся уведомления в Telegram при исполнении (`track.go:173`), двойные записи в лог. После исправления A1/A3 та же гонка приведёт к двойной записи сделки.
- **Node:** защищено флагом `tracker.inFlight` (`autotrade.js:1081-1083`).
- **Фикс:** флаг «в работе» на трекер либо единственный путь опроса.

## A19. [MEDIUM] Потерян богатый журнал исполнения

- **Node:** структурированные события с общим контекстом (`buildExecutionLogContext`, `autotrade.js:954`): `order_guarded`, `execution_dry_run`, `execution_skipped`, `execution_blocked`, `balance_snapshot` (с разбивкой `day_buying_power`/`overnight_buying_power`/`cash_balance`/`net_liquidation_value`), `open_orders_cancelled`, `order_preview_skipped`, `order_submit_ok`, `order_submit_failed`, `order_poll`, `order_poll_failed`, `order_tracking_finished`, `local_trade_recorded`, `telegram_skipped`. Плюс `correlationId`, сшивающий все события одного решения, помесячная ротация файлов и отдельный сырой лог Webull (`getWebullRawLogPathForMonth`, `autotrade.js:271`).
- **Go:** `AppendAutotradeLog` принимает одну плоскую строку (`autotrade.go:280`, `:287`, `:311`, `:339` и т.д.). Ни `correlationId`, ни уровней, ни структурированных полей, ни снимка баланса, ни сырого лога брокера.
- **Последствие:** после спорного исполнения восстановить, почему был выбран объём и что ответил брокер, невозможно. Для торгового контура это блокирует разбор инцидентов.
- **Фикс:** структурированный лог с correlation id, как минимум для `balance_snapshot` и ответов брокера.

## A20. [MEDIUM] `Logs()` отдаёт один и тот же массив в четыре разных поля

- **Go:** `autotrade.go:493-500` — `"logs"`, `"autotrade"`, `"monitor"`, `"brokerRaw"` заполняются **одним и тем же** списком.
- **Node:** `readAutotradeLogTail` и `readWebullRawLogTail` (`autotrade.js:390`, `:408`) — это два разных источника.
- **Последствие:** вкладки логов в UI показывают одно и то же; сырых ответов брокера нет вовсе.

## A21. [LOW] Округление P&L при убытке смещено к нулю

- **Go:** `store/db.go:756-757` — `float64(int(diff*1e6+0.5))/1e6`. `int()` в Go усекает к нулю, поэтому «+0.5» даёт корректное округление только для положительных значений. Для `diff = -1.5` получается `-1.499999` вместо `-1.5`.
- **Node:** `trades.js:215` — `Number(((diff / entryPrice) * 100).toFixed(6))`, симметричное округление.
- **Эффект:** расхождение в шестом знаке на убыточных сделках. Семантика P&L (на акцию, а не на позицию) совпадает — здесь расхождения нет.
- **Фикс:** `math.Round(x*1e6)/1e6`.
