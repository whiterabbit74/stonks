# Аудит паритета TS↔Go: движки бэктеста и индикаторы

Дата: 2026-09-03. Только чтение, ничего не менялось.

---

### [CRITICAL] Go трактует явный параметр `0` как "не задано" и подставляет дефолт — TS использует `0` как есть

- **TS:** `src/lib/singlePositionBacktest.ts:205-207`
  ```ts
  const lowIBS = Number(strategy.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters?.maxHoldDays ?? 30);
  ```
  и `src/lib/singlePositionBacktest.ts:204`:
  ```ts
  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
  ```
  Также `src/lib/clean-backtest.ts:69-70`: `Number(this.strategy.parameters?.lowIBS ?? 0.1)` / `highIBS`, и `clean-backtest.ts:79-82` для `maxHoldDays`, и `clean-backtest.ts:82` для `capitalUsage`: `this.strategy.riskManagement?.capitalUsage ?? 100`.
  Все — nullish coalescing (`??`): дефолт подставляется, только если значение `null`/`undefined`. Явный `0` — валидное значение и используется как есть.

- **Go:** `go/internal/backtest/single.go:49-67` (`ibsParams`, используется и в `clean.go:41`):
  ```go
  func ibsParams(strategy types.Strategy) (low, high, maxHold, initial float64) {
      low = strategy.Parameters.LowIBS
      if low == 0 { low = 0.1 }
      high = strategy.Parameters.HighIBS
      if high == 0 { high = 0.75 }
      maxHold = strategy.Parameters.MaxHoldDays
      if maxHold == 0 { maxHold = 30 }
      initial = strategy.RiskManagement.InitialCapital
      if initial == 0 { initial = 10000 }
      return
  }
  ```
  `go/internal/types/types.go:36-40,51-64`: `StrategyParameters.LowIBS/HighIBS/MaxHoldDays` и `RiskManagement.InitialCapital/CapitalUsage` — обычные `float64`, не указатели. JSON-парсер не отличает "поле отсутствует" от "поле равно 0" — оба дают `0.0`. Плюс `go/internal/backtest/clean.go:57-60`:
  ```go
  capitalUsage := strategy.RiskManagement.CapitalUsage
  if capitalUsage == 0 { capitalUsage = 100 }
  ```

- **Расхождение:** любой явно заданный `0` для `lowIBS`, `highIBS`, `maxHoldDays`, `initialCapital`, `capitalUsage` в Go молча заменяется дефолтом, а в TS используется буквально.
  - `maxHoldDays: 0` (выход в тот же день) → TS выходит немедленно на первой проверке `daysSinceEntry >= 0`; Go подставит `30` (или `riskManagement.maxHoldDays`, см. отдельную находку ниже по `clean.go:42-44`).
  - `capitalUsage: 0` (тест "не инвестировать") → TS не откроет позицию (`investmentAmount = 0` → `quantity = 0`); Go инвестирует **100% капитала**, как будто `capitalUsage` не задан.
  - `highIBS: 0` → TS выходит почти сразу же после входа при первом положительном IBS; Go использует `0.75`.
  - `initialCapital: 0` — менее вероятный кейс, но то же самое: TS запустит бэктест с нулевым капиталом (сделки не откроются, но `metrics.totalReturn` будет делить на 0→0 по обеим сторонам, тут поведение вероятно совпадёт); тем не менее семантика "0 подставляется дефолтом" отличается.

- **Эффект:** для любой конфигурации, где пользователь/UI явно передаёт `0` в одно из этих полей (крайние, но валидные бэктест-сценарии — «без ограничения по времени я хочу входить с нулевым lag» и т.п.), Go даст полностью другую сделку/другой P&L, чем TS. Так как zero-value в Go неотличим от "поле не пришло в JSON", баг воспроизводим при любой сериализации, где omitempty не используется (а `StrategyParameters`/`RiskManagement` теги `json:"lowIBS"` и т.п. без `omitempty` — то есть Go всегда десериализует `0`, если сервер получил `0` от фронтенда).

- **Фикс:** сделать поля `*float64` (или добавить отдельные `bool`/`HasX` флаги, или сентинел `NaN`) и различать "не передано" от "ноль"; либо гарантировать на границе HTTP-хендлера (`httpapi/calc.go`), что фронтенд никогда не шлёт `0` для этих полей (ненадёжно). Правильный фикс — как в TS: подставлять дефолт только при отсутствии значения, а не при `== 0`.

