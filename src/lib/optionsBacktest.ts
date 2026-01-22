import type { Trade, OHLCData, EquityPoint } from '../types';
import { blackScholes, calculateVolatility, getExpirationDate, getYearsToMaturity } from './optionsMath';
import { toTradingDate } from './date-utils';

interface OptionsBacktestConfig {
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
        const currentDate = new Date(dateStr);

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
               if (state) {
                   const spot = state.price;
                   // Strike: Current Price + X%, rounded to integer
                   const strikeRaw = spot * (1 + strikePct / 100);
                   const strike = Math.round(strikeRaw);

                   const expiration = getExpirationDate(currentDate, expirationWeeks);
                   const T = getYearsToMaturity(currentDate, expiration);

                   // Option Price (Ask)
                   // We don't have Bid/Ask, so we use theoretical price
                   let optionPrice = blackScholes('call', spot, strike, T, riskFreeRate, state.vol);

                   // Enforce minimum price of 0.01 to ensure trade execution even for deep OTM options
                   // This prevents trades from disappearing when changing strike/vol parameters
                   if (optionPrice < 0.01) optionPrice = 0.01;

                   if (optionPrice > 0) {
                       // Buy max contracts with available capital
                       // Contract size usually 100.
                       // For simplicity, let's treat it as buying fractional options or 1 unit = 1 option (not 100 shares).
                       // To make it comparable to stock trading amount, we usually invest the same $ amount.
                       const investAmount = currentCapital * (capitalPct / 100);
                       const contracts = investAmount / optionPrice;

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

                       currentCapital -= contracts * optionPrice; // Should be ~0
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

                 const optionPrice = blackScholes('call', spot, activeTrade.strike, T, riskFreeRate, vol);
                 portfolioValue = currentCapital + (activeTrade.contracts * optionPrice);

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

                     const pnl = (activeTrade.optionExitPrice - activeTrade.optionEntryPrice) * activeTrade.contracts;
                     activeTrade.pnl = pnl;
                     activeTrade.pnlPercent = (pnl / (activeTrade.optionEntryPrice * activeTrade.contracts)) * 100;

                     if (isExpired && !isStockExit) {
                         activeTrade.exitReason = "option_expired";
                     }

                     optionTrades.push(activeTrade);
                     currentCapital += activeTrade.contracts * activeTrade.optionExitPrice;
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
