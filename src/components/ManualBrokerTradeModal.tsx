import { useLayoutEffect, useState } from 'react';
import { CompactFormModal } from './ui/CompactFormModal';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Textarea } from './ui/Textarea';

interface ManualBrokerTradeModalProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    symbol: string;
    entryDate?: string;
    exitDate?: string;
    entryPrice?: number;
    exitPrice?: number;
    quantity?: number;
    notes?: string;
  }) => Promise<void> | void;
}

export function ManualBrokerTradeModal({
  open,
  loading = false,
  error = null,
  onClose,
  onSubmit,
}: ManualBrokerTradeModalProps) {
  const [symbol, setSymbol] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setSymbol('');
    setEntryDate('');
    setExitDate('');
    setEntryPrice('');
    setExitPrice('');
    setQuantity('');
    setNotes('');
    setLocalError(null);
  }, [open]);

  const handleSubmit = async () => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setLocalError('Укажите тикер.');
      return;
    }

    if (entryDate && exitDate && exitDate < entryDate) {
      setLocalError('Дата выхода не может быть раньше даты входа.');
      return;
    }

    const numericEntryPrice = entryPrice.trim() === '' ? undefined : Number(entryPrice);
    if (numericEntryPrice != null && (!Number.isFinite(numericEntryPrice) || numericEntryPrice <= 0)) {
      setLocalError('Цена входа должна быть положительным числом.');
      return;
    }

    const numericExitPrice = exitPrice.trim() === '' ? undefined : Number(exitPrice);
    if (numericExitPrice != null && (!Number.isFinite(numericExitPrice) || numericExitPrice <= 0)) {
      setLocalError('Цена выхода должна быть положительным числом.');
      return;
    }

    const numericQuantity = quantity.trim() === '' ? undefined : Number(quantity);
    if (numericQuantity != null && (!Number.isFinite(numericQuantity) || numericQuantity <= 0)) {
      setLocalError('Количество должно быть положительным числом.');
      return;
    }

    setLocalError(null);
    await onSubmit({
      symbol: normalizedSymbol,
      entryDate: entryDate || undefined,
      exitDate: exitDate || undefined,
      entryPrice: numericEntryPrice,
      exitPrice: numericExitPrice,
      quantity: numericQuantity,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <CompactFormModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Добавить broker-сделку"
      description={(
        <p>
          Это ручная запись в broker-журнале сайта. Никакой ордер в Webull не отправляется.
        </p>
      )}
      error={localError || error}
      loading={loading}
      submitLabel="Сохранить сделку"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block">
          <Label>Тикер</Label>
          <Input
            aria-label="Тикер"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="AAPL"
          />
        </div>

        <div className="block">
          <Label description="Необязательно. Можно оставить пустым для справочной записи.">Количество</Label>
          <Input
            aria-label="Количество"
            type="number"
            step="0.0001"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="1"
          />
        </div>

        <div className="block">
          <Label>Дата входа</Label>
          <Input
            aria-label="Дата входа"
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
          />
        </div>

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
          <Label>Цена входа</Label>
          <Input
            aria-label="Цена входа"
            type="number"
            step="0.01"
            value={entryPrice}
            onChange={(event) => setEntryPrice(event.target.value)}
            placeholder="100.00"
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
      </div>

      <div className="block">
        <Label description="Например, откуда взялась сделка или почему внесли её вручную.">Заметки</Label>
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
