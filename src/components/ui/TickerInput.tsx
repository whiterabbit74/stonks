import React from 'react';
import { Input } from './Input';

interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  onTickersChange: (tickers: string[]) => void;
  tickers: string[];
  className?: string;
  placeholder?: string;
}

export function TickerInput({
  value,
  onChange,
  onTickersChange,
  tickers,
  className = '',
  placeholder = 'AAPL, MSFT, AMZN, MAGS'
}: TickerInputProps) {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);

    const parsedTickers = Array.from(new Set(
      newVal
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(Boolean)
    ));
    onTickersChange(parsedTickers);
  };

  return (
    <div className={className}>
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tickers.map((ticker, idx) => (
            <span
              key={ticker}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                idx % 4 === 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                idx % 4 === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                idx % 4 === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
              }`}
            >
              {ticker}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
