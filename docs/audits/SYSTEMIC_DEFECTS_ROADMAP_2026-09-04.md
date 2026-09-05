# Системные дефекты: разбор причин и roadmap исправлений — 2026-09-04

Отправная точка: `AUTOTRADE_READONLY_AUDIT_2026-09-04.md` (F01–F09) и жалоба на сообщение
`Ошибка загрузки: Finnhub: <nil> | {"error":"Finnhub: <nil>"}` в интерфейсе.

Вопрос был не «почини одну ошибку», а «почему одинаковые дефекты появляются от аудита к
аудиту». Ниже — четыре повторяющихся механизма, полный список найденных экземпляров вне
уже задокументированных F01–F09, и roadmap мелкими задачами.

Базовая линия: `go test ./...` зелёный на `0886e33`. Исходники этим документом не менялись.

---

## Часть 1. Почему одно и то же лезет снова

Дефекты F01–F09 — не девять независимых ошибок. Это четыре механизма, каждый из которых
воспроизводится в новом коде, потому что ничто в проекте его не запрещает.

### М1. Ошибка записи проглатывается, наружу уходит успех

`_ = db.SaveSettings(...)`, `_ = db.SetOrderTrackerStatus(...)`, `SessionDelete` без
возврата ошибки. Go требует явно выбросить результат, и `_ =` выглядит как осознанное
решение — но в 90 % мест это «здесь ошибка не важна», сказанное про запись состояния,
которое как раз важно.

Так родились F01 (отключение автоторговли), F03 (трекер завершается без записи), F09
(календарь). И так же родились S04, S05, S10, S11 ниже — включая **сброс защитного флага
`trackerPersistFail`**, то есть самой страховки, которую поставили после прошлого аудита.

### М2. Есть правильный помощник, но вызывают соседний неправильный

В коде уже лежит корректная функция, а рядом — её «упрощённая» версия, которая подставляет
дефолт вместо реального объекта:

| правильно | неправильно | где сломалось |
|---|---|---|
| `findOrderSnapshotOn(br, id)` | `findOrderSnapshot(id)` → `defaultBroker()` | F04 |
| `booksFor(name, br, …)` по всем брокерам | `booksFor("webull", …)` | F02 |
| `brokerPositions(ctx, br)` | `br.Positions()` | **S06** (новое) |
| `ClaimAggregateT11` (атомарный) | чтение/запись `settings` | **S10** (новое) |

Механизм один: при добавлении второго брокера/дедлайна/атомарности вводится новая функция,
но старая не удаляется и остаётся доступной. Компилятор одинаково доволен обеими.

### М3. Ручной путь в обход общего механизма

`submitEvaluated` (`execute_all.go:120-187`) выстроил защиту: проверка pending-трекера,
резервирование в памяти, `trackerPersistBlocked`, окно исполнения. Любая **ручная** отправка
заявки идёт мимо всего этого напрямую в `PlaceMarket`. F05 (ручное закрытие Robinhood) —
один из трёх таких путей; остальные два (S07, S08) не были в аудите и отправляют реальный
BUY вообще без записи в журнал.

### М4. Контекст/дедлайн объявлен, но не доходит до сети

`execWindow` спроектирован верно, но передаётся не везде: цикл повторов между попытками
дедлайн уважает, а **сам сетевой вызов внутри попытки — нет**, потому что замыкание
принимает `ctx` и выбрасывает его (`func(context.Context) ([]any, error) { return
br.Positions() }`). Это F06 и S06.

### Что общего

Все четыре механизма — «неправильный вариант компилируется и выглядит нормально». Ни один
не ловится ревью по диффу: в диффе видна одна строка `_ = e.DB.SaveSettings(settings)` или
`br.Positions()`, и она выглядит как весь остальной файл. Поэтому в roadmap есть задачи
S15–S17: сделать неправильный вариант **недоступным**, а не «запомнить, что так нельзя».

---

## Часть 2. Найденные экземпляры (вне F01–F09)

Уверенность относится к анализу кода. Экземпляры проверены по текущему коду, а не по
прошлым аудитам.

### S01 — P1: `Finnhub: <nil>` — HTTP-статус ответа провайдера игнорируется

- **Уверенность: высокая.** `go/internal/providers/client.go:341-367`: `status, body, err :=
  c.get(u)`, затем в конце функции `_ = status`. `c.get` (`client.go:86-101`) возвращает
  статус без ошибки для любого не-2xx, поэтому тело ошибки провайдера разбирается как
  данные.
