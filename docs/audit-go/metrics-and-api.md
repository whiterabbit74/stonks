# Аудит паритета: метрики (Зона А) и серверный API (Зона Б)

Дата: 2026-09-03. Read-only, ничего не менялось.

## Сводка

Итого 10 находок, все перепроверены grep'ом/чтением обоих файлов до записи в отчёт:
- CRITICAL: 2
- HIGH: 4
- MEDIUM: 2
- LOW: 2

**Зона А (метрики):** формулы, константы, граничные случаи и JSON-контракт
`PerformanceMetrics` в Go — точный построчный порт `src/lib/metrics.ts`,
подтверждено `go test ./internal/metrics/...` (PASS) и сверкой с
`metrics-calculator.test.ts`. Находок уровня CRITICAL/HIGH/MEDIUM нет, только
одна LOW-заметка про сериализацию Infinity.

**Зона Б (серверный API):** здесь, наоборот, обнаружены реальные архитектурные
расхождения — Go-порт датасетов/сплитов не является 1:1 портом, а
самостоятельной переработкой с другой моделью (SQLite вместо JSON, авто-детект
сплитов вместо явного экшна, full-replace вместо incremental merge). Два
CRITICAL: (1) `/metadata`-эндпоинт отдаёт тяжёлый полный датасет вместо лёгких
метаданных, (2) чтение датасета в Go имеет побочный эффект — тихая эвристическая
подгонка и необратимая запись "скорректированных под сплит" цен на обычном GET.

**Честно про охват:** глубоко проверены `datasets.js`/`splits.js`/`calendar.js`
(Node) против `server.go`/`splits_apply.go`/`db.go`/`tradingdate/*` (Go) —
это ядро Зоны Б. `quotes.js`/провайдеры проверены на уровне сигнатур
эндпоинтов и поддерживаемых провайдеров (все 5: alpha_vantage, finnhub,
twelve_data, polygon, webull — присутствуют в обеих реализациках), но
детальный построчный разбор парсинга ответов каждого провайдера
(`alphaVantage.js`/`finnhub.js`/`twelveData.js`/`polygon.js`/`webull.js` vs
`go/internal/providers/client.go`, 486 строк) не проводился построчно —
это осталось за рамками бюджета данного прохода и должно быть отдельной
целью следующего аудита, если нужна полная картина по провайдерам. Не найдено
несоответствий в: `GET /api/datasets` (список), `GET /api/splits`/`GET
/api/splits/:symbol` (чтение), `GET /api/status`, транзакционность записи в
`store/db.go` (SaveDataset/DeleteDataset корректно оборачивают DELETE+INSERT
в транзакцию, как и Node), расчёт праздников/коротких дней NYSE
(`tradingdate/holidays.go` совпадает построчно с `services/dates.js`),
парсинг форматов дат CSV (`tradingdate.Parse` совпадает с
`src/lib/validation.ts:parseDate` — тот же порядок форматов ISO/US/EU и та
же валидация "невозможных" дат).

## Зона А: метрики производительности

Сравнивались: `src/lib/metrics.ts` (MetricsCalculator, 612 строк) против
`go/internal/metrics/metrics.go`, JSON-контракт `go/internal/types/types.go` +
`go/internal/types/metrics_json.go`, эталонные числа из
`src/lib/__tests__/metrics-calculator.test.ts` (456 строк) против
`go/internal/metrics/metrics_test.go` (`go test ./internal/metrics/...` — PASS).

**Общий вывод: это построчный, добросовестный порт.** Все 16 полей
`PerformanceMetrics` (totalReturn, cagr, maxDrawdown, winRate, totalTrades,
sharpeRatio, sortinoRatio, calmarRatio, profitFactor, averageWin, averageLoss,
beta, alpha, recoveryFactor, skewness, kurtosis, valueAtRisk) реализованы в Go
с идентичными формулами, идентичными константами (risk-free 2%, market return
8%, √252 аннуализация, MAR = riskFreeAnnual/252, VaR при confidence=0.05,
population variance/stddev — деление на N, а не N-1) и идентичными граничными
случаями (пустые массивы, нулевой знаменатель, profitFactor/recoveryFactor →
Infinity при отсутствии убытков). JSON-теги в Go (`totalReturn`, `cagr`, …)
совпадают camelCase 1:1 с полями TS-интерфейса — пропавших/переименованных
полей не найдено.

