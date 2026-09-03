# Аудит: /settings, /broker, оболочка (React vs Go SPA)

SEV = CRITICAL / HIGH / MEDIUM / LOW. Каждая находка подтверждена чтением обоих файлов (React-компонент + конкретные строки в go/web/js/app.js, go/web/js/api.js или go/internal/httpapi/server.go / go/internal/store/db.go) — ничего не выведено по догадке.

**Итог: 32 находки.** CRITICAL: 3 · HIGH: 9 · MEDIUM: 14 · LOW: 6.

---

## Settings — дефолтные значения (сервер/стор)

### [CRITICAL] watchThresholdPct: дефолт 5% в React vs 0.3% в Go
- **React:** src/stores/index.ts:105 (`watchThresholdPct: 5`); текст в AppSettings.tsx ~543 «Диапазон 0–20%. По умолчанию 5%.»
- **Go:** go/internal/store/db.go:583 (`"watchThresholdPct": 0.3`); текст в go/web/js/app.js:1919-1921 «По умолчанию 0.3%.»
- **Эффект:** На чистой инсталляции (нет сохранённых settings) сервер отдаёт порог уведомления о близости к IBS-цели в 16 раз меньше, чем ожидает пользователь по опыту с React-версией. Уведомления в Telegram/мониторинге будут срабатывать по совершенно другому порогу close-to-signal.
- **Фикс:** привести `defaultSettings()` в db.go к 5 (или явно задокументировать смену дефолта и обновить оба текста синхронно).

### [HIGH] resultsQuoteProvider: дефолт finnhub в React vs alpha_vantage в Go
- **React:** src/stores/index.ts:101 (`resultsQuoteProvider: 'finnhub'`)
- **Go:** go/internal/store/db.go:584 (`"resultsQuoteProvider": "alpha_vantage"`)
- **Эффект:** Alpha Vantage free-тариф — 5 req/мин, 25/день (это же указано в самом React UI как «слишком мало для активного мониторинга»). Новые инсталляции Go-версии по умолчанию получат котировки на странице «Акции»/мониторинга через самый слабый провайдер вместо Finnhub (60 req/мин).
- **Фикс:** поменять дефолт в `defaultSettings()` на `finnhub`.

### [HIGH] indicatorPanePercent: 10 в React vs 30 в Go (при этом оба UI-текста говорят «7%»)
- **React:** src/stores/index.ts:106 (`indicatorPanePercent: 10`), но комментарий/текст в AppSettings.tsx говорит «По умолчанию 7%» — это несостыковка уже в самом React (не в зоне фикса Go, но полезно знать).
- **Go:** go/internal/store/db.go:586 (`"indicatorPanePercent": 30`), текст в app.js аналогично утверждает 7% дефолт.
- **Эффект:** На чистой инсталляции высота панели индикаторов (IBS/Объём) на графике в Go-версии будет в 3 раза больше настоящего React-дефолта (30% против 10%) — визуально график будет выглядеть иначе, чем ожидает пользователь, мигрировавший с React-версии.
- **Фикс:** привести дефолт в db.go к 10 (или к желаемому единому числу, синхронизировав оба текста подсказки).

### [HIGH] defaultMultiTickerSymbols: 'AAPL,MSFT,AMZN,MAGS' в React vs 'SPY,QQQ,IWM' в Go
- **React:** src/stores/index.ts:107.
- **Go:** go/internal/store/db.go:587 (`"defaultMultiTickerSymbols": "SPY,QQQ,IWM"`).
- **Эффект:** Сам CLAUDE.md проекта в разделе «Recent Focus Areas» фиксирует «Default configuration tuning (tickers: AAPL, MSFT, AMZN, MAGS)» как целевое поведение — Go-дефолт `SPY,QQQ,IWM` прямо противоречит документированному решению команды.
- **Фикс:** поменять дефолт в db.go на `AAPL,MSFT,AMZN,MAGS`.

### [MEDIUM] enhancerProvider: 'alpha_vantage' в React vs 'finnhub' в Go
- **React:** src/stores/index.ts:103.
- **Go:** go/internal/store/db.go:585 (`"enhancerProvider": "finnhub"`).
- **Эффект:** Дефолтный провайдер для загрузки полной истории OHLC нового датасета отличается. Сам React-UI перечисляет Finnhub как «❌ /stock/candle — только платный план» для этой задачи — то есть Go-дефолт указывает на провайдер, который в документированной таблице лимитов помечен как непригодный для этой операции на free-тарифе.
- **Фикс:** поменять дефолт на `alpha_vantage` либо (лучше) на `twelve_data`, который в собственной справке приложения назван оптимальным для полной истории; в любом случае — не `finnhub`.

