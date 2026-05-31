# TQQQ Data Audit And Verification Runbook

Date: 2026-05-31

This document describes the TQQQ data issue found in the production backup and the safe procedure for future data checks.

## Terms

- `raw` prices: market OHLC prices as they traded on that date.
- `split-adjusted` prices: historical prices already divided/multiplied by a provider to account for later splits.
- `holder value` series: continuous strategy series built from `raw close * cumulative split factor`. This keeps PnL and EMA signals on one continuous base.
- `mixed basis`: one dataset contains both raw and split-adjusted rows. This is invalid for strategy signals.

## Sources Used

- Production backup: `/Users/mymac/stonks-local-backups/backup-20260530_183040/stonks-backup.tar.gz`
- Local audit directory: `/Users/mymac/Work/MYPROJECTS/site_tradingibs/tmp/data-audit/2026-05-30-tqqq`
- ProShares split history CSV: `https://accounts.profunds.com/etfdata/etf_splits.csv`
- ProShares historical NAV CSV: `https://accounts.profunds.com/etfdata/historical_nav.csv`
- ProShares TQQQ Form 8937 for the 2025 split: `https://www.proshares.com/globalassets/proshares/form-8937/tqqq-form-8937.pdf`

## Production Snapshot

SQLite `dataset_meta` for TQQQ:

- Rows: `4083`
- Date range: `2010-02-11` through `2026-05-06`
- `adjusted_for_splits`: `0`
- DB split rows before audit:
  - `2011-02-25 x2`
  - `2012-05-11 x2`
  - `2014-01-24 x2`
  - `2017-01-12 x2`
  - `2018-05-24 x3`
  - `2021-01-21 x2`
  - `2022-01-13 x2`

Server JSON volume also has `/data/datasets/TQQQ.json`, but it is not the authoritative source for the current app state. In the backup it has `3980` rows and ends at `2025-12-05`, while SQLite ends at `2026-05-06`.

## Findings

### 1. The 2025 TQQQ split is missing from SQLite

Production DB does not contain the 2025 TQQQ forward split.

For calculation purposes, use the first post-split trading date:

```text
2025-11-20 x2
```

Note: ProShares' CSV currently lists TQQQ as `11/21/2025 x2`, while the Form 8937 and trading tape indicate the split affected trading from `2025-11-20`. For OHLC calculations, the app needs the date where the price series changes basis, not a record/reporting date.

### 2. Current TQQQ data is mixed-basis

The production DB has a false split-like jump on `2025-08-29`:

```text
2025-08-28 close: 92.70
2025-08-29 open:  45.71
2025-08-29 close: 44.68
Ratio: about x2.07
```

There is no real TQQQ split on `2025-08-29`.

The likely cause is a partial refresh after a provider started returning rows adjusted for the later 2025 split. Older rows stayed raw, while `2025-08-29` through `2025-11-19` were written in a post-split-adjusted basis.

ProShares historical NAV independently confirms the basis mismatch:

```text
2025-08-28 ProShares NAV: 46.34915
2025-08-28 DB close:      92.70
DB is about 2x the adjusted NAV.

2025-08-29 ProShares NAV: 44.61615
2025-08-29 DB close:      44.68
DB is now on the adjusted scale.

2025-11-19 ProShares NAV: 49.98255
2025-11-19 DB close:      50.025002

2025-11-20 ProShares NAV: 46.4265
2025-11-20 DB close:      46.45
```

NAV means net asset value, not market close, so it should not replace OHLC prices directly. Here it is useful only as a scale check.

### 3. Adding only the 2025 split is not enough

If we only insert `2025-11-20 x2`, then rows from `2025-08-29` through `2025-11-19` remain half-sized. That would create wrong EMA values, wrong deviations, wrong PnL, and false signals.

The current broken holder-value jump:

```text
2025-08-28 holder close: 17798.40
2025-08-29 holder close:  8578.56
Change: -51.80%
```

After local repair preview:

```text
2025-08-28 holder close: 17798.40
2025-08-29 holder close: 17157.12
Change: -3.60%

2025-11-19 holder close: 19209.60
2025-11-20 holder close: 17836.80
Change: -7.15%

2026-05-06 holder close: 27482.88
```

### 4. Why the site chart can look normal

The chart is not always showing raw database prices.

On multi-ticker and EMA pages, `src/hooks/useMultiTickerData.ts` loads raw OHLC rows, then runs `detectSplitsFromOHLC(rawData)` before rendering. That detector treats the `2025-08-29` price gap as a `x2` split because:

```text
2025-08-28 close / 2025-08-29 open = 92.70 / 45.71 = 2.0280
```

It then merges that detected event into the split list and passes adjusted prices to the chart. The visual result is smooth:

```text
Date         Raw DB close   Chart close after frontend auto-adjust
2025-08-27  91.04          45.52
2025-08-28  92.70          46.35
2025-08-29  44.68          44.68
2025-09-02  43.54          43.54
2025-11-19  50.025002      50.025002
2025-11-20  46.45          46.45
```

This means the normal price chart can hide a mixed-basis dataset. It is useful for visual display, but it is not proof that the raw data and explicit split table are correct.

Important distinction:

- `raw DB`: values stored in SQLite.
- `chart close`: values after frontend adjustment for display.
- `auto-detected split`: a split inferred from a price gap, not a split confirmed in the database.
- `explicit split`: a split stored in the `splits` table and safe for server-side calculations.

For data-quality checks, use raw DB/API exports and the explicit split table. Do not rely only on the visual chart.

## Recommended Repair Path

Preferred path: reload TQQQ fully from one trusted provider in one price basis.

Use this basis for the current app:

```text
dataset_meta.adjusted_for_splits = 0
OHLC rows = raw trading prices
splits table = explicit split events
strategy calculations = holder value series
```

Required split table after repair:

```text
TQQQ 2011-02-25 x2
TQQQ 2012-05-11 x2
TQQQ 2014-01-24 x2
TQQQ 2017-01-12 x2
TQQQ 2018-05-24 x3
TQQQ 2021-01-21 x2
TQQQ 2022-01-13 x2
TQQQ 2025-11-20 x2
```

Fallback local repair if a full trusted reload is not available:

```text
For TQQQ rows where date >= 2025-08-29 and date < 2025-11-20:
  open, high, low, close, adj_close *= 2
  volume /= 2

Then insert:
  TQQQ 2025-11-20 x2
```

A local SQL preview was generated at:

```text
/Users/mymac/Work/MYPROJECTS/site_tradingibs/tmp/data-audit/2026-05-30-tqqq/tqqq-local-repair-preview.sql
```

The SQL preview was applied to a copied DB only:

```text
/Users/mymac/Work/MYPROJECTS/site_tradingibs/tmp/data-audit/2026-05-30-tqqq/tqqq-repaired-preview.db
```

After applying it locally, orphan split-like gaps were `0`.

Do not run it directly on production. First run it on a copied DB, run all checks below, then create a server backup immediately before any production repair.

## Future Verification Procedure

### 1. Make a backup first

```bash
./backup-from-server.sh
```

Never repair production before a fresh backup exists.

### 2. Work only on a local copy

Copy the downloaded DB and WAL files into a local audit directory:

```bash
mkdir -p tmp/data-audit/YYYY-MM-DD-TICKER
cp ~/stonks-local-backups/backup-*/db/trading.db* tmp/data-audit/YYYY-MM-DD-TICKER/
```

`WAL` means SQLite write-ahead log. Copying `trading.db`, `trading.db-wal`, and `trading.db-shm` keeps the snapshot consistent.

### 3. Check metadata

For each ticker:

- Row count
- Date range
- `adjusted_for_splits`
- split list
- last 10 OHLC rows

The ticker should be either:

```text
raw OHLC + explicit splits
```

or:

```text
fully split-adjusted OHLC + no split multiplication in calculations
```

Never allow mixed basis.

### 4. Scan for split-like gaps

For every adjacent trading pair, compute:

```text
previous close / current open
previous close / current close
```

Flag a row if the ratio is close to `2`, `3`, `4`, `5`, or `10` within about `8%`.

Every split-like gap must have a corresponding manual split on the first post-split trading date. If not, stop and investigate.

Large non-split market moves should still be listed, but they are not automatically errors. Example: March 2020 TQQQ had real large daily moves that are not split ratios.

### 5. Validate the holder-value series

Build:

```text
holder_close = raw_close * cumulative_split_factor
```

Then scan this holder-value series for split-like jumps. Correct data should not show a `2x`, `3x`, etc. discontinuity after applying manual splits.

### 6. Check EMA readiness

EMA200 must not be calculated until at least 200 valid rows exist. If there are fewer than 200 historical rows before a date, EMA200 is not available for that date.

### 7. Save audit artifacts

Keep these files in a local audit directory:

- raw DB export
- gap scan before repair
- corrected preview export
- gap scan after repair
- SQL preview if a repair is needed
- short markdown summary

For the 2026-05-31 TQQQ audit, generated files are:

```text
tmp/data-audit/2026-05-30-tqqq/server-tqqq-db-raw.csv
tmp/data-audit/2026-05-30-tqqq/tqqq-corrected-raw-preview.csv
tmp/data-audit/2026-05-30-tqqq/tqqq-db-gap-scan.csv
tmp/data-audit/2026-05-30-tqqq/tqqq-corrected-gap-scan.csv
tmp/data-audit/2026-05-30-tqqq/tqqq-audit-summary.json
tmp/data-audit/2026-05-30-tqqq/tqqq-local-repair-preview.sql
```

## Decision For TQQQ

TQQQ should be repaired before relying on EMA/IBS monitoring for it.

Best next implementation step:

1. Add a reusable local audit script for any ticker.
2. Run it for all production tickers.
3. Repair TQQQ on a copied DB first.
4. Compare backtest/EMA output before and after.
5. Only then apply the repair to production with a fresh server backup.

## 2026-05-31 Full Production Backup Audit

Read-only audit command:

```bash
node server/scripts/audit-data-integrity.js \
  --db /Users/mymac/stonks-local-backups/backup-20260530_183040/db/trading.db
```

Result with reviewed market-crash allowlist:

```text
Checked tickers: 21
Failed tickers: 2
```

Remaining data issues:

```text
TQQQ 2025-08-28 -> 2025-08-29
  92.70 -> 45.71, looks like x2 but no valid split on that date.
  This is the mixed-basis problem described above.

V 2015-03-18 -> 2015-03-19
  267.67 -> 66.83, valid 4:1 Visa split, missing from the DB split table.
```

Reviewed non-split market crashes:

```text
AAPL 2000-09-28 -> 2000-09-29
  Apple profit warning caused an approximately 50% market drop.

MSTR 2000-03-17 -> 2000-03-20
  MicroStrategy revenue restatement caused a one-day market drop.
```

Sources:

- Apple 2000 drop: `https://www.latimes.com/archives/la-xpm-2000-sep-29-fi-28565-story.html`
- MicroStrategy 2000 drop: `https://www.sec.gov/litigation/admin/34-43724.htm`
- Visa 2015 split: `https://investor.visa.com/files/doc_financials/2015/Visa-Inc-Q1-2015-Financial-Results_v001_s00g35.pdf`
- TQQQ 2025 split cross-check: `https://twelvedata.com/markets/823422/etf/nasdaq/tqqq/historical-data/splits`

Local repaired preview:

```bash
cp /Users/mymac/stonks-local-backups/backup-20260530_183040/db/trading.db \
  tmp/data-audit/2026-05-31-all-tickers/repaired-preview.db

sqlite3 tmp/data-audit/2026-05-31-all-tickers/repaired-preview.db \
  < tmp/data-audit/2026-05-30-tqqq/tqqq-local-repair-preview.sql

sqlite3 tmp/data-audit/2026-05-31-all-tickers/repaired-preview.db \
  "INSERT OR REPLACE INTO splits (ticker, date, factor) VALUES ('V', '2015-03-19', 4);"

node server/scripts/audit-data-integrity.js \
  --db tmp/data-audit/2026-05-31-all-tickers/repaired-preview.db
```

Preview result:

```text
Checked tickers: 21
Failed tickers: 0
```

## Fresh Data Guard

Fresh data is now routed through one server module:

```text
server/src/services/dataIngestion.js
```

This module normalizes provider rows, carries explicit split events returned by providers, applies the reviewed allowlist, and blocks unsafe writes. `Allowlist` means a manually reviewed list of known non-split crashes that should not block data writes.

Fresh data is checked before it is written by:

- new ticker download page: `GET /api/yahoo-finance/:symbol` returns `data` and `splits`, then `POST /api/datasets` stores both
- manual dataset refresh: `POST /api/datasets/:id/refresh`
- T-11 / T-1 Telegram aggregation: `runTelegramAggregation` calls `refreshTickerAndCheckFreshness`
- automatic post-close price actualization

The write guard checks only the dates touched by incoming rows plus their adjacent boundaries. This avoids blocking a normal refresh because of old reviewed events like the AAPL 2000 or MSTR 2000 market crashes.

If an incoming row creates a split-like gap without a matching explicit split, the server rejects the write with:

```text
409 DATA_INTEGRITY_BLOCKED
```

The frontend may still detect split-like gaps for diagnostics, but detected gaps are not merged into the working split list and are not used for calculations. Trading calculations use only explicit manual splits.

Provider test endpoints and live quote endpoints are intentionally not write paths. They can fetch prices for display or API-key checks, but they do not mutate OHLC history.