Единственное осмысленное расхождение — по сериализации Infinity, но оно
компенсировано корректно (см. LOW ниже). Других находок в Зоне А не обнаружено
(CRITICAL/HIGH/MEDIUM отсутствуют).

### [LOW] Infinity сериализуется как null и в Node, и в Go — но через разные механизмы, стоит держать в уме
- **Node/TS:** `src/lib/metrics.ts:252,331` — `calculateProfitFactor`/`calculateRecoveryFactor` возвращают `Infinity` при нулевом знаменателе и наличии прибыли. Метрики не уходят через `JSON.stringify` на сервер (бэктест считается на клиенте, в Zustand-сторе), но если бы ушли — `JSON.stringify(Infinity)` даёт `null` автоматически.
- **Go:** `go/internal/types/metrics_json.go:8-13` — `finiteOrNil` явно подменяет `Inf`/`NaN` на `nil` в кастомном `MarshalJSON` для `PerformanceMetrics` и `BacktestMetrics`, потому что `encoding/json` в Go иначе выбросит ошибку `unsupported value: +Inf` при попытке замаршалить `float64(Inf)` напрямую.
- **Расхождение:** механизм разный, результат на проводе одинаковый (`null`), но это единственное место, где `Inf`-семантика вообще пересекает границу процесса — в Go бэктест-движок теперь работает и на сервере (`go/internal/backtest/*`, `go/internal/httpapi/calc.go`), чего в Node вообще не было (там бэктест всегда считался в браузере). Это архитектурный сдвиг, не баг сам по себе.
- **Эффект:** нет пользовательского эффекта — числа приходят как `null`, фронтенд уже обрабатывает `!Number.isFinite` → `—` в `formatters.ts:79-109`.
- **Фикс:** не требуется, зафиксировано для полноты аудита.

---

## Зона Б: паритет серверного API

Сравнивались: `server/src/routes/{datasets,splits,calendar,quotes,status}.js`,
`server/src/services/{datasets,splits,dates,dataIngestion,marketDataIntegrity}.js`,
`server/src/providers/*.js`, `server/src/db/index.js`, `server/src/utils/*.js`
против `go/internal/httpapi/{server.go,helpers.go,splits_apply.go}`,
`go/internal/store/db.go`, `go/internal/providers/client.go`,
`go/internal/splits/splits.go`, `go/internal/tradingdate/{date.go,holidays.go}`.

### [CRITICAL] GET /api/datasets/:id/metadata возвращает полный датасет вместо лёгких метаданных
- **Node/TS:** `server/src/routes/datasets.js:70-84` — отдельный обработчик, возвращает `{...meta, lastDate, splits}` БЕЗ массива `data` (OHLC-баров).
- **Go:** `go/internal/httpapi/server.go:387-389` — `handleDatasetMeta` — это буквально `s.handleGetDataset(w, r)`, то есть отдаёт тот же ответ, что и `GET /api/datasets/:id`, включая полный массив `data` со всеми барами.
- **Расхождение:** эндпоинт `/metadata`, задуманный как лёгкий (см. `GET /api/datasets/:id/metadata` в API reference CLAUDE.md — "Get dataset metadata only"), в Go гоняет по сети весь датасет (может быть тысячи баров). Плюс отсутствует поле `lastDate`, которое Node явно вычисляет через `getLastDateFromDataset`.
- **Эффект:** UI-места, которые дергают `/metadata` именно чтобы не тащить полный OHLC (списки датасетов, быстрые проверки актуальности), внезапно получают весь датасет — деградация трафика/производительности, и одновременно теряют поле `lastDate`, если фронт на него полагается.
- **Фикс:** в Go завести отдельный `handleDatasetMeta`, который отдаёт только meta-строку + `lastDate` + `splits`, без `data`.

### [HIGH] Имя поля успеха отличается: `success` (Node) vs `ok` (Go) во всех dataset-мутациях
- **Node/TS:** `server/src/routes/datasets.js:123` (`POST /datasets`), `:164` (`PUT /datasets/:id`), `:181` (`DELETE`), `:242` (`refresh`), `:306` (`apply-splits`), `:322` (`patch metadata`) — везде ключ `success: true`.
- **Go:** `go/internal/httpapi/server.go:439` (`savePayload`, используется и в `POST`, и в `PUT`), `:478` (`refresh`), `:486` (`delete`) — везде ключ `ok: true` вместо `success`. Только `handleApplySplits` (:505,:515,:518) и `handlePatchDatasetMeta` (:578) используют `success: true`, как в Node — то есть непоследовательно даже внутри самого Go-файла.
- **Расхождение:** если фронтенд (или любой клиент, ожидающий Node-контракт) проверяет `response.success`, для POST/PUT/DELETE/refresh он всегда получит `undefined` → `falsy`, то есть код обработки успеха не сработает.
- **Эффект:** визуально "тихая" поломка — HTTP 200, тело есть, но проверка `if (data.success)` во фронтенде проваливается для загрузки/замены/удаления/рефреша датасета.
- **Фикс:** унифицировать на `success` (как в Node) везде в Go, либо явно мигрировать фронтенд на `ok` и сделать это последовательно.