---

### [HIGH] `clean.go` дополнительно переопределяет `maxHoldDays` из `RiskManagement`, если `Parameters.MaxHoldDays == 0` — двойной дефолтинг, ещё сильнее расходится с TS

- **TS:** `src/lib/clean-backtest.ts:79-81`
  ```ts
  const maxHoldDays = typeof this.strategy.parameters?.maxHoldDays === 'number'
    ? this.strategy.parameters.maxHoldDays
    : (this.strategy.riskManagement?.maxHoldDays ?? 30);
  ```
  Приоритет: `parameters.maxHoldDays`, если это число (в т.ч. `0`) → иначе `riskManagement.maxHoldDays` (в т.ч. `0`, т.к. `??`) → иначе `30`.

- **Go:** `go/internal/backtest/clean.go:41-44`
  ```go
  lowIBS, highIBS, maxHoldDays, initial := ibsParams(strategy)
  if strategy.Parameters.MaxHoldDays == 0 && strategy.RiskManagement.MaxHoldDays != 0 {
      maxHoldDays = strategy.RiskManagement.MaxHoldDays
  }
  ```
  Приоритет фактически: `Parameters.MaxHoldDays`, если `!= 0` → иначе `RiskManagement.MaxHoldDays`, если `!= 0` → иначе `30` (из `ibsParams`).

- **Расхождение:** два расходящихся случая, оба разобраны в CRITICAL-находке выше, но конкретно для `clean.go`:
  1. `Parameters.maxHoldDays === 0`, `RiskManagement.maxHoldDays` не задан/0 → TS: `0`. Go: `30`.
  2. `Parameters.maxHoldDays === 0`, `RiskManagement.maxHoldDays = 15` → TS: `0` (TS смотрит только на `parameters.maxHoldDays`, если это число, и `0` — число, `riskManagement` не используется вовсе). Go: `15`. Полностью разные exit-политики.
  3. `Parameters.maxHoldDays` не задан, `RiskManagement.maxHoldDays = 0` → TS: `0` (пришло из `??`). Go: не срабатывает override (`0 != 0` ложно), maxHoldDays остаётся `30` из `ibsParams`.

- **Эффект:** `exitReason: 'max_hold_days'` будет срабатывать на разных барах или не будет срабатывать вовсе → разные `Trade.exitDate/exitPrice/pnl`.

- **Фикс:** привести Go-логику к TS один-в-один (приоритет `Parameters.MaxHoldDays` как "заданное значение", различая ноль от отсутствия — см. фикс в CRITICAL-находке).

---

### [LOW] `PositionSizing` дефолт `Value` отличается между Go DefaultIBSStrategy (100) и TS createDefaultPositionSizing (10) — подтверждено неиспользуемым полем

- **TS:** `src/lib/strategy.ts:52-57`
  ```ts
  export function createDefaultPositionSizing(): Strategy['positionSizing'] {
    return { type: 'percentage', value: 10 };
  }
  ```
- **Go:** `go/internal/types/types.go:261`
  ```go
  PositionSizing: PositionSizing{Type: "percentage", Value: 100},
  ```
- **Расхождение:** дефолтное значение `positionSizing.value` — `10` в TS против `100` в Go `DefaultIBSStrategy()`.
- **Эффект:** подтверждено грепом (`rg "positionSizing\." src/lib src/components`) — `positionSizing.value` читается ТОЛЬКО в `validatePositionSizing()` (`src/lib/strategy.ts:336-348`, чистая форм-валидация), нигде в движках расчёта (`single.go`/`clean.go`/`bac4.go`/`ema.go` и их TS-эталонах) это поле не используется — позиция везде сайзится через `capitalUsage`/`capitalUsagePerTicker` + leverage. Также `scripts/dump-go-goldens.ts:96` (генератор golden-фикстур из "боевого" TS-кода) сам использует `positionSizing: { type: 'percentage', value: 100 }` — то есть `100`, а не `10` из `createDefaultPositionSizing()`, значит `10` — дефолт лишь для одного мало используемого пути создания "пустой" стратегии, а не для реального дефолта приложения. Расхождение реально, но не искажает расчёты бэктеста. Понижаю до LOW.
- **Фикс:** синхронизировать дефолт (например, оба на `100`, как в реально используемом пути), либо явно задокументировать, что поле нигде не участвует в расчётах.

