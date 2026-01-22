import { useMemo, useState } from 'react';
import type { OHLCData, Trade } from '../types';
import { runOptionsBacktest } from '../lib/optionsBacktest';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { formatCurrency, formatPercentage } from '../lib/utils';
import { HelpCircle } from 'lucide-react';

interface OptionsAnalysisProps {
    stockTrades: Trade[];
    marketData: OHLCData[];
}

export function OptionsAnalysis({ stockTrades, marketData }: OptionsAnalysisProps) {
    const [strikePct, setStrikePct] = useState<number>(10);
    const [volAdjPct, setVolAdjPct] = useState<number>(20);

    const { equity, trades, finalValue } = useMemo(() => {
        return runOptionsBacktest(stockTrades, marketData, {
            strikePct,
            volAdjPct
        });
    }, [stockTrades, marketData, strikePct, volAdjPct]);

    // Initial capital is hardcoded in backtest as 10000 for now
    const initialCapital = 10000;
    const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

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
                        </select>
                    </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                    <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold mb-1">О моделировании:</p>
                        <ul className="list-disc list-inside space-y-1 opacity-90">
                            <li>Покупка Call-опционов вместо акций при сигналах стратегии.</li>
                            <li>Экспирация: ближайшая пятница через месяц.</li>
                            <li>Цена опциона: теоретическая (Black-Scholes).</li>
                            <li>Волатильность: историческая за 30 дней + ваша коррекция.</li>
                            <li>Страйк округляется до ближайшего целого числа.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="p-4 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Доходность</div>
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
                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Сделок</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {trades.length}
                    </div>
                 </div>
            </div>

            <div className="h-[500px]">
                <EquityChart equity={equity} />
            </div>

            <TradesTable trades={trades} exportFileNamePrefix="options-trades" />
        </div>
    );
}