### [HIGH] POST/PUT /api/datasets — Go не запускает проверки целостности данных (evaluateDatasetPayloadIntegrity) вообще
- **Node/TS:** `server/src/routes/datasets.js:113-122` (POST) и `:154-163` (PUT) — на каждую загрузку/замену датасета считается `evaluateDatasetPayloadIntegrity({symbol, payload, knownSplits})` (импорт из `server/src/services/dataIngestion.js`), результат `integrity.warnings` возвращается клиенту в ответе и, если есть варнинги, шлётся Telegram-алерт через `sendDataIntegrityAlert`.
- **Go:** `go/internal/httpapi/server.go:391-440` (`handleCreateDataset`/`handlePutDataset`/`savePayload`) — данные просто декодируются (`decodeBars`) и сохраняются, единственная "проверка" — попытка эвристически определить сплиты (`adjustBarsIfNeeded` → `splits.Detect`). Никакого сравнения с ожидаемым диапазоном цен, дублей дат, аномальных скачков и т.п. Поле `integrityWarnings` в ответе Go отсутствует полностью.
- **Расхождение:** целый пласт защиты от "плохих" данных (некорректный CSV, дубли, разрывы дат, забытые сплиты) потерян при переписывании на Go.
- **Эффект:** возможна тихая порча датасета при загрузке некорректного файла — раньше пользователь получал варнинг и/или телеграм-алерт, теперь ничего.
- **Фикс:** портировать `evaluateDatasetPayloadIntegrity`/`evaluateOhlcMergeIntegrity` в Go, подключить к `handleCreateDataset`/`handlePutDataset`/`handleRefreshDataset`, вернуть `integrityWarnings` в ответе.

### [CRITICAL] Go молча авто-детектит и авто-применяет сплиты на КАЖДОМ GET /api/datasets/:id, вместо явного POST /apply-splits
- **Node/TS:** `server/src/routes/datasets.js:53-67` (`GET /datasets/:id`) — только читает и отдаёт данные как есть, никакой мутации. Применение сплитов — отдельное явное действие `POST /api/datasets/:id/apply-splits` (`:254-310`), которое использует ТОЛЬКО явно сохранённые события сплитов из `getTickerSplits(id)` (управляются пользователем через `/api/splits`), и идемпотентно по флагу `adjustedForSplits`.
- **Go:** `go/internal/httpapi/server.go:358-385` (`handleGetDataset`) на каждый GET вызывает `s.adjustBarsIfNeeded(id, bars, adj)` (`go/internal/httpapi/splits_apply.go:53-70`), которое — если датасет ещё не помечен `adjustedForSplits` — запускает `splits.Detect(bars)` (`go/internal/splits/splits.go:75-99`): эвристически ищет ценовые скачки, подгоняя отношение `prev.Close/curr.Open` под один из захардкоженных факторов `{2,3,4,5,7,10,20,1.5,0.5,0.333,0.25,0.2,0.1}` с допуском 3%. Если что-то "похоже на сплит", Go тут же (`:373-383`) молча ПЕРЕЗАПИСЫВАЕТ датасет в БД скорректированными ценами и выставляет `adjustedForSplits=true` — на обычном чтении, без подтверждения пользователя.
- **Расхождение:** (1) чтение датасета в Go имеет побочный эффект записи в БД — нарушение идемпотентности GET; (2) применяемые "сплиты" — это эвристика по цене, а не явные события, которыми управляет пользователь через `/api/splits` (хотя Go и пытается объединить detected+stored через `mergeSplitEvents`, у него нет отдельного explicit-only режима, который был в Node); (3) любой обычный ценовой гэп (гэп на отчётности, дивиденды, разрыв данных провайдера) с коэффициентом около 2x/3x/etc может быть ошибочно принят за сплит и НАВСЕГДА исказить исторические цены — необратимо для реальных данных биржи (реальных сплитов не было, но код разделил цены).
- **Эффект:** тихая, необратимая порча исторических цен на первом же обращении к датасету, если в данных случайно оказался ценовой разрыв, совпадающий по коэффициенту со списком кандидатов. Это прямое повторение задокументированного в CLAUDE.md класса багов ("съехавший на день список сплитов" и т.п.), только хуже — здесь искажаются сами цены, а не даты.
- **Фикс:** убрать авто-детект+авто-применение из read-пути `GET /api/datasets/:id`; оставить `Detect` (если он вообще нужен) только как рекомендацию/варнинг, а фактическое применение — только через явный `POST /apply-splits`, используя исключительно сохранённые (пользователем подтверждённые) события сплитов, как это делал Node.

