# Trading Calculations Dedup And Explicit Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make price preparation, split handling, metrics, EMA backtests, and EMA alerts calculate from one stable source of truth without automatic split guessing and without breaking live monitoring/trading behavior.

**Architecture:** First freeze current behavior with regression tests and fixture data. Then introduce one explicit market-series preparation layer for raw, split-adjusted, and holder-value prices, and migrate consumers to it gradually. Live monitoring, Telegram alerts, and auto-trading are handled last after the calculation layer is verified.

**Tech Stack:** TypeScript, React, Vitest, Node.js, Express, better-sqlite3, lightweight-charts.

---

## Terms

- **Split:** stock split, for example 2:1. Historical raw prices before the split must be transformed for continuous calculations.
- **Raw OHLC:** real open/high/low/close prices as traded on that day.
- **Split-adjusted:** historical prices adjusted backward so chart history is continuous.
- **Holder-value:** forward continuous index price. One old share grows through splits, so raw close is multiplied by cumulative split factor.
- **EMA:** exponential moving average, a smoothed average where recent candles have more weight.
- **PnL:** profit and loss, the absolute trade result.
- **Equity curve:** capital curve over time.
- **DRY:** "Don't Repeat Yourself", meaning one calculation should live in one place, not be copied.

## Current Data Findings

Local server data currently does **not** contain QQQ/TQQQ:

- `server/datasets` has only `GOOGL.json`.
- `server/db/trading.db` has only `GOOGL` in `dataset_meta` and `ohlc`.
- `server/splits.json` is `{}` and the SQLite `splits` table is empty.

Local research/export data exists here:

- `/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/qqq_ohlcv_1999-11-01_2026-05-08.csv`
- `/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ohlcv_2010-02-11_2026-05-06.csv`
- `/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_daily_prices_2023-09-12_2026-05-28.csv`
- `/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ema200_relative_daily.csv`

Important conclusion:

- `qqq_ohlcv_1999-11-01_2026-05-08.csv` is raw/unadjusted for the 2000 split. Around `2000-03-20`, close/open ratio is about `2.0`, and `adjClose` equals `close`, so it is not a reliable adjusted column.
- `tqqq_ohlcv_2010-02-11_2026-05-06.csv` looks raw/unadjusted for known TQQQ splits through `2022-01-13`. It also contains a suspicious 2:1-looking discontinuity around `2025-08-29`; do not convert that into a split automatically.
- `tqqq_daily_prices_2023-09-12_2026-05-28.csv` looks like a site/provider-adjusted export: prices are continuous around late August 2025 and around the official TQQQ 2:1 split effective before market open on `2025-11-20`. If this is the production-site export, treat it as already adjusted for its own date range and do not apply old 2011-2022 splits on top of it.
- `tqqq_ema200_relative_daily.csv` is already a holder-value EMA fixture. It has `raw_close`, `holder_value_price`, `ema200`, and `pct_vs_ema200`. It is good for validation, but not enough as the main app dataset because it has no open/high/low needed for charts and intraday/take-profit logic.

Explicit split events to seed for these local files:

```ts
export const QQQ_SPLITS = [
  { date: '2000-03-20', factor: 2 },
] as const;

export const TQQQ_SPLITS = [
  { date: '2011-02-25', factor: 2 },
  { date: '2012-05-11', factor: 2 },
  { date: '2014-01-24', factor: 2 },
  { date: '2017-01-12', factor: 2 },
  { date: '2018-05-24', factor: 3 },
  { date: '2021-01-21', factor: 2 },
  { date: '2022-01-13', factor: 2 },
] as const;
```

For QQQ/TQQQ, no external split provider is needed if the production export is already adjusted/continuous. If importing truly raw full-history TQQQ data, use the explicit site split table above, and add any later split only from an explicit corporate-action source/manual confirmation. Do not rely on automatic OHLC gap detection.

---

## Implementation Order

The order is intentional:

1. Add tests and fixtures first.
2. Remove automatic split guessing from production paths.
3. Unify market data preparation.
4. Unify display/metrics where no live trading state is touched.
5. Fix EMA backtest edge cases.
6. Update Telegram EMA alerts.
7. Touch live monitoring/trading integration last, and only with regression tests.

---

### Task 1: Freeze Current Critical Behavior With Tests

**Why:** Before refactoring, we need a safety net. This prevents breaking TQQQ 15->40, split math, table labels, and alert cycles while removing duplicated logic.

**Files:**

