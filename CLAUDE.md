# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React 19 + TypeScript trading strategy backtester with an Express.js backend. The application allows users to test trading strategies on historical data with real-time data integration from multiple financial APIs. The primary focus is on IBS (Internal Bar Strength) based mean-reversion strategies.

### Trading Workflow Ground Rules

- Execute trades **only at the official session close**.
- **Two minutes before the close** capture the latest IBS readings for all monitored tickers and base entry decisions on these values.
- At the close select the instrument with the **lowest IBS strictly below 10** from the monitoring list; if no ticker meets the threshold, skip the trade.
- **Hold the position until it is fully closed**, then you may re-enter later the same day provided the above conditions are met again.

## Architecture

### Frontend (React SPA)

**Tech Stack:**
- React 19 with TypeScript (strict mode)
- State management: Zustand (`src/stores/index.ts` - single global store)
- Charts: lightweight-charts library (TradingView)
- Styling: Tailwind CSS (utility-first, dark mode support)
- Build tool: Vite 7
- Testing: Vitest (unit), Playwright (E2E)

**Entry Point Flow:**
```
index.html → main.tsx → AppRouter.tsx → ProtectedLayout → Page Components
```

**Routing Structure:**
- `/login` - Authentication (public)
- `/data` - CSV/JSON dataset upload (protected)
- `/enhance` - Fetch data from APIs (protected)
- `/results` - Single ticker analysis (protected)
- `/multi-ticker` - Portfolio backtesting (protected)
- `/calendar` - Trading calendar (protected)
- `/split` - Stock splits management (protected)
- `/watches` - Telegram monitoring dashboard (protected)
- `/settings` - App configuration (protected)

**State Management (Zustand):**
The application uses a single global store in `src/stores/index.ts` (602 lines):
- `marketData: OHLCData[]` - Current dataset
- `currentDataset: SavedDataset` - Active dataset metadata
- `savedDatasets: SavedDataset[]` - Available datasets
- `currentSplits: SplitEvent[]` - Stock splits
- `currentStrategy: Strategy` - Active trading strategy
- `backtestResults: BacktestResult` - Backtest output
- `backtestStatus: 'idle' | 'running' | 'completed' | 'error'`
- Commission settings, data provider config, UI preferences

### Backend (Express Server)

**Tech Stack:**
- Express.js 4
- Authentication: bcrypt + session tokens
- Security: Helmet, CORS, rate limiting
- Data persistence: JSON files (no database)
- File operations: fs-extra, multer

**Server Structure:**
- Main file: `server/server.js` (3,848 lines - monolithic)
- Data storage: `server/datasets/` (individual JSON files)
- State files: `splits.json`, `settings.json`, `telegram-watches.json`, `trade-history.json`, `trading-calendar.json`

## Directory Structure

```
/home/user/stonks/
├── src/                          # Frontend source (67 TS/TSX files)
│   ├── components/               # React components (40 files, ~13,165 lines)
│   │   ├── AppRouter.tsx        # Main router with authentication
│   │   ├── Results.tsx          # Single ticker analysis dashboard
│   │   ├── MultiTickerPage.tsx  # Portfolio backtesting
│   │   ├── TelegramWatches.tsx  # Monitoring dashboard
│   │   ├── DataUpload.tsx       # CSV/JSON import
│   │   ├── BacktestRunner.tsx   # Backtest execution
│   │   ├── TradingChart.tsx     # Main price chart (lightweight-charts)
│   │   ├── EquityChart.tsx      # Equity curve visualization
│   │   ├── TradesTable.tsx      # Trade history with pagination
│   │   ├── SplitsTab.tsx        # Stock splits management
│   │   ├── CalendarPage.tsx     # Trading calendar
│   │   └── [30+ other components]
│   ├── lib/                     # Core business logic (~6,149 lines)
│   │   ├── backtest.ts          # Main backtesting engine
│   │   ├── indicators.ts        # Technical indicators (IBS, SMA, EMA, RSI)
│   │   ├── metrics.ts           # Performance metrics (Sharpe, CAGR, etc.)
│   │   ├── api.ts               # API client with retry/timeout
│   │   ├── strategy.ts          # Strategy templates
│   │   ├── utils.ts             # Utility functions
│   │   ├── error-logger.ts      # Client-side error logging
│   │   └── [additional utilities]
│   ├── stores/                  # State management
│   │   └── index.ts             # Zustand store (602 lines)
│   ├── types/                   # TypeScript definitions
│   │   └── index.ts             # Core types (236 lines)
│   ├── hooks/                   # React hooks
│   ├── constants/               # Application constants
│   ├── test/                    # Test setup
│   │   └── setup.ts             # Vitest mocks (matchMedia, ResizeObserver, etc.)
│   └── main.tsx                 # Entry point
├── server/                      # Express backend
│   ├── server.js                # Main server (3,848 lines)
│   ├── datasets/                # Dataset storage directory
│   ├── splits.json              # Centralized stock splits
│   ├── settings.json            # App settings
│   ├── telegram-watches.json    # Watch list
│   ├── trade-history.json       # Monitor trades
│   ├── trading-calendar.json    # Trading calendar data
│   └── package.json             # Backend dependencies
├── docker/                      # Docker configuration
│   ├── frontend.Dockerfile      # Multi-stage build (Vite + nginx)
│   ├── server.Dockerfile        # Node.js backend
│   └── nginx.conf              # Nginx configuration
├── e2e/                         # Playwright E2E tests
├── deploy.sh                    # Production deployment
├── health-check.sh              # System monitoring
├── rollback.sh                  # Deployment rollback
├── docker-compose.yml           # Container orchestration
├── vite.config.ts               # Vite build configuration
├── playwright.config.ts         # E2E test configuration
├── tailwind.config.js           # Tailwind CSS config
├── tsconfig.json                # TypeScript config
└── package.json                 # Frontend dependencies
```