- **Сценарий:** Finnhub на 403 (эндпоинт `/stock/candle` закрыт для бесплатного тарифа)
  отдаёт `{"error":"You don't have access to this resource."}`. Поля `s` в теле нет,
  `jsonData["s"].(string)` даёт `""`, ветка ошибки формирует сообщение через
  `fmt.Sprintf("Finnhub: %v", jsonData["s"])` — то есть `Finnhub: <nil>`. Настоящая причина
  (403 и текст провайдера) до пользователя не доходит вообще.
- **Ответ на вопрос «нормально ли это»: нет.** Сообщение не называет ни код ответа, ни
  причину; `<nil>` — это форматирование отсутствующего ключа, а не текст провайдера.
- **Критерий:** не-2xx от Finnhub превращается в `HTTPError` с этим статусом и текстом из
  тела; `%v` по отсутствующему ключу в сообщение не попадает. Проверка: тестовый сервер
  отдаёт 403 с телом `{"error":"..."}` — сообщение содержит `403` и текст провайдера.

### S02 — P2: Twelve Data — тот же игнор статуса, плюс успех с ценой 0.00

- **Уверенность: высокая.** `client.go:254-270` (`TwelvePrice`) и `client.go:400-420`
  (`twelveHistory`) берут `_, body, err := c.get(u)` — статус выброшен. Ошибка
  распознаётся только по `jsonData["status"] == "error"`.
- **Сценарий:** ответ 429/403 в форме, где нет `status: error` (или тело не JSON-объект с
  этим полем) → `TwelvePrice` возвращает `p == 0` и `err == nil`.
  `go/internal/httpapi/server.go:1737-1742` тогда отвечает `success: true, price: "0.00"` —
  проверка провайдера в интерфейсе показывает зелёный статус на неработающем провайдере.
- **Критерий:** не-2xx → `HTTPError`; нулевая цена без ошибки провайдера → 404, а не успех.

### S03 — P2: интерфейс дублирует текст ошибки

- **Уверенность: высокая.** `go/web/js/api.js:34-38` кладёт в `err.message` уже
  `data.error`, а `go/web/js/app.js:560-569` (`errText`) дописывает `' | ' +
  JSON.stringify(err.data)`. Для типичного ответа `{"error":"..."}` это ровно тот же текст
  второй раз — отсюда вид `Finnhub: <nil> | {"error":"Finnhub: <nil>"}`.
- **Область:** касается **каждой** ошибки API в SPA, не только загрузки датасета.
- **Критерий:** дописывается только то, чего нет в сообщении (например `data.raw`, поля
  помимо `error`/`message`); при `{"error": …}` хвост `| {...}` не показывается.

### S04 — P1: защитный флаг `trackerPersistFail` сохраняется без проверки ошибки

- **Уверенность: высокая.** `go/internal/live/autotrade.go:718-730` (`setTrackerPersistBlock`)
  пишет `_ = e.DB.SaveSettings(settings)`. Флаг ставится ровно тогда, когда заявка ушла к
  брокеру, а локальной записи о ней нет (`SaveOrderTracker` отказал), и он единственный, что
  блокирует новые входы (`execute_all.go:162-166`).
- **Сценарий:** SQLite отказывает в записи. Отказ `SaveOrderTracker` и есть повод поставить
  блок — но та же неисправная база не сохранит и блок. В памяти он есть, после рестарта
  процесса — нет. Автоторговля продолжает входы, не зная о зависшей заявке.
- **Зеркальный дефект:** `ClearTrackerPersistBlock` (`autotrade.go:779-786`) снимает флаг из
  памяти, пишет `_ = e.DB.SaveSettings(settings)` и **возвращает `nil`** — оператор получает
  подтверждение снятия, а после рестарта блок возвращается.
- **Критерий:** обе операции возвращают ошибку записи наверх; API не подтверждает ни
  установку, ни снятие блока, пока запись не прошла.

### S05 — P1: `settings` — один JSON-блоб, все писатели делают read-modify-write

- **Уверенность: высокая.** `go/internal/store/db.go:883-887`: вся таблица `settings` — одна
  строка `id=1` с JSON, `SaveSettings` заменяет её целиком. Девять мест
  (`scheduler.go:273,475,522,529`, `httpapi/server.go:560,581`,
  `live/autotrade.go:43,729,784`, `live/actualize.go:197`) делают `settings := db.Settings()`
  → правка одного ключа → `SaveSettings(settings)`.