- Create: `src/lib/__tests__/fixtures/split-fixtures.ts`
- Modify: `src/lib/__tests__/utils.test.ts`
- Modify: `src/lib/__tests__/ema-zone-strategy.test.ts`
- Modify: `server/src/services/__tests__/emaAlerts.test.js`

- [ ] **Step 1: Add explicit fixture constants**

Create `src/lib/__tests__/fixtures/split-fixtures.ts`:

```ts
import type { OHLCData, SplitEvent } from '../../../types';

export const qqqRawSplitSample: OHLCData[] = [
  { date: '2000-03-17', open: 216, high: 222.1, low: 215.9, close: 221.6, adjClose: 221.6, volume: 15711200 },
  { date: '2000-03-20', open: 111, high: 111.5, low: 106.3, close: 107.7, adjClose: 107.7, volume: 10583600 },
  { date: '2000-03-21', open: 106.1, high: 111.9, low: 103.6, close: 111.8, adjClose: 111.8, volume: 33435100 },
];

export const qqqSplits: SplitEvent[] = [
  { date: '2000-03-20', factor: 2 },
];

export const tqqqSplits: SplitEvent[] = [
  { date: '2011-02-25', factor: 2 },
  { date: '2012-05-11', factor: 2 },
  { date: '2014-01-24', factor: 2 },
  { date: '2017-01-12', factor: 2 },
  { date: '2018-05-24', factor: 3 },
  { date: '2021-01-21', factor: 2 },
  { date: '2022-01-13', factor: 2 },
];
```

- [ ] **Step 2: Add split math regression tests**

Modify `src/lib/__tests__/utils.test.ts` to assert explicit split behavior:

```ts
import { qqqRawSplitSample, qqqSplits } from './fixtures/split-fixtures';

it('uses explicit QQQ split events instead of guessing from price gaps', () => {
  const adjusted = adjustOHLCForSplits(qqqRawSplitSample, qqqSplits);
  expect(adjusted[0].close).toBeCloseTo(110.8, 6);
  expect(adjusted[1].close).toBeCloseTo(107.7, 6);

  const holder = applyOHLCForHolderValue(qqqRawSplitSample, qqqSplits);
  expect(holder[0].close).toBeCloseTo(221.6, 6);
  expect(holder[1].close).toBeCloseTo(215.4, 6);
  expect(holder[2].close).toBeCloseTo(223.6, 6);
  expect(holder[2].splitFactor).toBe(2);
});
```

- [ ] **Step 3: Add EMA strategy fixture expectations**

Keep the existing optional real-data fixture test and make sure it remains the canonical TQQQ 15->40 regression:

```bash
TQQQ_EMA200_RELATIVE_CSV='/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ema200_relative_daily.csv' npm run test:run -- src/lib/__tests__/ema-zone-tqqq-fixture.test.ts
```

Expected:

```text
PASS src/lib/__tests__/ema-zone-tqqq-fixture.test.ts
17 trades
final capital close to 9766459.19
contains 2020-09-23 -> 2020-10-12
```

- [ ] **Step 4: Add server EMA alert regression for explicit split dependency**

Modify `server/src/services/__tests__/emaAlerts.test.js` with a test that stubs one stored split and confirms `detectSplitsFromOHLC` is not called for production alert evaluation after Task 7:

```js
it('evaluates EMA alerts from explicit stored splits only', async () => {
  const env = withTempDb();
  try {
    const emaAlerts = loadEmaAlerts({ currentPrice: 107.7 });
    const alert = emaAlerts.createEmaAlert({
      symbol: 'QQQ',
      emaPeriod: 20,
      buyLevelPct: 15,
      sellLevelPct: 40,
      nextAction: 'buy',
      thresholdPct: 0.5,
    });

    const [result] = await emaAlerts.evaluateEmaAlerts();
    expect(result.id).toBe(alert.id);
    expect(result.priceBasis).toBe('holder_value');
  } finally {
    env.restore();
  }
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:run -- src/lib/__tests__/utils.test.ts src/lib/__tests__/ema-zone-strategy.test.ts server/src/services/__tests__/emaAlerts.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/__tests__/fixtures/split-fixtures.ts src/lib/__tests__/utils.test.ts src/lib/__tests__/ema-zone-strategy.test.ts server/src/services/__tests__/emaAlerts.test.js
git commit -m "test: lock split and EMA calculation behavior"
```

---

### Task 2: Create One Explicit Market-Series Preparation Module

**Why:** Right now raw data, split-adjusted data, holder-value data, and split merging are spread across loaders and server alert code. This creates duplicated math and different results between pages.

**Files:**

