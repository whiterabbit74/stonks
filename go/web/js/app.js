(() => {
  const TABS = [
    { to: '/data', label: 'Данные', icon: 'database' },
    { to: '/stocks', label: 'Акции', icon: 'linechart' },
    { to: '/ema', label: 'EMA', icon: 'activity' },
    { to: '/multi-ticker-options', label: 'Опционы', icon: 'layers' },
    { to: '/calendar', label: 'Календарь', icon: 'calendar' },
    { to: '/split', label: 'Сплиты', icon: 'scissors' },
    { to: '/watches', label: 'Мониторинг', icon: 'bell' },
    { to: '/broker', label: 'Брокер', icon: 'briefcase' },
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
    { id: 'summary', label: 'Сводка', icon: 'layout' },
    { id: 'trades', label: 'Сделки', icon: 'list' },
    { id: 'watches', label: 'Тикеры', icon: 'bell' },
    { id: 'ema', label: 'EMA', icon: 'linechart' },
  ];
  const CAPITAL_MODES = [
    { value: 'standard_safe', label: 'Стандартный', hint: '100% капитала с запасом 2.2% под market buy Webull' },
    { value: 'cash_100', label: '100% без коррекции', hint: 'Ровно 100% без резерва' },
    { value: 'margin_125', label: 'Маржа 125%', hint: '125% базового капитала' },
    { value: 'margin_150', label: 'Маржа 150%', hint: '150% базового капитала' },
    { value: 'margin_175', label: 'Маржа 175%', hint: '175% базового капитала' },
    { value: 'margin_200', label: 'Маржа 200%', hint: '200% базового капитала' },
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
  const MONITOR_MARGIN_OPTIONS = [100, 125, 150, 175, 200];
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
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
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
    chevrondown: '<path d="m6 9 6 6 6-6"/>',
    chevronleft: '<path d="m15 18-6-6 6-6"/>',
    chevronright: '<path d="m9 18 6-6-6-6"/>',
    layout: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    arrowne: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    logo: '<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
  };

  const PC_COLORS = ['#2563EB', '#0EA5E9', '#14B8A6', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#F43F5E', '#A855F7', '#8B5CF6', '#64748B'];
  const PC_LINE_STYLES = [{ v: 0, l: 'Сплошная' }, { v: 2, l: 'Пунктир' }, { v: 3, l: 'Штрих-пунктир' }];
  const PC_CORE_BANDS = ['ema-p15', 'ema-p40', 'ema-m20'];
  function readChartPrefs() {
    try { return JSON.parse(localStorage.getItem('chart-prefs') || '{}'); } catch { return {}; }
  }
  function pcWidth(v, fb) { const n = Number(v); return n === 1 || n === 2 || n === 3 || n === 4 ? n : fb; }
  function pcStyle(v, fb) { const n = Number(v); return n === 0 || n === 1 || n === 2 || n === 3 ? n : fb; }
  function pcColor(v, fb) { return /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : fb; }
  function pcBool(prefs, key, fallback) {
    if (prefs[key] === false) return false;
    if (prefs[key] === true) return true;
    return fallback;
  }
  function defaultPcBands() {
    return [
      { id: 'ema-p15', pct: 15, enabled: false, color: '#10B981', width: 1, style: 2 },
      { id: 'ema-p40', pct: 40, enabled: false, color: '#EF4444', width: 1, style: 2 },
      { id: 'ema-m20', pct: -20, enabled: false, color: '#A855F7', width: 1, style: 3 },
    ];
  }
  function normalizePcBands(raw) {
    if (!Array.isArray(raw) || !raw.length) return defaultPcBands();
    return raw.map((b, i) => ({
      id: String(b && b.id ? b.id : 'band-' + i),
      pct: Number(b && b.pct),
      enabled: !!(b && b.enabled),
      color: pcColor(b && b.color, '#64748B'),
      width: pcWidth(b && b.width, 1),
      style: pcStyle(b && b.style, 2),
    })).filter((b) => Number.isFinite(b.pct));
  }
  function initPriceChart() {
    const prefs = readChartPrefs();
    let range = prefs.range === 'ALL' ? 'MAX' : (prefs.range || 'MAX');
    if (HERO_RANGES.indexOf(range) < 0) range = 'MAX';
    const tradesOff = prefs.trades === false || prefs.showTradeMarkers === false;
    return {
      ema20: pcBool(prefs, 'ema20', true),
      ema200: pcBool(prefs, 'ema200', true),
      ibs: pcBool(prefs, 'ibs', true),
      volume: pcBool(prefs, 'volume', true),
      splits: pcBool(prefs, 'splits', true),
      trades: tradesOff ? false : true,
      range,
      ema20Color: pcColor(prefs.ema20Color, '#2563EB'),
      ema20Width: pcWidth(prefs.ema20Width, 2),
      ema20Style: pcStyle(prefs.ema20Style, 0),
      ema200Color: pcColor(prefs.ema200Color, '#F59E0B'),
      ema200Width: pcWidth(prefs.ema200Width, 2),
      ema200Style: pcStyle(prefs.ema200Style, 0),
      bands: normalizePcBands(prefs.emaBands),
    };
  }
  function persistPriceChart() {
    try {
      const p = state.priceChart;
      const raw = readChartPrefs();
      raw.range = p.range;
      raw.ema20 = !!p.ema20;
      raw.ema200 = !!p.ema200;
      raw.ibs = !!p.ibs;
      raw.volume = !!p.volume;
      raw.splits = !!p.splits;
      raw.trades = !!p.trades;
      raw.showTradeMarkers = !!p.trades;
      raw.ema20Color = p.ema20Color;
      raw.ema20Width = p.ema20Width;
      raw.ema20Style = p.ema20Style;
      raw.ema200Color = p.ema200Color;
      raw.ema200Width = p.ema200Width;
      raw.ema200Style = p.ema200Style;
      raw.emaBands = (p.bands || []).map((b) => ({ id: b.id, pct: b.pct, enabled: !!b.enabled, color: b.color, width: b.width, style: b.style }));
      raw.timeframe = state.heroTf;
      localStorage.setItem('chart-prefs', JSON.stringify(raw));
    } catch (_) {}
  }
  function formatBandLabel(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return 'EMA 200';
    return 'EMA 200 ' + (n > 0 ? '+' : '') + n + '%';
  }

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
    navCollapsed: localStorage.getItem('nav.collapsed') === '1',
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
    monitorMarginPercent: (() => {
      const n = Math.round(Number(localStorage.getItem('monitor.marginPercent') || 100));
      return [100, 125, 150, 175, 200].includes(n) ? n : 100;
    })(),
    watchTradeFilter: 'all',
    brokerShowHidden: false,
    brokerQuotes: {},
    emaAlerts: [],
    autoConfig: {},
    tickerCatalog: [],
    enhanceCat: 'popular',
    enhanceQuery: '',
    analysisTabsConfig: JSON.parse(localStorage.getItem('analysisTabsConfig') || 'null') || STOCK_TABS.filter((t) => t.id !== 'summary').map((t) => ({ ...t, visible: true })),
    datasetsError: null,
    serverStatus: 'checking',
    enhanceLoadingSymbol: null,
    enhanceHighlight: -1,
    enhanceListOpen: false,
    tradesPage: 1,
    watchShowHidden: false,
    watchSortKey: 'symbol',
    watchSortDir: 'asc',
    nested: {
      bac: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30, marginPct: 100 },
      bac4: { tickers: 'AAPL, MSFT, AMZN, MAGS', leverage: 200 },
      nsl: { exitMode: 'ibs-only', requireProfitableExit: false, maxHoldDays: 60, profitTarget: 10, leverage: 100 },
      opt: { strikePct: 10, volAdjPct: 20, capitalPct: 10, expirationWeeks: 4, maxHoldingDays: 30 },
      mc: { amount: 500, day: 1 },
    },
    baselineResult: null,
    emaBaseline: null,
    emaRunParams: null,
    priceChart: initPriceChart(),
    priceChartUi: { indOpen: false, styleFor: null, tickerOpen: false, fullscreen: false, chartId: 'chart-price' },
    clientErrors: [],
    errorConsoleOpen: false,
    errorBanner: null,
    returnTo: null,
    splitApplyTicker: '',
    calImportStats: null,
    lastPageKey: '',
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
  function toNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }
  function fmtUsd(n, d) {
    n = toNum(n);
    if (n == null) return '—';
    const digits = d == null ? 2 : d;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function asObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  }
  function firstDefined(row, keys) {
    if (!row || typeof row !== 'object') return null;
    for (const k of keys) {
      const value = row[k];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }
  function asRows(v, depth) {
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== 'object' || depth > 4) return [];
    const keys = ['holdings', 'positions', 'orders', 'items', 'list', 'data', 'rows', 'accounts'];
    for (const k of keys) {
      if (Array.isArray(v[k])) return v[k];
    }
    for (const k of keys) {
      if (v[k] && typeof v[k] === 'object') {
        const nested = asRows(v[k], (depth || 0) + 1);
        if (nested.length) return nested;
      }
    }
    return [];
  }
  function pickField(row, keys) {
    const v = firstDefined(row, keys);
    return v == null ? '—' : v;
  }
  function formatRatioPercent(v) {
    const n = toNum(v);
    if (n == null) return '—';
    const pct = Math.abs(n) <= 1.5 ? n * 100 : n;
    return fmt(pct, 2) + '%';
  }
  function extractBalanceSummary(dashboard) {
    const root = asObject(dashboard) || {};
    let balance = root.balance != null ? root.balance : (asObject(root.account) && root.account.balance);
    const wrapped = asObject(balance);
    const candidate = wrapped && wrapped.data && typeof wrapped.data === 'object' && !Array.isArray(wrapped.data)
      ? wrapped.data
      : wrapped;
    const currencyAssets = Array.isArray(candidate && candidate.account_currency_assets)
      ? candidate.account_currency_assets.filter((item) => item && typeof item === 'object')
      : [];
    const usd = currencyAssets.find((item) => String(item.currency || '').toUpperCase() === 'USD') || currencyAssets[0] || null;
    const currency = firstDefined(usd, ['currency'])
      || firstDefined(candidate, ['total_asset_currency', 'currency', 'base_currency', 'baseCurrency'])
      || 'USD';
    return {
      totalAssets: toNum(firstDefined(candidate, ['total_net_liquidation_value', 'net_liquidation_value', 'netLiquidationValue', 'total_assets', 'totalAssets']))
        ?? toNum(firstDefined(usd, ['net_liquidation_value', 'netLiquidationValue']))
        ?? toNum(firstDefined(candidate, ['total_market_value', 'market_value', 'marketValue'])),
      cashBalance: toNum(firstDefined(candidate, ['total_cash_balance', 'cash_balance', 'cashBalance', 'settled_cash', 'settledCash', 'cash']))
        ?? toNum(firstDefined(usd, ['cash_balance', 'cashBalance'])),
      buyingPower: toNum(firstDefined(usd, ['overnight_buying_power', 'overnightBuyingPower', 'day_buying_power', 'dayBuyingPower', 'option_buying_power', 'optionBuyingPower', 'night_trading_buying_power', 'nightTradingBuyingPower', 'buying_power', 'buyingPower', 'margin_power', 'cash_power']))
        ?? toNum(firstDefined(candidate, ['buying_power', 'buyingPower', 'day_trading_buying_power', 'dayTradingBuyingPower'])),
      unrealizedPnl: toNum(firstDefined(candidate, ['total_unrealized_profit_loss', 'unrealized_profit_loss', 'unrealizedProfitLoss', 'unrealized_pnl', 'unrealizedPnl']))
        ?? toNum(firstDefined(usd, ['unrealized_profit_loss', 'unrealizedProfitLoss'])),
      accountType: firstDefined(candidate, ['account_type', 'accountType']),
      currency,
      fetchedAt: root.fetchedAt || root.fetched_at || '',
    };
  }
  function normalizePositions(positions) {
    return asRows(positions).map((item, index) => ({
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
  function normalizeOrders(payload) {
    return asRows(payload).flatMap((item, index) => {
      const nested = asRows(item.orders).length ? asRows(item.orders) : asRows(item.items);
      const rows = nested.length ? nested : [item];
      return rows.map((row, rowIndex) => {
        const merged = { ...item, ...row };
        return {
          id: String(firstDefined(merged, ['client_order_id', 'order_id', 'combo_order_id', 'id']) ?? `${index}-${rowIndex}`),
          clientOrderId: String(firstDefined(merged, ['client_order_id']) ?? '—'),
          orderId: String(firstDefined(merged, ['order_id', 'combo_order_id']) ?? '—'),
          comboType: String(firstDefined(merged, ['combo_type']) ?? '—'),
          symbol: String(firstDefined(merged, ['symbol', 'ticker']) ?? '—'),
          side: String(firstDefined(merged, ['side', 'action']) ?? '—'),
          status: String(firstDefined(merged, ['status', 'order_status']) ?? '—'),
          quantity: firstDefined(merged, ['total_quantity', 'quantity', 'qty', 'filled_quantity', 'filled_qty']),
          filledQuantity: firstDefined(merged, ['filled_quantity', 'filled_qty', 'deal_quantity']),
          orderType: String(firstDefined(merged, ['order_type', 'type']) ?? '—'),
          instrumentType: String(firstDefined(merged, ['instrument_type']) ?? '—'),
          entrustType: String(firstDefined(merged, ['entrust_type']) ?? '—'),
          timeInForce: String(firstDefined(merged, ['time_in_force', 'tif']) ?? '—'),
          tradingSession: String(firstDefined(merged, ['support_trading_session', 'trading_session', 'session']) ?? '—'),
          avgPrice: firstDefined(merged, ['filled_price', 'avg_price', 'average_price', 'filled_avg_price', 'deal_price']),
          limitPrice: firstDefined(merged, ['limit_price', 'limitPrice', 'price']),
          createdAt: firstDefined(merged, ['place_time_at', 'create_time_at', 'update_time_at', 'create_time', 'created_at', 'createdAt', 'update_time', 'place_time']),
          filledAt: firstDefined(merged, ['filled_time_at', 'filled_time', 'place_time_at', 'create_time_at', 'filledTime']),
        };
      });
    });
  }
  function fmtPct(n) { return (n == null ? 0 : n).toFixed(1) + '%'; }
  function fmtSignedPct(n, d) {
    const x = toNum(n);
    if (x == null) return '—';
    const digits = d == null ? 2 : d;
    return (x > 0 ? '+' : '') + x.toFixed(digits) + '%';
  }
  function fmtSignedUsd(n) {
    const x = toNum(n);
    if (x == null) return '—';
    return (x > 0 ? '+' : '') + fmtUsd(x);
  }
  function pnlClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }
  function isDark() {
    return state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function fmtTradingDate(d) {
    const s = String(d || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? (m[3] + '.' + m[2] + '.' + m[1]) : (s || '—');
  }
  function formatDateTimeET(iso) {
    if (iso == null || iso === '') return '—';
    const raw = String(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) && raw.length <= 10) return fmtTradingDate(raw);
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw;
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(dt);
  }
  function catalogName(ticker) {
    const t = String(ticker || '').toUpperCase();
    const list = (state.tickerCatalog && state.tickerCatalog.length) ? state.tickerCatalog : POPULAR;
    const hit = list.find((x) => String(x.symbol || '').toUpperCase() === t);
    return (hit && hit.name) || '';
  }
  function datasetCompany(d) {
    if (!d) return '';
    return d.companyName || catalogName(d.ticker) || '';
  }
  function refreshProvider() {
    return state.settings.resultsRefreshProvider || state.settings.enhancerProvider || 'finnhub';
  }
  function errText(err) {
    if (!err) return 'Ошибка';
    let msg = err.message || String(err);
    if (err.data && typeof err.data === 'object') {
      try {
        const extra = JSON.stringify(err.data);
        if (extra && extra !== '{}' && extra !== 'null') msg += ' | ' + extra;
      } catch (_) {}
    }
    return msg;
  }
  function logClientError(level, message, extra) {
    const evt = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2),
      ts: Date.now(),
      level: level || 'error',
      message: String(message || 'Ошибка'),
      extra: extra || '',
    };
    state.clientErrors.push(evt);
    if (state.clientErrors.length > 200) state.clientErrors.splice(0, state.clientErrors.length - 200);
    state.errorBanner = evt.message;
    const badge = document.getElementById('err-log-count');
    if (badge) {
      badge.textContent = state.clientErrors.length > 99 ? '99+' : String(state.clientErrors.length);
      badge.classList.toggle('hidden', !state.clientErrors.length);
    }
    const banner = document.getElementById('error-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.querySelector('[data-err-text]') && (banner.querySelector('[data-err-text]').textContent = evt.message);
    }
    return evt;
  }
  function bindErrorLogging() {
    if (window.__errLogBound) return;
    window.__errLogBound = true;
    window.addEventListener('error', (e) => {
      logClientError('error', (e && e.message) || 'window.onerror', (e && e.error && e.error.stack) || '');
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      logClientError('error', (r && r.message) || String(r || 'unhandledrejection'), r && r.stack);
    });
  }
  function rememberReturnPath(path) {
    const p = path || state.page || location.pathname || '/data';
    if (!p || p === '/login') return;
    state.returnTo = p;
    try { sessionStorage.setItem('spa.returnTo', p); } catch (_) {}
  }
  function consumeReturnPath() {
    let p = state.returnTo;
    try { p = p || sessionStorage.getItem('spa.returnTo'); sessionStorage.removeItem('spa.returnTo'); } catch (_) {}
    state.returnTo = null;
    if (!p || p === '/login' || p === '/') return '/data';
    return p;
  }
  function handleUnauthorized() {
    if (!state.user && state.page === '/login') return;
    rememberReturnPath(state.page);
    state.user = false;
    state.page = '/login';
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = loginPage();
      bindLogin();
    }
  }
  function setModal(html) {
    state.modal = html || null;
    const ov = document.getElementById('overlay-root');
    if (ov) ov.innerHTML = overlay();
  }
  function closeModal() { setModal(null); }
  async function openCloseMonitorModal(id, symbol) {
    const today = nyseParts().iso;
    setModal(`<div class="modal-backdrop"><div class="modal-card max-w-lg">
      <h3 class="text-lg font-semibold mb-2">Закрыть мониторинг: ${esc(symbol || '')}</h3>
      <p class="text-sm text-gray-500 mb-3">Это действие закроет только нашу monitor-сделку. Webull-ордер не отправляется.</p>
      <div id="cm-err" class="text-sm text-red-600 mb-2 hidden"></div>
      <label class="block text-sm mb-2">Дата выхода (ET)<input id="cm-date" class="field mt-1" value="${esc(today)}" placeholder="YYYY-MM-DD" /></label>
      <label class="block text-sm mb-2">Цена выхода<input id="cm-price" type="number" step="0.01" class="field mt-1" /></label>
      <p id="cm-hint" class="text-xs text-gray-500 mb-2">Загружаем котировку…</p>
      <label class="block text-sm mb-3">Exit IBS, %<input id="cm-ibs" type="number" step="0.1" min="0" max="100" class="field mt-1" placeholder="Необязательно" /></label>
      <div class="flex justify-end gap-2"><button id="cm-cancel" class="btn-secondary">Отмена</button><button id="cm-save" class="btn-danger">Закрыть мониторинг</button></div>
    </div></div>`);
    document.getElementById('cm-cancel')?.addEventListener('click', closeModal);
    document.getElementById('cm-save')?.addEventListener('click', async () => {
      const errEl = document.getElementById('cm-err');
      const price = Number(document.getElementById('cm-price').value);
      const exitDate = document.getElementById('cm-date').value;
      const ibsRaw = document.getElementById('cm-ibs').value;
      if (!(price > 0)) { errEl.textContent = 'Укажи корректную цену выхода.'; errEl.classList.remove('hidden'); return; }
      if (ibsRaw.trim() !== '') {
        const n = Number(ibsRaw);
        if (!Number.isFinite(n) || n < 0 || n > 100) { errEl.textContent = 'IBS должен быть в диапазоне 0-100%.'; errEl.classList.remove('hidden'); return; }
      }
      try {
        const body = { exitPrice: price, exitDate, note: 'manual_monitor_close_from_ui' };
        if (ibsRaw.trim() !== '') body.exitIBS = Number(ibsRaw) / 100;
        await API.closeMonitor(id, body);
        closeModal();
        state.loaded.watches = false;
        toast('Monitor-сделка закрыта');
        renderPage();
      } catch (err) { errEl.textContent = errText(err); errEl.classList.remove('hidden'); }
    });
    try {
      const raw = await API.quote(symbol, state.settings.resultsQuoteProvider || providerId() || 'finnhub');
      const q = normalizeQuote(raw);
      const priceEl = document.getElementById('cm-price');
      const ibsEl = document.getElementById('cm-ibs');
      const hint = document.getElementById('cm-hint');
      if (priceEl && q.current != null && !priceEl.value) priceEl.value = q.current.toFixed(2);
      if (ibsEl && q.high != null && q.low != null && q.current != null && q.high !== q.low) {
        ibsEl.value = (((q.current - q.low) / (q.high - q.low)) * 100).toFixed(1);
      }
      if (hint) hint.textContent = q.current != null ? ('Текущая цена: ' + fmt(q.current)) : 'Котировка недоступна';
    } catch (_) {
      const hint = document.getElementById('cm-hint');
      if (hint) hint.textContent = 'Котировка недоступна — введите цену вручную';
    }
  }
  function ibsPct(v) {
    const n = toNum(v);
    if (n == null) return null;
    return Math.abs(n) <= 1.5 ? n * 100 : n;
  }
  function ibsFraction(pctRaw) {
    const n = toNum(pctRaw);
    if (n == null) return null;
    return n > 1.5 ? n / 100 : n;
  }
  function visibleMonitorTrades(trades, includeHidden) {
    const list = trades || [];
    return includeHidden ? list : list.filter((t) => !t.isHidden);
  }
  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }
  function rawJsonBlock(title, value) {
    if (value == null) return '';
    let text = '';
    try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value); }
    return `<details class="raw-json"><summary>${esc(title)}</summary><pre>${esc(text)}</pre></details>`;
  }
  function comparisonPanel(current, baseline) {
    if (!current || !baseline) return '';
    const cm = current.metrics || {};
    const bm = baseline.metrics || {};
    const cell = (label, a, b, money) => {
      const av = money ? fmtUsd(a) : (typeof a === 'number' && Math.abs(a) < 1000 && label !== 'Сделок' ? fmtPct(a) : fmt(a, 0));
      const bv = money ? fmtUsd(b) : (typeof b === 'number' && Math.abs(b) < 1000 && label !== 'Сделок' ? fmtPct(b) : fmt(b, 0));
      return `<div class="rounded-lg border p-3 text-sm"><div class="text-xs text-gray-500">${esc(label)}</div><div class="font-semibold">${av}</div><div class="text-xs text-gray-500">без маржи: ${bv}</div></div>`;
    };
    return `<div class="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 mb-3 dark:bg-indigo-950/20 dark:border-indigo-900">
      <div class="text-sm font-semibold mb-2">Сравнение режимов (с маржой vs 100%)</div>
      <div class="cmp-grid">
        ${cell('Итог', current.finalValue ?? cm.finalValue, baseline.finalValue ?? bm.finalValue, true)}
        ${cell('Доходность', cm.totalReturn, bm.totalReturn)}
        ${cell('CAGR', cm.cagr, bm.cagr)}
        ${cell('Win rate', cm.winRate, bm.winRate)}
        ${cell('Профит-фактор', cm.profitFactor, bm.profitFactor)}
        ${cell('Сделок', cm.totalTrades ?? (current.trades || []).length, bm.totalTrades ?? (baseline.trades || []).length)}
      </div>
    </div>`;
  }
  function cssHistogram(values, positive) {
    const nums = (values || []).map(Number).filter((n) => Number.isFinite(n));
    if (!nums.length) return '<p class="text-sm text-gray-500">Нет данных</p>';
    const max = Math.max.apply(null, nums.map((n) => Math.abs(n)).concat([1]));
    return `<div class="hist-css">${nums.map((n) => {
      const h = Math.max(4, Math.round((Math.abs(n) / max) * 116));
      const pos = positive ? n >= 0 : n >= 0;
      return `<span title="${esc(n)}" style="height:${h}px;background:${pos ? '#16a34a' : '#dc2626'}"></span>`;
    }).join('')}</div>`;
  }
  function exitReasonLabel(code) {
    const m = {
      ibs_signal: 'Сигнал стратегии',
      max_hold_days: 'Макс. удержание',
      option_expired: 'Экспирация опциона',
      stop_loss: 'Стоп-лосс',
      take_profit: 'Тейк-профит',
      end_of_data: 'Конец данных',
      profit_target: 'Цель по прибыли',
      time_limit: 'Лимит времени',
    };
    return m[code] || code || '—';
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
      const raw = readChartPrefs();
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
  function compactMetricsHTML(result) {
    if (!result || !result.metrics) return '';
    const m = result.metrics;
    const pf = Number.isFinite(m.profitFactor) ? fmt(m.profitFactor) : '∞';
    return `<div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
      <div>CAGR<div class="font-semibold">${fmtPct(m.cagr)}</div></div>
      <div>Макс. DD<div class="font-semibold">${fmtPct(result.maxDrawdown ?? m.maxDrawdown)}</div></div>
      <div>Win rate<div class="font-semibold">${fmtPct(m.winRate)}</div></div>
      <div>Профит-фактор<div class="font-semibold">${pf}</div></div>
      <div class="col-span-2">Сделок <b>${m.totalTrades ?? (result.trades || []).length}</b></div>
    </div>`;
  }
  function asideExtrasHTML(result) {
    if (!result) return '';
    const t = selectedHeroTicker();
    return compactMetricsHTML(result) + staleWarningHTML(t, barsForTicker(t)) + openPositionHTML(result.trades, lastBarDate(t));
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
    const avgWin = wins.length ? wins.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / losses.length : 0;
    const avgAll = x.trades.length ? x.trades.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / x.trades.length : 0;
    const gp = wins.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const gl = losses.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const histPts = x.trades.map((t, i) => ({ date: t.exitDate || t.entryDate || ('t' + i), value: Number(t.pnlPercent) || 0 }));
    return `<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${Number.isFinite(pf) ? fmt(pf) : '∞'}</div><div class="text-xs text-gray-500">Профит-фактор</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmtPct(x.metrics.winRate)}</div><div class="text-xs text-gray-500">Win rate</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(avgAll, 2)}%</div><div class="text-xs text-gray-500">Средний PnL</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold pos">${fmtUsd(gp)}</div><div class="text-xs text-gray-500">Валовая прибыль</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold neg">${fmtUsd(gl)}</div><div class="text-xs text-gray-500">Валовый убыток</div></div>
    </div>
    <p class="text-sm text-gray-500 mb-3">Прибыльных ${wins.length} · убыточных ${losses.length} · средний убыток ${fmt(avgLoss, 2)}% · средний плюс ${fmt(avgWin, 2)}%</p>
    <div class="text-xs font-medium text-gray-500 mb-1">Распределение PnL%</div>
    <div id="chart-pnl-hist" class="chart-box rounded border dark:border-gray-800"></div>
    <div class="mt-2">${cssHistogram(x.trades.map((t) => Number(t.pnlPercent) || 0), true)}</div>`;
  }
  function durationBody(r) {
    const x = resultOf(r);
    if (!x || !x.trades.length) return '<p class="text-sm text-gray-500">Нет сделок</p>';
    const days = x.trades.map((t) => Number(t.duration) || 0).sort((a, b) => a - b);
    const avg = days.reduce((s, n) => s + n, 0) / days.length;
    const med = days[Math.floor(days.length / 2)];
    const max = days[days.length - 1];
    const byDay = {};
    days.forEach((d) => { byDay[d] = (byDay[d] || 0) + 1; });
    const dayRows = Object.entries(byDay).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n}</td><td>${fmt((n / days.length) * 100, 1)}%</td></tr>`).join('');
    const reasons = {};
    x.trades.forEach((t) => {
      const k = t.exitReason || '—';
      if (!reasons[k]) reasons[k] = { n: 0, pnl: 0 };
      reasons[k].n += 1;
      reasons[k].pnl += Number(t.pnlPercent) || 0;
    });
    const reasonRows = Object.entries(reasons).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td>${esc(exitReasonLabel(k))}</td><td>${v.n}</td><td class="${pnlClass(v.pnl / v.n)}">${fmt(v.pnl / v.n, 2)}%</td></tr>`).join('');
    return `<div class="grid grid-cols-3 gap-3 mb-3">
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(avg, 1)}</div><div class="text-xs text-gray-500">Средняя, дн.</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(med, 1)}</div><div class="text-xs text-gray-500">Медиана, дн.</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(max, 1)}</div><div class="text-xs text-gray-500">Макс., дн.</div></div>
    </div>
    <div class="text-xs font-medium text-gray-500 mb-1">Длительность сделок</div>
    <div id="chart-dur-hist" class="chart-box rounded border dark:border-gray-800 mb-3"></div>
    <div class="grid md:grid-cols-2 gap-4">
      <table class="trades"><thead><tr><th>Дней</th><th>Сделок</th><th>%</th></tr></thead><tbody>${dayRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
      <table class="trades"><thead><tr><th>Причина выхода</th><th>Сделок</th><th>Ср. PnL</th></tr></thead><tbody>${reasonRows}</tbody></table>
    </div>`;
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
    const loading = String(state.enhanceLoadingSymbol || '').toUpperCase();
    const cards = list.map((t) => {
      const on = loaded.has(t.symbol);
      const busy = loading === String(t.symbol).toUpperCase();
      return `<button type="button" data-esym="${esc(t.symbol)}" class="ticker-card${on ? ' loaded' : ''}${busy ? ' opacity-70' : ''}" ${busy || loading ? 'disabled' : ''} title="${on ? esc(t.symbol) + ' уже загружен. Нажмите для обновления' : 'Нажмите для загрузки ' + t.symbol}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-medium truncate ${on ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}">${esc(t.name)}</div>
            <div class="text-xs font-mono mt-0.5 ${on ? 'text-green-600' : 'text-gray-500'}">${esc(t.symbol)}</div>
          </div>
          <span class="shrink-0 text-base">${busy ? '…' : (on ? '✓' : '↓')}</span>
        </div>
      </button>`;
    }).join('') || '<p class="text-sm text-gray-500 col-span-full text-center py-8">Ничего не найдено</p>';
    return { list, cards };
  }
  function enhanceSuggestions() {
    const q = String(state.enhanceQuery || '').toLowerCase().trim();
    if (!q) return [];
    return catalogFiltered().slice(0, 8);
  }
  function enhanceListboxHTML() {
    if (!state.enhanceListOpen) return '';
    const items = enhanceSuggestions();
    if (!items.length) return '';
    const loaded = new Set((state.datasets || []).map((d) => String(d.ticker || '').toUpperCase()));
    return `<div id="enhance-listbox" class="enhance-listbox" role="listbox">${items.map((t, i) => `<button type="button" role="option" data-esug="${esc(t.symbol)}" class="enhance-opt ${i === state.enhanceHighlight ? 'enhance-opt-on' : ''}"><span><span class="font-mono font-semibold">${esc(t.symbol)}</span> <span class="text-gray-500">${esc(t.name || '')}</span></span><span>${loaded.has(t.symbol) ? '✓' : '↓'}</span></button>`).join('')}</div>`;
  }
  function normalizeMonitorMarginPercent(value) {
    const n = Math.round(Number(value));
    return MONITOR_MARGIN_OPTIONS.includes(n) ? n : 100;
  }
  function applyMonitorMarginSimulation(trades, marginPercent) {
    const leverage = Math.max(1, normalizeMonitorMarginPercent(marginPercent) / 100);
    if (leverage === 1) return trades || [];
    return (trades || []).map((trade) => {
      if (trade.status !== 'closed') return trade;
      if (!Number.isFinite(Number(trade.pnlPercent))) return trade;
      const simulatedPnlPct = Math.max(-100, Number(trade.pnlPercent) * leverage);
      const abs = Number(trade.pnlAbsolute);
      return {
        ...trade,
        pnlPercent: simulatedPnlPct,
        pnlAbsolute: Number.isFinite(abs) ? abs * leverage : trade.pnlAbsolute,
      };
    });
  }
  function monitorStats(trades) {
    const closed = visibleMonitorTrades(trades || [], false).filter((t) => t.status === 'closed' && Number.isFinite(Number(t.pnlPercent)));
    const initial = Number(state.settings && state.settings.initialCapital) > 0 ? Number(state.settings.initialCapital) : 10000;
    let bal = initial, peak = initial;
    const equity = [];
    let wins = 0, hold = 0, holdN = 0, grossWinPct = 0, grossLossPct = 0;
    closed.slice().sort((a, b) => String(a.exitDate || a.exitDecisionTime || '').localeCompare(String(b.exitDate || b.exitDecisionTime || ''))).forEach((t) => {
      const pct = Number(t.pnlPercent) || 0;
      bal *= 1 + pct / 100;
      if (bal > peak) peak = bal;
      equity.push({ date: t.exitDate || t.exitDecisionTime || t.entryDate, value: bal, drawdown: peak > 0 ? ((peak - bal) / peak) * 100 : 0 });
      if (pct > 0) { wins++; grossWinPct += pct; }
      else grossLossPct += pct;
      const days = Number(t.holdingDays != null ? t.holdingDays : t.duration);
      if (Number.isFinite(days) && days > 0) { hold += days; holdN += 1; }
    });
    const dd = equity.reduce((m, p) => Math.max(m, p.drawdown || 0), 0);
    const avg = closed.length ? closed.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / closed.length : 0;
    const pf = grossLossPct < 0 ? grossWinPct / Math.abs(grossLossPct) : (grossWinPct > 0 ? Infinity : 0);
    const net = bal - initial;
    return { closed, initial, bal, equity, wins, hold, holdN, net, dd, avg, pf, ret: (bal / initial - 1) * 100 };
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
  function sideItemInner(ico, lab) {
    return `${icon(ico, 'w-5 h-5')}<span class="app-side-lab">${esc(lab)}</span>`;
  }
  function sideNavHTML() {
    return TABS.map((t) => `<a href="${t.to}" data-nav class="app-side-item ${state.page === t.to ? 'app-side-item-on' : ''}" title="${esc(t.label)}">${sideItemInner(t.icon, t.label)}</a>${t.to === '/watches' ? '<div id="app-side-watch" class="app-side-watch"></div>' : ''}`).join('');
  }
  function watchNavItemsHTML() {
    return WATCH_TABS.map((t) => {
      const on = t.id === state.watchTab;
      return `<button type="button" data-wtab="${esc(t.id)}" class="app-side-item app-side-sub ${on ? 'app-side-item-on' : ''}" title="${esc(t.label)}" aria-current="${on ? 'page' : 'false'}">${sideItemInner(t.icon, t.label)}</button>`;
    }).join('');
  }
  function watchMobileTabsHTML() {
    return `<div class="watch-mobile-tabs" role="tablist" aria-label="Разделы мониторинга">${WATCH_TABS.map((t) => {
      const on = t.id === state.watchTab;
      return `<button type="button" data-wtab="${esc(t.id)}" role="tab" aria-selected="${on}" class="watch-mobile-tab ${on ? 'watch-mobile-tab-on' : ''}" title="${esc(t.label)}">${icon(t.icon, 'w-4 h-4')}<span>${esc(t.label)}</span></button>`;
    }).join('')}</div>`;
  }
  function applyNavCollapsed() {
    const slim = !!state.navCollapsed;
    document.querySelector('.app-frame')?.classList.toggle('app-frame-slim', slim);
    const btn = document.getElementById('app-side-toggle');
    if (!btn) return;
    const title = slim ? 'Показать меню' : 'Скрыть меню';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-expanded', slim ? 'false' : 'true');
    btn.innerHTML = `${icon(slim ? 'chevronright' : 'chevronleft', 'w-5 h-5')}<span class="app-side-lab">${slim ? 'Показать' : 'Скрыть'}</span>`;
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
      <div class="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-green-600">${fmtUsd(fv, 0)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div></div>
      <div class="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-blue-600">${fmtPct(m.totalReturn)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-orange-600">${fmtPct(m.cagr)}</div><div class="text-sm text-gray-600 dark:text-gray-400">CAGR</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-purple-600">${fmtPct(m.winRate)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Доля прибыльных</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-red-600">${fmtPct(dd)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-indigo-600">${m.totalTrades ?? 0}</div><div class="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-teal-600">${pf}</div><div class="text-sm text-gray-600 dark:text-gray-400">Профит-фактор</div></div>
    </div>`;
  }
  function tradesTable(trades, opts) {
    opts = opts || {};
    const PAGE_SIZE = 50;
    const all = (trades || []).slice().reverse();
    const showTicker = all.some((t) => tradeTicker(t));
    const showDeposit = all.some((t) => t && t.context && t.context.currentCapitalAfterExit != null);
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil((total || 1) / PAGE_SIZE));
    let page = Number(opts.page);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const list = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const rows = list.map((t, i) => {
      const ctx = t.context || {};
      const invested = toNum(ctx.initialInvestment) ?? ((toNum(t.quantity) || 0) * (toNum(t.entryPrice) || 0) || null);
      const entryIBS = ctx.indicatorValues && ctx.indicatorValues.IBS != null ? ctx.indicatorValues.IBS : (ctx.entryIBS != null ? ctx.entryIBS : t.entryIBS);
      const exitIBS = ctx.indicatorValues && ctx.indicatorValues.exitIBS != null ? ctx.indicatorValues.exitIBS : (ctx.exitIBS != null ? ctx.exitIBS : t.exitIBS);
      const exitIbsNum = toNum(exitIBS);
      const entryIbsNum = toNum(entryIBS);
      const reason = t.exitReason === 'ibs_signal' && exitIbsNum != null
        ? ('IBS ' + fmt((Math.abs(exitIbsNum) <= 1.5 ? exitIbsNum * 100 : exitIbsNum), 1) + '%')
        : (t.exitReason || '');
      const hasEntryProblem = entryIbsNum != null && (Math.abs(entryIbsNum) <= 1.5 ? entryIbsNum : entryIbsNum / 100) > 0.1;
      const hasExitProblem = exitIbsNum != null && (Math.abs(exitIbsNum) <= 1.5 ? exitIbsNum : exitIbsNum / 100) < 0.75;
      const lev = toNum(ctx.leverage);
      const deposit = toNum(ctx.currentCapitalAfterExit);
      const entryIso = t.entryDate || '—';
      const exitIso = t.exitDate || '—';
      const fmtDay = (d) => {
        const s = String(d || '').slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        return m ? (m[3] + '.' + m[2] + '.' + m[1]) : (s || '—');
      };
      const ibsLab = (n) => n == null ? '—' : fmt(Math.abs(n) <= 1.5 ? n * 100 : n, 1) + '%';
      return `<tr>
      <td>${(page - 1) * PAGE_SIZE + i + 1}</td>
      ${showTicker ? `<td class="font-mono">${esc(tradeTicker(t) || '—')}</td>` : ''}
      <td title="${esc(entryIso)} – ${esc(exitIso)}" class="${(hasEntryProblem || hasExitProblem) ? 'bg-orange-50 dark:bg-orange-950/20' : ''}">
        <div>${esc(fmtDay(t.entryDate))} – ${esc(fmtDay(t.exitDate))}</div>
        <div class="text-xs text-gray-500">${esc(ibsLab(entryIbsNum))} – ${esc(ibsLab(exitIbsNum))}</div>
      </td>
      <td>${fmt(t.entryPrice)}</td><td>${fmt(t.exitPrice)}</td>
      <td>${fmt(t.quantity, 4)}</td>
      <td>${invested == null ? '—' : fmtUsd(invested)}${lev != null && lev > 1 ? `<div class="text-xs text-gray-500">${esc(lev)}:1</div>` : ''}</td>
      <td class="${pnlClass(t.pnl)}">${fmtUsd(t.pnl)}</td>
      <td class="${pnlClass(t.pnlPercent)}">${t.pnlPercent == null ? '—' : fmt(t.pnlPercent, 2) + '%'}</td>
      ${showDeposit ? `<td>${deposit == null ? '—' : fmtUsd(deposit)}</td>` : ''}
      <td>${esc(t.duration ?? '')}</td><td>${esc(reason)}</td>
    </tr>`;
    }).join('');
    const cols = 9 + (showTicker ? 1 : 0) + (showDeposit ? 1 : 0);
    const start = total ? ((page - 1) * PAGE_SIZE + 1) : 0;
    const end = Math.min(page * PAGE_SIZE, total);
    const pager = total ? `<div class="pager">
      <span>Показаны ${start}–${end} из ${total}</span>
      <button type="button" data-trades-page="1" class="btn-secondary min-h-0 py-1 px-2" ${page <= 1 ? 'disabled' : ''}>В начало</button>
      <button type="button" data-trades-page="${page - 1}" class="btn-secondary min-h-0 py-1 px-2" ${page <= 1 ? 'disabled' : ''}>Назад</button>
      <button type="button" data-trades-page="${page + 1}" class="btn-secondary min-h-0 py-1 px-2" ${page >= totalPages ? 'disabled' : ''}>Вперёд</button>
      <button type="button" data-trades-page="${totalPages}" class="btn-secondary min-h-0 py-1 px-2" ${page >= totalPages ? 'disabled' : ''}>В конец</button>
      <button type="button" data-export-trades class="btn-secondary min-h-0 py-1 px-2">Скачать JSON</button>
    </div>` : '';
    return `<div id="trades-table-host" data-trades-total="${total}">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2 text-sm text-gray-600 dark:text-gray-300"><div>Всего сделок: ${total}</div></div>
      <div class="table-wrap rounded border dark:border-gray-800"><table class="trades"><thead><tr><th>#</th>${showTicker ? '<th>Тикер</th>' : ''}<th>Дата входа-выхода</th><th>Цена входа</th><th>Цена выхода</th><th>Кол-во</th><th>Вложено</th><th>PnL, $</th><th>PnL, %</th>${showDeposit ? '<th>Депозит, $</th>' : ''}<th>Дней</th><th>Причина</th></tr></thead><tbody>${rows || `<tr><td colspan="${cols}">Нет сделок</td></tr>`}</tbody></table></div>
      ${pager}
    </div>`;
  }
  function monitorTradesTable(trades) {
    const filter = state.watchTradeFilter || 'all';
    const includeHidden = !!state.watchShowHidden;
    let list = visibleMonitorTrades(trades || [], includeHidden).filter((t) => {
      if (filter === 'open') return t.status === 'open';
      if (filter === 'closed') return t.status === 'closed';
      if (filter === 'win') return t.status === 'closed' && Number(t.pnlPercent) > 0;
      if (filter === 'loss') return t.status === 'closed' && Number(t.pnlPercent) < 0;
      return true;
    });
    list = list.slice().sort((a, b) => {
      const ao = a.status === 'open' ? 0 : 1;
      const bo = b.status === 'open' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(b.exitDate || b.entryDate || '').localeCompare(String(a.exitDate || a.entryDate || ''));
    });
    const rows = list.map((t) => {
      const pnl = t.status === 'closed' ? (toNum(t.pnlAbsolute) ?? toNum(t.pnl)) : null;
      const pct = t.status === 'closed' ? toNum(t.pnlPercent) : null;
      const ibs = [t.entryIBS, t.exitIBS].map((v) => v == null ? '—' : fmt((Number(v) <= 1.5 ? Number(v) * 100 : Number(v)), 1) + '%').join(' → ');
      return `<tr class="${t.isHidden ? 'opacity-50' : ''}">
        <td class="font-mono">${esc(t.symbol || t.ticker || '—')}</td>
        <td>${esc(t.status === 'open' ? 'открыта' : 'закрыта')}${t.isTest ? ' · test' : ''}</td>
        <td title="${esc(t.entryDate || '')} – ${esc(t.exitDate || '')}">${esc(fmtTradingDate(t.entryDate))} – ${esc(fmtTradingDate(t.exitDate))}</td>
        <td>${t.entryPrice == null ? '—' : fmtUsd(t.entryPrice)}</td>
        <td>${t.exitPrice == null ? '—' : fmtUsd(t.exitPrice)}</td>
        <td>${esc(ibs)}</td>
        <td class="${pnlClass(pct)}">${pct == null ? '—' : fmtSignedPct(pct, 2)} ${pnl == null ? '' : '(' + fmtSignedUsd(pnl) + ')'}</td>
        <td>${t.status === 'open' && t.id && !t.linkedBrokerTradeId ? `<button type="button" data-close-mon="${esc(t.id)}" data-close-sym="${esc(t.symbol || '')}" class="text-sm text-red-600 mr-2">Закрыть</button>` : ''}${t.id ? `<button type="button" data-edit-mon="${esc(t.id)}" class="text-sm text-indigo-600">Изменить</button>` : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="flex flex-wrap gap-2 mb-2 text-sm">
      ${[['all', 'Все'], ['open', 'Открытые'], ['closed', 'Закрытые'], ['win', 'Прибыль'], ['loss', 'Убыток']].map(([id, lab]) => `<button type="button" data-wfilter="${id}" class="px-2 py-1 rounded border ${filter === id ? 'border-indigo-500 text-indigo-600' : 'border-gray-200 text-gray-600'}">${lab}</button>`).join('')}
      <button type="button" id="watch-hidden-toggle" class="px-2 py-1 rounded border">${includeHidden ? 'Скрыть скрытые' : 'Показать скрытые'}</button>
      <button type="button" id="watch-export-json" class="px-2 py-1 rounded border">JSON</button>
      <button type="button" id="watch-export-csv" class="px-2 py-1 rounded border">CSV</button>
      <span class="text-xs text-gray-500 self-center">${list.length} сделок</span>
    </div>
    <div class="table-wrap rounded border dark:border-gray-800"><table class="trades"><thead><tr><th>Тикер</th><th>Статус</th><th>Период</th><th>Вход</th><th>Выход</th><th>IBS</th><th>PnL</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="text-center text-gray-500">Нет сделок</td></tr>'}</tbody></table></div>`;
  }
  function overlay() {
    let html = '';
    if (state.confirm) {
      html += `<div class="modal-backdrop" id="confirm-box"><div class="modal-card">
        <h3 class="text-lg font-semibold mb-2">${esc(state.confirm.title || 'Подтверждение')}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${esc(state.confirm.message || '')}</p>
        <div class="flex justify-end gap-2"><button id="confirm-no" class="btn-secondary">Отмена</button><button id="confirm-yes" class="btn-danger">${esc(state.confirm.okLabel || 'Удалить')}</button></div>
      </div></div>`;
    }
    if (state.modal) html += state.modal;
    if (state.toast) html += `<div class="toast">${esc(state.toast)}</div>`;
    if (state.errorConsoleOpen) {
      const rows = (state.clientErrors || []).slice().reverse().map((e) => `<div class="border-b border-gray-100 dark:border-gray-800 py-1"><div class="text-[10px] text-gray-500">${esc(formatDateTimeET(e.ts))}</div><div class="text-xs">${esc(e.message)}</div>${e.extra ? `<pre class="text-[10px] whitespace-pre-wrap">${esc(e.extra)}</pre>` : ''}</div>`).join('') || '<p class="text-sm text-gray-500">Ошибок нет</p>';
      html += `<div class="error-console" id="error-console">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="text-sm font-semibold">Журнал ошибок</div>
          <div class="flex gap-2">
            <button type="button" id="err-copy" class="btn-secondary min-h-0 py-1 px-2 text-xs">Копировать</button>
            <button type="button" id="err-clear" class="btn-secondary min-h-0 py-1 px-2 text-xs">Очистить</button>
            <button type="button" id="err-close" class="btn-secondary min-h-0 py-1 px-2 text-xs">Закрыть</button>
          </div>
        </div>
        ${rows}
      </div>`;
    }
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
    if (state.user) {
      API.authCheck().then(() => {}).catch((e) => {
        if (e && e.status === 401) handleUnauthorized();
      });
    }
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
            <button type="button" id="err-log-btn" class="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
              Показать ошибки
              <span id="err-log-count" class="rounded-full bg-red-600 text-white px-1.5 ${state.clientErrors.length ? '' : 'hidden'}">${state.clientErrors.length > 99 ? '99+' : state.clientErrors.length}</span>
            </button>
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
    const slim = !!state.navCollapsed;
    const toggleTitle = slim ? 'Показать меню' : 'Скрыть меню';
    const bottom = BOTTOM.map((t) => {
      const on = state.page === t.to;
      return `<a href="${t.to}" data-nav class="flex flex-col items-center justify-center gap-1 py-2 text-xs ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}" aria-label="${t.label}">
        <div class="bn-icon ${on ? 'active' : ''}">${icon(t.icon, 'w-6 h-6')}</div>
        <span class="font-medium">${t.label}</span>
      </a>`;
    }).join('');
    return `
      <a href="#main-content" class="sr-only">Перейти к основному содержимому</a>
      <div class="app-frame ${slim ? 'app-frame-slim' : ''} min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100">
        <aside class="app-side" aria-label="Основная навигация">
          <a href="/data" data-nav class="app-side-brand" title="IBS Trading Strategy">${logo('sm')}<span class="app-side-lab">IBS Trading</span></a>
          <nav class="app-side-nav desktop-nav">${sideNavHTML()}</nav>
          <div class="app-side-tools">
            <button type="button" id="theme-btn" class="app-side-item" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${sideItemInner(themeIcon(), 'Тема')}</button>
            <a href="/settings" data-nav id="settings-btn" class="app-side-item ${state.page === '/settings' ? 'app-side-item-on' : ''}" title="Настройки" aria-label="Настройки">${sideItemInner('settings', 'Настройки')}</a>
            <button type="button" id="logout-btn" class="app-side-item" title="Выйти" aria-label="Выйти">${sideItemInner('logout', 'Выйти')}</button>
          </div>
          <button type="button" id="app-side-toggle" class="app-side-toggle" title="${toggleTitle}" aria-label="${toggleTitle}" aria-expanded="${slim ? 'false' : 'true'}">${icon(slim ? 'chevronright' : 'chevronleft', 'w-5 h-5')}<span class="app-side-lab">${slim ? 'Показать' : 'Скрыть'}</span></button>
        </aside>
        <div class="app-main">
          <header class="app-top border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <a href="/data" data-nav class="flex min-w-0 items-center gap-3 hover:opacity-80">
                ${logo('sm')}
                <span class="truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">IBS Trading Strategy</span>
              </a>
              <div class="flex items-center gap-2">
                <button type="button" id="theme-btn-top" class="icon-btn icon-btn-lg icon-btn-glass" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${icon(themeIcon())}</button>
                <button id="menu-btn" class="icon-btn icon-btn-lg icon-btn-glass" title="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-label="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-expanded="${state.mobileOpen}">${icon(state.mobileOpen ? 'x' : 'menu')}</button>
              </div>
            </div>
            <div id="mobile-drawer" class="${state.mobileOpen ? '' : 'hidden'} border-t border-gray-200 dark:border-gray-700 bg-white/95 backdrop-blur-sm dark:bg-slate-900/95"></div>
          </header>
          <main id="main-content" class="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-32 md:pb-24 safe-area-pb">
            <div id="error-banner" class="error-banner ${state.errorBanner ? '' : 'hidden'}"><div class="flex items-start justify-between gap-2"><span data-err-text>${esc(state.errorBanner || '')}</span><button type="button" id="err-banner-close" class="text-sm">✕</button></div></div>
            <div id="page-root"></div>
          </main>
          <nav class="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 grid grid-cols-5 items-center h-16" role="navigation" aria-label="Основная навигация">${bottom}</nav>
          ${footerHTML(state.apiBuildId)}
        </div>
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
    const tagCount = (name) => state.datasets.filter((d) => (d.tag || '').split(',').map((x) => x.trim()).includes(name)).length;
    const filters = [`<button data-tag="all" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === 'all' ? 'bg-blue-100 text-blue-800 border-2 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200' : 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200'}">Все (${state.datasets.length})</button>`]
      .concat([...tags].sort().map((t) => `<button data-tag="${esc(t)}" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === t ? 'bg-blue-100 text-blue-800 border-2 border-blue-200' : 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-200'}">${esc(t)} (${tagCount(t)})</button>`)).join('');
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
            ${datasetCompany(d) ? `<div class="text-xs text-gray-500 truncate mt-0.5">${esc(datasetCompany(d))}</div>` : ''}
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
        <div>
          <div class="flex items-center gap-2"><div class="font-semibold font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">${esc(d.ticker)}</div>${datasetCompany(d) ? `<span class="text-xs text-gray-500">${esc(datasetCompany(d))}</span>` : ''}${state.ticker === d.ticker ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">Выбран</span>' : ''}</div>
          <div class="text-xs text-gray-500">${d.dataPoints || 0} баров · ${esc(fmtTradingDate(d.dateRange?.from))} — ${esc(fmtTradingDate(d.dateRange?.to))}${d.uploadDate ? ' · Сохранён: ' + esc(fmtTradingDate(d.uploadDate)) : ''}</div>
          ${(d.tag || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="inline-block mr-1 mt-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded dark:bg-gray-800">${esc(t)}</span>`).join('')}
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="/stocks?tickers=${encodeURIComponent(d.ticker)}" data-load="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white">Открыть</a>
          <button data-edit="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm border">Изменить</button>
          <button data-refresh="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm border">Обновить</button>
          <button data-export="${esc(d.ticker)}" class="px-3 py-1.5 rounded text-sm border">Экспорт</button>
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
        ${state.datasetsError ? `<div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30">Ошибка загрузки: ${esc(state.datasetsError)}</div>` : ''}
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5">${state.serverStatus === 'offline'
            ? '<div class="w-2 h-2 bg-red-500 rounded-full"></div><span class="text-xs text-red-600 font-medium">Offline</span>'
            : (state.serverStatus === 'checking'
              ? '<div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div><span class="text-xs text-gray-500 font-medium">Проверяем…</span>'
              : '<div class="w-2 h-2 bg-green-500 rounded-full"></div><span class="text-xs text-green-600 font-medium">Online</span>')}</div>
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button id="view-list" class="p-1.5 rounded ${state.dataView === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Список" aria-label="Переключить на режим списка">${icon('list', 'w-4 h-4')}</button>
            <button id="view-grid" class="p-1.5 rounded ${state.dataView === 'compact' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Компактный вид" aria-label="Переключить на компактный вид">${icon('grid', 'w-4 h-4')}</button>
          </div>
        </div>
        <div class="mb-3"><div class="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Фильтр</div><div class="flex flex-wrap gap-2">${filters}</div></div>
        ${state.dataTag !== 'all' && !filtered.length ? `<div class="rounded-lg border border-dashed p-4 text-sm text-gray-500 mb-3">Нет датасетов с тегом «${esc(state.dataTag)}»</div>` : ''}
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
      ${pageHeader('Новые данные', 'Загрузка исторических данных из API', `<div class="flex items-center gap-2"><a href="/settings" data-nav data-settings-tab="api" class="icon-btn icon-btn-md icon-btn-glass" title="Настройки провайдера" aria-label="Настройки провайдера">${icon('settings', 'w-4 h-4')}</a><div class="rounded-lg border px-3 py-2 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"><div class="text-gray-500">Провайдер данных</div><div class="font-semibold">${esc(providerLabel(prov))}</div></div></div>`)}
      <div class="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
        <div class="enhance-toolbar">
          <div class="enhance-toolbar-main">
            <label for="enhance-q" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Тикер</label>
            <form id="enhance-form" class="enhance-form">
              <input type="hidden" name="provider" value="${esc(prov)}" />
              <div class="enhance-search">
                ${icon('search', 'search-glyph')}
                <input name="symbol" id="enhance-q" value="${esc(state.enhanceQuery)}" class="enhance-input" placeholder="AAPL" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="${state.enhanceListOpen ? 'true' : 'false'}" />
                ${enhanceListboxHTML()}
              </div>
              <div class="enhance-actions">
                <button type="submit" class="enhance-load" ${state.enhanceQuery.trim() && !state.enhanceLoadingSymbol ? '' : 'disabled'} title="Загрузить данные">${icon('download', 'w-4 h-4')}<span class="enhance-load-label">${state.enhanceLoadingSymbol ? 'Загрузка…' : 'Загрузить'}</span></button>
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

  function priceChartPanelHTML(chartId) {
    const p = state.priceChart || {};
    const ui = state.priceChartUi || {};
    const tickers = parseTickers(pageTickerText());
    const selected = selectedHeroTicker();
    const styleOf = (target) => {
      if (target === 'ema20') return { color: p.ema20Color || '#2563EB', width: p.ema20Width || 2, style: p.ema20Style || 0 };
      if (target === 'ema200') return { color: p.ema200Color || '#F59E0B', width: p.ema200Width || 2, style: p.ema200Style || 0 };
      const b = (p.bands || []).find((x) => x.id === target);
      return { color: (b && b.color) || '#64748B', width: (b && b.width) || 1, style: (b && b.style) != null ? b.style : 2 };
    };
    const styleStrip = (target) => {
      const o = styleOf(target);
      const open = ui.styleFor === target;
      return `<div class="pc-style ${open ? 'is-open' : ''}" data-pc-style-panel="${esc(target)}">
        <div class="pc-swatches">${PC_COLORS.map((c) => `<button type="button" data-pc-color="${esc(target)}" data-color="${c}" class="pc-swatch ${o.color === c ? 'pc-swatch-on' : ''}" style="background:${c}" title="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div>
        <div class="pc-seg" role="group" aria-label="Толщина">${[1, 2, 3, 4].map((w) => `<button type="button" data-pc-width="${esc(target)}" data-w="${w}" class="${Number(o.width) === w ? 'pc-seg-on' : 'pc-seg-off'}">${w}</button>`).join('')}</div>
        <div class="pc-seg" role="group" aria-label="Тип линии">${PC_LINE_STYLES.map((s) => `<button type="button" data-pc-ls="${esc(target)}" data-s="${s.v}" class="${Number(o.style) === s.v ? 'pc-seg-on' : 'pc-seg-off'}">${s.l}</button>`).join('')}</div>
      </div>`;
    };
    const styleBtn = (target) => `<button type="button" data-pc-style="${esc(target)}" class="icon-btn icon-btn-md ${ui.styleFor === target ? 'icon-btn-active' : ''}" title="Оформление линии" aria-label="Оформление линии">${icon('sliders', 'h-3.5 w-3.5')}</button>`;
    const lineRow = (id, lab, on, target, extra) => {
      const o = styleOf(target);
      return `<div>
        <div class="pc-row">
          <label><input type="checkbox" data-pc="${id}" ${on ? 'checked' : ''} /> <span class="pc-dot" data-pc-dot="${esc(target)}" style="background:${esc(o.color)}"></span> ${lab}</label>
          ${styleBtn(target)}
        </div>
        ${styleStrip(target)}
        ${extra || ''}
      </div>`;
    };
    const bandRows = (p.bands || []).map((b) => {
      const o = styleOf(b.id);
      const core = PC_CORE_BANDS.indexOf(b.id) >= 0;
      return `<div>
        <div class="pc-row pc-row-indent">
          <label><input type="checkbox" data-pc-band-on="${esc(b.id)}" ${b.enabled ? 'checked' : ''} /> <span class="pc-dot" data-pc-dot="${esc(b.id)}" style="background:${esc(o.color)}"></span> <span data-pc-band-lab="${esc(b.id)}">${esc(formatBandLabel(b.pct))}</span></label>
          <input type="number" step="1" class="pc-pct" data-pc-band-pct="${esc(b.id)}" value="${esc(b.pct)}" aria-label="Отклонение, %" />
          ${styleBtn(b.id)}
          ${core ? '' : `<button type="button" data-pc-band-del="${esc(b.id)}" class="icon-btn icon-btn-md" title="Удалить отклонение" aria-label="Удалить отклонение">${icon('trash', 'h-3.5 w-3.5')}</button>`}
        </div>
        ${styleStrip(b.id)}
      </div>`;
    }).join('');
    const tickerMenu = tickers.length > 1
      ? `<div class="pc-drop ${ui.tickerOpen ? '' : 'hidden'}" data-pc-ticker-menu>${tickers.map((t) => `<button type="button" data-pc-ticker="${esc(t)}" class="${t === selected ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`
      : '';
    const ranges = HERO_RANGES.map((r) => {
      const on = (p.range || 'MAX') === r;
      return `<button type="button" data-pc-range="${r}" class="hero-range ${on ? 'hero-range-on' : 'hero-range-off'}">${r === 'MAX' ? 'Всё' : r}</button>`;
    }).join('');
    const fsOn = !!ui.fullscreen;
    return `<div class="pc-shell ${fsOn ? 'pc-fs' : ''}" data-pc-shell>
      <div class="pc-toolbar">
        <div class="pc-ticker">
          <button type="button" class="pc-ticker-btn" ${tickers.length > 1 ? 'data-pc-ticker-toggle' : ''} aria-haspopup="${tickers.length > 1 ? 'listbox' : 'false'}" aria-label="Тикер">${esc(selected || '—')}${tickers.length > 1 ? icon('chevrondown', 'w-3.5 h-3.5') : ''}</button>
          ${tickerMenu}
        </div>
        <div class="pc-toolbar-right">
          <div class="flex items-center gap-1" role="group" aria-label="Период">${ranges}</div>
          <button type="button" data-pc-ind class="pc-ind-btn ${ui.indOpen ? 'pc-ind-btn-on' : ''}" aria-expanded="${ui.indOpen ? 'true' : 'false'}" aria-controls="pc-ind-panel">Индикаторы ${icon('chevrondown', 'w-3.5 h-3.5')}</button>
          <button type="button" data-pc-fs class="icon-btn icon-btn-md icon-btn-glass" title="${fsOn ? 'Свернуть' : 'Во весь экран'}" aria-label="${fsOn ? 'Свернуть' : 'Во весь экран'}">${icon(fsOn ? 'minimize' : 'maximize', 'h-4 w-4')}</button>
        </div>
      </div>
      <div id="pc-ind-panel" class="pc-ind-panel ${ui.indOpen ? '' : 'hidden'}" data-pc-ind-panel>
        ${lineRow('ema20', 'EMA 20', p.ema20 !== false, 'ema20')}
        ${lineRow('ema200', 'EMA 200', p.ema200 !== false, 'ema200', bandRows + `<button type="button" data-pc-band-add class="pc-add">+ Добавить отклонение</button>`)}
        <div class="pc-row"><label><input type="checkbox" data-pc="ibs" ${p.ibs !== false ? 'checked' : ''} /> IBS</label></div>
        <div class="pc-row"><label><input type="checkbox" data-pc="volume" ${p.volume !== false ? 'checked' : ''} /> Объём</label></div>
        <div class="pc-row"><label><input type="checkbox" data-pc="splits" ${p.splits !== false ? 'checked' : ''} /> Сплиты</label></div>
        <div class="pc-row"><label><input type="checkbox" data-pc="trades" ${p.trades !== false ? 'checked' : ''} /> Сделки</label></div>
        <div class="pc-ind-foot"><button type="button" data-pc-csv class="btn-secondary min-h-0 py-1 px-2 text-xs">CSV</button></div>
      </div>
      <div id="${esc(chartId)}" class="chart-box-lg rounded border dark:border-gray-800"></div>
    </div>`;
  }
  function nestedBacHTML() {
    const f = state.nested.bac;
    return `<form id="bac-form" class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-xs">lowIBS<input name="lowIBS" type="number" step="0.01" min="0" max="1" value="${esc(f.lowIBS)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">highIBS<input name="highIBS" type="number" step="0.01" min="0" max="1" value="${esc(f.highIBS)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Макс. дни<input name="maxHoldDays" type="number" min="1" value="${esc(f.maxHoldDays)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Маржа, %<input name="marginPct" type="number" min="1" value="${esc(f.marginPct)}" class="field mt-1 w-24" /></label>
      <button class="btn-primary min-h-0 py-2">Посчитать</button>
    </form><div id="bac-out">Buy at close…</div>`;
  }
  function nestedBac4HTML() {
    const f = state.nested.bac4;
    return `<form id="bac4-form" class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-xs flex-1 min-w-[12rem]">Тикеры<input name="tickers" value="${esc(f.tickers)}" class="field mt-1 w-full" /></label>
      <label class="text-xs">Плечо, %<input name="leverage" type="range" min="100" max="300" step="25" value="${esc(f.leverage)}" class="mt-2 w-40" /><span id="bac4-lev-lab" class="ml-1">${esc(f.leverage)}%</span></label>
      <button class="btn-primary min-h-0 py-2">Посчитать</button>
    </form><div id="bac4-out">Buy at close 4…</div>`;
  }
  function nestedNslHTML() {
    const f = state.nested.nsl;
    return `<form id="nsl-form" class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-xs">Режим выхода<select name="exitMode" class="field mt-1">
        <option value="never" ${f.exitMode === 'never' ? 'selected' : ''}>Никогда (держать до конца)</option>
        <option value="ibs-only" ${f.exitMode === 'ibs-only' ? 'selected' : ''}>Только по IBS</option>
        <option value="time-limit" ${f.exitMode === 'time-limit' ? 'selected' : ''}>По времени или IBS</option>
        <option value="profit-target" ${f.exitMode === 'profit-target' ? 'selected' : ''}>По профиту или IBS</option>
      </select></label>
      <label class="text-xs">Макс. дни<input name="maxHoldDays" type="number" value="${esc(f.maxHoldDays)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Цель, %<input name="profitTarget" type="number" value="${esc(f.profitTarget)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Плечо, %<input name="leverage" type="number" step="10" min="10" max="500" value="${esc(f.leverage)}" class="field mt-1 w-24" /></label>
      <label class="text-xs inline-flex items-center gap-1"><input type="checkbox" name="requireProfitableExit" ${f.requireProfitableExit ? 'checked' : ''} /> выход по IBS только при профите</label>
      <button class="btn-primary min-h-0 py-2">Посчитать</button>
    </form><div id="nsl-out">Без стоп-лосса…</div>`;
  }
  function nestedOptHTML() {
    const f = state.nested.opt;
    return `<form id="nested-opt-form" class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-xs">Страйк, %<input name="strikePct" type="number" value="${esc(f.strikePct)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">IV adj, %<input name="volAdjPct" type="number" value="${esc(f.volAdjPct)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Капитал, %<input name="capitalPct" type="number" value="${esc(f.capitalPct)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Экспирация, нед.<input name="expirationWeeks" type="number" value="${esc(f.expirationWeeks)}" class="field mt-1 w-24" /></label>
      <label class="text-xs">Макс. дни<input name="maxHoldingDays" type="number" value="${esc(f.maxHoldingDays)}" class="field mt-1 w-24" /></label>
      <button class="btn-primary min-h-0 py-2">Посчитать</button>
    </form><div id="opt-out">Опционы…</div>`;
  }
  function nestedMcHTML() {
    const f = state.nested.mc;
    return `<form id="mc-form" class="flex flex-wrap items-end gap-2 mb-3"><label class="text-xs">Сумма<input name="amount" type="number" value="${esc(f.amount)}" class="field mt-1 w-28" /></label><label class="text-xs">День<input name="day" type="number" value="${esc(f.day)}" class="field mt-1 w-20" /></label><button class="btn-primary">Посчитать</button></form><div id="mc-out"></div>`;
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
      } else if (state.stockTab === 'price') body = priceChartPanelHTML('chart-price');
      else if (state.stockTab === 'tickerCharts') body = `<div id="ticker-charts" class="grid md:grid-cols-2 gap-3"></div>`;
      else if (state.stockTab === 'equity') body = `${(state.leverage || 200) > 100 ? comparisonPanel(r, state.baselineResult) : ''}<div id="chart-eq" class="chart-box mt-4 rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'exposure') body = `<div class="text-xs text-gray-500 mb-1" id="exp-avg"></div><div id="chart-exp" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'drawdown') body = `<div id="dd-stats" class="mb-3"></div><div id="chart-dd" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'openDayDrawdown') body = `<div id="odd-out"></div>`;
      else if (state.stockTab === 'trades') body = `${(state.leverage || 200) > 100 ? comparisonPanel(r, state.baselineResult) : ''}${tradesTable(r.trades, { page: state.tradesPage })}`;
      else if (state.stockTab === 'profit') body = `${(state.leverage || 200) > 100 ? comparisonPanel(r, state.baselineResult) : ''}${profitBody(r)}`;
      else if (state.stockTab === 'duration') body = `${(state.leverage || 200) > 100 ? comparisonPanel(r, state.baselineResult) : ''}${durationBody(r)}`;
      else if (state.stockTab === 'monthlyContribution') body = nestedMcHTML();
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm"></div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">
        <form id="bh-lev-form" class="flex flex-wrap items-end gap-3 mb-3">
          <label class="text-xs">Маржинальность, %<input name="pct" type="number" min="1" step="1" value="100" class="field mt-1 w-40" /></label>
          <button class="btn-primary">Посчитать</button>
          <span id="bh-lev-now" class="text-xs text-gray-500 pb-2">Текущее плечо: ×1.00</span>
        </form>
        <div id="chart-bh" class="chart-box-lg rounded border dark:border-gray-800"></div>
      </div>`;
      else if (state.stockTab === 'buyAtClose') body = nestedBacHTML();
      else if (state.stockTab === 'buyAtClose4') body = nestedBac4HTML();
      else if (state.stockTab === 'noStopLoss') body = nestedNslHTML();
      else if (state.stockTab === 'options') body = nestedOptHTML();
    }
    return `
      ${pageHeader('Акции', 'Бэктест стратегии на нескольких активах')}
      ${err}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      ${r && (state.leverage || 200) > 100 && state.stockTab === 'summary' ? `<div class="mt-3">${comparisonPanel(r, state.baselineResult)}</div>` : ''}
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
        ${state.emaResult && state.emaRunParams && JSON.stringify({ form: state.emaForm, tickers: state.emaTickers }) !== JSON.stringify(state.emaRunParams.snap) ? '<p class="text-xs text-amber-700 mt-2">Параметры изменены — обновите расчёт</p>' : ''}
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
        <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">${emaFormHTML()}${compactMetricsHTML(r)}</aside>
      </div>`;
    } else {
      const bodies = {
        price: priceChartPanelHTML('chart-ema-price'),
        emaDeviation: '<div id="chart-ema-dev" class="chart-box-lg rounded border dark:border-gray-800"></div><div class="mt-2 text-xs text-gray-500">Зелёные/красные линии — зоны покупки/продажи. Маркеры — сделки.</div>',
        equity: '<div id="chart-ema-eq" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        exposure: '<div id="chart-ema-exp" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        drawdown: '<div id="chart-ema-dd" class="chart-box-lg rounded border dark:border-gray-800"></div>',
        trades: tradesTable(r.trades),
        profit: profitBody(r),
        duration: durationBody(r),
        spreads: spreadsTable(((state.emaRunParams && state.emaRunParams.buyZones) || state.emaForm.buyZones || []).filter((z) => z.enabled).map((z) => z.levelPct), ((state.emaRunParams && state.emaRunParams.sellZones) || state.emaForm.sellZones || []).filter((z) => z.enabled).map((z) => z.levelPct)),
      };
      main = `<div class="p-4">${bodies[tab] || ''}</div>`;
    }
    return `
      ${pageHeader('EMA', 'Симулятор торговли по отклонению цены от EMA')}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      ${r && state.emaBaseline && Number(state.emaForm.leverage) > 100 ? `<div class="mt-3">${comparisonPanel(r, state.emaBaseline)}</div>` : ''}
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
        <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>${tickerInput('opt-tickers', state.optTickers)}
          <button type="button" id="reset-opt-tickers" class="mt-1.5 w-full rounded-lg border border-dashed border-gray-300 px-2 py-1 text-left text-[11px] text-gray-500 hover:border-indigo-400">↩ AAPL, MSFT, AMZN, MAGS</button>
        </div>
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
        price: priceChartPanelHTML('chart-opt-price'),
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
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
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
      ${pageHeader('Календарь торгов', state.cal.data?.metadata?.webullCoverageThrough ? ('NYSE · данные по ' + state.cal.data.metadata.webullCoverageThrough) : 'NYSE · Американский рынок акций', `<button id="cal-webull" class="btn-secondary min-h-0 py-2 px-4">Импорт из Webull</button>`)}
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>Торговый · ${esc(hours.start)}–${esc(hours.end)}</span>
        <span class="flex items-center gap-1.5">${icon('calendar', 'w-3.5 h-3.5')} Выходной (Сб, Вс)</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Раннее закрытие · до ${esc((state.cal.data?.tradingHours?.short?.end) || '13:00')}</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Праздник · биржа закрыта</span>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 p-3">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <button id="cal-prev" class="icon-btn icon-btn-md icon-btn-glass" title="Предыдущий месяц" aria-label="Предыдущий месяц">‹</button>
            <div class="font-semibold">${months[m]} ${y}</div>
            <button id="cal-next" class="icon-btn icon-btn-md icon-btn-glass" title="Следующий месяц" aria-label="Следующий месяц">›</button>
            <select id="cal-year" class="field">${(Array.isArray(state.cal.data?.metadata?.years) && state.cal.data.metadata.years.length ? state.cal.data.metadata.years : [y - 1, y, y + 1]).map((yy) => `<option ${Number(yy) === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
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
      const rows = Object.entries(map).map(([ticker, evs]) => `<tr>
        <td class="font-mono align-top">${esc(ticker)}</td>
        <td>${(evs || []).map((e) => `${esc(e.date)} × ${esc(e.factor)}`).join('<br>') || '—'}</td>
        <td class="text-right whitespace-nowrap">
          <button data-edit-split="${esc(ticker)}" class="text-indigo-600 text-sm mr-2">Изменить</button>
          <button data-del-ticker="${esc(ticker)}" class="text-red-600 text-sm">Удалить тикер</button>
        </td>
      </tr>`).join('');
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
        <p class="text-xs text-gray-500 mb-2">Формат 1: карта <code>{"AAPL":[{"date":"2020-08-31","factor":4}]}</code>. Формат 2: Один тикер <code>{"symbol":"AAPL","events":[...]}</code>.</p>
        <p class="text-xs mb-2"><a href="https://seekingalpha.com/symbol/${esc((state.ticker || 'AAPL'))}/splits" target="_blank" rel="noopener" class="text-indigo-600">Посмотреть сплиты на Seeking Alpha</a></p>
        <textarea id="split-import" class="field h-40 font-mono text-xs" placeholder='{"symbol":"AAPL","events":[{"date":"2020-08-31","factor":4}]}'></textarea>
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
      ${pageHeader('Сплиты', 'Управление дроблениями акций', `<div class="flex flex-wrap items-center gap-2">
        <select id="split-apply-ticker" class="field py-1">${(state.datasets || []).map((d) => `<option value="${esc(d.ticker)}" ${state.splitApplyTicker === d.ticker ? 'selected' : ''}>${esc(d.ticker)}</option>`).join('') || '<option value="">нет датасетов</option>'}</select>
        <button id="split-apply" class="btn-primary min-h-0 py-2 px-3">Пересчитать датасет</button>
        <button id="splits-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список сплитов" aria-label="Обновить список сплитов">${icon('refresh', 'w-4 h-4')}</button>
      </div>`)}
      ${analysisTabs(SPLITS_TABS, state.splitsTab, 'data-sptab')}
      <div class="mt-6">${body}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 border-t pt-4 mt-6">Изменения сохраняются в базе данных</div>`;
  }

  function pageWatches() {
    const cons = state.consistency || {};
    const issues = Array.isArray(cons.issues) ? cons.issues : [];
    const actions = Array.isArray(cons.proposedActions) ? cons.proposedActions : [];
    const consOk = !!state.consistency && issues.length === 0;
    const consKind = !state.consistency ? '…' : (actions.some((a) => a && a.autoApplicable) ? 'Reconcile Candidate' : (issues.length ? 'Mismatch' : 'OK'));
    const consLabel = consKind;
    const consBadgeCls = consKind === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : (consKind === 'Mismatch' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800');
    const consCards = issues.map((i) => `<div class="rounded-lg border px-3 py-2 text-sm mb-1">${esc(i.message || i.code || '')}</div>`).join('');
    const consText = !state.consistency
      ? 'Проверка согласованности…'
      : (consOk ? 'Monitor и broker журналы сейчас согласованы.' : (consCards || 'Monitor и broker журналы расходятся.'));

    const simulated = applyMonitorMarginSimulation(state.monitorTrades, state.monitorMarginPercent);
    const stats = monitorStats(simulated);
    const rows = (state.watches || []).map((w) => `<tr>
      <td class="font-mono"><a href="/stocks?tickers=${encodeURIComponent(w.symbol)}" data-nav class="text-blue-600">${esc(w.symbol)}</a></td>
      <td>≤ ${(w.lowIBS ?? 0.1).toFixed(2)}</td>
      <td>≥ ${Number(w.highIBS ?? 0.75).toFixed(2)}</td>
      <td>${w.entryPrice != null ? '$' + Number(w.entryPrice).toFixed(2) : '—'}${w.isOpenPosition && w.entryDate ? `<div class="text-[11px] text-gray-500">${esc(fmtTradingDate(w.entryDate))}${w.entryIBS != null ? ' · IBS ' + fmt(ibsPct(w.entryIBS), 1) + '%' : ''}</div>` : ''}</td>
      <td><span class="rounded-full px-2 py-0.5 text-xs ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}">${w.isOpenPosition ? 'Открыта' : 'Нет'}</span></td>
      <td>${w.isOpenPosition && w.currentTradeId ? `<button type="button" data-close-mon="${esc(w.currentTradeId)}" data-close-sym="${esc(w.symbol)}" class="text-sm text-red-600 mr-2">Закрыть</button>` : ''}<button data-dw="${esc(w.symbol)}" class="text-sm text-red-600">Удалить</button></td>
    </tr>`).join('');
    const alerts = (state.emaAlerts || []).map((a) => `<tr>
      <td class="font-mono">${esc(a.symbol)}</td><td>EMA ${esc(a.emaPeriod || 200)}</td>
      <td>${esc(a.buyLevelPct)} / ${esc(a.sellLevelPct)}</td>
      <td>${esc(a.nextAction === 'sell' ? 'продажу' : 'покупку')}${a.thresholdPct != null ? `<div class="text-[11px] text-gray-500">Близость ${esc(a.thresholdPct)}%</div>` : ''}${a.infoLevelPct != null ? `<div class="text-[11px] text-gray-500">Инфо ${esc(a.infoLevelPct)}%</div>` : ''}</td>
      <td>
        <button type="button" data-ema-on="${esc(a.id)}" class="text-sm mr-2">${a.enabled === false ? 'Выключено' : 'Включено'}</button>
        <button type="button" data-ema-act="${esc(a.id)}" data-ema-next="buy" class="text-sm mr-1">Ждать покупку</button>
        <button type="button" data-ema-act="${esc(a.id)}" data-ema-next="sell" class="text-sm mr-2">Ждать продажу</button>
        <button data-dea="${esc(a.id)}" class="text-red-600 text-sm">Удалить</button>
      </td>
    </tr>`).join('');
    const thr = state.settings.watchThresholdPct ?? 0.3;
    const pfLabel = !Number.isFinite(stats.pf) ? '∞' : fmt(stats.pf);
    const metrics = stats.closed.length ? `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-lg border p-3 text-center"><div class="text-2xl font-bold text-green-600">${fmtUsd(stats.bal)}</div><div class="text-xs text-gray-500">Итоговый капитал</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-2xl font-bold ${pnlClass(stats.ret)}">${fmtSignedPct(stats.ret, 2)}</div><div class="text-xs text-gray-500">Общая доходность</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-red-600">${stats.dd.toFixed(2)}%</div><div class="text-xs text-gray-500">Макс. просадка</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-blue-600">${(stats.closed.length ? 100 * stats.wins / stats.closed.length : 0).toFixed(1)}%</div><div class="text-xs text-gray-500">Доля прибыльных</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-indigo-600">${stats.closed.length}</div><div class="text-xs text-gray-500">Закрытых сделок</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold ${pnlClass(stats.avg)}">${fmtSignedPct(stats.avg, 2)}</div><div class="text-xs text-gray-500">Средняя сделка</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-violet-600">${fmt(stats.holdN ? stats.hold / stats.holdN : 0, 1)} дн.</div><div class="text-xs text-gray-500">Средняя длительность</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold ${pnlClass(stats.net)}">${fmtSignedUsd(stats.net)}</div><div class="text-xs text-gray-500">Чистая прибыль</div></div>
        <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold text-teal-600">${pfLabel}</div><div class="text-xs text-gray-500">Профит-фактор</div></div>
        <div class="rounded-lg border p-3 text-center col-span-2 md:col-span-1">
          <label class="text-xs text-gray-500" for="watch-margin">Маржинальность</label>
          <select id="watch-margin" class="field mt-1 w-full">${MONITOR_MARGIN_OPTIONS.map((n) => `<option value="${n}" ${state.monitorMarginPercent === n ? 'selected' : ''}>${n}%${n === 100 ? ' = без маржи' : n === 200 ? ' = 2x' : ''}</option>`).join('')}</select>
        </div>
      </div>` : `<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50">Пока нет закрытых сделок. Метрики появятся после первого завершенного трейда.</div>
        <div class="mt-3 max-w-xs"><label class="text-xs text-gray-500" for="watch-margin">Маржинальность</label>
          <select id="watch-margin" class="field mt-1 w-full">${MONITOR_MARGIN_OPTIONS.map((n) => `<option value="${n}" ${state.monitorMarginPercent === n ? 'selected' : ''}>${n}%</option>`).join('')}</select>
          <p class="text-[11px] text-gray-500 mt-1">100% = без маржи, 200% = 2x. Пересчитывает PnL закрытых сделок.</p>
        </div>`;
    return `
      ${pageHeader('Мониторинг', 'Отслеживание позиций и уведомления в Telegram', `<button id="watch-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список" aria-label="Обновить список">${icon('refresh', 'w-4 h-4')}</button>`)}
      ${watchMobileTabsHTML()}
      <p class="text-sm text-gray-600 dark:text-gray-300">Глобальный порог уведомлений: ${esc(thr)}% <span class="ml-2 text-xs text-gray-500">(применяется ко всем отслеживаемым акциям)</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">До следующего подсчёта сигналов: <span id="watch-countdown">${formatDuration(secondsToNextSignal())}</span></p>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">Согласованность monitor / broker</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">Статус синхронизации виртуальной monitor-позиции и реального брокерского журнала.</p>
          </div>
          <span class="inline-flex items-center rounded-full border ${consBadgeCls} px-3 py-1 text-xs font-semibold">${esc(consLabel)}</span>
        </div>
        <div class="mt-3 text-sm text-gray-600 dark:text-gray-300">${consOk || !state.consistency ? esc(consText) : consText}</div>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700 mb-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="text-lg font-semibold">Результат по совершенным сделкам</h3>
          <span class="text-xs text-gray-500">База расчета: ${fmtUsd(stats.initial)} · маржа ${state.monitorMarginPercent}%</span>
        </div>
        ${metrics}
      </div>
      <div>
        ${state.watchTab === 'summary' ? `<div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700"><h3 class="text-lg font-semibold mb-2">Капитал мониторинга (старт ${fmtUsd(stats.initial)}, маржа ${state.monitorMarginPercent}%)</h3>${stats.equity.length ? '<div id="watch-eq" class="chart-box"></div>' : '<p class="text-sm text-gray-500">Нет закрытых сделок для построения кривой капитала.</p>'}</div>` : ''}
        ${state.watchTab === 'watches' ? `<form id="watch-form" class="flex gap-2 mb-4"><input name="symbol" placeholder="AAPL" class="field" /><button class="btn-primary min-h-0 py-2">Добавить</button>
          <button type="button" id="watch-t11" class="btn-secondary min-h-0 py-2">Тест T-11</button>
          <button type="button" id="watch-t2" class="btn-secondary min-h-0 py-2">Тест T-2</button>
          <button type="button" id="watch-prices" class="btn-secondary min-h-0 py-2">Обновить цены и позиции</button></form>
          <div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>IBS вход</th><th>IBS выход</th><th>Цена входа</th><th>Позиция</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-gray-500">Нет активных наблюдений. Добавьте тикер в форму выше.</td></tr>'}</tbody></table></div>` : ''}
        ${state.watchTab === 'trades' ? `${(() => {
            const open = visibleMonitorTrades(simulated, false).find((t) => t.status === 'open');
            const watchSyms = (state.watches || []).map((w) => w.symbol);
            const hasOpen = !!open;
            return `${open ? `<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3 dark:bg-emerald-950/20"><div class="font-semibold">Текущая позиция: ${esc(open.symbol)}</div><div class="text-sm">Вход ${esc(fmtTradingDate(open.entryDate))} по ${open.entryPrice == null ? '—' : fmtUsd(open.entryPrice)}${open.entryIBS != null ? ', IBS ' + fmt(ibsPct(open.entryIBS), 1) + '%' : ''}</div><div class="mt-2 flex gap-2"><button type="button" data-edit-mon="${esc(open.id)}" class="btn-secondary min-h-0 py-1">Изменить</button><button type="button" data-close-mon="${esc(open.id)}" data-close-sym="${esc(open.symbol)}" class="btn-danger min-h-0 py-1">Закрыть</button></div></div>` : ''}
          <div class="rounded-lg border p-4 mb-3 bg-white dark:bg-gray-800"><h3 class="font-semibold mb-1">Ручная корректировка monitor-сделки</h3>
          <p class="text-sm text-gray-600 mb-3">Если сайт пропустил вход, можно добавить сделку вручную.</p>
          <form id="watch-manual" class="flex flex-wrap gap-2">
            <select name="symbol" class="field w-28">${watchSyms.map((s) => `<option>${esc(s)}</option>`).join('') || '<option value="">нет тикеров</option>'}</select>
            <input name="entryDate" placeholder="YYYY-MM-DD" class="field w-36" />
            <input name="entryPrice" type="number" step="0.01" placeholder="цена" class="field w-24" />
            <input name="entryIBS" type="number" step="0.1" placeholder="IBS %" class="field w-24" />
            <input name="notes" placeholder="заметки" class="field w-40" />
            <button class="btn-primary min-h-0 py-2" ${hasOpen || !watchSyms.length ? 'disabled' : ''}>Добавить ручную сделку</button>
          </form></div>
          <div id="watch-trades">${monitorTradesTable(simulated)}</div>`;
          })()}` : ''}
        ${state.watchTab === 'ema' ? `<form id="ema-alert-form" class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
            <label class="text-xs">Тикер<input name="symbol" value="TQQQ" class="field mt-1" /></label>
            <label class="text-xs">EMA<select name="emaPeriod" class="field mt-1"><option value="20">EMA 20</option><option value="200" selected>EMA 200</option></select></label>
            <label class="text-xs">Покупка ≤ %<input name="buyLevelPct" type="number" value="15" class="field mt-1" /></label>
            <label class="text-xs">Продажа ≥ %<input name="sellLevelPct" type="number" value="40" class="field mt-1" /></label>
            <label class="text-xs">Сейчас ждём<select name="nextAction" class="field mt-1"><option value="buy">Покупка</option><option value="sell">Продажа</option></select></label>
            <label class="text-xs">Близость, %<input name="thresholdPct" type="number" step="0.1" value="0.5" class="field mt-1" /></label>
            <label class="text-xs">Инфо-уровень, %<input name="infoLevelPct" type="number" step="0.1" value="-20" class="field mt-1" /></label>
            <button class="btn-primary min-h-0 py-2 self-end">Добавить</button>
          </form>
          <table class="trades"><thead><tr><th>Тикер</th><th>EMA</th><th>Диапазон</th><th>Ждём</th><th>Действия</th></tr></thead><tbody>${alerts || '<tr><td colspan="5" class="text-center text-gray-500">EMA-оповещений пока нет</td></tr>'}</tbody></table>` : ''}
      </div>`;
  }

  function autotradeLive() {
    const cfg = state.autoConfig && state.autoConfig.config ? state.autoConfig.config : (state.autoConfig || {});
    const tok = state.token || {};
    return !!(cfg.enabled && (tok.hasToken || tok.present));
  }
  function emptyBrokerTable(cols, empty) {
    return `<div class="overflow-auto"><table class="trades"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${cols.length}" class="text-center text-gray-500">${empty}</td></tr></tbody></table></div>`;
  }
  function pageBroker() {
    const live = autotradeLive();
    const tab = state.brokerTab || 'overview';
    let body = '';
    if (tab === 'journal') {
      const shown = (state.broker || []).filter((t) => state.brokerShowHidden || !t.isHidden);
      const jrows = shown.map((t) => `<tr class="${t.isHidden ? 'opacity-50' : ''}">
        <td class="font-mono">${esc(t.symbol || '—')}</td>
        <td>${esc(t.source || '—')}${t.isTest ? ' · test' : ''}</td>
        <td>${esc(t.status === 'open' ? 'открыта' : 'закрыта')}</td>
        <td>${esc(t.entryDate || '—')}</td>
        <td>${esc(t.exitDate || '—')}</td>
        <td>${t.entryPrice == null ? '—' : fmt(t.entryPrice)}</td>
        <td>${t.exitPrice == null ? '—' : fmt(t.exitPrice)}</td>
        <td>${t.quantity == null ? '—' : fmt(t.quantity, 4)}</td>
        <td class="${pnlClass(t.pnlAbsolute)}">${t.pnlAbsolute == null ? '—' : fmtUsd(t.pnlAbsolute)}</td>
        <td class="${pnlClass(t.pnlPercent)}">${t.pnlPercent == null ? '—' : fmt(t.pnlPercent, 2) + '%'}</td>
        <td>${t.entryIBS == null ? '—' : fmt(Number(t.entryIBS) <= 1.5 ? Number(t.entryIBS) * 100 : Number(t.entryIBS), 1) + '%'}</td>
        <td>${t.exitIBS == null ? '—' : fmt(Number(t.exitIBS) <= 1.5 ? Number(t.exitIBS) * 100 : Number(t.exitIBS), 1) + '%'}</td>
        <td>${esc(t.holdingDays ?? '')}</td>
        <td class="text-xs">${esc(t.notes || '')}</td>
        <td class="text-xs">${esc(t.clientOrderId || '')}</td><td class="text-xs">${esc(t.brokerOrderId || t.orderId || '')}</td>
        <td><button type="button" data-edit-bt="${esc(t.id)}" class="text-sm text-indigo-600 mr-2">Изменить</button><button type="button" data-hide-bt="${esc(t.id)}" class="text-sm text-indigo-600 mr-2">${t.isHidden ? 'Показать' : 'Скрыть'}</button><button type="button" data-bd="${esc(t.id)}" class="text-sm text-red-600">Удалить</button></td>
      </tr>`).join('');
      body = `<div class="flex flex-wrap gap-2 mb-3">
        <button type="button" id="broker-journal-refresh" class="btn-secondary min-h-0 py-2">Обновить</button>
        <button type="button" id="broker-show-hidden" class="btn-secondary min-h-0 py-2">${state.brokerShowHidden ? 'Скрыть скрытые' : 'Показать скрытые'}</button>
      </div>
      <form id="broker-form" class="flex flex-wrap gap-2 mb-4">
        <input name="symbol" placeholder="AAPL" class="field w-24" />
        <input name="entryDate" placeholder="YYYY-MM-DD вход" class="field w-36" />
        <input name="exitDate" placeholder="YYYY-MM-DD выход" class="field w-36" />
        <input name="entryPrice" type="number" step="0.01" placeholder="цена входа" class="field w-28" />
        <input name="exitPrice" type="number" step="0.01" placeholder="цена выхода" class="field w-28" />
        <input name="quantity" type="number" step="0.0001" placeholder="кол-во" class="field w-24" />
        <input name="notes" placeholder="заметки" class="field w-40" />
        <button class="btn-primary min-h-0 py-2">Добавить</button>
      </form>
      ${jrows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Источник</th><th>Статус</th><th>Дата входа</th><th>Дата выхода</th><th>Цена входа</th><th>Цена выхода</th><th>Кол-во</th><th>PnL, $</th><th>PnL, %</th><th>IBS вход</th><th>IBS выход</th><th>Дней</th><th>Заметки</th><th>Client Order ID</th><th>Broker Order ID</th><th>Действие</th></tr></thead><tbody>${jrows}</tbody></table></div>` : '<p class="text-sm text-gray-500">Сделок нет</p>'}`;
    } else if (tab === 'overview') {
      const bal = extractBalanceSummary(state.dashboard);
      const err = state.dashboard && (state.dashboard.error || (Array.isArray(state.dashboard.errors) && state.dashboard.errors[0]));
      body = `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Всего активов</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.totalAssets)}</div><div class="text-xs text-gray-400 mt-1">Валюта: ${esc(bal.currency || 'USD')}</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Свободные деньги</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.cashBalance)}</div><div class="text-xs text-gray-400 mt-1">Cash / settled cash</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Покупательная способность</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.buyingPower)}</div><div class="text-xs text-gray-400 mt-1">${esc(bal.accountType ? ('Тип счёта: ' + bal.accountType) : 'Buying power')}</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Нереализованный PnL</div><div class="text-xl font-semibold mt-1 ${pnlClass(bal.unrealizedPnl)}">${fmtUsd(bal.unrealizedPnl)}</div><div class="text-xs text-gray-400 mt-1">${bal.fetchedAt ? ('Обновлено ' + esc(formatDateTimeET(bal.fetchedAt))) : ''}</div></div>
      </div>${err ? `<p class="mt-3 text-sm text-amber-700">${esc(typeof err === 'string' ? err : (err.message || JSON.stringify(err)))}</p>` : ''}
      ${rawJsonBlock('Raw balance payload', state.dashboard && state.dashboard.balance)}
      ${rawJsonBlock('Raw account payload', state.dashboard && state.dashboard.account)}`;
    } else if (tab === 'positions') {
      const pos = normalizePositions(state.dashboard && (state.dashboard.positions || (state.dashboard.account && state.dashboard.account.positions)));
      const posRows = pos.map((p) => `<tr>
        <td class="font-mono">${esc(p.symbol)}</td>
        <td>${esc(p.instrumentType || '')}</td>
        <td>${esc(p.currency || '')}</td>
        <td>${p.quantity == null ? '—' : esc(p.quantity)}</td>
        <td>${p.avgPrice == null ? '—' : fmt(toNum(p.avgPrice))}</td>
        <td>${p.totalCost == null ? '—' : fmtUsd(p.totalCost)}</td>
        <td>${p.marketPrice == null ? '—' : fmt(toNum(p.marketPrice))}</td>
        <td>${p.marketValue == null ? '—' : fmtUsd(p.marketValue)}</td>
        <td class="${pnlClass(toNum(p.unrealizedPnl))}">${p.unrealizedPnl == null ? '—' : fmtUsd(p.unrealizedPnl)}</td>
        <td class="${pnlClass(toNum(p.unrealizedPnlRate))}">${formatRatioPercent(p.unrealizedPnlRate)}</td>
        <td>${formatRatioPercent(p.holdingProportion)}</td>
        <td>${p.symbol && p.symbol !== '—' ? `<button type="button" data-close-pos="${esc(p.symbol)}" class="text-sm text-red-600">Закрыть</button>` : ''}</td>
      </tr>`).join('');
      body = `${posRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Тип</th><th>Валюта</th><th>Кол-во</th><th>Средняя</th><th>Себестоимость</th><th>Рыночная цена</th><th>Рыночная стоимость</th><th>Нереализ. PnL</th><th>PnL %</th><th>Доля</th><th>Действие</th></tr></thead><tbody>${posRows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Тип', 'Валюта', 'Кол-во', 'Средняя', 'Себестоимость', 'Рыночная цена', 'Рыночная стоимость', 'Нереализ. PnL', 'PnL %', 'Доля', 'Действие'], 'Открытых позиций нет')}
      ${rawJsonBlock('Raw positions payload', state.dashboard && (state.dashboard.positions || (state.dashboard.account && state.dashboard.account.positions)))}
      ${rawJsonBlock('Raw accounts payload', state.dashboard && state.dashboard.accounts)}`;
    } else if (tab === 'orders') {
      const orders = normalizeOrders(state.dashboard && state.dashboard.openOrders);
      const orderRows = orders.map((o) => `<tr>
        <td class="font-mono">${esc(o.symbol)}</td><td>${esc(o.side)}</td><td>${esc(o.status)}</td>
        <td>${o.quantity == null ? '—' : esc(o.quantity)}</td><td>${o.filledQuantity == null ? '—' : esc(o.filledQuantity)}</td>
        <td>${esc(o.orderType)}</td><td>${esc(o.instrumentType)}</td><td>${esc(o.comboType)}</td>
        <td>${esc(o.entrustType)}</td><td>${esc(o.timeInForce)}</td><td>${esc(o.tradingSession)}</td>
        <td>${o.limitPrice == null ? (o.avgPrice == null ? '—' : fmt(toNum(o.avgPrice))) : fmt(toNum(o.limitPrice))}</td>
        <td class="text-xs">${esc(o.orderId)}</td><td class="text-xs">${esc(o.clientOrderId)}</td>
        <td class="text-xs">${esc(formatDateTimeET(o.createdAt))}</td>
      </tr>`).join('');
      body = `${orderRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Side</th><th>Статус</th><th>Qty</th><th>Filled Qty</th><th>Type</th><th>Instrument</th><th>Combo</th><th>Entrust</th><th>TIF</th><th>Session</th><th>Цена</th><th>Order ID</th><th>Client ID</th><th>Создан</th></tr></thead><tbody>${orderRows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Side', 'Статус', 'Qty', 'Filled Qty', 'Type', 'Instrument', 'Combo', 'Entrust', 'TIF', 'Session', 'Цена', 'Order ID', 'Client ID', 'Создан'], 'Активных ордеров нет')}
      ${rawJsonBlock('Raw open orders payload', state.dashboard && state.dashboard.openOrders)}`;
    } else if (tab === 'fills') {
      const fills = normalizeOrders(state.dashboard && state.dashboard.orderHistory);
      const fillRows = fills.map((o) => `<tr>
        <td class="text-xs">${esc(formatDateTimeET(o.filledAt || o.createdAt))}</td>
        <td class="font-mono">${esc(o.symbol)}</td><td>${esc(o.side)}</td><td>${esc(o.status)}</td>
        <td>${o.filledQuantity == null ? '—' : esc(o.filledQuantity)}</td>
        <td>${o.quantity == null ? '—' : esc(o.quantity)}</td>
        <td>${esc(o.orderType)}</td><td>${esc(o.instrumentType)}</td><td>${esc(o.comboType)}</td>
        <td>${esc(o.entrustType)}</td><td>${esc(o.timeInForce)}</td><td>${esc(o.tradingSession)}</td>
        <td>${o.avgPrice == null ? '—' : fmt(toNum(o.avgPrice))}</td>
        <td class="text-xs">${esc(o.orderId)}</td><td class="text-xs">${esc(o.clientOrderId)}</td>
      </tr>`).join('');
      body = `${fillRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Исполнено</th><th>Тикер</th><th>Side</th><th>Статус</th><th>Qty</th><th>Order Qty</th><th>Type</th><th>Instrument</th><th>Combo</th><th>Entrust</th><th>TIF</th><th>Session</th><th>Avg Price</th><th>Order ID</th><th>Client ID</th></tr></thead><tbody>${fillRows}</tbody></table></div>` : emptyBrokerTable(['Исполнено', 'Тикер', 'Side', 'Статус', 'Qty', 'Order Qty', 'Type', 'Instrument', 'Combo', 'Entrust', 'TIF', 'Session', 'Avg Price', 'Order ID', 'Client ID'], 'История ордеров пока не пришла')}
      ${rawJsonBlock('Raw order history payload', state.dashboard && state.dashboard.orderHistory)}`;
    } else if (tab === 'autotrade') {
      const st = state.autoStatus || {};
      const last = (st.state && st.state.lastRunAt) || '—';
      const dec = st.evaluation && st.evaluation.decision ? st.evaluation.decision : {};
      const ac = state.autoConfig || {};
      const tok = state.token || {};
      const conn = (state.dashboard && state.dashboard.connection) || {};
      const pending = asRows(state.autoLogs && state.autoLogs.pending);
      const recent = asRows(state.autoLogs && state.autoLogs.recent);
      const seen = new Set();
      const tracked = pending.concat(recent).filter((o) => {
        const id = o.clientOrderId || o.startedAt || o.symbol;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 20);
      const pendingRows = tracked.map((o) => `<tr><td>${esc(o.symbol || '')}</td><td>${esc(o.action || '')}</td><td>${esc(o.status || '')}</td><td>${esc(o.quantity ?? '')}</td><td>${esc(o.startedAt || o.started_at || '')}</td></tr>`).join('');
      const mode = CAPITAL_MODES.find((m) => m.value === (ac.entryCapitalMode || 'standard_safe')) || CAPITAL_MODES[0];
      const lastRes = (st.state && st.state.lastResult && st.state.lastResult.decision) || dec;
      body = `<div class="space-y-4">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-3">Состояние автоторговли</h2>
          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
              <div class="text-xs uppercase tracking-wide text-gray-500">Подключение</div>
              <div class="mt-1 text-sm">${conn.configured || tok.hasToken || tok.present ? 'Webull подключен' : 'Webull не настроен'}</div>
            </div>
            <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
              <div class="text-xs uppercase tracking-wide text-gray-500">Token / Account</div>
              <div class="mt-1 text-sm">token ${tok.hasToken || tok.present ? 'есть' : 'не задан'} • источник: ${esc(tok.source || '—')} • проверка: ${esc(tok.lastCheckStatus || '—')}</div>
              <div class="text-xs text-gray-500 mt-1">истекает ${esc(formatDateTimeET(tok.expiresAt) || tok.expiresAt || '—')} · осталось: ${esc(tok.daysLeft != null ? tok.daysLeft + ' дн.' : '—')} · lastCheckAt ${esc(formatDateTimeET(tok.lastCheckAt))}</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button type="button" id="auto-token-check" class="btn-secondary min-h-0 py-2">Проверить токен</button>
                <button type="button" id="auto-token-create" class="btn-secondary min-h-0 py-2">Создать токен</button>
              </div>
              <div class="mt-2 flex gap-2">
                <input id="auto-token-input" type="password" autocomplete="off" placeholder="Вставьте Webull token" class="field flex-1" />
                <button type="button" id="auto-token-save" class="btn-secondary min-h-0 py-2">Сохранить токен</button>
              </div>
            </div>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Статус</div><div class="mt-1 font-semibold">${ac.enabled ? 'LIVE' : 'OFF'}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Последний запуск</div><div class="mt-1 text-sm">${esc(formatDateTimeET(last) === '—' ? last : formatDateTimeET(last))}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Entries / Exits</div><div class="mt-1 text-sm">${ac.allowNewEntries !== false ? 'да' : 'нет'} / ${ac.allowExits !== false ? 'да' : 'нет'}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Последнее решение</div><div class="mt-1 text-sm">${esc(lastRes.action || dec.action || '—')} ${esc(lastRes.symbol || dec.symbol || '')}</div><div class="text-xs text-gray-500">${esc(lastRes.reason || dec.reason || '')}</div></div>
          </div>
          <div class="mt-4 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-950/40">
            <div class="flex items-center justify-between gap-3 mb-2">
              <div class="font-medium">Настройки автоторговли</div>
              <a href="/settings" data-nav data-settings-tab="autotrade" class="btn-secondary min-h-0 py-2">Изменить</a>
            </div>
            <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Размер входа</dt><dd>${esc(mode.label)}${ac.allowFractionalShares ? ' + дробные' : ''}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Пороги IBS</dt><dd>вход &lt; ${esc(ac.lowIBS ?? 0.1)} · выход &gt; ${esc(ac.highIBS ?? 0.75)}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Котировки</dt><dd>${esc(ac.provider || 'finnhub')} → резерв автоматически</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Заявки</dt><dd>рыночные, DAY, основная сессия</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Окно исполнения</dt><dd>${esc(ac.executionWindowSeconds ?? 90)} сек до закрытия</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Порог проскальзывания</dt><dd>${esc(ac.maxSlippageBps ?? 25)} bps</dd></div>
            </dl>
            <p class="text-xs text-gray-500 mt-2">${esc(mode.hint)}. Торгуются тикеры со страницы «Мониторинг». Account: ${esc(tok.accountId || conn.hasAccountId ? 'задан' : 'не задан')}.${ac.lastModifiedAt ? (' Обновлено: ' + esc(formatDateTimeET(ac.lastModifiedAt)) + ' ET') : ''}</p>
          </div>
          ${rawJsonBlock('Raw connection payload', conn)}
          ${rawJsonBlock('Raw autotrade config payload', ac)}
          ${rawJsonBlock('Raw tracked orders payload', tracked)}
          ${rawJsonBlock('Raw dashboard payload', state.dashboard)}
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" id="auto-enable" class="btn-primary min-h-0 py-2">${ac.enabled ? 'Выключить автоторговлю' : 'Включить автоторговлю'}</button>
            <button type="button" id="auto-test-buy" class="btn-secondary min-h-0 py-2">BUY AAL 1 шт по рынку</button>
            <button type="button" id="auto-refresh" class="btn-secondary min-h-0 py-2">Обновить статус</button>
          </div>
          <p class="mt-3 text-xs text-gray-500">Тестовая кнопка отправляет реальный ордер, если на сервере включён WEBULL_ENABLE_LIVE_TEST_BUY.</p>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h3 class="font-semibold mb-2">Pending / last tracked orders</h3>
          ${pendingRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Action</th><th>Статус</th><th>Qty</th><th>Старт</th></tr></thead><tbody>${pendingRows}</tbody></table></div>` : '<p class="text-sm text-gray-500">Tracked orders пока нет</p>'}
        </div>
      </div>`;
    } else if (tab === 'monitor') {
      const cons = state.consistency || {};
      const issues = Array.isArray(cons.issues) ? cons.issues : [];
      const actions = Array.isArray(cons.proposedActions) ? cons.proposedActions : [];
      const consLabel = actions.some((a) => a && a.autoApplicable) ? 'Reconcile' : (issues.length ? 'Mismatch' : 'OK');
      const wrows = (state.watches || []).map((w) => {
        const q = (state.brokerQuotes || {})[w.symbol] || {};
        const quote = q.quote || q;
        const rng = q.range || quote || {};
        const last = toNum(quote.current ?? quote.close ?? quote.last ?? rng.close);
        const high = toNum(rng.high ?? quote.high);
        const low = toNum(rng.low ?? quote.low);
        const prev = toNum(quote.prevClose ?? quote.previousClose ?? rng.prevClose);
        const ibs = (high != null && low != null && last != null && high !== low) ? (last - low) / (high - low) : toNum(w.lastIbs ?? w.ibs);
        const delta = (last != null && prev != null && prev !== 0) ? ((last - prev) / prev) * 100 : null;
        const ibsCls = ibs == null ? '' : (ibs < 0.10 ? 'text-emerald-600' : (ibs > 0.75 ? 'text-red-600' : ''));
        const openPx = toNum(quote.open ?? quote.o ?? rng.open ?? w.todayOpen);
        return `<tr>
          <td class="font-mono">${esc(w.symbol)}</td>
          <td>${openPx == null ? '—' : fmt(openPx)}</td>
          <td>${high == null ? '—' : fmt(high)}</td><td>${low == null ? '—' : fmt(low)}</td>
          <td>${last == null ? '—' : fmt(last)}</td>
          <td class="${ibsCls}">${ibs == null ? '—' : fmt(ibs, 3)}</td>
          <td>${prev == null ? '—' : fmt(prev)}</td>
          <td class="${pnlClass(delta)}">${delta == null ? '—' : fmt(delta, 2) + '%'}</td>
          <td>${w.entryPrice == null ? '—' : fmtUsd(w.entryPrice)}</td>
          <td>≤ ${Number(w.lowIBS ?? 0.1).toFixed(2)}</td>
          <td>${w.isOpenPosition ? 'Открыта' : 'В мониторинге'}</td>
          <td class="text-xs">${esc(formatDateTimeET(q.dateKey || quote.updatedAt || ''))}</td>
          <td class="text-xs">${esc(q.provider || q.error || '')}</td>
          <td><button type="button" data-bq="${esc(w.symbol)}" class="text-sm text-indigo-600">Обновить</button></td>
        </tr>`;
      }).join('');
      body = `<div class="flex flex-wrap gap-2 mb-3">
          <button type="button" id="broker-reconcile" class="btn-primary min-h-0 py-2">Reconcile</button>
          <button type="button" id="broker-quotes-refresh" class="btn-secondary min-h-0 py-2">Обновить котировки</button>
        </div>
        <div class="grid gap-3 md:grid-cols-4 mb-3">
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Отслеживаемые</div><div class="text-lg font-semibold">${(state.watches || []).length}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Открытые позиции</div><div class="text-lg font-semibold">${(state.watches || []).filter((w) => w.isOpenPosition).length}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Consistency</div><div class="text-lg font-semibold">${esc(consLabel)}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Обновлено</div><div class="text-sm">${esc(formatDateTimeET((state.dashboard && state.dashboard.fetchedAt) || ''))}</div></div>
        </div>
        ${issues.length ? issues.map((i) => `<div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-2">${esc(i.message || i.code)}</div>`).join('') : ''}
        ${wrows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Open</th><th>High</th><th>Low</th><th>Цена</th><th>Current IBS</th><th>Prev Close</th><th>Δ</th><th>Entry</th><th>Threshold</th><th>Позиция</th><th>Обновлено</th><th>Источник</th><th>Действие</th></tr></thead><tbody>${wrows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Open', 'High', 'Low', 'Цена', 'Current IBS', 'Prev Close', 'Δ', 'Entry', 'Threshold', 'Позиция', 'Обновлено', 'Источник', 'Действие'], 'Нет отслеживаемых акций')}
        ${rawJsonBlock('Raw monitoring payload', { watches: state.watches, quotes: state.brokerQuotes, consistency: state.consistency })}`;
    } else {
      const pack = state.autoLogs || {};
      const lines = (rows) => (rows || []).map((l) => {
        if (typeof l === 'string') {
          try { l = JSON.parse(l); } catch { return l; }
        }
        if (!l || typeof l !== 'object') return String(l);
        const ts = formatDateTimeET(l.ts || l.time || l.timestamp);
        const lvl = l.level || l.lvl || '';
        const ev = l.event || l.message || '';
        const extra = [l.symbol, l.action, l.status, l.client_order_id || l.clientOrderId, l.method, l.path, l.responseStatus, l.error].filter(Boolean).join(' • ');
        return `${ts} ${lvl} ${ev}${extra ? ' • ' + extra : ''}`.trim();
      }).join('\n');
      const monitor = lines(pack.monitor) || 'Логи мониторинга пока пусты';
      const auto = lines(pack.autotrade || pack.logs) || 'Логи автоторговли пока пусты';
      const raw = lines(pack.brokerRaw) || auto;
      body = `<div class="space-y-3">
        <div><h2 class="text-sm font-semibold mb-1">Логи мониторинга (${(pack.monitor || pack.logs || []).length})</h2><pre class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-52">${esc(monitor)}</pre></div>
        <div><h2 class="text-sm font-semibold mb-1">Webull / autotrade логи (${(pack.autotrade || pack.logs || []).length})</h2><pre id="broker-logs" class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-52">${esc(auto)}</pre></div>
        <div><h2 class="text-sm font-semibold mb-1">Raw broker log</h2><pre class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-52">${esc(raw)}</pre></div>
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
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">${['alpha_vantage', 'finnhub', 'twelve_data', 'polygon', 'webull'].map((p) => `<button type="button" data-testprov="${p}" class="btn-primary min-h-0 py-2 text-sm">Тест ${esc(providerLabel(p))}</button>`).join('')}</div>
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
      const ac = state.autoConfig?.config || state.autoConfig || {};
      const cap = ac.entryCapitalMode || 'standard_safe';
      const quote = ac.provider || ac.quoteProvider || 'finnhub';
      const watched = (state.watches || []).map((w) => w.symbol).join(', ');
      body = `<div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-1">Как это работает</div>
          <p class="text-sm text-gray-600 dark:text-gray-400">За минуту до закрытия биржи система берёт котировки всех тикеров мониторинга, считает IBS = (close − low) / (high − low) и выбирает тот, у которого IBS ниже порога входа и ниже, чем у остальных. Покупает его рыночной заявкой на весь доступный счёт. Держит, пока IBS не поднимется выше порога выхода, — тогда так же рыночной заявкой продаёт. Все заявки только рыночные и только в основную сессию: цена закрытия должна быть получена наверняка.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Включение</div>
          <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="autoEnabled" ${ac.enabled ? 'checked' : ''} /> Автоторговля включена</label>
          <p class="text-xs text-gray-500 mt-1 mb-3">Выключено — система по-прежнему считает и присылает решение в Telegram, но заявки брокеру не отправляет.</p>
          <div class="flex flex-wrap gap-4">
            <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="autoAllowEntries" ${ac.allowNewEntries !== false ? 'checked' : ''} /> Разрешить входы</label>
            <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="autoAllowExits" ${ac.allowExits !== false ? 'checked' : ''} /> Разрешить выходы</label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Тормоз на случай, когда нужно свернуть торговлю: снимите «входы», и открытая позиция будет доторгована до выхода, но новых сделок не появится. Снимать «выходы» стоит только осознанно — позиция останется висеть.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Сколько покупать</div>
          <p class="text-xs text-gray-500 mb-2">Всегда покупается на весь счёт — вопрос только в том, сколько это «весь счёт». Размер в любом случае ограничен реальной покупательной способностью у брокера.</p>
          ${CAPITAL_MODES.map((m) => `<label class="flex items-start gap-2 text-sm mb-2"><input type="radio" name="entryCapitalMode" value="${esc(m.value)}" ${cap === m.value ? 'checked' : ''} class="mt-1" /><span><strong>${esc(m.label)}</strong><br /><span class="text-xs text-gray-500">${esc(m.hint)}</span></span></label>`).join('')}
          <label class="inline-flex items-center gap-2 text-sm mt-2"><input type="checkbox" name="autoFractional" ${ac.allowFractionalShares ? 'checked' : ''} /> Дробные акции</label>
          <p class="text-xs text-gray-500 mt-1">Без дробных остаток денег меньше цены одной акции остаётся неиспользованным. Дробные заявки Webull поддерживает не по всем тикерам.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Пороги IBS по умолчанию</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm">Вход, IBS ниже<input name="autoLowIBS" type="number" step="0.01" min="0" max="1" value="${esc(ac.lowIBS ?? 0.1)}" class="field mt-1" /></label>
            <label class="text-sm">Выход, IBS выше<input name="autoHighIBS" type="number" step="0.01" min="0" max="1" value="${esc(ac.highIBS ?? 0.75)}" class="field mt-1" /></label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Сравнение строгое с обеих сторон: ровно 0.10 — это не вход. У каждого тикера на странице «Мониторинг» есть собственные пороги, и они важнее этих: здесь задаётся только значение по умолчанию.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Откуда берутся цены</div>
          <label class="inline-flex items-center gap-2 text-sm mr-4"><input type="radio" name="autoQuote" value="finnhub" ${quote === 'finnhub' ? 'checked' : ''} /> Finnhub</label>
          <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="autoQuote" value="webull" ${quote === 'webull' ? 'checked' : ''} /> Webull</label>
          <p class="text-xs text-gray-500 mt-1">Это тот, кого спрашивают первым. Если он не ответил или прислал негодную котировку, второй спрашивается автоматически — настраивать порядок не нужно. Провайдеры с дневными барами (Alpha Vantage, Twelve Data, Polygon) для живого решения не используются: они ответят вчерашней свечой.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Что торгуем</div>
          <p class="text-sm">${watched ? esc(watched) : 'Список пуст'}</p>
          <p class="text-xs text-gray-500 mt-1">Ровно то, что стоит на странице «Мониторинг», — отдельного списка здесь нет специально, чтобы тикер не мог отслеживаться и молча не торговаться. <a href="/watches" data-nav class="text-indigo-600">Изменить список</a></p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Защита</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm">Окно исполнения, сек<input name="autoWindow" type="number" min="15" step="1" value="${esc(ac.executionWindowSeconds ?? 90)}" class="field mt-1" /></label>
            <label class="text-sm">Порог проскальзывания, bps<input name="autoSlippage" type="number" min="0" max="1000" step="1" value="${esc(ac.maxSlippageBps ?? 25)}" class="field mt-1" /></label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Окно: планировщик и кнопка «Исполнить» отправят заявку, только если до закрытия осталось не больше этого времени, — страховка от случайной сделки среди дня. Регулярный запуск в T-1 через это окно не проходит: он и так привязан к закрытию.</p>
          <p class="text-xs text-gray-500 mt-1">Проскальзывание: заявку не ограничивает (она рыночная и должна исполниться), но если цена исполнения ушла от цены решения дальше порога, в Telegram придёт предупреждение. 25 bps = 0.25%.</p>
        </div>
        <p class="text-sm text-gray-600">Состояние, токен Webull, журнал заявок и ручное закрытие позиции — на странице <a href="/broker" data-nav class="text-indigo-600">Брокер</a>.</p>`;
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
      if (e.target.closest('#theme-btn') || e.target.closest('#theme-btn-top')) {
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
      if (e.target.closest('#app-side-toggle')) {
        e.preventDefault();
        state.navCollapsed = !state.navCollapsed;
        try { localStorage.setItem('nav.collapsed', state.navCollapsed ? '1' : '0'); } catch (_) {}
        applyNavCollapsed();
        return;
      }
      const wtab = e.target.closest('[data-wtab]');
      if (wtab) {
        e.preventDefault();
        state.watchTab = wtab.dataset.wtab;
        if (state.page !== '/watches') navigate('/watches');
        else renderPage();
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
        if (fn) Promise.resolve().then(fn).catch((err) => toast(errText(err)));
        return;
      }
      if (e.target.closest('#err-log-btn')) {
        e.preventDefault();
        state.errorConsoleOpen = !state.errorConsoleOpen;
        document.getElementById('overlay-root').innerHTML = overlay();
        return;
      }
      if (e.target.closest('#err-close')) { state.errorConsoleOpen = false; document.getElementById('overlay-root').innerHTML = overlay(); return; }
      if (e.target.closest('#err-clear')) { state.clientErrors = []; state.errorBanner = null; document.getElementById('overlay-root').innerHTML = overlay(); return; }
      if (e.target.closest('#err-copy')) {
        const text = (state.clientErrors || []).map((x) => `[${x.level}] ${x.message}\n${x.extra || ''}`).join('\n---\n');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Скопировано')).catch(() => toast('Не удалось скопировать'));
        else toast('Буфер обмена недоступен');
        return;
      }
      if (e.target.closest('#err-banner-close')) {
        state.errorBanner = null;
        document.getElementById('error-banner')?.classList.add('hidden');
        return;
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
    const themeLab = 'Тема: ' + themeLabel();
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.innerHTML = sideItemInner(themeIcon(), 'Тема');
      themeBtn.setAttribute('aria-label', themeLab);
      themeBtn.title = themeLab;
    }
    const themeTop = document.getElementById('theme-btn-top');
    if (themeTop) {
      themeTop.innerHTML = icon(themeIcon());
      themeTop.setAttribute('aria-label', themeLab);
      themeTop.title = themeLab;
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
    document.querySelectorAll('.app-side-nav > [data-nav]').forEach((a) => {
      a.classList.toggle('app-side-item-on', a.getAttribute('href') === state.page);
    });
    document.querySelectorAll('.bottom-nav [data-nav]').forEach((a) => {
      const on = a.getAttribute('href') === state.page;
      a.className = `flex flex-col items-center justify-center gap-1 py-2 text-xs ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`;
      const well = a.querySelector('.bn-icon');
      if (well) well.classList.toggle('active', on);
    });
    const gear = document.getElementById('settings-btn');
    if (gear) gear.classList.toggle('app-side-item-on', state.page === '/settings');
    const watchHost = document.getElementById('app-side-watch');
    if (watchHost) watchHost.innerHTML = state.page === '/watches' ? watchNavItemsHTML() : '';
    applyNavCollapsed();
  }

  async function renderPage(opts) {
    opts = opts || {};
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
    if (!opts.keepCharts) Charts.destroy();
    updateChrome();
    document.getElementById('page-root').innerHTML = pageHTML();
    const ov = document.getElementById('overlay-root');
    if (ov) ov.innerHTML = overlay();
    const banner = document.getElementById('error-banner');
    if (banner) {
      banner.classList.toggle('hidden', !state.errorBanner);
      const t = banner.querySelector('[data-err-text]');
      if (t) t.textContent = state.errorBanner || '';
    }
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
        navigate(consumeReturnPath(), true);
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
      if (!state.loaded.statusPing) {
        state.loaded.statusPing = true;
        API.status().then(() => {
          if (state.serverStatus !== 'online') { state.serverStatus = 'online'; renderPage(); }
          else state.serverStatus = 'online';
        }).catch(() => { state.serverStatus = 'offline'; renderPage(); });
      }
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
          try {
            await API.deleteDataset(b.dataset.del);
            state.datasets = await API.datasets();
            renderPage();
          } catch (err) { toast(errText(err)); }
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
          const saveBtn = document.getElementById('edit-save');
          const cancelBtn = document.getElementById('edit-cancel');
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }
          if (cancelBtn) cancelBtn.disabled = true;
          try {
            await API.patchDatasetMeta(b.dataset.edit, { companyName: document.getElementById('edit-company').value, tag: document.getElementById('edit-tag').value });
            state.modal = null;
            state.datasets = await API.datasets();
            renderPage();
          } catch (err) { toast(errText(err)); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; } if (cancelBtn) cancelBtn.disabled = false; }
        });
      }));
      root.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (state.refreshingTicker) return;
        state.refreshingTicker = b.dataset.refresh;
        b.classList.add('opacity-50');
        try {
          await API.refreshDataset(b.dataset.refresh, refreshProvider());
          state.datasets = await API.datasets();
          toast('Датасет обновлён');
          renderPage();
        } catch (err) { toast(errText(err)); state.datasetsError = errText(err); renderPage(); }
        finally { state.refreshingTicker = null; }
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
      form?.symbol.addEventListener('input', () => {
        form.symbol.value = String(form.symbol.value || '').toUpperCase();
        state.enhanceQuery = form.symbol.value;
        state.enhanceListOpen = !!state.enhanceQuery.trim();
        state.enhanceHighlight = -1;
        syncLoad();
        paintEnhanceGrid();
        const boxHost = document.querySelector('.enhance-search');
        const old = document.getElementById('enhance-listbox');
        if (old) old.remove();
        if (boxHost && state.enhanceListOpen) {
          boxHost.insertAdjacentHTML('beforeend', enhanceListboxHTML());
          boxHost.querySelectorAll('[data-esug]').forEach((b) => b.addEventListener('click', () => enhanceFetch(b.dataset.esug)));
        }
      });
      form?.symbol.addEventListener('keydown', (e) => {
        const items = enhanceSuggestions();
        if (e.key === 'ArrowDown' && items.length) {
          e.preventDefault();
          state.enhanceListOpen = true;
          state.enhanceHighlight = (state.enhanceHighlight + 1) % items.length;
          const boxHost = document.querySelector('.enhance-search');
          const old = document.getElementById('enhance-listbox');
          if (old) old.remove();
          if (boxHost) {
            boxHost.insertAdjacentHTML('beforeend', enhanceListboxHTML());
            boxHost.querySelectorAll('[data-esug]').forEach((b) => b.addEventListener('click', () => enhanceFetch(b.dataset.esug)));
          }
        } else if (e.key === 'ArrowUp' && items.length) {
          e.preventDefault();
          state.enhanceListOpen = true;
          state.enhanceHighlight = state.enhanceHighlight <= 0 ? items.length - 1 : state.enhanceHighlight - 1;
          const boxHost = document.querySelector('.enhance-search');
          const old = document.getElementById('enhance-listbox');
          if (old) old.remove();
          if (boxHost) {
            boxHost.insertAdjacentHTML('beforeend', enhanceListboxHTML());
            boxHost.querySelectorAll('[data-esug]').forEach((b) => b.addEventListener('click', () => enhanceFetch(b.dataset.esug)));
          }
        } else if (e.key === 'Enter' && state.enhanceListOpen && state.enhanceHighlight >= 0 && items[state.enhanceHighlight]) {
          e.preventDefault();
          enhanceFetch(items[state.enhanceHighlight].symbol);
        } else if (e.key === 'Escape') {
          state.enhanceListOpen = false;
          document.getElementById('enhance-listbox')?.remove();
        }
      });
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
        if (state.enhanceLoadingSymbol) return;
        state.enhanceLoadingSymbol = ticker;
        state.enhanceListOpen = false;
        document.getElementById('enhance-listbox')?.remove();
        paintEnhanceGrid();
        if (out) out.textContent = 'Загрузка…';
        const loadBtn = form?.querySelector('.enhance-load');
        if (loadBtn) loadBtn.disabled = true;
        try {
          const r = await API.get(`/api/fetch/${provider}/${encodeURIComponent(ticker)}`);
          const bars = r.data || r.bars || [];
          if (!bars.length) { if (out) out.textContent = 'Нет данных'; return; }
          const companyName = catalogName(ticker);
          const splits = Array.isArray(r.splits) ? r.splits : [];
          await API.saveDataset({ ticker, name: ticker, companyName, data: bars, splits });
          if (splits.length) {
            try {
              const events = splits.map((s) => ({ date: String(s.date || '').slice(0, 10), factor: Number(s.factor ?? s.ratio ?? s.value) })).filter((e) => e.date && Number.isFinite(e.factor) && e.factor > 0 && e.factor !== 1);
              if (events.length) await API.putSplits(ticker, events);
            } catch (splitErr) { toast(errText(splitErr)); }
          }
          state.datasets = await API.datasets();
          if (out) out.innerHTML = `Сохранено <b>${esc(ticker)}</b>: ${bars.length} баров${splits.length ? ', сплитов: ' + splits.length : ''}. <a href="/stocks?tickers=${encodeURIComponent(ticker)}" data-nav class="text-indigo-600">Открыть в Акциях</a>`;
          toast('Датасет сохранён');
          renderPage();
        } catch (err) {
          if (out) out.textContent = errText(err);
          toast(errText(err));
        } finally {
          state.enhanceLoadingSymbol = null;
          if (loadBtn) loadBtn.disabled = !String(form?.symbol?.value || '').trim();
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
        if (state.result) runStocks();
        else renderPage();
      });
      document.getElementById('run-bt')?.addEventListener('click', runStocks);
      root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => { state.stockTab = b.dataset.stab; state.tradesPage = 1; renderPage(); }));
      bindPriceChartControls('chart-price');
      paintStockCharts();
      bindTradesPager(root);
      paintHistograms();
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
        const payload = { id: String(Date.now()), name, form: { ...state.emaForm, buyZones: state.emaForm.buyZones.map((z) => ({ ...z })), sellZones: state.emaForm.sellZones.map((z) => ({ ...z })) }, tickers: state.emaTickers };
        const existing = state.emaPresets.findIndex((p) => String(p.name || '').toLowerCase() === name.toLowerCase());
        if (existing >= 0) state.emaPresets[existing] = { ...state.emaPresets[existing], ...payload, id: state.emaPresets[existing].id };
        else state.emaPresets.push(payload);
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
          const names = parseTickers(state.emaTickers);
          const tp = Number(String(f.takeProfit || '').replace(',', '.'));
          const lev = Number(f.leverage || 200) / 100;
          const ema = {
            initialCapital: 10000,
            leverage: lev,
            emaPeriod: Number(f.period || 200),
            buyZones: (f.buyZones || []).map((z) => ({ id: z.id, levelPct: Number(z.levelPct), enabled: !!z.enabled })),
            sellZones: (f.sellZones || []).map((z) => ({ id: z.id, levelPct: Number(z.levelPct), enabled: !!z.enabled })),
            signalSource: f.signal || 'close',
            emaStartMode: f.start || 'full_history',
            noSellAtLoss: !!f.noSellAtLoss,
          };
          if (Number.isFinite(tp) && tp > 0) ema.takeProfitPercent = tp;
          const payload = { tickers: calcTickerRefs(names), ema };
          if (lev > 1) payload.includeBaseline = true;
          const [raw] = await Promise.all([
            API.calc('ema-zone', payload),
            loadSelected(),
          ]);
          state.emaResult = resultOf(raw);
          state.emaRunParams = { buyZones: ema.buyZones, sellZones: ema.sellZones, snap: JSON.parse(JSON.stringify({ form: state.emaForm, tickers: state.emaTickers })) };
          state.emaBaseline = lev > 1 ? resultOf(raw && raw.baseline) : null;
          state.emaTab = 'summary';
          state.tradesPage = 1;
          renderPage();
        } catch (err) { toast(err.message); }
      });
      bindPriceChartControls('chart-ema-price');
      paintEmaCharts();
      bindTradesPager(root);
      paintHistograms();
      if (state.emaResult && state.emaTab === 'summary') bindHero(root, { quote: false });
    }

    if (p === '/multi-ticker-options') {
      syncTickerField('opt-tickers');
      root.querySelectorAll('[data-otab]').forEach((b) => b.addEventListener('click', () => { state.optTab = b.dataset.otab; renderPage(); }));
      document.getElementById('reset-opt-tickers')?.addEventListener('click', () => {
        state.optTickers = 'AAPL, MSFT, AMZN, MAGS';
        try { localStorage.setItem('options.tickers', state.optTickers); } catch (_) {}
        renderPage();
      });
      document.getElementById('opt-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await runOptionsMulti(new FormData(e.target));
      });
      bindPriceChartControls('chart-opt-price');
      paintOptCharts();
      bindTradesPager(root);
      paintHistograms();
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
        if (!form) return;
        const mmdd = b.dataset.cday;
        form.mmdd.value = mmdd;
        const y = String(state.cal.year);
        const hol = state.cal.data?.holidays?.[y]?.[mmdd];
        const sh = state.cal.data?.shortDays?.[y]?.[mmdd];
        const [mm, dd] = mmdd.split('-').map(Number);
        const dow = new Date(Date.UTC(state.cal.year, mm - 1, dd)).getUTCDay();
        const weekend = dow === 0 || dow === 6;
        form.type.value = hol ? 'holiday' : (sh ? 'short' : 'normal');
        form.name.value = (typeof hol === 'string' ? hol : (hol && hol.name)) || (typeof sh === 'string' ? sh : (sh && sh.name)) || '';
        form.querySelector('button')?.toggleAttribute('disabled', weekend);
        if (weekend) toast('Выходные не редактируются');
      }));
      document.getElementById('cal-edit')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await API.patchCalendarDay({ year: String(state.cal.year), mmdd: fd.get('mmdd'), type: fd.get('type'), name: fd.get('name') });
          state.cal.data = await API.calendar();
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('cal-webull')?.addEventListener('click', async () => {
        const btn = document.getElementById('cal-webull');
        if (btn) { btn.disabled = true; btn.textContent = 'Импорт…'; }
        try {
          const r = await API.syncCalendar();
          if (r && r.ok) {
            state.cal.data = await API.calendar();
            state.calImportStats = r;
            toast('Календарь обновлён · ' + (r.from || '') + '–' + (r.to || '') + ' · дней ' + (r.tradingDaysFound ?? '—') + ' · праздников +' + (r.newHolidays ?? 0));
            renderPage();
          } else {
            toast((r && r.error) || 'Календарь не обновлён');
          }
        } catch (err) { toast(errText(err)); }
        finally { if (btn) { btn.disabled = false; btn.textContent = 'Импорт из Webull'; } }
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
      document.getElementById('splits-refresh')?.addEventListener('click', async () => {
        try { state.splitsMap = await API.splits(); renderPage(); } catch (err) { toast(errText(err)); }
      });
      document.getElementById('split-apply-ticker')?.addEventListener('change', (e) => { state.splitApplyTicker = e.target.value; });
      document.getElementById('split-apply')?.addEventListener('click', async () => {
        const id = document.getElementById('split-apply-ticker')?.value || state.splitApplyTicker || (state.datasets[0] && state.datasets[0].ticker);
        if (!id) { toast('Нет датасета'); return; }
        const btn = document.getElementById('split-apply');
        if (btn) btn.disabled = true;
        try {
          const r = await API.applyDatasetSplits(id);
          toast((r && r.message) || 'Датасет пересчитан');
          state.datasets = await API.datasets().catch(() => state.datasets);
        } catch (err) { toast(errText(err)); }
        finally { if (btn) btn.disabled = false; }
      });
      root.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить сплит ' + b.dataset.ds + ' ' + b.dataset.dd + '?', async () => {
          await API.deleteSplit(b.dataset.ds, b.dataset.dd);
          state.splitsMap = await API.splits();
          renderPage();
        });
      }));
      root.querySelectorAll('[data-del-ticker]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить все сплиты ' + b.dataset.delTicker + '?', async () => {
          try {
            await API.del('/api/splits/' + encodeURIComponent(b.dataset.delTicker));
            state.splitsMap = await API.splits();
            renderPage();
          } catch (err) { toast(errText(err)); }
        });
      }));
      root.querySelectorAll('[data-edit-split]').forEach((b) => b.addEventListener('click', () => {
        const ticker = b.dataset.editSplit;
        const evs = ((state.splitsMap && state.splitsMap[ticker]) || []).map((e) => ({ date: e.date, factor: e.factor }));
        const rows = (list) => list.map((e, i) => `<div class="flex gap-2 mb-1" data-split-row="${i}"><input data-sd class="field w-40" value="${esc(e.date || '')}" /><input data-sf type="number" step="0.01" class="field w-24" value="${esc(e.factor ?? '')}" /><button type="button" data-rm-row="${i}" class="text-red-600 text-sm">×</button></div>`).join('');
        state.modal = `<div class="modal-backdrop" id="split-edit-modal"><div class="modal-card max-w-lg">
          <h3 class="text-lg font-semibold mb-3">Сплиты ${esc(ticker)}</h3>
          <div id="split-edit-rows">${rows(evs)}</div>
          <button type="button" id="split-add-row" class="btn-secondary min-h-0 py-1 mb-3">+ событие</button>
          <div class="flex justify-end gap-2"><button id="split-edit-cancel" class="btn-secondary">Отмена</button><button id="split-edit-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
        </div></div>`;
        document.getElementById('overlay-root').innerHTML = overlay();
        const host = document.getElementById('split-edit-rows');
        const readRows = () => Array.from(host.querySelectorAll('[data-split-row]')).map((row) => ({ date: row.querySelector('[data-sd]').value, factor: Number(row.querySelector('[data-sf]').value) })).filter((e) => e.date);
        const paint = (list) => { host.innerHTML = rows(list); host.querySelectorAll('[data-rm-row]').forEach((btn) => btn.addEventListener('click', () => { const next = readRows().filter((_, i) => i !== Number(btn.dataset.rmRow)); paint(next); })); };
        paint(evs);
        document.getElementById('split-add-row')?.addEventListener('click', () => paint(readRows().concat([{ date: '', factor: 2 }])));
        document.getElementById('split-edit-cancel')?.addEventListener('click', () => { state.modal = null; document.getElementById('overlay-root').innerHTML = overlay(); });
        document.getElementById('split-edit-save')?.addEventListener('click', async () => {
          try {
            const cleaned = readRows().filter((e) => e.date && Number.isFinite(e.factor) && e.factor > 0);
            await API.putSplits(ticker, cleaned);
            state.modal = null;
            state.splitsMap = await API.splits();
            renderPage();
          } catch (err) { toast(errText(err)); }
        });
      }));
      document.getElementById('split-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const ticker = String(fd.get('ticker') || '').toUpperCase().trim();
        const date = String(fd.get('date') || '').slice(0, 10);
        const factor = Number(fd.get('factor'));
        if (!ticker) { toast('Укажите тикер'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Дата должна быть YYYY-MM-DD'); return; }
        if (!Number.isFinite(factor) || factor <= 0 || factor === 1) { toast('Коэффициент должен быть > 0 и ≠ 1'); return; }
        try {
          const existing = ((state.splitsMap && state.splitsMap[ticker]) || []).slice();
          existing.push({ date, factor });
          await API.putSplits(ticker, existing);
          state.splitsMap = await API.splits();
          state.splitsTab = 'list';
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('split-import-btn')?.addEventListener('click', async () => {
        let raw;
        try { raw = JSON.parse(document.getElementById('split-import').value); }
        catch (err) { toast('Некорректный JSON'); return; }
        const normalizeEvents = (arr) => (Array.isArray(arr) ? arr : []).map((it) => ({
          date: typeof it?.date === 'string' ? String(it.date).slice(0, 10) : '',
          factor: Number(it?.factor ?? it?.ratio ?? it?.value),
        })).filter((e) => e.date && Number.isFinite(e.factor) && e.factor > 0 && e.factor !== 1);
        const tickerField = String(document.getElementById('split-import-ticker').value || '').toUpperCase().trim();
        const updates = {};
        try {
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            if ((raw.symbol || raw.ticker) && Array.isArray(raw.events)) {
              updates[String(raw.symbol || raw.ticker).toUpperCase()] = normalizeEvents(raw.events);
            } else {
              for (const [k, v] of Object.entries(raw)) {
                if (k === 'symbol' || k === 'ticker' || k === 'events') continue;
                updates[String(k).toUpperCase()] = normalizeEvents(v);
              }
            }
          } else if (Array.isArray(raw)) {
            if (!tickerField) { toast('Для массива событий укажите тикер'); return; }
            updates[tickerField] = normalizeEvents(raw);
          } else {
            toast('Неподдерживаемый формат JSON');
            return;
          }
          const entries = Object.entries(updates).filter(([, ev]) => ev.length);
          if (!entries.length) { toast('Нет валидных событий в JSON'); return; }
          for (const [sym, evs] of entries) await API.putSplits(sym, evs);
          state.splitsMap = await API.splits();
          state.splitsTab = 'list';
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('split-file')?.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        document.getElementById('split-import').value = await f.text();
      });
      document.getElementById('split-download')?.addEventListener('click', () => {
        downloadJson('splits-' + nyseParts().iso + '.json', state.splitsMap || {});
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
        const [w, t, a, c] = await Promise.all([
          API.watches().catch(() => []),
          API.trades().catch(() => API.monitorTrades().catch(() => [])),
          API.emaAlerts().catch(() => []),
          API.consistency().catch((e) => ({ issues: [{ code: 'fetch_failed', message: (e && e.message) || 'Не удалось получить согласованность' }] })),
        ]);
        state.watches = w || [];
        state.monitorTrades = Array.isArray(t) ? t : (t.trades || []);
        state.emaAlerts = Array.isArray(a) ? a : (a.alerts || []);
        state.consistency = c || { issues: [] };
        state.loaded.watches = true;
        renderPage();
        return;
      }
      document.getElementById('watch-refresh')?.addEventListener('click', async () => { state.loaded.watches = false; renderPage(); });
      root.querySelectorAll('[data-dw]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить ' + b.dataset.dw + ' из мониторинга?', async () => {
          try {
            await API.deleteWatch(b.dataset.dw);
            state.watches = await API.watches();
            renderPage();
          } catch (err) { toast(errText(err)); }
        });
      }));
      root.querySelectorAll('[data-close-mon]').forEach((b) => b.addEventListener('click', () => openCloseMonitorModal(b.dataset.closeMon, b.dataset.closeSym)));
      document.getElementById('watch-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await API.addWatch({ symbol: e.target.symbol.value, lowIBS: 0.1, highIBS: 0.75 });
          state.watches = await API.watches();
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('watch-t11')?.addEventListener('click', async () => { try { const r = await API.simulate('overview'); if (r && r.success && r.sent) toast('Симуляция T-11'); else toast((r && (r.reason || r.error)) || 'Симуляция T-11 не отправлена'); } catch (err) { toast(err.message); } });
      document.getElementById('watch-t2')?.addEventListener('click', async () => { try { const r = await API.simulate('confirmations'); if (r && r.success && r.sent) toast('Симуляция T-2'); else toast((r && (r.reason || r.error)) || 'Симуляция T-2 не отправлена'); } catch (err) { toast(err.message); } });
      document.getElementById('watch-prices')?.addEventListener('click', async () => {
        try {
          const r = await API.updateAll();
          const prices = (r && r.prices) || r || {};
          const n = prices.updatedCount ?? prices.updated ?? (Array.isArray(prices.updatedTickers) ? prices.updatedTickers.length : null);
          const missing = (prices.missingToday || prices.noData || []).join(', ');
          const errs = (prices.errors || []).map((x) => x.symbol || x.message || x).join(', ');
          const chg = (r && r.positions && r.positions.changes) || prices.changes || [];
          toast((prices.success || prices.updated ? 'Обновлено' : (prices.reason || 'Цены не обновлены')) + (n != null ? ' · ' + n : '') + (missing ? ' · нет данных: ' + missing : '') + (errs ? ' · ошибки: ' + errs : '') + (chg.length ? ' · позиций: ' + chg.length : ''));
          state.loaded.watches = false;
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('watch-manual')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const symbol = String(fd.get('symbol') || '').toUpperCase().trim();
        const entryDate = String(fd.get('entryDate') || '');
        const entryPrice = Number(fd.get('entryPrice'));
        if (!symbol) { toast('Укажите тикер'); return; }
        if (visibleMonitorTrades(state.monitorTrades, true).some((t) => t.status === 'open')) { toast('Уже есть открытая позиция'); return; }
        if (!(entryPrice > 0)) { toast('Укажите цену входа'); return; }
        try {
          const ibsRaw = fd.get('entryIBS');
          const rec = { symbol, entryDate, entryPrice, status: 'open', source: 'manual', notes: fd.get('notes') || '' };
          if (String(ibsRaw || '').trim() !== '') rec.entryIBS = ibsFraction(ibsRaw);
          await API.post('/api/trades', rec);
          state.loaded.watches = false;
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('ema-alert-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await API.addEmaAlert({
            symbol: fd.get('symbol'), emaPeriod: Number(fd.get('emaPeriod')),
            buyLevelPct: Number(fd.get('buyLevelPct')), sellLevelPct: Number(fd.get('sellLevelPct')),
            nextAction: fd.get('nextAction'), thresholdPct: Number(fd.get('thresholdPct')), infoLevelPct: Number(fd.get('infoLevelPct')),
          });
          state.emaAlerts = await API.emaAlerts().catch(() => []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      root.querySelectorAll('[data-dea]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await API.deleteEmaAlert(b.dataset.dea);
          state.emaAlerts = await API.emaAlerts().catch(() => []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      root.querySelectorAll('[data-ema-on]').forEach((b) => b.addEventListener('click', async () => {
        const a = (state.emaAlerts || []).find((x) => String(x.id) === String(b.dataset.emaOn));
        if (!a) return;
        try {
          await API.updateEmaAlert(a.id, { enabled: a.enabled === false });
          state.emaAlerts = await API.emaAlerts().catch(() => []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      root.querySelectorAll('[data-ema-act]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await API.updateEmaAlert(b.dataset.emaAct, { nextAction: b.dataset.emaNext });
          state.emaAlerts = await API.emaAlerts().catch(() => []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      document.getElementById('watch-hidden-toggle')?.addEventListener('click', () => { state.watchShowHidden = !state.watchShowHidden; renderPage(); });
      document.getElementById('watch-export-json')?.addEventListener('click', () => {
        downloadJson('monitor-trades-' + nyseParts().iso + '.json', visibleMonitorTrades(state.monitorTrades, state.watchShowHidden));
      });
      document.getElementById('watch-export-csv')?.addEventListener('click', () => {
        const rows = visibleMonitorTrades(state.monitorTrades, state.watchShowHidden);
        const head = ['symbol', 'status', 'entryDate', 'exitDate', 'entryPrice', 'exitPrice', 'entryIBS', 'exitIBS', 'pnlPercent', 'pnlAbsolute'];
        const csv = [head.join(',')].concat(rows.map((t) => head.map((k) => JSON.stringify(t[k] ?? '')).join(','))).join('\n');
        Charts.downloadCsv('monitor-trades-' + nyseParts().iso + '.csv', csv);
      });
      document.getElementById('watch-margin')?.addEventListener('change', (e) => {
        state.monitorMarginPercent = normalizeMonitorMarginPercent(e.target.value);
        try { localStorage.setItem('monitor.marginPercent', String(state.monitorMarginPercent)); } catch (_) {}
        renderPage();
      });
      root.querySelectorAll('[data-wfilter]').forEach((b) => b.addEventListener('click', () => { state.watchTradeFilter = b.dataset.wfilter; renderPage(); }));
      root.querySelectorAll('[data-edit-mon]').forEach((b) => b.addEventListener('click', () => {
        const t = (state.monitorTrades || []).find((x) => String(x.id) === String(b.dataset.editMon));
        if (!t) return;
        const ibsIn = t.entryIBS == null ? '' : (ibsPct(t.entryIBS) ?? '');
        const ibsOut = t.exitIBS == null ? '' : (ibsPct(t.exitIBS) ?? '');
        setModal(`<div class="modal-backdrop"><div class="modal-card max-w-lg">
          <h3 class="text-lg font-semibold mb-3">Изменить ${esc(t.symbol || '')}</h3>
          <div id="em-err" class="text-sm text-red-600 mb-2 hidden"></div>
          <div class="grid sm:grid-cols-2 gap-2">
            <label class="block text-sm">Дата входа<input id="em-ed" class="field mt-1" value="${esc(t.entryDate || '')}" /></label>
            <label class="block text-sm">Дата выхода<input id="em-xd" class="field mt-1" value="${esc(t.exitDate || '')}" /></label>
            <label class="block text-sm">Цена входа<input id="em-ep" type="number" step="0.01" class="field mt-1" value="${esc(t.entryPrice ?? '')}" /></label>
            <label class="block text-sm">Цена выхода<input id="em-xp" type="number" step="0.01" class="field mt-1" value="${esc(t.exitPrice ?? '')}" /></label>
            <label class="block text-sm">IBS входа, %<input id="em-ei" type="number" step="0.1" class="field mt-1" value="${esc(ibsIn)}" /></label>
            <label class="block text-sm">IBS выхода, %<input id="em-xi" type="number" step="0.1" class="field mt-1" value="${esc(ibsOut)}" /></label>
            <label class="block text-sm">Количество<input id="em-qty" type="number" step="0.0001" class="field mt-1" value="${esc(t.quantity ?? '')}" /></label>
          </div>
          <label class="inline-flex items-center gap-2 text-sm mt-2"><input type="checkbox" id="em-hidden" ${t.isHidden ? 'checked' : ''} /> Скрыть из списка</label>
          <label class="inline-flex items-center gap-2 text-sm mt-2 ml-3"><input type="checkbox" id="em-test" ${t.isTest ? 'checked' : ''} /> Тестовая сделка</label>
          <label class="block text-sm mt-2 mb-3">Заметки<input id="em-notes" class="field mt-1" value="${esc(t.notes || '')}" /></label>
          <div class="flex justify-end gap-2"><button id="em-cancel" class="btn-secondary">Отмена</button><button id="em-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
        </div></div>`);
        document.getElementById('em-cancel')?.addEventListener('click', closeModal);
        document.getElementById('em-save')?.addEventListener('click', async () => {
          const errEl = document.getElementById('em-err');
          try {
            const payload = {
              entryDate: document.getElementById('em-ed').value,
              exitDate: document.getElementById('em-xd').value,
              entryPrice: Number(document.getElementById('em-ep').value),
              exitPrice: document.getElementById('em-xp').value === '' ? null : Number(document.getElementById('em-xp').value),
              quantity: document.getElementById('em-qty').value === '' ? null : Number(document.getElementById('em-qty').value),
              notes: document.getElementById('em-notes').value,
              isHidden: document.getElementById('em-hidden').checked,
              isTest: document.getElementById('em-test').checked,
            };
            const ei = document.getElementById('em-ei').value;
            const xi = document.getElementById('em-xi').value;
            if (ei.trim() !== '') payload.entryIBS = ibsFraction(ei);
            if (xi.trim() !== '') payload.exitIBS = ibsFraction(xi);
            await API.patchTrade(t.id, payload);
            closeModal();
            state.loaded.watches = false;
            renderPage();
          } catch (err) { errEl.textContent = errText(err); errEl.classList.remove('hidden'); }
        });
      }));
      if (window.__watchTick) { clearInterval(window.__watchTick); window.__watchTick = null; }
      if (document.getElementById('watch-countdown')) {
        window.__watchTick = setInterval(() => {
          const n = document.getElementById('watch-countdown');
          if (n) n.textContent = formatDuration(secondsToNextSignal());
          else { clearInterval(window.__watchTick); window.__watchTick = null; }
        }, 1000);
      }
      const eq = document.getElementById('watch-eq');
      if (eq) Charts.line(eq, monitorStats(applyMonitorMarginSimulation(state.monitorTrades, state.monitorMarginPercent)).equity, isDark());
    }

    if (p === '/broker') {
      if (!state.loaded.broker) {
        const [bt, tok, ac, dash, logs, st, w, cons] = await Promise.all([
          API.brokerTrades().catch(() => []),
          API.tokenStatus().catch((e) => e.data || { present: false, hasToken: false }),
          API.autoConfig().catch(() => ({})),
          API.dashboard(true).catch((e) => (e && e.data) || { error: (e && e.message) || 'dashboard', positions: [] }),
          API.logs(300).catch(() => ({ logs: [] })),
          API.autoStatus().catch(() => null),
          API.watches().catch(() => []),
          API.consistency().catch(() => ({ issues: [] })),
        ]);
        state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
        state.token = tok;
        state.autoConfig = ac && ac.config ? ac.config : (ac || {});
        state.dashboard = dash || {};
        state.autoLogs = logs || { logs: [] };
        state.autoStatus = st;
        if (Array.isArray(w)) state.watches = w;
        state.consistency = cons || state.consistency || { issues: [] };
        const symbols = (state.watches || []).map((x) => x.symbol).filter(Boolean);
        if (symbols.length) {
          try {
            const batch = await API.webullBatch(symbols);
            const map = {};
            (batch.results || []).forEach((row) => { if (row && row.symbol) map[row.symbol] = row; });
            state.brokerQuotes = map;
          } catch (_) { state.brokerQuotes = state.brokerQuotes || {}; }
        }
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
          try {
            await API.del('/api/broker-trades/' + b.dataset.bd);
            const bt = await API.brokerTrades().catch(() => []);
            state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
            renderPage();
          } catch (err) { toast(errText(err)); }
        });
      }));
      document.getElementById('broker-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const symbol = String(fd.get('symbol') || '').toUpperCase().trim();
        const entryDate = String(fd.get('entryDate') || '');
        const exitDate = String(fd.get('exitDate') || '');
        const entryPrice = Number(fd.get('entryPrice'));
        const exitPrice = Number(fd.get('exitPrice'));
        if (!symbol) { toast('Укажите тикер'); return; }
        if (exitDate && entryDate && exitDate < entryDate) { toast('Дата выхода не может быть раньше даты входа'); return; }
        if (fd.get('entryPrice') && !(entryPrice > 0)) { toast('Цена входа должна быть положительной'); return; }
        try {
          const rec = {
            symbol, entryDate, entryPrice,
            quantity: fd.get('quantity') ? Number(fd.get('quantity')) : undefined,
            notes: fd.get('notes') || '',
            source: 'manual',
            status: (exitDate && exitPrice > 0) ? 'closed' : 'open',
          };
          if (exitDate) rec.exitDate = exitDate;
          if (exitPrice > 0) rec.exitPrice = exitPrice;
          await API.post('/api/broker-trades', rec);
          const bt = await API.brokerTrades().catch(() => []);
          state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      root.querySelectorAll('[data-edit-bt]').forEach((b) => b.addEventListener('click', () => {
        const t = (state.broker || []).find((x) => String(x.id) === String(b.dataset.editBt));
        if (!t) return;
        const ibsOut = t.exitIBS == null ? '' : (ibsPct(t.exitIBS) ?? '');
        setModal(`<div class="modal-backdrop"><div class="modal-card max-w-lg">
          <h3 class="text-lg font-semibold mb-2">Редактировать broker-сделку: ${esc(t.symbol)}</h3>
          <p class="text-sm text-gray-500 mb-3">Заполните дату и цену выхода, чтобы ручной записью закрыть сделку в broker-журнале сайта.</p>
          <div id="eb-err" class="text-sm text-red-600 mb-2 hidden"></div>
          <div class="grid sm:grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-sm mb-3 dark:bg-gray-950/40">
            <div><div class="text-xs text-gray-500">Вход</div><div class="font-mono">${esc(t.entryDate || '—')}</div></div>
            <div><div class="text-xs text-gray-500">Цена входа</div><div class="font-mono">${t.entryPrice == null ? '—' : fmt(t.entryPrice)}</div></div>
            <div><div class="text-xs text-gray-500">Статус</div><div>${t.status === 'open' ? 'открыта' : 'закрыта'}</div></div>
          </div>
          <div class="grid sm:grid-cols-2 gap-2">
            <label class="text-sm">Дата выхода<input id="eb-xd" class="field mt-1" value="${esc(t.exitDate || '')}" /></label>
            <label class="text-sm">Цена выхода<input id="eb-xp" type="number" step="0.01" class="field mt-1" value="${esc(t.exitPrice ?? '')}" /></label>
            <label class="text-sm col-span-2">Exit IBS, %<input id="eb-ibs" type="number" step="0.1" min="0" max="100" class="field mt-1" value="${esc(ibsOut)}" placeholder="Необязательно" /></label>
          </div>
          <label class="inline-flex items-center gap-2 text-sm mt-2"><input type="checkbox" id="eb-hidden" ${t.isHidden ? 'checked' : ''} /> Скрыть из списка</label>
          <label class="inline-flex items-center gap-2 text-sm mt-2 ml-3"><input type="checkbox" id="eb-test" ${t.isTest ? 'checked' : ''} /> Тестовая сделка</label>
          <label class="block text-sm mt-2 mb-3">Заметки<textarea id="eb-notes" class="field mt-1 w-full" rows="3">${esc(t.notes || '')}</textarea></label>
          <div class="flex justify-end gap-2"><button id="eb-cancel" class="btn-secondary">Отмена</button><button id="eb-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
        </div></div>`);
        document.getElementById('eb-cancel')?.addEventListener('click', closeModal);
        document.getElementById('eb-save')?.addEventListener('click', async () => {
          const errEl = document.getElementById('eb-err');
          const exitDate = document.getElementById('eb-xd').value.trim();
          const exitPriceRaw = document.getElementById('eb-xp').value.trim();
          const ibsRaw = document.getElementById('eb-ibs').value.trim();
          if (exitDate && t.entryDate && exitDate < t.entryDate) { errEl.textContent = 'Дата выхода не может быть раньше даты входа.'; errEl.classList.remove('hidden'); return; }
          const hasExit = t.status === 'closed' || exitDate || exitPriceRaw || ibsRaw;
          if (hasExit && !exitDate) { errEl.textContent = 'Укажите дату выхода.'; errEl.classList.remove('hidden'); return; }
          const exitPrice = exitPriceRaw === '' ? undefined : Number(exitPriceRaw);
          if (hasExit && !(exitPrice > 0)) { errEl.textContent = 'Укажите корректную цену выхода.'; errEl.classList.remove('hidden'); return; }
          if (ibsRaw !== '') {
            const n = Number(ibsRaw);
            if (!Number.isFinite(n) || n < 0 || n > 100) { errEl.textContent = 'Exit IBS должен быть в диапазоне 0-100%.'; errEl.classList.remove('hidden'); return; }
          }
          try {
            const payload = {
              notes: document.getElementById('eb-notes').value.trim() || null,
              isHidden: document.getElementById('eb-hidden').checked,
              isTest: document.getElementById('eb-test').checked,
            };
            if (hasExit) {
              payload.exitDate = exitDate;
              payload.exitPrice = exitPrice;
              if (ibsRaw !== '') payload.exitIBS = Number(ibsRaw) / 100;
            }
            await API.patchBrokerTrade(t.id, payload);
            closeModal();
            const bt = await API.brokerTrades().catch(() => []);
            state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
            renderPage();
          } catch (err) { errEl.textContent = errText(err); errEl.classList.remove('hidden'); }
        });
      }));
      root.querySelectorAll('[data-bq]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const row = await API.quote(b.dataset.bq, 'webull').catch(() => API.quote(b.dataset.bq));
          state.brokerQuotes = { ...(state.brokerQuotes || {}), [b.dataset.bq]: row };
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      document.getElementById('broker-show-hidden')?.addEventListener('click', () => { state.brokerShowHidden = !state.brokerShowHidden; renderPage(); });
      document.getElementById('broker-journal-refresh')?.addEventListener('click', () => { state.loaded.broker = false; renderPage(); });
      root.querySelectorAll('[data-hide-bt]').forEach((b) => b.addEventListener('click', async () => {
        const t = (state.broker || []).find((x) => String(x.id) === String(b.dataset.hideBt));
        if (!t) return;
        try {
          await API.patchBrokerTrade(t.id, { isHidden: !t.isHidden });
          const bt = await API.brokerTrades().catch(() => []);
          state.broker = Array.isArray(bt) ? bt : (bt.trades || []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      document.getElementById('broker-reconcile')?.addEventListener('click', async () => {
        try {
          const r = await API.reconcile('apply');
          toast((r && r.status) || 'Reconcile');
          state.loaded.broker = false;
          renderPage();
        } catch (err) { toast(err.message); }
      });
      document.getElementById('broker-quotes-refresh')?.addEventListener('click', async () => {
        state.loaded.broker = false;
        renderPage();
      });
      async function reloadBroker() {
        state.loaded.broker = false;
        renderPage();
      }
      document.getElementById('auto-token-check')?.addEventListener('click', async () => {
        try { const r = await API.tokenCheck(); toast(r.status || r.lastCheckStatus || 'Проверено'); await reloadBroker(); } catch (err) { toast(err.message); }
      });
      document.getElementById('auto-token-create')?.addEventListener('click', async () => {
        try { const r = await API.tokenCreate(); toast(r.persisted ? 'Токен создан' : (r.error || 'Создан')); await reloadBroker(); } catch (err) { toast(err.message); }
      });
      document.getElementById('auto-token-save')?.addEventListener('click', async () => {
        const tok = document.getElementById('auto-token-input')?.value.trim();
        if (!tok) { toast('Вставьте токен'); return; }
        try { await API.saveToken(tok); toast('Токен сохранён'); await reloadBroker(); } catch (err) { toast(err.message); }
      });
      document.getElementById('auto-enable')?.addEventListener('click', async () => {
        const on = !(state.autoConfig && state.autoConfig.enabled);
        if (on && !window.confirm('Включить живую автоторговлю?')) return;
        try {
          const saved = await API.saveAutoConfig({ enabled: on });
          state.autoConfig = saved && saved.config ? saved.config : { ...(state.autoConfig || {}), enabled: on };
          toast(on ? 'Автоторговля включена' : 'Автоторговля выключена');
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('auto-test-buy')?.addEventListener('click', async () => {
        if (!window.confirm('Отправить BUY AAL 1 шт по рынку?')) return;
        try {
          const r = await API.testBuy('AAL', 1);
          toast(r.submitted ? ('Ордер ' + (r.clientOrderId || 'отправлен')) : (r.error || 'не отправлен'));
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('auto-refresh')?.addEventListener('click', () => { reloadBroker(); });
      root.querySelectorAll('[data-close-pos]').forEach((b) => b.addEventListener('click', async () => {
        if (!window.confirm('Закрыть позицию ' + b.dataset.closePos + ' рыночным ордером в Webull?')) return;
        try { const r = await API.closePosition(b.dataset.closePos); toast(r.submitted || r.success ? 'Ордер на закрытие отправлен' : errText({ message: r.error || 'не отправлен', data: r })); await reloadBroker(); } catch (err) { toast(errText(err)); }
      }));
    }

    if (p === '/settings') {
      if (!state.loaded.settings) {
        try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
        try {
          const ac = await API.autoConfig() || {};
          state.autoConfig = ac.config || ac;
        } catch (_) { state.autoConfig = {}; }
        // The autotrade tab names the tickers it will actually trade, and that
        // list is the monitoring one.
        try { state.watches = await API.watches() || []; } catch (_) { state.watches = state.watches || []; }
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
          const updates = {
            enabled: form.autoEnabled.checked,
            allowNewEntries: !!form.autoAllowEntries?.checked,
            allowExits: !!form.autoAllowExits?.checked,
            allowFractionalShares: !!form.autoFractional?.checked,
            provider: fd.get('autoQuote') || 'finnhub',
            entryCapitalMode: fd.get('entryCapitalMode') || 'standard_safe',
            lowIBS: Number(fd.get('autoLowIBS')),
            highIBS: Number(fd.get('autoHighIBS')),
            executionWindowSeconds: Number(fd.get('autoWindow')),
            maxSlippageBps: Number(fd.get('autoSlippage')),
          };
          try {
            const saved = await API.saveAutoConfig(updates);
            state.autoConfig = { ...(state.autoConfig || {}), ...(saved && saved.config ? saved.config : updates) };
          } catch (err) { toast(err.message); }
        }
        for (const k of ['autoEnabled', 'autoQuote', 'entryCapitalMode', 'autoAllowEntries', 'autoAllowExits',
          'autoFractional', 'autoLowIBS', 'autoHighIBS', 'autoWindow', 'autoSlippage']) delete body[k];
        try {
          await API.saveSettings(body);
          state.settings = { ...state.settings, ...body };
          const msg = document.getElementById('set-msg');
          if (msg) msg.textContent = 'Сохранено';
          toast('Сохранено');
        } catch (err) { toast(errText(err)); }
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

  function calcTickerRefs(names) {
    return (names || []).map((t) => ({ ticker: t }));
  }
  async function loadSelected() {
    const sel = parseTickers(pageTickerText());
    if (!sel.length) throw new Error('Укажите тикеры');
    const have = {};
    (state.tickersData || []).forEach((x) => {
      if (x && x.ticker && (x.data || []).length) have[x.ticker] = x;
    });
    if (sel.every((t) => have[t])) {
      const loaded = sel.map((t) => have[t]);
      state.tickersData = loaded;
      state.ticker = loaded[0].ticker;
      state.bars = loaded[0].data || [];
      return loaded;
    }
    const rows = await Promise.all(sel.map(async (t) => {
      try {
        const ds = await API.dataset(t);
        return { ticker: t, data: ds.data || [] };
      } catch (_) {
        return { ticker: t, data: [] };
      }
    }));
    const loaded = rows.filter((x) => (x.data || []).length);
    const missing = rows.filter((x) => !(x.data || []).length).map((x) => x.ticker);
    if (!loaded.length) throw new Error('Нет датасетов: ' + (missing.join(', ') || sel.join(', ')));
    if (missing.length) state.error = 'Нет данных: ' + missing.join(', ');
    else state.error = null;
    state.tickersData = loaded;
    state.ticker = loaded[0].ticker;
    state.bars = loaded[0].data || [];
    return loaded;
  }

  async function runStocks() {
    const names = parseTickers(state.tickerInput);
    if (!names.length) { state.error = 'Укажите тикеры'; renderPage(); return; }
    state.running = true;
    const btn = document.getElementById('run-bt');
    if (btn) { btn.disabled = true; btn.textContent = 'Считаем…'; }
    try {
      const tp = Number(String(state.takeProfit).replace(',', '.'));
      const single = { allowSameDayReentry: true };
      if (Number.isFinite(tp) && tp > 0) single.takeProfitPercent = tp;
      const lev = (state.leverage || 200) / 100;
      const payload = {
        tickers: calcTickerRefs(names),
        strategy: defaultStrategy(),
        leverage: lev,
        single,
      };
      if (lev > 1) payload.includeBaseline = true;
      const [raw] = await Promise.all([
        API.calc('single-position', payload),
        loadSelected(),
      ]);
      state.result = resultOf(raw);
      state.baselineResult = lev > 1 ? resultOf(raw && raw.baseline) : null;
      state.stockTab = 'summary';
      state.tradesPage = 1;
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
      const names = parseTickers(state.optTickers);
      const [stock] = await Promise.all([
        API.calc('single-position', { tickers: calcTickerRefs(names), strategy: defaultStrategy(), leverage: Number(fd.get('leverage') || 200) / 100, single: { allowSameDayReentry: true } }),
        loadSelected(),
      ]);
      const r = await API.calc('options-multi', {
        tickers: calcTickerRefs(names), trades: stock.trades,
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
        await API.refreshDataset(t, refreshProvider());
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

  function currentTradesForTable() {
    if (state.page === '/ema') return (resultOf(state.emaResult) || {}).trades || [];
    if (state.page === '/multi-ticker-options') return (resultOf(state.optResult) || {}).trades || [];
    return (state.result && state.result.trades) || [];
  }
  function bindTradesPager(root) {
    root.querySelectorAll('[data-trades-page]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.tradesPage);
      if (!Number.isFinite(n) || n < 1) return;
      state.tradesPage = n;
      const host = document.getElementById('trades-table-host');
      if (!host) { renderPage(); return; }
      const wrap = document.createElement('div');
      wrap.innerHTML = tradesTable(currentTradesForTable(), { page: state.tradesPage });
      host.replaceWith(wrap.firstElementChild);
      bindTradesPager(document.getElementById('page-root'));
    }));
    root.querySelectorAll('[data-export-trades]').forEach((b) => b.addEventListener('click', () => {
      downloadJson('trades-' + nyseParts().iso + '.json', currentTradesForTable());
    }));
  }
  function setPriceChartFsClass(shell) {
    const on = !!state.priceChartUi.fullscreen;
    if (shell) shell.classList.toggle('pc-fs', on);
    document.body.classList.toggle('pc-fs-lock', on);
    const btn = shell && shell.querySelector('[data-pc-fs]');
    if (btn) {
      const title = on ? 'Свернуть' : 'Во весь экран';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = icon(on ? 'minimize' : 'maximize', 'h-4 w-4');
    }
  }
  function ensurePcEsc() {
    if (state.priceChartUi._esc) return;
    state.priceChartUi._esc = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (state.priceChartUi.fullscreen) {
        state.priceChartUi.fullscreen = false;
        const shell = document.querySelector('[data-pc-shell]');
        setPriceChartFsClass(shell);
        if (shell && state.priceChartUi.chartId) requestAnimationFrame(() => paintPriceChart(state.priceChartUi.chartId));
        return;
      }
      if (state.priceChartUi.tickerOpen) {
        state.priceChartUi.tickerOpen = false;
        document.querySelector('[data-pc-ticker-menu]')?.classList.add('hidden');
      }
      if (state.priceChartUi.indOpen) {
        state.priceChartUi.indOpen = false;
        state.priceChartUi.styleFor = null;
        const shell = document.querySelector('[data-pc-shell]');
        shell?.querySelector('[data-pc-ind-panel]')?.classList.add('hidden');
        const ind = shell?.querySelector('[data-pc-ind]');
        if (ind) {
          ind.classList.remove('pc-ind-btn-on');
          ind.setAttribute('aria-expanded', 'false');
        }
        shell?.querySelectorAll('[data-pc-style-panel]').forEach((el) => el.classList.remove('is-open'));
      }
    });
    document.addEventListener('click', () => {
      if (!state.priceChartUi.tickerOpen) return;
      state.priceChartUi.tickerOpen = false;
      document.querySelector('[data-pc-ticker-menu]')?.classList.add('hidden');
    });
  }
  function applyPcLine(target, patch) {
    const p = state.priceChart;
    if (target === 'ema20' || target === 'ema200') {
      if (patch.color) p[target + 'Color'] = patch.color;
      if (patch.width) p[target + 'Width'] = patch.width;
      if (patch.style != null) p[target + 'Style'] = patch.style;
      return;
    }
    const b = (p.bands || []).find((x) => x.id === target);
    if (!b) return;
    if (patch.color) b.color = patch.color;
    if (patch.width) b.width = patch.width;
    if (patch.style != null) b.style = patch.style;
  }
  function syncPcStyleUi(shell, target) {
    const p = state.priceChart;
    let color; let width; let ls;
    if (target === 'ema20') { color = p.ema20Color; width = p.ema20Width; ls = p.ema20Style; }
    else if (target === 'ema200') { color = p.ema200Color; width = p.ema200Width; ls = p.ema200Style; }
    else {
      const b = (p.bands || []).find((x) => x.id === target);
      if (!b) return;
      color = b.color; width = b.width; ls = b.style;
    }
    shell.querySelectorAll('[data-pc-color="' + target + '"]').forEach((btn) => {
      btn.classList.toggle('pc-swatch-on', btn.dataset.color === color);
    });
    shell.querySelectorAll('[data-pc-width="' + target + '"]').forEach((btn) => {
      btn.className = Number(btn.dataset.w) === Number(width) ? 'pc-seg-on' : 'pc-seg-off';
    });
    shell.querySelectorAll('[data-pc-ls="' + target + '"]').forEach((btn) => {
      btn.className = Number(btn.dataset.s) === Number(ls) ? 'pc-seg-on' : 'pc-seg-off';
    });
    const dot = shell.querySelector('[data-pc-dot="' + target + '"]');
    if (dot) dot.style.background = color;
  }
  function bindPriceChartControls(chartId) {
    const shell = document.querySelector('[data-pc-shell]');
    if (!shell) {
      document.body.classList.remove('pc-fs-lock');
      state.priceChartUi.fullscreen = false;
      return;
    }
    state.priceChartUi.chartId = chartId;
    ensurePcEsc();
    setPriceChartFsClass(shell);
    shell.querySelector('[data-pc-ticker-toggle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.priceChartUi.tickerOpen = !state.priceChartUi.tickerOpen;
      shell.querySelector('[data-pc-ticker-menu]')?.classList.toggle('hidden', !state.priceChartUi.tickerOpen);
    });
    shell.querySelector('[data-pc-ticker-menu]')?.addEventListener('click', (e) => e.stopPropagation());
    shell.querySelectorAll('[data-pc-ticker]').forEach((b) => b.addEventListener('click', () => {
      hp().ticker = b.dataset.pcTicker;
      state.priceChartUi.tickerOpen = false;
      renderPage();
    }));
    shell.querySelectorAll('[data-pc-range]').forEach((b) => b.addEventListener('click', () => {
      state.priceChart.range = b.dataset.pcRange;
      persistPriceChart();
      shell.querySelectorAll('[data-pc-range]').forEach((x) => {
        x.className = 'hero-range ' + (x.dataset.pcRange === state.priceChart.range ? 'hero-range-on' : 'hero-range-off');
      });
      paintPriceChart(chartId);
    }));
    shell.querySelector('[data-pc-ind]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.priceChartUi.indOpen = !state.priceChartUi.indOpen;
      if (!state.priceChartUi.indOpen) state.priceChartUi.styleFor = null;
      const panel = shell.querySelector('[data-pc-ind-panel]');
      panel?.classList.toggle('hidden', !state.priceChartUi.indOpen);
      const btn = shell.querySelector('[data-pc-ind]');
      if (btn) {
        btn.classList.toggle('pc-ind-btn-on', state.priceChartUi.indOpen);
        btn.setAttribute('aria-expanded', state.priceChartUi.indOpen ? 'true' : 'false');
      }
      if (!state.priceChartUi.indOpen) {
        shell.querySelectorAll('[data-pc-style-panel]').forEach((el) => el.classList.remove('is-open'));
      }
    });
    shell.querySelector('[data-pc-fs]')?.addEventListener('click', () => {
      state.priceChartUi.fullscreen = !state.priceChartUi.fullscreen;
      setPriceChartFsClass(shell);
      requestAnimationFrame(() => paintPriceChart(chartId));
    });
    shell.querySelectorAll('[data-pc]').forEach((inp) => {
      inp.addEventListener('change', () => {
        state.priceChart[inp.dataset.pc] = inp.checked;
        persistPriceChart();
        paintPriceChart(chartId);
      });
    });
    shell.querySelectorAll('[data-pc-band-on]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const b = (state.priceChart.bands || []).find((x) => x.id === inp.dataset.pcBandOn);
        if (b) b.enabled = inp.checked;
        persistPriceChart();
        paintPriceChart(chartId);
      });
    });
    shell.querySelectorAll('[data-pc-band-pct]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const n = Number(inp.value);
        const b = (state.priceChart.bands || []).find((x) => x.id === inp.dataset.pcBandPct);
        if (!b || !Number.isFinite(n)) return;
        b.pct = n;
        const lab = shell.querySelector('[data-pc-band-lab="' + b.id + '"]');
        if (lab) lab.textContent = formatBandLabel(n);
        persistPriceChart();
        paintPriceChart(chartId);
      });
    });
    shell.querySelectorAll('[data-pc-style]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.pcStyle;
        state.priceChartUi.styleFor = state.priceChartUi.styleFor === id ? null : id;
        shell.querySelectorAll('[data-pc-style-panel]').forEach((el) => {
          el.classList.toggle('is-open', el.dataset.pcStylePanel === state.priceChartUi.styleFor);
        });
        shell.querySelectorAll('[data-pc-style]').forEach((b) => {
          b.classList.toggle('icon-btn-active', b.dataset.pcStyle === state.priceChartUi.styleFor);
        });
      });
    });
    shell.querySelectorAll('[data-pc-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPcLine(btn.dataset.pcColor, { color: btn.dataset.color });
        persistPriceChart();
        syncPcStyleUi(shell, btn.dataset.pcColor);
        paintPriceChart(chartId);
      });
    });
    shell.querySelectorAll('[data-pc-width]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPcLine(btn.dataset.pcWidth, { width: Number(btn.dataset.w) });
        persistPriceChart();
        syncPcStyleUi(shell, btn.dataset.pcWidth);
        paintPriceChart(chartId);
      });
    });
    shell.querySelectorAll('[data-pc-ls]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPcLine(btn.dataset.pcLs, { style: Number(btn.dataset.s) });
        persistPriceChart();
        syncPcStyleUi(shell, btn.dataset.pcLs);
        paintPriceChart(chartId);
      });
    });
    shell.querySelector('[data-pc-band-add]')?.addEventListener('click', () => {
      state.priceChart.bands = state.priceChart.bands || [];
      state.priceChart.bands.push({ id: 'band-' + Date.now(), pct: 10, enabled: true, color: '#64748B', width: 1, style: 2 });
      state.priceChartUi.indOpen = true;
      persistPriceChart();
      renderPage();
    });
    shell.querySelectorAll('[data-pc-band-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.priceChart.bands = (state.priceChart.bands || []).filter((x) => x.id !== btn.dataset.pcBandDel);
        persistPriceChart();
        renderPage();
      });
    });
    shell.querySelector('[data-pc-csv]')?.addEventListener('click', () => {
      const bars = barsForTicker(selectedHeroTicker());
      Charts.downloadCsv((selectedHeroTicker() || 'chart') + '.csv', Charts.csvFromBars(bars));
    });
  }
  function paintPriceChart(chartId) {
    const el = document.getElementById(chartId);
    if (!el) return;
    const p = state.priceChart || {};
    const t = selectedHeroTicker();
    const result = state.page === '/ema' ? resultOf(state.emaResult) : (state.page === '/multi-ticker-options' ? resultOf(state.optResult) : resultOf(state.result));
    const emaForm = state.page === '/ema' ? (state.emaRunParams || state.emaForm) : null;
    Charts.destroy();
    Charts.priceChart(el, barsForTicker(t), {
      dark: isDark(),
      ticker: t,
      ema20: p.ema20 !== false,
      ema200: p.ema200 !== false,
      ema20Color: p.ema20Color,
      ema20Width: p.ema20Width,
      ema20Style: p.ema20Style,
      ema200Color: p.ema200Color,
      ema200Width: p.ema200Width,
      ema200Style: p.ema200Style,
      emaBands: p.bands,
      ibs: p.ibs !== false,
      volume: p.volume !== false,
      showTrades: p.trades !== false,
      trades: tradesForTicker(t, result),
      splits: p.splits === false ? [] : ((state.splitsMap && state.splitsMap[t]) || []),
      range: p.range || 'MAX',
      indicatorPanePercent: Number(state.settings.indicatorPanePercent) || 18,
      emaPeriod: emaForm && emaForm.period,
      emaStartMode: emaForm && emaForm.start,
      buyZones: emaForm && emaForm.buyZones,
      sellZones: emaForm && emaForm.sellZones,
    });
  }
  function paintHistograms() {
    const r = state.page === '/ema' ? resultOf(state.emaResult) : (state.page === '/multi-ticker-options' ? resultOf(state.optResult) : resultOf(state.result));
    if (!r) return;
    const dark = isDark();
    const pnlEl = document.getElementById('chart-pnl-hist');
    if (pnlEl && Charts.histogram) {
      const pts = (r.trades || []).map((t, i) => ({ date: t.exitDate || t.entryDate || ('1970-01-' + String((i % 28) + 1).padStart(2, '0')), value: Number(t.pnlPercent) || 0 }));
      Charts.histogram(pnlEl, pts, dark);
    }
    const durEl = document.getElementById('chart-dur-hist');
    if (durEl && Charts.histogram) {
      const pts = (r.trades || []).map((t, i) => ({
        date: t.exitDate || t.entryDate || ('1970-01-' + String((i % 28) + 1).padStart(2, '0')),
        value: Number(t.duration) || 0,
        color: (Number(t.pnl) || 0) >= 0 ? '#16a34a' : '#dc2626',
      }));
      const avg = pts.length ? pts.reduce((s, p) => s + p.value, 0) / pts.length : 0;
      Charts.histogram(durEl, pts, dark, { refValue: avg, refTitle: 'среднее' });
    }
  }
  function paintStockCharts() {
    const r = state.result;
    if (!r) return;
    const dark = isDark();
    if (state.stockTab === 'summary' && document.getElementById('chart-hero')) {
      paintCurrentHero();
      return;
    }
    if (state.stockTab === 'price') paintPriceChart('chart-price');
    if (state.stockTab === 'tickerCharts' && document.getElementById('ticker-charts')) {
      const host = document.getElementById('ticker-charts');
      const trades = r.trades || [];
      host.innerHTML = (state.tickersData || []).map((t) => {
        const bars = t.data || [];
        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const px = last ? last.close : null;
        const chg = last && prev && prev.close ? ((last.close - prev.close) / prev.close) * 100 : null;
        const tt = trades.filter((tr) => tradeTicker(tr) === t.ticker);
        const wins = tt.filter((tr) => (tr.pnl || 0) > 0).length;
        const pnl = tt.reduce((s, tr) => s + (Number(tr.pnl) || 0), 0);
        const avgDur = tt.length ? tt.reduce((s, tr) => s + (Number(tr.duration) || 0), 0) / tt.length : 0;
        return `<div class="rounded-lg border p-2 dark:border-gray-800">
          <div class="flex items-center justify-between text-sm mb-1"><div class="font-semibold">${esc(t.ticker)}</div><div>${px == null ? '—' : fmt(px)} <span class="${pnlClass(chg)}">${chg == null ? '' : fmtSignedPct(chg, 2)}</span></div></div>
          <div class="text-[11px] text-gray-500 mb-1">Баров: ${bars.length}</div>
          <div id="tc-${esc(t.ticker)}" class="chart-box rounded border dark:border-gray-800"></div>
          <div class="ticker-mini-stats mt-1"><div>Сделок ${tt.length}</div><div>Win ${tt.length ? fmt((wins / tt.length) * 100, 0) : '—'}%</div><div>PnL ${fmtUsd(pnl)}</div><div>Ср. дни ${fmt(avgDur, 1)}</div></div>
        </div>`;
      }).join('');
      (state.tickersData || []).forEach((t) => {
        const el = document.getElementById('tc-' + t.ticker);
        if (el) Charts.candles(el, (t.data || []).slice(-30), dark);
      });
    }
    if (state.stockTab === 'equity') Charts.richLine(document.getElementById('chart-eq'), r.equity, dark, { area: true, color: '#4f46e5', compare: state.baselineResult && state.baselineResult.equity, compareColor: '#94a3b8' });
    if (state.stockTab === 'drawdown') {
      const pts = (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown }));
      const withDd = pts.filter((p) => (p.value || 0) > 0);
      const stats = document.getElementById('dd-stats');
      if (stats) stats.innerHTML = `<div class="grid grid-cols-3 gap-2 text-sm"><div class="rounded border p-2">Макс. дневная просадка<div class="font-semibold">${fmt(Math.max.apply(null, pts.map((p) => p.value || 0).concat([0])), 2)}%</div></div><div class="rounded border p-2">Точек с просадкой<div class="font-semibold">${withDd.length}/${pts.length}</div></div><div class="rounded border p-2">Частота<div class="font-semibold">${pts.length ? fmt((withDd.length / pts.length) * 100, 1) : 0}%</div></div></div>`;
      const el = document.getElementById('chart-dd');
      if (el) Charts.richLine(el, pts, dark, { area: true, color: '#dc2626', topColor: '#dc262644', bottomColor: '#dc262608' });
    }
    if (state.stockTab === 'exposure' && r.exposure) {
      const pts = r.exposure.map((p) => ({ date: p.date, value: p.exposurePct }));
      const avg = pts.length ? pts.reduce((s, p) => s + (Number(p.value) || 0), 0) / pts.length : 0;
      const lab = document.getElementById('exp-avg');
      if (lab) lab.textContent = 'Средняя экспозиция: ' + fmt(avg, 1) + '%';
      const el = document.getElementById('chart-exp');
      if (el) Charts.richLine(el, pts, dark, { area: true, color: '#0ea5e9', refValue: 100, refTitle: '100%' });
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
    if (tab === 'price') paintPriceChart('chart-ema-price');
    if (tab === 'emaDeviation') {
      const t = selectedHeroTicker();
      const dev = (r.deviation || []).filter((p) => !p.ticker || p.ticker === t);
      const el = document.getElementById('chart-ema-dev');
      const zones = state.emaRunParams || state.emaForm;
      if (el) Charts.deviationChart(el, dev.map((p) => ({ date: p.date, value: p.deviationPct })), dark, {
        buyZones: zones.buyZones, sellZones: zones.sellZones, trades: tradesForTicker(t, r),
      });
    }
    if (tab === 'equity') {
      const el = document.getElementById('chart-ema-eq');
      if (el) Charts.richLine(el, r.equity, dark, { area: true, compare: state.emaBaseline && state.emaBaseline.equity });
    }
    if (tab === 'drawdown') {
      const el = document.getElementById('chart-ema-dd');
      if (el) Charts.richLine(el, (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, { area: true, color: '#dc2626' });
    }
    if (tab === 'exposure' && r.exposure?.length) {
      const el = document.getElementById('chart-ema-exp');
      if (el) Charts.richLine(el, r.exposure.map((p) => ({ date: p.date, value: p.exposurePct })), dark, { area: true, color: '#0ea5e9', refValue: 100, refTitle: '100%' });
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
    if (tab === 'price') paintPriceChart('chart-opt-price');
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
      if (el) paintSplitsForTickers(el, parseTickers(state.optTickers));
    }
  }
  async function paintSplitsForTickers(el, tickers) {
    const list = ((tickers && tickers.length) ? tickers : (state.tickersData || []).map((t) => t.ticker).filter(Boolean)).slice();
    if (!list.length && state.ticker) list.push(state.ticker);
    try {
      const cards = [];
      let total = 0;
      for (const sym of list) {
        const evs = await API.tickerSplits(sym).catch(() => []);
        const arr = Array.isArray(evs) ? evs : [];
        total += arr.length;
        const last = arr.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
        cards.push(`<div class="rounded-lg border p-3"><div class="font-mono font-semibold">${esc(sym)}</div><div class="text-xs text-gray-500">Найдено ${arr.length} событий${last ? ' · последний ' + esc(fmtTradingDate(last.date)) : ''}</div><a class="text-xs text-indigo-600" href="https://seekingalpha.com/symbol/${esc(sym)}/splits" target="_blank" rel="noopener">Seeking Alpha</a>${arr.map((e) => `<div class="text-sm">${esc(fmtTradingDate(e.date))} × ${esc(e.factor)}</div>`).join('') || '<div class="text-sm text-gray-500">Нет сплитов</div>'}</div>`);
      }
      el.innerHTML = `<div class="text-sm text-gray-500 mb-2">Всего сплитов: ${total}</div><div class="grid md:grid-cols-2 gap-3">${cards.join('')}</div>`;
    } catch (e) { el.textContent = errText(e); }
  }

  async function fillNested(id, name, extra) {
    const el = document.getElementById(id);
    if (!el) return;
    const st = extra && extra.strategy ? extra.strategy : defaultStrategy();
    try {
      el.textContent = 'Считаем…';
      const raw = await API.calc(name, { data: state.bars, strategy: st, trades: state.result.trades, ticker: state.ticker, tickers: extra && extra.tickers ? extra.tickers : state.tickersData, ...extra });
      const r = resultOf(raw);
      if (!r) { el.textContent = 'Нет результата'; return; }
      if (!r.metrics || typeof r.metrics !== 'object' || (r.metrics.profitFactor == null && r.metrics.totalReturn == null && !Object.keys(r.metrics).length)) {
        try {
          const m = await API.calc('metrics', { trades: r.trades, equity: r.equity, initialCapital: 10000 });
          r.metrics = m;
          r.maxDrawdown = m.maxDrawdown ?? r.maxDrawdown;
        } catch (_) {}
      }
      const chartId = id + '-eq';
      el.innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + `<div id="${chartId}" class="chart-box rounded border dark:border-gray-800 my-3"></div>` + tradesTable(r.trades, { page: 1 });
      const ch = document.getElementById(chartId);
      if (ch && r.equity && r.equity.length) Charts.richLine(ch, r.equity, isDark(), { area: true, compare: extra && extra.compareEquity, compareColor: '#94a3b8' });
      bindTradesPager(el);
    } catch (e) { el.textContent = errText(e); }
  }
  async function runNested() {
    if (!state.result || !state.bars?.length) return;
    const st = defaultStrategy();
    const fill = (id, name, extra) => fillNested(id, name, extra);
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
    if (state.stockTab === 'buyAtClose') {
      const run = () => {
        const f = state.nested.bac;
        const strat = defaultStrategy();
        strat.parameters = { ...strat.parameters, lowIBS: Number(f.lowIBS), highIBS: Number(f.highIBS), maxHoldDays: Number(f.maxHoldDays) };
        fill('bac-out', 'buy-at-close', { strategy: strat, leverage: Number(f.marginPct || 100) / 100 });
      };
      document.getElementById('bac-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        state.nested.bac = { lowIBS: Number(fd.get('lowIBS')), highIBS: Number(fd.get('highIBS')), maxHoldDays: Number(fd.get('maxHoldDays')), marginPct: Number(fd.get('marginPct')) };
        run();
      });
      run();
    }
    if (state.stockTab === 'buyAtClose4') {
      document.getElementById('bac4-form')?.querySelector('[name=leverage]')?.addEventListener('input', (e) => {
        const lab = document.getElementById('bac4-lev-lab');
        if (lab) lab.textContent = e.target.value + '%';
      });
      const run = async () => {
        const f = state.nested.bac4;
        const wanted = parseTickers(f.tickers);
        let loaded = state.tickersData || [];
        if (wanted.length) {
          try {
            loaded = [];
            for (const t of wanted) {
              const ds = await API.dataset(t);
              loaded.push({ ticker: t, data: ds.data || [] });
            }
          } catch (err) { toast(errText(err)); }
        }
        fill('bac4-out', 'buy-at-close-4', { leverage: Number(f.leverage || 200) / 100, tickers: loaded, strategy: st });
      };
      document.getElementById('bac4-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        state.nested.bac4 = { tickers: fd.get('tickers'), leverage: Number(fd.get('leverage')) };
        run();
      });
      run();
    }
    if (state.stockTab === 'noStopLoss') {
      const run = () => {
        const f = state.nested.nsl;
        fill('nsl-out', 'no-stop-loss', { noStop: { exitMode: f.exitMode, requireProfitableExit: !!f.requireProfitableExit, maxHoldDays: Number(f.maxHoldDays), profitTarget: Number(f.profitTarget), leverage: Number(f.leverage || 100) / 100 } });
      };
      document.getElementById('nsl-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        state.nested.nsl = { exitMode: fd.get('exitMode'), requireProfitableExit: !!form.requireProfitableExit?.checked, maxHoldDays: Number(fd.get('maxHoldDays')), profitTarget: Number(fd.get('profitTarget')), leverage: Number(fd.get('leverage')) };
        run();
      });
      run();
    }
    if (state.stockTab === 'options') {
      const run = () => {
        const f = state.nested.opt;
        fill('opt-out', isSingle() ? 'options' : 'options-multi', { config: { strikePct: Number(f.strikePct), volAdjPct: Number(f.volAdjPct), capitalPct: Number(f.capitalPct), expirationWeeks: Number(f.expirationWeeks), maxHoldingDays: Number(f.maxHoldingDays) } });
      };
      document.getElementById('nested-opt-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        state.nested.opt = { strikePct: Number(fd.get('strikePct')), volAdjPct: Number(fd.get('volAdjPct')), capitalPct: Number(fd.get('capitalPct')), expirationWeeks: Number(fd.get('expirationWeeks')), maxHoldingDays: Number(fd.get('maxHoldingDays')) };
        run();
      });
      run();
    }
    if (state.stockTab === 'splits') {
      const el = document.getElementById('splits-box');
      if (el) await paintSplitsForTickers(el, (state.tickersData || []).map((t) => t.ticker));
    }
    if (state.stockTab === 'monthlyContribution') {
      document.getElementById('mc-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        state.nested.mc = { amount: Number(fd.get('amount')), day: Number(fd.get('day')) };
        const out = document.getElementById('mc-out');
        try {
          const withC = resultOf(await API.calc('single-position', {
            tickers: calcTickerRefs((state.tickersData || []).map((x) => x.ticker)), strategy: st, leverage: (state.leverage || 200) / 100,
            single: { allowSameDayReentry: true, monthlyAmount: Number(fd.get('amount')), monthlyDayOfMonth: Number(fd.get('day')) },
          }));
          const base = state.baselineResult || resultOf(state.result);
          const contrib = Number(fd.get('amount')) || 0;
          out.innerHTML = metricsGrid(withC.metrics, withC.finalValue, withC.maxDrawdown)
            + (base ? `<div class="rounded-lg border p-3 my-3 text-sm"><div class="font-semibold mb-1">Δ vs без пополнений</div><div>Итог ${fmtUsd((withC.finalValue || 0) - (base.finalValue || 0))} · доходность ${fmtSignedPct((withC.metrics.totalReturn || 0) - (base.metrics.totalReturn || 0), 2)} · CAGR ${fmtSignedPct((withC.metrics.cagr || 0) - (base.metrics.cagr || 0), 2)}</div><div class="text-xs text-gray-500 mt-1">Сумма пополнения ${fmtUsd(contrib)} / день ${esc(fd.get('day'))}</div></div>` : '')
            + '<div id="mc-eq" class="chart-box rounded border dark:border-gray-800 my-3"></div>'
            + tradesTable(withC.trades, { page: 1 });
          const ch = document.getElementById('mc-eq');
          if (ch) Charts.richLine(ch, withC.equity, isDark(), { area: true, compare: base && base.equity, compareColor: '#94a3b8' });
          bindTradesPager(out);
        } catch (err) { out.textContent = errText(err); }
      });
    }
  }

  async function bootAuthed() {
    try { const st = await API.status(); state.apiBuildId = st.timestamp || st.buildId; state.serverStatus = 'online'; } catch (_) { state.serverStatus = 'offline'; }
    try { state.datasets = await API.datasets(); state.datasetsError = null; } catch (err) { state.datasets = []; state.datasetsError = errText(err); }
    try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
    try {
      const savedEma = JSON.parse(localStorage.getItem('ema.settings') || 'null');
      if (savedEma) state.emaForm = normalizeEmaForm(savedEma);
    } catch (_) {}
    await loadCatalog();
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
    bindErrorLogging();
    if (typeof API.onUnauthorized === 'function') API.onUnauthorized(handleUnauthorized);
    try {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        if (state.theme !== 'auto') return;
        applyTheme();
        if (state.user && state.page !== '/login') {
          Charts.destroy();
          afterRender();
        }
      });
    } catch (_) {}
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
        rememberReturnPath(path);
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
