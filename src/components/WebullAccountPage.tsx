import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, BriefcaseBusiness, ChevronDown, ChevronUp, History, RefreshCw, ShieldCheck, Wallet, Radar } from 'lucide-react';
import type { AutoTradingConfig, AutoTradeState, AutotradeLogsResponse, WebullDashboardResponse, BrokerTradeRecord, MonitorConsistencyResponse } from '../types';
import { DatasetAPI } from '../lib/api';
import { getEntryCapitalModeOption } from '../lib/autotrade-config';
import { formatCurrencyValue, formatDateTimeET, formatHoldingDays, formatNumberOrDash, formatRatioPercent, formatSignedPercentValue } from '../lib/formatters';
import { AnalysisTabs, Button, IconButton, PageHeader, Panel } from './ui';
import { ManualBrokerTradeModal } from './ManualBrokerTradeModal';
import { useAppStore } from '../stores';

type RowRecord = Record<string, unknown>;
type BrokerTab = 'overview' | 'positions' | 'orders' | 'deals' | 'autotrade' | 'monitoring' | 'trades' | 'logs';
type ManualCloseState = {
  status: 'idle' | 'submitted' | 'filled' | 'rejected' | 'cancelled' | 'expired' | 'error';
  clientOrderId?: string | null;
  message?: string;
  dashboardSynced?: boolean;
};

type MonitoringRow = {
  symbol: string;
  highIBS: number | null;
  lowIBS: number | null;
  thresholdPct: number | null;
  entryPrice: number | null;
  isOpenPosition: boolean;
  todayOpen: number | null;
  todayHigh: number | null;
  todayLow: number | null;
  currentPrice: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  currentIbs: number | null;
  quoteProvider: string;
  quoteUpdatedAt: string | null;
  quoteError: string | null;
};

type ReadonlyConfigItem = {
  label: string;
  value: string;
  hint?: string;
};

function getMonitorConsistencyStatus(snapshot: MonitorConsistencyResponse | null): 'ok' | 'mismatch' | 'reconcile_candidate' {
  if (!snapshot) return 'ok';
  if (snapshot.proposedActions.some((action) => action.autoApplicable)) return 'reconcile_candidate';
  if (snapshot.issues.length > 0) return 'mismatch';
  return 'ok';
}

function formatYesNo(value: unknown) {
  return value ? 'Да' : 'Нет';
}

function formatEntrySizingMode(value: unknown) {
  const mode = String(value || '').toLowerCase();
  if (mode === 'balance') return 'По buying power';
  if (mode === 'quantity') return 'Фиксированное количество';
  if (mode === 'notional') return 'Фиксированный notional';
  return mode ? mode.toUpperCase() : '—';
}

function formatTradingSession(value: unknown) {
  const session = String(value || '').toUpperCase();
  if (session === 'CORE') return 'CORE';
  if (session === 'ALL') return 'ALL';
  if (session === 'N') return 'NIGHT';
  return session || '—';
}

function formatMoney(value: unknown) {
  return formatCurrencyValue(value);
}

function formatNumber(value: unknown, fractionDigits = 2) {
  return formatNumberOrDash(value, fractionDigits);
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value) return '—';
  return formatDateTimeET(value, { withSeconds: true });
}

function formatLogLine(line: string) {
  try {
    const p = JSON.parse(line) as Record<string, unknown>;
    const ts = typeof p.ts === 'string' ? formatDateTime(p.ts) : '—';
    const level = typeof p.level === 'string' ? p.level.toUpperCase().padEnd(5) : 'INFO ';
    const event = typeof p.event === 'string' ? p.event : 'message';

    // Raw broker log fields
    if (p.method || p.path) {
      const method = p.method ? String(p.method) : '';
      const path = p.path ? String(p.path) : '';
      const status = p.responseStatus != null ? `→ ${String(p.responseStatus)}` : '';
      const err = p.error ? ` ⚠ ${String(p.error)}` : '';
      return `${ts} ${level} ${method} ${path} ${status}${err}`.trimEnd();
    }

    // Autotrade log fields
    const parts = [
      p.symbol ? String(p.symbol) : null,
      p.action ? String(p.action) : null,
      p.status ? String(p.status) : null,
      p.client_order_id ? `id=${String(p.client_order_id)}` : null,
      p.error ? `⚠ ${String(p.error)}` : null,
      p.message ? String(p.message) : null,
    ].filter(Boolean);
    return `${ts} ${level} ${event}${parts.length > 0 ? ` • ${parts.join(' • ')}` : ''}`;
  } catch {
    return line;
  }
}

function asArray(value: unknown): RowRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is RowRecord => !!item && typeof item === 'object');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nestedArrayKeys = ['list', 'items', 'data', 'rows', 'positions', 'orders', 'accounts', 'holdings'];
    for (const key of nestedArrayKeys) {
      if (Array.isArray(record[key])) {
        return record[key] as RowRecord[];
      }
    }
  }
  return [];
}

function asObject(value: unknown): RowRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RowRecord) : null;
}

