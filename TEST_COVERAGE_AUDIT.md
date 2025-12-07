# Test Coverage Audit Report

## Executive Summary

The current codebase has strong test coverage for core business logic, particularly in the backtesting engines, strategy execution, and data processing utilities. However, there is a significant gap in coverage for UI components, main application pages, and user interaction flows.

**Coverage Status:**
- **Core Logic (Lib):** ✅ High
- **Simulators:** ✅ Good
- **UI Components:** ❌ Low
- **Pages & Routing:** ❌ Low
- **Hooks:** ❌ Low

## Detailed Analysis

### 1. Core Logic & Utilities (`src/lib`)
The `src/lib` directory is well-tested. Key areas like `backtest.ts`, `strategy.ts`, `indicators.ts`, and `utils.ts` have corresponding test files.
- **Strengths:** `BacktestEngine` and `Strategy` creation are covered by integration tests.
- **Gaps:** 
    - `dataset-storage.ts`: Critical for data persistence but lacks a dedicated test file.
    - `date-utils.ts`: Used heavily but lacks a dedicated test file (though likely covered indirectly).
    - `singlePositionBacktest.ts`: Should be verified if it's fully covered by `SinglePositionSimulator.test.tsx` or needs unit tests.

### 2. Simulators (`src/components/*Simulator.tsx`)
The simulator components (`SinglePositionSimulator`, `BuyAtClose4Simulator`) have integration/component tests.
- **Strengths:** Main user flows for running backtests are tested.
- **Gaps:** `MonitorTradeHistoryPanel` and `MarginSimulator` (check if `margin-simulator.test.ts` covers the component or just logic).

### 3. UI Components (`src/components/ui`)
The reusable UI library is almost entirely untested.
- **Missing Tests:**
    - `Button.tsx`
    - `Modal.tsx`
    - `Toast.tsx`
    - `EmptyState.tsx`
    - `Skeleton.tsx`
    - `BottomNav.tsx`

### 4. Main Pages & Features
Major application pages and features lack tests, increasing the risk of regression in user flows.
- **Missing Tests:**
    - `DataEnhancer.tsx`: Critical path for data entry.
    - `DatasetLibrary.tsx`: Critical path for data management.
    - `MultiTickerPage.tsx`: Main dashboard view.
    - `AppRouter.tsx`: Navigation logic.
    - `TradingChart.tsx`: Visualization (needs render tests).
    - `AppSettings.tsx` & `StrategySettings.tsx`: Configuration pages.

### 5. Hooks (`src/hooks`)
Custom hooks contain logic that should be isolated and tested.
- **Missing Tests:**
    - `useKeyboardShortcuts.ts`
    - `useErrorEvents.ts`
    - `useValidatedInput.ts`

## Recommendations

### Priority 1: Critical User Flows (High Impact)
Create integration tests for the main data management pages to ensure users can always load and view data.
1.  **`DataEnhancer.test.tsx`**: Test file upload, ticker search, and data saving.
2.  **`DatasetLibrary.test.tsx`**: Test listing datasets, deletion, and selection.
3.  **`MultiTickerPage.test.tsx`**: Test rendering of the dashboard and interaction with the grid.

### Priority 2: Reusable UI Components (Stability)
Ensure the building blocks of the app are stable.
1.  **`Button.test.tsx`**: Test variants, disabled state, and click handling.
2.  **`Modal.test.tsx`**: Test opening, closing, and portal rendering.
3.  **`Toast.test.tsx`**: Test notification display and auto-dismissal.

### Priority 3: Custom Hooks (Logic Isolation)
Unit test the hooks to ensure they behave correctly in isolation.
1.  **`useKeyboardShortcuts.test.ts`**: Verify key binding and event cleanup.
2.  **`useValidatedInput.test.ts`**: Verify validation logic and error states.

### Priority 4: Visualization & Settings
1.  **`TradingChart.test.tsx`**: Basic render test to ensure it doesn't crash with valid/invalid data.
2.  **`AppSettings.test.tsx`**: Verify settings persistence.

## Next Steps
1.  Scaffold test files for **Priority 1** items.
2.  Set up a standard testing utility for UI components (if not already present in `src/test/setup.ts`).
3.  Begin implementing tests for `DataEnhancer`.
