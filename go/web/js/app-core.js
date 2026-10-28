  const NAV = [
    { to: '/data', label: 'Данные', icon: 'database', sidebar: true, menu: true },
    { to: '/stocks', label: 'Акции', icon: 'linechart', sidebar: true, bottom: true, menu: true },
    { to: '/ema', label: 'EMA', icon: 'ema', sidebar: true, bottom: true, menu: true },
    { to: '/multi-ticker-options', label: 'Опционы', icon: 'layers', sidebar: true, menu: true },
    { to: '/calendar', label: 'Календарь', icon: 'calendar', sidebar: true, menu: true },
    { to: '/split', label: 'Сплиты', icon: 'scissors', sidebar: true, menu: true },
    { to: '/watches', label: 'Мониторинг', icon: 'bell', sidebar: true, bottom: true, menu: true },
    { to: '/webull', label: 'Webull', icon: 'webull', sidebar: true, menu: true },
    { to: '/robinhood', label: 'Robinhood', icon: 'robinhood', sidebar: true, menu: true },
    { to: '/settings', label: 'Настройки', menu: true },
  ];
  const TABS = NAV.filter((t) => t.sidebar);
  const BOTTOM = NAV.filter((t) => t.bottom);
  const MOBILE_MENU = NAV.filter((t) => t.menu);
  const STOCK_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'price', label: 'Цены' },
    { id: 'tickerCharts', label: 'Графики тикеров' },
    { id: 'equity', label: 'Капитал' },
    { id: 'exposure', label: 'Экспозиция' },
    { id: 'drawdown', label: 'Просадка' },
    { id: 'openDayDrawdown', label: 'Просадка дня' },
    { id: 'trades', label: 'Сделки' },
    { id: 'profit', label: 'Профит-фактор' },
    { id: 'duration', label: 'Длительность' },
    { id: 'splits', label: 'Сплиты' },
    { id: 'buyhold', label: 'Купить и держать' },
  ];
  const SINGLE_ONLY = new Set(['buyhold', 'openDayDrawdown']);
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
    { id: 'ema', label: 'EMA', icon: 'ema' },
  ];
  const CAPITAL_MODE_LABELS = {
    standard_safe: 'Стандартный',
    cash_100: '100% без коррекции',
    margin_125: 'Маржа 125%',
    margin_150: 'Маржа 150%',
    margin_175: 'Маржа 175%',
    margin_200: 'Маржа 200%',
  };
  const DEFAULT_LOW_IBS = 0.1;
  const DEFAULT_HIGH_IBS = 0.75;
  const DEFAULT_INITIAL_CAPITAL = 10000;
  function liveLowIBS() { return Number(state.autoConfig?.lowIBS ?? state.autoConfig?.config?.lowIBS ?? DEFAULT_LOW_IBS); }
  function liveHighIBS() { return Number(state.autoConfig?.highIBS ?? state.autoConfig?.config?.highIBS ?? DEFAULT_HIGH_IBS); }
  function initialCapital() { return Number(state.settings && state.settings.initialCapital) || DEFAULT_INITIAL_CAPITAL; }
  const BROKER_TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'positions', label: 'Позиции' },
    { id: 'orders', label: 'Ордера' },
    { id: 'fills', label: 'Исполненные' },
    { id: 'journal', label: 'Журнал сделок' },
    { id: 'autotrade', label: 'Автоторговля' },
    { id: 'monitor', label: 'Мониторинг' },
    { id: 'logs', label: 'Логи' },
    { id: 'connect', label: 'Подключение' },
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
  ];
  const OPTIONS_TABS = [
    { id: 'summary', label: 'Сводка' },
    { id: 'equity', label: 'Баланс' },
    { id: 'price', label: 'Цены' },
    { id: 'tickerCharts', label: 'Графики тикеров' },
    { id: 'drawdown', label: 'Просадка' },
    { id: 'trades', label: 'Сделки' },
    { id: 'profit', label: 'Профит-фактор' },
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
    ema: '<path d="M5 19V11M9 16V7M13 18V10M17 13V5"/><path d="M3 17c3-2 5-1 7-3s4-1 6-4 3-2 5-3"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    webull: '<path d="M2.4 6.3A10.2 8.6 0 0 0 21.6 6.3" fill="none" stroke="currentColor" stroke-width="4.8" stroke-linecap="round"/>',
    robinhood: '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.913A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
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
    indicators: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/><circle cx="10" cy="11" r="1.25"/><circle cx="13" cy="13" r="1.25"/><circle cx="17" cy="7" r="1.25"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
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
    eye: '<path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.5"/>',
    eyeoff: '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.2 3.7"/><path d="M6.7 6.7C3.8 8.5 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 3.1-.5"/>',
    arrowne: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    logo: '<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
  };

  const PC_COLORS = ['#2563EB', '#0EA5E9', '#14B8A6', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#F43F5E', '#A855F7', '#8B5CF6', '#64748B'];
  const PC_LINE_STYLES = [{ v: 0, l: 'Сплошная' }, { v: 2, l: 'Пунктир' }, { v: 3, l: 'Штрих-пунктир' }];
  const PC_CORE_BANDS = ['ema-p15', 'ema-p40', 'ema-m20'];
  function readChartPrefs() {
    try { return JSON.parse(localStorage.getItem('chart-prefs') || '{}'); } catch { return {}; }
  }
  // Сохранённый список пресетов: повреждённый JSON или не-массив раньше ронял
  // создание state, а с ним весь интерфейс, включая вход (AUD-176).
  function storedList(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
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
    monthlyContribution: localStorage.getItem('stocksMonthlyContribution') || '',
    tickersData: [],
    stockTab: 'summary',
    pendingRun: false,
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
    brokerTab: {},
    cal: { year: nyseNow.y, month: nyseNow.m, data: null, error: '' },
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
    emaPresets: storedList('emaPresets'),
    emaPresetId: '',
    stockPresets: storedList('stockPresets'),
    stockPresetId: '',
    optPresets: storedList('optPresets'),
    optPresetId: '',
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
    capitalModes: [],
    minEntryReservePct: 0.005,
    effectiveReservePct: 0.005,
    tickerCatalog: [],
    enhanceCat: 'popular',
    enhanceQuery: '',
    // Список строится из текущих вкладок, из сохранённого берётся только видимость:
    // в браузерах оставались вкладки старых версий (BuyAtClose, Опционы, Без стоп-лосса).
    analysisTabsConfig: (() => {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('analysisTabsConfig') || 'null'); } catch (_) { saved = null; }
      const vis = new Map((Array.isArray(saved) ? saved : []).map((t) => [t && t.id, t && t.visible]));
      return STOCK_TABS.filter((t) => t.id !== 'summary').map((t) => ({ ...t, visible: vis.get(t.id) !== false }));
    })(),
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
    },
    baselineResult: null,
    emaBaseline: null,
    optBaseline: null,
    emaRunParams: null,
    priceChart: initPriceChart(),
    priceChartUi: { indOpen: false, styleFor: null, tickerOpen: false, fullscreen: false, chartId: 'chart-price' },
    returnTo: null,
    splitApplyTicker: '',
    calImportStats: null,
    lastPageKey: '',
  };

  function icon(name, cls) {
    return `<svg class="${cls || 'w-5 h-5'}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  }
  const BRAND_POINTS = [5, 20, 5, 11, 8, 17, 12, 12, 17, 14];
  const PANEL_POINTS = {
    close: [5, 4, 5, 20, 19, 8, 14, 12, 19, 16],
    open: [19, 4, 19, 20, 5, 8, 10, 12, 5, 16],
  };
  function panelPath(points) {
    return `M${points[0]} ${points[1]}v${points[3] - points[1]}M${points[4]} ${points[5]}l${points[6] - points[4]} ${points[7] - points[5]} ${points[8] - points[6]} ${points[9] - points[7]}`;
  }
  function panelIcon(collapsed) {
    const mode = collapsed ? 'open' : 'close';
    return `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path data-panel-path data-panel-mode="brand" data-panel-target="${mode}" d="${panelPath(BRAND_POINTS)}"/></svg>`;
  }
  function brandIcon(collapsed) {
    return `<span class="app-side-logo-mark">${logo('sm')}</span><span class="app-side-morph-mark" aria-hidden="true">${panelIcon(collapsed)}</span>`;
  }
  function morphBrandIcon(btn, targetMode) {
    const path = btn.querySelector('[data-panel-path]');
    if (!path) return;
    const fromMode = path.dataset.panelMode || 'brand';
    const toMode = targetMode;
    if (fromMode === toMode) return;
    const from = fromMode === 'brand' ? BRAND_POINTS : PANEL_POINTS[fromMode];
    const to = toMode === 'brand' ? BRAND_POINTS : PANEL_POINTS[toMode];
    const started = performance.now();
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      path.setAttribute('d', panelPath(from.map((v, i) => v + (to[i] - v) * eased)));
      if (progress < 1) requestAnimationFrame(frame);
      else path.dataset.panelMode = toMode;
    };
    requestAnimationFrame(frame);
  }
  function actionIcon(name, label, attrs, tone) {
    return `<button type="button" ${attrs} class="action-icon ${tone || ''}" title="${esc(label)}" aria-label="${esc(label)}">${icon(name, 'w-4 h-4')}</button>`;
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
    const digits = d == null ? 0 : d;
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
    let balance = root.balance != null ? root.balance : ((asObject(root.account) && root.account.balance) || root.account);
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
  function dashboardPositions(dash) {
    const d = asObject(dash) || {};
    return d.positions || (asObject(d.account) && d.account.positions);
  }
  function normalizePositions(positions) {
    return asRows(positions).map((item, index) => ({
      id: String(firstDefined(item, ['position_id', 'id', 'symbol']) ?? index),
      symbol: String(firstDefined(item, ['symbol', 'ticker', 'display_symbol', 'short_name']) ?? '—'),
      quantity: firstDefined(item, ['quantity', 'qty', 'position', 'holding']),
      avgPrice: firstDefined(item, ['avg_price', 'average_price', 'avgPrice', 'average_buy_price', 'cost_price', 'unit_cost']),
      totalCost: firstDefined(item, ['total_cost', 'totalCost', 'cost_basis', 'costBasis', 'cost']),
      marketPrice: firstDefined(item, ['last_price', 'last_trade_price', 'market_price', 'marketPrice', 'current_price']),
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
        const rest = {};
        Object.keys(err.data).forEach((k) => {
          if (k === 'error' || k === 'message') return;
          let v = err.data[k];
          if (k === 'raw' && v != null) v = String(v).slice(0, 200);
          rest[k] = v;
        });
        if (Object.keys(rest).length) msg += ' | ' + JSON.stringify(rest);
      } catch (_) {}
    }
    return msg;
  }
  // The URL owns which tickers the page is about. Every entry point (link,
  // fresh load, back button, post-login redirect) goes through these two.
  function urlTickers() {
    const q = new URL(location.href).searchParams.get('tickers');
    if (!q) return '';
    return q.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
  }
  function applyURLTickers() {
    const q = urlTickers();
    if (!q) return;
    if (q !== state.tickerInput) {
      state.tickerInput = q;
      try { localStorage.setItem('tickersInput', q); } catch (_) {}
      // The previous backtest belongs to the previous tickers.
      state.result = null;
      state.baselineResult = null;
      state.tickersData = [];
      state.bars = [];
      state.ticker = parseTickers(q)[0] || state.ticker;
      state.stockTab = 'summary';
      state.tradesPage = 1;
    }
    state.leverage = 100;
    state.pendingRun = true;
  }
  function rememberReturnPath(path) {
    const p = path || state.page || (location.pathname + location.search) || '/data';
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
    paintOverlay();
  }
  function closeModal() { setModal(null); }
  async function openCloseMonitorModal(id, symbol) {
    const today = nyseParts().iso;
    setModal(`<div class="modal-backdrop"><div class="modal-card max-w-lg">
      <h3 class="text-lg font-semibold mb-2">Закрыть мониторинг: ${esc(symbol || '')}</h3>
      <p class="text-sm text-gray-500 mb-3">Это действие закроет только нашу сделку мониторинга. Ордер Webull не отправляется.</p>
      <div id="cm-err" class="text-sm text-red-600 mb-2 hidden"></div>
      <label class="block text-sm mb-2">Дата выхода (ET)<input id="cm-date" class="field mt-1" value="${esc(today)}" placeholder="YYYY-MM-DD" /></label>
      <label class="block text-sm mb-2">Цена выхода<input id="cm-price" type="number" step="0.01" class="field mt-1" /></label>
      <p id="cm-hint" class="text-xs text-gray-500 mb-2">Загружаем котировку…</p>
      <label class="block text-sm mb-3">IBS выхода, %<input id="cm-ibs" type="number" step="0.1" min="0" max="100" class="field mt-1" placeholder="Необязательно" /></label>
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
        await API.closePositionRow(id, body);
        closeModal();
        state.loaded.watches = false;
        toast('Сделка мониторинга закрыта');
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
  function openWatchThresholdsModal(symbol) {
    const w = (state.watches || []).find((x) => x.symbol === symbol) || {};
    const lo = Number(w.lowIBS ?? liveLowIBS());
    const hi = Number(w.highIBS ?? liveHighIBS());
    setModal(`<div class="modal-backdrop" id="watch-thr-modal"><div class="modal-card">
      <h3 class="text-lg font-semibold mb-2">Пороги IBS: ${esc(symbol)}</h3>
      <p class="text-sm text-gray-500 mb-3">Эти значения задаются для тикера и перекрывают пороги по умолчанию из настроек автоторговли.</p>
      <label class="block text-sm mb-2">Вход, IBS &lt;<input id="watch-thr-low" type="number" step="0.01" min="0" max="1" class="field mt-1" value="${esc(lo)}" /></label>
      <label class="block text-sm mb-3">Выход, IBS &gt;<input id="watch-thr-high" type="number" step="0.01" min="0" max="1" class="field mt-1" value="${esc(hi)}" /></label>
      <div class="flex justify-end gap-2"><button type="button" id="watch-thr-cancel" class="btn-secondary">Отмена</button><button type="button" id="watch-thr-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
    </div></div>`);
    document.getElementById('watch-thr-cancel')?.addEventListener('click', () => closeModal());
    document.getElementById('watch-thr-save')?.addEventListener('click', async () => {
      const lowIBS = Number(document.getElementById('watch-thr-low')?.value);
      const highIBS = Number(document.getElementById('watch-thr-high')?.value);
      if (!(lowIBS >= 0 && lowIBS <= 1) || !(highIBS >= 0 && highIBS <= 1)) { toast('Пороги IBS — числа от 0 до 1'); return; }
      try {
        await API.patchWatch(symbol, { lowIBS, highIBS });
        closeModal();
        state.watches = await API.watches();
        renderPage();
      } catch (err) { toast(errText(err)); }
    });
  }
  function ibsPct(v) {
    const n = toNum(v);
    if (n == null) return null;
    return Math.abs(n) <= 1.5 ? n * 100 : n;
  }
  function ibsFraction(pctRaw) {
    const n = toNum(pctRaw);
    if (n == null) return null;
    return n / 100; // поля подписаны в процентах; отсечка 1.5 портила IBS ≤ 1.5%
  }
  // Статистика и графики мониторинга — про стратегию. Тестовая покупка это
  // реальный ордер у брокера, но не сделка стратегии: она в журнале есть и
  // видна только вместе со скрытыми.
  function visibleMonitorTrades(trades, includeHidden) {
    const list = trades || [];
    return includeHidden ? list : list.filter((t) => !t.isHidden && !t.isTest);
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
      margin_liquidation: 'Маржин-колл',
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
    const m = { finnhub: 'Finnhub', alpha_vantage: 'Alpha Vantage', twelve_data: 'Twelve Data', polygon: 'Polygon', webull: 'Webull', robinhood: 'Robinhood' };
    return m[id] || id || 'Finnhub';
  }
  function brokerLabel(id) {
    return id === 'robinhood' ? 'Robinhood' : (id === 'webull' ? 'Webull' : (id || '—'));
  }
  function accountTypeText(type) {
    return ({ cash: 'Денежный', margin: 'Маржинальный', ira: 'IRA', roth_ira: 'Roth IRA', traditional_ira: 'Traditional IRA' })[String(type || '').toLowerCase()] || type || '—';
  }
  function tradeSourceText(source) {
    return ({ manual: 'Вручную', import: 'Импорт', webull: 'Webull', robinhood: 'Robinhood', strategy: 'Стратегия' })[String(source || '').toLowerCase()] || source || '—';
  }
  function tokenSourceText(source) {
    return ({ db: 'хранилище', env: 'переменная окружения', none: 'не задан' })[String(source || '').toLowerCase()] || source || '—';
  }
  function brokerHealthText(h) {
    const st = String((h && h.status) || '');
    if (st === 'EXPIRING_SOON') {
      const n = h && h.daysLeft;
      if (n != null && n !== '') return 'истекает через ' + n + ' дн.';
      return 'истекает';
    }
    const m = {
      OK: 'активно',
      NEEDS_REAUTH: 'нужна переавторизация',
      MISSING: 'нет токена',
      UNREACHABLE: 'брокер недоступен',
    };
    return m[st] || '';
  }
  function trackerStatusText(status) {
    return ({ execution_unknown: 'исполнение не подтверждено', unresolved: 'требует ручного разбора' })[String(status || '')] || status || '—';
  }
  function orderSideText(side) {
    return ({ BUY: 'Покупка', SELL: 'Продажа', buy: 'Покупка', sell: 'Продажа' })[String(side || '')] || side || '—';
  }
  function decisionActionText(action) {
    return ({ BUY: 'Покупка', SELL: 'Продажа', HOLD: 'Ожидание', SKIP: 'Пропуск', NONE: 'Нет решения', buy: 'Покупка', sell: 'Продажа', hold: 'Ожидание', skip: 'Пропуск', none: 'Нет решения' })[String(action || '')] || action || '—';
  }
  function orderStatusText(status) {
    return ({ NEW: 'Новый', OPEN: 'Открыт', PENDING: 'В обработке', PARTIALLY_FILLED: 'Частично исполнен', FILLED: 'Исполнен', CANCELED: 'Отменён', CANCELLED: 'Отменён', REJECTED: 'Отклонён', EXPIRED: 'Истёк' })[String(status || '').toUpperCase()] || status || '—';
  }
  function orderValueText(value, labels) {
    const raw = String(value || '');
    return labels[raw.toUpperCase()] || value || '—';
  }
  function orderTypeText(value) { return orderValueText(value, { MARKET: 'Рыночная', LIMIT: 'Лимитная', STOP: 'Стоп-заявка', STOP_LIMIT: 'Стоп-лимитная' }); }
  function instrumentTypeText(value) { return orderValueText(value, { STOCK: 'Акция', EQUITY: 'Акция', ETF: 'ETF', OPTION: 'Опцион' }); }
  function comboTypeText(value) { return orderValueText(value, { NORMAL: 'Обычная', SINGLE: 'Одиночная', COMBO: 'Комбинированная' }); }
  function entrustTypeText(value) { return orderValueText(value, { QTY: 'Количество', QUANTITY: 'Количество', AMOUNT: 'Сумма', VALUE: 'Сумма' }); }
  function tifText(value) { return orderValueText(value, { DAY: 'До конца дня', GTC: 'До отмены', IOC: 'Немедленно или отменить', FOK: 'Полностью или отменить' }); }
  function sessionText(value) { return orderValueText(value, { CORE: 'Основная', EXTENDED: 'Расширенная', PRE_MARKET: 'Предторговая', AFTER_HOURS: 'Послеторговая' }); }
  // Mirrors go/internal/live/telegram.go noActionReasonText for the reasons
  // the autotrade tile shows. One dictionary for the whole SPA.
  function decisionReasonText(reason) {
    const raw = String(reason || '');
    const m = {
      broker_disabled: 'брокер выключен в настройках',
      NEEDS_REAUTH: 'брокер требует повторной авторизации',
      allowNewEntries_false: 'новые входы выключены в настройках',
      entries_disabled: 'новые входы выключены в настройках',
      exits_disabled: 'выходы выключены в настройках',
      no_signal: 'нет сигнала на вход',
      empty_symbol_universe: 'нет тикеров для мониторинга',
      broker_not_flat: 'на счёте остаток — вход пропущен',
      sells_not_settled: 'продажи не подтвердились — вход пропущен',
      broker_positions_unavailable: 'позиции брокера не читаются',
      symbol_order_in_flight: 'по тикеру уже висит заявка',
    };
    return m[raw] || raw;
  }
  // Mirrors go/internal/live/brokers.go brokerFlags(): a per-broker key is
  // used only when it is explicitly present; a missing key means false
  // (Node: undefined is falsy), except webull, which still falls back to the
  // matching top-level field when brokers.webull has no explicit key of its
  // own (that fallback is the only thing left for a plain "enabled" save to
  // reach, see P2-2). No key anywhere is treated as "да" by default.
  function brokerFlag(ac, name, key) {
    const b = ac && ac.brokers && ac.brokers[name];
    if (b && Object.prototype.hasOwnProperty.call(b, key)) return b[key] === true;
    if (name === 'webull') return ac && ac[key] === true;
    return false;
  }
  function brokerFlagsPatch(ac, form) {
    const brokers = {};
    ['webull', 'robinhood'].forEach((id) => {
      const patch = {};
      [['enabled', id + 'Enabled'], ['allowNewEntries', id + 'AllowEntries'], ['allowExits', id + 'AllowExits']].forEach(([key, name]) => {
        const el = form[name];
        if (!el) return;
        const next = !!el.checked;
        if (next !== brokerFlag(ac, id, key)) patch[key] = next;
      });
      if (Object.keys(patch).length) brokers[id] = patch;
    });
    return brokers;
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
  function persistStockPresets() {
    try { localStorage.setItem('stockPresets', JSON.stringify(state.stockPresets || [])); } catch (_) {}
  }
  function persistOptPresets() {
    try { localStorage.setItem('optPresets', JSON.stringify(state.optPresets || [])); } catch (_) {}
  }
  function syncStockParamsFromDom() {
    const tickersEl = document.getElementById('ticker-input');
    if (tickersEl) {
      state.tickerInput = tickersEl.value;
      try { localStorage.setItem('tickersInput', state.tickerInput); } catch (_) {}
    }
    const levEl = document.getElementById('leverage-sel');
    if (levEl) state.leverage = Number(levEl.value);
    const tpEl = document.getElementById('take-profit-percent-input');
    if (tpEl) {
      state.takeProfit = tpEl.value;
      try { localStorage.setItem('stocksTakeProfit', state.takeProfit); } catch (_) {}
    }
    const mcEl = document.getElementById('monthly-contribution-input');
    if (mcEl) {
      state.monthlyContribution = mcEl.value;
      try { localStorage.setItem('stocksMonthlyContribution', state.monthlyContribution); } catch (_) {}
    }
  }
  function applyStockPreset(pset) {
    if (pset.tickers) {
      state.tickerInput = pset.tickers;
      try { localStorage.setItem('tickersInput', state.tickerInput); } catch (_) {}
    }
    if (pset.leverage != null) state.leverage = Number(pset.leverage) || 200;
    if (pset.takeProfit != null) {
      state.takeProfit = pset.takeProfit;
      try { localStorage.setItem('stocksTakeProfit', state.takeProfit); } catch (_) {}
    }
    if (pset.monthlyContribution != null) {
      state.monthlyContribution = pset.monthlyContribution;
      try { localStorage.setItem('stocksMonthlyContribution', state.monthlyContribution); } catch (_) {}
    }
  }
  function makeZone(side, level) {
    return { id: side + '-' + Date.now() + '-' + Math.random().toString(16).slice(2), levelPct: level, enabled: true };
  }
