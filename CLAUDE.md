# CLAUDE.md

## Коммит после каждого изменения

После каждого **завершённого** изменения сразу делай `git commit`. Не спрашивай разрешения и не копи правки до конца сессии.

- Один логический фикс = один коммит. Не смешивай несвязанные изменения.
- Сообщение: что сделано, в том же стиле, что история репозитория.
- Не коммитить, пока изменение не работает (красные тесты, сломанная сборка) или дерево чистое.
- Не пушить, пока явно не попросили.
- В ответе пользователю всегда пиши короткий хэш коммита (`git rev-parse --short HEAD`), например: `коммит abc1234`.

## Project Overview

Go trading-strategy backtester with a vanilla JS SPA (`go/web`). Historical OHLC, IBS mean-reversion, live Telegram monitoring, Webull autotrade. Production is this Go process behind Caddy. There is no React or Express stack.

### Trading Workflow Ground Rules

- Execute trades **only at the official session close**.
- **Eleven minutes before the close (T-11)** send the overview: the current IBS readings for all
  monitored tickers and the ticker that would be picked if the session ended now. This stage is
  informational and places no orders.
- **One minute before the close (T-1)** capture the IBS readings again and base entry and exit
  decisions on *these* values — the ones taken at T-1, not the T-11 preview. Orders go out in the
  same T-1 cycle.
- At the close select the instrument with the **lowest IBS strictly below the entry threshold** (`lowIBS`, default `0.10` = 10%) from the monitoring list; if no ticker meets the threshold, skip the trade.
- **Hold the position until it is fully closed**, then you may re-enter later the same day provided the above conditions are met again.
- **Thresholds are strict on both sides:** entry `ibs < lowIBS`, exit `ibs > highIBS`, exactly as the backtest does it. An IBS of exactly `0.10` is not an entry. Monitor and autotrader must go through `ibs.IsEntrySignal` / `ibs.IsExitSignal` in `go/internal/ibs` so the live thresholds cannot drift away from the backtest.

### Core Invariants (do not violate)