- **Сценарий:** планировщик читает settings для `lastCalendarImportDate`; параллельно
  `setTrackerPersistBlock` читает и записывает `trackerPersistFail`; планировщик записывает
  свою (уже устаревшую) копию — защитный флаг стёрт. Ни один из двух путей ошибки не увидит.
  Писатели живут в разных горутинах: планировщик, HTTP-обработчики, движок.
- **Критерий:** запись отдельного ключа не переписывает остальные — либо точечный
  UPDATE по ключу (`json_set`), либо чтение и запись под одной транзакцией/мьютексом.
  Проверка: два конкурентных писателя разных ключей — оба значения на месте.

### S06 — P1: чтение позиций не получает дедлайн (продолжение F06)

- **Уверенность: высокая.** `go/internal/live/autotrade.go:432-437`:
  `retryBrokerReadWindow(e, w, "positions", func(context.Context) ([]any, error) { return
  br.Positions() })` — параметр `ctx` в замыкании безымянный и не используется. Рядом,
  `autotrade.go:819`, тот же вызов сделан правильно: `brokerPositions(ctx, br)`, который
  выбирает `PositionsCtx` через интерфейс `ctxPositioner` (`engine.go:130-135`,
  `webull_broker.go:169-180`).
- **Следствие:** `retryBrokerReadWindow` останавливает **следующую** попытку по дедлайну, но
  текущий сетевой вызов не отменяется ничем, кроме таймаута HTTP-клиента. Один зависший
  запрос позиций съедает минуту T-1 целиком.
- **Критерий:** замыкание передаёт свой `ctx` в `brokerPositions(ctx, br)`. Проверка:
  медленный transport + истекающее окно — вызов прерывается контекстом, а не таймаутом.

### S07 — P1: тестовая покупка Robinhood отправляет реальный BUY без всякой записи

- **Уверенность: высокая.** `go/internal/httpapi/robinhood.go:138-169` вызывает
  `br.PlaceMarket(body.Symbol, "BUY", qty)` напрямую. Нет `startTracking`, нет проверки
  pending-трекера, нет резервирования, нет `trackerPersistBlocked`, нет записи в
  `autotrade_logs`. Отправка живая: гейт — только `ROBINHOOD_ENABLE_LIVE_TEST_BUY=true`.
- **Сценарий:** оператор нажимает тестовую покупку; позиция появляется у брокера, локально о
  ней не знает ничто. Дальнейшая сверка книг видит расхождение или, хуже, автоторговля
  считает позицию своей и продаёт её по сигналу выхода.
- **Критерий:** ручная отправка идёт через тот же путь резервирования и трекинга, что и
  автоматическая, либо явно отклоняется при наличии pending-заявки.

### S08 — P1: `TestBuy` Webull не создаёт трекер

- **Уверенность: высокая.** `go/internal/live/autotrade.go:1120-1127`: после
  `e.placeMarket(...)` вызывается только `e.logAuto("test_buy", …)`. Для сравнения,
  `ClosePosition` в том же файле (`1086-1092`) при `res.Submitted` вызывает
  `e.startTracking(res, orderMeta{…})`.
- **Следствие:** то же, что S07, для Webull — исполнение не попадёт в журнал сделок.
- **Критерий:** отправленная тестовая покупка порождает трекер, как любая другая заявка.

### S09 — P1: `ClosePosition` всегда берёт брокера по умолчанию и обходит защиту

- **Уверенность: высокая.** `go/internal/live/autotrade.go:1069-1092`: `br :=
  e.defaultBroker()` без параметра брокера в сигнатуре. Символ, который держит Robinhood,
  закрыть этим путём нельзя — `Positions()` Webull его не покажет. Проверки pending-SELL
  (`FindPendingTrackerBroker`) нет, резервирования нет.
- **Сценарий:** оператор закрывает позицию вручную; в ту же минуту приходит автоматический
  сигнал выхода — уходит второй SELL. Это F05 в другом файле.
- **Критерий:** ручное закрытие принимает брокера, проходит те же проверки, что
  `submitEvaluated`.

### S10 — P2: маркеры «уже выполнено» планировщика теряются молча

