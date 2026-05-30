export function normalizeTakeProfitPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export function calculateTakeProfitPrice(entryPrice: number, takeProfitPercent: number | null): number | null {
  if (takeProfitPercent == null) return null;
  return entryPrice * (1 + takeProfitPercent / 100);
}

export function shouldTakeProfit(barHigh: number, takeProfitPrice: number | null): boolean {
  return takeProfitPrice != null && Number.isFinite(barHigh) && barHigh >= takeProfitPrice;
}

export function calculateExposurePct(positionValue: number, equity: number): number {
  if (!Number.isFinite(positionValue) || !Number.isFinite(equity) || equity <= 0) {
    return 0;
  }

  return (positionValue / equity) * 100;
}
