## 2024-05-22 - Prevented Chart Recreation on UI Toggles
**Learning:** In React components wrapping complex third-party libraries (like Lightweight Charts), putting every prop in the `useEffect` dependency array causes full destruction and recreation of the instance, which is terrible for performance.
**Action:** Use `useRef` to track mutable state needed in callbacks (like tooltips) and separate effects for lightweight updates (like visibility or layout options) to update the existing instance instead of recreating it.