---

### [CRITICAL] EMA-zone sell-zone loop mutates the wrong lot after an earlier lot is spliced out (stale-index bug, Go-only)

- **TS:** `src/lib/ema-zone-strategy.ts:305-349`. Inside the sell-zone loop, `tickerLots` holds direct object **references** collected via `.filter()`:
  ```ts
  const tickerLots = lots.filter((lot) => lot.ticker === tickerData.ticker && !lot.closedSellZoneIds.includes(sellZone.id));
  for (const lot of [...tickerLots]) {
    ...
    lot.quantity -= quantityToClose;               // mutates the referenced object directly
    ...
    if (lot.quantity <= 0) {
      lots.splice(lots.indexOf(lot), 1);            // indexOf() re-locates by identity, immune to prior removals
    }
  }
  ```
  Removing one lot from the `lots` array never invalidates the references still held by the other entries in `tickerLots` — JS object identity, not array position, drives every subsequent access.

- **Go:** `go/internal/backtest/ema.go:438-482`. `tickerLots` instead stores **integer indices** into `lots`, captured once, before any removal in this pass:
  ```go
  var tickerLots []int
  for i, lot := range lots {
      if lot.ticker == td.ticker && !containsStr(lot.closedSellZoneIDs, sellZone.ID) {
          tickerLots = append(tickerLots, i)
      }
  }
  for _, li := range append([]int(nil), tickerLots...) {
      if li >= len(lots) { continue }
      lot := lots[li]                                  // re-reads by stale index, not by identity
      if lot.ticker != td.ticker || containsStr(lot.closedSellZoneIDs, sellZone.ID) { continue }
      ...
      lots[li].quantity -= qtyClose
      ...
      if lots[li].quantity <= 0 {
          lots = append(lots[:li], lots[li+1:]...)      // shifts every later index down by 1
      }
  }
  ```
  Compare with the take-profit loop just above it (`ema.go:399-430`) and the end-of-data closeout (`ema.go:545-571`), both of which correctly re-locate the live lot by `lots[i].id == lot.id` before mutating — the sell-zone loop is the only one of the three that uses a raw, unstabilized index.

- **Расхождение:** when a ticker has two or more concurrently open lots (the normal case with 2+ enabled buy zones — exactly what this feature is for) and a single sell-zone signal closes an earlier lot in `tickerLots` down to `quantity <= 0`, the Go slice-splice shifts every subsequent index down by one. The *next* `li` in the snapshot no longer points at the lot it was collected for:
  - If the array position it now resolves to belongs to a different ticker, the guard `lot.ticker != td.ticker` skips it — so the correct lot for **this** ticker's sell signal is silently **never closed this bar** (it sits open, its `closedSellZoneIDs` unmarked, to be picked up — correctly or not — on some later, different bar).
  - If the shifted-to position happens to be another lot of the **same** ticker (common when 3+ lots coexist for one symbol), the guard passes and the wrong lot's `entryPrice`/`quantity`/`marginUsed` get used to build the trade and to debit `cash`/`marginUsed`, while the lot that was actually supposed to close on this signal is left open and untouched.
  - TS never has this problem because `lots.splice(lots.indexOf(lot), 1)` always finds the exact object by reference.