## Development Commands

### Frontend Development
```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run build:check  # Build with TypeScript checking
npm run preview      # Preview build (http://localhost:4173)
npm run lint         # ESLint
```

### Backend Development
```bash
cd server
npm run dev          # Start with nodemon (http://localhost:3001)
npm run start        # Production start
```

### Testing
```bash
# Unit tests (Vitest)
npm run test         # Interactive watch mode
npm run test:run     # Single run with coverage

# E2E tests (Playwright)
npm run test:e2e            # Run all E2E tests
npm run test:e2e:ui         # Playwright UI mode
npm run test:e2e:headed     # Headed browser mode
npm run test:e2e:chromium   # Chromium only
npm run test:e2e:firefox    # Firefox only
npm run test:e2e:webkit     # WebKit only

# All tests
npm run test:all     # Unit + E2E
npm run test:ci      # CI mode with GitHub reporter
```

## API Endpoints Reference

### Authentication & Status
- `POST /api/login` - User login (email, password, rememberMe)
- `GET /api/auth/check` - Session validation
- `POST /api/logout` - Session termination
- `POST /api/auth/hash-password` - Password hashing utility
- `GET /api/status` - Server health check

### Settings Management
- `GET /api/settings` - Get app settings
- `PUT /api/settings` - Update app settings
- `PATCH /api/settings` - Partial settings update

### Dataset Management
- `GET /api/datasets` - List all datasets (metadata only)
- `GET /api/datasets/:id` - Get full dataset with OHLC data
- `GET /api/datasets/:id/metadata` - Get dataset metadata only
- `POST /api/datasets` - Create new dataset
- `PUT /api/datasets/:id` - Update dataset
- `DELETE /api/datasets/:id` - Delete dataset
- `POST /api/datasets/:id/refresh` - Refresh from API
- `POST /api/datasets/:id/apply-splits` - Apply split adjustments
- `PATCH /api/datasets/:id/metadata` - Update metadata only

### Stock Splits
- `GET /api/splits` - Get all splits (all tickers)
- `GET /api/splits/:symbol` - Get splits for specific ticker
- `PUT /api/splits/:symbol` - Replace splits for ticker
- `PATCH /api/splits/:symbol` - Merge/upsert splits
- `DELETE /api/splits/:symbol/:date` - Delete specific split
- `DELETE /api/splits/:symbol` - Delete all splits for ticker

### Market Data
- `GET /api/quote/:symbol` - Real-time quote (multi-provider)
- `GET /api/yahoo-finance/:symbol` - Yahoo Finance data
- `GET /api/polygon-finance/:symbol` - Polygon.io data
- `GET /api/test-yahoo/:symbol` - Yahoo Finance test endpoint
- `GET /api/sample-data/:symbol` - Sample data for testing

### Trading Calendar
- `GET /api/trading-calendar` - Get holiday/short day data
- `GET /api/trading/expected-prev-day` - Calculate previous trading day

### Telegram Monitoring
- `GET /api/telegram/watches` - Get all watch items
- `POST /api/telegram/watch` - Add ticker to watch list
- `DELETE /api/telegram/watch/:symbol` - Remove from watch list
- `PATCH /api/telegram/watch/:symbol` - Update watch settings
- `POST /api/telegram/simulate` - Simulate monitoring run
- `POST /api/telegram/actualize-prices` - Update all prices
- `POST /api/telegram/update-positions` - Update position tracking
- `POST /api/telegram/update-all` - Full update cycle
- `POST /api/telegram/test` - Send test notification
- `POST /api/telegram/command` - Execute Telegram bot command
- `GET /api/trades` - Get trade history