### [MEDIUM] commissionType/commissionFixed/commissionPercentage отсутствуют в дефолтах Go-сервера
- **React:** src/stores/index.ts:108-110 (`commissionType: 'percentage', commissionFixed: 1.0, commissionPercentage: 0.1`).
- **Go:** go/internal/store/db.go, `defaultSettings()` — поля commissionType/commissionFixed/commissionPercentage вообще не перечислены в map (проверено чтением всей функции, строки 581-597).
- **Эффект:** Только фронтенд (go/web/js/app.js:1937-1938, `st.commissionFixed ?? 1`, `st.commissionPercentage ?? 0.1`) подставляет дефолты для отображения формы. Если где-то на бэкенде (например, в calc-эндпоинтах бэктеста) значения комиссии читаются из settings без такого же fallback, комиссия молча станет 0/undefined вместо 1$/0.1%. Нужна отдельная проверка серверных calc-хендлеров на использование `settings.commissionType` напрямую.
- **Фикс:** добавить все три поля с теми же дефолтами в `defaultSettings()`.

---

## Settings — UI/UX отличия внутри вкладок

### [MEDIUM] Нет ползунка (range slider) для порога IBS
- **React:** src/components/AppSettings.tsx (GeneralTab) — `<input type="range">` синхронизирован с number input.
- **Go:** go/web/js/app.js:1919 — только `<input type="number">`.
- **Эффект:** Небольшая, но заметная UX-регрессия — в React выбор процента делается и мышью через слайдер, в Go только вводом числа.
- **Фикс:** добавить `<input type="range">` рядом с number input, как в React.

### [MEDIUM] Пропала модалка «Подробнее» с таблицей лимитов провайдеров
- **React:** src/components/AppSettings.tsx, ApiTab — кнопка «Подробнее» (Info icon) открывает Modal с полной сравнительной таблицей провайдеров (историч. данные / real-time / лимиты) и рекомендациями.
- **Go:** grep по `go/web/js/app.js` не находит ни кнопки «Подробнее», ни аналога этой таблицы — в ApiTab-эквиваленте (`pageSettings`, tab==='api', строки 1936-1943) есть только кнопки теста и 3 радио-группы провайдеров, без справочной информации.
- **Эффект:** Пользователь теряет единственное место в приложении, объясняющее лимиты и особенности каждого провайдера (Polygon/Twelve Data/Finnhub/Alpha Vantage/Webull) — усложняет выбор провайдера, особенно для новых пользователей.
- **Фикс:** перенести содержимое модалки (таблица + разделы по use-case) в Go-версию, хотя бы как collapsible-блок без полноценной модалки.

### [LOW] Нет описания для тоггла «Автоактуализация цен после закрытия рынка»
- **React:** AppSettings.tsx — под тогглом текст «Серверный запуск через 16-30 минут после закрытия (T+16 мин). По умолчанию выключено.»
- **Go:** go/web/js/app.js:1941 — голый `<label><input type=checkbox> Автоактуализация цен после закрытия рынка</label>` без пояснения.
- **Эффект:** Пользователь не понимает, когда и как срабатывает функция.
- **Фикс:** добавить `<p class="text-xs text-gray-500">` с тем же текстом.

### [LOW] Пропал информационный блок про типы комиссий
- **React:** AppSettings.tsx — блок 💡 с объяснением «Фиксированная / Процентная / Комбинированная».
- **Go:** отсутствует в pageSettings general-табе (строки 1930-1941).
- **Эффект:** Минимальная — то же самое можно понять из подписей радио-кнопок, но теряется явное объяснение «Комбинированная = фикс + процент».
- **Фикс:** добавить короткий текстовый блок.

### [LOW] Комиссионные поля не блокируются/не тускнеют при несовпадающем типе
- **React:** AppSettings.tsx — поле `commissionFixed` получает `disabled` и `opacity-50`, когда `commissionType==='percentage'`, и наоборот.
- **Go:** go/web/js/app.js:1937-1938 — оба input всегда активны и видимы одинаково, независимо от выбранного `commissionType`.
- **Эффект:** Пользователь может ввести значение в поле, которое сервер игнорирует, не понимая почему.
- **Фикс:** добавить JS-тоггл disabled/opacity по выбранному радио, как в React (обработчик на change комиссии).

### [LOW] «Обновлено: …» в автоторговле (Settings) не отображается в Go
- **React:** AppSettings.tsx (AutotradeTab) — под тогглом статуса показывается `Обновлено: {formatted lastModifiedAt} ET`, если `autotradeConfig.lastModifiedAt` есть.
- **Go:** go/web/js/app.js — grep по `lastModifiedAt` не находит ни одного использования в UI (только хранится в дефолтах db.go). Поле нигде не отображается ни на /settings, ни на /broker.
- **Эффект:** Пользователь не видит, когда в последний раз менялась конфигурация автоторговли.
- **Фикс:** отрисовать `ac.lastModifiedAt` рядом со статусом автоторговли, аналогично React.

---

## Broker — форматирование времени (широкая проблема)