- **Даты без времени и без таймзон.** Полное объяснение — раздел [«Даты: почему в проекте нет таймзон»](#даты-почему-в-проекте-нет-таймзон). Торговая дата — строка `YYYY-MM-DD`. `time.Time` в этих путях не появляется, кроме явной биржевой зоны на wall-clock.
- **Commit changes.** Every completed change is committed locally (do not push/deploy unless explicitly asked). Commit messages end with the `Co-Authored-By` trailer used across the history.

## Даты: почему в проекте нет таймзон

Мы работаем с **дневными барами одной биржи**. Дневной бар — не отрезок времени и не момент, а **идентификатор торговой сессии**: «17 ноября 2024 на NYSE». Такой же ярлык, как номер рейса. У него нет часа, минуты и смещения — он либо есть в календаре биржи, либо нет. Всё остальное (сделки, equity, просадки, сплиты, календарь, стейт монитора) навешено на этот же ярлык.

Календарь один — биржевой. Провайдеры отдают бары уже помеченными датой сессии. Переводить дату сессии куда-то — как переводить номер рейса в другую таймзону.

Как только календарный день превращают в момент времени:

1. Парсер **домысливает время** — полночь. Времени в исходных данных не было.
2. Домысливает и зону: `YYYY-MM-DD` как полночь UTC, локальный конструктор — как полночь машины.
3. Любое последующее чтение локальных частей даты добавляет **вторую** зону.

Дата сдвигается на день на разнице этих двух выдуманных зон. Полночь стоит на границе суток, поэтому любое ненулевое смещение её перебрасывает. Сдвиг зависит от машины. Информации такое преобразование не добавляет.

**Между «дата пришла» и «дата показана пользователю» она не должна ни разу становиться `time.Time` / JS `Date`.** Строка `'2024-11-17'` уже полна. Сравнение, разница в днях, сортировка, отображение, ключ — всё на строках.

### Жёсткие правила

1. **Тип.** Торговая дата — строка `'YYYY-MM-DD'`. Бары, сделки, equity, сплиты, календарь, стейт монитора, API-контракты.
2. **Никакого времени суток** в данных, в логике и в UI. Если появились часы — это либо не торговая дата, либо ошибка.
3. **Все операции — через `go/internal/tradingdate`:**
   - показать: `FormatDisplay`
   - сравнить: `Compare` (или напрямую `<`, `>`, `==` — лексикографический порядок `YYYY-MM-DD` совпадает с хронологическим)
   - разница и арифметика: `DaysBetween`, `AddDays`, `DayOfWeek`
   - сегодняшняя дата биржи: `TodayNYSE`
   - для lightweight-charts: `ChartTimestamp` (UTC noon)
   В SPA — те же правила: строка, без `new Date(d)` на торговой дате.
   Нужной функции нет — добавь её в `tradingdate`, а не пиши `time.Time` по месту.
4. **Запрещено на торговой дате:** `time.Parse` без явной UTC/NY зоны как способ «получить день», JS `new Date(d)` / `Date.parse` / `.toISOString()` / `.toLocaleDateString()` / локальные `getFullYear`/`getMonth`/`getDate`.
5. **Парсинг входных данных** (CSV, ответы провайдеров) сразу даёт строку `YYYY-MM-DD`. Дата правильного вида с невозможным днём (`2024-02-30`) **отвергается**. Образец — `tradingdate.Parse`.
6. Если `time.Time` неизбежен (внешний API), зона фиксируется явно: UTC midnight/`Date.UTC` на границе, обратно только UTC-поля. Сравнивать даты — строками.
7. UTC-полдень допустим только как формат обмена с lightweight-charts (`ChartTimestamp`). Внутри логики дата остаётся строкой.

### Единственное исключение: настоящее wall-clock время

Время суток нужно ровно там, где вопрос про часы:

- сколько минут осталось до закрытия сессии (T-11, T-1);
- во сколько было принято решение о входе/выходе;
- «обновлено в» для котировки или датасета.

- Зона указывается **явно**: `America/New_York` (`tradingdate.NYZone`). Никогда не полагаемся на зону машины и не подставляем UTC «потому что сервер в UTC».
- «Какой сейчас торговый день» — `TodayNYSE`, а **не** UTC-день от `time.Now()`. Разница вылезает вечером по Нью-Йорку, когда в UTC уже следующий день.

### Как проверять

- `cd go && TZ=Pacific/Auckland go test ./...` и `TZ=America/Los_Angeles go test ./...`. Разница между зонами — баг.
- Тесты не должны утверждать локальные части `time.Time`. Проверяй строку-дату или UTC-поля.
- Быстрый grep: `rg "time.Parse|new Date\(|toISOString|toLocaleDateString" go --glob '!*_test.go'`. Каждое место — либо wall-clock с явной биржевой зоной, либо явно зафиксированный UTC на границе с внешним API.

## Architecture

```
go/cmd/server          HTTP process (API + SPA)
go/internal/httpapi    mux, auth, calc, live handlers
go/internal/backtest   IBS / EMA / options / simulators
go/internal/ibs        entry/exit thresholds
go/internal/live       monitor + autotrade
go/internal/store      SQLite (modernc.org/sqlite, WAL, MaxOpenConns=1)
go/internal/providers  AlphaVantage, Finnhub, TwelveData, Polygon
go/internal/webull     HMAC OpenAPI client
go/internal/scheduler  T-11 / T-1 / after-close jobs
go/web                 vanilla SPA (js/app.js, charts.js)
mcp/                   YouTube transcribe MCP (separate binary)
caddy/                 TLS reverse proxy
```

UI language is Russian. Brand: **Trading strategies**. Charts: Lightweight Charts v5, house `RIGHT_OFFSET: 8`, IBS pane 0–100 with dotted 10/75.

Local: `cd go && go test ./... && go run ./cmd/server` → `:8080` (override `PORT`). Auth: `ADMIN_PASSWORD=test` (empty password disables auth only outside production). SQLite default: `go/data/trading.db`.

## Deploy

`./deploy.sh` cross-compiles linux/amd64, packs `docker/go.runtime.Dockerfile`, loads the image on the VPS. The VPS never runs `go build` for the trading server. Compose `server` is image-only.

Do not push or deploy unless explicitly asked.

## Environment

Secrets live in `/home/ubuntu/stonks-config/.env` on the VPS (`chmod 600`). Template: `.env.example`. See `ENVIRONMENT.md`.