## Key Features

### 1. IBS Strategy Backtesting
**Core Implementation:** `src/lib/backtest.ts`

The Internal Bar Strength (IBS) indicator measures where the close is relative to the day's range:
```
IBS = (Close - Low) / (High - Low)
```

**Default Strategy:**
- Entry: IBS < 0.1 (oversold)
- Exit: IBS > 0.75 (overbought) OR max hold days reached
- Position sizing: % of capital per trade
- Risk management: stop-loss, take-profit, max hold days

### 2. Performance Metrics
**Implementation:** `src/lib/metrics.ts`

**Level 1 (Hero Metrics):**
- Total Return
- CAGR (Compound Annual Growth Rate)
- Max Drawdown
- Win Rate
- Sharpe Ratio

**Level 2 (Risk-Adjusted):**
- Sortino Ratio
- Calmar Ratio
- Profit Factor
- Average Win/Loss

**Level 3 (Advanced):**
- Beta, Alpha
- Recovery Factor
- Skewness, Kurtosis
- Value at Risk (VaR)

### 3. Multi-Ticker Portfolio
**Component:** `src/components/MultiTickerPage.tsx`

- Test strategies across multiple tickers simultaneously
- Single position constraint (one open trade at a time)
- Automatic ticker rotation based on IBS
- Leverage simulation (1x to 10x)
- Monthly contribution modeling
- Aggregated portfolio metrics

### 4. Telegram Monitoring
**Component:** `src/components/TelegramWatches.tsx`

- Real-time position monitoring
- Automated entry/exit decisions at market close
- Position tracking (open/closed status)
- Trade history with P&L calculation
- Telegram notifications at scheduled times (11 min and 1 min before close)
- IBS threshold alerts

**Rate Limiting:**
- AlphaVantage: 15s delay + 2s jitter between requests
- Configurable via `PRICE_ACTUALIZATION_REQUEST_DELAY_MS`

### 5. Stock Split Handling
**Component:** `src/components/SplitsTab.tsx`

- Centralized split database (`server/splits.json`)
- Back-adjustment of historical prices
- Split event CRUD operations
- Per-ticker split management
- Automatic application to datasets

### 6. Data Management
- CSV/JSON import (`DataUpload.tsx`)
- Dataset library with server persistence
- Real-time quote fetching from multiple providers
- Data deduplication and validation
- Split-adjusted price calculation

## Code Conventions

### File Naming
- Components: PascalCase (`TradingChart.tsx`, `DataUpload.tsx`)
- Utilities: camelCase (`utils.ts`, `api.ts`)
- Types: camelCase in types directory
- Tests: `*.test.ts` suffix
- Hooks: `use` prefix (`useErrorEvents.ts`)

### Component Structure
```typescript
// 1. Imports
import React, { useState, useEffect } from 'react';
import { Icon } from 'lucide-react';
import { useAppStore } from '../stores';

// 2. Types/Interfaces
interface ComponentProps {
  // ...
}

// 3. Helper functions (outside component)
function helperFunction() {
  // ...
}

// 4. Component definition
export function ComponentName({ prop }: ComponentProps) {
  // State
  const [state, setState] = useState();

  // Store access
  const data = useAppStore(s => s.data);

  // Effects
  useEffect(() => {
    // ...
  }, [deps]);

  // Handlers
  const handleAction = () => {
    // ...
  };

  // Render
  return <div>{/* JSX */}</div>;
}
```

### TypeScript Style
- Strict mode enabled
- Explicit types for function parameters
- Interface over type for objects
- Const assertions for readonly objects
- No `any` types (use `unknown` if needed)

### React Patterns
- Functional components only (no classes)
- Hooks for state and effects
- Custom hooks for reusable logic
- Zustand for global state (not Context API)
- Memoization with `useMemo`, `useCallback` where needed

### Error Handling
```typescript
try {
  // operation
} catch (error) {
  logError('category', 'message', { context }, 'source', error.stack);
  // fallback or rethrow
}
```

### API Client Pattern
```typescript
// Always use fetchWithCreds for authenticated requests
const response = await fetchWithCreds('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
  timeout: 30000,  // 30 seconds
  retries: 3       // Auto-retry on network/5xx errors
});
```

### Styling with Tailwind
```tsx
// Organize classes by category: layout, spacing, colors, effects
<div className="
  flex flex-col gap-4
  p-4 rounded-lg
  bg-white dark:bg-gray-900
  border border-gray-200 dark:border-gray-800
  hover:shadow-lg
  transition-all duration-200
">
```

### State Updates (Zustand)
```typescript
// Direct state mutation
set({ marketData: newData });

// Functional update
set(state => ({
  marketData: [...state.marketData, newItem]
}));
```

## Data Models