- **Эффект:** wrong `exitDate`/`exitPrice`/`quantity`/`pnl` on EMA-zone multi-lot trades, missed or delayed exits, and portfolio cash/margin thrown off by the wrong amount — for any ticker configuration with more than one enabled buy zone (the feature's primary use case) whenever a sell-zone event fully closes one of several concurrently open lots for that ticker.

- **Фикс:** collect `tickerLots` as lot IDs (or re-resolve `lots[li].id` before use, as the TP and end-of-data loops already do), and locate the live lot by ID rather than by a cached array index before every mutation/removal, mirroring the TS `indexOf`-by-reference behavior.

---

### [HIGH] `RunOptions`/`RunMultiOptions` alias and mutate the caller's stock-trade `Context` pointer in place (Go-only); TS always allocates a new context object

- **TS:** `src/lib/optionsBacktest.ts:133-145` (entry) creates the option trade via spread — `activeTrade = { ...matchingStockTrade, optionType: 'call', ... }` — and, critically, the exit-time context update at `optionsBacktest.ts:204-212` **replaces the reference**:
  ```ts
  if (!activeTrade.context) activeTrade.context = {};
  activeTrade.context = {
      ...activeTrade.context,
      currentCapitalAfterExit: currentCapital,
      initialInvestment: cost,
      grossInvestment: cost,
      marginUsed: cost,
      netProceeds: proceeds
  };
  ```
  `activeTrade.context = {...}` binds a brand-new object; `matchingStockTrade.context` (and therefore the original `stockTrades` array element passed in by the caller) is never touched. Same pattern in `runMultiTickerOptionsBacktest` at `optionsBacktest.ts:329-337`.

- **Go:** `go/internal/backtest/options.go:115-124` copies the trade by value — `t := *matching` — but `types.Trade.Context` is a **pointer** (`*TradeContext`, `types/types.go:120`), so the copy `t.Context` is the *same pointer* as `matching.Context`, i.e. the same pointer stored in the caller's `stockTrades` slice. The exit path then mutates through that shared pointer instead of replacing it:
  ```go
  if active.Context == nil {
      active.Context = &types.TradeContext{}
  }
  active.Context.CurrentCapitalAfterExit = currentCapital
  active.Context.InitialInvestment = cost
  active.Context.GrossInvestment = cost
  active.Context.MarginUsed = cost
  active.Context.NetProceeds = proceeds
  ```
  (`options.go:166-173`). Identical pattern in `RunMultiOptions` at `options.go:271-278`, where `t := stockTrade` (a value copy from a `range` over `[]types.Trade`) still carries forward the same `Context` pointer as the original slice element.

- **Расхождение:** in Go, once an option trade derived from a given stock trade is closed, the **stock trade's own `Context`** (the one still sitting in the caller-supplied `stockTrades []types.Trade`, e.g. `RunClean(...).Trades` or `RunSinglePosition(...)`'s `trades`) gets silently overwritten with the *option* trade's `CurrentCapitalAfterExit`/`InitialInvestment`/`GrossInvestment`/`MarginUsed`/`NetProceeds` — corrupting the original stock-level trade record. TS's immutable-object-replacement pattern makes this impossible by construction.

- **Эффект:** currently **not observable** through the two live HTTP handlers (`go/internal/httpapi/calc.go:90-102`, `calcOptions`/`calcOptionsMulti`) — both decode a fresh, request-scoped `stockTrades` slice via `decodeTrades(req.Trades)` that is discarded right after the call, so nothing downstream reads the corrupted values today. But it is a live landmine: `go/internal/backtest/golden_test.go:107-131` (`TestGOOGLOptionsGolden`) calls `clean := RunClean(...)` then `RunOptions(clean.Trades, bars, ...)` and never re-inspects `clean.Trades` afterward — if a future test or endpoint asserts on the underlying stock trades *after* running the options pass (e.g. an API that returns both stock- and option-level trades from one call, or a golden test that checks `clean.Trades[i].Context.MarginUsed`), it will observe silently wrong values with no error raised. Same exposure via `TestGOOGLOptionsMultiGolden` (`golden_test.go:152-156`), which feeds `RunSinglePosition(...)`'s own `stockTrades` result straight into `RunMultiOptions`.

- **Фикс:** in both `RunOptions` and `RunMultiOptions`, allocate a fresh `*types.TradeContext` (copy the fields you need, or `ctxCopy := *matching.Context; t.Context = &ctxCopy`) before mutating it, instead of writing through the pointer inherited from the input trade — mirroring TS's `context = { ...context, ... }` reference-replacement.

---

### [MEDIUM] Same zero-vs-unset default bug in `OptionsConfig` (options engine)

- **TS:** `src/lib/optionsBacktest.ts:69` and `:247`: `const { strikePct, volAdjPct, capitalPct, riskFreeRate = 0.05, expirationWeeks = 4, maxHoldingDays = 30 } = config;` — destructuring defaults apply only when the property is `undefined`; an explicit `riskFreeRate: 0`/`expirationWeeks: 0`/`maxHoldingDays: 0` is honored as-is.
- **Go:** `go/internal/backtest/options.go:33-44`:
  ```go
  func (c OptionsConfig) defaults() OptionsConfig {
      if c.RiskFreeRate == 0 { c.RiskFreeRate = 0.05 }
      if c.ExpirationWeeks == 0 { c.ExpirationWeeks = 4 }
      if c.MaxHoldingDays == 0 { c.MaxHoldingDays = 30 }
      return c
  }
  ```
  Same instance of the CRITICAL zero-vs-unset pattern documented above, here applied to option pricing/expiration.
