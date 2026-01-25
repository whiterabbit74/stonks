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
    maxHoldingDays?: number; // default 30
}

export interface OptionTrade extends Trade {
    optionType: 'call';
    strike: number;
    expirationDate: string;
    impliedVolAtEntry: number;
    impliedVolAtExit: number;
    optionEntryPrice: number; // Stored as Integer Dollars per Contract (e.g. 1, 55, 120)
    optionExitPrice: number;
    contracts: number;
}

interface TickerData {
    ticker: string;
    data: OHLCData[];
}

/**
 * Calculates the execution price for an option CONTRACT based on market conventions.
 * Returns an INTEGER value representing Dollars per Contract.
 *
 * Rules:
 * 1. Theoretical Share Price < $0.005: Worthless. Returns 0.
 * 2. $0.005 <= Share Price < $0.01: Rounds up to $0.01 -> Contract Price $1.
 * 3. Share Price < $3.00: Round to nearest $0.01 -> Contract Price to nearest $1.
 * 4. Share Price >= $3.00: Round to nearest $0.05 -> Contract Price to nearest $5.
 *
 * @param theoreticalPrice The raw Black-Scholes price (per share)
 * @returns Executable Contract Price in Dollars (Integer).
 */
function getExecutionPrice(theoreticalPrice: number): number {
    // 1. Worthless check (Deep OTM)
    if (theoreticalPrice < 0.005) {
        return 0;
    }

    // 2. Minimum Tick Logic
    // We work with Contract Price immediately to ensure integers.
    // Contract Value = Share Price * 100.
    const rawContractValue = theoreticalPrice * 100;

    if (theoreticalPrice < 3.00) {
        // Round to nearest $1 (1 cent per share)
        return Math.round(rawContractValue);
    } else {
        // Round to nearest $5 (5 cents per share)
        return Math.round(rawContractValue / 5) * 5;
    }
}

