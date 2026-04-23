import { useLayoutEffect, useState } from 'react';
import type { MonitorTradeRecord } from '../types';
import { CompactFormModal } from './ui/CompactFormModal';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';

interface EditMonitorTradePayload {
  entryDate: string;
  entryPrice: number;
  entryIBS: number | null;
  exitDate?: string | null;
  exitPrice?: number | null;
  exitIBS?: number | null;
  quantity: number | null;
  notes: string | null;
  isHidden: boolean;
  isTest: boolean;
}

interface EditMonitorTradeModalProps {
  open: boolean;
  trade: MonitorTradeRecord | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: EditMonitorTradePayload) => Promise<void> | void;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '';
}

function formatIbsPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(1) : '';
}

export function EditMonitorTradeModal({
  open,
  trade,
  loading = false,
  error = null,
  onClose,
  onSubmit,
}: EditMonitorTradeModalProps) {
  const [entryDate, setEntryDate] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryIbs, setEntryIbs] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [exitIbs, setExitIbs] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isClosed = trade?.status === 'closed';

  useLayoutEffect(() => {
    if (!open || !trade) return;
    setEntryDate(trade.entryDate ?? '');
    setEntryPrice(formatNumber(trade.entryPrice));
    setEntryIbs(formatIbsPercent(trade.entryIBS));
    setExitDate(trade.exitDate ?? '');
    setExitPrice(formatNumber(trade.exitPrice));
    setExitIbs(formatIbsPercent(trade.exitIBS));
    setQuantity(formatNumber(trade.quantity, 4).replace(/0+$/, '').replace(/\.$/, ''));
    setNotes(trade.notes ?? '');
    setIsHidden(!!trade.isHidden);
    setIsTest(!!trade.isTest);
    setLocalError(null);
  }, [open, trade]);

  if (!open || !trade) return null;

  const parseIbs = (raw: string, label: string): number | null => {
    if (raw.trim() === '') return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw new Error(`${label} должен быть в диапазоне 0-100%.`);
    }
    return numeric / 100;
  };

  const handleSubmit = async () => {
    if (!entryDate) {
      setLocalError('Укажите дату входа.');
      return;
    }

    const numericEntryPrice = Number(entryPrice);
    if (!Number.isFinite(numericEntryPrice) || numericEntryPrice <= 0) {
      setLocalError('Укажите корректную цену входа.');
      return;
    }

    const numericQuantity = quantity.trim() === '' ? null : Number(quantity);
    if (numericQuantity != null && (!Number.isFinite(numericQuantity) || numericQuantity <= 0)) {
      setLocalError('Количество должно быть положительным числом.');
      return;
    }

    try {
      const numericExitPrice = exitPrice.trim() === '' ? null : Number(exitPrice);
      if (isClosed && (numericExitPrice == null || !Number.isFinite(numericExitPrice) || numericExitPrice <= 0)) {
        setLocalError('Укажите корректную цену выхода.');
        return;
      }

      setLocalError(null);
      await onSubmit({
        entryDate,
        entryPrice: numericEntryPrice,
        entryIBS: parseIbs(entryIbs, 'Entry IBS'),
        exitDate: isClosed ? (exitDate || null) : undefined,
        exitPrice: isClosed ? numericExitPrice : undefined,
        exitIBS: isClosed ? parseIbs(exitIbs, 'Exit IBS') : undefined,
        quantity: numericQuantity,
        notes: notes.trim() || null,
        isHidden,
        isTest,
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить сделку.');
    }
  };

  return (
    <CompactFormModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={`Редактировать сделку: ${trade.symbol}`}
      error={localError || error}
      loading={loading}
      submitLabel="Сохранить"
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
          />
        </div>

        <div className="block">
          <Label>Entry IBS, %</Label>
          <Input
            aria-label="Entry IBS, %"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={entryIbs}
            onChange={(event) => setEntryIbs(event.target.value)}
            placeholder="Необязательно"
          />
        </div>

        <div className="block">
          <Label>Количество</Label>
          <Input
            aria-label="Количество"
            type="number"
            step="0.0001"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Необязательно"
          />
        </div>

        {isClosed ? (
          <>
            <div className="block">
              <Label>Дата выхода (ET)</Label>
              <Input
                aria-label="Дата выхода (ET)"
                type="date"
                value={exitDate}
                onChange={(event) => setExitDate(event.target.value)}
              />
            </div>

            <div className="block">
              <Label>Цена выхода</Label>
              <Input
                aria-label="Цена выхода"
                type="number"
                step="0.01"
                value={exitPrice}
                onChange={(event) => setExitPrice(event.target.value)}
              />
            </div>

            <div className="block">
              <Label>Exit IBS, %</Label>
              <Input
                aria-label="Exit IBS, %"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={exitIbs}
                onChange={(event) => setExitIbs(event.target.value)}
                placeholder="Необязательно"
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={isHidden}
            onChange={(event) => setIsHidden(event.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Скрыть из списка
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(event) => setIsTest(event.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Тестовая сделка
        </label>
      </div>

      <div className="block">
        <Label>Комментарий</Label>
        <Textarea
          aria-label="Комментарий"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="resize-y"
        />
      </div>
    </CompactFormModal>
  );
}