### [HIGH] Нет ET-форматирования дат/времени нигде в Go — везде сырые ISO-строки
- **React:** src/lib/formatters.ts — `formatDateTimeET()` конвертирует ISO-таймстемп в `dd.mm.yyyy, hh:mm(:ss)` по зоне `America/New_York` (используется для баланса `fetchedAt`, ордеров `filledAt`/`createdAt`, логов и т.д. — WebullAccountPage.tsx:1055, 1225 и другие).
- **Go:** grep по всему `go/web/js/app.js` не находит НИ ОДНОЙ функции-аналога (`formatDateTime`, `fmtDateTime`, `fmtET` и т.п. отсутствуют). Конкретные места, где сырой ISO/строка идёт напрямую в `esc(...)` без форматирования:
  - go/web/js/app.js:1737 — `bal.fetchedAt` в карточке «Нереализованный PnL»
  - go/web/js/app.js:1771 — `o.filledAt || o.createdAt` в таблице ордеров
  - go/web/js/app.js:1884 — `state.dashboard.fetchedAt` в блоке автоторговли
  - go/web/js/app.js:1890 — `${l.ts || ''}` в логах (см. следующий пункт)
- **Эффект:** Вместо «03.09.2026, 14:32:10» пользователь увидит сырой `2026-09-03T14:32:10.123Z` (или что бы ни вернул Webull API) практически во всех местах брокерской страницы, где показывается время. Это не про торговую дату (TradingDate) — это как раз тот самый «единственное исключение: настоящее wall-clock время» из CLAUDE.md, где явная зона `America/New_York` обязательна, а её нет вовсе.
- **Фикс:** добавить в app.js аналог `formatDateTimeET` (с явным `timeZone: 'America/New_York'`) и применить во всех перечисленных местах.

### [MEDIUM] Логи автоторговли/брокера рендерятся как JSON-заглушка вместо человекочитаемого формата
- **React:** src/components/WebullAccountPage.tsx `formatLogLine()` (строки ~97-121) — парсит каждую JSON-строку лога и собирает читаемую строку `ts LEVEL event • symbol • action • status • id=... • ⚠error • message`, либо для сырых broker-логов `ts LEVEL METHOD PATH → status ⚠error`.
- **Go:** go/web/js/app.js:1890 — `lines = (rows) => (rows||[]).map(l => typeof l === 'string' ? l : \`${l.ts || ''} ${l.message || l.level || JSON.stringify(l)}\`).join('\n')`. Нет ни парсинга полей event/symbol/action/client_order_id/method/path/responseStatus, ни ET-форматирования времени, ни аккуратного паддинга уровня.
- **Эффект:** Вкладка «Логи» на /broker в Go читается заметно хуже — для структурированных логов (autotrade JSON-строки) пользователь увидит либо голое `message`, либо целиком `JSON.stringify(l)`, а не свёрнутую однострочную сводку как в React.
- **Фикс:** портировать `formatLogLine` в app.js и использовать вместо текущего наивного `lines()`.

---

## Broker — вкладка «Автоторговля»

### [HIGH] Раздел readonly-конфига автоторговли урезан до ~4 строк вместо ~20 отдельных полей
- **React:** src/components/WebullAccountPage.tsx:850-950 (`autotradeReadonlySections`, компонент `ReadonlyConfigSection`) — два блока карточек «Execution» и «Signal», в сумме порядка 15 отдельных read-only полей с подписями и хинтами: Режим входа, База профиля, Профиль капитала, Дробные акции, Fixed quantity, Fixed notional, Max position, Order type / TIF (+session), Резерв buying power, Preview/cancel open orders before entry, Провайдер, IBS threshold (entry/exit), Execution window, Entries/exits, Источник тикеров, Symbols.
- **Go:** go/web/js/app.js:1822-1826 — тот же раздел сведён к 4 строкам текста: «Профиль капитала: X — hint», «Sizing: X · IBS Y%/Z%», «Провайдер: X · тикеры: Y», «Account: X · token expires: Y». Отсутствуют: allowFractionalShares, fixedQuantity, fixedNotionalUsd, maxPositionUsd, orderType/timeInForce/supportTradingSession, reservePct-детали, previewBeforeSend/cancelOpenOrdersBeforeEntry, executionWindowSeconds отдельно, symbols raw-значение.
- **Эффект:** На странице, специально описанной в самом приложении как место, где «видно, какой профиль реально активен и какие поля приехали с сервера» (см. AppSettings.tsx: «Переключатель здесь синхронизирован... /broker → Автоторговля видно, какой профиль реально активен»), пользователь Go-версии не может проверить большинство параметров реального боевого конфига автоторговли (order type, TIF, лимит позиции, preview-flag, cancel-open-orders-flag и т.д.) без похода в сырые API-ответы.
- **Фикс:** портировать полный набор `ReadonlyConfigSection`-полей в блок автоторговли Go-страницы /broker.

### [MEDIUM] Статус Webull-токена: часть полей вообще не отображается (source, отдельный daysLeft, lastCheckAt)
- **React:** WebullAccountPage.tsx:1266-1270 — показывает: `hasToken`, `expiresAt` (formatDateTime), `daysLeft` (отдельно, "осталось: N дн."), `lastCheckStatus`, и отдельной строкой `lastCheckAt` (если есть) — итого 5 полей статуса токена.
- **Go:** go/web/js/app.js:1804 (`token ${..} • проверка: ${tok.lastCheckStatus}`) + :1831 (`token expires: ${tok.expiresAt || tok.daysLeft || '—'}`) — `daysLeft` показывается только как fallback ЕСЛИ `expiresAt` отсутствует (то есть оба значения никогда не видны одновременно), `source` (db/env/none) и `lastCheckAt` нигде не выводятся вовсе (grep по всему app.js подтверждает отсутствие).
- **Эффект:** Пользователь не может увидеть, откуда токен взят (БД vs .env) и когда он последний раз проверялся — важная информация при диагностике проблем с автоторговлей.
- **Фикс:** вывести все 5 полей раздельно, как в React.

