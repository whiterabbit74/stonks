import type { OHLCData, SavedDataset, SplitEvent, TickerData } from '../types';
import {
  adjustOHLCForSplits,
  applyOHLCForHolderValue,
  dedupeDailyOHLC,
  detectSplitsFromOHLC,
  mergeSplitEvents,
} from './utils';
import { IndicatorEngine } from './indicators';

function splitKey(split: SplitEvent): string {
  return `${String(split.date).slice(0, 10)}|${Number(split.factor)}`;
}

function detectUnconfirmedSplits(rawData: OHLCData[], manualSplits: SplitEvent[]): SplitEvent[] {
  const manualKeys = new Set(manualSplits.map(splitKey));
  return detectSplitsFromOHLC(rawData).filter((split) => !manualKeys.has(splitKey(split)));
}

export function prepareTickerDataFromDataset(input: {
  ticker: string;
  dataset: SavedDataset;
  splits: SplitEvent[];
}): TickerData {
  const { ticker, dataset } = input;
  const normalizedTicker = (dataset.ticker || ticker).toUpperCase();
  const manualSplits = mergeSplitEvents(input.splits);
  const rawData = dedupeDailyOHLC(dataset.data as unknown as OHLCData[]);
  const adjustedForSplits = Boolean(dataset.adjustedForSplits);
  const detectedSplits = adjustedForSplits ? [] : detectUnconfirmedSplits(rawData, manualSplits);

  let processedData: OHLCData[];
  let holderData: OHLCData[];

  if (adjustedForSplits) {
    processedData = rawData.map((bar) => ({
      ...bar,
      priceBasis: 'split_adjusted_index',
    }));
    holderData = processedData;
  } else {
    processedData = dedupeDailyOHLC(adjustOHLCForSplits(rawData, manualSplits));
    holderData = applyOHLCForHolderValue(rawData, manualSplits);
  }

  const ibsValues = processedData.length > 0 ? IndicatorEngine.calculateIBS(processedData) : [];

  return {
    ticker: normalizedTicker,
    data: processedData,
    rawData: adjustedForSplits ? undefined : rawData,
    holderData,
    ibsValues,
    splits: manualSplits,
    detectedSplits,
  };
}