### Core Types (`src/types/index.ts`)

```typescript
interface OHLCData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParameters;
  entryConditions: IndicatorCondition[];
  exitConditions: IndicatorCondition[];
  riskManagement: RiskManagement;
}

interface BacktestResult {
  trades: Trade[];
  metrics: PerformanceMetrics;
  equity: EquityPoint[];
  chartData?: ChartCandle[];
}

interface Trade {
  id: string;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  duration: number;
  exitReason: string;
  context?: TradeContext;
}
```

## Deployment

### Production Deployment

**Script:** `./deploy.sh`
```bash
./deploy.sh  # Full production deployment
```

**Process:**
1. Verify GitHub sync (prevents deploying stale code)
2. Auto-push uncommitted changes
3. Clean build (`rm -rf dist/`)
4. Build verification
5. Archive creation with metadata
6. SCP upload to server
7. Server-side extraction and restart
8. Health check verification

### Docker Deployment

```bash
# Production
docker compose up -d

# Development (with bind mounts)
docker compose --profile dev up --build -d
```

**Services:**
- `frontend` - Nginx serving built React app
- `server` - Express.js backend
- `caddy` - Reverse proxy with auto-HTTPS

### Deployment Scripts

- `./deploy.sh` - Full production deployment
- `./check-deployment.sh` - Verify deployment status
- `./health-check.sh` - System health monitoring
- `./rollback.sh` - Rollback to previous version
- `./cleanup-server.sh` - Remove old Docker images/volumes

## Environment Configuration

### Server Environment (`server/.env`)

```bash
# Server
PORT=3001
FRONTEND_ORIGIN=http://localhost:5173

# Data Storage
DATASETS_DIR=/data/datasets
SETTINGS_FILE=/data/state/settings.json
WATCHES_FILE=/data/state/telegram-watches.json
SPLITS_FILE=/data/state/splits.json
TRADE_HISTORY_FILE=/data/state/trade-history.json

# Authentication
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=<bcrypt-hash>

# Telegram
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<chat-id>

# API Keys
ALPHA_VANTAGE_API_KEY=<key>
FINNHUB_API_KEY=<key>
TWELVE_DATA_API_KEY=<key>
POLYGON_API_KEY=<key>

# Rate Limiting
PRICE_ACTUALIZATION_REQUEST_DELAY_MS=15000  # 15 seconds
PRICE_ACTUALIZATION_DELAY_JITTER_MS=2000    # 2 seconds
```

### Build Environment

```bash
VITE_BUILD_ID=<timestamp>  # Build identifier in UI footer
```

## External Integrations

### Financial Data Providers

1. **Alpha Vantage** (Primary)
   - Historical OHLC data
   - Real-time quotes
   - Rate limit: ~5 calls/minute (free tier)
   - Throttling: 15s + 2s jitter

2. **Finnhub**
   - Real-time quotes
   - Company data
   - Rate limit: 60 calls/minute (free tier)

3. **Twelve Data**
   - Alternative market data
   - Rate limit: Varies by plan

4. **Polygon.io**
   - Stock aggregates
   - Split data
   - Rate limit: Varies by plan

### Telegram Bot

- Real-time notifications
- Markdown formatting support
- Scheduled alerts (market close timing)
- Command interface for monitoring

## Testing Strategy

### Unit Tests (Vitest)

**Files:**
- `src/lib/utils.test.ts` - Utility functions
- `src/lib/input-validation.test.ts` - Validation logic

**Setup:** `src/test/setup.ts`
- Mocks: matchMedia, ResizeObserver, Canvas API
- Environment: jsdom
- Coverage: v8 provider

### E2E Tests (Playwright)

**Configuration:** `playwright.config.ts`
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome/Safari
- Base URL: `http://localhost:4173` (preview server)
- Features: Automatic screenshots/videos on failure, trace on retry

**Note:** E2E test directory exists but tests not yet implemented.

## Important Notes

### Backend Architecture
- **Large monolithic file**: `server/server.js` is 3,848 lines
- Consider modularizing into separate route handlers if adding major features
- No database - all data in JSON files

### Performance
- Memory requirements: 2GB+ RAM (4GB recommended)
- Frontend build can be memory-intensive
- Node.js 18+ required

### Recent Focus Areas
Based on recent commits:
- Telegram monitoring refinements (timing, rate limiting)
- Trade history pagination and display
- API throttling for rate limits
- Default configuration tuning (tickers: AAPL, MSFT, AMZN, MAGS)

### Code Quality
- E2E tests need implementation
- Server.js could benefit from modularization
- Some legacy components retained (`BuyAtClose4Simulator_old.tsx`)

### UI Language
- Interface is primarily in Russian
- Documentation in English
- Consider internationalization if expanding user base