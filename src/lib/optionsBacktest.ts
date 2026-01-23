import type { Trade, OHLCData, EquityPoint } from '../types';
import { blackScholes, calculateVolatility, getExpirationDate, getYearsToMaturity } from './optionsMath';
import { toTradingDate } from './date-utils';
import { getRiskFreeRate } from './riskFreeRates';

export interface OptionsBacktestConfig {
    strikePct: number; // e.g. 10 for 10%
    volAdjPct: number; // e.g. 20 for 20%
    capitalPct: number; // e.g. 10 for 10% of current capital
    riskFreeRate?: number; // default 0.05
    expirationWeeks?: number; // default 4
}

interface OptionTrade extends Trade {
    optionType: 'call';
    strike: number;
    expirationDate: string;
    impliedVolAtEntry: number;
    impliedVolAtExit: number;
    optionEntryPrice: number;
    optionExitPrice: number;
    contracts: number;
}

interface TickerData {
    ticker: string;
    data: OHLCData[];
}

export function runOptionsBacktest(
    stockTrades: Trade[],
    marketData: OHLCData[],
    config: OptionsBacktestConfig
): { equity: EquityPoint[]; trades: OptionTrade[]; finalValue: number } {
    const { strikePct, volAdjPct, capitalPct, riskFreeRate = 0.05, expirationWeeks = 4 } = config;
    const initialCapital = 10000; // Hardcoded base for simulation comparison

    // Create a map for quick price/index lookup
    const datePriceMap = new Map<string, { close: number; index: number }>();
    marketData.forEach((bar, idx) => {
        // Handle both TradingDate string and Date object input gracefully
        const dKey = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
        datePriceMap.set(dKey, { close: bar.close, index: idx });
    });

    // Helper to get close price and volatility for a date
    const getMarketState = (dateStr: string) => {
        const entry = datePriceMap.get(dateStr);
        if (!entry) return null;

        // Calculate volatility based on previous 30 days window
        const windowSize = 30;
        const startIndex = Math.max(0, entry.index - windowSize);
        const prices = marketData.slice(startIndex, entry.index + 1).map(b => b.close);

        let vol = calculateVolatility(prices, windowSize);
        // Apply adjustment
        vol = vol * (1 + volAdjPct / 100);

        return { price: entry.close, vol, index: entry.index };
    };

    let currentCapital = initialCapital;
    const equity: EquityPoint[] = [];
    const optionTrades: OptionTrade[] = [];

    // Generate equity curve foundation (cash only) first
    // We will update this as we process trades
    // To simplify, we'll just track capital after each trade for the list,
    // and rebuild the daily equity curve at the end or on the fly.
    // Let's do daily tracking to be accurate.

    let activeTrade: OptionTrade | null = null;
    let portfolioValue = initialCapital;

    // Iterate through all market data days to build equity curve
    for (let i = 0; i < marketData.length; i++) {
        const bar = marketData[i];
        const dateStr = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
        // Create date at noon local time to ensure correct day-of-week calculation (avoids midnight timezone shifts)
        const [y, m, d] = dateStr.split('-').map(Number);
        const currentDate = new Date(y, m - 1, d, 12, 0, 0);

        // Determine Risk Free Rate for today (use historical if available, else config default)
        const r = getRiskFreeRate(currentDate) ?? riskFreeRate;

        // Check if we need to enter a trade
        // We look at stockTrades to see if any trade matches this entry date
        // Note: stockTrades might have multiple trades, but usually non-overlapping for single pos strategy.
        // We assume single position for simplicity as per "Single Position Backtest".

        if (!activeTrade) {
           const matchingStockTrade = stockTrades.find(t => {
               const tEntry = typeof t.entryDate === 'string' ? t.entryDate.slice(0, 10) : new Date(t.entryDate).toISOString().slice(0, 10);
               return tEntry === dateStr;
           });

           if (matchingStockTrade) {
               // ENTER TRADE
               const state = getMarketState(dateStr);
               // Require valid volatility to enter trade (prevents fake cheap options on missing data)
               if (state && state.vol > 0) {
                   const spot = state.price;
                   // Strike: Current Price + X%, rounded to integer
                   const strikeRaw = spot * (1 + strikePct / 100);
                   const strike = Math.round(strikeRaw);

                   const expiration = getExpirationDate(currentDate, expirationWeeks);
                   const T = getYearsToMaturity(currentDate, expiration);

                   // Option Price (Ask)
                   // We don't have Bid/Ask, so we use theoretical price
                   let optionPrice = blackScholes('call', spot, strike, T, r, state.vol);

                   // Enforce minimum price of 0.01 to ensure trade execution even for deep OTM options
                   // This prevents trades from disappearing when changing strike/vol parameters
                   // Also handles NaN or other invalid values
                   if (Number.isNaN(optionPrice) || optionPrice < 0.01) optionPrice = 0.01;

                   if (optionPrice > 0) {
                       // Buy max contracts with available capital
                       // Contract size usually 100 shares.
                       // We use the standard multiplier of 100.
                       // To make it comparable to stock trading amount, we invest the configured % of capital.
                       const investAmount = currentCapital * (capitalPct / 100);

                       // Contracts = Capital / (Price * 100)
                       // Floor to integer for realistic trading
                       const contracts = Math.floor(investAmount / (optionPrice * 100));

                       if (contracts >= 1) {
                           activeTrade = {
                               ...matchingStockTrade,
                               optionType: 'call',
                               strike,
                               expirationDate: toTradingDate(expiration),
                               impliedVolAtEntry: state.vol,
                               impliedVolAtExit: 0, // Placeholder
                               optionEntryPrice: optionPrice,
                               optionExitPrice: 0,
                               contracts,
                               // Override Trade specific fields for now
                               entryPrice: spot, // Stock price
                               quantity: contracts
                           };

                           currentCapital -= contracts * optionPrice * 100;
                       }
                   }
               }
           }
        }

        // Update Portfolio Value
        if (activeTrade) {
             const state = getMarketState(dateStr);
             if (state) {
                 const spot = state.price;
                 const expiration = new Date(activeTrade.expirationDate);
                 const T = getYearsToMaturity(currentDate, expiration);

                 // Recalculate Vol (Rolling) for mark-to-market
                 // We use the same adjustment logic
                 // Note: In reality, IV might behave differently, but rolling vol is the request.
                 const vol = state.vol; // getMarketState applies the adjustment

                 const optionPrice = blackScholes('call', spot, activeTrade.strike, T, r, vol);
                 portfolioValue = currentCapital + (activeTrade.contracts * optionPrice * 100);

                 // CHECK EXIT
                 const tExit = typeof activeTrade.exitDate === 'string' ? activeTrade.exitDate.slice(0, 10) : new Date(activeTrade.exitDate).toISOString().slice(0, 10);

                 // Force exit if expiration reached or stock trade exited
                 // Note: Stock trade exit might be AFTER expiration if stock held long.
                 // Options have fixed expiry.
                 const isExpired = T <= 0;
                 const isStockExit = dateStr === tExit;

                 if (isStockExit || isExpired) {
                     // EXIT TRADE
                     activeTrade.optionExitPrice = optionPrice;
                     activeTrade.impliedVolAtExit = vol;
                     activeTrade.exitPrice = spot; // Stock price at exit

                     // PnL = (Exit - Entry) * Contracts * 100
                     const pnl = (activeTrade.optionExitPrice - activeTrade.optionEntryPrice) * activeTrade.contracts * 100;
                     activeTrade.pnl = pnl;

                     // PnL % = PnL / Invested
                     // Invested = Entry * Contracts * 100
                     activeTrade.pnlPercent = (pnl / (activeTrade.optionEntryPrice * activeTrade.contracts * 100)) * 100;

                     if (isExpired && !isStockExit) {
                         activeTrade.exitReason = "option_expired";
                     }

                     currentCapital += activeTrade.contracts * activeTrade.optionExitPrice * 100;

                     // Update context for UI to show correct capital
                     if (!activeTrade.context) activeTrade.context = {};
                     activeTrade.context = {
                         ...activeTrade.context,
                         currentCapitalAfterExit: currentCapital,
                         initialInvestment: activeTrade.contracts * activeTrade.optionEntryPrice * 100
                     };

                     optionTrades.push(activeTrade);
                     activeTrade = null;
                 }
             }
        } else {
            portfolioValue = currentCapital;
        }

        equity.push({
            date: toTradingDate(currentDate),
            value: portfolioValue,
            drawdown: 0 // TODO: Calculate drawdown if needed, or let frontend handle it
        });
    }

    // Calculate drawdowns
    let peak = initialCapital;
    equity.forEach(p => {
        if (p.value > peak) peak = p.value;
        p.drawdown = peak > 0 ? ((peak - p.value) / peak) * 100 : 0;
    });

    return {
        equity,
        trades: optionTrades,
        finalValue: portfolioValue
    };
}

