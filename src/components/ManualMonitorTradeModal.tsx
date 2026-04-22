import { useEffect, useLayoutEffect, useState } from 'react';
import { DatasetAPI } from '../lib/api';
import { CompactFormModal } from './ui/CompactFormModal';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';

type QuoteProvider = 'alpha_vantage' | 'finnhub' | 'twelve_data' | 'webull' | 'polygon';

interface ManualMonitorTradeModalProps {
  open: boolean;
  watchSymbols: string[];
  quoteProvider: QuoteProvider;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    symbol: string;
    entryDate: string;
    entryPrice: number;
    entryIBS?: number;
    notes?: string;
  }) => Promise<void> | void;
}

function getEtDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function calculateLiveIbs(quote: { high: number | null; low: number | null; current: number | null }): number | null {
  if (quote.high == null || quote.low == null || quote.current == null) return null;
  if (!(quote.high > quote.low)) return null;
  return Math.max(0, Math.min(1, (quote.current - quote.low) / (quote.high - quote.low)));
}

export function ManualMonitorTradeModal({
  open,
  watchSymbols,
  quoteProvider,
  loading = false,
  error = null,
  onClose,
  onSubmit,
}: ManualMonitorTradeModalProps) {
  const [symbol, setSymbol] = useState(watchSymbols[0] ?? '');
  const [entryDate, setEntryDate] = useState(getEtDateKey());
  const [entryPrice, setEntryPrice] = useState('');
  const [entryIbs, setEntryIbs] = useState('');
  const [notes, setNotes] = useState('');
  const [quoteHint, setQuoteHint] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const firstSymbol = watchSymbols[0] ?? '';
    setSymbol(firstSymbol);
    setEntryDate(getEtDateKey());
    setEntryPrice('');
    setEntryIbs('');
    setNotes('');
    setQuoteHint(firstSymbol ? `Подтягиваю текущую котировку по ${firstSymbol}…` : 'Сначала добавьте тикер в мониторинг.');
    setLocalError(null);
  }, [open, watchSymbols]);

  useEffect(() => {
    if (!open) return undefined;
    if (!symbol) {
      setQuoteHint(watchSymbols.length > 0 ? 'Выберите тикер.' : 'Сначала добавьте тикер в мониторинг.');
      return undefined;
    }

    let cancelled = false;
    setQuoteHint(`Подтягиваю текущую котировку по ${symbol}…`);

    void DatasetAPI.getQuote(symbol, quoteProvider)
      .then((quote) => {
        if (cancelled) return;
        setLocalError(null);
        const liveIbs = calculateLiveIbs(quote);
        setEntryPrice((prev) => prev.trim() ? prev : (quote.current != null ? quote.current.toFixed(2) : ''));
        setEntryIbs((prev) => prev.trim() ? prev : (liveIbs != null ? (liveIbs * 100).toFixed(1) : ''));
        setQuoteHint(
          quote.current != null
            ? `Текущая цена ${quote.current.toFixed(2)} USD из ${quoteProvider}`
            : 'Котировка недоступна, цену входа нужно указать вручную.'
        );
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setQuoteHint('Котировка недоступна, цену входа нужно указать вручную.');
        setLocalError((prev) => prev || (fetchError instanceof Error ? fetchError.message : 'Не удалось получить котировку'));
      });

    return () => {
      cancelled = true;
    };
  }, [open, quoteProvider, symbol, watchSymbols.length]);

  const handleSymbolChange = (nextSymbol: string) => {
    setSymbol(nextSymbol);
    setEntryPrice('');
    setEntryIbs('');
    setLocalError(null);
  };

  const handleSubmit = async () => {
    if (!symbol) {
      setLocalError('Выберите тикер из мониторинга.');
      return;
    }
    if (!entryDate) {
      setLocalError('Укажите дату входа.');
      return;
    }

    const numericPrice = Number(entryPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setLocalError('Укажите корректную цену входа.');
      return;
    }

    const numericIbsRaw = entryIbs.trim() === '' ? null : Number(entryIbs);
    if (numericIbsRaw != null && (!Number.isFinite(numericIbsRaw) || numericIbsRaw < 0 || numericIbsRaw > 100)) {
      setLocalError('IBS должен быть в диапазоне 0-100%.');
      return;
    }

    setLocalError(null);
    await onSubmit({
      symbol,
      entryDate,
      entryPrice: numericPrice,
      entryIBS: numericIbsRaw == null ? undefined : numericIbsRaw / 100,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <CompactFormModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Добавить ручную сделку"
      description={(
        <p>
          Сделка добавляется только в monitor-журнал. После сохранения стратегия будет считать позицию открытой и искать сигнал на выход.
        </p>
      )}
      error={localError || error}
      loading={loading}
      submitLabel="Добавить сделку"
      submitDisabled={watchSymbols.length === 0}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block">
          <Label>Тикер из мониторинга</Label>
          <Select
            aria-label="Тикер из мониторинга"
            value={symbol}
            onChange={(event) => handleSymbolChange(event.target.value)}
            disabled={watchSymbols.length === 0}
          >
            {watchSymbols.length === 0 ? (
              <option value="">Нет тикеров в мониторинге</option>
            ) : (
              watchSymbols.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))
            )}
          </Select>
        </div>

        <div className="block">
          <Label>Дата входа (ET)</Label>
          <Input
            aria-label="Дата входа (ET)"
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
          />
        </div>

        <div className="block">
          <Label>Цена входа</Label>
          <Input
            aria-label="Цена входа"
            type="number"
            step="0.01"
            value={entryPrice}
            onChange={(event) => setEntryPrice(event.target.value)}
            placeholder="Например, 198.42"
          />
          {quoteHint ? (
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{quoteHint}</span>
          ) : null}
        </div>

        <div className="block">
          <Label description="Необязательно. Можно оставить пустым, если IBS неизвестен.">Entry IBS, %</Label>
          <Input
            aria-label="Entry IBS, %"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={entryIbs}
            onChange={(event) => setEntryIbs(event.target.value)}
            placeholder="Например, 14.3"
          />
        </div>
      </div>

      <div className="block">
        <Label description="Например, почему пришлось корректировать мониторинг вручную.">Комментарий</Label>
        <Textarea
          aria-label="Комментарий"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Причина корректировки, источник входа, любые заметки"
          className="resize-y"
        />
      </div>
    </CompactFormModal>
  );
}