function firstDefined(record: RowRecord | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function extractBalanceSummary(balance: unknown) {
  const root = asObject(balance);
  const candidate = root?.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? root.data as RowRecord
    : root;
  const currencyAssets = Array.isArray(candidate?.account_currency_assets)
    ? candidate.account_currency_assets.filter((item): item is RowRecord => !!item && typeof item === 'object')
    : [];
  const preferredCurrencyAsset = currencyAssets.find((item) => String(item.currency ?? '').toUpperCase() === 'USD')
    ?? currencyAssets[0]
    ?? null;
  const currency = firstDefined(preferredCurrencyAsset, ['currency'])
    ?? firstDefined(candidate, ['total_asset_currency', 'currency', 'base_currency', 'baseCurrency'])
    ?? 'USD';

  return {
    totalAssets: firstDefined(candidate, [
      'total_net_liquidation_value',
      'net_liquidation_value',
      'netLiquidationValue',
      'total_assets',
      'totalAssets',
      'total_market_value',
      'market_value',
      'marketValue',
    ]) ?? firstDefined(preferredCurrencyAsset, ['net_liquidation_value', 'netLiquidationValue']),
    cashBalance: firstDefined(candidate, [
      'total_cash_balance',
      'cash_balance',
      'cashBalance',
      'settled_cash',
      'settledCash',
      'cash',
    ]) ?? firstDefined(preferredCurrencyAsset, ['cash_balance', 'cashBalance']),
    buyingPower: firstDefined(preferredCurrencyAsset, [
      'overnight_buying_power',
      'overnightBuyingPower',
      'day_buying_power',
      'dayBuyingPower',
      'option_buying_power',
      'optionBuyingPower',
      'night_trading_buying_power',
      'nightTradingBuyingPower',
      'buying_power',
      'buyingPower',
      'margin_power',
      'cash_power',
    ]) ?? firstDefined(candidate, ['buying_power', 'buyingPower', 'day_trading_buying_power', 'dayTradingBuyingPower']),
    unrealizedPnl: firstDefined(candidate, [
      'total_unrealized_profit_loss',
      'unrealized_profit_loss',
      'unrealizedProfitLoss',
      'unrealized_pnl',
      'unrealizedPnl',
    ]) ?? firstDefined(preferredCurrencyAsset, ['unrealized_profit_loss', 'unrealizedProfitLoss']),
    dayPnl: firstDefined(candidate, [
      'total_day_profit_loss',
      'day_profit_loss',
      'dayProfitLoss',
    ]) ?? firstDefined(preferredCurrencyAsset, ['day_profit_loss', 'dayProfitLoss']),
    accountType: firstDefined(candidate, ['account_type', 'accountType']),
    currency,
  };
}

function normalizePositions(positions: unknown) {
  return asArray(positions).map((item, index) => ({
    id: String(firstDefined(item, ['position_id', 'id', 'symbol']) ?? index),
    symbol: String(firstDefined(item, ['symbol', 'ticker', 'display_symbol', 'short_name']) ?? '—'),
    quantity: firstDefined(item, ['quantity', 'qty', 'position', 'holding']),
    avgPrice: firstDefined(item, ['avg_price', 'average_price', 'avgPrice', 'cost_price', 'unit_cost']),
    totalCost: firstDefined(item, ['total_cost', 'totalCost', 'cost']),
    marketPrice: firstDefined(item, ['last_price', 'market_price', 'marketPrice', 'current_price']),
    marketValue: firstDefined(item, ['market_value', 'marketValue', 'value']),
    unrealizedPnl: firstDefined(item, ['unrealized_profit_loss', 'unrealizedPnl', 'unrealized_pnl']),
    unrealizedPnlRate: firstDefined(item, ['unrealized_profit_loss_rate', 'unrealizedProfitLossRate', 'unrealized_pnl_rate']),
    holdingProportion: firstDefined(item, ['holding_proportion', 'holdingProportion', 'weight']),
    instrumentType: firstDefined(item, ['instrument_type', 'instrumentType', 'security_type']),
    currency: firstDefined(item, ['currency']),
  }));
}

function normalizeOrders(payload: unknown) {
  return asArray(payload).flatMap((item, index) => {
    const nestedOrders = asArray(item.orders).length > 0 ? asArray(item.orders) : asArray(item.items);
    const rows = nestedOrders.length > 0 ? nestedOrders : [item];

    return rows.map((row, rowIndex) => {
      const merged: RowRecord = { ...item, ...row };
      return {
        id: String(firstDefined(merged, ['client_order_id', 'order_id', 'combo_order_id', 'id']) ?? `${index}-${rowIndex}`),
        clientOrderId: String(firstDefined(merged, ['client_order_id']) ?? '—'),
        orderId: String(firstDefined(merged, ['order_id', 'combo_order_id']) ?? '—'),
        comboType: String(firstDefined(merged, ['combo_type']) ?? '—'),
        symbol: String(firstDefined(merged, ['symbol', 'ticker']) ?? '—'),
        side: String(firstDefined(merged, ['side', 'action']) ?? '—'),
        status: String(firstDefined(merged, ['status', 'order_status']) ?? '—'),
        quantity: firstDefined(merged, ['total_quantity', 'quantity', 'qty', 'filled_quantity', 'filled_qty']),
        filledQuantity: firstDefined(merged, ['filled_quantity', 'filled_qty', 'deal_quantity', 'total_quantity']),
        orderType: String(firstDefined(merged, ['order_type', 'type']) ?? '—'),
        instrumentType: String(firstDefined(merged, ['instrument_type']) ?? '—'),
        entrustType: String(firstDefined(merged, ['entrust_type']) ?? '—'),
        timeInForce: String(firstDefined(merged, ['time_in_force', 'tif']) ?? '—'),
        tradingSession: String(firstDefined(merged, ['support_trading_session', 'trading_session', 'session']) ?? '—'),
        avgPrice: firstDefined(merged, ['filled_price', 'avg_price', 'average_price', 'filled_avg_price', 'deal_price']),
        limitPrice: firstDefined(merged, ['limit_price', 'limitPrice']),
        placeTime: firstDefined(merged, ['place_time', 'placeTime']),
        filledTime: firstDefined(merged, ['filled_time', 'filledTime']),
        createdAt: firstDefined(merged, [
          'place_time_at',
          'create_time_at',
          'update_time_at',
          'create_time',
          'created_at',
          'createdAt',
          'update_time',
        ]),
        filledAt: firstDefined(merged, [
          'filled_time_at',
          'place_time_at',
          'create_time_at',
          'update_time_at',
          'create_time',
          'created_at',
          'createdAt',
          'update_time',
        ]),
      };
    });
  });
}

function normalizeTrackedStatus(status: string): ManualCloseState['status'] {
  if (status === 'filled') return 'filled';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired') return 'expired';
  return 'submitted';
}

function isFinalTrackedStatus(status: ManualCloseState['status']) {
  return ['filled', 'rejected', 'cancelled', 'expired'].includes(status);
}

function InfoCard({ title, value, hint, icon }: { title: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <Panel radius="2xl" className="h-full">
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div> : null}
    </Panel>
  );
}