export function runOptionsBacktest(
    stockTrades: Trade[],
    marketData: OHLCData[],
    config: OptionsBacktestConfig
): { equity: EquityPoint[]; trades: OptionTrade[]; finalValue: number } {
    const { strikePct, volAdjPct, capitalPct, riskFreeRate = 0.05, expirationWeeks = 4, maxHoldingDays = 30 } = config;
    const initialCapital = 10000;

    const datePriceMap = new Map<string, { close: number; index: number }>();
    marketData.forEach((bar, idx) => {
        const dKey = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
        datePriceMap.set(dKey, { close: bar.close, index: idx });
    });

    const getMarketState = (dateStr: string) => {
        const entry = datePriceMap.get(dateStr);
        if (!entry) return null;

        const windowSize = 30;
        const startIndex = Math.max(0, entry.index - windowSize);
        const prices = marketData.slice(startIndex, entry.index + 1).map(b => b.close);

        let vol = calculateVolatility(prices, windowSize);
        vol = vol * (1 + volAdjPct / 100);

        return { price: entry.close, vol, index: entry.index };
    };

    let currentCapital = initialCapital;
    const equity: EquityPoint[] = [];
    const optionTrades: OptionTrade[] = [];

    let activeTrade: OptionTrade | null = null;
    let portfolioValue = initialCapital;

    for (let i = 0; i < marketData.length; i++) {
        const bar = marketData[i];
        const dateStr = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
        const [y, m, d] = dateStr.split('-').map(Number);
        const currentDate = new Date(y, m - 1, d, 12, 0, 0);
        const r = getRiskFreeRate(currentDate) ?? riskFreeRate;

        // Try to Enter
        if (!activeTrade) {
           const matchingStockTrade = stockTrades.find(t => {
               const tEntry = typeof t.entryDate === 'string' ? t.entryDate.slice(0, 10) : new Date(t.entryDate).toISOString().slice(0, 10);
               return tEntry === dateStr;
           });

           if (matchingStockTrade) {
               const state = getMarketState(dateStr);
               if (state && state.vol > 0) {
                   const spot = state.price;
                   const strikeRaw = spot * (1 + strikePct / 100);
                   const strike = Math.round(strikeRaw);

                   const expiration = getExpirationDate(currentDate, expirationWeeks);
                   const T = getYearsToMaturity(currentDate, expiration);

                   const theoreticalPrice = blackScholes('call', spot, strike, T, r, state.vol);
                   const optionContractPrice = getExecutionPrice(theoreticalPrice);

                   // Entry Condition: Price must be > 0
                   if (optionContractPrice > 0) {
                       const investAmount = currentCapital * (capitalPct / 100);
                       // Cost is explicitly the contract price

                       const contracts = Math.floor(investAmount / optionContractPrice);

                       if (contracts >= 1) {
                           activeTrade = {
                               ...matchingStockTrade,
                               optionType: 'call',
                               strike,
                               expirationDate: toTradingDate(expiration),
                               impliedVolAtEntry: state.vol,
                               impliedVolAtExit: 0,
                               optionEntryPrice: optionContractPrice,
                               optionExitPrice: 0,
                               contracts,
                               entryPrice: spot,
                               quantity: contracts
                           };

                           // Deduct Cost
                           currentCapital -= contracts * optionContractPrice;
                       }
                   }
               }
           }
        }

        // Update / Exit
        if (activeTrade) {
             const state = getMarketState(dateStr);
             if (state) {
                 const spot = state.price;
                 const expiration = new Date(activeTrade.expirationDate);
                 const T = getYearsToMaturity(currentDate, expiration);
                 const vol = state.vol;

                 const theoreticalPrice = blackScholes('call', spot, activeTrade.strike, T, r, vol);
                 let optionContractPrice = getExecutionPrice(theoreticalPrice);

                 // Update Portfolio Value (Mark to Market)
                 portfolioValue = currentCapital + (activeTrade.contracts * optionContractPrice);

                 const tExit = typeof activeTrade.exitDate === 'string' ? activeTrade.exitDate.slice(0, 10) : new Date(activeTrade.exitDate).toISOString().slice(0, 10);
                 const entryStr = typeof activeTrade.entryDate === 'string' ? activeTrade.entryDate.slice(0, 10) : new Date(activeTrade.entryDate).toISOString().slice(0, 10);
                 const [ey, em, ed] = entryStr.split('-').map(Number);
                 const entryDate = new Date(ey, em - 1, ed, 12, 0, 0);
                 const daysHeld = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 3600 * 24));
                 const isMaxHold = daysHeld >= maxHoldingDays;
                 const isExpired = T <= 0;
                 const isStockExit = dateStr === tExit;

                 if (isStockExit || isExpired || isMaxHold) {
                     // EXIT

                     if (isExpired) {
                         const intrinsic = Math.max(0, spot - activeTrade.strike);
                         optionContractPrice = getExecutionPrice(intrinsic);
                         activeTrade.exitReason = "option_expired";
                     } else if (isMaxHold && !isStockExit) {
                         activeTrade.exitReason = "max_hold";
                         activeTrade.exitDate = dateStr;
                     }

                     activeTrade.optionExitPrice = optionContractPrice;
                     activeTrade.impliedVolAtExit = vol;
                     activeTrade.exitPrice = spot;

                     // PnL (Prices are already per contract)
                     const proceeds = activeTrade.contracts * optionContractPrice;
                     const cost = activeTrade.contracts * activeTrade.optionEntryPrice;
                     const pnl = proceeds - cost;

                     activeTrade.pnl = pnl;
                     activeTrade.pnlPercent = (pnl / cost) * 100;
                     activeTrade.duration = daysHeld;

                     currentCapital += proceeds;

                     if (!activeTrade.context) activeTrade.context = {};
                     activeTrade.context = {
                         ...activeTrade.context,
                         currentCapitalAfterExit: currentCapital,
                         initialInvestment: cost,
                         grossInvestment: cost,
                         marginUsed: cost,
                         netProceeds: proceeds
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
            drawdown: 0
        });
    }

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
    const { strikePct, volAdjPct, capitalPct, riskFreeRate = 0.05, expirationWeeks = 4, maxHoldingDays = 30 } = config;
    const initialCapital = 10000;

    interface DailyData { close: number; index: number; vol: number }
    const tickerMaps = new Map<string, Map<string, DailyData>>();
    const allDatesSet = new Set<string>();

    tickersData.forEach(td => {
        const dateMap = new Map<string, DailyData>();
        const ticker = td.ticker.toUpperCase();
        td.data.forEach((bar, idx) => {
            const dateStr = typeof bar.date === 'string' ? bar.date.slice(0, 10) : new Date(bar.date).toISOString().slice(0, 10);
            allDatesSet.add(dateStr);
            const windowSize = 30;
            const startIndex = Math.max(0, idx - windowSize);
            const prices = td.data.slice(startIndex, idx + 1).map(b => b.close);
            let vol = calculateVolatility(prices, windowSize);
            vol = vol * (1 + volAdjPct / 100);
            dateMap.set(dateStr, { close: bar.close, index: idx, vol });
        });
        tickerMaps.set(ticker, dateMap);
    });

    const sortedDates = Array.from(allDatesSet).sort();

    let currentCapital = initialCapital;
    let portfolioValue = initialCapital;
    const equity: EquityPoint[] = [];
    const closedTrades: OptionTrade[] = [];
    const activeTrades: OptionTrade[] = [];

    for (const dateStr of sortedDates) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const currentDate = new Date(y, m - 1, d, 12, 0, 0);
        const r = getRiskFreeRate(currentDate) ?? riskFreeRate;

        // A. Mark to Market & Check Exits
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

                const theoreticalPrice = blackScholes('call', spot, trade.strike, T, r, vol);
                let optionContractPrice = getExecutionPrice(theoreticalPrice);

                const tExit = typeof trade.exitDate === 'string' ? trade.exitDate.slice(0, 10) : new Date(trade.exitDate).toISOString().slice(0, 10);
                const entryStr = typeof trade.entryDate === 'string' ? trade.entryDate.slice(0, 10) : new Date(trade.entryDate).toISOString().slice(0, 10);
                const [ey, em, ed] = entryStr.split('-').map(Number);
                const entryDate = new Date(ey, em - 1, ed, 12, 0, 0);
                const daysHeld = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 3600 * 24));
                const isMaxHold = daysHeld >= maxHoldingDays;
                const isExpired = T <= 0;
                const isStockExit = dateStr === tExit;

                if (isStockExit || isExpired || isMaxHold) {
                    if (isExpired) {
                        const intrinsic = Math.max(0, spot - trade.strike);
                        optionContractPrice = getExecutionPrice(intrinsic);
                        trade.exitReason = "option_expired";
                    } else if (isMaxHold && !isStockExit) {
                        trade.exitReason = "max_hold";
                        trade.exitDate = dateStr;
                    }

                    trade.optionExitPrice = optionContractPrice;
                    trade.impliedVolAtExit = vol;
                    trade.exitPrice = spot;

                    const proceeds = trade.contracts * optionContractPrice;
                    const cost = trade.contracts * trade.optionEntryPrice;
                    const pnl = proceeds - cost;

                    trade.pnl = pnl;
                    trade.pnlPercent = (pnl / cost) * 100;
                    trade.duration = daysHeld;

                    currentCapital += proceeds;

                    if (!trade.context) trade.context = {};
                    trade.context = {
                         ...trade.context,
                         currentCapitalAfterExit: currentCapital,
                         initialInvestment: cost,
                         grossInvestment: cost,
                         marginUsed: cost,
                         netProceeds: proceeds
                    };

                    closedTrades.push(trade);
                    activeTrades.splice(i, 1);
                }
            }
        }

        // B. Check New Entries
        const newStockTrades = stockTrades.filter(t => {
            const tEntry = typeof t.entryDate === 'string' ? t.entryDate.slice(0, 10) : new Date(t.entryDate).toISOString().slice(0, 10);
            return tEntry === dateStr;
        });

        for (const stockTrade of newStockTrades) {
            const ticker = (stockTrade.context?.ticker || '').toUpperCase();
            const marketMap = tickerMaps.get(ticker);
            const marketData = marketMap?.get(dateStr);

            if (marketData && marketData.vol > 0) {
                const spot = marketData.close;
                const strikeRaw = spot * (1 + strikePct / 100);
                const strike = Math.round(strikeRaw);

                const expiration = getExpirationDate(currentDate, expirationWeeks);
                const T = getYearsToMaturity(currentDate, expiration);

                const theoreticalPrice = blackScholes('call', spot, strike, T, r, marketData.vol);
                const optionContractPrice = getExecutionPrice(theoreticalPrice);

                if (optionContractPrice > 0) {
                    const investAmount = currentCapital * (capitalPct / 100);
                    // Price is already per contract
                    const contracts = Math.floor(investAmount / optionContractPrice);

                    if (contracts >= 1) {
                         const newTrade: OptionTrade = {
                               ...stockTrade,
                               optionType: 'call',
                               strike,
                               expirationDate: toTradingDate(expiration),
                               impliedVolAtEntry: marketData.vol,
                               impliedVolAtExit: 0,
                               optionEntryPrice: optionContractPrice,
                               optionExitPrice: 0,
                               contracts,
                               entryPrice: spot,
                               quantity: contracts
                           };

                           currentCapital -= contracts * optionContractPrice;
                           activeTrades.push(newTrade);
                    }
                }
            }
        }

        // C. Calculate Daily Equity
        let openPositionsValue = 0;
        activeTrades.forEach(trade => {
             const ticker = (trade.context?.ticker || '').toUpperCase();
             const marketMap = tickerMaps.get(ticker);
             const marketData = marketMap?.get(dateStr);
             if (marketData) {
                 const T = getYearsToMaturity(currentDate, new Date(trade.expirationDate));
                 const theoreticalPrice = blackScholes('call', marketData.close, trade.strike, T, r, marketData.vol);
                 const contractPrice = getExecutionPrice(theoreticalPrice);
                 openPositionsValue += trade.contracts * contractPrice;
             }
        });

        portfolioValue = currentCapital + openPositionsValue;

        equity.push({
            date: dateStr,
            value: portfolioValue,
            drawdown: 0
        });
    }

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