- **Расхождение/Эффект:** an explicit `riskFreeRate: 0` (valid in a near-zero-rate historical regime, e.g. 2011-2015 per `riskFreeRates.ts`, if a caller wants to force it rather than use the monthly table) silently becomes `0.05` in Go, shifting every Black-Scholes price. `expirationWeeks: 0`/`maxHoldingDays: 0` (edge-case configs) are likewise overridden to `4`/`30`.
- **Фикс:** same as the CRITICAL finding — use pointer/optional fields and default only on absence, not on `== 0`.

---

### [MEDIUM] `getRiskFreeRate` fallback wiring is correct, but note the per-call monthly-rate override always wins over the config default in both languages

Confirmed as matching, not a divergence: TS `getRiskFreeRate(currentDate) ?? riskFreeRate` (`optionsBacktest.ts:103,280`) and Go `rf(dateStr, cfg.RiskFreeRate)` (`options.go:46-51,93,229`) both prefer the dated monthly table over the configured/default rate, and the embedded `go/internal/optionsmath/rates.json` table was diffed byte-for-byte against `src/lib/riskFreeRates.ts`'s `RISK_FREE_RATES` (324/324 keys, all values identical to the given decimal precision) — no drift found. Listed here only so this area is marked as checked.

---

### [CRITICAL] Margin simulation: `capitalUsagePct: 0` means "invest nothing" in TS but is hard-coded to mean "invest 100%" in Go

- **TS:** `src/lib/margin-simulation.ts:55-56,75`:
  ```ts
  export function simulateMarginByTrades({ ..., capitalUsagePct = 100, ... }: SimulateMarginByTradesParams): ... {
    ...
    const usage = clamp(capitalUsagePct, 0, 100) / 100;
  ```
  Destructuring default `= 100` fires only when the field is `undefined`. An explicit `capitalUsagePct: 0` survives the clamp as `0`, so `usage = 0` and `quantity = Math.floor((cash*0*leverage)/entryPrice) = 0` — no position is ever opened.

- **Go:** `go/internal/backtest/margin.go:65-68`:
  ```go
  usage := clamp(p.CapitalUsagePct, 0, 100) / 100
  if p.CapitalUsagePct == 0 {
      usage = 1
  }
  ```
  This is not the passive zero-value gap seen elsewhere — it is an explicit, deliberate override that turns an unset/zero `CapitalUsagePct` into **100%** capital usage.

- **Расхождение:** for `capitalUsagePct: 0`, TS opens **no** position for the whole simulation (`usage = 0`); Go opens a position sized at **100% of cash** (`usage = 1`) — the two opposite extremes of the parameter's range, not a rounding-level difference.

- **Эффект:** any margin-simulation run configured (or defaulted through a code path that ends up sending `0`) with zero capital usage will show zero trades and a flat equity curve in TS, versus fully leveraged trading with real liquidation risk in Go — a complete behavioral inversion, not a numeric drift.

- **Фикс:** drop the `== 0` special case in Go; default only when the field is truly absent (pointer/optional), matching TS's `capitalUsagePct = 100` semantics which only kicks in on `undefined`.

---

### [HIGH] Margin simulation: `maintenanceMarginPct: 0` clamps to 1% in TS but defaults to 25% in Go

- **TS:** `src/lib/margin-simulation.ts:55,76-77`: `maintenanceMarginPct = 25` (undefined-only default), then `const maintenanceThreshold = clamp(maintenanceMarginPct, 1, 95);`. An explicit `0` is not defaulted away — it is clamped to the range floor, `1`.
- **Go:** `go/internal/backtest/margin.go:69-73`:
  ```go
  maint := p.MaintenanceMarginPct
  if maint == 0 { maint = 25 }
  maint = clamp(maint, 1, 95)
  ```
  An explicit `0` is replaced with `25` *before* clamping, so it never reaches the `1` floor.
- **Расхождение:** `maintenanceMarginPct: 0` yields a **1%** maintenance threshold in TS versus **25%** in Go — a nearly 25x difference in how much the position can lose before forced liquidation.
- **Эффект:** in Go, positions survive far deeper drawdowns before the `margin_liquidation` exit fires (or never fires at all in scenarios where TS would have force-closed at the 1% threshold), producing entirely different trade counts, exit prices and P&L for this edge-case config.
- **Фикс:** same pattern as above — only apply the `25` default when the field is genuinely absent (optional/pointer), not when it equals `0`; let the `[1,95]` clamp be the sole floor/ceiling, as TS does.

