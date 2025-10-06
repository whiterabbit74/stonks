# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript trading strategy backtester with an Express.js backend. The application allows users to test trading strategies on historical data with real-time data integration from multiple financial APIs.

### Trading Workflow Ground Rules

- Execute trades **only at the official session close**.
- **Two minutes before the close** capture the latest IBS readings for all monitored tickers and base entry decisions on these values.
- At the close select the instrument with the **lowest IBS strictly below 10** from the monitoring list; if no ticker meets the threshold, skip the trade.
- **Hold the position until it is fully closed**, then you may re-enter later the same day provided the above conditions are met again.

## Architecture

**Frontend (React SPA)**
- React 19 with TypeScript
- State management: Zustand stores in `src/stores/`
- Charts: lightweight-charts library
- Styling: Tailwind CSS
- Build tool: Vite

**Backend (Express Server)**
- Located in `server/` directory
- Handles datasets, quotes, splits, Telegram notifications, and authentication
- Data persisted in JSON files and file system
- API endpoints under `/api/*`

**Key Directories:**
- `src/components/` - React components (charts, forms, dashboards, splits, Telegram)
- `src/lib/` - Core backtesting logic, indicators, metrics, API client
- `src/stores/` - Zustand state management
- `src/types/` - TypeScript definitions
- `server/` - Express backend with datasets and integrations

## Development Commands

**Frontend Development:**
```bash
npm run dev          # Start development server (http://localhost:5173)
npm run build        # Production build
npm run build:check  # Build with TypeScript checking
npm run preview      # Preview production build (http://localhost:4173)
npm run lint         # ESLint
```

**Backend Development:**
```bash
cd server
npm run dev          # Start with nodemon (http://localhost:3001)
npm run start        # Production start
```

**Testing:**
```bash
npm run test         # Vitest unit tests (interactive)
npm run test:run     # Vitest unit tests (single run)
npm run test:e2e     # Playwright E2E tests
npm run test:all     # Run all tests
```

## Deployment

**Production deployment uses dedicated scripts:**
- `./super-reliable-deploy.sh` - Full production deployment
- `./quick-deploy.sh` - Quick development deployment
- `./check-deployment.sh` - Verify deployment status
- `./health-check.sh` - Health monitoring
- `./rollback.sh` - Rollback deployment

**Docker deployment:**
```bash
docker compose up -d         # Production
docker compose --profile dev up --build -d  # Development
```

## Environment Configuration

**Server environment variables** (in `server/.env`):
- `PORT=3001` - API server port
- `FRONTEND_ORIGIN=http://localhost:5173` - CORS origin
- API keys for financial data providers (Alpha Vantage, Finnhub, etc.)
- Telegram bot configuration
- Admin authentication

**Build environment:**
- `VITE_BUILD_ID` - Build identifier shown in UI footer

## API Integration

The project integrates with multiple financial data providers:
- Alpha Vantage
- Finnhub  
- Twelve Data
- Polygon

API client in `src/lib/api.ts` uses relative `/api` paths. Backend handles provider selection and data fetching.

## Key Features

- CSV data import/export
- Real-time quote fetching
- Stock split handling
- Strategy backtesting with various indicators
- Telegram notifications
- Multi-provider data integration
- Authentication system
- Position monitoring and automatic calculations

## Development Notes

- Memory requirements: 2GB+ RAM for frontend builds (4GB recommended)
- Node.js 18+ required
- E2E tests automatically build and run preview server
- Backend uses JSON files for persistence (not database)
- Russian language interface and documentation