- **Уверенность: высокая.** `go/internal/scheduler/scheduler.go:273` (ротация логов),
  `:475` (`lastMissedT1Date`), `:522` и `:529` (`lastCalendarImportDate`) — все
  `_ = db.SaveSettings(settings)`.
- **Сценарий:** маркер не сохранился → на следующем тике задача считается невыполненной и
  выполняется снова. Для отчёта о пропуске это повторное сообщение в Telegram; для импорта
  календаря — повторный запрос к провайдеру.
- **Отдельно:** ветка `t11` в `reportMissedTelegram` (`:456-460`) использует атомарный
  `db.ClaimAggregateT11`, а ветка `t1` (`:466-476`) — чтение и запись `settings`. Правильный
  механизм существует и применён только к половине кода (см. М2).
- **Критерий:** неудачная запись маркера отличима от успешной и попадает в `JobLog`;
  ветка `t1` использует такой же атомарный claim, как `t11`.

### S11 — P2: выход из системы отвечает успехом, не убедившись, что сессия удалена

- **Уверенность: высокая.** `go/internal/store/db.go:584-586`: `SessionDelete` не возвращает
  ошибку вообще (`_, _ = d.SQL.Exec(...)`). `go/internal/httpapi/server.go:485-493` стирает
  cookie и отвечает `success: true`.
- **Следствие:** при отказе записи токен остаётся действительным на сервере до истечения TTL
  (до 7 дней для «запомнить меня»), а пользователю сказано, что он вышел.
- **Критерий:** `SessionDelete` возвращает ошибку; logout при отказе отвечает ошибкой.
  Проверка входа с тем же cookie после «неудачного» выхода.

### S12 — P3: вход отвечает успехом при несохранённой сессии

- **Уверенность: высокая.** `go/internal/httpapi/server.go:410`: `_ = s.DB.SessionSet(...)`,
  затем cookie и `success: true`. Проверка сессии (`server.go:290-298`) при ошибке
  базы отвечает 500, то есть отказ безопасный — но пользователь получает «вход выполнен» и
  сразу же выбивается.
- **Критерий:** ошибка `SessionSet` → HTTP 500, cookie не ставится.

### S13 — P2: EMA-алерты помечаются отправленными без проверки записи

- **Уверенность: высокая.** `go/internal/live/ema.go:213` и `:219` — `_ =
  e.DB.MarkEMATriggered(...)`, `_ = e.DB.RecordEMAInfoSide(...)`. Функция называется
  `persistEmaAfterSend`: сообщение уже ушло.
- **Следствие:** при отказе записи тот же алерт уходит повторно на каждом цикле.
- **Критерий:** ошибка попадает в `autotrade_logs`; повторная отправка одного алерта
  ограничена.

### S14 — P3: единственное сравнение IBS мимо `internal/ibs`

- **Уверенность: высокая.** `go/internal/backtest/clean.go:164`: `lastIBS > highIBS` вместо
  `ibssig.IsExitSignal(lastIBS, highIBS)`. Все остальные 12 мест (перечислены `rg
  'IsEntrySignal|IsExitSignal'`) идут через пакет.
- **Уточнение:** порог сейчас совпадает (`>` строгое, как в `IsExitSignal`), поэтому
  поведение верное. Это не действующий дефект, а единственная точка, где порог может
  разойтись с бэктестом при следующей правке — ровно тот механизм М2. Приоритет низкий.
- **Критерий:** сравнение идёт через `ibssig.IsExitSignal`.

---

## Часть 3. Roadmap

Правила для исполнителя:

- Одна задача — один коммит. Не смешивать задачи.
- Перед началом: `cd go && go test ./...` должен быть зелёным. После задачи — тоже.
- К каждой задаче обязателен тест, который **падает до правки и проходит после**.
  Сначала пиши тест, убедись, что он красный, потом правь код.
- Не пушить и не деплоить.
- Не менять поведение сверх описанного в задаче. Если по ходу нашлось что-то ещё —
  дописать сюда новым пунктом, не чинить в этом же коммите.
- Все даты — строки `YYYY-MM-DD` через `internal/tradingdate` (см. CLAUDE.md).

### Волна 1 — то, что видит пользователь (независимые, можно в любом порядке)