---

## Пробелы в тестовом покрытии

`go/internal/backtest/golden_test.go` + `go/testdata/goldens/*.json` are generated straight from the shipped TS engines by `scripts/dump-go-goldens.ts` (`manifest.json:3`: `"source": "scripts/dump-go-goldens.ts — shipped TS/JS engines"`) — a legitimate parity harness for what it covers. But every fixture in it uses the same small set of canonical, non-degenerate inputs, which is exactly why none of the findings above are caught:

1. **Every zero-default edge case is untested.** `dump-go-goldens.ts:73-98`'s `defaultStrategy()` always uses `lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30, initialCapital: 10000, capitalUsage: 100`; the margin golden (`golden_test.go:194-215`) always passes `MaintenanceMarginPct: 25, CapitalUsagePct: 100`; the options golden always passes `RiskFreeRate: 0.05, ExpirationWeeks: 4, MaxHoldingDays: 30`. None of the `== 0` vs `??`/destructuring-default divergences documented above (CRITICAL/HIGH findings on `single.go`/`clean.go`/`options.go`/`margin.go`) can ever be exercised by this suite — every one of those parameters would have to be explicitly `0` to trigger the bug, and no fixture does that.

2. **EMA-zone is only tested with one buy zone and one sell zone, producing exactly one trade.** `manifest.json:10`: `"googlEmaTrades": 1`. `golden_test.go:171-192` / `dump-go-goldens.ts:244-260` configure `BuyZones: [{buy-20}]`, `SellZones: [{sell-40}]` only. The multi-lot stale-index bug found in `ema.go:438-482` requires **two or more concurrently open lots for the same ticker** (i.e. 2+ enabled buy zones) — a configuration this suite never constructs. This is precisely why `go test ./...` passes today despite that bug.

3. **No multi-ticker scenario anywhere.** Every single/bac4/ema golden feeds exactly one ticker (`[{ticker: 'GOOGL', ...}]`, e.g. `dump-go-goldens.ts:178,187,228,245`). `RunSinglePosition`'s and `RunBuyAtClose4`'s "pick the ticker with the lowest IBS among simultaneous entry signals" tie-breaking logic (`single.go:305-322`, `bac4.go:76-106`) and the `updatePortfolioState`/`findLastBarIndexAtOrBefore` cross-ticker date-gap handling (`single.go:170-203`) have no test coverage on either side of the port at all — a real gap for the app's actual multi-ticker mode.

4. **`RunNoStopLoss`'s `time-limit` and `profit-target` exit modes are untested.** `golden_test.go:69-75` only exercises `ExitMode: "never"` and `"ibs-only"`. As noted, `profit-target` appears to be dead/inert in both TS and Go (never implements an actual take-profit inside `CleanBacktestEngine`/`RunClean`) — worth flagging to the team even though it's not a parity bug, since it's untested in a way that would hide either a fix or a regression.

5. **`leverage != 1` is essentially untested for `single.go`/`bac4.go`.** All goldens call with `leverage: 1`. Leverage-driven `marginRequired`/`totalCashRequired`/`leverageDebt` arithmetic (`single.go:324-343`, `bac4.go:87-105`) has no golden coverage at any leverage other than 1.

6. **`SingleOptions.MonthlyAmount` (recurring contributions) is completely untested** on the Go side — no golden exercises `single.go:212-228`'s month-key/contribution-day logic (`tradingdate.YMD`-based month key vs TS's `getUTCFullYear()/getUTCMonth()`), which is one of the few remaining places doing date-component arithmetic instead of pure string comparison; worth a dedicated parity test given the project's stated date-handling invariants.

7. **`CleanOptions.Splits` / `EmaParams` split-adjusted `priceBasis` paths are untested inside the backtest engines.** `splits-adjust.json` golden (`dump-go-goldens.ts:304-316`) tests `adjustOHLCForSplits`/`applyOHLCForHolderValue` in isolation, but never runs `RunClean`/`RunSinglePosition`/`RunEmaZone` *with* `options.Splits` populated end-to-end, so the `holder_value`/`split_adjusted_index` `priceBasis` branches in `ema.go`'s `rawPriceForExecution` (`ema.go:113-125`) are unexercised by any golden.

