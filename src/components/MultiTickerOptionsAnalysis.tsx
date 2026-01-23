import { useMemo, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { OHLCData, Trade } from '../types';
import { runOptionsBacktest } from '../lib/optionsBacktest';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { formatCurrency, formatPercentage } from '../lib/utils';

// Redefine TickerData here to avoid import issues if not exported elsewhere
interface TickerData {
    ticker: string;
    data: OHLCData[];
}

interface MultiTickerOptionsAnalysisProps {
    tickersData: TickerData[];
    tradesByTicker: Record<string, Trade[]>;
}

export function MultiTickerOptionsAnalysis({ tickersData, tradesByTicker }: MultiTickerOptionsAnalysisProps) {
    const [strikePct, setStrikePct] = useState<number>(10);
    const [volAdjPct, setVolAdjPct] = useState<number>(20);
    const [capitalPct, setCapitalPct] = useState<number>(10);
    const [expirationWeeks, setExpirationWeeks] = useState<number>(4);

    const { equity, trades, finalValue, totalReturn, initialCapital } = useMemo(() => {
        // Run backtest for each ticker
        const results = tickersData.map(td => {
            const tickerTrades = tradesByTicker[td.ticker] || [];
            // Assuming each backtest starts with 10k
            return runOptionsBacktest(tickerTrades, td.data, {
                strikePct,
                volAdjPct,
                capitalPct,
                expirationWeeks
            });
        });

        // 1. Aggregate Equity
        let minDateStr: string | null = null;
        let maxDateStr: string | null = null;

        // Collect all dates from all equity curves to handle alignment
        const allDates = new Set<string>();
        results.forEach(res => {
            res.equity.forEach(pt => {
                // date is TradingDate string (YYYY-MM-DD) or Date
                const d = typeof pt.date === 'string' ? pt.date.slice(0, 10) : new Date(pt.date).toISOString().slice(0, 10);
                allDates.add(d);
                if (!minDateStr || d < minDateStr) minDateStr = d;
                if (!maxDateStr || d > maxDateStr) maxDateStr = d;
            });
        });

        const sortedDates = Array.from(allDates).sort();

        // Sum equity for each date.
        // If a ticker has no data for a date (e.g. hasn't started trading),
        // we should theoretically add its initial capital (10000) assuming the money is sitting in cash,
        // OR add the nearest previous value.
        // runOptionsBacktest returns equity for all dates in marketData.

        const aggregatedEquity = sortedDates.map(dateStr => {
            let totalVal = 0;
            results.forEach(res => {
                // Find point for this date
                const pt = res.equity.find(p => {
                    const d = typeof p.date === 'string' ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
                    return d === dateStr;
                });

                if (pt) {
                    totalVal += pt.value;
                } else {
                    // If no point found for this date, look for the most recent previous point
                    // If before start, assume initial capital (10000)
                    const reversed = [...res.equity].reverse();
                    const prev = reversed.find(p => {
                        const d = typeof p.date === 'string' ? p.date.slice(0, 10) : new Date(p.date).toISOString().slice(0, 10);
                        return d < dateStr;
                    });

                    if (prev) {
                        totalVal += prev.value;
                    } else {
                        // Before simulation starts for this ticker
                        totalVal += 10000;
                    }
                }
            });

            return {
                date: dateStr,
                value: totalVal,
                drawdown: 0 // Will calc later
            };
        });

        // Calculate Portfolio Drawdown
        let peak = 0;
        aggregatedEquity.forEach(pt => {
            if (pt.value > peak) peak = pt.value;
            pt.drawdown = peak > 0 ? ((peak - pt.value) / peak) * 100 : 0;
        });

        // 2. Aggregate Trades
        const allTrades = results.flatMap(r => r.trades).sort((a, b) => {
            const dateA = new Date(a.entryDate).getTime();
            const dateB = new Date(b.entryDate).getTime();
            return dateA - dateB;
        });

        // 3. Stats
        // Each ticker starts with 10k
        const totalInitialCapital = 10000 * tickersData.length;
        const totalFinalValue = aggregatedEquity.length > 0 ? aggregatedEquity[aggregatedEquity.length - 1].value : totalInitialCapital;
        const totalRet = totalInitialCapital > 0 ? ((totalFinalValue - totalInitialCapital) / totalInitialCapital) * 100 : 0;

        return {
            equity: aggregatedEquity,
            trades: allTrades,
            finalValue: totalFinalValue,
            totalReturn: totalRet,
            initialCapital: totalInitialCapital
        };

    }, [tickersData, tradesByTicker, strikePct, volAdjPct, capitalPct, expirationWeeks]);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                <div className="flex flex-col md:flex-row md:items-end gap-4 mb-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Страйк (выше текущей)
                        </label>
                        <select
                            value={strikePct}
                            onChange={(e) => setStrikePct(Number(e.target.value))}
                            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 sm:text-sm"
                        >
                            <option value={5}>+5%</option>
                            <option value={10}>+10%</option>
                            <option value={15}>+15%</option>
                            <option value={20}>+20%</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                           Коррекция волатильности
                        </label>
                        <select
                            value={volAdjPct}
                            onChange={(e) => setVolAdjPct(Number(e.target.value))}
                            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 sm:text-sm"
                        >
                             <option value={0}>0%</option>
                             <option value={5}>+5%</option>
                             <option value={10}>+10%</option>
                             <option value={15}>+15%</option>
                             <option value={20}>+20%</option>
                             <option value={25}>+25%</option>
                             <option value={30}>+30%</option>
                             <option value={35}>+35%</option>
                             <option value={40}>+40%</option>
                             <option value={45}>+45%</option>
                             <option value={50}>+50%</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                           % от капитала (вход)
                        </label>
                        <select
                            value={capitalPct}
                            onChange={(e) => setCapitalPct(Number(e.target.value))}
                            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 sm:text-sm"
                        >
                             <option value={5}>5%</option>
                             <option value={10}>10%</option>
                             <option value={15}>15%</option>
                             <option value={20}>20%</option>
                             <option value={25}>25%</option>
                             <option value={30}>30%</option>
                             <option value={35}>35%</option>
                             <option value={40}>40%</option>
                             <option value={45}>45%</option>
                             <option value={50}>50%</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                           Экспирация
                        </label>
                        <select
                            value={expirationWeeks}
                            onChange={(e) => setExpirationWeeks(Number(e.target.value))}
                            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 sm:text-sm"
                        >
                             <option value={1}>1 неделя</option>
                             <option value={2}>2 недели</option>
                             <option value={3}>3 недели</option>
                             <option value={4}>1 месяц</option>
                             <option value={8}>2 месяца</option>
                             <option value={12}>3 месяца</option>
                             <option value={16}>4 месяца</option>
                             <option value={20}>5 месяцев</option>
                             <option value={24}>6 месяцев</option>
                        </select>
                    </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                    <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold mb-1">О моделировании портфеля опционов:</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Симуляция проводится независимо для каждого тикера с начальным капиталом $10,000.</li>
                            <li>Общий график показывает сумму капиталов всех стратегий (Старт: ${formatCurrency(initialCapital)}).</li>
                            <li>Параметры применяются одинаково ко всем тикерам.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Общая доходность</div>
                    <div className={`text-2xl font-bold ${totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatPercentage(totalReturn / 100)}
                    </div>
                 </div>
                 <div className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Конечный капитал</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(finalValue)}
                    </div>
                 </div>
                  <div className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Всего сделок</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {trades.length}
                    </div>
                 </div>
            </div>

            <div className="h-[500px]">
                <EquityChart equity={equity} />
            </div>

            <TradesTable trades={trades} exportFileNamePrefix="multi-ticker-options-trades" />
        </div>
    );
}