**T1. Finnhub: проверять HTTP-статус.** (S01)
Файл `go/internal/providers/client.go`, функция `finnhubHistory` (~строка 335).
После `status, body, err := c.get(u)` и проверки `err` добавить: если `status != 0 && status
!= 200` — вернуть `&HTTPError{status, fmt.Sprintf("Finnhub: HTTP %d: %s", status,
providerErrText(body))}`. Убрать `_ = status` в конце функции. Ниже, в ветке `s != "ok"`,
не форматировать `%v` от отсутствующего ключа: если `s == ""`, писать
`"Finnhub: неожиданный ответ провайдера"`.
Вспомогательную `providerErrText(body []byte) string` написать здесь же: разобрать JSON,
вернуть `error`/`message`/`s`, если есть; иначе — первые 200 байт тела; в сообщение не
должны попадать URL и ключи (в файле уже есть `sanitizeTransportError` и `secretQueryRe` —
прогнать текст через ту же очистку).
*Тест:* `go/internal/providers/client_test.go` — `httptest` сервер отдаёт 403 и тело
`{"error":"You don't have access to this resource."}`; `FinnhubBase` указывает на него;
`Historical(..., "finnhub", ...)` возвращает `*HTTPError` со `Status == 403`, сообщение
содержит текст провайдера и **не** содержит `<nil>`.
*Коммит:* `fix(providers): surface Finnhub HTTP status instead of "Finnhub: <nil>"`

**T2. Twelve Data: проверять HTTP-статус и не выдавать нулевую цену за успех.** (S02)
Файл `go/internal/providers/client.go`, функции `TwelvePrice` (~254) и `twelveHistory`
(~400). Заменить `_, body, err := c.get(u)` на `status, body, err := c.get(u)` и добавить
проверку `status != 0 && status != 200` → `&HTTPError{status, ...}` c `providerErrText` из
T1. В `TwelvePrice` после разбора: если `p == 0` — вернуть `&HTTPError{404, "Twelve Data: no
price for " + symbol}` (как это уже делает `finnhubQuote:389`).
*Тест:* сервер отдаёт 429 с телом без `status: error` → `TwelvePrice` возвращает ошибку, а
не `(0, nil)`.
*Коммит:* `fix(providers): fail Twelve Data reads on non-200 and zero price`

**T3. Убрать дублирование текста ошибки в интерфейсе.** (S03)
Файл `go/web/js/app.js`, функция `errText` (~строка 560).
Дописывать хвост только из полей, которых нет в сообщении: собрать из `err.data` объект без
ключей `error` и `message`, и добавлять `' | ' + JSON.stringify(rest)` только если он
непустой. Если `err.data.raw` есть (не-JSON ответ) — показать его, обрезав до 200 символов.
*Тест:* `go/web/js/charts_map_test.cjs` — там уже есть паттерн node-теста без браузера; если
`errText` оттуда недоступна, вынести её в отдельный модуль или добавить тест по образцу
существующего файла. Проверить: `errText({message:'X', data:{error:'X'}}) === 'X'`;
`errText({message:'X', data:{error:'X', detail:'Y'}})` содержит `Y`.
*Коммит:* `fix(web): stop repeating the API error payload in error text`

### Волна 2 — потеря состояния (М1). Строго в этом порядке

**T4. `SaveSettings` перестаёт быть read-modify-write.** (S05) — делать первой, остальные
опираются на неё.
Файл `go/internal/store/db.go`. Добавить метод `SetSettingsKeys(kv map[string]any) error`,
который в одной транзакции читает текущий JSON, применяет только переданные ключи и
записывает результат. Существующий `SaveSettings` оставить для двух мест, которые
действительно сохраняют форму целиком (`httpapi/server.go:560,581`).
Взять `d.SQL` под ту же сериализацию, что уже даёт `MaxOpenConns=1`, но чтение и запись
должны быть внутри одной `BEGIN IMMEDIATE`-транзакции, иначе гонка сохраняется.
*Тест:* `go/internal/store/db_test.go` — две горутины пишут `SetSettingsKeys({"a":1})` и
`SetSettingsKeys({"b":2})`, после `Wait` в settings присутствуют оба ключа. Запустить с
`-race`.
*Коммит:* `feat(store): add SetSettingsKeys so one writer cannot clobber another's key`

**T5. Перевести всех точечных писателей settings на `SetSettingsKeys`.** (S05)
Файлы и строки: `go/internal/scheduler/scheduler.go:273,475,522,529`;
`go/internal/live/autotrade.go:43,729,784`; `go/internal/live/actualize.go:197`.
Механическая замена `settings := db.Settings(); settings[k] = v; SaveSettings(settings)` →
`db.SetSettingsKeys(map[string]any{k: v})`. Ошибку **не** глушить (см. T6, T7).
*Тест:* существующие тесты планировщика и движка должны остаться зелёными; добавить один
тест: установка `trackerPersistFail` и параллельная запись `lastCalendarImportDate` — оба
значения на месте.
*Коммит:* `refactor(live,scheduler): write single settings keys instead of whole blob`

