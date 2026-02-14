import { useState, useMemo } from 'react';
import { simulateLeverage } from '../lib/backtest-utils';
import { EquityChart } from './EquityChart';
import { Button, Input, Label } from './ui';
import type { EquityPoint, OHLCData } from '../types';

interface BuyHoldAnalysisProps {
  marketData: OHLCData[];
  initialCapital: number;
}

export function BuyHoldAnalysis({ marketData, initialCapital }: BuyHoldAnalysisProps) {
  const [buyHoldMarginPctInput, setBuyHoldMarginPctInput] = useState<string>('100');
  const [buyHoldAppliedLeverage, setBuyHoldAppliedLeverage] = useState<number>(1);

  const buyHoldEquity = useMemo(() => {
    try {
      if (!Array.isArray(marketData) || marketData.length === 0) return [] as { date: Date; value: number; drawdown: number }[];
      const first = marketData[0];
      const firstPrice = typeof first?.adjClose === 'number' && first.adjClose > 0 ? first.adjClose : first.close;
      if (!firstPrice || firstPrice <= 0) return [] as { date: Date; value: number; drawdown: number }[];
      let peak = initialCapital;
      const series = marketData.map(b => {
        const price = typeof b?.adjClose === 'number' && b.adjClose > 0 ? b.adjClose : b.close;
        const value = initialCapital * (price / firstPrice);
        if (value > peak) peak = value;
        const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        const d = new Date(b.date);
        return { date: d, value, drawdown };
      });
      return series;
    } catch {
      return [] as { date: Date; value: number; drawdown: number }[];
    }
  }, [marketData, initialCapital]);

  const buyHoldSimEquity = useMemo(() => (
    simulateLeverage(buyHoldEquity as unknown as EquityPoint[], buyHoldAppliedLeverage).equity
  ), [buyHoldEquity, buyHoldAppliedLeverage]);

  const onApplyBuyHold = () => {
    const pct = Number(buyHoldMarginPctInput);
    if (!isFinite(pct) || pct <= 0) return;
    setBuyHoldAppliedLeverage(pct / 100);
  };

  return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <Label>Маржинальность, %</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={buyHoldMarginPctInput}
              onChange={(e) => setBuyHoldMarginPctInput(e.target.value)}
              className="w-40"
              placeholder="например, 100"
            />
          </div>
          <Button
            onClick={onApplyBuyHold}
            variant="primary"
          >
            Посчитать
          </Button>
          <div className="text-xs text-gray-500 dark:text-gray-300 pb-2">
            Текущее плечо: ×{buyHoldAppliedLeverage.toFixed(2)}
          </div>
        </div>
        <div className="h-[72vh] min-h-[560px] md:min-h-[700px] max-h-[1100px]">
          <EquityChart equity={buyHoldSimEquity.length ? buyHoldSimEquity : (buyHoldEquity as unknown as EquityPoint[])} />
        </div>
      </div>
  );
}
