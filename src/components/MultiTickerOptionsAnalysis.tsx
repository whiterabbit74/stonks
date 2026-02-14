import { useMemo, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { OHLCData, Trade } from '../types';
import { runMultiTickerOptionsBacktest } from '../lib/optionsBacktest';
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
        // Flatten and sort trades from all tickers to create a global timeline
        const allStockTrades = Object.values(tradesByTicker).flat().sort((a, b) => {
             const dateA = new Date(a.entryDate).getTime();
             const dateB = new Date(b.entryDate).getTime();
             return dateA - dateB;
        });

        const result = runMultiTickerOptionsBacktest(allStockTrades, tickersData, {
            strikePct,
            volAdjPct,
            capitalPct,
            expirationWeeks
        });

        const totalInitialCapital = 10000; // Hardcoded in backtest engine as shared pool
        const totalRet = ((result.finalValue - totalInitialCapital) / totalInitialCapital) * 100;

        return {
            equity: result.equity,
            trades: result.trades,
            finalValue: result.finalValue,
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
                            <li>Используется единый портфель с начальным капиталом ${formatCurrency(initialCapital)}.</li>
                            <li>Сделки открываются последовательно по всем тикерам из общего бюджета.</li>
                            <li>Размер позиции рассчитывается как % от текущего свободного капитала портфеля.</li>
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

            <div className="h-[620px] lg:h-[700px]">
                <EquityChart equity={equity} />
            </div>

            <TradesTable trades={trades} exportFileNamePrefix="multi-ticker-options-trades" />
        </div>
    );
}
