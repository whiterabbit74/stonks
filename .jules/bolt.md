## 2024-05-22 - Prevented Chart Recreation on UI Toggles
**Learning:** In React components wrapping complex third-party libraries (like Lightweight Charts), putting every prop in the `useEffect` dependency array causes full destruction and recreation of the instance, which is terrible for performance.
**Action:** Use `useRef` to track mutable state needed in callbacks (like tooltips) and separate effects for lightweight updates (like visibility or layout options) to update the existing instance instead of recreating it.

## 2026-01-22 - Memoized Chart Data Preparation
**Learning:** In components using `lightweight-charts`, data preparation (looping over thousands of bars and parsing dates) is expensive. If this logic is inside `useEffect` or the render body, it runs on every unrelated re-render (like theme toggles or resizes), blocking the UI.
**Action:** Extract data transformation logic into `useMemo` blocks dependent only on the data source. Use efficient date parsing (like `Date.UTC` via helper) instead of `new Date(string)` inside loops.

## 2025-05-22 - Optimizing Shared Components with Mode-Specific Logic
**Learning:** Components shared between different modes (Single vs Multi ticker) often compute derived state needed only for one mode. In `BacktestResultsView`, grouping trades by ticker (O(N)) was running even in SingleTicker mode where it's unused.
**Action:** Explicitly check the `mode` prop before running expensive `useMemo` calculations derived from large datasets.

## 2025-05-23 - O(N^2) Drawdown Calculation inside Backtest Loop
**Learning:** In the backtest loop, calculating `Math.max(...equity)` to determine the peak value (High Water Mark) creates an O(N^2) bottleneck because the `equity` array grows with every iteration. For 5000 bars, this resulted in ~25M operations and ~400ms execution time.
**Action:** Maintain a running `peakValue` variable outside the loop to update the high water mark in O(1) time. This reduced execution time by 11x (to ~35ms) for the same dataset.