### [MEDIUM] Кнопка «Включить/Выключить автоторговлю» прямо на /broker — фичи нет в React
- **React:** на странице /broker нет прямого переключателя `enabled` — только read-only отображение статуса (переключение живёт исключительно на /settings → вкладка «Автоторговля», см. AppSettings.tsx AutotradeTab).
- **Go:** go/web/js/app.js:1835 + обработчик на строке 2767-2774 — кнопка `#auto-enable` прямо на /broker вызывает `API.saveAutoConfig({ enabled: on })`, то есть Go добавляет отдельную, независимую точку входа для включения живой автоторговли, которой не было в оригинале.
- **Эффект:** Функционально это расширение, а не потеря, но раз аудит именно на соответствие поведения — стоит зафиксировать: теперь live-автоторговлю можно включить с двух разных страниц, и на /broker для этого нет какого-либо доп. подтверждения/предупреждения (обычный `btn-primary`, без `window.confirm`), в отличие от, например, `auto-test-buy` и `data-close-pos`, которые запрашивают подтверждение через `window.confirm(...)`.
- **Фикс:** решить с командой, было ли это осознанным решением; если нет — либо убрать кнопку с /broker, либо явно добавить `window.confirm` перед включением, аналогично другим необратимым действиям на этой странице.

## Broker — отсутствуют панели «Raw JSON» (диагностика брокерских payload)

### [HIGH] На /broker полностью отсутствуют раскрывающиеся блоки с сырыми API-ответами
- **React:** src/components/WebullAccountPage.tsx — компонент `RawJson` (строки 337-345, `<details><summary>title</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>`) используется 10 раз по всем вкладкам: «Raw balance payload», «Raw account payload» (Overview, :1058-1059), «Raw positions payload», «Raw accounts payload» (Positions, :1133-1134), «Raw open orders payload» (:1190), «Raw order history payload» (:1246), «Raw connection payload», «Raw autotrade config payload», «Raw tracked orders payload» (Autotrade, :1360-1362), «Raw dashboard payload» (:1364), «Raw monitoring payload» (Monitoring, :1488).
- **Go:** grep по `go/web/js/app.js` на `RawJson|raw.*payload|<details` не находит ни одного совпадения (кроме несвязанного `<pre>` в другом месте, строка 1570, — это для другой страницы, не /broker). На /broker нет ни одного способа посмотреть сырой JSON-ответ Webull API из UI.
- **Эффект:** Учитывая, что вся эта функциональность строилась вокруг постоянных проблем с маппингом вложенных Webull-полей (см. последние 5 коммитов в git-логе: «Fix the same nested-payload gaps site-wide», «Run shipped app.js mappers on a nested Webull fixture» и т.д.), именно эти raw-панели в React были основным инструментом диагностики на проде — куда смотреть, когда `extractBalanceSummary`/`normalizePositions`/`normalizeOrders` не находят нужное поле в очередном варианте ответа Webull. Без них в Go-версии диагностировать новый вариант payload из UI невозможно — только через сетевые dev-tools.
- **Фикс:** добавить `<details><summary>...</summary><pre>${esc(JSON.stringify(x, null, 2))}</pre></details>` блоки на каждой вкладке /broker аналогично React.

## Broker — закрытие позиции и тестовый ордер: обратная связь урезана до тоста

### [MEDIUM] Нет живого отслеживания статуса ордера на закрытие позиции (submitted → filled/rejected/…)
- **React:** WebullAccountPage.tsx:982-1040 (`handleClosePosition` + `renderManualCloseState` + `manualCloseStates` state + отдельный `useEffect` на строках 806-838, синхронизирующий состояние по данным `logs`/`pendingOrders`) — после клика «Закрыть» под кнопкой сразу появляется инлайн-статус «Заявка отправлена • MARKET ордер отправлен, ждём финальный статус» (жёлтый), который затем сам обновляется до `filled` (зелёный) / `rejected`/`error` (красный) по мере поступления новых логов, без перезагрузки страницы.
- **Go:** go/web/js/app.js — обработчик `data-close-pos` (строки 2803-2806) делает `await API.closePosition(...)`, показывает один `toast(...)` («Ордер на закрытие отправлен» или текст ошибки) на 2.5 секунды и вызывает `reloadBroker()`. Никакого сохраняющегося инлайн-статуса под кнопкой и никакого отслеживания перехода submitted→filled нет.
- **Эффект:** Пользователь, кликнувший «Закрыть» и отвернувшийся на несколько секунд, пропускает toast и не может посмотреть на странице, дошёл ли ордер до исполнения — надо переходить во вкладку «Логи»/RawJson (которых тоже нет, см. выше) или ждать полной перезагрузки dashboard.
- **Фикс:** как минимум сохранять последний статус закрытия по символу в `state` и рендерить его под кнопкой «Закрыть», обновляя при каждом `reloadBroker()`.