- Create: `src/lib/market-data-series.ts`
- Create: `src/lib/__tests__/market-data-series.test.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Create the shared TypeScript module**

Create `src/lib/market-data-series.ts`:

```ts
import type { OHLCData, SplitEvent } from '../types';
import { adjustOHLCForSplits, applyOHLCForHolderValue, dedupeDailyOHLC, mergeSplitEvents } from './utils';

export interface PrepareMarketSeriesInput {
  data: OHLCData[];
  explicitSplits?: SplitEvent[];
  embeddedSplits?: SplitEvent[];
  adjustedForSplits?: boolean;
}

export interface PreparedMarketSeries {
  rawData: OHLCData[];
  adjustedData: OHLCData[];
  holderData: OHLCData[];
  splits: SplitEvent[];
  priceBasis: 'raw' | 'split_adjusted_index' | 'holder_value';
}

export function prepareMarketSeries(input: PrepareMarketSeriesInput): PreparedMarketSeries {
  const rawData = dedupeDailyOHLC(input.data ?? []);
  const splits = mergeSplitEvents(input.explicitSplits, input.embeddedSplits);

  if (input.adjustedForSplits) {
    const adjustedData = rawData.map((bar) => ({
      ...bar,
      priceBasis: 'split_adjusted_index' as const,
    }));
    return {
      rawData,
      adjustedData,
      holderData: adjustedData,
      splits,
      priceBasis: 'split_adjusted_index',
    };
  }

  const adjustedData = dedupeDailyOHLC(adjustOHLCForSplits(rawData, splits)).map((bar) => ({
    ...bar,
    priceBasis: splits.length ? 'split_adjusted_index' as const : 'raw' as const,
  }));

  const holderData = applyOHLCForHolderValue(rawData, splits);

  return {
    rawData,
    adjustedData,
    holderData,
    splits,
    priceBasis: splits.length ? 'holder_value' : 'raw',
  };
}
```

- [ ] **Step 2: Keep automatic detection out of the new module**

Do not import or call `detectSplitsFromOHLC` in `src/lib/market-data-series.ts`.

Expected check:

```bash
rg -n "detectSplitsFromOHLC" src/lib/market-data-series.ts
```

Expected:

```text
no matches
```

- [ ] **Step 3: Add unit tests**

Create `src/lib/__tests__/market-data-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { prepareMarketSeries } from '../market-data-series';
import { qqqRawSplitSample, qqqSplits } from './fixtures/split-fixtures';

