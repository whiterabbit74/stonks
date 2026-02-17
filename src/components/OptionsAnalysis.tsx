import { useEffect, useMemo, useRef, useState } from 'react';
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
    const [capitalPct, setCapitalPct] = useState<number>(10);
    const [expirationWeeks, setExpirationWeeks] = useState<number>(4);
    const [maxHoldingDays, setMaxHoldingDays] = useState<number>(30);
    const [showModelingInfo, setShowModelingInfo] = useState(false);
    const modelingInfoRef = useRef<HTMLDivElement | null>(null);

    const { equity, trades, finalValue } = useMemo(() => {
        return runOptionsBacktest(stockTrades, marketData, {
            strikePct,
            volAdjPct,
            capitalPct,
            expirationWeeks,
            maxHoldingDays
        });
    }, [stockTrades, marketData, strikePct, volAdjPct, capitalPct, expirationWeeks, maxHoldingDays]);

    // Initial capital is hardcoded in backtest as 10000 for now
    const initialCapital = 10000;
    const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

    useEffect(() => {
        if (!showModelingInfo) return;

        const handleOutsideClick = (event: MouseEvent) => {
            if (!modelingInfoRef.current) return;
            if (!modelingInfoRef.current.contains(event.target as Node)) {
                setShowModelingInfo(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showModelingInfo]);

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

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                           Макс. удержание (дней)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={maxHoldingDays}
                            onChange={(e) => setMaxHoldingDays(Number(e.target.value))}
                            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 sm:text-sm"
                        />
                    </div>

                    <div ref={modelingInfoRef} className="relative md:ml-auto">
                        <button
                            type="button"
                            onClick={() => setShowModelingInfo((prev) => !prev)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                            title="Информация о моделировании"
                            aria-label="Информация о моделировании"
                        >
                            <HelpCircle className="h-4 w-4" />
                        </button>
                        {showModelingInfo && (
                            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                <p className="font-semibold mb-2">О моделировании</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Покупка Call-опционов вместо акций при сигналах стратегии.</li>
                                    <li>Экспирация: расчетная дата (через выбранный период + до ближайшей пятницы).</li>
                                    <li>Цена опциона: теоретическая (Black-Scholes).</li>
                                    <li>Волатильность: историческая за 30 дней + ваша коррекция.</li>
                                    <li>Страйк округляется до ближайшего целого числа.</li>
                                </ul>
                            </div>
                        )}
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

            <div className="h-[620px] lg:h-[700px]">
                <EquityChart equity={equity} />
            </div>

            <TradesTable trades={trades} exportFileNamePrefix="options-trades" />
        </div>
    );
}