8. **`RunOptions`/`RunMultiOptions` never re-inspect the input `stockTrades` after the call** (see the HIGH aliasing finding above) — so the golden suite cannot catch the Context-pointer mutation bug even though it happens on every run of `TestGOOGLOptionsGolden`/`TestGOOGLOptionsMultiGolden`.

9. **No cross-timezone check for the Go side.** The TS suite has a dedicated `npm run test:tz` (`TZ=Pacific/Auckland` / `TZ=America/Los_Angeles`) per `CLAUDE.md`'s date-handling invariant; `manifest.json:11` records `"tz": "(unset)"` for the golden generation run, and there is no equivalent `TZ=...` matrix run for `go test` in this repo. Given the engines are pure string/UTC-midnight arithmetic this is lower risk than the TS side, but it is unverified — in particular `tradingdate.TodayNYSE`/`CurrentTimeNYSE` (`tradingdate.go:99-121`, used by the live/monitor path, outside this audit's engine scope) do depend on the host `time.Local`/`time.Now()` semantics if ever called with a naive `time.Now()` from a non-UTC host.

---

### [LOW] TS reference itself violates the project's own "no `Date` on trading dates" invariant — Go does not, and is not affected

- **TS:** `rg "new Date\(|\.getTime\(\)|getUTCFullYear|getUTCMonth" src/lib/singlePositionBacktest.ts src/lib/ema-zone-strategy.ts src/components/BuyAtClose4Simulator.tsx` turns up extensive use of `new Date(bar.date).getTime()` for the unified multi-ticker timeline (`singlePositionBacktest.ts:61,74,230,245,247,281,404,473`), the monthly-contribution month-key (`singlePositionBacktest.ts:251,257-259`, via `getUTCFullYear()/getUTCMonth()/getUTCDate()`), and lot duration in the EMA engine (`ema-zone-strategy.ts:178`). `CLAUDE.md`'s date-handling section explicitly bans `new Date(d)`/`.getTime()` on trading dates without exception for UTC-only accessors.
- **Go:** `rg "new Date\(|toISOString|getTime\(\)|time\.Parse|time\.Now" go/internal/backtest go/internal/indicators` returns **no matches** — the Go engines are pure `YYYY-MM-DD` string comparison/arithmetic throughout (`tradingdate.Compare`, `tradingdate.DaysBetween`, direct `<`/`==` on date strings), fully compliant with the invariant.
- **Расхождение:** none observable in outputs — since every date value here is an ISO date-only string (parsed by `new Date()` as UTC midnight per spec) and only ever read back through `getUTC*` accessors (never local `getFullYear()`/`getMonth()`/`getDate()`), the TS `Date`-based day-count/month-key arithmetic is numerically equivalent to Go's string arithmetic in every case checked above (confirmed for `daysSinceEntry`/`duration` — see the `DaysBetween`/`Math.floor` note under the CRITICAL findings — and for the monthly-contribution month key, both increment on the same UTC calendar boundary).
- **Эффект:** no current parity impact, but this is exactly the pattern that has caused real bugs in this codebase before (per `CLAUDE.md`'s own bug list) — a future edit to `singlePositionBacktest.ts`/`ema-zone-strategy.ts` that stops being scrupulous about `getUTC*` (e.g. adds a `.getDate()` or reads `Date.now()`/local timezone anywhere in this chain) would silently break on non-UTC hosts, and Go would then start disagreeing with a "reference" that had itself drifted. Flagging for cleanup, not as a Go bug.
- **Фикс:** none needed on the Go side. On the TS side, migrate `singlePositionBacktest.ts` and `ema-zone-strategy.ts` to `date-utils.ts` (`daysBetweenTradingDates`, string comparison for the timeline `Set`/sort) per the project's own convention, both to close this compliance gap and to remove the temptation for a future edit to introduce a genuine local-timezone bug.

---

## Итог

Все находки основаны на построчном сравнении файлов, указанных в задании; в каждой находке приведены точные номера строк обеих сторон. `go test ./...` зелёный (см. раздел "Пробелы в тестовом покрытии" — golden-тесты сгенерированы из боевого TS-кода, но покрывают только канонические, невырожденные входные данные, поэтому ни одна из находок ниже не ловится существующим тестовым набором).