describe('prepareMarketSeries', () => {
  it('builds raw, adjusted, and holder-value series from explicit splits', () => {
    const result = prepareMarketSeries({
      data: qqqRawSplitSample,
      explicitSplits: qqqSplits,
      adjustedForSplits: false,
    });

    expect(result.splits).toEqual(qqqSplits);
    expect(result.rawData[0].close).toBe(221.6);
    expect(result.adjustedData[0].close).toBeCloseTo(110.8, 6);
    expect(result.holderData[1].close).toBeCloseTo(215.4, 6);
    expect(result.holderData[2].splitFactor).toBe(2);
  });

  it('does not re-apply splits to already adjusted datasets', () => {
    const result = prepareMarketSeries({
      data: qqqRawSplitSample,
      explicitSplits: qqqSplits,
      adjustedForSplits: true,
    });

    expect(result.adjustedData[0].close).toBe(221.6);
    expect(result.holderData[0].priceBasis).toBe('split_adjusted_index');
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/lib/__tests__/market-data-series.test.ts src/lib/__tests__/utils.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/market-data-series.ts src/lib/__tests__/market-data-series.test.ts src/lib/__tests__/utils.test.ts
git commit -m "feat: add explicit market series preparation"
```

---

### Task 3: Remove Automatic Split Detection From Production Frontend Paths

**Why:** Automatic split detection from OHLC gaps is unsafe. It can treat market crashes/gaps as corporate actions, and it makes results change silently.

**Files:**

- Modify: `src/hooks/useMultiTickerData.ts`
- Modify: `src/stores/index.ts`
- Modify: `src/components/BuyAtClose4Simulator.tsx`
- Modify: `src/lib/__tests__/utils.test.ts`
- Create: `src/lib/__tests__/frontend-market-series-usage.test.ts`

- [ ] **Step 1: Update multi-ticker loader**

Replace the manual split/detect block in `src/hooks/useMultiTickerData.ts` with `prepareMarketSeries`.

Target shape:

```ts
import { prepareMarketSeries } from '../lib/market-data-series';
```

```ts
const rawData = dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
const series = prepareMarketSeries({
  data: rawData,
  explicitSplits: splits,
  embeddedSplits: Array.isArray((ds as any).splits) ? (ds as any).splits : [],
  adjustedForSplits: Boolean((ds as any).adjustedForSplits),
});

processedData = series.adjustedData;
holderData = series.holderData;
```

Do not call `detectSplitsFromOHLC`.

- [ ] **Step 2: Update single-ticker store load path**

In `src/stores/index.ts`, replace repeated `dedupeDailyOHLC(adjustOHLCForSplits(...))` blocks with `prepareMarketSeries`.

Target behavior:

```ts
const series = prepareMarketSeries({
  data: dataset.data as OHLCData[],
  explicitSplits: splits,
  embeddedSplits: Array.isArray((dataset as any).splits) ? (dataset as any).splits : [],
  adjustedForSplits: Boolean((dataset as any).adjustedForSplits),
});

set({
  marketData: series.adjustedData,
  currentDataset: dataset,
  currentSplits: series.splits,
  lastAppliedSplitsKey: series.splits.length ? JSON.stringify(series.splits) : null,
  error: null,
});
```

- [ ] **Step 3: Update BuyAtClose4 simulator loader**

In `src/components/BuyAtClose4Simulator.tsx`, use `prepareMarketSeries` instead of local split adjustment.

Expected behavior:

```ts
processedData = prepareMarketSeries({
  data: ds.data as unknown as OHLCData[],
  explicitSplits: splits,
  embeddedSplits: Array.isArray((ds as any).splits) ? (ds as any).splits : [],
  adjustedForSplits: Boolean((ds as any).adjustedForSplits),
}).adjustedData;
```

- [ ] **Step 4: Move automatic detection tests out of production expectations**

In `src/lib/__tests__/utils.test.ts`, keep a test for `detectSplitsFromOHLC` only if it is explicitly described as a diagnostic/manual suggestion helper. Do not let production loaders depend on it.

Expected test name:

```ts
it('can suggest a possible split for manual review but production loaders do not rely on this', () => {
  expect(detectSplitsFromOHLC(qqqRawSplitSample)).toEqual([{ date: '2000-03-20', factor: 2 }]);
});
```

- [ ] **Step 5: Add static no-detection test**

Create `src/lib/__tests__/frontend-market-series-usage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('frontend market series usage', () => {
  it('does not call automatic split detection from production loaders', () => {
    const files = [
      'src/hooks/useMultiTickerData.ts',
      'src/stores/index.ts',
      'src/components/BuyAtClose4Simulator.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('detectSplitsFromOHLC(');
    }
  });
});
```

- [ ] **Step 6: Run focused tests**

```bash
npm run test:run -- src/lib/__tests__/market-data-series.test.ts src/lib/__tests__/frontend-market-series-usage.test.ts src/lib/__tests__/utils.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useMultiTickerData.ts src/stores/index.ts src/components/BuyAtClose4Simulator.tsx src/lib/__tests__/frontend-market-series-usage.test.ts src/lib/__tests__/utils.test.ts
git commit -m "refactor: use explicit split series in frontend loaders"
```

---

### Task 4: Add Explicit Local QQQ/TQQQ Import And Split Seeding

**Why:** The app cannot calculate QQQ/TQQQ correctly unless the OHLC rows and explicit splits are in the server database. The local CSVs are raw, so importing them without split events would produce wrong charts, EMA, and PnL.

**Files:**

- Create: `server/scripts/import-local-market-data.js`
- Create: `server/src/services/localMarketDataFixtures.js`
- Modify: `server/package.json`
- Test manually with SQLite queries.

- [ ] **Step 1: Add explicit fixture metadata**

Create `server/src/services/localMarketDataFixtures.js`:

```js
const LOCAL_MARKET_DATA_FIXTURES = {
  QQQ: {
    csvPath: '/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/qqq_ohlcv_1999-11-01_2026-05-08.csv',
    adjustedForSplits: false,
    splits: [
      { date: '2000-03-20', factor: 2 },
    ],
  },
  TQQQ: {
    csvPath: '/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ohlcv_2010-02-11_2026-05-06.csv',
    adjustedForSplits: false,
    splits: [
      { date: '2011-02-25', factor: 2 },
      { date: '2012-05-11', factor: 2 },
      { date: '2014-01-24', factor: 2 },
      { date: '2017-01-12', factor: 2 },
      { date: '2018-05-24', factor: 3 },
      { date: '2021-01-21', factor: 2 },
      { date: '2022-01-13', factor: 2 },
    ],
  },
};

module.exports = { LOCAL_MARKET_DATA_FIXTURES };
```

- [ ] **Step 2: Add import mode selection**

Before writing the importer, choose the correct source mode:

```js
// Use this for production-site exports that are already continuous/adjusted.
const TQQQ_SITE_EXPORT = {
  csvPath: '/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_daily_prices_2023-09-12_2026-05-28.csv',
  adjustedForSplits: true,
  splits: [],
};

// Use this only for raw full-history OHLC exports.
const TQQQ_RAW_FULL_HISTORY = {
  csvPath: '/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ohlcv_2010-02-11_2026-05-06.csv',
  adjustedForSplits: false,
  splits: LOCAL_MARKET_DATA_FIXTURES.TQQQ.splits,
};
```

Acceptance rule:

```text
If prices are continuous around split dates, import as adjustedForSplits=true and do not apply split rows.
If prices show raw split gaps, import as adjustedForSplits=false and apply only explicit split rows.
```

- [ ] **Step 3: Add import script**

Create `server/scripts/import-local-market-data.js`:

```js
const fs = require('fs');
const path = require('path');
const { getDb } = require('../src/db');
const { upsertTickerSplits } = require('../src/services/splits');
const { LOCAL_MARKET_DATA_FIXTURES } = require('../src/services/localMarketDataFixtures');

function parseCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',');
  return lines.map((line) => {
    const parts = line.split(',');
    const row = Object.fromEntries(headers.map((header, index) => [header, parts[index]]));
    return {
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      adj_close: Number(row.adjClose ?? row.adj_close ?? row.close),
      volume: Number(row.volume || 0),
    };
  }).filter((row) => row.date && Number.isFinite(row.close));
}

function importSymbol(symbol) {
  const fixture = LOCAL_MARKET_DATA_FIXTURES[symbol];
  if (!fixture) throw new Error(`Unknown symbol: ${symbol}`);
  if (!fs.existsSync(fixture.csvPath)) throw new Error(`CSV not found: ${fixture.csvPath}`);

  const rows = parseCsv(fixture.csvPath);
  if (!rows.length) throw new Error(`No rows parsed for ${symbol}`);

  const db = getDb();
  const insertMeta = db.prepare(`
    INSERT INTO dataset_meta
    (ticker, name, upload_date, data_points, date_from, date_to, adjusted_for_splits, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker) DO UPDATE SET
      name = excluded.name,
      upload_date = excluded.upload_date,
      data_points = excluded.data_points,
      date_from = excluded.date_from,
      date_to = excluded.date_to,
      adjusted_for_splits = excluded.adjusted_for_splits,
      updated_at = datetime('now')
  `);
  const deleteRows = db.prepare('DELETE FROM ohlc WHERE ticker = ?');
  const insertRow = db.prepare(`
    INSERT INTO ohlc (ticker, date, open, high, low, close, adj_close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertMeta.run(
      symbol,
      symbol,
      new Date().toISOString(),
      rows.length,
      rows[0].date,
      rows[rows.length - 1].date,
      fixture.adjustedForSplits ? 1 : 0,
    );
    deleteRows.run(symbol);
    for (const row of rows) {
      insertRow.run(symbol, row.date, row.open, row.high, row.low, row.close, row.adj_close, row.volume);
    }
  })();

  upsertTickerSplits(symbol, fixture.splits);
  console.log(`${symbol}: imported ${rows.length} rows, ${fixture.splits.length} splits`);
}

const requested = process.argv.slice(2).map((value) => value.toUpperCase());
const symbols = requested.length ? requested : Object.keys(LOCAL_MARKET_DATA_FIXTURES);
for (const symbol of symbols) importSymbol(symbol);
```

- [ ] **Step 4: Add npm script**

Modify `server/package.json`:

```json
"import:local-market-data": "node scripts/import-local-market-data.js"
```

- [ ] **Step 5: Run import locally**

```bash
(cd server && npm run import:local-market-data -- QQQ TQQQ)
```

Expected for raw full-history import:

```text
QQQ: imported rows, 1 splits
TQQQ: imported rows, 7 splits
```

Expected for already adjusted site export:

```text
TQQQ: imported rows, 0 splits, adjusted_for_splits=1
```

Exact row counts can differ if source CSVs change; verify dates and adjusted mode instead of trusting counts.

- [ ] **Step 6: Verify DB content**

```bash
sqlite3 server/db/trading.db -header -column "select ticker, data_points, date_from, date_to, adjusted_for_splits from dataset_meta where ticker in ('QQQ','TQQQ') order by ticker;"
sqlite3 server/db/trading.db -header -column "select ticker, date, factor from splits where ticker in ('QQQ','TQQQ') order by ticker,date;"
```

Expected for raw full-history import:

```text
QQQ   1999-11-01 ... 2026-05-08   adjusted_for_splits=0
TQQQ  2010-02-11 ... 2026-05-06   adjusted_for_splits=0
QQQ has 1 split
TQQQ has 7 splits
```

Expected for already adjusted site export:

```text
TQQQ  2023-09-12 ... 2026-05-28   adjusted_for_splits=1
TQQQ has 0 split rows applied for this adjusted dataset
```

- [ ] **Step 7: Commit**

```bash
git add server/scripts/import-local-market-data.js server/src/services/localMarketDataFixtures.js server/package.json
git commit -m "feat: import local QQQ and TQQQ data with explicit splits"
```

---

### Task 5: Unify Metrics Without Changing Trade Execution

**Why:** Metrics are duplicated. This can make total return, CAGR, max drawdown, and profit factor differ between pages even when trades are the same.

**Files:**

- Modify: `src/lib/backtest-statistics.ts`
- Modify: `src/lib/metrics.ts`
- Modify: `src/lib/__tests__/metrics-calculator.test.ts`
- Modify: `src/lib/__tests__/singlePositionBacktest.test.ts`
- Modify: `src/lib/__tests__/ema-zone-strategy.test.ts`

- [ ] **Step 1: Add explicit final value support**

Modify `src/lib/backtest-statistics.ts` so callers can pass `finalValueOverride`.

Target signature:

```ts
export function calculateBacktestMetrics(
  trades: Trade[],
  equity: EquityPoint[],
  initialCapital: number,
  contributions: { total: number; count: number } = { total: 0, count: 0 },
  finalValueOverride?: number
): BacktestMetrics {
  const finalValue = Number.isFinite(finalValueOverride)
    ? Number(finalValueOverride)
    : equity.length > 0 ? equity[equity.length - 1].value : initialCapital;
```

- [ ] **Step 2: Update EMA and single-position callers**

In `src/lib/ema-zone-strategy.ts`, call:

```ts
const metrics = calculateBacktestMetrics(trades, equity, initialCapital, { total: 0, count: 0 }, finalValue);
```

In `src/lib/singlePositionBacktest.ts`, call:

```ts
const metrics = calculateBacktestMetrics(
  trades,
  equity,
  initialCapital,
  { total: totalMonthlyContributions, count: contributionCount },
  portfolio.totalPortfolioValue
);
```

- [ ] **Step 3: Add tests proving final value is not lost after end-of-data close**

Add to `src/lib/__tests__/ema-zone-strategy.test.ts`:

```ts
it('uses final cash value for metrics after end-of-data close', () => {
  const result = runEmaZoneBacktest(
    [{ ticker: 'TQQQ', data: [
      { date: '2024-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { date: '2024-01-02', open: 110, high: 110, low: 110, close: 110, volume: 1 },
    ] }],
    {
      initialCapital: 10000,
      leverage: 1,
      emaPeriod: 1,
      buyZones: [{ id: 'buy', levelPct: 0, enabled: true }],
      sellZones: [{ id: 'sell', levelPct: 999, enabled: true }],
      takeProfitPercent: null,
      noSellAtLoss: false,
      signalSource: 'close',
    }
  );

  expect(result.finalValue).toBeCloseTo(result.metrics.netProfit + 10000, 6);
});
```

- [ ] **Step 4: Run focused tests**

```bash
npm run test:run -- src/lib/__tests__/ema-zone-strategy.test.ts src/lib/__tests__/singlePositionBacktest.test.ts src/lib/__tests__/metrics-calculator.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/backtest-statistics.ts src/lib/ema-zone-strategy.ts src/lib/singlePositionBacktest.ts src/lib/__tests__/ema-zone-strategy.test.ts src/lib/__tests__/singlePositionBacktest.test.ts src/lib/__tests__/metrics-calculator.test.ts
git commit -m "fix: use explicit final value in backtest metrics"
```

---

### Task 6: Fix EMA Backtest Carry-Forward Pricing For Multi-Ticker Equity

**Why:** EMA backtest currently uses entry price when a ticker has no bar on the current unified date. That can distort capital, drawdown, and exposure. Carry-forward means using the last known close price until a newer bar exists.

**Files:**

- Modify: `src/lib/ema-zone-strategy.ts`
- Modify: `src/lib/__tests__/ema-zone-strategy.test.ts`

- [ ] **Step 1: Add failing test**

Add to `src/lib/__tests__/ema-zone-strategy.test.ts`:

```ts
it('marks open lots to the last known close when another ticker has a later date', () => {
  const result = runEmaZoneBacktest(
    [
      {
        ticker: 'AAA',
        data: [
          { date: '2024-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1 },
          { date: '2024-01-02', open: 150, high: 150, low: 150, close: 150, volume: 1 },
        ],
      },
      {
        ticker: 'BBB',
        data: [
          { date: '2024-01-03', open: 10, high: 10, low: 10, close: 10, volume: 1 },
        ],
      },
    ],
    {
      initialCapital: 10000,
      leverage: 1,
      emaPeriod: 1,
      buyZones: [{ id: 'buy', levelPct: 0, enabled: true }],
      sellZones: [{ id: 'sell', levelPct: 999, enabled: true }],
      takeProfitPercent: null,
      noSellAtLoss: false,
      signalSource: 'close',
    }
  );

  const jan3 = result.equity.find((point) => point.date === '2024-01-03');
  expect(jan3?.value).toBeGreaterThan(10000);
});
```

- [ ] **Step 2: Implement last-close lookup**

In `src/lib/ema-zone-strategy.ts`, add a helper inside `runEmaZoneBacktest`:

```ts
const lastKnownClose = (tickerData: PreparedTicker | undefined, date: string, fallback: number): number => {
  if (!tickerData) return fallback;
  let close = fallback;
  for (const bar of tickerData.data) {
    if (bar.date > date) break;
    if (Number.isFinite(bar.close)) close = bar.close;
  }
  return close;
};
```

Then change `currentPositionValue`:

```ts
const currentPositionValue = (date: string): number => {
  return lots.reduce((sum, lot) => {
    const ticker = prepared.find((item) => item.ticker === lot.ticker);
    const close = ticker?.byDate.get(date)?.bar.close ?? lastKnownClose(ticker, date, lot.entryPrice);
    return sum + lot.quantity * close;
  }, 0);
};
```

- [ ] **Step 3: Run EMA tests**

```bash
npm run test:run -- src/lib/__tests__/ema-zone-strategy.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 4: Verify real TQQQ fixture still matches**

```bash
TQQQ_EMA200_RELATIVE_CSV='/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ema200_relative_daily.csv' npm run test:run -- src/lib/__tests__/ema-zone-tqqq-fixture.test.ts
```

Expected:

```text
PASS
17 trades
final capital close to 9766459.19
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ema-zone-strategy.ts src/lib/__tests__/ema-zone-strategy.test.ts
git commit -m "fix: carry forward EMA position prices"
```

---

### Task 7: Update Server EMA Alerts To Use Explicit Splits Only

**Why:** Alerts must match the EMA page. They should not silently infer splits from OHLC gaps, and they should not calculate on a different basis from the frontend.

**Files:**

- Modify: `server/src/services/emaAlerts.js`
- Modify: `server/src/services/splits.js`
- Modify: `server/src/services/__tests__/emaAlerts.test.js`

- [ ] **Step 1: Remove production auto-detection fallback**

In `server/src/services/emaAlerts.js`, remove:

```js
if (!splits.length) {
    splits = detectSplitsFromOHLC(history);
}
```

Keep:

```js
const events = normalizeSplitEvents(splits);
```

- [ ] **Step 2: Stop importing detection in EMA alerts**

Change:

```js
const { getTickerSplits, detectSplitsFromOHLC } = require('./splits');
```

to:

```js
const { getTickerSplits } = require('./splits');
```

- [ ] **Step 3: Keep detection only as manual diagnostic, not production path**

In `server/src/services/splits.js`, leave `detectSplitsFromOHLC` exported only if the Splits UI still uses it for manual review. Add a code comment:

```js
// Diagnostic helper only. Production calculations must use explicit split rows from DB.
```

- [ ] **Step 4: Add server regression**

In `server/src/services/__tests__/emaAlerts.test.js`, add a stub where `detectSplitsFromOHLC` throws if called:

```js
stubModule('src/services/splits.js', {
  getTickerSplits: () => [{ date: '2000-03-20', factor: 2 }],
  detectSplitsFromOHLC: () => {
    throw new Error('detectSplitsFromOHLC must not be called by EMA alerts');
  },
});
```

Then evaluate an EMA alert and expect no error.

- [ ] **Step 5: Run server-related tests**

```bash
npm run test:run -- server/src/services/__tests__/emaAlerts.test.js server/src/services/__tests__/telegramAggregation.mismatch.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/emaAlerts.js server/src/services/splits.js server/src/services/__tests__/emaAlerts.test.js
git commit -m "fix: use explicit splits for EMA alerts"
```

---

### Task 8: Preserve Live Monitoring And Trading Behavior Last

**Why:** Monitoring and auto-trading are operationally sensitive. They should be touched only after the data and calculation layers are stable.

**Files:**

- Read-only first: `server/src/services/telegramAggregation.js`
- Read-only first: `server/src/services/trades.js`
- Read-only first: `server/src/services/autotrade.js`
- Modify only if tests show a mismatch: `server/src/services/telegramAggregation.js`
- Test: `server/src/services/__tests__/monitorState.integration.test.js`
- Test: `server/src/services/__tests__/autotrade.test.js`

- [ ] **Step 1: Confirm no trading execution code changed**

Run:

```bash
git diff -- server/src/services/autotrade.js server/src/services/trades.js server/src/services/telegramAggregation.js
```

Expected:

```text
No diff, unless Task 7 requires only EMA message formatting or mark-trigger wiring.
```

- [ ] **Step 2: Run monitor and autotrade tests**

```bash
npm run test:run -- server/src/services/__tests__/monitorState.integration.test.js server/src/services/__tests__/autotrade.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 3: Manually verify EMA alert state transition remains cyclic**

Run:

```bash
npm run test:run -- server/src/services/__tests__/emaAlerts.test.js
```

Expected:

```text
PASS
fires buy once, flips to sell, and does not repeat buy while waiting for sell
```

- [ ] **Step 4: If live trading files changed, review manually before commit**

Only if there is a diff in live trading files, inspect:

```bash
git diff -- server/src/services/autotrade.js server/src/services/trades.js server/src/services/telegramAggregation.js
```

Manual acceptance criteria:

- Broker order submission behavior is unchanged.
- Monitor can still record entries/exits independently from broker execution.
- EMA alert trigger marking happens only after Telegram T-1 message sends successfully.
- The next EMA action flips buy -> sell -> buy.

- [ ] **Step 5: Commit only verified live-monitoring changes**

If there are changes:

```bash
git add server/src/services/telegramAggregation.js server/src/services/__tests__/monitorState.integration.test.js server/src/services/__tests__/autotrade.test.js
git commit -m "test: preserve monitoring behavior after EMA split changes"
```

If there are no changes:

```bash
git status --short
```

Expected:

```text
clean or only planned non-live files
```

---

### Task 9: Full Verification And Deployment Checklist

**Why:** This work touches calculations. Passing focused tests is not enough.

**Files:**

- No code files unless verification reveals a bug.

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:run
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run real TQQQ fixture test**

```bash
TQQQ_EMA200_RELATIVE_CSV='/Users/mymac/Work/TQQQ strategies/backtest-lab/public/data/tqqq_ema200_relative_daily.csv' npm run test:run -- src/lib/__tests__/ema-zone-tqqq-fixture.test.ts
```

Expected:

```text
PASS
17 trades
final capital close to 9766459.19
```

- [ ] **Step 3: Run build and lint**

```bash
npm run build:check
npm run lint
```

Expected:

```text
PASS
```

- [ ] **Step 4: Check no unwanted auto split detection remains**

```bash
rg -n "detectSplitsFromOHLC\\(" src server/src
```

Expected:

```text
Only utility/manual diagnostic tests or manual split UI paths. No production loader, EMA alert, or backtest path.
```

- [ ] **Step 5: Check git diff**

```bash
git diff --check
git status --short
```

Expected:

```text
No whitespace errors.
Only intended changed files.
```

- [ ] **Step 6: Deploy only after tests pass**

Use the repository deploy script:

```bash
./deploy.sh
```

Expected:

```text
Frontend healthy
Server healthy
API status ok
```

---

## Non-Goals

- Do not redesign the trading strategy UI during this refactor.
- Do not change broker order submission behavior unless a failing test proves it is required.
- Do not add automatic split detection back into production calculations.
- Do not use `adjClose` as trusted adjusted data unless the provider explicitly marks the whole dataset as `adjustedForSplits`.

## Final Manual Checks

- On EMA page, TQQQ with EMA200 15 -> 40 should still show 17 trades against the fixture expectation.
- Trade table should continue showing index price and raw close separately for holder-value calculations.
- Exposure should remain `position value / equity`, so values above selected leverage are possible only when position gains increase faster than equity denominator; if product wants capped display, that must be a separate display-only decision.
- Telegram EMA 15-40 should send "покупай" once, then wait for "продавай", then return to "покупай".
- QQQ/TQQQ local data must be imported with explicit splits before relying on it in app calculations.