### [HIGH] PUT /api/datasets/:id в Go не мёржит с существующим датасетом — затирает companyName/tag/uploadDate, если их нет в теле запроса
- **Node/TS:** `server/src/routes/datasets.js:135-173` — `const payload = { ...existing, ...req.body }` — явный shallow-merge поверх существующей записи, поля, отсутствующие в `req.body`, сохраняют старое значение.
- **Go:** `go/internal/httpapi/server.go:417-425` (`handlePutDataset`) → `savePayload` (`:427-440`) — берёт ТОЛЬКО тело запроса (`payload["companyName"]`, `payload["tag"]`), никакого чтения/мёржа существующей записи из БД. Если клиент отправит PUT только с `{data: [...]}` (без companyName/tag), в Go они будут сохранены как пустые строки (`str(nil) == ""`), затерев то, что было.
- **Расхождение:** PUT перестаёт быть частичным upsert-ом поверх существующих метаданных, становится полной заменой.
- **Эффект:** потеря `companyName`/`tag` при обновлении датасета только новыми барами (частый сценарий — "довести данные", не трогая метаданные).
- **Фикс:** в `handlePutDataset` сначала прочитать существующий `ds := s.DB.GetDataset(id)`, замёржить непереданные поля, как в Node.

### [MEDIUM] POST /api/datasets/:id/refresh: другой ключ настройки провайдера и полностью другая стратегия обновления (full refetch + overwrite вместо incremental merge)
- **Node/TS:** `server/src/routes/datasets.js:188-251` — берёт `settings.resultsRefreshProvider` (с allowlist `['alpha_vantage','finnhub','twelve_data']`), либо провайдера из `req.query.provider`. Стартовая точка — `lastExistingDate - 7 дней` (инкрементальный докач), новые бары мёржатся через `mergeOhlcRows` (upsert только новых/изменившихся дат), считается integrity для мержа (`evaluateOhlcMergeIntegrity`), сплиты из ответа провайдера апсертятся в `/api/splits`. Ответ включает `added` (число добавленных строк).
- **Go:** `go/internal/httpapi/server.go:442-479` — берёт настройку `s.DB.Settings()["enhancerProvider"]` (ДРУГОЙ ключ настройки, не `resultsRefreshProvider`!), нет query-параметра `provider` для оверрайда. Всегда фетчит `40*365*24*60*60` секунд (40 лет) истории целиком с провайдера и ПОЛНОСТЬЮ ПЕРЕЗАПИСЫВАЕТ датасет (`s.DB.SaveDataset(...)` — full replace, см. `saveDataset`/`SaveDataset` full-replace семантику), не инкрементально. Нет вызова integrity-проверок для мержа, нет апсерта обнаруженных сплитов из ответа провайдера. Ответ не содержит `added`, содержит другой набор полей (`ok`, `ticker`, `dataPoints`, `provider`, `adjustedForSplits`).
- **Расхождение:** (1) неверный/другой ключ настройки — `enhancerProvider` вместо `resultsRefreshProvider`, поэтому пользовательская настройка "провайдер для рефреша результатов" в Go, вероятно, не читается вообще (используется настройка от другого фичи — "enhance"); (2) полный рефетч 40 лет истории на каждый refresh вместо докачки 7 дней — прямое нарушение задокументированных троттлинг-бюджетов провайдеров (AlphaVantage 15с+2с джиттер, ограниченные лимиты) и просто дороже/медленнее; (3) отсутствие merge-integrity проверок.
- **Эффект:** рефреш в Go либо использует не ту настройку провайдера, либо (если не задана) всегда падает на `finnhub` без учёта выбора пользователя; плюс на каждый рефреш качается вся история заново, что для датасетов с сотнями баров — лишняя нагрузка на rate-limited провайдеров.
- **Фикс:** использовать тот же ключ настроек (`resultsRefreshProvider`), поддержать query-override, вернуться к инкрементальному докачу от `lastExistingDate-7d` и `mergeOhlcRows`-семантике вместо полной перезаписи.