function ReadonlyConfigSection({ title, items }: { title: string; items: ReadonlyConfigItem[] }) {
  return (
    <Panel radius="2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Только для просмотра. Изменение через этот блок недоступно.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={`${title}:${item.label}`} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</div>
            <div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</div>
            {item.hint ? (
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RawJson({ title, value }: { title: string; value: unknown }) {
  return (
    <Panel as="details" tone="soft" padding="sm" shadow={false}>
      <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">{title}</summary>
      <pre className="mt-3 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </Panel>
  );
}

function SectionPanel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Panel as="section" radius="2xl" padding="none">
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </Panel>
  );
}

const tabs: Array<{ id: BrokerTab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'positions', label: 'Позиции' },
  { id: 'orders', label: 'Ордера' },
  { id: 'deals', label: 'Исполненные' },
  { id: 'trades', label: 'Журнал сделок' },
  { id: 'autotrade', label: 'Автоторговля' },
  { id: 'monitoring', label: 'Мониторинг' },
  { id: 'logs', label: 'Логи' },
];

export function WebullAccountPage() {
  const [data, setData] = useState<WebullDashboardResponse | null>(null);
  const [autotradeConfig, setAutotradeConfig] = useState<AutoTradingConfig | null>(null);
  const [autotradeState, setAutotradeState] = useState<AutoTradeState | null>(null);
  const [logs, setLogs] = useState<AutotradeLogsResponse | null>(null);
  const [brokerLogRaw, setBrokerLogRaw] = useState(false);
  const [monitoringRows, setMonitoringRows] = useState<MonitoringRow[]>([]);
  const [activeTab, setActiveTab] = useState<BrokerTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [testBuying, setTestBuying] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [monitoringLastUpdatedAt, setMonitoringLastUpdatedAt] = useState<string | null>(null);
  const [monitoringRefreshingSymbols, setMonitoringRefreshingSymbols] = useState<Record<string, boolean>>({});
  const [monitoringListLoaded, setMonitoringListLoaded] = useState(false);
  const [monitorConsistency, setMonitorConsistency] = useState<MonitorConsistencyResponse | null>(null);
  const [monitorConsistencyLoading, setMonitorConsistencyLoading] = useState(false);
  const [monitorReconcileApplying, setMonitorReconcileApplying] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsCollapsed, setLogsCollapsed] = useState<Record<string, boolean>>({});
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [manualCloseStates, setManualCloseStates] = useState<Record<string, ManualCloseState>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quoteProvider = useAppStore((s) => s.resultsQuoteProvider);
  const monitorConsistencyStatus = getMonitorConsistencyStatus(monitorConsistency);

  // Trades tab state
  const [tradesData, setTradesData] = useState<BrokerTradeRecord[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesShowHidden, setTradesShowHidden] = useState(false);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const [manualTradeModalOpen, setManualTradeModalOpen] = useState(false);
  const [addTradeLoading, setAddTradeLoading] = useState(false);
  const [addTradeError, setAddTradeError] = useState<string | null>(null);

  const loadDashboard = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const next = await DatasetAPI.getWebullDashboard(isRefresh);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить кабинет Webull');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAutotradeConfig = async () => {
    try {
      const next = await DatasetAPI.getAutotradeConfig();
      setAutotradeConfig(next.config);
      setAutotradeState(next.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки автоторговли');
    }
  };

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const next = await DatasetAPI.getAutotradeLogs(300);
      setLogs(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить логи');
    } finally {
      setLogsLoading(false);
    }
  };

  const loadTrades = async () => {
    try {
      setTradesLoading(true);
      const resp = await DatasetAPI.getBrokerTrades(true);
      setTradesData(resp.trades);
      setTradesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить журнал сделок');
    } finally {
      setTradesLoading(false);
    }
  };

  const handleToggleHide = async (trade: BrokerTradeRecord) => {
    try {
      const updated = await DatasetAPI.updateBrokerTrade(trade.id, { isHidden: !trade.isHidden });
      setTradesData(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить сделку');
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!window.confirm('Удалить сделку? Это действие нельзя отменить.')) return;
    try {
      await DatasetAPI.deleteBrokerTrade(id);
      setTradesData(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить сделку');
    }
  };

  const handleAddTrade = async (payload: {
    symbol: string;
    entryDate?: string;
    exitDate?: string;
    entryPrice?: number;
    exitPrice?: number;
    quantity?: number;
    notes?: string;
  }) => {
    try {
      setAddTradeLoading(true);
      setAddTradeError(null);
      const created = await DatasetAPI.createBrokerTrade(payload);
      setTradesData(prev => [created, ...prev]);
      setManualTradeModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать сделку';
      setAddTradeError(message);
    } finally {
      setAddTradeLoading(false);
    }
  };

  const handleOpenManualTradeModal = () => {
    setAddTradeError(null);
    setManualTradeModalOpen(true);
  };

  const handleCloseManualTradeModal = () => {
    if (addTradeLoading) return;
    setManualTradeModalOpen(false);
    setAddTradeError(null);
  };

  const buildMonitoringRow = (watch: { symbol: string; highIBS: number | null; lowIBS?: number | null; thresholdPct?: number | null; entryPrice: number | null; isOpenPosition: boolean }, quote?: { open: number | null; high: number | null; low: number | null; current: number | null; prevClose: number | null }, quoteError?: string | null): MonitoringRow => {
    const current = quote?.current ?? null;
    const prevClose = quote?.prevClose ?? null;
    const todayLow = quote?.low ?? null;
    const todayHigh = quote?.high ?? null;
    const todayOpen = quote?.open ?? null;
    const change = current != null && prevClose != null ? current - prevClose : null;
    const changePct = change != null && prevClose && prevClose !== 0 ? (change / prevClose) * 100 : null;
    const currentIbs = current != null && todayLow != null && todayHigh != null && todayHigh > todayLow
      ? (current - todayLow) / (todayHigh - todayLow)
      : null;
    return {
      symbol: watch.symbol,
      highIBS: Number.isFinite(Number(watch.highIBS)) ? Number(watch.highIBS) : null,
      lowIBS: Number.isFinite(Number(watch.lowIBS ?? null)) ? Number(watch.lowIBS ?? null) : null,
      thresholdPct: Number.isFinite(Number(watch.thresholdPct ?? null)) ? Number(watch.thresholdPct ?? null) : null,
      entryPrice: typeof watch.entryPrice === 'number' ? watch.entryPrice : null,
      isOpenPosition: !!watch.isOpenPosition,
      todayOpen,
      todayHigh,
      todayLow,
      currentPrice: current,
      prevClose,
      change,
      changePct,
      currentIbs,
      quoteProvider,
      quoteUpdatedAt: quote ? new Date().toISOString() : null,
      quoteError: quoteError ?? null,
    };
  };

  const loadMonitoringData = async (force = false) => {
    try {
      setMonitoringLoading(true);
      setMonitoringError(null);
      setMonitorConsistencyLoading(true);
      const [watches, consistency] = await Promise.all([
        DatasetAPI.listTelegramWatches(),
        DatasetAPI.getMonitorConsistency(),
      ]);
      const provider = quoteProvider === 'twelve_data' ? 'twelve_data' : quoteProvider as 'alpha_vantage' | 'finnhub' | 'twelve_data' | 'webull';

      let rows: MonitoringRow[];
      if (provider === 'webull' && watches.length > 0) {
        const symbols = watches.map((w) => w.symbol);
        const batchMap = await DatasetAPI.getWebullBatchQuotes(symbols).catch(() => new Map());
        rows = watches.map((watch) => {
          const quote = batchMap.get(watch.symbol);
          return buildMonitoringRow(watch, quote ?? undefined, quote ? null : 'Нет данных от Webull');
        });
      } else {
        rows = await Promise.all(watches.map(async (watch) => {
          try {
            const quote = await DatasetAPI.getQuote(watch.symbol, provider);
            return buildMonitoringRow(watch, quote, null);
          } catch (quoteError) {
            return buildMonitoringRow(watch, undefined, quoteError instanceof Error ? quoteError.message : 'Не удалось получить котировку');
          }
        }));
      }

      setMonitoringRows(rows);
      setMonitorConsistency(consistency);
      setMonitoringLastUpdatedAt(new Date().toISOString());
      setMonitoringListLoaded(true);
    } catch (err) {
      setMonitoringError(err instanceof Error ? err.message : 'Не удалось загрузить мониторинг');
    } finally {
      setMonitoringLoading(false);
      setMonitorConsistencyLoading(false);
      if (force) setActionMessage('Мониторинг обновлён вручную');
    }
  };

  const handleMonitorReconcile = async () => {
    try {
      setMonitorReconcileApplying(true);
      setMonitoringError(null);
      const result = await DatasetAPI.reconcileMonitorState('apply');
      setMonitorConsistency(result);
      await loadMonitoringData(true);
      setActionMessage(result.appliedActions && result.appliedActions.length > 0
        ? `Reconcile применён: ${result.appliedActions.length} действий`
        : 'Reconcile завершён: исправлений не потребовалось');
    } catch (err) {
      setMonitoringError(err instanceof Error ? err.message : 'Не удалось выполнить reconcile');
    } finally {
      setMonitorReconcileApplying(false);
    }
  };

  const refreshMonitoringSymbol = async (symbol: string) => {
    const row = monitoringRows.find((item) => item.symbol === symbol);
    if (!row) return;
    try {
      setMonitoringRefreshingSymbols((prev) => ({ ...prev, [symbol]: true }));
      setMonitoringError(null);
      const quote = await DatasetAPI.getQuote(
        symbol,
        quoteProvider === 'twelve_data' ? 'twelve_data' : quoteProvider
      );
      setMonitoringRows((prev) => prev.map((item) => (
        item.symbol === symbol
          ? buildMonitoringRow(item, quote, null)
          : item
      )));
      setMonitoringLastUpdatedAt(new Date().toISOString());
      setActionMessage(`${symbol} обновлён вручную`);
    } catch (quoteError) {
      setMonitoringRows((prev) => prev.map((item) => (
        item.symbol === symbol
          ? {
              ...item,
              currentPrice: null,
              prevClose: null,
              todayOpen: null,
              todayHigh: null,
              todayLow: null,
              change: null,
              changePct: null,
              currentIbs: null,
              quoteProvider,
              quoteUpdatedAt: null,
              quoteError: quoteError instanceof Error ? quoteError.message : 'Не удалось получить котировку',
            }
          : item
      )));
      setMonitoringError(quoteError instanceof Error ? quoteError.message : 'Не удалось обновить котировку');
    } finally {
      setMonitoringRefreshingSymbols((prev) => ({ ...prev, [symbol]: false }));
    }
  };

  useEffect(() => {
    void loadDashboard(false);
    void loadAutotradeConfig();
    void loadLogs();
  }, []);

  useEffect(() => {
    if (activeTab === 'trades' && !tradesLoaded && !tradesLoading) {
      void loadTrades();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'monitoring' && !monitoringListLoaded && !monitoringLoading) {
      void loadMonitoringData(false);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const balance = useMemo(() => extractBalanceSummary(data?.balance), [data?.balance]);
  const positions = useMemo(() => normalizePositions(data?.positions), [data?.positions]);
  const openOrders = useMemo(() => normalizeOrders(data?.openOrders), [data?.openOrders]);
  const orderHistory = useMemo(() => normalizeOrders(data?.orderHistory), [data?.orderHistory]);
  const pendingOrders = useMemo(() => logs?.pending ?? [], [logs?.pending]);
  const recentTrackedOrders = useMemo(() => logs?.recent ?? [], [logs?.recent]);
  const monitorLogLines = useMemo(() => [...(logs?.monitor ?? [])].reverse(), [logs?.monitor]);
  const autotradeLogLines = useMemo(() => [...(logs?.autotrade ?? [])].reverse(), [logs?.autotrade]);
  const brokerRawLogLines = useMemo(() => [...(logs?.brokerRaw ?? [])].reverse(), [logs?.brokerRaw]);
  const trackedOrders = useMemo(() => {
    const merged = [...pendingOrders, ...recentTrackedOrders];
    const seen = new Set<string>();
    return merged.filter((order) => {
      const key = `${order.clientOrderId}:${order.action}:${order.status}:${order.lastCheckedAt ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }, [pendingOrders, recentTrackedOrders]);

  useEffect(() => {
    const tracked = [...(logs?.pending ?? []), ...(logs?.recent ?? [])]
      .filter((item) => item.action === 'exit')
      .sort((a, b) => {
        const left = Date.parse(String(b.lastCheckedAt ?? b.startedAt ?? '')) || 0;
        const right = Date.parse(String(a.lastCheckedAt ?? a.startedAt ?? '')) || 0;
        return left - right;
      });
    if (tracked.length === 0) return;

    const trackedByOrderId = new Map<string, typeof tracked[number]>();
    for (const item of tracked) {
      if (!trackedByOrderId.has(item.clientOrderId)) {
        trackedByOrderId.set(item.clientOrderId, item);
      }
    }
    setManualCloseStates((prev) => {
      const next = { ...prev };
      for (const [symbol, currentState] of Object.entries(prev)) {
        const trackedOrder = currentState.clientOrderId
          ? trackedByOrderId.get(currentState.clientOrderId)
          : tracked.find((item) => item.symbol === symbol);
        if (!trackedOrder) continue;

        next[symbol] = {
          ...currentState,
          clientOrderId: currentState.clientOrderId ?? trackedOrder.clientOrderId,
          status: normalizeTrackedStatus(trackedOrder.status),
          message: trackedOrder.lastCheckedAt ? `Проверено ${formatDateTime(trackedOrder.lastCheckedAt)}` : undefined,
          dashboardSynced: isFinalTrackedStatus(normalizeTrackedStatus(trackedOrder.status))
            ? currentState.dashboardSynced
            : false,
        };
      }
      return next;
    });
  }, [logs]);

  useEffect(() => {
    const hasSubmittedManualClose = Object.values(manualCloseStates).some((item) => item.status === 'submitted');
    const hasPendingTrackers = pendingOrders.length > 0;
    if (!hasSubmittedManualClose && !hasPendingTrackers) return;

    const intervalId = window.setInterval(() => {
      void loadLogs();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [manualCloseStates, pendingOrders.length]);

  const autotradeStatusLabel = autotradeConfig
    ? (autotradeConfig.enabled ? 'LIVE' : 'OFF')
    : '—';

  const autotradeLastResult = autotradeState?.lastResult && typeof autotradeState.lastResult === 'object'
    ? autotradeState.lastResult as Record<string, unknown>
    : null;
  const autotradeLastDecision = autotradeLastResult && typeof autotradeLastResult.decision === 'object'
    ? autotradeLastResult.decision as Record<string, unknown>
    : null;
  const autotradeReadonlySections = useMemo(() => {
    if (!autotradeConfig) return [];
    const entryCapitalMode = getEntryCapitalModeOption(autotradeConfig.entryCapitalMode);

    const executionItems: ReadonlyConfigItem[] = [
      {
        label: 'Режим входа',
        value: formatEntrySizingMode(autotradeConfig.entrySizingMode),
      },
      {
        label: 'База профиля',
        value: 'Cash balance',
        hint: 'Если cash balance не найден, сервер падает обратно на net liquidation value, а итог всегда ограничивается broker buying power',
      },
      {
        label: 'Профиль капитала',
        value: entryCapitalMode.shortLabel,
        hint: entryCapitalMode.hint,
      },
      {
        label: 'Дробные акции',
        value: formatYesNo(autotradeConfig.allowFractionalShares),
        hint: autotradeConfig.allowFractionalShares ? 'Qty может быть дробным' : 'Qty округляется вниз до целого',
      },
      {
        label: 'Fixed quantity',
        value: formatNumber(autotradeConfig.fixedQuantity, 5),
      },
      {
        label: 'Fixed notional',
        value: formatMoney(autotradeConfig.fixedNotionalUsd),
      },
      {
        label: 'Max position',
        value: autotradeConfig.maxPositionUsd > 0 ? formatMoney(autotradeConfig.maxPositionUsd) : 'Без лимита',
      },
      {
        label: 'Order type / TIF',
        value: `${autotradeConfig.orderType} / ${autotradeConfig.timeInForce}`,
        hint: `Session: ${formatTradingSession(autotradeConfig.supportTradingSession)}`,
      },
      {
        label: 'Резерв buying power',
        value: entryCapitalMode.reservePct > 0 ? `+${(entryCapitalMode.reservePct * 100).toFixed(1)}%` : 'Не применяется',
        hint: entryCapitalMode.reservePct > 0
          ? 'Используется только в стандартном safe-профиле, чтобы не упираться в правило Webull для market buy'
          : 'Для exact и margin-профилей дополнительный reserve не добавляется',
      },
      {
        label: 'Preview / cancel open',
        value: `${formatYesNo(autotradeConfig.previewBeforeSend)} / ${formatYesNo(autotradeConfig.cancelOpenOrdersBeforeEntry)}`,
        hint: 'Preview для Webull US логируется как skipped, но флаг сохраняется в конфиге',
      },
    ];

    const signalItems: ReadonlyConfigItem[] = [
      {
        label: 'Провайдер',
        value: autotradeConfig.provider === 'webull' ? 'Webull' : 'Finnhub',
      },
      {
        label: 'IBS threshold',
        value: `${formatRatioPercent(autotradeConfig.lowIBS)} / ${formatRatioPercent(autotradeConfig.highIBS)}`,
        hint: 'Entry / Exit',
      },
      {
        label: 'Execution window',
        value: `${formatNumber(autotradeConfig.executionWindowSeconds, 0)} сек.`,
      },
      {
        label: 'Entries / exits',
        value: `${formatYesNo(autotradeConfig.allowNewEntries)} / ${formatYesNo(autotradeConfig.allowExits)}`,
      },
      {
        label: 'Источник тикеров',
        value: autotradeConfig.onlyFromTelegramWatches ? 'Только Telegram watches' : 'Поле symbols',
      },
      {
        label: 'Symbols',
        value: autotradeConfig.symbols?.trim() ? autotradeConfig.symbols : '—',
        hint: autotradeConfig.onlyFromTelegramWatches ? 'Сейчас поле игнорируется, пока включён режим onlyFromTelegramWatches' : undefined,
      },
    ];

    return [
      { title: 'Параметры сигналов', items: signalItems },
      { title: 'Параметры исполнения', items: executionItems },
    ];
  }, [autotradeConfig]);


  const handleTestBuyAapl = async () => {
    const confirmed = window.confirm('Отправить тестовый BUY MARKET для AAL на 1 акцию? Это реальный ордер.');
    if (!confirmed) return;
    try {
      setTestBuying(true);
      setError(null);
      const result = await DatasetAPI.testWebullAalBuy(1);
      setActionMessage(`Тестовый ордер AAL отправлен. client_order_id: ${result.clientOrderId ?? '—'}`);
      await Promise.all([loadDashboard(true), loadLogs(), loadAutotradeConfig()]);
    } catch (err) {
      if (err instanceof Error && 'body' in err && (err as { body?: unknown }).body) {
        const body = (err as { body?: unknown }).body;
        const bodyText = typeof body === 'string'
          ? body
          : JSON.stringify(body, null, 2);
        setError(`${err.message}${bodyText ? ` | ${bodyText}` : ''}`);
      } else {
        setError(err instanceof Error ? err.message : 'Не удалось отправить тестовый BUY');
      }
    } finally {
      setTestBuying(false);
    }
  };

  useEffect(() => {
    const needsDashboardRefresh = Object.values(manualCloseStates).some((item) => isFinalTrackedStatus(item.status) && !item.dashboardSynced);
    if (!needsDashboardRefresh) return;

    void loadDashboard(true).then(() => {
      setManualCloseStates((prev) => {
        const next = { ...prev };
        for (const [symbol, state] of Object.entries(prev)) {
          if (isFinalTrackedStatus(state.status)) {
            next[symbol] = { ...state, dashboardSynced: true };
          }
        }
        return next;
      });
    });
  }, [manualCloseStates]);

  const handleClosePosition = async (symbol: string) => {
    const confirmed = window.confirm(`Закрыть позицию ${symbol} рыночным ордером в Webull?`);
    if (!confirmed) return;
    try {
      setClosingSymbol(symbol);
      setError(null);
      setManualCloseStates((prev) => ({
        ...prev,
        [symbol]: {
          status: 'submitted',
          clientOrderId: prev[symbol]?.clientOrderId ?? null,
          message: 'MARKET ордер отправлен, ждём финальный статус',
          dashboardSynced: false,
        }
      }));
      const result = await DatasetAPI.closeWebullPosition(symbol);
      setManualCloseStates((prev) => ({
        ...prev,
        [symbol]: {
          ...(prev[symbol] ?? { status: 'submitted' }),
          status: 'submitted',
          clientOrderId: result.clientOrderId ?? result.result?.clientOrderId ?? result.result?.order?.client_order_id ?? null,
          message: 'MARKET ордер отправлен, ждём финальный статус',
          dashboardSynced: false,
        }
      }));
      await loadLogs();
    } catch (err) {
      setManualCloseStates((prev) => ({
        ...prev,
        [symbol]: {
          status: 'error',
          clientOrderId: prev[symbol]?.clientOrderId ?? null,
          message: err instanceof Error ? err.message : `Не удалось закрыть позицию ${symbol}`,
          dashboardSynced: false,
        }
      }));
      setError(err instanceof Error ? err.message : `Не удалось закрыть позицию ${symbol}`);
    } finally {
      setClosingSymbol(null);
    }
  };

  const renderManualCloseState = (symbol: string) => {
    const state = manualCloseStates[symbol];
    if (!state || state.status === 'idle') return null;

    const tone = state.status === 'filled'
      ? 'text-emerald-600 dark:text-emerald-300'
      : state.status === 'submitted'
        ? 'text-amber-600 dark:text-amber-300'
        : state.status === 'error' || state.status === 'rejected'
          ? 'text-red-600 dark:text-red-300'
          : 'text-gray-600 dark:text-gray-300';

    return (
      <div className={`mt-1 text-xs ${tone}`}>
        {state.status === 'submitted' ? 'Заявка отправлена' : state.status}
        {state.message ? ` • ${state.message}` : ''}
      </div>
    );
  };

  const renderTabContent = () => {
    if (!data) return null;

    if (activeTab === 'overview') {
      return (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard title="Всего активов" value={formatMoney(balance.totalAssets)} hint={`Валюта: ${String(balance.currency ?? 'USD')}`} icon={<Wallet className="h-4 w-4" />} />
            <InfoCard title="Свободные деньги" value={formatMoney(balance.cashBalance)} hint="Cash / settled cash" icon={<ShieldCheck className="h-4 w-4" />} />
            <InfoCard title="Buying Power" value={formatMoney(balance.buyingPower)} hint={balance.accountType ? `Тип счёта: ${String(balance.accountType)}` : undefined} icon={<BriefcaseBusiness className="h-4 w-4" />} />
            <InfoCard title="Нереализованный PnL" value={formatMoney(balance.unrealizedPnl)} hint={data.fetchedAt ? `Обновлено ${formatDateTime(data.fetchedAt)}` : undefined} icon={<History className="h-4 w-4" />} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <RawJson title="Raw balance payload" value={data.balance} />
            <RawJson title="Raw account payload" value={data.accounts} />
          </div>
        </div>
      );
    }

    if (activeTab === 'positions') {
      return (
        <div className="space-y-4">
          <SectionPanel title="Открытые позиции">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Тикер</th>
                    <th className="px-4 py-3 font-medium">Тип</th>
                    <th className="px-4 py-3 font-medium">Валюта</th>
                    <th className="px-4 py-3 font-medium text-right">Кол-во</th>
                    <th className="px-4 py-3 font-medium text-right">Средняя (unit_cost)</th>
                    <th className="px-4 py-3 font-medium text-right">Себестоимость</th>
                    <th className="px-4 py-3 font-medium text-right">Рыночная цена</th>
                    <th className="px-4 py-3 font-medium text-right">Рыночная стоимость</th>
                    <th className="px-4 py-3 font-medium text-right">Нереализ. PnL</th>
                    <th className="px-4 py-3 font-medium text-right">PnL %</th>
                    <th className="px-4 py-3 font-medium text-right">Доля</th>
                    <th className="px-4 py-3 font-medium text-right">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr><td colSpan={12} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">Открытых позиций нет</td></tr>
                  ) : positions.map((position) => {
                    const pnlNum = Number(position.unrealizedPnl);
                    const pnlColor = Number.isFinite(pnlNum) && pnlNum < 0
                      ? 'text-rose-600 dark:text-rose-300'
                      : Number.isFinite(pnlNum) && pnlNum > 0
                        ? 'text-emerald-600 dark:text-emerald-300'
                        : 'text-gray-700 dark:text-gray-300';
                    const pnlRateNum = Number(position.unrealizedPnlRate);
                    return (
                    <tr key={position.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{position.symbol}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{String(position.instrumentType ?? '—')}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{String(position.currency ?? '—')}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(position.quantity, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(position.avgPrice)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(position.totalCost)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(position.marketPrice)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(position.marketValue)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${pnlColor}`}>{formatMoney(position.unrealizedPnl)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${pnlColor}`}>
                        {formatRatioPercent(pnlRateNum, 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">
                        {formatRatioPercent(position.holdingProportion, 1)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          isLoading={closingSymbol === position.symbol}
                          onClick={() => void handleClosePosition(position.symbol)}
                        >
                          Закрыть
                        </Button>
                        {renderManualCloseState(position.symbol)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          <RawJson title="Raw positions payload" value={data.positions} />
          <RawJson title="Raw accounts payload" value={data.accounts} />
        </div>
      );
    }

    if (activeTab === 'orders') {
      return (
        <div className="space-y-4">
          <SectionPanel title="Активные ордера">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Тикер</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Filled Qty</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Combo</th>
                    <th className="px-4 py-3 font-medium">Entrust</th>
                    <th className="px-4 py-3 font-medium">TIF</th>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium text-right">Цена</th>
                    <th className="px-4 py-3 font-medium">Order ID</th>
                    <th className="px-4 py-3 font-medium">Client ID</th>
                    <th className="px-4 py-3 font-medium">Создан</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.length === 0 ? (
                    <tr><td colSpan={14} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">Активных ордеров нет</td></tr>
                  ) : openOrders.map((order) => (
                    <tr key={order.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{order.symbol}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.side}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.status}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(order.quantity, 4)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(order.filledQuantity, 4)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.orderType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.instrumentType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.comboType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.entrustType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.timeInForce}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.tradingSession}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(order.limitPrice ?? order.avgPrice)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{order.orderId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{order.clientOrderId}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          <RawJson title="Raw open orders payload" value={data.openOrders} />
        </div>
      );
    }

    if (activeTab === 'deals') {
      return (
        <div className="space-y-4">
          <SectionPanel title="История сделок / ордеров">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Исполнено</th>
                    <th className="px-4 py-3 font-medium">Тикер</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Order Qty</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Instrument</th>
                    <th className="px-4 py-3 font-medium">Combo</th>
                    <th className="px-4 py-3 font-medium">Entrust</th>
                    <th className="px-4 py-3 font-medium">TIF</th>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium text-right">Avg Price</th>
                    <th className="px-4 py-3 font-medium">Order ID</th>
                    <th className="px-4 py-3 font-medium">Client ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orderHistory.length === 0 ? (
                    <tr><td colSpan={14} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">История ордеров пока не пришла</td></tr>
                  ) : orderHistory.map((order) => (
                    <tr key={order.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDateTime(order.filledAt ?? order.createdAt)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{order.symbol}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.side}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.status}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(order.filledQuantity ?? order.quantity, 4)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(order.quantity, 4)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.orderType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.instrumentType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.comboType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.entrustType}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.timeInForce}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.tradingSession}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(order.avgPrice ?? order.limitPrice)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{order.orderId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{order.clientOrderId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          <RawJson title="Raw order history payload" value={data.orderHistory} />
        </div>
      );
    }

    if (activeTab === 'autotrade') {
      return (
        <div className="space-y-4">
          <Panel radius="2xl" className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Состояние автоторговли</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Подключение</div>
                <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {data.connection.configured ? 'Webull подключен' : 'Webull не настроен'}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Token / Account</div>
                <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  token {data.connection.hasAccessToken ? 'есть' : 'не задан'} • account {data.connection.hasAccountId ? 'задан' : 'не задан'}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-4">
              <InfoCard title="Статус" value={autotradeStatusLabel} hint={autotradeConfig?.lastModifiedAt ? `Обновлено ${formatDateTime(autotradeConfig.lastModifiedAt)}` : 'Настройки ещё не загружены'} icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoCard title="Last run" value={autotradeState?.lastRunAt ? formatDateTime(autotradeState.lastRunAt) : '—'} hint={autotradeState?.lastSchedulerAttemptKey ? `Key: ${autotradeState.lastSchedulerAttemptKey}` : undefined} icon={<History className="h-4 w-4" />} />
              <InfoCard title="Entries/Exits" value={autotradeConfig ? `${formatYesNo(autotradeConfig.allowNewEntries)}/${formatYesNo(autotradeConfig.allowExits)}` : '—'} hint={autotradeConfig?.supportTradingSession ? `Session: ${autotradeConfig.supportTradingSession}` : undefined} icon={<BriefcaseBusiness className="h-4 w-4" />} />
              <InfoCard title="Webull" value={data.connection.configured ? 'Ready' : 'Not ready'} hint={data.connection.hasAccessToken ? 'Access token ok' : 'Missing token'} icon={<Wallet className="h-4 w-4" />} />
              <InfoCard title="Последнее решение" value={autotradeLastDecision?.action ? String(autotradeLastDecision.action) : '—'} hint={autotradeLastDecision?.reason ? String(autotradeLastDecision.reason) : undefined} icon={<History className="h-4 w-4" />} />
            </div>
            {autotradeReadonlySections.length > 0 ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {autotradeReadonlySections.map((section) => (
                  <ReadonlyConfigSection key={section.title} title={section.title} items={section.items} />
                ))}
              </div>
            ) : null}
            {actionMessage ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                {actionMessage}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void handleTestBuyAapl()} isLoading={testBuying}>
                BUY AAL 1 шт по рынку
              </Button>
              <Button variant="secondary" onClick={() => void Promise.all([loadDashboard(true), loadAutotradeConfig(), loadLogs()])} isLoading={refreshing}>
                Обновить статус
              </Button>
            </div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Исполнение подвязано к существующему T-1 механизму в мониторинге. Сигнал берётся из текущей логики проверки перед закрытием, а Webull используется как broker execution layer.
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              `Pending / last tracked orders` показывает только заявки, которые были отправлены этим сайтом через manual close или T-1 execution. Обычные брокерские ордера из Webull без участия сайта здесь не появятся.
              {' '}
              Тестовая кнопка `BUY AAL 1 шт по рынку` отправляет реальный ордер для проверки API и подписи.
            </p>
          </Panel>
          <SectionPanel title="Pending / last tracked orders">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Тикер</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Статус</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium">Старт</th>
                    <th className="px-4 py-3 font-medium">Последняя проверка</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.length === 0 && recentTrackedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                        Tracked orders пока нет
                      </td>
                    </tr>
                  ) : trackedOrders.map((order, index) => (
                      <tr key={`${order.clientOrderId}:${order.action}:${index}`} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{order.symbol}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.action}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.status}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatNumber(order.quantity, 4)}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDateTime(order.startedAt)}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDateTime(order.lastCheckedAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          <div className="grid gap-4 xl:grid-cols-2">
            <RawJson title="Raw connection payload" value={data.connection} />
            <RawJson title="Raw autotrade config payload" value={{ config: autotradeConfig, state: autotradeState }} />
            <RawJson title="Raw tracked orders payload" value={{ pending: logs?.pending ?? [], recent: logs?.recent ?? [] }} />
          </div>
          <RawJson title="Raw dashboard payload" value={data} />
        </div>
      );
    }

    if (activeTab === 'monitoring') {
      const openCount = monitoringRows.filter((row) => row.isOpenPosition).length;
      return (
        <div className="space-y-4">
          <Panel radius="2xl" className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Мониторинг отслеживаемых акций</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Цены берутся из текущего quote-провайдера. Обновляй вручную: по кнопке у строки или общей кнопке.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleMonitorReconcile()}
                  isLoading={monitorReconcileApplying}
                >
                  Reconcile
                </Button>
                <IconButton
                  title="Обновить все цены"
                  disabled={monitoringLoading}
                  onClick={() => void loadMonitoringData(true)}
                  variant="outline"
                  size="md"
                >
                  <RefreshCw className={`h-4 w-4 ${monitoringLoading ? 'animate-spin' : ''}`} />
                </IconButton>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard title="Отслеживаемые" value={String(monitoringRows.length)} hint="Акции из /watches" icon={<Radar className="h-4 w-4" />} />
              <InfoCard title="Открытые позиции" value={String(openCount)} hint={openCount > 0 ? 'Есть текущие входы' : 'Открытых позиций нет'} icon={<BriefcaseBusiness className="h-4 w-4" />} />
              <InfoCard title="Consistency" value={monitorConsistencyStatus === 'ok' ? 'OK' : monitorConsistencyStatus === 'reconcile_candidate' ? 'Reconcile' : 'Mismatch'} hint={monitorConsistencyLoading ? 'Проверяем…' : monitorConsistency?.issues[0]?.message ?? 'Состояние monitor/broker'} icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoCard title="Последнее обновление" value={monitoringLastUpdatedAt ? formatDateTime(monitoringLastUpdatedAt) : '—'} hint={monitoringListLoaded ? 'Список загружен' : 'Список не загружен'} icon={<History className="h-4 w-4" />} />
            </div>
            {monitoringError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                {monitoringError}
              </div>
            ) : null}
            {monitorConsistency && monitorConsistency.issues.length > 0 ? (
              <div className="mt-4 space-y-2">
                {monitorConsistency.issues.map((issue) => (
                  <div key={`${issue.code}:${issue.monitorTradeId ?? 'none'}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    {issue.message}
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
          <SectionPanel title="Отслеживаемые тикеры">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Тикер</th>
                    <th className="px-4 py-3 font-medium text-right">Open</th>
                    <th className="px-4 py-3 font-medium text-right">High</th>
                    <th className="px-4 py-3 font-medium text-right">Low</th>
                    <th className="px-4 py-3 font-medium text-right">Цена</th>
                    <th className="px-4 py-3 font-medium text-right">Current IBS</th>
                    <th className="px-4 py-3 font-medium text-right">Prev Close</th>
                    <th className="px-4 py-3 font-medium text-right">Δ</th>
                    <th className="px-4 py-3 font-medium text-right">Entry</th>
                    <th className="px-4 py-3 font-medium text-right">Threshold %</th>
                    <th className="px-4 py-3 font-medium">Позиция</th>
                    <th className="px-4 py-3 font-medium">Обновлено</th>
                    <th className="px-4 py-3 font-medium">Источник</th>
                    <th className="px-4 py-3 font-medium text-right">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {monitoringRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                        {monitoringLoading ? 'Загрузка…' : 'Нет отслеживаемых акций'}
                      </td>
                    </tr>
                  ) : monitoringRows.map((row) => (
                    <tr key={row.symbol} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{row.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.todayOpen)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.todayHigh)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.todayLow)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.currentPrice)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${
                        row.currentIbs != null && row.currentIbs < 0.10
                          ? 'text-rose-600 dark:text-rose-400'
                          : row.currentIbs != null && row.currentIbs > 0.75
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-gray-700 dark:text-gray-300'
                      }`}>{formatRatioPercent(row.currentIbs, 1)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.prevClose)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${row.change != null && row.change < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{row.change == null ? '—' : `${row.change >= 0 ? '+' : ''}${formatMoney(row.change)}`}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(row.entryPrice)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{row.thresholdPct == null ? '—' : formatNumber(row.thresholdPct, 2)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.isOpenPosition ? 'Открыта' : 'В мониторинге'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDateTime(row.quoteUpdatedAt)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.quoteError ? row.quoteError : row.quoteProvider}</td>
                      <td className="px-4 py-3 text-right">
                        <IconButton
                          title={`Обновить ${row.symbol}`}
                          disabled={!!monitoringRefreshingSymbols[row.symbol]}
                          onClick={() => void refreshMonitoringSymbol(row.symbol)}
                          variant="outline"
                          size="sm"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${monitoringRefreshingSymbols[row.symbol] ? 'animate-spin' : ''}`} />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>
          <RawJson title="Raw monitoring payload" value={{ watches: monitoringRows, quoteProvider, lastUpdatedAt: monitoringLastUpdatedAt, monitoringListLoaded, monitorConsistency }} />
        </div>
      );
    }

    if (activeTab === 'trades') {
      const visibleTrades = tradesShowHidden ? tradesData : tradesData.filter(t => !t.isHidden);
      const sourceBadge = (s: string) => {
        const base = 'rounded px-1.5 py-0.5 text-xs font-medium';
        if (s === 'manual') return <span className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300`}>manual</span>;
        if (s === 'test') return <span className={`${base} bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300`}>test</span>;
        return <span className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`}>auto</span>;
      };
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" isLoading={tradesLoading} onClick={() => void loadTrades()}>Обновить</Button>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={tradesShowHidden} onChange={e => setTradesShowHidden(e.target.checked)} className="rounded" />
              Показать скрытые
            </label>
            <Button variant="secondary" size="sm" onClick={handleOpenManualTradeModal}>
              + Добавить вручную
            </Button>
          </div>
          <ManualBrokerTradeModal
            open={manualTradeModalOpen}
            loading={addTradeLoading}
            error={addTradeError}
            onClose={handleCloseManualTradeModal}
            onSubmit={handleAddTrade}
          />

          <SectionPanel title="Журнал сделок">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-3 font-medium">Тикер</th>
                    <th className="px-3 py-3 font-medium">Источник</th>
                    <th className="px-3 py-3 font-medium">Статус</th>
                    <th className="px-3 py-3 font-medium">Вход</th>
                    <th className="px-3 py-3 font-medium">Выход</th>
                    <th className="px-3 py-3 font-medium text-right">Цена входа</th>
                    <th className="px-3 py-3 font-medium text-right">Цена выхода</th>
                    <th className="px-3 py-3 font-medium text-right">Кол-во</th>
                    <th className="px-3 py-3 font-medium text-right">PnL $</th>
                    <th className="px-3 py-3 font-medium text-right">PnL %</th>
                    <th className="px-3 py-3 font-medium text-right">IBS вход</th>
                    <th className="px-3 py-3 font-medium text-right">IBS выход</th>
                    <th className="px-3 py-3 font-medium text-right">Дней</th>
                    <th className="px-3 py-3 font-medium">Client Order ID</th>
                    <th className="px-3 py-3 font-medium">Broker Order ID</th>
                    <th className="px-3 py-3 font-medium">Заметки</th>
                    <th className="px-3 py-3 font-medium text-right">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesLoading ? (
                    <tr><td colSpan={17} className="px-3 py-6 text-center text-gray-500">Загрузка…</td></tr>
                  ) : visibleTrades.length === 0 ? (
                    <tr><td colSpan={17} className="px-3 py-6 text-center text-gray-500">Сделок нет</td></tr>
                  ) : visibleTrades.map((trade) => {
                    const pnlColor = trade.pnlAbsolute != null
                      ? trade.pnlAbsolute > 0 ? 'text-emerald-600 dark:text-emerald-400' : trade.pnlAbsolute < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                      : '';
                    const rowClass = trade.isHidden ? 'opacity-40' : '';
                    return (
                      <tr key={trade.id} className={`border-t border-gray-100 dark:border-gray-800 ${rowClass}`}>
                        <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{trade.symbol}</td>
                        <td className="px-3 py-2">{sourceBadge(trade.source)}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{trade.status === 'open' ? <span className="text-amber-600 dark:text-amber-400 font-medium">открыта</span> : 'закрыта'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{trade.entryDate ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{trade.exitDate ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(trade.entryPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{formatMoney(trade.exitPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">{trade.filledQty ?? trade.quantity ?? '—'}</td>
                        <td className={`px-3 py-2 text-right font-mono ${pnlColor}`}>{formatMoney(trade.pnlAbsolute)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${pnlColor}`}>{formatSignedPercentValue(trade.pnlPercent)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{formatRatioPercent(trade.entryIBS, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{formatRatioPercent(trade.exitIBS, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">{formatHoldingDays(trade.holdingDays, 0)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-400 max-w-[120px] truncate" title={trade.clientOrderId ?? ''}>{trade.clientOrderId ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-400 max-w-[120px] truncate" title={trade.brokerOrderId ?? ''}>{trade.brokerOrderId ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[100px] truncate" title={trade.notes ?? ''}>{trade.notes ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => void handleToggleHide(trade)}
                              className="rounded px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                              title={trade.isHidden ? 'Показать' : 'Скрыть из расчётов'}
                            >
                              {trade.isHidden ? 'Показать' : 'Скрыть'}
                            </button>
                            <button
                              onClick={() => void handleDeleteTrade(trade.id)}
                              className="rounded px-2 py-1 text-xs border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionPanel>
        </div>
      );
    }

    const toggleLog = (key: string) => setLogsCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
    return (
      <div className="space-y-3">
        {/* Наши логи */}
        <Panel radius="2xl" padding="none">
          <div
            className="flex cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800"
            onClick={() => toggleLog('monitor')}
          >
            <div className="flex items-center gap-2">
              {logsCollapsed['monitor'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Наши логи <span className="ml-2 text-xs font-normal text-gray-400">({monitorLogLines.length} строк)</span></h2>
            </div>
            <IconButton
              title="Обновить логи"
              disabled={logsLoading}
              onClick={(e) => { e.stopPropagation(); void loadLogs(); }}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
            </IconButton>
          </div>
          {!logsCollapsed['monitor'] && (
            <pre className="max-h-[520px] overflow-auto p-4 text-xs text-gray-800 dark:text-gray-100">{monitorLogLines.join('\n') || 'Логи мониторинга пока пусты'}</pre>
          )}
        </Panel>

        {/* Autotrade логи */}
        <Panel radius="2xl" padding="none">
          <div
            className="flex cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800"
            onClick={() => toggleLog('autotrade')}
          >
            <div className="flex items-center gap-2">
              {logsCollapsed['autotrade'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Webull / autotrade логи <span className="ml-2 text-xs font-normal text-gray-400">({autotradeLogLines.length} строк)</span></h2>
            </div>
          </div>
          {!logsCollapsed['autotrade'] && (
            <pre className="max-h-[520px] overflow-auto p-4 text-xs text-gray-800 dark:text-gray-100">{autotradeLogLines.map(formatLogLine).join('\n') || 'Логи автоторговли пока пусты'}</pre>
          )}
        </Panel>

        {/* Raw broker log */}
        <Panel radius="2xl" padding="none">
          <div
            className="flex cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800"
            onClick={() => toggleLog('broker')}
          >
            <div className="flex items-center gap-2">
              {logsCollapsed['broker'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Raw broker log (monthly) <span className="ml-2 text-xs font-normal text-gray-400">({brokerRawLogLines.length} строк)</span></h2>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setBrokerLogRaw(v => !v); }}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {brokerLogRaw ? 'Форматировать' : 'Raw JSON'}
            </button>
          </div>
          {!logsCollapsed['broker'] && (
            <pre className="max-h-[520px] overflow-auto p-4 text-xs text-gray-800 dark:text-gray-100">
              {brokerLogRaw
                ? brokerRawLogLines.join('\n') || 'Raw broker log пока пуст'
                : brokerRawLogLines.map(formatLogLine).join('\n') || 'Raw broker log пока пуст'}
            </pre>
          )}
        </Panel>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Кабинет Webull"
        subtitle="Баланс счёта, позиции, ордера, история и логи исполнения по Webull"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
                autotradeConfig?.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {autotradeConfig?.enabled ? '[LIVE]' : '[OFF]'}
            </div>
            <IconButton
              title="Обновить"
              aria-label="Обновить"
              disabled={refreshing}
              onClick={() => void Promise.all([loadDashboard(true), loadLogs(), loadAutotradeConfig()])}
              variant="glass"
              size="md"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </IconButton>
          </div>
        }
      />

      <Panel padding="none" tone="soft">
        <AnalysisTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as BrokerTab)}
        />
        <div className="space-y-4 p-4">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{error}</div>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="p-6 text-sm text-gray-600 dark:text-gray-300">
              Загрузка данных кабинета…
            </div>
          ) : renderTabContent()}
        </div>
      </Panel>
    </div>
  );
}
