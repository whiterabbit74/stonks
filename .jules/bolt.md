## 2024-05-22 - Prevented Chart Recreation on UI Toggles
**Learning:** In React components wrapping complex third-party libraries (like Lightweight Charts), putting every prop in the `useEffect` dependency array causes full destruction and recreation of the instance, which is terrible for performance.
**Action:** Use `useRef` to track mutable state needed in callbacks (like tooltips) and separate effects for lightweight updates (like visibility or layout options) to update the existing instance instead of recreating it.

## 2026-01-22 - Memoized Chart Data Preparation
**Learning:** In components using `lightweight-charts`, data preparation (looping over thousands of bars and parsing dates) is expensive. If this logic is inside `useEffect` or the render body, it runs on every unrelated re-render (like theme toggles or resizes), blocking the UI.
**Action:** Extract data transformation logic into `useMemo` blocks dependent only on the data source. Use efficient date parsing (like `Date.UTC` via helper) instead of `new Date(string)` inside loops.
