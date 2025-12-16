import type { OHLCData, SavedDataset } from '../types';
import { toTradingDate, getTodayNYSE } from './date-utils';

/**
 * Сохранить данные в JSON файл
 */
export function saveDatasetToJSON(data: OHLCData[], ticker: string, name?: string): void {
  if (!data.length) {
    throw new Error('Нет данных для сохранения');
  }

  // Создаем объект для сохранения
  const dataset: SavedDataset = {
    name: name || `${ticker}_${getTodayNYSE()}`,
    ticker: ticker.toUpperCase(),
    data: data,
    uploadDate: new Date().toISOString(),
    dataPoints: data.length,
    dateRange: {
      from: data[0].date, // Already TradingDate string
      to: data[data.length - 1].date
    }
  };

  // Конвертируем в JSON
  const jsonString = JSON.stringify(dataset, null, 2);

  // Создаем и скачиваем файл
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset.name}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  console.log(`Данные сохранены: ${dataset.name}.json`);
  console.log(`Тикер: ${dataset.ticker}`);
  console.log(`Период: ${dataset.dateRange.from} - ${dataset.dateRange.to}`);
  console.log(`Количество записей: ${dataset.dataPoints}`);
}

/**
 * Загрузить данные из JSON файла
 */
export function loadDatasetFromJSON(file: File): Promise<SavedDataset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const dataset = JSON.parse(jsonString) as SavedDataset;

        // Валидация структуры
        if (!dataset.name || !dataset.ticker || !dataset.data || !Array.isArray(dataset.data)) {
          throw new Error('Неверная структура JSON файла');
        }

        // Normalize dates to TradingDate format (YYYY-MM-DD strings)
        dataset.data = dataset.data.map(bar => ({
          ...bar,
          date: toTradingDate(bar.date as unknown as string | Date)
        }));

        console.log(`Данные загружены: ${dataset.name}`);
        console.log(`Тикер: ${dataset.ticker}`);
        console.log(`Период: ${dataset.dateRange.from} - ${dataset.dateRange.to}`);
        console.log(`Количество записей: ${dataset.dataPoints}`);

        resolve(dataset);
      } catch (error) {
        reject(new Error(`Ошибка при загрузке JSON: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Ошибка при чтении файла'));
    };

    reader.readAsText(file);
  });
}

/**
 * Валидация данных OHLC
 */
export function validateOHLCData(data: Array<Record<string, unknown>>): OHLCData[] {
  if (!Array.isArray(data)) {
    throw new Error('Данные должны быть массивом');
  }

  return data.map((barRaw, index) => {
    const bar = barRaw as unknown as { date: string | Date; open: unknown; high: unknown; low: unknown; close: unknown; volume?: unknown };
    // Проверяем обязательные поля
    if (!bar.date || !bar.open || !bar.high || !bar.low || !bar.close) {
      throw new Error(`Отсутствуют обязательные поля в записи ${index + 1}`);
    }

    // Конвертируем в правильные типы
    const ohlcBar: OHLCData = {
      date: toTradingDate(bar.date),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: bar.volume ? Number(bar.volume) : 0
    };

    // Валидация цен
    if (ohlcBar.high < ohlcBar.low) {
      throw new Error(`Неверные данные в записи ${index + 1}: high < low`);
    }

    if (ohlcBar.close < ohlcBar.low || ohlcBar.close > ohlcBar.high) {
      throw new Error(`Неверные данные в записи ${index + 1}: close вне диапазона high-low`);
    }

    if (ohlcBar.open < ohlcBar.low || ohlcBar.open > ohlcBar.high) {
      throw new Error(`Неверные данные в записи ${index + 1}: open вне диапазона high-low`);
    }

    return ohlcBar;
  });
}

/**
 * Получить информацию о датасете без загрузки данных
 */
export function getDatasetInfo(file: File): Promise<Omit<SavedDataset, 'data'>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const dataset = JSON.parse(jsonString) as SavedDataset;

        // Возвращаем только метаданные без данных
        const { data: _dropped, ...info } = dataset; void _dropped;
        resolve(info);
      } catch (error) {
        reject(new Error(`Ошибка при чтении метаданных: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Ошибка при чтении файла'));
    };

    reader.readAsText(file);
  });
}