**T6. Ошибка сохранения защитного флага доходит наверх.** (S04)
Файл `go/internal/live/autotrade.go`. `setTrackerPersistBlock` (~718) возвращает `error`;
все вызывающие обрабатывают его — как минимум запись в `autotrade_logs` события
`tracker_persist_block_save_failed` и сохранение флага в памяти (`e.trackerPersistFail`),
чтобы блок действовал хотя бы до рестарта. `ClearTrackerPersistBlock` (~779) при ошибке
`SetSettingsKeys` **возвращает эту ошибку** и не сообщает об успешном снятии; флаг в памяти
при этом восстанавливается обратно.
*Тест:* `go/internal/live/*_test.go` — база, отклоняющая запись settings: (а)
`setTrackerPersistBlock` → в логах есть событие отказа, `trackerPersistBlocked` всё ещё
`true`; (б) `ClearTrackerPersistBlock` → возвращена ошибка, `trackerPersistBlocked`
по-прежнему `true`.
*Коммит:* `fix(live): do not report tracker persist block set/cleared when the write failed`

**T7. Маркеры планировщика: не глушить ошибку записи.** (S10)
Файл `go/internal/scheduler/scheduler.go`, строки 273, 475, 522, 529 (после T5 — вызовы
`SetSettingsKeys`). При ошибке — `onEvent(JobLog{At: now, Name: <имя задачи>, Detail:
"marker-save-failed: " + err.Error()})`. Поведение самой задачи не менять.
*Тест:* база отклоняет запись settings, `RunCalendarExtend` даёт `JobLog` с
`marker-save-failed`.
*Коммит:* `fix(scheduler): report failed job-marker writes instead of dropping them`

**T8. Ветка `t1` пропущенного отчёта использует атомарный claim, как `t11`.** (S10)
Файлы `go/internal/store/live_persist.go:402-425` и
`go/internal/scheduler/scheduler.go:466-481`.
Добавить колонку `missed_t1_reported` в `aggregate_send_state` (миграция — по образцу
соседних) и `ClaimMissedT1(chatID, dateKey string) (bool, error)` ровно по образцу
`ClaimAggregateT11`: `EnsureAggregateSlot`, затем условный
`UPDATE ... SET missed_t1_reported=1 WHERE date_key=? AND chat_id=? AND missed_t1_reported=0`
и `RowsAffected() == 1`. Существующий `ClaimAggregateT1` **не переиспользовать** — он
означает «решение отправлено», а не «отчёт о пропуске отправлен». В `reportMissedTelegram`
заменить чтение/запись `lastMissedT1Date` на новый claim.
*Тест:* два параллельных вызова `reportMissedTelegram` со слотом `t1` дают ровно одно
сообщение (счётчик в тестовом `TelegramSender`). Запустить с `-race`.
*Коммит:* `fix(scheduler): claim the missed-T1 report atomically like T-11`

**T9. Выход из системы не подтверждает несостоявшееся удаление.** (S11)
Файлы `go/internal/store/db.go:584-586` и `go/internal/httpapi/server.go:485-493`.
`SessionDelete` меняет сигнатуру на `error`. В logout при ошибке — HTTP 500 с
`{"error":"..."}`; cookie при этом всё равно стереть (клиенту хуже не станет), но `success`
не отдавать. Поправить второго вызывающего — `server.go:300`.
*Тест:* `go/internal/httpapi/*_test.go` — база отклоняет DELETE по sessions, logout отвечает
500, запрос с тем же cookie по-прежнему авторизован (это и есть доказательство, что «успех»
был бы ложью).
*Коммит:* `fix(httpapi): fail logout when the session row was not deleted`

**T10. Вход не подтверждает несохранённую сессию.** (S12)
Файл `go/internal/httpapi/server.go:409-413`. `if err := s.DB.SessionSet(...); err != nil` →
HTTP 500 `{"error":"Failed to create session"}`, cookie не ставить.
*Тест:* база отклоняет INSERT в sessions → login отвечает 500 и без `Set-Cookie`.
*Коммит:* `fix(httpapi): fail login when the session could not be stored`

