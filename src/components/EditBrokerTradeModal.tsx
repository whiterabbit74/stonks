import { useLayoutEffect, useState } from 'react';
import type { BrokerTradeRecord } from '../types';
import { CompactFormModal } from './ui/CompactFormModal';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';

export interface EditBrokerTradePayload {
  exitDate?: string;
  exitPrice?: number;
  exitIBS?: number | null;
  notes?: string | null;
  isHidden: boolean;
  isTest: boolean;
}

interface EditBrokerTradeModalProps {
  open: boolean;
  trade: BrokerTradeRecord | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: EditBrokerTradePayload) => Promise<void> | void;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '';
}

function formatIbsPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(1) : '';
}

export function EditBrokerTradeModal({
  open,
  trade,
  loading = false,
  error = null,
  onClose,
  onSubmit,
}: EditBrokerTradeModalProps) {
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [exitIbs, setExitIbs] = useState('');
  const [notes, setNotes] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isClosed = trade?.status === 'closed';
  const hasExitDraft = exitDate.trim() !== '' || exitPrice.trim() !== '' || exitIbs.trim() !== '';

  useLayoutEffect(() => {
    if (!open || !trade) return;
    setExitDate(trade.exitDate ?? '');
    setExitPrice(formatNumber(trade.exitPrice));
    setExitIbs(formatIbsPercent(trade.exitIBS));
    setNotes(trade.notes ?? '');
    setIsHidden(!!trade.isHidden);
    setIsTest(!!trade.isTest);
    setLocalError(null);
  }, [open, trade]);

  if (!open || !trade) return null;

  const parseIbs = (raw: string): number | null => {
    if (raw.trim() === '') return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      throw new Error('Exit IBS должен быть в диапазоне 0-100%.');
    }
    return numeric / 100;
  };

  const handleSubmit = async () => {
    if (exitDate && trade.entryDate && exitDate < trade.entryDate) {
      setLocalError('Дата выхода не может быть раньше даты входа.');
      return;
    }

    try {
      const shouldSubmitExit = isClosed || hasExitDraft;
      const numericExitPrice = exitPrice.trim() === '' ? undefined : Number(exitPrice);

      if (shouldSubmitExit && !exitDate) {
        setLocalError('Укажите дату выхода.');
        return;
      }
      if (shouldSubmitExit && (numericExitPrice == null || !Number.isFinite(numericExitPrice) || numericExitPrice <= 0)) {
        setLocalError('Укажите корректную цену выхода.');
        return;
      }

      setLocalError(null);
      await onSubmit({
        exitDate: shouldSubmitExit ? exitDate : undefined,
        exitPrice: shouldSubmitExit ? numericExitPrice : undefined,
        exitIBS: shouldSubmitExit ? parseIbs(exitIbs) : undefined,
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
      title={`Редактировать broker-сделку: ${trade.symbol}`}
      description={(
        <p>
          Заполните дату и цену выхода, чтобы ручной записью закрыть сделку в broker-журнале сайта.
        </p>
      )}
      error={localError || error}
      loading={loading}
      submitLabel="Сохранить"
      size="lg"
    >
      <div className="grid gap-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-950/40 sm:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Вход</div>
          <div className="mt-1 font-mono text-gray-900 dark:text-gray-100">{trade.entryDate ?? '-'}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Цена входа</div>
          <div className="mt-1 font-mono text-gray-900 dark:text-gray-100">{formatNumber(trade.entryPrice) || '-'}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Статус</div>
          <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">{trade.status === 'open' ? 'открыта' : 'закрыта'}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block">
          <Label>Дата выхода</Label>
          <Input
            aria-label="Дата выхода"
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
            placeholder="105.00"
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
        <Label>Заметки</Label>
        <Textarea
          aria-label="Заметки"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Комментарий"
          className="resize-y"
        />
      </div>
    </CompactFormModal>
  );
}