### [MEDIUM] Ошибка тестового BUY-ордера показывает только `message`, без тела ответа API
- **React:** WebullAccountPage.tsx:950-959 (`handleTestBuyAapl`) — при ошибке, если у `Error` есть `body`, в `setError(...)` попадает `${err.message} | ${JSON.stringify(body, null, 2)}` — то есть пользователь видит сырой ответ брокера/сервера (например, конкретную причину отказа Webull), а не только обобщённое сообщение.
- **Go:** go/web/js/app.js:2775-2780 (`auto-test-buy` handler) — `catch (err) { toast(err.message); }`. Объект `err.data`, который `API.req` (go/web/js/api.js:11-16) явно сохраняет на ошибке, никогда не читается и не показывается — теряется именно та часть, которая в React считается самой полезной для диагностики.
- **Эффект:** При отказе тестового ордера (например, «Insufficient Buying Power» с деталями от Webull) пользователь Go-версии видит только короткий toast, без деталей, которые нужны для диагностики причины отказа реального ордера.
- **Фикс:** в обработчике `auto-test-buy` (и аналогично `data-close-pos`) добавлять `err.data` к отображаемому сообщению, как это делает React.

## Broker — вкладка «Мониторинг»

### [MEDIUM] Колонка «Open» (today's open) отсутствует в таблице мониторинга Go
- **React:** WebullAccountPage.tsx:1425-1454 — таблица «Отслеживаемые тикеры» имеет 14 колонок: Тикер, **Open**, High, Low, Цена, Current IBS, Prev Close, Δ, Entry, Threshold %, Позиция, Обновлено, Источник, Действие.
- **Go:** go/web/js/app.js tab `monitor` (строки ~1841-1874) — таблица имеет 12 колонок: Тикер, High, Low, Цена, Current IBS, Prev Close, Δ, Entry, Threshold, Позиция, Обновлено, Источник. Колонки «Open» (`todayOpen`) и «Действие» нет вовсе.
- **Эффект:** Пользователь не видит цену открытия дня для отслеживаемых тикеров прямо в таблице мониторинга.
- **Фикс:** добавить колонку Open, используя то же поле, что приходит от quote-провайдера (`todayOpen`/аналог в raw quote).

### [MEDIUM] Нет кнопки обновления цены для отдельного тикера — только массовое обновление
- **React:** WebullAccountPage.tsx:1462-1471 — у каждой строки таблицы мониторинга есть `IconButton` «Обновить {symbol}» с индивидуальным спиннером (`monitoringRefreshingSymbols[row.symbol]`), обновляющий котировку только этого тикера.
- **Go:** go/web/js/app.js — в tab `monitor` есть только общая кнопка `#broker-quotes-refresh` («Обновить котировки»), обновляющая все тикеры разом; построчной кнопки обновления нет.
- **Эффект:** Нельзя точечно обновить один зависший/ошибочный тикер без пересчёта всех остальных (лишняя нагрузка на rate-limited API при большом списке watch-листа).
- **Фикс:** добавить по кнопке обновления в каждую строку с вызовом того же одиночного quote-запроса, что видно из `refreshMonitoringSymbol` в React.

### [LOW] Ошибки consistency-проверки схлопнуты в одну строку вместо отдельных карточек-баннеров
- **React:** WebullAccountPage.tsx:1411-1417 — каждая `monitorConsistency.issues[]` рендерится отдельным жёлтым баннером.
- **Go:** go/web/js/app.js — `issues.map(i => i.message || i.code).join(' ')` склеивает все сообщения в один абзац через пробел.
- **Эффект:** При нескольких проблемах consistency их сложнее визуально разделить (нет разрывов строк/границ карточек).
- **Фикс:** рендерить issues списком (`<div>` на каждый), не через join(' ').

---

## Broker — журнал сделок: колонки Client/Broker Order ID отсутствуют

### [MEDIUM] В таблице «Журнал сделок» нет колонок Client Order ID и Broker Order ID
- **React:** WebullAccountPage.tsx:1528-1548 — таблица журнала имеет 17 колонок, включая «Client Order ID» и «Broker Order ID» (обрезаются `truncate` с полным значением в `title=`).
- **Go:** go/web/js/app.js:1706-1712 (`journal` tab) — 15 колонок: Тикер, Источник, Статус, Дата входа, Дата выхода, Цена входа, Цена выхода, Кол-во, PnL $, PnL %, IBS вход, IBS выход, Дней, Заметки, Действие. Полей `clientOrderId`/`brokerOrderId` в разметке журнала нет вовсе.
- **Эффект:** Нельзя сопоставить запись в журнале сделок с конкретным ордером на вкладках «Ордера»/«Исполненные» (где Client/Order ID показываются) без обращения к сырым данным.
- **Фикс:** добавить обе колонки в таблицу журнала, как в React.

