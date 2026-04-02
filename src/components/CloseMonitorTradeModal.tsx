import { useLayoutEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Modal, ModalFooter } from './ui/Modal';

interface CloseMonitorTradeModalProps {
  open: boolean;
  symbol: string | null;
  initialExitDate: string;
  initialExitPrice: number | null;
  initialExitIbs: number | null;
  loading?: boolean;
  error?: string | null;
  quoteHint?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    exitDate: string;
    exitPrice: number;
    exitIBS: number | null;
    note: string;
  }) => Promise<void> | void;
}

export function CloseMonitorTradeModal({
  open,
  symbol,
  initialExitDate,
  initialExitPrice,
  initialExitIbs,
  loading = false,
  error = null,
  quoteHint = null,
  onClose,
  onSubmit,
}: CloseMonitorTradeModalProps) {
  const [exitDate, setExitDate] = useState(initialExitDate);
  const [exitPrice, setExitPrice] = useState(initialExitPrice != null ? initialExitPrice.toFixed(2) : '');
  const [exitIbs, setExitIbs] = useState(initialExitIbs != null ? (initialExitIbs * 100).toFixed(1) : '');
  const [localError, setLocalError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setExitDate(initialExitDate);
    setExitPrice(initialExitPrice != null ? initialExitPrice.toFixed(2) : '');
    setExitIbs(initialExitIbs != null ? (initialExitIbs * 100).toFixed(1) : '');
    setLocalError(null);
  }, [open, initialExitDate, initialExitPrice, initialExitIbs]);

  const handleSubmit = async () => {
    const numericPrice = Number(exitPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setLocalError('Укажи корректную цену выхода.');
      return;
    }

    const numericIbsRaw = exitIbs.trim() === '' ? null : Number(exitIbs);
    if (numericIbsRaw != null && (!Number.isFinite(numericIbsRaw) || numericIbsRaw < 0 || numericIbsRaw > 100)) {
      setLocalError('IBS должен быть в диапазоне 0-100%.');
      return;
    }

    setLocalError(null);
    await onSubmit({
      exitDate,
      exitPrice: numericPrice,
      exitIBS: numericIbsRaw == null ? null : numericIbsRaw / 100,
      note: 'manual_monitor_close_from_ui',
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={symbol ? `Закрыть мониторинг: ${symbol}` : 'Закрыть мониторинг'} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Это действие закроет только нашу monitor-сделку. Webull-ордер не отправляется.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Дата выхода (ET)</span>
          <input
            type="date"
            value={exitDate}
            onChange={(event) => setExitDate(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Цена выхода</span>
          <input
            type="number"
            step="0.01"
            value={exitPrice}
            onChange={(event) => setExitPrice(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          {quoteHint ? (
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{quoteHint}</span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Exit IBS, %</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={exitIbs}
            onChange={(event) => setExitIbs(event.target.value)}
            placeholder="Необязательно"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>

        {localError || error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {localError || error}
          </div>
        ) : null}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button variant="danger" onClick={() => void handleSubmit()} isLoading={loading}>
          Закрыть мониторинг
        </Button>
      </ModalFooter>
    </Modal>
  );
}