### [HIGH] PUT/PATCH /api/splits/:symbol в Go молча проглатывают ошибку разбора тела запроса — PUT может стереть все сплиты тикера
- **Node/TS:** `server/src/routes/splits.js:93-119` — явная валидация: `events = Array.isArray(req.body) ? req.body : (req.body && req.body.events)`, если не массив — `400 {error: 'Body must be array of {date,factor}'}`, до записи в БД дело не доходит.
- **Go:** `go/internal/httpapi/server.go:609-621` — `var events []map[string]any; _ = readJSON(r, &events)` — ошибка декодирования (невалидный JSON, объект вместо массива, обёртка `{events:[...]}`, пустое тело) молча отбрасывается (`_ =`), и код идёт дальше с `events == nil`. Для PUT это означает `s.DB.ReplaceSplits(symbol, toSplits(nil))` — то есть **замену существующего списка сплитов на пустой**, без какой-либо ошибки клиенту (ответ всё равно `200 {"ok": true}`).
- **Расхождение:** Node отвергает некорректный запрос без побочных эффектов; Go на любой сбой парсинга тела тихо очищает сплиты тикера через PUT (для PATCH это менее опасно — `UpsertSplits(symbol, [])`, скорее всего no-op).
- **Эффект:** нынешний фронтенд (`src/lib/api.ts:306-318`, `DatasetAPI.setSplits`) всегда шлёт валидный `JSON.stringify(array)`, поэтому в текущем UI баг не проявляется, но любой другой клиент/скрипт, отправивший `{events:[...]}` (как раньше поддерживал Node) или не-JSON body, безвозвратно потеряет сохранённые сплиты тикера без единого сообщения об ошибке.
- **Фикс:** проверять ошибку `readJSON` явно и возвращать 400 без записи в БД; на всякий случай поддержать и `{events:[...]}` обёртку, как делал Node.

### [MEDIUM] Мутации /api/splits/* возвращают `{ok:true}` вместо `{success, symbol, events}` — теряется эхо обновлённого списка
- **Node/TS:** `server/src/routes/splits.js:101,115,127,138` — PUT/PATCH/DELETE(date)/DELETE(all) возвращают `{success: true, symbol, events: updated}` (кроме полного delete — без `events`). Типы во фронтенде (`src/lib/api.ts:306,320,334,346`) объявлены под эту форму.
- **Go:** `go/internal/httpapi/server.go:609-631` — все четыре хендлера возвращают только `{"ok": true}`, без `symbol` и без обновлённого массива `events`.
- **Расхождение:** ключ успеха (`ok` vs `success`) и состав полезной нагрузки не совпадают с объявленными фронтенд-типами.
- **Эффект:** в текущем `SplitsTab.tsx` результат PUT/PATCH не используется напрямую (компонент делает отдельный `refresh()` после мутации), поэтому видимого UI-бага сегодня нет — но контракт де-факто нарушен, и любой код, который начнёт читать `result.events`/`result.success` без повторного fetch, получит `undefined`.
- **Фикс:** вернуть `success`, `symbol` и актуальный список `events` из `ReplaceSplits`/`UpsertSplits`/`DeleteSplit`, как в Node.

### [LOW] apply-splits: Go округляет скорректированные цены до 6 знаков, Node — не округляет вовсе
- **Node/TS:** `server/src/routes/datasets.js:292-296` — `normalized[i].open /= cumulative` и т.д. без округления (обычная плавающая точка JS).
- **Go:** `go/internal/splits/splits.go:11-13,58-66` — `roundPrice` округляет каждое скорректированное значение `math.Round(value*1000000) / 1000000`.
- **Расхождение:** для одного и того же датасета скорректированные цены будут отличаться на уровне 7-го знака между старой (Node) историей и новой (Go) — не критично для отображения, но может дать неидентичные хэши/сравнения при регресс-тестах или при сверке с историческими бэктестами, сохранёнными до миграции.
- **Эффект:** минимальный визуально, но ломает побитовое сравнение старых/новых датасетов.
- **Фикс:** не является багом сам по себе — задокументировать поведение, при необходимости округлять одинаково в обеих реализациях (или нигде).

