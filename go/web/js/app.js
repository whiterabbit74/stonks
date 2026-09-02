(() => {
  const TABS = [
    { to: '/data', label: 'Данные' },
    { to: '/stocks', label: 'Акции' },
    { to: '/ema', label: 'EMA' },
    { to: '/multi-ticker-options', label: 'Опционы' },
    { to: '/calendar', label: 'Календарь' },
    { to: '/split', label: 'Сплиты' },
    { to: '/watches', label: 'Мониторинг' },
    { to: '/broker', label: 'Брокер' },
  ];
  const BOTTOM = [
    { to: '/data', label: 'Данные', icon: 'database' },
    { to: '/stocks', label: 'Акции', icon: 'linechart' },
    { to: '/ema', label: 'EMA', icon: 'linechart' },
    { to: '/multi-ticker-options', label: 'Опционы', icon: 'layers' },
    { to: '/broker', label: 'Брокер', icon: 'wallet' },
  ];
  const MOBILE_MENU = [
    { to: '/data', label: 'Данные', icon: 'database' },
    { to: '/stocks', label: 'Акции', icon: 'linechart' },
    { to: '/ema', label: 'EMA', icon: 'linechart' },
    { to: '/multi-ticker-options', label: 'Опционы', icon: 'layers' },
    { to: '/calendar', label: 'Календарь', icon: 'calendar' },
    { to: '/split', label: 'Сплиты', icon: 'scissors' },
    { to: '/watches', label: 'Мониторинг', icon: 'bell' },
    { to: '/broker', label: 'Брокер', icon: 'briefcase' },
    { to: '/settings', label: 'Настройки', icon: 'settings' },
  ];
  const STOCK_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'price', label: 'Цены' },
    { id: 'tickerCharts', label: 'Графики тикеров' },
    { id: 'equity', label: 'Капитал' },
    { id: 'exposure', label: 'Экспозиция' },
    { id: 'drawdown', label: 'Просадка' },
    { id: 'openDayDrawdown', label: 'Просадка дня' },
    { id: 'trades', label: 'Сделки' },
    { id: 'profit', label: 'Профит Фактор' },
    { id: 'duration', label: 'Длительность' },
    { id: 'monthlyContribution', label: 'Пополнения' },
    { id: 'splits', label: 'Сплиты' },
    { id: 'buyhold', label: 'Buy & Hold' },
    { id: 'buyAtClose', label: 'BuyAtClose' },
    { id: 'buyAtClose4', label: 'BuyAtClose4' },
    { id: 'noStopLoss', label: 'Без стоп-лосса' },
    { id: 'options', label: 'Опционы' },
  ];
  const SINGLE_ONLY = new Set(['buyhold', 'openDayDrawdown', 'buyAtClose', 'buyAtClose4', 'noStopLoss', 'options']);
  const MULTI_ONLY = new Set(['tickerCharts']);
  const SETTINGS_TABS = [
    { id: 'general', label: 'Общие' },
    { id: 'api', label: 'API' },
    { id: 'telegram', label: 'Telegram' },
    { id: 'interface', label: 'Интерфейс' },
    { id: 'autotrade', label: 'Автоторговля' },
  ];
  const SPLITS_TABS = [
    { id: 'list', label: 'Список' },
    { id: 'create', label: 'Добавить' },
    { id: 'import', label: 'Импорт' },
    { id: 'export', label: 'Экспорт' },
    { id: 'webull', label: 'Webull API' },
  ];
  const WATCH_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'trades', label: 'Сделки' },
    { id: 'watches', label: 'Тикеры' },
    { id: 'ema', label: 'EMA' },
  ];
  const BROKER_TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'positions', label: 'Позиции' },
    { id: 'orders', label: 'Ордера' },
    { id: 'fills', label: 'Исполненные' },
    { id: 'journal', label: 'Журнал сделок' },
    { id: 'autotrade', label: 'Автоторговля' },
    { id: 'monitor', label: 'Мониторинг' },
    { id: 'logs', label: 'Логи' },
  ];
  const POPULAR = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc. Class A' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.' },
    { symbol: 'UNH', name: 'UnitedHealth Group Inc.' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'PG', name: 'Procter & Gamble Co.' },
    { symbol: 'HD', name: 'The Home Depot Inc.' },
    { symbol: 'CVX', name: 'Chevron Corporation' },
    { symbol: 'MA', name: 'Mastercard Inc.' },
    { symbol: 'BAC', name: 'Bank of America Corp.' },
    { symbol: 'ABBV', name: 'AbbVie Inc.' },
    { symbol: 'PFE', name: 'Pfizer Inc.' },
  ];
  const LEV_PCT = [100, 125, 150, 175, 200, 225, 250, 275, 300];
  const DEFAULT_LEVERAGE_LABEL = '200%';
  const HERO_RANGES = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];
  const EMA_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'price', label: 'Цены' },
    { id: 'emaDeviation', label: 'Отклонение' },
    { id: 'equity', label: 'Капитал' },
    { id: 'exposure', label: 'Экспозиция' },
    { id: 'drawdown', label: 'Просадка' },
    { id: 'trades', label: 'Сделки' },
    { id: 'profit', label: 'Профит-фактор' },
    { id: 'duration', label: 'Длительность' },
    { id: 'spreads', label: 'Спреды' },
  ];
  const OPTIONS_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'equity', label: 'Баланс' },
    { id: 'price', label: 'Цены' },
    { id: 'tickerCharts', label: 'Графики тикеров' },
    { id: 'drawdown', label: 'Просадка' },
    { id: 'trades', label: 'Сделки' },
    { id: 'profit', label: 'Профит Фактор' },
    { id: 'duration', label: 'Длительность' },
    { id: 'splits', label: 'Сплиты' },
  ];
  const ENHANCE_CATS = [
    { id: 'all', label: 'Все', icon: '📊' },
    { id: 'popular', label: 'Популярные', icon: '⭐' },
    { id: 'nasdaq100', label: 'NASDAQ 100', icon: '📈' },
    { id: 'sp500', label: 'S&P 500', icon: '🏛️' },
    { id: 'tech', label: 'Технологии', icon: '💻' },
    { id: 'finance', label: 'Финансы', icon: '🏦' },
    { id: 'health', label: 'Здравоохранение', icon: '🏥' },
    { id: 'energy', label: 'Энергетика', icon: '⚡' },
    { id: 'consumer', label: 'Потребительские', icon: '🛒' },
    { id: 'etf', label: 'ETF', icon: '📦' },
    { id: 'leveraged', label: 'С плечом', icon: '🚀' },
  ];
  const PATHS = {
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    linechart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    sliders: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    arrowne: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    logo: '<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
  };

  const storedTheme = localStorage.getItem('theme');
  const nyseNow = nyseParts();
  const state = {
    theme: storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'auto' ? storedTheme : 'auto',
    mobileOpen: false,
    user: false,
    apiBuildId: null,
    page: '/',
    datasets: [],
    result: null,
    ticker: 'GOOGL',
    tickerInput: localStorage.getItem('tickersInput') || 'AAPL, MSFT, AMZN, MAGS',
    emaTickers: localStorage.getItem('ema.tickers') || 'TQQQ',
    optTickers: localStorage.getItem('options.tickers') || localStorage.getItem('tickersInput') || 'AAPL, MSFT, AMZN, MAGS',
    leverage: 200,
    takeProfit: localStorage.getItem('stocksTakeProfit') || '',
    tickersData: [],
    stockTab: 'summary',
    bars: [],
    error: null,
    running: false,
    toast: null,
    confirm: null,
    modal: null,
    dataView: localStorage.getItem('dataView') || 'compact',
    dataTag: 'all',
    settingsTab: 'general',
    splitsTab: 'list',
    watchTab: 'summary',
    brokerTab: 'overview',
    cal: { year: nyseNow.y, month: nyseNow.m, data: null },
    settings: {},
    splitsMap: {},
    watches: [],
    broker: null,
    token: null,
    menuTicker: null,
    loaded: {},
    emaResult: null,
    emaTab: 'summary',
    emaForm: { period: 200, leverage: 200, signal: 'close', start: 'full_history', takeProfit: '', noSellAtLoss: false, buyZones: [{ id: 'buy-20', levelPct: -20, enabled: true }], sellZones: [{ id: 'sell-40', levelPct: 40, enabled: true }] },
    heroByPage: {},
    heroTf: (() => { try { return JSON.parse(localStorage.getItem('chart-prefs') || '{}').timeframe === 'weekly' ? 'weekly' : 'daily'; } catch { return 'daily'; } })(),
    heroSettingsOpen: false,
    quoteOpen: false,
    quote: null,
    quoteLoading: false,
    refreshingTicker: null,
    emaPresets: JSON.parse(localStorage.getItem('emaPresets') || '[]'),
    optResult: null,
    optTab: 'summary',
    optForm: { strike: 10, vol: 20, cap: 10, expiration: 4, maxHold: 30, leverage: 200 },
    monitorTrades: [],
    emaAlerts: [],
    autoConfig: {},
    tickerCatalog: [],
    enhanceCat: 'popular',
    enhanceQuery: '',
    analysisTabsConfig: JSON.parse(localStorage.getItem('analysisTabsConfig') || 'null') || STOCK_TABS.filter((t) => t.id !== 'summary').map((t) => ({ ...t, visible: true })),
  };

  function icon(name, cls) {
    return `<svg class="${cls || 'w-5 h-5'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  }
  function logo(size) {
    const cls = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
    return `<svg class="${cls} text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">${PATHS.logo}</svg>`;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, d = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    if (!Number.isFinite(n)) return '∞';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtUsd(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function fmtPct(n) { return (n == null ? 0 : n).toFixed(1) + '%'; }
  function pnlClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }
  function isDark() {
    return state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function mmddLabel(k) {
    const [mm, dd] = String(k).split('-');
    const names = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const i = Number(mm) - 1;
    return `${Number(dd)} ${names[i] || k}`;
  }
  function nyseParts(d) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
    const o = {};
    fmt.formatToParts(d || new Date()).forEach((p) => { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month - 1, d: +o.day, iso: `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}` };
  }
  function parseTickers(s) {
    return Array.from(new Set(String(s || '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)));
  }
  function defaultTickers() {
    return parseTickers(state.settings.defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS');
  }
  function providerId() {
    return state.settings.enhancerProvider || 'finnhub';
  }
  function providerLabel(id) {
    const m = { finnhub: 'Finnhub', alpha_vantage: 'Alpha Vantage', twelve_data: 'Twelve Data', polygon: 'Polygon', webull: 'Webull' };
    return m[id] || id || 'Finnhub';
  }
  function levOptions(selected) {
    const cur = Number(selected) || 200;
    return LEV_PCT.map((n) => {
      const label = n === 200 ? DEFAULT_LEVERAGE_LABEL : `${n}%`;
      return `<option value="${n}" ${cur === n ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }
  function inputCls() {
    return 'w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800';
  }
  function tradeTicker(tr) {
    if (!tr) return '';
    return tr.ticker || tr.symbol || (tr.context && (tr.context.ticker || tr.context.Ticker)) || '';
  }
  function resultOf(r) {
    if (!r) return null;
    const trades = (r.trades || r.Trades || r.tradesList || []).map((tr) => {
      const ticker = tradeTicker(tr);
      return ticker && !tr.ticker ? { ...tr, ticker } : tr;
    });
    return {
      equity: r.equity || r.Equity || [],
      trades,
      metrics: r.metrics || r.Metrics || {},
      finalValue: r.finalValue ?? r.FinalValue,
      maxDrawdown: r.maxDrawdown ?? r.MaxDrawdown,
      exposure: r.exposure || r.Exposure || [],
      deviation: r.deviation || r.Deviation || [],
    };
  }
  function normalizeEmaForm(f) {
    f = f || {};
    const buyZones = Array.isArray(f.buyZones) && f.buyZones.length
      ? f.buyZones.map((z, i) => ({ id: z.id || ('buy-' + i), levelPct: Number(z.levelPct), enabled: z.enabled !== false }))
      : [{ id: 'buy-20', levelPct: Number(f.buy ?? -20), enabled: true }];
    const sellZones = Array.isArray(f.sellZones) && f.sellZones.length
      ? f.sellZones.map((z, i) => ({ id: z.id || ('sell-' + i), levelPct: Number(z.levelPct), enabled: z.enabled !== false }))
      : [{ id: 'sell-40', levelPct: Number(f.sell ?? 40), enabled: true }];
    return {
      period: Number(f.period) === 20 ? 20 : 200,
      leverage: Number.isFinite(Number(f.leverage)) ? Number(f.leverage) : 200,
      signal: f.signal === 'intraday' ? 'intraday' : 'close',
      start: f.start === 'from_start' ? 'from_start' : 'full_history',
      takeProfit: f.takeProfit == null ? '' : String(f.takeProfit),
      noSellAtLoss: !!f.noSellAtLoss,
      buyZones,
      sellZones,
    };
  }
  function persistEmaForm() {
    try { localStorage.setItem('ema.settings', JSON.stringify(state.emaForm)); } catch (_) {}
  }
  function makeZone(side, level) {
    return { id: side + '-' + Date.now() + '-' + Math.random().toString(16).slice(2), levelPct: level, enabled: true };
  }
  function heroPageKey() {
    if (state.page === '/ema') return 'ema';
    if (state.page === '/multi-ticker-options') return 'opt';
    return 'stocks';
  }
  function hp() {
    const k = heroPageKey();
    if (!state.heroByPage[k]) {
      const prefix = k === 'opt' ? 'options' : k;
      state.heroByPage[k] = {
        range: localStorage.getItem(prefix + '.heroRange') || '3M',
        kind: localStorage.getItem(prefix + '.heroChartKind') === 'candles' ? 'candles' : 'line',
        showTrades: localStorage.getItem(prefix + '.heroShowTrades') !== '0',
        ticker: null,
      };
    }
    return state.heroByPage[k];
  }
  function persistHero() {
    try {
      const k = heroPageKey();
      const prefix = k === 'opt' ? 'options' : k;
      const p = hp();
      localStorage.setItem(prefix + '.heroRange', p.range);
      localStorage.setItem(prefix + '.heroChartKind', p.kind);
      localStorage.setItem(prefix + '.heroShowTrades', p.showTrades ? '1' : '0');
      const raw = JSON.parse(localStorage.getItem('chart-prefs') || '{}');
      raw.timeframe = state.heroTf;
      localStorage.setItem('chart-prefs', JSON.stringify(raw));
    } catch (_) {}
  }
  function pageTickerText() {
    if (state.page === '/ema') return state.emaTickers;
    if (state.page === '/multi-ticker-options') return state.optTickers;
    return state.tickerInput;
  }
  function selectedHeroTicker() {
    const tickers = parseTickers(pageTickerText());
    const sel = hp().ticker;
    if (sel && tickers.includes(sel)) return sel;
    return tickers[0] || state.ticker || '';
  }
  function barsForTicker(t) {
    const entry = (state.tickersData || []).find((x) => x.ticker === t);
    return (entry && entry.data) || state.bars || [];
  }
  function lastBarDate(t) {
    const bars = barsForTicker(t);
    return bars.length ? bars[bars.length - 1].date : null;
  }
  function tradesForTicker(t, result) {
    const trades = (result && result.trades) || [];
    if (!t || !trades.some((tr) => tradeTicker(tr))) return trades;
    return trades.filter((tr) => tradeTicker(tr) === t);
  }
  function numOrNull(v) {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function normalizeQuote(payload) {
    const q = payload && payload.quote && typeof payload.quote === 'object' ? payload.quote : (payload || {});
    const range = payload && payload.range && typeof payload.range === 'object' ? payload.range : {};
    return {
      open: numOrNull(q.open ?? q.o),
      high: numOrNull(q.high ?? q.h ?? range.high),
      low: numOrNull(q.low ?? q.l ?? range.low),
      current: numOrNull(q.current ?? q.c),
      prevClose: numOrNull(q.prevClose ?? q.pc),
    };
  }
  function isMarketOpen() {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    });
    const o = {};
    fmt.formatToParts(new Date()).forEach((p) => { if (p.type !== 'literal') o[p.type] = p.value; });
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    if (wd === 0 || wd === 6) return false;
    const minutes = (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute || '0', 10);
    const cal = state.cal.data;
    const y = +o.year, mo = +o.month, d = +o.day;
    const mmdd = String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const ymd = y + '-' + mmdd;
    function has(map) {
      if (!map || typeof map !== 'object') return false;
      if (map[ymd]) return true;
      const by = map[String(y)];
      return !!(by && typeof by === 'object' && by[mmdd]);
    }
    if (has(cal && cal.holidays)) return false;
    const short = has(cal && cal.shortDays);
    return minutes >= (9 * 60 + 30) && minutes < (short ? 13 * 60 : 16 * 60);
  }
  function isDataOutdated(lastDate) {
    if (!lastDate) return true;
    const today = nyseParts().iso;
    const [ay, am, ad] = String(lastDate).slice(0, 10).split('-').map(Number);
    const [by, bm, bd] = today.split('-').map(Number);
    const days = Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
    return days > 2;
  }
  function heroQuoteInner() {
    const q = state.quote;
    const t = selectedHeroTicker();
    if (!q || q.ticker !== t || q.current == null) return '';
    const delta = q.prevClose != null ? q.current - q.prevClose : null;
    const pct = delta != null && q.prevClose ? (delta / q.prevClose) * 100 : null;
    const pos = delta == null || delta >= 0;
    const color = pos ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';
    const dlt = delta == null ? '' : `<span class="text-xs font-semibold ${color}">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pct == null ? '' : ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)'}</span>`;
    return `<span class="text-base font-bold text-gray-900 dark:text-gray-100">${fmt(q.current)}</span>${dlt}`;
  }
  function quotePopBody() {
    const q = state.quote || {};
    const prov = providerLabel(state.settings.resultsQuoteProvider || providerId() || 'finnhub');
    const cell = (label, v) => `<div class="rounded border border-gray-200 px-2 py-1 dark:border-gray-700"><div class="text-[10px] uppercase tracking-wide text-gray-500">${label}</div><div class="font-mono text-xs">${v == null ? '—' : fmt(v)}</div></div>`;
    return `<div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Детали котировки</div>
      <div class="mt-2 space-y-1.5 text-xs">
        <div class="flex items-center justify-between gap-2"><span class="text-gray-500">Источник</span><span>${esc(prov)}</span></div>
        <div class="mt-1.5 grid grid-cols-2 gap-1.5">${cell('Откр', q.open)}${cell('Макс', q.high)}${cell('Мин', q.low)}${cell('Текущ', q.current)}</div>
      </div>`;
  }

  function staleWarningHTML(ticker, bars) {
    const last = bars && bars.length ? bars[bars.length - 1].date : null;
    if (!ticker || !isDataOutdated(last)) return '';
    const spin = state.refreshingTicker === ticker ? ' animate-spin' : '';
    return `<div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
      <div class="flex items-start justify-between gap-2">
        <div>Данные ${esc(ticker)} не актуальны</div>
        <button type="button" id="stale-refresh" class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100" title="Обновить данные">${icon('refresh', 'h-3.5 w-3.5' + spin)}</button>
      </div>
    </div>`;
  }
  function openPositionHTML(trades, lastDate) {
    const list = trades || [];
    const last = list[list.length - 1] || null;
    const isOpen = !!(last && lastDate && last.exitDate === lastDate);
    const entry = isOpen ? last.entryPrice : null;
    return `<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200">
      <span>Открытая сделка: <span class="${isOpen ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-500'}">${isOpen ? 'да' : 'нет'}</span>
      ${isOpen && entry != null ? `<span class="ml-1 text-gray-600">вход: $${Number(entry).toFixed(2)}</span>` : ''}</span>
    </div>`;
  }
  function zoneEditorHTML(title, zones, side) {
    const rows = (zones || []).map((z) => `<div class="zone-row">
      <input type="checkbox" data-zone-on="${esc(z.id)}" ${z.enabled ? 'checked' : ''} class="h-4 w-4 accent-blue-600" aria-label="Включить зону" />
      <div class="zone-pct">
        <input type="number" step="1" data-zone-pct="${esc(z.id)}" value="${esc(z.levelPct)}" class="${inputCls()}" aria-label="Уровень зоны, %" />
        <span class="zone-pct-suffix">%</span>
      </div>
      <button type="button" data-zone-del="${esc(z.id)}" class="icon-btn icon-btn-md icon-btn-glass" title="Удалить зону" aria-label="Удалить зону">${icon('trash', 'h-3.5 w-3.5')}</button>
    </div>`).join('');
    return `<div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300">${esc(title)}</div>
        <button type="button" data-zone-add="${side}" class="icon-btn icon-btn-md icon-btn-glass" title="Добавить зону" aria-label="Добавить зону">${icon('plus', 'h-3.5 w-3.5')}</button>
      </div>
      <div class="space-y-1.5">${rows}</div>
    </div>`;
  }
  function heroToolbarHTML(tickers, selected, opts) {
    opts = opts || {};
    const pills = (tickers || []).map((t) => `<button type="button" data-hero-ticker="${esc(t)}" class="hero-pill ${t === selected ? 'hero-pill-on' : 'hero-pill-off'}">${esc(t)}</button>`).join('');
    const quoteBlock = opts.showQuote ? `<div id="hero-quote" class="flex items-baseline gap-1.5 ml-1">${heroQuoteInner()}</div>` : '';
    const pro = opts.proLabel
      ? `<button type="button" id="hero-pro" class="hero-pro" title="${esc(opts.proTitle || 'Открыть профессиональный график')}">${esc(opts.proLabel)} ${icon('arrowne', 'w-3 h-3')}</button>`
      : '';
    const quoteBtns = opts.showQuote ? `
      <button type="button" id="hero-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить котировку" aria-label="Обновить котировку" ${state.quoteLoading ? 'disabled' : ''}>${icon('refresh', 'h-3.5 w-3.5' + (state.quoteLoading ? ' animate-spin' : ''))}</button>
      <div class="relative" id="quote-pop-wrap">
        <button type="button" id="quote-pop-btn" class="icon-btn icon-btn-md icon-btn-glass" title="Детали котировки" aria-label="Детали котировки">${icon('help', 'h-3.5 w-3.5')}</button>
        <div id="quote-pop" class="hero-pop ${state.quoteOpen ? '' : 'hidden'}" style="width:14rem">${quotePopBody()}</div>
      </div>` : '';
    return `<div class="flex flex-wrap items-center gap-1.5">
      <div class="flex flex-wrap gap-1">${pills}</div>
      ${quoteBlock}
      <div class="ml-auto flex items-center gap-1.5">
        ${pro}
        ${quoteBtns}
        <div class="relative" id="hero-settings-wrap">
          <button type="button" id="hero-settings-btn" class="icon-btn icon-btn-md icon-btn-glass" title="Настройки графика" aria-label="Настройки графика">${icon('sliders', 'h-3.5 w-3.5')}</button>
          <div id="hero-settings-pop" class="hero-pop ${state.heroSettingsOpen ? '' : 'hidden'}">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Тип графика</div>
            <div class="mt-1.5 grid grid-cols-2 gap-1">
              <button type="button" data-hero-kind="line" class="hero-kind ${hp().kind === 'line' ? 'hero-kind-on' : 'hero-kind-off'}">Линия</button>
              <button type="button" data-hero-kind="candles" class="hero-kind ${hp().kind === 'candles' ? 'hero-kind-on' : 'hero-kind-off'}">Свечи</button>
            </div>
            <button type="button" id="hero-trades-toggle" class="mt-2 flex w-full items-center justify-between rounded bg-gray-100 px-2 py-1.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <span>Показывать сделки</span>
              <span class="${hp().showTrades ? 'text-green-600 dark:text-green-300' : 'text-gray-500'}">${hp().showTrades ? 'Вкл' : 'Выкл'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function heroChartHTML(chartId) {
    const open = isMarketOpen();
    const t = selectedHeroTicker();
    const last = lastBarDate(t);
    const stale = isDataOutdated(last);
    const ranges = HERO_RANGES.map((r) => `<button type="button" data-hero-range="${r}" class="hero-range ${hp().range === r ? 'hero-range-on' : 'hero-range-off'}">${r}</button>`).join('');
    const legend = `<div class="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
      <div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" style="background:${hp().kind === 'line' ? '#16a34a' : '#10B981'}"></span><span>${hp().kind === 'line' ? 'Цена закрытия' : 'Свечи'}</span></div>
      ${hp().showTrades ? '<div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" style="background:#16a34a"></span><span>Покупка</span></div><div class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" style="background:#dc2626"></span><span>Продажа</span></div>' : ''}
    </div>`;
    return `<div class="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900">
      <div class="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div id="${chartId}" class="chart-hero"></div>
      </div>
      <div class="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
        <div class="hero-footer-row">
          <div class="min-w-0 overflow-x-auto"><div class="flex min-w-max items-center gap-1.5">${ranges}</div></div>
          <div class="flex shrink-0 items-center gap-1.5">
            <div class="hero-tf">
              <button type="button" data-hero-tf="daily" class="${state.heroTf === 'daily' ? 'hero-tf-on' : 'hero-tf-off'}">День</button>
              <button type="button" data-hero-tf="weekly" class="${state.heroTf === 'weekly' ? 'hero-tf-on' : 'hero-tf-off'}">Неделя</button>
            </div>
            <div class="hero-mkt ${open ? 'hero-mkt-open' : 'hero-mkt-closed'}">
              <span class="hero-dot ${stale && !state.quoteLoading ? 'bg-red-500' : 'bg-green-500'}" title="${stale && !state.quoteLoading ? 'Нет актуального обновления' : 'Данные актуальны'}"></span>
              ${open ? 'Рынок открыт' : 'Рынок закрыт'}
            </div>
          </div>
        </div>
        ${legend}
      </div>
    </div>`;
  }
  function heroPanelHTML(opts) {
    const tickers = parseTickers(pageTickerText());
    const selected = selectedHeroTicker();
    return `<div class="space-y-3">
      ${heroToolbarHTML(tickers, selected, opts)}
      ${heroChartHTML(opts.chartId || 'chart-hero')}
    </div>`;
  }
  function asideExtrasHTML(result) {
    if (!result) return '';
    const t = selectedHeroTicker();
    return staleWarningHTML(t, barsForTicker(t)) + openPositionHTML(result.trades, lastBarDate(t));
  }
  function pick(m, k) {
    if (!m || typeof m !== 'object') return undefined;
    return m[k] ?? m[k.charAt(0).toUpperCase() + k.slice(1)];
  }
  function profitBody(r) {
    const x = resultOf(r);
    if (!x) return '<p class="text-sm text-gray-500">Нет сделок</p>';
    const pf = pick(x.metrics, 'profitFactor');
    const wins = x.trades.filter((t) => (t.pnl || 0) > 0);
    const losses = x.trades.filter((t) => (t.pnl || 0) < 0);
    return `<p class="mb-3">Профит-фактор: <b>${fmt(pf)}</b> · прибыльных ${wins.length} · убыточных ${losses.length}</p>`;
  }
  function durationBody(r) {
    const x = resultOf(r);
    if (!x || !x.trades.length) return '<p class="text-sm text-gray-500">Нет сделок</p>';
    const avg = x.trades.reduce((s, t) => s + (t.duration || 0), 0) / x.trades.length;
    return `<p class="mb-3">Средняя длительность: <b>${fmt(avg, 1)}</b> дн.</p>`;
  }
  function spreadsTable(buy, sell) {
    const rows = [].concat(buy || []).flatMap((b) => (sell || []).map((s) => `<tr><td>${fmt(b)}</td><td>${fmt(s)}</td><td>${fmt(s - b, 1)} п.п.</td></tr>`)).join('');
    return `<table class="trades"><thead><tr><th>Покупка</th><th>Продажа</th><th>Расстояние</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="text-center text-gray-500">Нет зон</td></tr>'}</tbody></table>`;
  }
  function catalogFiltered() {
    const cat = state.enhanceCat || 'popular';
    const q = String(state.enhanceQuery || '').toLowerCase().trim();
    let list = state.tickerCatalog.length ? state.tickerCatalog : POPULAR;
    if (cat !== 'all') list = list.filter((t) => (t.categories || []).includes(cat) || (cat === 'popular' && !t.categories));
    if (q) list = list.filter((t) => t.symbol.toLowerCase().includes(q) || String(t.name || '').toLowerCase().includes(q));
    return list;
  }
  function enhanceCatalogCards() {
    const loaded = new Set((state.datasets || []).map((d) => String(d.ticker || '').toUpperCase()));
    const list = catalogFiltered();
    const cards = list.map((t) => {
      const on = loaded.has(t.symbol);
      return `<button type="button" data-esym="${esc(t.symbol)}" class="ticker-card${on ? ' loaded' : ''}" title="${on ? esc(t.symbol) + ' уже загружен. Нажмите для обновления' : 'Нажмите для загрузки ' + t.symbol}">
        <div class="text-sm font-medium truncate ${on ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}">${esc(t.name)}</div>
        <div class="text-xs font-mono mt-0.5 ${on ? 'text-green-600' : 'text-gray-500'}">${esc(t.symbol)}</div>
      </button>`;
    }).join('') || '<p class="text-sm text-gray-500 col-span-full text-center py-8">Ничего не найдено</p>';
    return { list, cards };
  }
  function monitorStats(trades) {
    const closed = (trades || []).filter((t) => t.status === 'closed' && Number.isFinite(Number(t.pnlPercent)));
    const initial = 10000;
    let bal = initial, peak = initial;
    const equity = [];
    let wins = 0, hold = 0, net = 0;
    closed.slice().sort((a, b) => String(a.exitDate || '').localeCompare(String(b.exitDate || ''))).forEach((t) => {
      const pct = Number(t.pnlPercent) || 0;
      bal *= 1 + pct / 100;
      if (bal > peak) peak = bal;
      equity.push({ date: t.exitDate || t.entryDate, value: bal, drawdown: peak > 0 ? ((peak - bal) / peak) * 100 : 0 });
      if (pct > 0) wins++;
      hold += Number(t.duration) || 0;
      net += Number(t.pnlAbsolute) || 0;
    });
    const dd = equity.reduce((m, p) => Math.max(m, p.drawdown || 0), 0);
    const avg = closed.length ? closed.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / closed.length : 0;
    return { closed, initial, bal, equity, wins, hold, net, dd, avg, ret: (bal / initial - 1) * 100 };
  }
  async function loadCatalog() {
    if (state.tickerCatalog.length) return;
    try {
      const r = await fetch('/tickers.json');
      const json = await r.json();
      if (Array.isArray(json) && json.length) state.tickerCatalog = json;
    } catch (_) {
      state.tickerCatalog = POPULAR.map((t) => ({ ...t, categories: ['popular'] }));
    }
  }
  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
    if (hours > 0) return `${hours}ч ${minutes}м ${secs}с`;
    return `${minutes}м ${secs}с`;
  }
  function secondsToNextSignal() {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    });
    const o = {};
    fmt.formatToParts(new Date()).forEach((p) => { o[p.type] = p.value; });
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = wdMap[o.weekday] ?? 0;
    const secOfDay = (+o.hour) * 3600 + (+o.minute) * 60 + (+o.second);
    const target1 = (16 * 60 - 11) * 60;
    const target2 = (16 * 60 - 1) * 60;
    const isWeekday = weekday >= 1 && weekday <= 5;
    if (isWeekday) {
      if (secOfDay < target1) return target1 - secOfDay;
      if (secOfDay < target2) return target2 - secOfDay;
    }
    let daysToAdd = 1;
    let wd = weekday;
    for (let i = 0; i < 7; i++) {
      wd = (wd + 1) % 7;
      if (wd >= 1 && wd <= 5) break;
      daysToAdd++;
    }
    return (24 * 3600 - secOfDay) + (daysToAdd - 1) * 24 * 3600 + target1;
  }
  function applyTheme() {
    const html = document.documentElement;
    html.classList.add('theme-changing');
    html.classList.toggle('dark', isDark());
    html.dataset.theme = state.theme;
    try { localStorage.setItem('theme', state.theme); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark() ? '#0b1220' : '#ffffff');
    setTimeout(() => html.classList.remove('theme-changing'), 80);
  }
  function themeLabel() {
    return state.theme === 'auto' ? 'Авто' : state.theme === 'dark' ? 'Тёмная' : 'Светлая';
  }
  function themeIcon() {
    return state.theme === 'auto' ? 'laptop' : state.theme === 'dark' ? 'moon' : 'sun';
  }

  function pageHeader(title, subtitle, actions) {
    return `<div class="mb-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${esc(title)}</h1>
          ${subtitle ? `<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">${esc(subtitle)}</p>` : ''}
        </div>
        ${actions ? `<div class="flex flex-wrap items-center gap-2 sm:flex-shrink-0">${actions}</div>` : ''}
      </div>
      <div class="mt-3 h-px bg-gradient-to-r from-indigo-500/50 via-sky-500/40 to-transparent"></div>
    </div>`;
  }
  function analysisTabs(tabs, active, attr) {
    return `<div class="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      <div class="flex items-center gap-2 flex-nowrap min-w-max px-1" role="tablist">
        ${tabs.map((t) => `<button ${attr}="${esc(t.id)}" role="tab" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}" class="px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap sm:px-6 ${t.id === active ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}">${esc(t.label)}</button>`).join('')}
      </div>
    </div>`;
  }
  function tickerInput(id, value) {
    return `<div>
      <input id="${id}" type="text" value="${esc(value)}" placeholder="AAPL, MSFT, AMZN, MAGS" class="${inputCls()} text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
    </div>`;
  }
  function metricsGrid(m, finalValue, maxDrawdown) {
    if (!m) return '';
    const fv = finalValue ?? m.finalValue;
    const dd = maxDrawdown ?? m.maxDrawdown;
    const pf = Number.isFinite(m.profitFactor) ? fmt(m.profitFactor) : '∞';
    return `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
      <div class="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-green-600">${fmtUsd(fv)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div></div>
      <div class="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-blue-600">${fmtPct(m.totalReturn)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-orange-600">${fmtPct(m.cagr)}</div><div class="text-sm text-gray-600 dark:text-gray-400">CAGR</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-purple-600">${fmtPct(m.winRate)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Доля прибыльных</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-red-600">${fmtPct(dd)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-indigo-600">${m.totalTrades ?? 0}</div><div class="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-teal-600">${pf}</div><div class="text-sm text-gray-600 dark:text-gray-400">Профит-фактор</div></div>
    </div>`;
  }
  function tradesTable(trades) {
    const rows = (trades || []).slice(0, 200).map((t) => `<tr>
      <td>${esc(t.entryDate)}</td><td>${esc(t.exitDate)}</td>
      <td>${fmt(t.entryPrice)}</td><td>${fmt(t.exitPrice)}</td>
      <td>${fmt(t.quantity, 4)}</td>
      <td class="${pnlClass(t.pnl)}">${fmt(t.pnl)}</td>
      <td>${esc(t.duration)}</td><td>${esc(t.exitReason || '')}</td>
    </tr>`).join('');
    return `<div class="table-wrap rounded border dark:border-gray-800"><table class="trades"><thead><tr><th>Вход</th><th>Выход</th><th>Цена входа</th><th>Цена выхода</th><th>Кол-во</th><th>P&L</th><th>Дней</th><th>Причина</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Нет сделок</td></tr>'}</tbody></table></div>`;
  }
  function overlay() {
    let html = '';
    if (state.confirm) {
      html += `<div class="modal-backdrop" id="confirm-box"><div class="modal-card">
        <h3 class="text-lg font-semibold mb-2">${esc(state.confirm.title || 'Подтверждение')}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${esc(state.confirm.message || '')}</p>
        <div class="flex justify-end gap-2"><button id="confirm-no" class="btn-secondary">Отмена</button><button id="confirm-yes" class="btn-danger">Удалить</button></div>
      </div></div>`;
    }
    if (state.modal) html += state.modal;
    if (state.toast) html += `<div class="toast">${esc(state.toast)}</div>`;
    return html;
  }
  function toast(msg) {
    state.toast = msg;
    const host = document.getElementById('overlay-root');
    if (host) host.innerHTML = overlay();
    setTimeout(() => { if (state.toast === msg) { state.toast = null; const h = document.getElementById('overlay-root'); if (h) h.innerHTML = overlay(); } }, 2500);
  }

  function navigate(path, replace) {
    if (path === '/results') path = '/stocks';
    if (replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
    state.page = path.split('?')[0];
    state.mobileOpen = false;
    const q = new URL(location.href).searchParams.get('tickers');
    if (q) {
      state.tickerInput = q.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
    }
    state.menuTicker = null;
    state.heroSettingsOpen = false;
    state.quoteOpen = false;
    renderPage();
  }
  window.addEventListener('popstate', () => {
    state.page = location.pathname === '/' ? '/data' : location.pathname;
    renderPage();
  });

  function footerHTML(apiVer) {
    const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());
    return `<footer class="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-4">
            <div class="flex items-center gap-3">${logo('md')}<div><h3 class="font-bold text-gray-900 dark:text-gray-100">IBS Trading Strategy</h3><p class="text-sm text-gray-600 dark:text-gray-400">Профессиональный тестировщик стратегий</p></div></div>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Анализ и тестирование торговых стратегий на исторических данных. Специализация на стратегиях mean reversion и техническом анализе.</p>
          </div>
          <div class="space-y-2">
            <h4 class="text-sm font-semibold uppercase tracking-wider">Система</h4>
            <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Версия API:</span><span id="api-ver" class="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800">${esc(apiVer || 'dev')}</span></div>
            <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Статус:</span><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-200"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Online</span></div>
          </div>
        </div>
        <div class="border-t border-gray-200 dark:border-gray-800 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="text-sm text-gray-600 dark:text-gray-400">© ${year} IBS Trading Strategy. Все права защищены.</div>
          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span>Built with ❤️ for traders</span>
          </div>
        </div>
      </div>
    </footer>`;
  }
  function shellHTML() {
    const nav = TABS.map((t) => `<a href="${t.to}" data-nav class="px-3 py-1 rounded text-sm border ${state.page === t.to ? 'nav-active' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800'}">${t.label}</a>`).join('');
    const bottom = BOTTOM.map((t) => {
      const on = state.page === t.to;
      return `<a href="${t.to}" data-nav class="flex flex-col items-center justify-center gap-1 py-2 text-xs ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}" aria-label="${t.label}">
        <div class="bn-icon ${on ? 'active' : ''}">${icon(t.icon, 'w-6 h-6')}</div>
        <span class="font-medium">${t.label}</span>
      </a>`;
    }).join('');
    return `
      <a href="#main-content" class="sr-only">Перейти к основному содержимому</a>
      <div class="min-h-screen flex flex-col bg-gray-50 text-gray-800 dark:text-gray-100">
        <header class="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <a href="/data" data-nav class="flex min-w-0 items-center gap-3 hover:opacity-80">
              ${logo('sm')}
              <span class="hidden truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:inline">IBS Trading Strategy</span>
            </a>
            <div class="flex items-center gap-2">
              <button id="theme-btn" class="icon-btn icon-btn-lg icon-btn-glass" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${icon(themeIcon())}</button>
              <a href="/settings" data-nav id="settings-btn" title="Настройки" aria-label="Настройки" class="hidden md:inline-flex icon-btn icon-btn-lg icon-btn-glass ${state.page === '/settings' ? 'icon-btn-active' : ''}">${icon('settings')}</a>
              <button id="menu-btn" class="md:hidden icon-btn icon-btn-lg icon-btn-glass" title="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-label="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-expanded="${state.mobileOpen}">${icon(state.mobileOpen ? 'x' : 'menu')}</button>
              <button id="logout-btn" class="hidden md:inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800">Выйти</button>
            </div>
          </div>
          <div id="mobile-drawer" class="${state.mobileOpen ? '' : 'hidden'} md:hidden border-t border-gray-200 dark:border-gray-700 bg-white/95 backdrop-blur-sm dark:bg-slate-900/95"></div>
        </header>
        <main id="main-content" class="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-32 md:pb-24 safe-area-pb">
          <nav class="hidden md:flex gap-2 flex-wrap mb-4 desktop-nav">${nav}</nav>
          <div id="page-root"></div>
        </main>
        <nav class="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 grid grid-cols-5 items-center h-16" role="navigation" aria-label="Основная навигация">${bottom}</nav>
        ${footerHTML(state.apiBuildId)}
      </div>
      <div id="overlay-root">${overlay()}</div>`;
  }
  function mobileDrawerHTML() {
    return `<div class="px-3 py-3 space-y-0.5">${MOBILE_MENU.map((t) => {
      const on = state.page === t.to;
      return `<a href="${t.to}" data-nav class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${on ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200'}">${icon(t.icon, 'w-5 h-5 ' + (on ? 'text-white' : 'text-gray-400'))}<span>${t.label}</span></a>`;
    }).join('')}<div class="my-1.5 border-t border-gray-200 dark:border-gray-700"></div>
      <button id="logout-mobile" class="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200">${icon('logout', 'w-5 h-5 text-gray-400')}Выйти</button>
    </div>`;
  }

  function loginPage() {
    return `
      <div class="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100 flex flex-col">
        <header class="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">${logo('sm')}<span class="hidden truncate text-lg font-semibold sm:inline">IBS Trading Strategy</span></div>
            <button id="theme-btn" class="icon-btn icon-btn-lg icon-btn-glass" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${icon(themeIcon())}</button>
          </div>
        </header>
        <main class="flex-1 flex items-center justify-center px-4 pb-24">
          <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg border dark:bg-gray-900 dark:border-gray-800">
            <h2 class="text-lg font-semibold mb-3">Вход</h2>
            <div id="login-error" class="mb-2 text-sm text-red-600 hidden"></div>
            <form id="login-form" class="space-y-3">
              <div><label class="block text-sm mb-1" for="login-user">Эл. почта</label><input id="login-user" name="username" type="email" class="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="ivan@example.com" autofocus /></div>
              <div><label class="block text-sm mb-1" for="login-pass">Пароль</label><input id="login-pass" name="password" type="password" class="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="••••••••" /></div>
              <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="remember" /> Запомнить меня</label>
              <div class="flex justify-end"><button type="submit" class="btn-primary min-h-0 py-1.5">Войти</button></div>
            </form>
          </div>
        </main>
        ${footerHTML('dev')}
      </div>`;
  }

  function pageData() {
    const tags = new Set();
    state.datasets.forEach((d) => (d.tag || '').split(',').forEach((t) => { const x = t.trim(); if (x) tags.add(x); }));
    const filtered = state.dataTag === 'all' ? state.datasets : state.datasets.filter((d) => (d.tag || '').split(',').map((t) => t.trim()).includes(state.dataTag));
    const filters = [`<button data-tag="all" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === 'all' ? 'bg-blue-100 text-blue-800 border-2 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200' : 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200'}">Все (${state.datasets.length})</button>`]
      .concat([...tags].sort().map((t) => `<button data-tag="${esc(t)}" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === t ? 'bg-blue-100 text-blue-800 border-2 border-blue-200' : 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200'}">${esc(t)}</button>`)).join('');
    let cards = '';
    if (!state.datasets.length) {
      cards = `<div class="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
        ${icon('database', 'mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600')}
        <h3 class="mb-1 text-base font-semibold text-gray-700 dark:text-gray-300">Датасетов пока нет</h3>
        <p class="mb-4 text-sm text-gray-500">Загрузите данные по тикерам из API, чтобы начать бэктестинг</p>
        <a href="/enhance" data-nav class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">${icon('plus', 'h-4 w-4')} Загрузить тикеры</a>
      </div>`;
    } else if (state.dataView === 'compact') {
      cards = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">${filtered.map((d) => {
        const active = state.ticker === d.ticker;
        const tagsHtml = (d.tag || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).map((t) => `<span class="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded dark:bg-gray-800 dark:text-gray-400">${esc(t)}</span>`).join('');
        return `<div class="relative">
          <a href="/stocks?tickers=${encodeURIComponent(d.ticker)}" data-load="${esc(d.ticker)}" class="block relative w-full p-3 rounded-lg border text-left ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/30' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900'}">
            ${active ? '<div class="absolute top-1.5 left-1.5 w-2 h-2 bg-green-500 rounded-full"></div>' : ''}
            <div class="font-mono font-semibold text-sm pr-6">${esc(d.ticker)}</div>
            ${d.companyName ? `<div class="text-xs text-gray-500 truncate mt-0.5">${esc(d.companyName)}</div>` : ''}
            <div class="text-[10px] text-gray-400 mt-1">${d.dataPoints || 0} баров</div>
            ${tagsHtml ? `<div class="flex items-center gap-1 mt-1.5">${tagsHtml}</div>` : ''}
          </a>
          <button data-menu="${esc(d.ticker)}" class="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Открыть меню действий">${icon('more', 'w-4 h-4')}</button>
          ${state.menuTicker === d.ticker ? `<div class="absolute right-2 top-8 z-10 w-40 rounded-lg border bg-white shadow dark:bg-gray-800 dark:border-gray-700 text-sm">
            <button data-edit="${esc(d.ticker)}" class="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">Изменить</button>
            <button data-refresh="${esc(d.ticker)}" class="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">Обновить датасет</button>
            <button data-export="${esc(d.ticker)}" class="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">Экспорт JSON</button>
            <button data-del="${esc(d.ticker)}" class="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">Удалить</button>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
    } else {
      cards = filtered.map((d) => `<div class="flex items-center justify-between rounded-lg border p-3 bg-white dark:bg-gray-900 dark:border-gray-800">
        <div><div class="font-semibold font-mono">${esc(d.ticker)}</div><div class="text-xs text-gray-500">${d.dataPoints || 0} баров · ${esc(d.dateRange?.from || '')} — ${esc(d.dateRange?.to || '')}</div></div>
        <div class="flex gap-2">
          <a href="/stocks?tickers=${encodeURIComponent(d.ticker)}" data-load="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white">Открыть</a>
          <button data-del="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm border">Удалить</button>
        </div>
      </div>`).join('');
    }
    return `
      ${pageHeader('Данные', 'Управление загруженными датасетами')}
      <div class="bg-white rounded-lg border p-4 mb-6 dark:bg-gray-900 dark:border-gray-800">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-8 h-8 bg-blue-50 rounded-lg dark:bg-blue-950/20">${icon('database', 'w-4 h-4 text-blue-600')}</div>
          <div class="flex-1"><h3 class="font-semibold text-base">Библиотека датасетов</h3><p class="text-xs text-gray-500">${filtered.length}${state.dataTag !== 'all' ? ' из ' + state.datasets.length : ''} датасетов</p></div>
          ${state.datasets.length ? `<a href="/enhance" data-nav title="Загрузить новые данные из API" class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800">${icon('plus', 'w-4 h-4')}</a>` : ''}
        </div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5"><div class="w-2 h-2 bg-green-500 rounded-full"></div><span class="text-xs text-green-600 font-medium">Online</span></div>
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button id="view-list" class="p-1.5 rounded ${state.dataView === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Список" aria-label="Переключить на режим списка">${icon('list', 'w-4 h-4')}</button>
            <button id="view-grid" class="p-1.5 rounded ${state.dataView === 'compact' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Компактный вид" aria-label="Переключить на компактный вид">${icon('grid', 'w-4 h-4')}</button>
          </div>
        </div>
        <div class="mb-3"><div class="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Фильтр</div><div class="flex flex-wrap gap-2">${filters}</div></div>
        ${cards}
      </div>`;
  }

  function pageEnhance() {
    const prov = providerId();
    const all = state.tickerCatalog.length ? state.tickerCatalog : POPULAR;
    const { list, cards } = enhanceCatalogCards();
    const catLabel = (ENHANCE_CATS.find((c) => c.id === state.enhanceCat) || ENHANCE_CATS[1]).label;
    const chips = ENHANCE_CATS.map((c) => {
      const n = c.id === 'all' ? all.length : all.filter((t) => (t.categories || []).includes(c.id)).length;
      const on = state.enhanceCat === c.id;
      return `<button type="button" data-ecat="${c.id}" class="${on ? 'cat-chip' : 'cat-chip-off'}">${c.icon} ${esc(c.label)} <span class="text-xs ${on ? 'text-blue-500' : 'text-gray-400'}">(${n})</span></button>`;
    }).join('');
    return `
      ${pageHeader('Новые данные', 'Загрузка исторических данных из API', `<div class="rounded-lg border px-3 py-2 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"><div class="text-gray-500">Провайдер данных</div><div class="font-semibold">${esc(providerLabel(prov))}</div></div>`)}
      <div class="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
        <div class="enhance-toolbar">
          <div class="enhance-toolbar-main">
            <label for="enhance-q" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Тикер</label>
            <form id="enhance-form" class="enhance-form">
              <input type="hidden" name="provider" value="${esc(prov)}" />
              <div class="enhance-search">
                ${icon('search', 'search-glyph')}
                <input name="symbol" id="enhance-q" value="${esc(state.enhanceQuery)}" class="enhance-input" placeholder="AAPL" autocomplete="off" />
              </div>
              <div class="enhance-actions">
                <button type="submit" class="enhance-load" ${state.enhanceQuery.trim() ? '' : 'disabled'} title="Загрузить данные">${icon('download', 'w-4 h-4')}<span class="enhance-load-label">Загрузить</span></button>
              </div>
            </form>
          </div>
        </div>
        <div id="enhance-out" class="mt-3 text-sm text-gray-600 dark:text-gray-400"></div>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 mt-4">${chips}</div>
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-gray-100">${esc(state.enhanceQuery ? 'Результаты поиска' : catLabel)}</h3>
          <span class="text-sm text-gray-500">${list.length} тикеров</span>
        </div>
        <div class="ticker-card-grid">${cards}</div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">Источник данных: ${esc(providerLabel(prov))} через локальный сервер</p>`;
  }

  function isSingle() { return parseTickers(state.tickerInput).length === 1; }
  function visibleStockTabs() {
    const single = isSingle();
    const cfg = new Map((state.analysisTabsConfig || []).map((t) => [t.id, t]));
    const tabs = STOCK_TABS.filter((t) => {
      if (t.id === 'summary') return true;
      if (!state.result) return false;
      if (SINGLE_ONLY.has(t.id) && !single) return false;
      if (MULTI_ONLY.has(t.id) && single) return false;
      const c = cfg.get(t.id);
      if (c && c.visible === false) return false;
      return true;
    });
    return tabs;
  }

  function pageStocks() {
    const tickers = parseTickers(state.tickerInput);
    const tabs = visibleStockTabs();
    const r = state.result;
    const defaults = defaultTickers();
    const isDefault = defaults.length === tickers.length && defaults.every((t, i) => t === tickers[i]);
    const err = state.error ? `<div class="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-950/30">${esc(state.error)}</div>` : '';
    let body = `<div class="hero-grid">
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 min-h-[375px] flex items-center justify-center text-sm text-gray-500">Запустите бэктест, чтобы увидеть график</div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            ${stocksParams(tickers, isDefault, defaults)}
          </aside>
        </div>`;
    if (r) {
      if (state.stockTab === 'summary') {
        body = `<div class="hero-grid">
          <div class="min-h-[375px]">
            ${heroPanelHTML({ showQuote: true, proLabel: 'Профи', proTitle: 'Открыть профессиональный график', chartId: 'chart-hero' })}
          </div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            ${stocksParams(tickers, isDefault, defaults)}
            ${asideExtrasHTML(r)}
          </aside>
        </div>`;
      } else if (state.stockTab === 'price') body = `<div id="chart-price" class="chart-box-lg rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'tickerCharts') body = `<div id="ticker-charts" class="grid md:grid-cols-2 gap-3"></div>`;
      else if (state.stockTab === 'equity') body = `<div id="chart-eq" class="chart-box mt-4 rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'exposure') body = `<div id="chart-exp" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'drawdown') body = `<div id="chart-dd" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'openDayDrawdown') body = `<div id="odd-out"></div>`;
      else if (state.stockTab === 'trades') body = tradesTable(r.trades);
      else if (state.stockTab === 'profit') body = profitBody(r);
      else if (state.stockTab === 'duration') body = durationBody(r);
      else if (state.stockTab === 'monthlyContribution') body = `<form id="mc-form" class="flex flex-wrap items-end gap-2 mb-3"><label class="text-xs">Сумма<input name="amount" type="number" value="500" class="field mt-1 w-28" /></label><label class="text-xs">День<input name="day" type="number" value="1" class="field mt-1 w-20" /></label><button class="btn-primary">Посчитать</button></form><div id="mc-out"></div>`;
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm"></div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">
        <form id="bh-lev-form" class="flex flex-wrap items-end gap-3 mb-3">
          <label class="text-xs">Маржинальность, %<input name="pct" type="number" min="1" step="1" value="100" class="field mt-1 w-40" /></label>
          <button class="btn-primary">Посчитать</button>
          <span id="bh-lev-now" class="text-xs text-gray-500 pb-2">Текущее плечо: ×1.00</span>
        </form>
        <div id="chart-bh" class="chart-box-lg rounded border dark:border-gray-800"></div>
      </div>`;
      else if (state.stockTab === 'buyAtClose') body = `<div id="bac-out">Buy at close…</div>`;
      else if (state.stockTab === 'buyAtClose4') body = `<div id="bac4-out">Buy at close 4…</div>`;
      else if (state.stockTab === 'noStopLoss') body = `<div id="nsl-out">Без стоп-лосса…</div>`;
      else if (state.stockTab === 'options') body = `<div id="opt-out">Опционы…</div>`;
    }
    const params = (r && state.stockTab !== 'summary') ? `<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3 max-w-xl">${stocksParams(tickers, isDefault, defaults)}</div>` : '';
    return `
      ${pageHeader('Акции', 'Бэктест стратегии на нескольких активах')}
      ${err}
      ${r && state.stockTab === 'summary' ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      ${params}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        ${analysisTabs(tabs, state.stockTab, 'data-stab')}
        <div id="stock-body" class="p-4 min-h-[420px]">${body}</div>
      </div>`;
  }
  function stocksParams(tickers, isDefault, defaults) {
    return `
      <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" for="ticker-input">Тикеры</label>
        ${tickerInput('ticker-input', state.tickerInput)}
        ${isDefault ? '' : `<button type="button" id="reset-tickers" class="mt-1.5 w-full rounded-lg border border-dashed border-gray-300 px-2 py-1 text-left text-[11px] text-gray-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-600">↩ ${esc(defaults.join(', '))}</button>`}
      </div>
      <div><label class="mb-1 block text-xs font-medium" for="leverage-sel">Маржинальность</label>
        <select id="leverage-sel" class="${inputCls()}">${levOptions(state.leverage)}</select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium" for="take-profit-percent-input">Тейк-профит</label>
        <input id="take-profit-percent-input" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(state.takeProfit)}" placeholder="Например, 2.5" class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800" />
        <p class="mt-1 text-[11px] text-gray-500">Досрочный выход, если максимум дня достиг процента прибыли от цены входа. Пусто или 0 выключает условие.</p>
      </div>
      <button id="run-bt" class="btn-primary w-full" ${state.running ? 'disabled' : ''}>${state.running ? 'Считаем…' : 'Запустить бэктест'}</button>`;
  }

  function emaFormHTML() {
    const f = state.emaForm;
    const tickers = parseTickers(state.emaTickers);
    const presets = (state.emaPresets || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `
      <form id="ema-form" class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium">Пресеты</label>
          <div class="flex gap-2"><select id="ema-preset" class="${inputCls()}"><option value="">— Выбрать пресет —</option>${presets}</select>
          <button type="button" id="ema-preset-del" class="icon-btn icon-btn-md icon-btn-glass" title="Удалить пресет" aria-label="Удалить пресет">${icon('trash', 'w-3.5 h-3.5')}</button></div>
          <div class="mt-2 flex gap-2"><input id="ema-preset-name" class="${inputCls()}" placeholder="Название пресета" /><button type="button" id="ema-preset-save" class="btn-secondary min-h-0 py-2">Сохранить</button></div>
        </div>
        <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>${tickerInput('ema-tickers', state.emaTickers)}</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="mb-1 block text-xs font-medium">EMA</label>
            <select name="period" class="${inputCls()}"><option value="20" ${f.period === 20 ? 'selected' : ''}>EMA 20</option><option value="200" ${f.period !== 20 ? 'selected' : ''}>EMA 200</option></select>
          </div>
          <div><label class="mb-1 block text-xs font-medium">Маржинальность</label>
            <select name="leverage" class="${inputCls()}">${levOptions(f.leverage)}</select>
          </div>
        </div>
        <div><label class="mb-1 block text-xs font-medium">Сигнал входа/выхода</label>
          <select name="signal" class="${inputCls()}"><option value="close" ${f.signal === 'close' ? 'selected' : ''}>По закрытию свечи</option><option value="intraday" ${f.signal === 'intraday' ? 'selected' : ''}>Касание внутри дня (вход по закрытию)</option></select>
        </div>
        <div><label class="mb-1 block text-xs font-medium">Старт EMA</label>
          <select name="start" class="${inputCls()}"><option value="full_history" ${f.start !== 'from_start' ? 'selected' : ''}>После полной истории (${f.period || 200} дней)</option><option value="from_start" ${f.start === 'from_start' ? 'selected' : ''}>С самого начала графика</option></select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium" for="ema-take-profit">Тейк-профит</label>
          <input id="ema-take-profit" name="takeProfit" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(f.takeProfit)}" placeholder="Пусто выключает" class="${inputCls()}" />
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="noSellAtLoss" class="h-4 w-4" ${f.noSellAtLoss ? 'checked' : ''} /> Не продавать в минус</label>
        ${zoneEditorHTML('Зоны покупки, % от EMA', f.buyZones, 'buy')}
        ${zoneEditorHTML('Зоны продажи, % от EMA', f.sellZones, 'sell')}
        <button class="btn-primary w-full">Запустить EMA-бэктест</button>
      </form>`;
  }
  function pageEMA() {
    const r = resultOf(state.emaResult);
    const tabs = r ? EMA_TABS : [{ id: 'summary', label: 'Сводка' }];
    const tab = r && EMA_TABS.some((t) => t.id === state.emaTab) ? state.emaTab : 'summary';
    let main = '';
    if (tab === 'summary') {
      main = `<div class="p-4 hero-grid">
        <div id="ema-out" class="min-h-[420px] ${r ? '' : 'flex items-center justify-center text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}">${r ? heroPanelHTML({ showQuote: false, chartId: 'chart-hero' }) : 'Запустите расчет EMA-стратегии'}</div>
        <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">${emaFormHTML()}</aside>
      </div>`;
    } else {
      const bodies = {
        price: '<div id="chart-ema-price" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        emaDeviation: '<div id="chart-ema-dev" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        equity: '<div id="chart-ema-eq" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        exposure: '<div id="chart-ema-exp" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        drawdown: '<div id="chart-ema-dd" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        trades: tradesTable(r.trades),
        profit: profitBody(r),
        duration: durationBody(r),
        spreads: spreadsTable((state.emaForm.buyZones || []).filter((z) => z.enabled).map((z) => z.levelPct), (state.emaForm.sellZones || []).filter((z) => z.enabled).map((z) => z.levelPct)),
      };
      main = `<div class="p-4">${bodies[tab] || ''}</div>`;
    }
    return `
      ${pageHeader('EMA', 'Симулятор торговли по отклонению цены от EMA')}
      ${r && tab === 'summary' ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs(tabs, tab, 'data-etab')}
        ${main}
      </div>`;
  }

  function optFormHTML() {
    const f = state.optForm;
    const tickers = parseTickers(state.optTickers);
    const sel = (opts, cur, fmt) => opts.map((v) => `<option value="${v}" ${Number(cur) === v ? 'selected' : ''}>${fmt(v)}</option>`).join('');
    return `
      <div class="text-sm font-semibold">Параметры</div>
      <form id="opt-form" class="space-y-3">
        <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>${tickerInput('opt-tickers', state.optTickers)}</div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="mb-1 block text-xs font-medium">Страйк (+%)</label><select name="strike" class="${inputCls()}">${sel([5, 10, 15, 20], f.strike, (v) => '+' + v + '%')}</select></div>
          <div><label class="mb-1 block text-xs font-medium">Корр. IV (+%)</label><select name="vol" class="${inputCls()}">${sel([0, 5, 10, 15, 20, 25, 30, 40, 50], f.vol, (v) => '+' + v + '%')}</select></div>
          <div><label class="mb-1 block text-xs font-medium">Капитал на сделку</label><select name="cap" class="${inputCls()}">${sel([5, 10, 15, 20, 25, 30, 50], f.cap, (v) => v + '%')}</select></div>
          <div><label class="mb-1 block text-xs font-medium">Экспирация</label>
            <select name="expiration" class="${inputCls()}">
              <option value="1" ${f.expiration === 1 ? 'selected' : ''}>1 неделя</option>
              <option value="2" ${f.expiration === 2 ? 'selected' : ''}>2 недели</option>
              <option value="4" ${f.expiration === 4 ? 'selected' : ''}>1 месяц</option>
              <option value="8" ${f.expiration === 8 ? 'selected' : ''}>2 месяца</option>
              <option value="12" ${f.expiration === 12 ? 'selected' : ''}>3 месяца</option>
              <option value="24" ${f.expiration === 24 ? 'selected' : ''}>6 месяцев</option>
            </select>
          </div>
          <div class="col-span-2"><label class="mb-1 block text-xs font-medium">Макс. удержание (дней)</label>
            <input name="maxHold" type="number" min="1" max="365" value="${esc(f.maxHold)}" class="${inputCls()}" />
          </div>
          <div class="col-span-2"><label class="mb-1 block text-xs font-medium">Маржинальность</label>
            <select name="leverage" class="${inputCls()}">${levOptions(f.leverage)}</select>
          </div>
        </div>
        <button id="opt-run" class="btn-primary w-full">Запустить бэктест</button>
      </form>`;
  }
  function pageOptions() {
    const r = resultOf(state.optResult);
    const single = parseTickers(state.optTickers).length === 1;
    const tabs = r ? OPTIONS_TABS.filter((t) => !(MULTI_ONLY.has(t.id) && single)) : [{ id: 'summary', label: 'Сводка' }];
    const tab = r && tabs.some((t) => t.id === state.optTab) ? state.optTab : 'summary';
    let main = '';
    if (tab === 'summary') {
      main = `<div class="p-4 hero-grid">
        <div id="optm-out" class="min-h-[420px] ${r ? '' : 'flex items-center justify-center text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}">${r ? heroPanelHTML({ showQuote: true, proLabel: 'Баланс', proTitle: 'Открыть баланс', chartId: 'chart-hero' }) : 'Запустите бэктест, чтобы увидеть результат'}</div>
        <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">${optFormHTML()}${asideExtrasHTML(r)}</aside>
      </div>`;
    } else {
      const bodies = {
        equity: '<div id="chart-opt-eq" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        price: '<div id="chart-opt-price" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        tickerCharts: '<div id="opt-ticker-charts" class="grid md:grid-cols-2 gap-3"></div>',
        drawdown: '<div id="chart-opt-dd" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        trades: tradesTable(r.trades),
        profit: profitBody(r),
        duration: durationBody(r),
        splits: '<div id="opt-splits-box" class="text-sm"></div>',
      };
      main = `<div class="p-4">${bodies[tab] || ''}</div>`;
    }
    return `
      ${pageHeader('Опционы', 'Бэктест опционных стратегий на нескольких активах')}
      ${r && tab === 'summary' ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs(tabs, tab, 'data-otab')}
        ${main}
      </div>`;
  }

  function pageCalendar() {
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const y = state.cal.year, m = state.cal.month;
    const first = new Date(Date.UTC(y, m, 1));
    const startDow = (first.getUTCDay() + 6) % 7;
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const holidays = state.cal.data?.holidays?.[String(y)] || {};
    const shorts = state.cal.data?.shortDays?.[String(y)] || {};
    const hours = state.cal.data?.tradingHours?.normal || { start: '09:30', end: '16:00' };
    const today = nyseParts();
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<div></div>';
    for (let d = 1; d <= daysIn; d++) {
      const mmdd = String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const hol = holidays[mmdd];
      const sh = shorts[mmdd];
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const isToday = today.y === y && today.m === m && today.d === d;
      const cls = isToday ? 'bg-indigo-600 text-white' : hol ? 'bg-red-100 dark:bg-red-950/40' : sh ? 'bg-amber-100 dark:bg-amber-950/40' : weekend ? 'cal-weekend' : 'hover:bg-gray-50 dark:hover:bg-gray-800';
      cells += `<button data-cday="${mmdd}" class="rounded p-2 text-sm text-center ${cls}">${d}</button>`;
    }
    return `
      ${pageHeader('Календарь торгов', 'NYSE · Американский рынок акций', `<button id="cal-webull" class="btn-secondary min-h-0 py-2 px-4">Импорт из Webull</button>`)}
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>Торговый · ${esc(hours.start)}–${esc(hours.end)}</span>
        <span class="flex items-center gap-1.5">${icon('calendar', 'w-3.5 h-3.5')} Выходной (Сб, Вс)</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Раннее закрытие · до 13:00</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Праздник · биржа закрыта</span>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 p-3">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <button id="cal-prev" class="icon-btn icon-btn-md icon-btn-glass" title="Предыдущий месяц" aria-label="Предыдущий месяц">‹</button>
            <div class="font-semibold">${months[m]} ${y}</div>
            <button id="cal-next" class="icon-btn icon-btn-md icon-btn-glass" title="Следующий месяц" aria-label="Следующий месяц">›</button>
            <select id="cal-year" class="field">${[y - 1, y, y + 1].map((yy) => `<option ${yy === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
            <select id="cal-month" class="field">${months.map((name, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${name}</option>`).join('')}</select>
            <button id="cal-today" class="text-sm text-indigo-600">Сегодня</button>
          </div>
          <div class="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-1">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((x) => `<div class="text-center">${x}</div>`).join('')}</div>
          <div class="grid grid-cols-7 gap-1">${cells}</div>
        </div>
        <div class="space-y-3">
          <div class="rounded-lg border border-red-100 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-3">
            <div class="flex justify-between font-medium text-red-800 dark:text-red-200 mb-2"><span>Праздники ${y}</span><span>${Object.keys(holidays).length}</span></div>
            ${Object.keys(holidays).length ? Object.entries(holidays).sort().map(([k, v]) => `<div class="flex justify-between text-sm py-1"><span>${esc(typeof v === 'string' ? v : (v && v.name) || 'Праздник')}</span><span class="text-red-600">${esc(mmddLabel(k))}</span></div>`).join('') : '<p class="text-sm text-gray-500">Нет данных</p>'}
          </div>
          <div class="rounded-lg border border-amber-100 bg-amber-50 dark:bg-amber-950/20 p-3">
            <div class="flex justify-between font-medium text-amber-800 mb-2"><span>Раннее закрытие ${y}</span><span>${Object.keys(shorts).length}</span></div>
            ${Object.keys(shorts).length ? Object.entries(shorts).sort().map(([k, v]) => `<div class="flex justify-between text-sm py-1"><span>${esc(typeof v === 'string' ? v : (v && v.name) || 'Раннее закрытие')}</span><span>${esc(mmddLabel(k))}</span></div>`).join('') : '<p class="text-sm text-gray-500">Нет</p>'}
          </div>
        </div>
      </div>
      <form id="cal-edit" class="mt-4 flex flex-wrap gap-2 items-end bg-white dark:bg-gray-800 border rounded-lg p-3 dark:border-gray-700">
        <input name="mmdd" placeholder="MM-DD" class="field w-28" />
        <select name="type" class="field w-36"><option value="normal">обычный</option><option value="holiday">выходной</option><option value="short">короткий</option></select>
        <input name="name" placeholder="Название" class="field w-40" />
        <button class="btn-primary min-h-0 py-2">Сохранить день</button>
      </form>`;
  }

  function pageSplits() {
    const map = state.splitsMap || {};
    let body = '';
    if (state.splitsTab === 'list') {
      const rows = Object.entries(map).flatMap(([ticker, evs]) => (evs || []).map((e) => `<tr><td class="font-mono">${esc(ticker)}</td><td>${esc(e.date)} × ${esc(e.factor)}</td><td class="text-right"><button data-ds="${esc(ticker)}" data-dd="${esc(e.date)}" class="text-red-600">Удалить</button></td></tr>`)).join('');
      if (!rows) {
        body = `<div id="spl-list">
          <div class="splits-table overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>События</th><th class="text-right">Действия</th></tr></thead><tbody><tr><td colspan="3" class="text-center text-gray-500">Нет данных</td></tr></tbody></table></div>
          <div class="splits-empty-mobile">Нет данных</div>
        </div>`;
      } else {
        body = `<div id="spl-list" class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>События</th><th class="text-right">Действия</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    } else if (state.splitsTab === 'create') {
      body = `<div>
        <h3 class="text-lg font-medium mb-1">Добавить новый тикер</h3>
        <p class="text-sm text-gray-500 mb-3">Создайте новый тикер с первым событием сплита</p>
        <form id="split-form" class="flex flex-wrap gap-3 items-end p-4 bg-white border rounded-xl dark:bg-gray-900 dark:border-gray-700">
          <label class="text-xs">Тикер<input name="ticker" placeholder="AAPL" class="field mt-1 w-28" /></label>
          <label class="text-xs">Дата сплита<input name="date" placeholder="YYYY-MM-DD" class="field mt-1 w-40" /></label>
          <label class="text-xs">Коэффициент<input name="factor" type="number" step="0.01" value="2" class="field mt-1 w-24" /></label>
          <button class="btn-primary min-h-0 py-2">Создать тикер</button>
        </form>
        <p class="text-xs text-gray-500 mt-2">Коэффициент: 2 = сплит 2:1, 0.5 = обратный сплит 1:2</p>
      </div>`;
    } else if (state.splitsTab === 'import') {
      body = `<div>
        <h3 class="text-lg font-medium mb-1">Импорт сплитов</h3>
        <p class="text-sm text-gray-500 mb-3">Загрузите JSON файл или вставьте данные</p>
        <label class="btn-secondary min-h-0 py-2 inline-flex mb-3">Выбрать JSON файл<input id="split-file" type="file" accept="application/json" class="hidden" /></label>
        <textarea id="split-import" class="field h-40 font-mono text-xs" placeholder='[{"date":"2020-08-31","factor":4}]'></textarea>
        <div class="flex gap-2 mt-2"><input id="split-import-ticker" placeholder="AAPL" class="field w-24" /><button id="split-import-btn" class="btn-primary min-h-0 py-2">Применить JSON</button></div>
      </div>`;
    } else if (state.splitsTab === 'export') {
      body = `<div><h3 class="text-lg font-medium mb-2">Экспорт всех сплитов</h3>
        <button id="split-download" class="btn-primary min-h-0 py-2 mb-3">Скачать JSON</button>
        <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto">${esc(JSON.stringify(map, null, 2))}</pre></div>`;
    } else {
      body = `<div>
        <h3 class="text-lg font-medium mb-1">Сырые данные Webull</h3>
        <p class="text-sm text-gray-500 mb-4">Запрос corp-action (события по акциям) из Webull API — для анализа</p>
        <form id="split-webull-form" class="flex flex-wrap gap-3 items-end p-4 bg-white border rounded-xl dark:bg-gray-900 dark:border-gray-700">
          <label class="text-xs">Тикер<input name="symbol" value="AAPL" class="field mt-1 w-28 uppercase" /></label>
          <label class="text-xs">С даты<input name="start" type="text" inputmode="numeric" placeholder="YYYY-MM-DD" value="2000-01-01" class="field mt-1 w-40" /></label>
          <label class="text-xs">По дату<input name="end" type="text" inputmode="numeric" placeholder="YYYY-MM-DD" value="${esc(nyseParts().iso)}" class="field mt-1 w-40" /></label>
          <button class="btn-primary min-h-0 py-2">Запросить</button>
        </form>
        <pre id="split-webull-out" class="mt-3 text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-[400px]"></pre>
      </div>`;
    }
    return `
      ${pageHeader('Сплиты', 'Управление дроблениями акций', `<button id="splits-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список сплитов" aria-label="Обновить список сплитов">${icon('refresh', 'w-4 h-4')}</button>`)}
      ${analysisTabs(SPLITS_TABS, state.splitsTab, 'data-sptab')}
      <div class="mt-6">${body}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 border-t pt-4 mt-6">Изменения сохраняются в базе данных</div>`;
  }

  function pageWatches() {
    const stats = monitorStats(state.monitorTrades);
    const rows = (state.watches || []).map((w) => `<tr>
      <td class="font-mono"><a href="/stocks?tickers=${encodeURIComponent(w.symbol)}" data-nav class="text-blue-600">${esc(w.symbol)}</a></td>
      <td>≤ ${(w.lowIBS ?? 0.1).toFixed(2)}</td>
      <td>≥ ${Number(w.highIBS ?? 0.75).toFixed(2)}</td>
      <td>${w.entryPrice != null ? '$' + Number(w.entryPrice).toFixed(2) : '—'}</td>
      <td>${w.isOpenPosition ? 'Открыта' : 'Нет'}</td>
      <td><button data-dw="${esc(w.symbol)}" class="text-sm text-red-600">Удалить</button></td>
    </tr>`).join('');
    const alerts = (state.emaAlerts || []).map((a) => `<tr>
      <td class="font-mono">${esc(a.symbol)}</td><td>EMA ${esc(a.emaPeriod || 200)}</td>
      <td>${esc(a.buyLevelPct)} / ${esc(a.sellLevelPct)}</td>
      <td>${esc(a.nextAction || 'buy')}</td>
      <td><button data-dea="${esc(a.id)}" class="text-red-600 text-sm">Удалить</button></td>
    </tr>`).join('');
    const thr = state.settings.watchThresholdPct ?? 0.3;
    const metrics = stats.closed.length ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-lg border p-3 text-center"><div class="text-2xl font-bold text-green-600">${fmtUsd(stats.bal)}</div><div class="text-xs text-gray-500">Итоговый капитал</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-2xl font-bold">${fmtPct(stats.ret)}</div><div class="text-xs text-gray-500">Общая доходность</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-red-600">${stats.dd.toFixed(2)}%</div><div class="text-xs text-gray-500">Макс. просадка</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-blue-600">${(stats.closed.length ? 100 * stats.wins / stats.closed.length : 0).toFixed(1)}%</div><div class="text-xs text-gray-500">Доля прибыльных</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-indigo-600">${stats.closed.length}</div><div class="text-xs text-gray-500">Закрытых сделок</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmtPct(stats.avg)}</div><div class="text-xs text-gray-500">Средняя сделка</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-violet-600">${fmt(stats.closed.length ? stats.hold / stats.closed.length : 0, 1)} дн.</div><div class="text-xs text-gray-500">Средняя длительность</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmtUsd(stats.net)}</div><div class="text-xs text-gray-500">Чистая прибыль</div></div>
      </div>` : `<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50">Пока нет закрытых сделок. Метрики появятся после первого завершенного трейда.</div>`;
    return `
      ${pageHeader('Мониторинг', 'Отслеживание позиций и уведомления в Telegram', `<button id="watch-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список" aria-label="Обновить список">${icon('refresh', 'w-4 h-4')}</button>`)}
      <p class="text-sm text-gray-600 dark:text-gray-300">Глобальный порог уведомлений: ${esc(thr)}% <span class="ml-2 text-xs text-gray-500">(применяется ко всем отслеживаемым акциям)</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">До следующего подсчёта сигналов: ${formatDuration(secondsToNextSignal())}</p>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">Согласованность monitor / broker</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">Статус синхронизации виртуальной monitor-позиции и реального брокерского журнала.</p>
          </div>
          <span class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">OK</span>
        </div>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">Monitor и broker журналы сейчас согласованы.</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700 mb-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="text-lg font-semibold">Результат по совершенным сделкам</h3>
          <span class="text-xs text-gray-500">База расчета: $10,000.00</span>
        </div>
        ${metrics}
      </div>
      ${analysisTabs(WATCH_TABS, state.watchTab, 'data-wtab')}
      <div class="mt-4">
        ${state.watchTab === 'summary' ? `<div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700"><h3 class="text-lg font-semibold mb-2">Капитал мониторинга (старт $10,000.00)</h3>${stats.equity.length ? '<div id="watch-eq" class="chart-box"></div>' : '<p class="text-sm text-gray-500">Нет закрытых сделок для построения кривой капитала.</p>'}</div>` : ''}
        ${state.watchTab === 'watches' ? `<form id="watch-form" class="flex gap-2 mb-4"><input name="symbol" placeholder="AAPL" class="field" /><button class="btn-primary min-h-0 py-2">Добавить</button>
          <button type="button" id="watch-t11" class="btn-secondary min-h-0 py-2">Тест T-11</button>
          <button type="button" id="watch-t2" class="btn-secondary min-h-0 py-2">Тест T-2</button>
          <button type="button" id="watch-prices" class="btn-secondary min-h-0 py-2">Обновить цены и позиции</button></form>
          <div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>IBS вход</th><th>IBS выход</th><th>Цена входа</th><th>Позиция</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-gray-500">Нет активных наблюдений. Добавьте тикер в форму выше.</td></tr>'}</tbody></table></div>` : ''}
        ${state.watchTab === 'trades' ? `<div class="rounded-lg border p-4 mb-3 bg-white dark:bg-gray-800"><h3 class="font-semibold mb-1">Ручная корректировка monitor-сделки</h3>
          <p class="text-sm text-gray-600 mb-3">Если сайт пропустил вход, можно добавить сделку вручную.</p>
          <form id="watch-manual" class="flex flex-wrap gap-2"><input name="symbol" placeholder="AAPL" class="field w-24" /><input name="entryDate" placeholder="YYYY-MM-DD" class="field w-36" /><input name="entryPrice" type="number" step="0.01" placeholder="цена" class="field w-24" /><button class="btn-primary min-h-0 py-2">Добавить ручную сделку</button></form></div>
          <div id="watch-trades">${tradesTable(state.monitorTrades)}</div>` : ''}
        ${state.watchTab === 'ema' ? `<form id="ema-alert-form" class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
            <label class="text-xs">Тикер<input name="symbol" value="TQQQ" class="field mt-1" /></label>
            <label class="text-xs">EMA<select name="emaPeriod" class="field mt-1"><option value="20">EMA 20</option><option value="200" selected>EMA 200</option></select></label>
            <label class="text-xs">Покупка ≤ %<input name="buyLevelPct" type="number" value="15" class="field mt-1" /></label>
            <label class="text-xs">Продажа ≥ %<input name="sellLevelPct" type="number" value="40" class="field mt-1" /></label>
            <label class="text-xs">Сейчас ждём<select name="nextAction" class="field mt-1"><option value="buy">Покупка</option><option value="sell">Продажа</option></select></label>
            <button class="btn-primary min-h-0 py-2 self-end">Добавить</button>
          </form>
          <table class="trades"><thead><tr><th>Тикер</th><th>EMA</th><th>Диапазон</th><th>Ждём</th><th>Действия</th></tr></thead><tbody>${alerts || '<tr><td colspan="5" class="text-center text-gray-500">EMA-оповещений пока нет</td></tr>'}</tbody></table>` : ''}
      </div>`;
  }

  function emptyBrokerTable(cols, empty) {
    return `<div class="overflow-auto"><table class="trades"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${cols.length}" class="text-center text-gray-500">${empty}</td></tr></tbody></table></div>`;
  }
  function pageBroker() {
    const list = (state.broker || []).map((t) => `<div class="flex justify-between border rounded-lg p-3 mb-1 text-sm dark:border-gray-800 bg-white dark:bg-gray-900"><span class="font-mono">${esc(t.symbol)} ${esc(t.entryDate || '')} @ ${esc(t.entryPrice ?? '—')}</span><button data-bd="${esc(t.id)}" class="text-red-600">Удалить</button></div>`).join('') || '<p class="text-sm text-gray-500">Сделок нет</p>';
    const live = state.settings?.autoTrading?.enabled || state.autoConfig?.enabled;
    const tab = state.brokerTab || 'overview';
    let body = '';
    if (tab === 'journal') {
      body = `<form id="broker-form" class="flex flex-wrap gap-2 mb-4">
        <input name="symbol" placeholder="AAPL" class="field w-24" />
        <input name="entryDate" placeholder="YYYY-MM-DD" class="field w-36" />
        <input name="entryPrice" type="number" step="0.01" placeholder="цена" class="field w-24" />
        <button class="btn-primary min-h-0 py-2">Добавить</button>
      </form>
      <div id="broker-list">${list}</div>`;
    } else if (tab === 'overview') {
      body = `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        ${[['Всего активов', '—'], ['Свободные деньги', '—'], ['Покупательная способность', '—'], ['Нереализованный PnL', '—']].map(([t, v]) => `<div class="rounded-lg border p-4"><div class="text-xs text-gray-500">${t}</div><div class="text-xl font-semibold mt-1">${v}</div></div>`).join('')}
      </div>`;
    } else if (tab === 'positions') {
      body = `${emptyBrokerTable(['Тикер', 'Тип', 'Валюта', 'Кол-во', 'Средняя', 'Рыночная цена', 'Нереализ. PnL'], 'Открытых позиций нет')}`;
    } else if (tab === 'orders') {
      body = `${emptyBrokerTable(['Тикер', 'Сторона', 'Тип', 'Кол-во', 'Цена', 'Статус'], 'Активных ордеров нет')}`;
    } else if (tab === 'fills') {
      body = `${emptyBrokerTable(['Тикер', 'Сторона', 'Кол-во', 'Цена', 'Время'], 'История ордеров пока не пришла')}`;
    } else if (tab === 'autotrade') {
      body = `<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 class="text-lg font-semibold mb-3">Состояние автоторговли</h2>
        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
            <div class="text-xs uppercase tracking-wide text-gray-500">Подключение</div>
            <div class="mt-1 text-sm">${live ? 'Webull подключен' : 'Webull не настроен'}</div>
          </div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
            <div class="text-xs uppercase tracking-wide text-gray-500">Статус</div>
            <div class="mt-1 text-sm">${live ? 'включена' : 'выключена'}</div>
          </div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
            <div class="text-xs uppercase tracking-wide text-gray-500">Последний запуск</div>
            <div class="mt-1 text-sm">—</div>
          </div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
            <div class="text-xs uppercase tracking-wide text-gray-500">Entries/Exits</div>
            <div class="mt-1 text-sm">—</div>
          </div>
        </div>
      </div>`;
    } else if (tab === 'monitor') {
      body = `${emptyBrokerTable(['Тикер', 'IBS', 'Цена', 'Позиция'], 'Нет отслеживаемых акций')}`;
    } else {
      body = `<div class="space-y-3">
        <div><h2 class="text-sm font-semibold mb-1">Логи мониторинга</h2><pre class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-40">Логи мониторинга пока пусты</pre></div>
        <div><h2 class="text-sm font-semibold mb-1">Webull / autotrade логи</h2><pre id="broker-logs" class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-40">Логи автоторговли пока пусты</pre></div>
      </div>`;
    }
    return `
      ${pageHeader('Кабинет Webull', 'Баланс счёта, позиции, ордера, история и логи исполнения по Webull', `<div class="flex items-center gap-2"><span class="rounded-full px-3 py-1 text-xs font-semibold ${live ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}">${live ? '[LIVE]' : '[OFF]'}</span><button id="broker-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить" aria-label="Обновить">${icon('refresh', 'w-4 h-4')}</button></div>`)}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs(BROKER_TABS, tab, 'data-btab')}
        <div class="p-4">${body}<div id="broker-token" class="text-sm text-gray-500 mt-3">${state.token && state.token.present ? 'Токен Webull задан' : ''}</div></div>
      </div>`;
  }

  function provSelect(name, cur, extra) {
    const opts = ['finnhub', 'alpha_vantage', 'twelve_data', 'polygon'].concat(extra || []);
    return `<select name="${name}" class="field mt-1">${opts.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(providerLabel(v))}</option>`).join('')}</select>`;
  }
  function pageSettings() {
    const st = state.settings || {};
    const tab = state.settingsTab;
    let body = '';
    if (tab === 'general') {
      body = `<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-1">Уведомления</div>
          <label class="block text-sm">Порог близости к IBS, %<input name="watchThresholdPct" type="number" step="0.1" min="0" max="20" class="field mt-1" value="${esc(st.watchThresholdPct ?? 0.3)}" /></label>
          <p class="text-xs text-gray-500 mt-1">Диапазон 0–20%. По умолчанию 0.3%.</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-1">График</div>
          <label class="block text-sm">Высота панели индикаторов (IBS/Объём), %<input name="indicatorPanePercent" type="number" min="0" max="40" class="field mt-1" value="${esc(st.indicatorPanePercent ?? 7)}" /></label>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-1">Страница «Акции»</div>
          <label class="block text-sm">Тикеры по умолчанию<input name="defaultMultiTickerSymbols" class="field mt-1" value="${esc(st.defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS')}" /></label>
          <p class="text-xs text-gray-500 mt-1">Пример: AAPL, MSFT, AMZN, MAGS</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-2">Комиссии торговли</div>
          <label class="inline-flex items-center gap-2 text-sm mr-3"><input type="radio" name="commissionType" value="fixed" ${st.commissionType === 'fixed' ? 'checked' : ''} /> Фиксированная</label>
          <label class="inline-flex items-center gap-2 text-sm mr-3"><input type="radio" name="commissionType" value="percentage" ${(st.commissionType || 'percentage') === 'percentage' ? 'checked' : ''} /> Процентная</label>
          <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="commissionType" value="combined" ${st.commissionType === 'combined' ? 'checked' : ''} /> Комбинированная</label>
          <div class="grid grid-cols-2 gap-3 mt-3">
            <label class="text-sm">Фиксированная, $<input name="commissionFixed" type="number" step="0.01" class="field mt-1" value="${esc(st.commissionFixed ?? 1)}" /></label>
            <label class="text-sm">Процентная, %<input name="commissionPercentage" type="number" step="0.01" class="field mt-1" value="${esc(st.commissionPercentage ?? 0.1)}" /></label>
          </div>
        </div>
        <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enablePostClosePriceActualization" ${st.enablePostClosePriceActualization ? 'checked' : ''} /> Автоактуализация цен после закрытия рынка</label>`;
    } else if (tab === 'api') {
      body = `<div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Тестирование API</div>
          <p class="text-xs text-gray-500 mb-3">Проверьте подключение к API провайдерам (используется тестовый символ AAPL)</p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${['alpha_vantage', 'finnhub', 'twelve_data', 'polygon'].map((p) => `<button type="button" data-testprov="${p}" class="btn-primary min-h-0 py-2 text-sm">Тест ${esc(providerLabel(p))}</button>`).join('')}</div>
          <div id="api-test-out" class="text-sm mt-2"></div>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Провайдеры данных</div>
          <label class="block text-sm mb-3">Котировки — страница «Акции»${provSelect('resultsQuoteProvider', st.resultsQuoteProvider, ['webull'])}</label>
          <label class="block text-sm mb-3">Обновление датасета${provSelect('resultsRefreshProvider', st.resultsRefreshProvider || st.enhancerProvider)}</label>
          <label class="block text-sm">Новые данные — загрузка полной истории${provSelect('enhancerProvider', st.enhancerProvider)}</label>
        </div>`;
    } else if (tab === 'telegram') {
      body = `<div class="rounded-xl border border-purple-200 bg-purple-50 p-4 mb-3 dark:bg-purple-900/20">
          <div class="font-medium mb-1">Telegram настройки</div>
          <p class="text-sm text-gray-600 dark:text-gray-300">Telegram Bot Token и Chat ID настраиваются в файле <code>.env</code> на сервере.</p>
        </div>
        <div class="rounded-xl border p-4">
          <div class="font-medium mb-2">Тестовое сообщение в Telegram</div>
          <div class="flex gap-2"><input id="tg-test-msg" class="field flex-1" value="Тестовое сообщение" /><button type="button" id="tg-test-send" class="btn-primary min-h-0 py-2">Отправить тест</button></div>
          <div id="tg-test-out" class="text-sm mt-2"></div>
        </div>`;
    } else if (tab === 'interface') {
      const chips = (state.analysisTabsConfig || []).map((t) => `<button type="button" data-vis="${esc(t.id)}" class="px-3 py-2 text-sm border-b-2 ${t.visible ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 line-through'}">${esc(t.label)}</button>`).join('');
      body = `<p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Тема переключается иконкой в шапке: Авто → Тёмная → Светлая.</p>
        <div class="rounded-xl border overflow-hidden">
          <div class="px-4 pt-4 pb-2"><div class="text-sm font-semibold">Вкладки страницы «Акции»</div>
          <div class="text-xs text-gray-500">Нажмите, чтобы скрыть или показать</div></div>
          <div class="flex overflow-x-auto border-t">${chips}</div>
        </div>`;
    } else {
      const ac = state.autoConfig || {};
      body = `<div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Статус автоторговли</div>
          <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="autoEnabled" ${ac.enabled ? 'checked' : ''} /> Включена</label>
          <p class="text-xs text-gray-500 mt-1">Включает автоматическое исполнение ордеров через Webull по сигналам T-1 мониторинга.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Провайдер котировок для автоторговли</div>
          <label class="inline-flex items-center gap-2 text-sm mr-4"><input type="radio" name="autoQuote" value="finnhub" ${(ac.quoteProvider || 'finnhub') === 'finnhub' ? 'checked' : ''} /> Finnhub</label>
          <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="autoQuote" value="webull" ${ac.quoteProvider === 'webull' ? 'checked' : ''} /> Webull</label>
        </div>
        <p class="text-sm text-gray-600">На странице /broker → Автоторговля видно, какой профиль реально активен.</p>`;
    }
    return `
      ${pageHeader('Настройки', 'Конфигурация приложения и параметры стратегии', `<button form="set-form" class="btn-secondary min-h-0 py-2 px-4">Сохранить</button>`)}
      ${analysisTabs(SETTINGS_TABS, tab, 'data-setab')}
      <form id="set-form" class="mt-4 space-y-3 max-w-3xl">
        ${body}
        <div id="set-msg" class="text-sm"></div>
      </form>`;
  }

  function pageHTML() {
    const p = state.page;
    if (p === '/enhance') return pageEnhance();
    if (p === '/stocks') return pageStocks();
    if (p === '/ema') return pageEMA();
    if (p === '/multi-ticker-options') return pageOptions();
    if (p === '/calendar') return pageCalendar();
    if (p === '/split') return pageSplits();
    if (p === '/watches') return pageWatches();
    if (p === '/broker') return pageBroker();
    if (p === '/settings') return pageSettings();
    return pageData();
  }

  let shellBound = false;
  function bindShellOnce() {
    if (shellBound) return;
    shellBound = true;
    const app = document.getElementById('app');
    app.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        e.preventDefault();
        if (nav.dataset.settingsTab) state.settingsTab = nav.dataset.settingsTab;
        navigate(nav.getAttribute('href'));
        return;
      }
      if (e.target.closest('#theme-btn')) {
        e.preventDefault();
        state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
        applyTheme();
        if (!state.user || state.page === '/login') {
          document.getElementById('app').innerHTML = loginPage();
          bindLogin();
          return;
        }
        updateChrome();
        Charts.destroy();
        afterRender();
        return;
      }
      if (e.target.closest('#menu-btn')) {
        state.mobileOpen = !state.mobileOpen;
        updateChrome();
        return;
      }
      if (e.target.closest('#logout-btn') || e.target.closest('#logout-mobile')) {
        logout();
        return;
      }
      if (!e.target.closest('#hero-settings-wrap')) {
        state.heroSettingsOpen = false;
        document.getElementById('hero-settings-pop')?.classList.add('hidden');
      }
      if (!e.target.closest('#quote-pop-wrap')) {
        state.quoteOpen = false;
        document.getElementById('quote-pop')?.classList.add('hidden');
      }
      if (state.menuTicker && !e.target.closest('[data-menu]') && !e.target.closest('[data-edit]') && !e.target.closest('[data-refresh]') && !e.target.closest('[data-export]') && !e.target.closest('[data-del]')) {
        state.menuTicker = null;
        renderPage();
        return;
      }
      if (state.mobileOpen && !e.target.closest('#menu-btn') && !e.target.closest('#mobile-drawer')) {
        state.mobileOpen = false;
        updateChrome();
      }
      if (e.target.closest('#confirm-no')) { state.confirm = null; document.getElementById('overlay-root').innerHTML = overlay(); return; }
      if (e.target.closest('#confirm-yes')) {
        const fn = state.confirm && state.confirm.onYes;
        state.confirm = null;
        document.getElementById('overlay-root').innerHTML = overlay();
        if (fn) fn();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const closeMenu = !!state.menuTicker;
      if (state.mobileOpen) state.mobileOpen = false;
      if (state.menuTicker) state.menuTicker = null;
      state.heroSettingsOpen = false;
      state.quoteOpen = false;
      document.getElementById('hero-settings-pop')?.classList.add('hidden');
      document.getElementById('quote-pop')?.classList.add('hidden');
      if (closeMenu) renderPage();
      else updateChrome();
    });
  }

  async function logout() {
    try { await API.logout(); } catch (_) {}
    state.user = false;
    document.getElementById('app').innerHTML = loginPage();
    bindLogin();
  }

  function updateChrome() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.innerHTML = icon(themeIcon());
      themeBtn.setAttribute('aria-label', 'Тема: ' + themeLabel());
      themeBtn.title = 'Тема: ' + themeLabel();
    }
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
      menuBtn.innerHTML = icon(state.mobileOpen ? 'x' : 'menu');
      const lab = state.mobileOpen ? 'Закрыть меню' : 'Открыть меню';
      menuBtn.setAttribute('aria-label', lab);
      menuBtn.setAttribute('title', lab);
      menuBtn.setAttribute('aria-expanded', state.mobileOpen ? 'true' : 'false');
    }
    const drawer = document.getElementById('mobile-drawer');
    if (drawer) {
      drawer.classList.toggle('hidden', !state.mobileOpen);
      if (state.mobileOpen) drawer.innerHTML = mobileDrawerHTML();
    }
    document.querySelectorAll('nav.desktop-nav [data-nav], .bottom-nav [data-nav]').forEach((a) => {
      const on = a.getAttribute('href') === state.page;
      if (a.closest('.bottom-nav')) {
        a.className = `flex flex-col items-center justify-center gap-1 py-2 text-xs ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`;
        const well = a.querySelector('.bn-icon');
        if (well) well.classList.toggle('active', on);
      } else {
        a.className = `px-3 py-1 rounded text-sm border ${on ? 'nav-active' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800'}`;
      }
    });
    const gear = document.getElementById('settings-btn');
    if (gear) gear.className = `hidden md:inline-flex icon-btn icon-btn-lg icon-btn-glass ${state.page === '/settings' ? 'icon-btn-active' : ''}`;
  }

  async function renderPage() {
    applyTheme();
    const app = document.getElementById('app');
    if (state.page === '/login' || !state.user) {
      app.innerHTML = loginPage();
      bindLogin();
      return;
    }
    if (!document.getElementById('page-root')) {
      app.innerHTML = shellHTML();
      bindShellOnce();
    }
    Charts.destroy();
    updateChrome();
    document.getElementById('page-root').innerHTML = pageHTML();
    const ov = document.getElementById('overlay-root');
    if (ov) ov.innerHTML = overlay();
    await afterRender();
  }

  function bindLogin() {
    document.getElementById('theme-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
      applyTheme();
      document.getElementById('app').innerHTML = loginPage();
      bindLogin();
    });
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await API.login(fd.get('username'), fd.get('password'), !!fd.get('remember'));
        state.user = true;
        await bootAuthed();
        navigate('/data', true);
      } catch (err) {
        const el = document.getElementById('login-error');
        el.textContent = err.message;
        el.classList.remove('hidden');
      }
    });
  }

  function askDelete(message, onYes) {
    state.confirm = { title: 'Удалить?', message, onYes };
    const ov = document.getElementById('overlay-root');
    if (ov) ov.innerHTML = overlay();
  }

  function syncTickerField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.value;
      if (id === 'ema-tickers') {
        state.emaTickers = v;
        try { localStorage.setItem('ema.tickers', v); } catch (_) {}
      } else if (id === 'opt-tickers') {
        state.optTickers = v;
        try { localStorage.setItem('options.tickers', v); } catch (_) {}
      } else {
        state.tickerInput = v;
        try { localStorage.setItem('tickersInput', v); } catch (_) {}
      }
    });
  }

  async function afterRender() {
    const p = state.page;
    const root = document.getElementById('page-root');
    if (!root) return;

    if (p === '/data' || p === '/') {
      document.getElementById('view-list')?.addEventListener('click', () => { state.dataView = 'list'; localStorage.setItem('dataView', 'list'); renderPage(); });
      document.getElementById('view-grid')?.addEventListener('click', () => { state.dataView = 'compact'; localStorage.setItem('dataView', 'compact'); renderPage(); });
      root.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => { state.dataTag = b.dataset.tag; renderPage(); }));
      root.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        state.ticker = b.dataset.load;
        state.tickerInput = b.dataset.load;
        navigate('/stocks?tickers=' + encodeURIComponent(b.dataset.load));
      }));
      root.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        state.menuTicker = state.menuTicker === b.dataset.menu ? null : b.dataset.menu;
        renderPage();
      }));
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        askDelete('Удалить датасет ' + b.dataset.del + '?', async () => {
          await API.deleteDataset(b.dataset.del);
          state.datasets = await API.datasets();
          renderPage();
        });
      }));
      root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', async (e) => {
        e.preventDefault();
        const ds = await API.dataset(b.dataset.export);
        const blob = new Blob([JSON.stringify(ds, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = b.dataset.export + '.json';
        a.click();
      }));
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        const ds = state.datasets.find((d) => d.ticker === b.dataset.edit);
        state.modal = `<div class="modal-backdrop" id="edit-modal"><div class="modal-card">
          <h3 class="text-lg font-semibold mb-3">Метаданные ${esc(b.dataset.edit)}</h3>
          <label class="block text-sm mb-2">Компания<input id="edit-company" class="field mt-1" value="${esc(ds?.companyName || '')}" /></label>
          <label class="block text-sm mb-3">Теги<input id="edit-tag" class="field mt-1" value="${esc(ds?.tag || '')}" /></label>
          <div class="flex justify-end gap-2"><button id="edit-cancel" class="btn-secondary">Отмена</button><button id="edit-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
        </div></div>`;
        document.getElementById('overlay-root').innerHTML = overlay();
        document.getElementById('edit-cancel')?.addEventListener('click', () => { state.modal = null; document.getElementById('overlay-root').innerHTML = overlay(); });
        document.getElementById('edit-save')?.addEventListener('click', async () => {
          await API.patchDatasetMeta(b.dataset.edit, { companyName: document.getElementById('edit-company').value, tag: document.getElementById('edit-tag').value });
          state.modal = null;
          state.datasets = await API.datasets();
          renderPage();
        });
      }));
      root.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          await API.refreshDataset(b.dataset.refresh);
          state.datasets = await API.datasets();
          toast('Датасет обновлён');
          renderPage();
        } catch (err) { toast(err.message); }
      }));
    }

    if (p === '/enhance') {
      const had = state.tickerCatalog.length;
      await loadCatalog();
      if (!had && state.tickerCatalog.length) { renderPage(); return; }
      const form = document.getElementById('enhance-form');
      const btn = form?.querySelector('.enhance-load');
      const syncLoad = () => { if (btn && form) btn.disabled = !String(form.symbol.value || '').trim(); };
      function paintEnhanceGrid() {
        const { list, cards } = enhanceCatalogCards();
        const grid = root.querySelector('.ticker-card-grid');
        if (grid) grid.innerHTML = cards;
        const count = root.querySelector('.ticker-card-grid')?.parentElement?.querySelector('.text-sm.text-gray-500');
        if (count) count.textContent = list.length + ' тикеров';
        const heading = root.querySelector('.ticker-card-grid')?.parentElement?.querySelector('h3');
        const catLabel = (ENHANCE_CATS.find((c) => c.id === state.enhanceCat) || ENHANCE_CATS[1]).label;
        if (heading) heading.textContent = state.enhanceQuery ? 'Результаты поиска' : catLabel;
        root.querySelectorAll('[data-esym]').forEach((b) => b.addEventListener('click', () => enhanceFetch(b.dataset.esym)));
      }
      form?.symbol.addEventListener('input', () => { state.enhanceQuery = form.symbol.value; syncLoad(); paintEnhanceGrid(); });
      syncLoad();
      root.querySelectorAll('[data-ecat]').forEach((b) => b.addEventListener('click', () => {
        state.enhanceCat = b.dataset.ecat;
        state.enhanceQuery = form?.symbol?.value || '';
        renderPage();
      }));
      async function enhanceFetch(symbol) {
        const out = document.getElementById('enhance-out');
        const provider = providerId();
        const ticker = String(symbol || '').trim().toUpperCase().split(',')[0].trim();
        if (!ticker) { if (out) out.textContent = 'Укажите тикер'; return; }
        if (out) out.textContent = 'Загрузка…';
        try {
          const r = await API.get(`/api/fetch/${provider}/${encodeURIComponent(ticker)}`);
          const bars = r.data || r.bars || [];
          if (!bars.length) { if (out) out.textContent = 'Нет данных'; return; }
          await API.saveDataset({ ticker, name: ticker, data: bars });
          state.datasets = await API.datasets();
          if (out) out.innerHTML = `Сохранено <b>${esc(ticker)}</b>: ${bars.length} баров. <a href="/stocks?tickers=${encodeURIComponent(ticker)}" data-nav class="text-indigo-600">Открыть в Акциях</a>`;
          toast('Датасет сохранён');
          renderPage();
        } catch (err) {
          if (out) out.textContent = err.message;
        }
      }
      root.querySelectorAll('[data-esym]').forEach((b) => b.addEventListener('click', () => enhanceFetch(b.dataset.esym)));
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await enhanceFetch(new FormData(e.target).get('symbol'));
      });
    }

    if (p === '/stocks') {
      syncTickerField('ticker-input');
      document.getElementById('leverage-sel')?.addEventListener('change', (e) => { state.leverage = Number(e.target.value); });
      document.getElementById('take-profit-percent-input')?.addEventListener('input', (e) => { state.takeProfit = e.target.value; try { localStorage.setItem('stocksTakeProfit', state.takeProfit); } catch (_) {} });
      document.getElementById('reset-tickers')?.addEventListener('click', () => {
        const d = defaultTickers();
        state.tickerInput = d.join(', ');
        renderPage();
      });
      document.getElementById('run-bt')?.addEventListener('click', runStocks);
      root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => { state.stockTab = b.dataset.stab; renderPage(); }));
      paintStockCharts();
      if (state.result && state.stockTab === 'summary') bindHero(root, { quote: true, pro: 'price' });
      runNested();
    }

    if (p === '/ema') {
      syncTickerField('ema-tickers');
      root.querySelectorAll('[data-etab]').forEach((b) => b.addEventListener('click', () => { state.emaTab = b.dataset.etab; renderPage(); }));
      document.getElementById('ema-preset-save')?.addEventListener('click', () => {
        const name = document.getElementById('ema-preset-name')?.value.trim();
        if (!name) return;
        syncEmaFormFromDom();
        state.emaPresets.push({ id: String(Date.now()), name, form: { ...state.emaForm, buyZones: state.emaForm.buyZones.map((z) => ({ ...z })), sellZones: state.emaForm.sellZones.map((z) => ({ ...z })) }, tickers: state.emaTickers });
        try { localStorage.setItem('emaPresets', JSON.stringify(state.emaPresets)); } catch (_) {}
        toast('Пресет сохранён');
        renderPage();
      });
      document.getElementById('ema-preset-del')?.addEventListener('click', () => {
        const id = document.getElementById('ema-preset')?.value;
        if (!id) return;
        state.emaPresets = state.emaPresets.filter((p) => p.id !== id);
        try { localStorage.setItem('emaPresets', JSON.stringify(state.emaPresets)); } catch (_) {}
        renderPage();
      });
      document.getElementById('ema-preset')?.addEventListener('change', (e) => {
        const pset = state.emaPresets.find((x) => x.id === e.target.value);
        if (!pset) return;
        state.emaForm = normalizeEmaForm(pset.form);
        persistEmaForm();
        if (pset.tickers) { state.emaTickers = pset.tickers; try { localStorage.setItem('ema.tickers', state.emaTickers); } catch (_) {} }
        renderPage();
      });
      bindEmaZones(root);
      document.getElementById('ema-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        syncEmaFormFromDom();
        persistEmaForm();
        const f = state.emaForm;
        try {
          const loaded = await loadSelected();
          const tp = Number(String(f.takeProfit || '').replace(',', '.'));
          const ema = {
            initialCapital: 10000,
            leverage: Number(f.leverage || 200) / 100,
            emaPeriod: Number(f.period || 200),
            buyZones: (f.buyZones || []).map((z) => ({ id: z.id, levelPct: Number(z.levelPct), enabled: !!z.enabled })),
            sellZones: (f.sellZones || []).map((z) => ({ id: z.id, levelPct: Number(z.levelPct), enabled: !!z.enabled })),
            signalSource: f.signal || 'close',
            emaStartMode: f.start || 'full_history',
            noSellAtLoss: !!f.noSellAtLoss,
          };
          if (Number.isFinite(tp) && tp > 0) ema.takeProfitPercent = tp;
          state.emaResult = resultOf(await API.calc('ema-zone', { tickers: loaded, ema }));
          state.emaTab = 'summary';
          renderPage();
        } catch (err) { toast(err.message); }
      });
      paintEmaCharts();
      if (state.emaResult && state.emaTab === 'summary') bindHero(root, { quote: false });
    }

    if (p === '/multi-ticker-options') {
      syncTickerField('opt-tickers');
      root.querySelectorAll('[data-otab]').forEach((b) => b.addEventListener('click', () => { state.optTab = b.dataset.otab; renderPage(); }));
      document.getElementById('opt-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await runOptionsMulti(new FormData(e.target));
      });
      paintOptCharts();
      if (state.optResult && state.optTab === 'summary') bindHero(root, { quote: true, pro: 'equity' });
    }

    if (p === '/calendar') {
      if (!state.loaded.cal) {
        try { state.cal.data = await API.calendar(); } catch (_) { state.cal.data = {}; }
        state.loaded.cal = true;
        renderPage();
        return;
      }
      document.getElementById('cal-prev')?.addEventListener('click', () => {
        if (state.cal.month === 0) { state.cal.month = 11; state.cal.year--; } else state.cal.month--;
        renderPage();
      });
      document.getElementById('cal-next')?.addEventListener('click', () => {
        if (state.cal.month === 11) { state.cal.month = 0; state.cal.year++; } else state.cal.month++;
        renderPage();
      });
      document.getElementById('cal-today')?.addEventListener('click', () => {
        const n = nyseParts();
        state.cal.year = n.y; state.cal.month = n.m;
        renderPage();
      });
      document.getElementById('cal-year')?.addEventListener('change', (e) => {
        state.cal.year = Number(e.target.value);
        renderPage();
      });
      document.getElementById('cal-month')?.addEventListener('change', (e) => {
        state.cal.month = Number(e.target.value);
        renderPage();
      });
      root.querySelectorAll('[data-cday]').forEach((b) => b.addEventListener('click', () => {
        const form = document.getElementById('cal-edit');
        if (form) form.mmdd.value = b.dataset.cday;
      }));
      document.getElementById('cal-edit')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.patchCalendarDay({ year: String(state.cal.year), mmdd: fd.get('mmdd'), type: fd.get('type'), name: fd.get('name') });
        state.cal.data = await API.calendar();
        renderPage();
      });
      document.getElementById('cal-webull')?.addEventListener('click', async () => {
        try {
          await API.syncCalendar();
          state.cal.data = await API.calendar();
          toast('Календарь обновлён');
          renderPage();
        } catch (err) { toast(err.message); }
      });
    }

    if (p === '/split') {
      if (!state.loaded.splits) {
        try { state.splitsMap = await API.splits(); } catch (_) { state.splitsMap = {}; }
        state.loaded.splits = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-sptab]').forEach((b) => b.addEventListener('click', () => { state.splitsTab = b.dataset.sptab; renderPage(); }));
      document.getElementById('splits-refresh')?.addEventListener('click', async () => { state.splitsMap = await API.splits(); renderPage(); });
      root.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить сплит ' + b.dataset.ds + ' ' + b.dataset.dd + '?', async () => {
          await API.deleteSplit(b.dataset.ds, b.dataset.dd);
          state.splitsMap = await API.splits();
          renderPage();
        });
      }));
      document.getElementById('split-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const ticker = String(fd.get('ticker') || '').toUpperCase();
        if (!ticker) return;
        const existing = (state.splitsMap && state.splitsMap[ticker]) || [];
        existing.push({ date: fd.get('date'), factor: Number(fd.get('factor')) });
        await API.putSplits(ticker, existing);
        state.splitsMap = await API.splits();
        state.splitsTab = 'list';
        renderPage();
      });
      document.getElementById('split-import-btn')?.addEventListener('click', async () => {
        const ticker = document.getElementById('split-import-ticker').value.toUpperCase();
        const evs = JSON.parse(document.getElementById('split-import').value);
        await API.putSplits(ticker, evs);
        state.splitsMap = await API.splits();
        state.splitsTab = 'list';
        renderPage();
      });
      document.getElementById('split-file')?.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        document.getElementById('split-import').value = await f.text();
      });
      document.getElementById('split-download')?.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state.splitsMap || {}, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'splits.json';
        a.click();
      });
      document.getElementById('split-webull-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const q = new URLSearchParams({ symbol: fd.get('symbol'), start: fd.get('start'), end: fd.get('end') });
        try {
          const r = await API.webullSplits(q.toString());
          document.getElementById('split-webull-out').textContent = JSON.stringify(r, null, 2);
        } catch (err) { document.getElementById('split-webull-out').textContent = err.message; }
      });
    }

    if (p === '/watches') {
      if (!state.loaded.watches) {
        const [w, t, a] = await Promise.all([
          API.watches().catch(() => []),
          API.trades().catch(() => API.monitorTrades().catch(() => [])),
          API.emaAlerts().catch(() => []),
        ]);
        state.watches = w || [];
        state.monitorTrades = Array.isArray(t) ? t : (t.trades || []);
        state.emaAlerts = Array.isArray(a) ? a : (a.alerts || []);
        state.loaded.watches = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-wtab]').forEach((b) => b.addEventListener('click', () => { state.watchTab = b.dataset.wtab; renderPage(); }));
      document.getElementById('watch-refresh')?.addEventListener('click', async () => { state.loaded.watches = false; renderPage(); });
      root.querySelectorAll('[data-dw]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить ' + b.dataset.dw + ' из мониторинга?', async () => {
          await API.deleteWatch(b.dataset.dw);
          state.watches = await API.watches();
          renderPage();
        });
      }));
      document.getElementById('watch-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await API.addWatch({ symbol: e.target.symbol.value, lowIBS: 0.1, highIBS: 0.75 });
        state.watches = await API.watches();
        renderPage();
      });
      document.getElementById('watch-t11')?.addEventListener('click', async () => { try { await API.post('/api/telegram/simulate', { stage: 'overview' }); toast('Симуляция T-11'); } catch (err) { toast(err.message); } });
      document.getElementById('watch-t2')?.addEventListener('click', async () => { try { await API.post('/api/telegram/simulate', { stage: 'confirmations' }); toast('Симуляция T-2'); } catch (err) { toast(err.message); } });
      document.getElementById('watch-prices')?.addEventListener('click', async () => { try { await API.post('/api/telegram/update-all', {}); toast('Цены и позиции обновлены'); } catch (err) { toast(err.message); } });
      document.getElementById('watch-manual')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.post('/api/trades', { symbol: fd.get('symbol'), entryDate: fd.get('entryDate'), entryPrice: Number(fd.get('entryPrice')), status: 'open', source: 'manual' });
        state.loaded.watches = false;
        renderPage();
      });
      document.getElementById('ema-alert-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.addEmaAlert({ symbol: fd.get('symbol'), emaPeriod: Number(fd.get('emaPeriod')), buyLevelPct: Number(fd.get('buyLevelPct')), sellLevelPct: Number(fd.get('sellLevelPct')), nextAction: fd.get('nextAction') });
        state.emaAlerts = await API.emaAlerts().catch(() => []);
        renderPage();
      });
      root.querySelectorAll('[data-dea]').forEach((b) => b.addEventListener('click', async () => {
        await API.deleteEmaAlert(b.dataset.dea);
        state.emaAlerts = await API.emaAlerts().catch(() => []);
        renderPage();
      }));
      const eq = document.getElementById('watch-eq');
      if (eq) Charts.line(eq, monitorStats(state.monitorTrades).equity, isDark());
    }

    if (p === '/broker') {
      if (!state.loaded.broker) {
        const [bt, tok] = await Promise.all([API.brokerTrades().catch(() => []), API.tokenStatus().catch((e) => e.data || { present: false })]);
        state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
        state.token = tok;
        state.loaded.broker = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-btab]').forEach((b) => b.addEventListener('click', () => { state.brokerTab = b.dataset.btab; renderPage(); }));
      document.getElementById('broker-refresh')?.addEventListener('click', async () => {
        state.loaded.broker = false;
        renderPage();
      });
      root.querySelectorAll('[data-bd]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить брокерскую сделку?', async () => {
          await API.del('/api/broker-trades/' + b.dataset.bd);
          const bt = await API.brokerTrades().catch(() => []);
          state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
          renderPage();
        });
      }));
      document.getElementById('broker-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.post('/api/broker-trades', { symbol: fd.get('symbol'), entryDate: fd.get('entryDate'), entryPrice: Number(fd.get('entryPrice')), status: 'open', source: 'manual' });
        const bt = await API.brokerTrades().catch(() => []);
        state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
        renderPage();
      });
    }

    if (p === '/settings') {
      if (!state.loaded.settings) {
        try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
        try { state.autoConfig = await API.autoConfig() || {}; } catch (_) { state.autoConfig = {}; }
        state.loaded.settings = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-setab]').forEach((b) => b.addEventListener('click', () => { state.settingsTab = b.dataset.setab; renderPage(); }));
      root.querySelectorAll('[data-testprov]').forEach((b) => b.addEventListener('click', async () => {
        const out = document.getElementById('api-test-out');
        if (out) out.textContent = 'Тест ' + b.dataset.testprov + '…';
        try {
          const r = await API.testProvider(b.dataset.testprov);
          if (out) out.textContent = r.success || r.price ? `✅ ${r.symbol || 'AAPL'}: $${r.price || ''}` : `❌ ${r.error || JSON.stringify(r)}`;
        } catch (err) { if (out) out.textContent = err.message; }
      }));
      document.getElementById('tg-test-send')?.addEventListener('click', async () => {
        const out = document.getElementById('tg-test-out');
        try {
          await API.telegramTest(document.getElementById('tg-test-msg')?.value || 'Тестовое сообщение');
          if (out) out.textContent = 'Отправлено';
        } catch (err) { if (out) out.textContent = err.message; }
      });
      root.querySelectorAll('[data-vis]').forEach((b) => b.addEventListener('click', () => {
        state.analysisTabsConfig = (state.analysisTabsConfig || []).map((t) => t.id === b.dataset.vis ? { ...t, visible: !t.visible } : t);
        try { localStorage.setItem('analysisTabsConfig', JSON.stringify(state.analysisTabsConfig)); } catch (_) {}
        renderPage();
      }));
      document.getElementById('set-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const body = {};
        for (const [k, v] of fd.entries()) body[k] = v;
        if (form.enablePostClosePriceActualization) body.enablePostClosePriceActualization = form.enablePostClosePriceActualization.checked;
        if (body.watchThresholdPct != null) body.watchThresholdPct = Number(body.watchThresholdPct);
        if (body.indicatorPanePercent != null) body.indicatorPanePercent = Number(body.indicatorPanePercent);
        if (body.commissionFixed != null) body.commissionFixed = Number(body.commissionFixed);
        if (body.commissionPercentage != null) body.commissionPercentage = Number(body.commissionPercentage);
        if (form.autoEnabled) {
          state.autoConfig = { ...state.autoConfig, enabled: form.autoEnabled.checked, quoteProvider: fd.get('autoQuote') || 'finnhub' };
          try { await API.saveAutoConfig(state.autoConfig); } catch (_) {}
        }
        delete body.autoEnabled;
        delete body.autoQuote;
        await API.saveSettings(body);
        state.settings = { ...state.settings, ...body };
        const msg = document.getElementById('set-msg');
        if (msg) msg.textContent = 'Сохранено';
        toast('Сохранено');
      });
    }
  }

  function defaultStrategy() {
    return {
      id: 'ibs-mean-reversion', type: 'ibs-mean-reversion', name: 'IBS',
      parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 },
      riskManagement: {
        initialCapital: 10000, capitalUsage: 100, slippage: 0, maxHoldDays: 30,
        commission: { type: 'percentage', percentage: 0, fixed: 0 },
      },
    };
  }

  async function loadSelected() {
    const sel = parseTickers(pageTickerText());
    if (!sel.length) throw new Error('Укажите тикеры');
    const loaded = [];
    const missing = [];
    for (const t of sel) {
      try {
        const ds = await API.dataset(t);
        loaded.push({ ticker: t, data: ds.data || [] });
      } catch (_) { missing.push(t); }
    }
    if (!loaded.length) throw new Error('Нет датасетов: ' + (missing.join(', ') || sel.join(', ')));
    if (missing.length) state.error = 'Нет данных: ' + missing.join(', ');
    else state.error = null;
    state.tickersData = loaded;
    state.ticker = loaded[0].ticker;
    state.bars = loaded[0].data || [];
    return loaded;
  }

  async function runStocks() {
    state.running = true;
    renderPage();
    try {
      const loaded = await loadSelected();
      const tp = Number(String(state.takeProfit).replace(',', '.'));
      const single = { allowSameDayReentry: true };
      if (Number.isFinite(tp) && tp > 0) single.takeProfitPercent = tp;
      state.result = await API.calc('single-position', {
        tickers: loaded,
        strategy: defaultStrategy(),
        leverage: (state.leverage || 200) / 100,
        single,
      });
      state.stockTab = 'summary';
    } catch (e) {
      state.error = e.message;
    } finally {
      state.running = false;
      renderPage();
    }
  }

  async function runOptionsMulti(fd) {
    try {
      state.optForm = {
        strike: Number(fd.get('strike') || 10), vol: Number(fd.get('vol') || 20), cap: Number(fd.get('cap') || 10),
        expiration: Number(fd.get('expiration') || 4), maxHold: Number(fd.get('maxHold') || 30), leverage: Number(fd.get('leverage') || 200),
      };
      const loaded = await loadSelected();
      const stock = await API.calc('single-position', { tickers: loaded, strategy: defaultStrategy(), leverage: Number(fd.get('leverage') || 200) / 100, single: { allowSameDayReentry: true } });
      const r = await API.calc('options-multi', {
        tickers: loaded, trades: stock.trades,
        config: {
          strikePct: Number(fd.get('strike') || 10),
          volAdjPct: Number(fd.get('vol') || 20),
          capitalPct: Number(fd.get('cap') || 10),
          expirationWeeks: Number(fd.get('expiration') || 4),
          maxHoldingDays: Number(fd.get('maxHold') || 30),
        },
      });
      state.optResult = resultOf(r);
      if (!state.optResult.metrics || !Object.keys(state.optResult.metrics).length) {
        try {
          const m = await API.calc('metrics', { trades: state.optResult.trades, equity: state.optResult.equity, initialCapital: 10000 });
          state.optResult.metrics = m;
          state.optResult.maxDrawdown = m.maxDrawdown ?? state.optResult.maxDrawdown;
        } catch (_) {}
      }
      state.optTab = 'summary';
      renderPage();
    } catch (e) { toast(e.message); }
  }

  function syncEmaFormFromDom() {
    const form = document.getElementById('ema-form');
    if (!form) return;
    const fd = new FormData(form);
    state.emaForm = {
      ...state.emaForm,
      period: Number(fd.get('period') || 200),
      leverage: Number(fd.get('leverage') || 200),
      signal: fd.get('signal') || 'close',
      start: fd.get('start') || 'full_history',
      takeProfit: fd.get('takeProfit') || '',
      noSellAtLoss: !!form.noSellAtLoss?.checked,
    };
  }
  function bindEmaZones(root) {
    root.querySelectorAll('[data-zone-pct]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const id = inp.dataset.zonePct;
        const parsed = Number(inp.value);
        if (inp.value.trim() === '' || !Number.isFinite(parsed)) return;
        ['buyZones', 'sellZones'].forEach((k) => {
          state.emaForm[k] = (state.emaForm[k] || []).map((z) => (z.id === id ? { ...z, levelPct: parsed } : z));
        });
        persistEmaForm();
      });
    });
    root.querySelectorAll('[data-zone-on]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.zoneOn;
        ['buyZones', 'sellZones'].forEach((k) => {
          state.emaForm[k] = (state.emaForm[k] || []).map((z) => (z.id === id ? { ...z, enabled: inp.checked } : z));
        });
        persistEmaForm();
      });
    });
    root.querySelectorAll('[data-zone-add]').forEach((b) => {
      b.addEventListener('click', () => {
        syncEmaFormFromDom();
        const side = b.dataset.zoneAdd;
        const key = side === 'buy' ? 'buyZones' : 'sellZones';
        const def = side === 'buy' ? -20 : 40;
        state.emaForm[key] = (state.emaForm[key] || []).concat([makeZone(side, def)]);
        persistEmaForm();
        renderPage();
      });
    });
    root.querySelectorAll('[data-zone-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.zoneDel;
        ['buyZones', 'sellZones'].forEach((k) => {
          const next = (state.emaForm[k] || []).filter((z) => z.id !== id);
          if (next.length) state.emaForm[k] = next;
        });
        persistEmaForm();
        renderPage();
      });
    });
  }
  function paintCurrentHero() {
    const el = document.getElementById('chart-hero');
    if (!el) return;
    const t = selectedHeroTicker();
    const result = state.page === '/ema' ? resultOf(state.emaResult)
      : state.page === '/multi-ticker-options' ? resultOf(state.optResult)
      : resultOf(state.result);
    const q = state.quote && state.quote.ticker === t ? state.quote : null;
    Charts.destroy();
    Charts.hero(el, barsForTicker(t), {
      dark: isDark(),
      kind: hp().kind,
      range: hp().range,
      timeframe: state.heroTf,
      trades: tradesForTicker(t, result),
      showTrades: hp().showTrades,
      currentPrice: q && q.current,
      todayQuote: q,
      isTrading: isMarketOpen(),
      todayISO: nyseParts().iso,
    });
  }
  async function loadQuote(ticker) {
    if (!ticker) return;
    const want = ticker;
    state.quoteLoading = true;
    const iconEl = document.querySelector('#hero-refresh svg');
    if (iconEl) iconEl.classList.add('animate-spin');
    try {
      const raw = await API.quote(ticker, state.settings.resultsQuoteProvider || providerId() || 'finnhub');
      if (selectedHeroTicker() !== want) return;
      state.quote = { ticker: want, ...normalizeQuote(raw) };
    } catch (_) {
      if (selectedHeroTicker() === want && (!state.quote || state.quote.ticker !== want)) {
        state.quote = { ticker: want, open: null, high: null, low: null, current: null, prevClose: null };
      }
    } finally {
      state.quoteLoading = false;
      if (iconEl) iconEl.classList.remove('animate-spin');
      const host = document.getElementById('hero-quote');
      if (host) host.innerHTML = heroQuoteInner();
      const pop = document.getElementById('quote-pop');
      if (pop) pop.innerHTML = quotePopBody();
      if (document.getElementById('chart-hero')) paintCurrentHero();
    }
  }
  function bindHero(root, opts) {
    opts = opts || {};
    root.querySelectorAll('[data-hero-ticker]').forEach((b) => b.addEventListener('click', () => {
      hp().ticker = b.dataset.heroTicker;
      state.quote = null;
      renderPage();
    }));
    root.querySelectorAll('[data-hero-range]').forEach((b) => b.addEventListener('click', () => {
      hp().range = b.dataset.heroRange;
      persistHero();
      root.querySelectorAll('[data-hero-range]').forEach((x) => {
        x.className = 'hero-range ' + (x.dataset.heroRange === hp().range ? 'hero-range-on' : 'hero-range-off');
      });
      paintCurrentHero();
    }));
    root.querySelectorAll('[data-hero-tf]').forEach((b) => b.addEventListener('click', () => {
      state.heroTf = b.dataset.heroTf;
      persistHero();
      root.querySelectorAll('[data-hero-tf]').forEach((x) => {
        x.className = x.dataset.heroTf === state.heroTf ? 'hero-tf-on' : 'hero-tf-off';
      });
      paintCurrentHero();
    }));
    root.querySelectorAll('[data-hero-kind]').forEach((b) => b.addEventListener('click', () => {
      hp().kind = b.dataset.heroKind;
      persistHero();
      renderPage();
    }));
    document.getElementById('hero-trades-toggle')?.addEventListener('click', () => {
      hp().showTrades = !hp().showTrades;
      persistHero();
      renderPage();
    });
    document.getElementById('hero-settings-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.heroSettingsOpen = !state.heroSettingsOpen;
      state.quoteOpen = false;
      document.getElementById('hero-settings-pop')?.classList.toggle('hidden', !state.heroSettingsOpen);
      document.getElementById('quote-pop')?.classList.add('hidden');
    });
    document.getElementById('quote-pop-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.quoteOpen = !state.quoteOpen;
      state.heroSettingsOpen = false;
      document.getElementById('quote-pop')?.classList.toggle('hidden', !state.quoteOpen);
      document.getElementById('hero-settings-pop')?.classList.add('hidden');
    });
    document.getElementById('hero-refresh')?.addEventListener('click', () => loadQuote(selectedHeroTicker()));
    document.getElementById('hero-pro')?.addEventListener('click', () => {
      if (opts.pro === 'price') { state.stockTab = 'price'; renderPage(); }
      else if (opts.pro === 'equity') { state.optTab = 'equity'; renderPage(); }
    });
    document.getElementById('stale-refresh')?.addEventListener('click', async () => {
      const t = selectedHeroTicker();
      if (!t) return;
      state.refreshingTicker = t;
      try {
        await API.refreshDataset(t);
        const ds = await API.dataset(t);
        const entry = (state.tickersData || []).find((x) => x.ticker === t);
        if (entry) entry.data = ds.data || [];
        if (state.ticker === t) state.bars = ds.data || [];
        toast('Датасет обновлён');
        renderPage();
      } catch (err) { toast(err.message); }
      finally { state.refreshingTicker = null; }
    });
    if (opts.quote) {
      const t = selectedHeroTicker();
      if (t && (!state.quote || state.quote.ticker !== t)) loadQuote(t);
    }
  }

  function paintLine(id, pts, dark, color) {
    const el = document.getElementById(id);
    if (el && pts) Charts.line(el, pts, dark, color);
  }
  function paintCandles(id, bars, dark) {
    const el = document.getElementById(id);
    if (el && bars) Charts.candles(el, bars, dark);
  }

  function paintStockCharts() {
    const r = state.result;
    if (!r) return;
    const dark = isDark();
    if (state.stockTab === 'summary' && document.getElementById('chart-hero')) {
      paintCurrentHero();
      return;
    }
    if (state.stockTab === 'price') paintCandles('chart-price', barsForTicker(selectedHeroTicker()), dark);
    if (state.stockTab === 'tickerCharts' && document.getElementById('ticker-charts')) {
      const host = document.getElementById('ticker-charts');
      host.innerHTML = (state.tickersData || []).map((t) => `<div><div class="text-sm font-semibold mb-1">${esc(t.ticker)}</div><div id="tc-${esc(t.ticker)}" class="chart-box rounded border dark:border-gray-800"></div></div>`).join('');
      (state.tickersData || []).forEach((t) => {
        const el = document.getElementById('tc-' + t.ticker);
        if (el) Charts.candles(el, t.data, dark);
      });
    }
    if (state.stockTab === 'equity') paintLine('chart-eq', r.equity, dark);
    if (state.stockTab === 'drawdown') paintLine('chart-dd', (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, '#dc2626');
    if (state.stockTab === 'exposure' && r.exposure) {
      paintLine('chart-exp', r.exposure.map((p) => ({ date: p.date, value: p.exposurePct })), dark, '#0ea5e9');
    }
    if (state.stockTab === 'openDayDrawdown') {
      const el = document.getElementById('odd-out');
      if (el) {
        const bars = barsForTicker(selectedHeroTicker()) || state.bars;
        const rows = Charts.mapOpenDayDrawdown(r.trades, bars);
        if (!rows.length) {
          el.innerHTML = '<p class="text-sm text-gray-500">Нет данных для графика просадки в день открытия</p>';
        } else {
          const avg = rows.reduce((s, x) => s + Math.abs(x.value), 0) / rows.length;
          const max = rows.reduce((m, x) => Math.max(m, Math.abs(x.value)), 0);
          el.innerHTML = `<div class="flex flex-wrap gap-4 mb-4 text-sm">
            <div class="bg-red-50 px-3 py-2 rounded border border-red-200 text-red-700 dark:bg-red-950/30">Средняя просадка в день открытия: ${avg.toFixed(2)}%</div>
            <div class="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800">Максимальная просадка: ${max.toFixed(2)}%</div>
          </div><div id="chart-odd" class="chart-box rounded border dark:border-gray-800"></div>`;
          Charts.line(document.getElementById('chart-odd'), rows, dark, '#dc2626');
        }
      }
    }
  }

  function paintEmaCharts() {
    const r = resultOf(state.emaResult);
    if (!r) return;
    const dark = isDark();
    const tab = state.emaTab;
    if (tab === 'summary' && document.getElementById('chart-hero')) {
      paintCurrentHero();
      return;
    }
    if (tab === 'price') paintCandles('chart-ema-price', barsForTicker(selectedHeroTicker()), dark);
    if (tab === 'emaDeviation') {
      const t = selectedHeroTicker();
      const dev = (r.deviation || []).filter((p) => !p.ticker || p.ticker === t);
      paintLine('chart-ema-dev', dev.map((p) => ({ date: p.date, value: p.deviationPct })), dark, '#7c3aed');
    }
    if (tab === 'equity') paintLine('chart-ema-eq', r.equity, dark);
    if (tab === 'drawdown') paintLine('chart-ema-dd', (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, '#dc2626');
    if (tab === 'exposure' && r.exposure?.length) {
      paintLine('chart-ema-exp', r.exposure.map((p) => ({ date: p.date, value: p.exposurePct })), dark, '#0ea5e9');
    }
  }

  function paintOptCharts() {
    const r = resultOf(state.optResult);
    if (!r) return;
    const dark = isDark();
    const tab = state.optTab;
    if (tab === 'summary' && document.getElementById('chart-hero')) {
      paintCurrentHero();
      return;
    }
    if (tab === 'equity') paintLine('chart-opt-eq', r.equity, dark);
    if (tab === 'price') paintCandles('chart-opt-price', barsForTicker(selectedHeroTicker()), dark);
    if (tab === 'drawdown') paintLine('chart-opt-dd', (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, '#dc2626');
    if (tab === 'tickerCharts' && document.getElementById('opt-ticker-charts')) {
      const host = document.getElementById('opt-ticker-charts');
      host.innerHTML = (state.tickersData || []).map((t) => `<div><div class="text-sm font-semibold mb-1">${esc(t.ticker)}</div><div id="otc-${esc(t.ticker)}" class="chart-box rounded border dark:border-gray-800"></div></div>`).join('');
      (state.tickersData || []).forEach((t) => {
        const el = document.getElementById('otc-' + t.ticker);
        if (el) Charts.candles(el, t.data, dark);
      });
    }
    if (tab === 'splits') {
      const el = document.getElementById('opt-splits-box');
      if (el) {
        API.tickerSplits(state.ticker).then((evs) => {
          el.innerHTML = (evs || []).map((e) => `<div class="text-sm">${esc(e.date)} × ${esc(e.factor)}</div>`).join('') || '<p class="text-sm text-gray-500">Нет сплитов</p>';
        }).catch((e) => { el.textContent = e.message; });
      }
    }
  }

  async function runNested() {
    if (!state.result || !state.bars?.length) return;
    const st = defaultStrategy();
    const fill = async (id, name, extra) => {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        const raw = await API.calc(name, { data: state.bars, strategy: st, trades: state.result.trades, ticker: state.ticker, tickers: state.tickersData, ...extra });
        const r = resultOf(raw);
        if (!r) { el.textContent = 'Нет результата'; return; }
        if (!r.metrics || typeof r.metrics !== 'object' || (r.metrics.profitFactor == null && r.metrics.totalReturn == null && !Object.keys(r.metrics).length)) {
          try {
            const m = await API.calc('metrics', { trades: r.trades, equity: r.equity, initialCapital: 10000 });
            r.metrics = m;
            r.maxDrawdown = m.maxDrawdown ?? r.maxDrawdown;
          } catch (_) {}
        }
        el.innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + tradesTable(r.trades);
      } catch (e) { el.textContent = e.message; }
    };
    if (state.stockTab === 'buyhold') {
      const el = document.getElementById('bh-out');
      const chartEl = document.getElementById('chart-bh');
      if (el && chartEl) {
        try {
          const raw = await API.calc('buy-hold', { data: state.bars, strategy: st, ticker: state.ticker });
          const r = resultOf(raw);
          const base = (r && r.equity) || [];
          const paint = (lev) => {
            const scaled = lev === 1 ? { equity: base } : Charts.simulateLeverage(base, lev);
            Charts.destroy();
            Charts.line(document.getElementById('chart-bh'), scaled.equity, isDark());
            const lab = document.getElementById('bh-lev-now');
            if (lab) lab.textContent = 'Текущее плечо: ×' + lev.toFixed(2);
          };
          paint(1);
          document.getElementById('bh-lev-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const pct = Number(new FormData(e.target).get('pct'));
            paint(Number.isFinite(pct) && pct > 0 ? pct / 100 : 1);
          });
        } catch (e) { el.textContent = e.message; }
      }
    }
    if (state.stockTab === 'buyAtClose') fill('bac-out', 'buy-at-close');
    if (state.stockTab === 'buyAtClose4') fill('bac4-out', 'buy-at-close-4', { leverage: (state.leverage || 200) / 100 });
    if (state.stockTab === 'noStopLoss') fill('nsl-out', 'no-stop-loss', { noStop: { exitMode: 'ibs-only', requireProfitableExit: false } });
    if (state.stockTab === 'options') fill('opt-out', isSingle() ? 'options' : 'options-multi', { config: { strikePct: 10, volAdjPct: 20, capitalPct: 10, expirationWeeks: 4, maxHoldingDays: 30 } });
    if (state.stockTab === 'splits') {
      const el = document.getElementById('splits-box');
      if (el) {
        try {
          const evs = await API.tickerSplits(state.ticker);
          el.innerHTML = (evs || []).map((e) => `<div class="text-sm">${esc(e.date)} × ${esc(e.factor)}</div>`).join('') || '<p class="text-sm text-gray-500">Нет сплитов</p>';
        } catch (e) { el.textContent = e.message; }
      }
    }
    if (state.stockTab === 'monthlyContribution') {
      document.getElementById('mc-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const r = await API.calc('single-position', {
          tickers: state.tickersData, strategy: st, leverage: (state.leverage || 200) / 100,
          single: { allowSameDayReentry: true, monthlyAmount: Number(fd.get('amount')), monthlyDayOfMonth: Number(fd.get('day')) },
        });
        document.getElementById('mc-out').innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + tradesTable(r.trades);
      });
    }
  }

  async function bootAuthed() {
    try { const st = await API.status(); state.apiBuildId = st.timestamp || st.buildId; } catch (_) {}
    try { state.datasets = await API.datasets(); } catch (_) { state.datasets = []; }
    try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
    try {
      const savedEma = JSON.parse(localStorage.getItem('ema.settings') || 'null');
      if (savedEma) state.emaForm = normalizeEmaForm(savedEma);
    } catch (_) {}
    if (state.settings.defaultMultiTickerSymbols && !localStorage.getItem('tickersInput')) {
      state.tickerInput = state.settings.defaultMultiTickerSymbols;
    }
    const q = new URL(location.href).searchParams.get('tickers');
    if (q) {
      state.tickerInput = q.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
    }
    if (state.datasets[0] && !state.ticker) state.ticker = state.datasets[0].ticker;
  }

  async function start() {
    applyTheme();
    const path = location.pathname === '/' ? '/data' : location.pathname;
    state.page = path === '/results' ? '/stocks' : path;
    const q = new URL(location.href).searchParams.get('tickers');
    if (q) {
      state.tickerInput = q.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
    }
    if (state.page === '/login') {
      document.getElementById('app').innerHTML = loginPage();
      bindLogin();
      return;
    }
    try {
      await API.authCheck();
      state.user = true;
      await bootAuthed();
      renderPage();
    } catch (e) {
      if (e.status === 401) {
        state.user = false;
        state.page = '/login';
        document.getElementById('app').innerHTML = loginPage();
        bindLogin();
      } else {
        state.user = true;
        await bootAuthed();
        renderPage();
      }
    }
  }
  start();
})();