**T11. EMA-алерты: не терять отметку об отправке молча.** (S13)
Файл `go/internal/live/ema.go:208-222`. При ошибке `MarkEMATriggered` /
`RecordEMAInfoSide` — `e.logAuto("ema_persist_failed", "", map[string]any{"id": a.ID,
"error": err.Error()})`.
*Тест:* база отклоняет запись → в `autotrade_logs` есть `ema_persist_failed`.
*Коммит:* `fix(live): log EMA alert persistence failures`

### Волна 3 — обход общего механизма (М3). В этом порядке

**T12. Общая точка ручной отправки заявки.** (S07, S08, S09, и F05 из аудита)
Файл `go/internal/live/autotrade.go`. Ввести `manualOrder(br Broker, brokerName, symbol,
side string, qty float64, source string) (OrderResult, error)`, который выполняет ту же
последовательность, что `submitEvaluated` до отправки: проверка pending-трекера через
`FindPendingTrackerBroker` (для SELL) / `AnyPendingTrackerFor` (для BUY), резервирование в
`e.reservations` по тому же ключу `brokerName + ":" + symbol + ":" + action`, проверка
`trackerPersistBlocked`, затем `e.placeMarket`, затем **обязательный** `e.startTracking` с
`orderMeta{Source: source}`.
Эту задачу делать **до** T13–T15: они лишь переключают вызывающих на неё.
*Тест:* `MemoryBroker` + pending-трекер на символ → `manualOrder` не отправляет заявку и
возвращает `pending_..._tracker_exists`; без pending — отправляет и создаёт трекер.
*Коммит:* `feat(live): add a guarded manual order path shared with automatic submission`

**T13. `ClosePosition` принимает брокера и идёт через `manualOrder`.** (S09)
Файлы `go/internal/live/autotrade.go:1069-1092` и `go/internal/httpapi/live_handlers.go:190`.
Сигнатура `ClosePosition(brokerName, symbol string)`; пустой `brokerName` → `"webull"` ради
совместимости API. Позиции читать у **этого** брокера, а не у `defaultBroker`. Отправка —
через `manualOrder`. Обработчик передаёт брокера из тела запроса.
*Тест:* Robinhood держит AAPL, Webull пуст; `ClosePosition("robinhood", "AAPL")` шлёт SELL
именно Robinhood. Второй тест: при существующем pending-SELL заявка не уходит.
*Коммит:* `fix(live): close the position on the broker that holds it, through the guard`

**T14. Ручное закрытие Robinhood — через движок, а не мимо него.** (F05)
Файл `go/internal/httpapi/robinhood.go:118-135`. Заменить `br.CloseMarket(body.Symbol)` на
`s.liveEng().ClosePosition("robinhood", body.Symbol)` (после T13).
*Тест:* ручная продажа не исполнена → автоматический сигнал выхода второй SELL не шлёт.
*Коммит:* `fix(httpapi): route manual Robinhood close through the engine guard`

**T15. Тестовые покупки создают трекер.** (S07, S08)
Файлы `go/internal/live/autotrade.go:1095-1128` (`TestBuy`) и
`go/internal/httpapi/robinhood.go:138-169` (`handleRobinhoodTestBuy`).
Обе отправки — через `manualOrder(..., source: "test_buy")`. Ограничения количества и
env-гейты (`WEBULL_ENABLE_LIVE_TEST_BUY`, `ROBINHOOD_ENABLE_LIVE_TEST_BUY`,
`testBuyQuantity`) **сохранить как есть**, они проверяются до вызова.
*Тест:* успешная тестовая покупка на каждом брокере оставляет строку в `order_trackers` с
`source == "test_buy"` и правильным именем брокера.
*Коммит:* `fix(live,httpapi): track test buys like every other submitted order`

### Волна 4 — дедлайн до сети (М4)

**T16. Чтение позиций получает контекст.** (S06)
Файл `go/internal/live/autotrade.go:432-437`. Заменить замыкание на
`func(ctx context.Context) ([]any, error) { return brokerPositions(ctx, br) }`.
*Тест:* тестовый брокер, чей `PositionsCtx` ждёт отмены контекста; окно с истёкшим
дедлайном → вызов возвращается по контексту, а не по таймауту транспорта.
*Коммит:* `fix(live): pass the execution deadline into the positions read`