export function runMultiTickerOptionsBacktest(
    stockTrades: Trade[],
    tickersData: TickerData[],
    config: OptionsBacktestConfig
): { equity: EquityPoint[]; trades: OptionTrade[]; finalValue: number } {
    const { strikePct, volAdjPct, capitalPct, riskFreeRate = 0.05, expirationWeeks = 4 } = config;
    const initialCapital = 10000;

    // 1. Prepare Data Maps for O(1) Access
    // ticker -> date -> { close, index, vol }
    interface DailyData { close: number; index: number; vol: number }
    const tickerMaps = new Map<string, Map<string, DailyData>>();
    const allDatesSet = new Set<string>();

    tickersData.forEach(td => {
        const dateMap = new Map<string, DailyData>();
        const ticker = td.ticker.toUpperCase();

        td.data.forEach((bar, idx) => {
            const dateStr = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
            allDatesSet.add(dateStr);

            // Calculate Volatility (30 day)
            // Note: This is expensive to do on the fly if optimized, but fine for now.
            const windowSize = 30;
            const startIndex = Math.max(0, idx - windowSize);
            const prices = td.data.slice(startIndex, idx + 1).map(b => b.close);
            let vol = calculateVolatility(prices, windowSize);
            vol = vol * (1 + volAdjPct / 100);

            dateMap.set(dateStr, { close: bar.close, index: idx, vol });
        });

        tickerMaps.set(ticker, dateMap);
    });

    // Sort dates
    const sortedDates = Array.from(allDatesSet).sort();

    // 2. Simulation State
    let currentCapital = initialCapital;
    let portfolioValue = initialCapital;
    const equity: EquityPoint[] = [];
    const closedTrades: OptionTrade[] = [];
    const activeTrades: OptionTrade[] = []; // Supports multiple open positions

    // 3. Main Loop
    for (const dateStr of sortedDates) {
        // Create Date object for expiration calculations (noon to avoid TZ issues)
        const [y, m, d] = dateStr.split('-').map(Number);
        const currentDate = new Date(y, m - 1, d, 12, 0, 0);

        // Determine Risk Free Rate for today
        const r = getRiskFreeRate(currentDate) ?? riskFreeRate;

        // A. Mark to Market & Check Exits for Active Trades
        // We use a reverse loop to safely remove items
        for (let i = activeTrades.length - 1; i >= 0; i--) {
            const trade = activeTrades[i];
            const ticker = (trade.context?.ticker || '').toUpperCase();
            const marketMap = tickerMaps.get(ticker);
            const marketData = marketMap?.get(dateStr);

            if (marketData) {
                const spot = marketData.close;
                const expiration = new Date(trade.expirationDate);
                const T = getYearsToMaturity(currentDate, expiration);
                const vol = marketData.vol;

                // Mark to Market Price
                let optionPrice = blackScholes('call', spot, trade.strike, T, r, vol);
                if (Number.isNaN(optionPrice) || optionPrice < 0.01) optionPrice = 0.01;

                // Check Conditions
                const tExit = typeof trade.exitDate === 'string' ? trade.exitDate.slice(0, 10) : new Date(trade.exitDate).toISOString().slice(0, 10);
                const isExpired = T <= 0;
                const isStockExit = dateStr === tExit;

                if (isStockExit || isExpired) {
                    // CLOSE TRADE
                    trade.optionExitPrice = optionPrice;
                    trade.impliedVolAtExit = vol;
                    trade.exitPrice = spot; // Stock price at exit

                    const pnl = (trade.optionExitPrice - trade.optionEntryPrice) * trade.contracts * 100;
                    trade.pnl = pnl;
                    trade.pnlPercent = (pnl / (trade.optionEntryPrice * trade.contracts * 100)) * 100;

                    if (isExpired && !isStockExit) {
                         trade.exitReason = "option_expired";
                    }

                    // Update Capital
                    currentCapital += trade.contracts * trade.optionExitPrice * 100;

                    // Update Context
                    if (!trade.context) trade.context = {};
                    trade.context = {
                         ...trade.context,
                         currentCapitalAfterExit: currentCapital,
                         initialInvestment: trade.contracts * trade.optionEntryPrice * 100
                    };

                    closedTrades.push(trade);
                    activeTrades.splice(i, 1);
                } else {
                    // Update current val (for equity calc later)
                    // We don't store it on trade object permanently, just use it for summation
                    // But we can update context if we want debugging
                }
            } else {
                // No data for this ticker today (e.g. halted, or different exchange holiday?)
                // Keep previous value? Or skip?
                // For now, if no data, we can't price it. We'll assume last known price effectively stays same if we don't change anything,
                // but we need the option price.
                // If we can't calculate, we might assume price=0 or last price.
                // Ideally we should have filled forward data.
                // For safety, if data missing, we skip update for this trade (assume price unchanged from yesterday)
                // This requires storing 'lastOptionPrice' on the trade.
            }
        }

        // B. Check New Entries
        // Find trades starting today
        const newStockTrades = stockTrades.filter(t => {
            const tEntry = typeof t.entryDate === 'string' ? t.entryDate.slice(0, 10) : new Date(t.entryDate).toISOString().slice(0, 10);
            return tEntry === dateStr;
        });

        for (const stockTrade of newStockTrades) {
            const ticker = (stockTrade.context?.ticker || '').toUpperCase();
            const marketMap = tickerMaps.get(ticker);
            const marketData = marketMap?.get(dateStr);

            // We can only enter if we have market data and valid volatility
            if (marketData && marketData.vol > 0) {
                const spot = marketData.close;
                const strikeRaw = spot * (1 + strikePct / 100);
                const strike = Math.round(strikeRaw);

                const expiration = getExpirationDate(currentDate, expirationWeeks);
                const T = getYearsToMaturity(currentDate, expiration);

                let optionPrice = blackScholes('call', spot, strike, T, r, marketData.vol);
                if (Number.isNaN(optionPrice) || optionPrice < 0.01) optionPrice = 0.01;

                if (optionPrice > 0) {
                    const investAmount = currentCapital * (capitalPct / 100);
                    const contracts = Math.floor(investAmount / (optionPrice * 100));

                    if (contracts >= 1) {
                         const newTrade: OptionTrade = {
                               ...stockTrade,
                               optionType: 'call',
                               strike,
                               expirationDate: toTradingDate(expiration),
                               impliedVolAtEntry: marketData.vol,
                               impliedVolAtExit: 0,
                               optionEntryPrice: optionPrice,
                               optionExitPrice: 0,
                               contracts,
                               entryPrice: spot,
                               quantity: contracts
                           };

                           currentCapital -= contracts * optionPrice * 100;
                           activeTrades.push(newTrade);
                    }
                }
            }
        }

        // C. Calculate Daily Equity
        // Equity = Cash + Sum(Active Option Market Values)
        let openPositionsValue = 0;
        activeTrades.forEach(trade => {
             // We need to re-calculate current value
             // We just did it in step A for exits, but we need it for those that remained.
             // Optimize: Step A could store the calculated price.
             // For now, let's just re-calc or reuse if we had a way.
             // Let's re-calc to be safe and simple.
             const ticker = (trade.context?.ticker || '').toUpperCase();
             const marketMap = tickerMaps.get(ticker);
             const marketData = marketMap?.get(dateStr);
             if (marketData) {
                 const T = getYearsToMaturity(currentDate, new Date(trade.expirationDate));
                 let price = blackScholes('call', marketData.close, trade.strike, T, r, marketData.vol);
                 if (Number.isNaN(price) || price < 0.01) price = 0.01;
                 openPositionsValue += trade.contracts * price * 100;
             } else {
                 // Fallback: use entry cost or 0? Use 0 to punish missing data.
             }
        });

        portfolioValue = currentCapital + openPositionsValue;

        equity.push({
            date: dateStr, // Keep as string for consistency
            value: portfolioValue,
            drawdown: 0
        });
    }

    // Post-process: Calculate Drawdowns
    let peak = initialCapital;
    equity.forEach(p => {
        if (p.value > peak) peak = p.value;
        p.drawdown = peak > 0 ? ((peak - p.value) / peak) * 100 : 0;
    });

    return {
        equity,
        trades: closedTrades,
        finalValue: portfolioValue
    };
}
