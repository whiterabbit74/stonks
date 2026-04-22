import { useLayoutEffect, useState } from 'react';
import { CompactFormModal } from './ui/CompactFormModal';
import { Input } from './ui/Input';
import { Label } from './ui/Label';

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
    <CompactFormModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={symbol ? `Закрыть мониторинг: ${symbol}` : 'Закрыть мониторинг'}
      description={(
        <p>
          Это действие закроет только нашу monitor-сделку. Webull-ордер не отправляется.
        </p>
      )}
      error={localError || error}
      loading={loading}
      submitLabel="Закрыть мониторинг"
      submitVariant="danger"
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
          {quoteHint ? (
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{quoteHint}</span>
          ) : null}
        </div>

        <div className="block sm:col-span-2">
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
    </CompactFormModal>
  );
}