**T17. Остальные подготовительные запросы T-1 внутри одного окна.** (F06 из аудита)
Файлы: `go/internal/live/telegram.go:248` (`e.t1Window(context.Background())` — принимать
контекст вызывающего), `go/internal/live/autotrade.go:500-510` (`Evaluate()` внутри
`executeWindow` — сделать вариант, принимающий `execWindow`), `autotrade.go:883-890`
(`logBalanceSnapshot` — читать счёт с контекстом или асинхронно, диагностика не должна
задерживать T-1), `go/internal/live/sizing.go:373-380` (`sizeOrder` вызывает `retryBrokerRead(e, "positions",
br.Positions)`, а тот жёстко берёт `backgroundWindow()` — пробросить окно вызывающего и
использовать `brokerPositions(ctx, br)`, как в T16).
Задача крупнее остальных. **Разбить на четыре коммита по одному файлу**, каждый со своим
тестом с медленным transport.
*Коммит (образец):* `fix(live): bound the T-1 sizing reads by the execution window`

### Волна 5 — чтобы неправильный вариант перестал компилироваться (лечим причину, не следствие)

**T18. Запретить `_ =` на записывающих методах store.** (М1)
Написать линтер-тест `go/internal/store/errcheck_test.go`: он читает исходники пакетов
`internal/live`, `internal/scheduler`, `internal/httpapi` через `go/ast` и падает, если
результат вызова метода `*store.DB`, чьё имя начинается с `Save`/`Set`/`Mark`/`Record`/
`Claim`/`Upsert`/`Prune`/`Delete`, присвоен в `_` **или** отброшен как выражение.
Разрешённые исключения перечислить явным списком в самом тесте с комментарием, почему.
`AppendAutotradeLog` — очевидный кандидат в исключения (логирование в обработчике ошибки).
*Тест:* сам по себе тест и есть проверка. Убедиться, что он падает, если временно вернуть
`_ = e.DB.SaveSettings(...)` в любом месте.
*Коммит:* `test(store): fail the build when a state-writing DB call is discarded`

**T19. Убрать «упрощённые» варианты, подставляющие брокера по умолчанию.** (М2)
Файл `go/internal/live/track.go:543-545`. Удалить `findOrderSnapshot(id)` целиком, всех
вызывающих перевести на `findOrderSnapshotOn(br, id)` (это же закрывает F04). Аналогично
проверить `defaultBroker()` во всех оставшихся местах (`rg 'defaultBroker\(\)'`) и для
каждого либо оставить с комментарием, почему дефолт здесь верен, либо заменить на явного
брокера.
*Тест:* RH-детали дают неизвестный статус, история RH содержит FILLED, Webull пуст →
восстанавливается исполнение RH.
*Коммит:* `refactor(live): drop the default-broker order lookup that lost the tracker's broker`

**T20. Единственное сравнение IBS вне пакета.** (S14, низкий приоритет)
Файл `go/internal/backtest/clean.go:164`. `lastIBS > highIBS` →
`ibssig.IsExitSignal(lastIBS, highIBS)`. Поведение не меняется, проверить это golden-тестами
бэктеста.
*Коммит:* `refactor(backtest): route the final-bar IBS exit through internal/ibs`

---

## Часть 4. Границы проверки

Что покрыто: `go/internal/providers`, `go/internal/live`, `go/internal/scheduler`,
`go/internal/httpapi`, `go/internal/store` (запись settings и сессий), `go/web/js/api.js`,
`go/web/js/app.js` (обработка ошибок), `go/internal/backtest` (только пороги IBS).

Что **не** покрыто и остаётся возможным источником тех же четырёх механизмов:

- `go/internal/webull` и `go/internal/robinhood` — низкоуровневые клиенты; проверялись
  только там, где их вызывает `internal/live`.
- Остальная часть `go/web/js/app.js` (около 5000 строк) — просмотрены пути ошибок, а не вся
  логика отображения.
- `mcp/`, `caddy/`, скрипты деплоя.
- Гонки: `go test -race ./...` в рамках этого разбора не запускался; S05 и S10 выведены из
  чтения кода. Первым делом в волне 2 стоит прогнать весь набор с `-race`.

Утверждать «больше нигде такого нет» по результатам чтения кода нельзя. T18 и T19 —
единственные задачи здесь, которые дают такое утверждение на будущее: они делают
неправильный вариант непроходимым для сборки, а не полагаются на внимательность следующего
ревью.
