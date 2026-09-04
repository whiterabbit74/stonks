# Inventory

Live app map. Goldens: `testdata/goldens/` — do not hand-edit trade lists.

## Pages

| Route | Notes |
|---|---|
| `/login` | email, password, remember, POST `/api/login` |
| `/` | → `/data` |
| `/data` | CSV/JSON import, dataset library |
| `/enhance` | fetch from providers |
| `/results` | → `/stocks` |
| `/stocks` | multi-ticker + tabs: price, tickerCharts, equity, exposure, drawdown, trades, profit, duration, monthlyContribution, splits, buyhold, openDayDrawdown, buyAtClose, buyAtClose4, noStopLoss, options |
| `/ema` | EMA zone, `POST /api/calc/ema-zone` |
| `/multi-ticker-options` | `POST /api/calc/options-multi` |
| `/calendar` | trading calendar |
| `/split` | splits |
| `/watches` | Telegram monitoring |
| `/broker` | Webull cabinet |
| `/settings` | app config |

Nav (desktop): Данные, Акции, EMA, Опционы, Календарь, Сплиты, Мониторинг, Брокер. Settings via icon. Copy is Russian. Theme: `html.dark`, Inter + JetBrains Mono.

SPA must not reimplement engines. Math goes through `/api/calc/*` or the same Go packages.

## Engines

| Package | What |
|---|---|
| `internal/tradingdate` | `YYYY-MM-DD`, Parse, TodayNYSE, ChartTimestamp |
| `internal/ibs` | `IsEntrySignal` / `IsExitSignal` |
| `internal/indicators` | SMA/EMA/RSI/IBS |
| `internal/splits` | adjust / detect / holder |
| `internal/backtest` | Clean, Full, Single, Options, EMA, BAC, BAC4, margin, buy-hold |
| `internal/optionsmath` | Black–Scholes, risk-free rates |
| `internal/metrics` | Sharpe, CAGR, drawdown, stats |
| `internal/live` | monitor + autotrade |
| `internal/webull` | HMAC OpenAPI |
| `internal/providers` | AV / Finnhub / Twelve / Polygon |
| `internal/store` | SQLite |
| `internal/scheduler` | T-11 / T-1 / after-close |
| `internal/httpapi` | mux |

## `/api`

Public (no session): `GET /api/status`, `GET /api/auth/check`, `GET /api/trading-calendar`, `GET /api/trading/expected-prev-day`, `POST /api/login`, `POST /api/logout`.

Everything else 401 without `auth_token` cookie or `Authorization: Bearer <32-hex>` when `ADMIN_PASSWORD` is set.

Auth: `POST /api/login`, `GET /api/auth/check`, `POST /api/logout`, `POST /api/auth/hash-password` (protected).

Settings: `GET/PUT/PATCH /api/settings`.

Datasets: `GET /api/datasets`, `GET /api/datasets/{id}`, `GET /api/datasets/{id}/metadata`, `POST /api/datasets`, `PUT /api/datasets/{id}`, `DELETE /api/datasets/{id}`, `POST /api/datasets/{id}/refresh`, `POST /api/datasets/{id}/apply-splits`, `PATCH /api/datasets/{id}/metadata`.

Splits: `GET /api/splits/webull-raw`, `GET /api/splits`, `GET/PUT/PATCH /api/splits/{symbol}`, `DELETE /api/splits/{symbol}/{date}`, `DELETE /api/splits/{symbol}`.

Calendar: `GET /api/trading-calendar`, `GET /api/trading/expected-prev-day`, `POST /api/trading-calendar/sync-webull`, `POST /api/trading-calendar/import-webull`, `PATCH /api/trading-calendar/day`.

Telegram: `POST /api/telegram/watch`, `DELETE/PATCH /api/telegram/watch/{symbol}`, `GET /api/telegram/watches`, `GET/POST /api/telegram/ema-alerts`, `PATCH/DELETE /api/telegram/ema-alerts/{id}`, `POST /api/telegram/send`, `POST /api/telegram/test`, `GET /api/telegram/trades`, `POST /api/telegram/simulate`, `POST /api/telegram/actualize-prices`, `POST /api/telegram/update-positions`, `POST /api/telegram/update-all`, `POST /api/telegram/command`.

Monitor trades: `GET/POST /api/trades`, `PATCH /api/trades/{id}`, `POST /api/trades/{id}/close-monitor`, `DELETE /api/trades/{id}`.

Broker trades: `GET/POST /api/broker-trades`, `PATCH/DELETE /api/broker-trades/{id}`.

Monitor reconcile: `GET /api/monitor/consistency`, `POST /api/monitor/reconcile`.

Quotes: `GET /api/quote/{symbol}`, `GET /api/quotes/webull-batch`, `GET /api/yahoo-finance/{symbol}`, `GET /api/fetch/{provider}/{symbol}`, `GET /api/test/alpha-vantage`, `GET /api/test/finnhub`, `GET /api/test/twelve-data`, `POST /api/test-provider`.

Autotrade: `GET/PATCH /api/autotrade/config`, `GET /api/autotrade/status`, `POST /api/autotrade/evaluate`, `POST /api/autotrade/execute`, `GET /api/autotrade/webull/account`, `GET /api/autotrade/webull/dashboard`, `GET /api/autotrade/logs`, `POST /api/autotrade/webull/close-position`, `POST /api/autotrade/webull/test-buy`, `POST /api/autotrade/webull/token/create`, `POST /api/autotrade/webull/token/check`, `PUT /api/autotrade/webull/token`, `GET /api/autotrade/webull/token/status`.

Calc: `POST /api/calc/clean-backtest`, `backtest`, `single-position`, `options`, `options-multi`, `ema-zone`, `buy-at-close`, `buy-at-close-4`, `no-stop-loss`, `metrics`, `indicators`, `black-scholes`, `split-adjust`, `margin`, `ibs-signals`, `buy-hold`.

## Scheduler (`internal/scheduler`, ~20s tick, America/New_York)

| Job | When |
|---|---|
| token health | every tick, including holidays |
| skip market jobs | not a trading day |
| Telegram T-11 | minutesUntilClose in [10,12] |
| Telegram T-1 | minutesUntilClose in [0,2] |
| price actualization | minutesAfterClose in [15,31] |

Local run does not place broker orders.

## SQLite

`dataset_meta`, `ohlc`, `splits`, `trades`, `calendar`, `sessions`, `broker_trades`, `telegram_watches`, `telegram_ema_alerts`, `webull_token`. WAL + foreign_keys. `modernc.org/sqlite`, `SetMaxOpenConns(1)`.

## Charts

Lightweight Charts v5 standalone in `web/vendor/`. `RIGHT_OFFSET: 8`. Time is `{year,month,day}` from `YYYY-MM-DD` (no `Date`). IBS pane percent 0–100, dotted 10/75.