---

## Broker — журнал сделок (ручное добавление/редактирование)

### [CRITICAL] Нет редактирования broker-сделки (EditBrokerTradeModal) — нельзя закрыть открытую сделку, задать exit IBS, отметить isTest или изменить заметки
- **React:** src/components/EditBrokerTradeModal.tsx (весь файл, 211 строк) — модалка с полями «Дата выхода», «Цена выхода», «Exit IBS, %», чекбоксы «Скрыть из списка» и «Тестовая сделка», «Заметки»; открывается по кнопке «Изменить» в таблице сделок (WebullAccountPage.tsx:1600 — `onClick={() => void handleDeleteTrade(...)}` рядом есть отдельная edit-кнопка, использующая `EditBrokerTradeModal`, вызывается `DatasetAPI.patchBrokerTrade` — валидация: дата выхода не раньше даты входа (сравнение строк, соответствует правилам проекта), exit IBS обязателен в диапазоне 0-100%.
- **Go:** go/web/js/app.js, вкладка `journal` (строки 1697-1720) — в таблице для каждой строки есть только `data-hide-bt` (Скрыть/Показать, вызывает `PATCH .../isHidden`) и `data-bd` (Удалить). Кнопки «Изменить»/edit нет вообще; `data-edit-bt`, `EditBrokerTradeModal`-аналог, поле `isTest`-переключатель, поле «Exit IBS» — ничего этого не найдено ни в разметке, ни в обработчиках (grep по всему файлу).
- **Эффект:** В Go-версии невозможно через UI закрыть открытую вручную broker-сделку (указать дату/цену выхода), нельзя проставить exit IBS, нельзя отметить сделку как тестовую (`isTest`) и нельзя отредактировать заметки уже существующей записи — единственные доступные действия это Скрыть/Показать и полное удаление. Это существенная потеря функциональности журнала сделок брокера.
- **Фикс:** добавить кнопку «Изменить» на каждую строку `journal`-таблицы, открывающую форму/модалку с теми же полями (exitDate, exitPrice, exitIBS, notes, isHidden, isTest) и вызывающую `API.patchBrokerTrade(id, payload)` с той же валидацией (дата выхода ≥ даты входа, exit IBS 0-100%, обязательность даты+цены выхода при заполнении любого exit-поля).

### [MEDIUM] Форма ручного добавления broker-сделки не валидирует ничего — ни на клиенте, ни на сервере
- **React:** src/components/ManualBrokerTradeModal.tsx:49-79 (`handleSubmit`) — тикер обязателен (после trim/uppercase), дата выхода не может быть раньше даты входа (сравнение строк), entryPrice/exitPrice/quantity — если заполнены, обязаны быть конечными положительными числами; при нарушении — `setLocalError(...)` и отправка блокируется.
- **Go, клиент:** go/web/js/app.js:2709-2725 (`#broker-form` submit) — читает поля через `FormData`, приводит `entryPrice`/`exitPrice`/`quantity` через голый `Number(...)` и сразу шлёт `API.post('/api/broker-trades', rec)`. Нет проверки, что `symbol` не пуст, нет проверки `entryDate >= exitDate`, нет проверки, что цены/количество положительны — пустая форма отправится с `symbol: ''`, `entryPrice: 0`.
- **Go, сервер:** go/internal/httpapi/server.go:888-893 (`handlePostBroker`) — тело запроса без единой проверки полей уходит прямо в `s.DB.InsertTrade("broker_trades", body)`.
- **Эффект:** случайный клик «Добавить» на пустой/частично заполненной форме молча создаёт мусорную запись в журнале сделок брокера (пустой тикер, нулевая цена) без единого сообщения об ошибке — ни на клиенте, ни от сервера.
- **Фикс:** повторить проверки React на клиенте (обязательный symbol, exitDate ≥ entryDate, положительные числа) перед `API.post`, и/или добавить базовую валидацию в `handlePostBroker`.

### [OK] Ручное добавление сделки (ManualBrokerTradeModal) — поля совпадают
- **React:** src/components/ManualBrokerTradeModal.tsx — Тикер, Количество (опционально), Дата входа, Дата выхода, Цена входа, Цена выхода, Заметки.
- **Go:** go/web/js/app.js:1719-1727 (`#broker-form`) — те же поля inline-формой вместо модалки (symbol, entryDate, exitDate, entryPrice, exitPrice, quantity, notes). Функционально эквивалентно, отличается только модалка-vs-инлайн-форма (не баг).

---

## Оболочка — журнал ошибок (полностью отсутствует)

### [HIGH] Вся система клиентского логирования ошибок отсутствует в Go: нет ErrorBoundary, ErrorConsole, кнопки в футере, глобальных перехватчиков window.onerror/unhandledrejection
- **React:** несколько связанных частей:
  - src/lib/error-logger.ts:140-149 — глобальные `window.addEventListener('error', ...)` и `window.addEventListener('unhandledrejection', ...)`, которые автоматически ловят любые неотловленные ошибки и Promise-реджекты в приложении и складывают их в лог (в памяти, `log()/logError()/logWarn()/logInfo()`).
  - src/components/ErrorBoundary.tsx — React error boundary, оборачивает дерево компонентов, ловит ошибки рендера и пишет их через `logError(...)`.
  - src/components/ErrorConsole.tsx — полноэкранная консоль с фильтром по категориям, поиском по тексту, очисткой лога.
  - src/components/ErrorLogButton.tsx — кнопка «Показать ошибки» в футере (см. Footer.tsx:54) с бейджем-счётчиком (`errorCount`, до «99+»), красная подсветка при наличии ошибок.
  - src/hooks/useErrorEvents.ts — подписка на события лога для живого обновления счётчика.
  - Хранение полностью клиентское (не отправляется на сервер) — в Go серверный аналог не нужен, только фронтенд-часть.
- **Go:** проверено по всему `go/web/js/app.js` и `go/web/index.html` — нет ни одного совпадения на `window.onerror`, `unhandledrejection`, «журнал ошибок», «Показать ошибки», `errorCount`, `ErrorConsole`/`ErrorBoundary`-подобной логики. В футере (`footerHTML`, go/web/js/app.js:1028-1051) нет кнопки логов ошибок вообще.
- **Эффект:** Любая неотловленная JS-ошибка (TypeError в рендер-функции, отклонённый Promise в обработчике клика и т.п.) в Go-версии просто падает в консоль браузера и ничего не показывает пользователю/QA — раньше у пользователя был явный визуальный индикатор («Показать ошибки», красный бейдж) и возможность посмотреть/отфильтровать/скопировать стек прямо в интерфейсе, без открытия devtools. Это особенно важно на такой сложной странице, как /broker, где мэппинг вложенных Webull-полей и так исторически был источником багов (см. соответствующий раздел про Raw JSON выше).
- **Фикс:** как минимум добавить глобальные `window.addEventListener('error', ...)`/`unhandledrejection` с логированием в `console.error` + toast; в идеале — портировать компактный аналог ErrorConsole (даже без всех React-примочек) с кнопкой в футере.

---

## Settings — кнопка «Тест Polygon» никогда не работает (серверный баг)

### [CRITICAL] handleTestProvider на сервере не обрабатывает provider="polygon" — всегда возвращает «Unknown provider»
- **React/Go UI (одинаково):** и в AppSettings.tsx (ApiTab, кнопка `testProvider('polygon')`), и в go/web/js/app.js:1943-1944 (`['alpha_vantage', 'finnhub', 'twelve_data', 'polygon'].map(...)`) в интерфейсе есть кнопка «Тест Polygon», отправляющая `POST /api/test-provider {provider: 'polygon'}`.
- **Go, сервер:** go/internal/httpapi/server.go:1072-1110 (`handleTestProvider`) — `switch provider` содержит явные `case`-ветки только для `"alpha_vantage"`, `"finnhub"`, `"twelve_data"`; `"polygon"` не упомянут вовсе и проваливается в `default: writeJSON(w, 200, map[string]any{"success": false, "error": "Unknown provider"})`.
- **Эффект:** кнопка «Тест Polygon» на /settings в Go-версии гарантированно всегда покажет ошибку «❌ Unknown provider», даже если `POLYGON_API_KEY` настроен и провайдер реально работает (используется же для обновления датасетов, `/api/polygon-finance/:symbol` и т.д. — то есть сам клиент Polygon в проекте есть, просто не подключён в этот конкретный хендлер). Пользователь получит ложный сигнал «Polygon не работает».
- **Фикс:** добавить `case "polygon":` в `handleTestProvider`, вызывающий существующий Polygon-клиент (`s.Providers...`) аналогично трём другим провайдерам.

---

## Settings — валидация значений отсутствует и на клиенте, и на сервере

### [MEDIUM] Ни один из числовых/строковых лимитов настроек не проверяется в Go (ни в браузере, ни на сервере)
- **React:** src/lib/input-validation.ts — `sanitizeNumericInput` (клэмпит на каждое изменение по `VALIDATION_CONSTRAINTS.thresholdPct` — 0..20, `indicatorPane` — 0..40, `commission.fixed`, `commission.percentage` — 0..10) и `sanitizeTextInput` (для `defaultMultiTickerSymbols` — маска `/^[A-Za-z0-9,\s]*$/`, maxLength 200; для тестового Telegram-сообщения — maxLength 500 + removeHtml). Сервер (Express) в этой части полагается на уже очищенный клиентом ввод, но это React-приложение — не в нашей зоне сравнения важно другое.
- **Go, клиент:** go/web/js/app.js:2828-2832 — `body.watchThresholdPct = Number(body.watchThresholdPct)` и аналогично для `indicatorPanePercent`, `commissionFixed`, `commissionPercentage` — просто приведение типа, никакого клэмпа диапазона. HTML5 `min`/`max` на инпутах есть (напр. `min="0" max="20"` на watchThresholdPct, go/web/js/app.js:1919), но submit-обработчик делает `e.preventDefault()` сразу и не вызывает `form.reportValidity()`/`checkValidity()`, так что нативная браузерная валидация никогда не блокирует отправку. `defaultMultiTickerSymbols` и текст Telegram-теста уходят на сервер без какой-либо фильтрации символов/длины.
- **Go, сервер:** go/internal/httpapi/server.go:328-345 (`handlePutSettings`, `handlePatchSettings`) — тело запроса просто мёржится в `map[string]any` и сохраняется как есть (`for k, v := range body { cur[k] = v }`), без единой проверки типа, диапазона или допустимых значений enum (провайдеры, commissionType и т.п.).
- **Эффект:** Ничто не мешает через DevTools/curl (или просто баг в UI) записать `watchThresholdPct: -50`, `indicatorPanePercent: 99999`, `resultsQuoteProvider: "не-провайдер"` или строку длиной в мегабайт в `defaultMultiTickerSymbols` — сервер всё это молча сохранит и будет отдавать другим частям приложения (мониторингу, автоторговле), что может привести к неожиданному поведению графика/уведомлений или ошибкам в другом месте, которое ожидает валидные значения.
- **Фикс:** добавить клэмп значений в JS-обработчике submit (как минимум зеркально React) и/или базовую валидацию на сервере в `handlePutSettings`/`handlePatchSettings` (диапазоны, allow-list провайдеров, максимальная длина строк).

---

## Оболочка — тема оформления

### [LOW] Нет живого переключения при смене системной темы в режиме «Авто»
- **React:** src/components/ThemeToggle.tsx:55-60 — подписка на `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)`; пока выбран режим `auto`, приложение мгновенно перекрашивается при смене системной темы ОС без перезагрузки страницы.
- **Go:** go/web/js/app.js — `isDark()` (строка 388-390) корректно вычисляет эффективную тему через тот же `matchMedia(...).matches`, но нигде не регистрируется `addEventListener('change', ...)` на этот `matchMedia`-объект (grep по `matchMedia` во всём файле даёт только одно вхождение — само чтение, без подписки).
- **Эффект:** Если пользователь держит тему на «Авто» и переключает тёмную/светлую тему на уровне ОС прямо во время работы с приложением, Go-версия не обновится, пока не сработает что-то другое, вызывающее `applyTheme()` (клик по кнопке темы, ручной reload). React обновляется сразу.
- **Фикс:** добавить `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'auto') { applyTheme(); ...перерисовать активные вычисления, зависящие от темы... } })`.

---

## Оболочка — логин / авторизация

### [HIGH] После логина всегда редирект на /data, исходная страница теряется
- **React:** src/components/AppRouter.tsx:370-372 — `location.state.from` сохраняет путь, с которого редиректнуло на /login, и после успешного логина `navigate(to)` возвращает пользователя туда же (если не /data — на исходный protected-роут).
- **Go:** go/web/js/app.js:2168 — `navigate('/data', true)` захардкожен в обработчике submit формы логина; никакого сохранения исходного пути нет (ни в query, ни в state).
- **Эффект:** Если сессия истекла на, скажем, `/broker` или `/watches`, после повторного логина пользователя всегда бросает на `/data`, а не туда, откуда он пришёл.
- **Фикс:** сохранять `state.page` (или location.pathname) до показа `loginPage()` и использовать его в `navigate()` после успешного логина вместо жёсткого `/data`.

### [HIGH] Нет повторной проверки авторизации при клиентской навигации между страницами
- **React:** src/components/AppRouter.tsx:88-122 — эффект в `ProtectedLayout` зависит от `location.pathname`, то есть `/api/auth/check` перевызывается при КАЖДОЙ смене маршрута; при 401 — принудительный редирект на /login. При 429 или сетевой ошибке — сессия считается валидной (эта тонкая логика прицельно упомянута в задании и в React реализована).
- **Go:** go/web/js/app.js — `API.authCheck()` вызывается только один раз, в `start()` (строка 3323), при первой загрузке страницы. Функция `navigate()` (строка 1008) при клиентских переходах между /data, /stocks, /broker и т.д. НЕ дергает `/api/auth/check` повторно. Просмотрен весь файл на `status === 401` — единственное вхождение это строка 3328 (тот самый boot-check); никакого глобального перехватчика 401 для последующих API-вызовов нет.
- **Эффект:** Если сессия истекла посреди работы (cookie/токен инвалидированы на сервере), Go-SPA не заметит этого при обычной навигации между разделами — пользователь продолжит видеть защищённые страницы «протухшего» состояния, пока какой-то конкретный API-запрос не вернёт 401 и не покажет обычный toast с текстом ошибки (без редиректа на /login). React в этой ситуации активно возвращает на экран логина при каждом переходе.
- **Фикс:** либо периодически (или на каждый `navigate()`) дергать `/api/auth/check` аналогично React, либо (проще) добавить в `API.req` глобальную обработку: при статусе 401 — вызывать `logout()`/показывать `loginPage()`, независимо от того, какой конкретно эндпоинт вернул 401. Важно сохранить исключение для 429 и network-error (не разлогинивать), как это явно задокументировано в задании и сделано в React.

---
