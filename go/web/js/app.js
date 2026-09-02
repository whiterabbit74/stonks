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
  const BADGE = [
    'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
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
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
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
    selected: [],
    tickerInput: localStorage.getItem('tickersInput') || 'AAPL, MSFT, AMZN, MAGS',
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
  function tickerInput(id, value, tickers, showBadges) {
    const badges = tickers.map((t, i) => `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[i % 4]}">${esc(t)}</span>`).join('');
    return `<div>
      <input id="${id}" type="text" value="${esc(value)}" placeholder="AAPL, MSFT, AMZN, MAGS" class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
      ${showBadges !== false && tickers.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${badges}</div>` : ''}
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
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-purple-600">${fmtPct(m.winRate)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Win Rate</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-red-600">${fmtPct(dd)}</div><div class="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-indigo-600">${m.totalTrades ?? 0}</div><div class="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div></div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold text-teal-600">${pf}</div><div class="text-sm text-gray-600 dark:text-gray-400">Profit Factor</div></div>
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
      state.selected = parseTickers(state.tickerInput);
    }
    renderPage();
  }
  window.addEventListener('popstate', () => {
    state.page = location.pathname === '/' ? '/data' : location.pathname;
    renderPage();
  });

  function shellHTML() {
    const nav = TABS.map((t) => `<a href="${t.to}" data-nav class="px-3 py-1 rounded text-sm border ${state.page === t.to ? 'nav-active' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800'}">${t.label}</a>`).join('');
    const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());
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
              <button id="menu-btn" class="md:hidden icon-btn icon-btn-lg icon-btn-glass" title="Меню" aria-label="Открыть меню">${icon(state.mobileOpen ? 'x' : 'menu')}</button>
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
        <footer class="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
          <div class="max-w-7xl mx-auto px-6 py-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-4">
                <div class="flex items-center gap-3">${logo('md')}<div><h3 class="font-bold text-gray-900 dark:text-gray-100">IBS Trading Strategy</h3><p class="text-sm text-gray-600 dark:text-gray-400">Профессиональный тестировщик стратегий</p></div></div>
                <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Анализ и тестирование торговых стратегий на исторических данных. Специализация на стратегиях mean reversion и техническом анализе.</p>
              </div>
              <div class="space-y-2">
                <h4 class="text-sm font-semibold uppercase tracking-wider">Система</h4>
                <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Версия API:</span><span id="api-ver" class="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800">${esc(state.apiBuildId || 'dev')}</span></div>
                <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Статус:</span><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-200"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Online</span></div>
              </div>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-800 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div class="text-sm text-gray-600 dark:text-gray-400">© ${year} IBS Trading Strategy. Все права защищены.</div>
              <div class="text-xs text-gray-500">Go API · Lightweight Charts v5</div>
            </div>
          </div>
        </footer>
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
              <div><label class="block text-sm mb-1">Эл. почта</label><input name="username" type="email" class="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="ivan@example.com" autofocus /></div>
              <div><label class="block text-sm mb-1">Пароль</label><input name="password" type="password" class="w-full rounded border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700" placeholder="••••••••" /></div>
              <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="remember" /> Запомнить меня</label>
              <div class="flex justify-end"><button type="submit" class="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700">Войти</button></div>
            </form>
          </div>
        </main>
        <footer class="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
          <div class="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="space-y-4">
              <div class="flex items-center gap-3">${logo('md')}<div><h3 class="font-bold">IBS Trading Strategy</h3><p class="text-sm text-gray-600 dark:text-gray-400">Профессиональный тестировщик стратегий</p></div></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Анализ и тестирование торговых стратегий на исторических данных. Специализация на стратегиях mean reversion и техническом анализе.</p>
            </div>
            <div class="space-y-2">
              <h4 class="text-sm font-semibold uppercase tracking-wider">Система</h4>
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Версия API:</span><span class="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800">dev</span></div>
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Статус:</span><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Online</span></div>
            </div>
          </div>
          <div class="max-w-7xl mx-auto px-6 border-t border-gray-200 dark:border-gray-800 mt-2 pt-6 pb-6 text-sm text-gray-600 dark:text-gray-400">© ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date())} IBS Trading Strategy. Все права защищены.</div>
        </footer>
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
          <a href="/enhance" data-nav title="Загрузить новые данные из API" class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800">${icon('plus', 'w-4 h-4')}</a>
        </div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5"><div class="w-2 h-2 bg-green-500 rounded-full"></div><span class="text-xs text-green-600 font-medium">Online</span></div>
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button id="view-list" class="p-1.5 rounded ${state.dataView === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Список" aria-label="Переключить на режим списка">${icon('list', 'w-4 h-4')}</button>
            <button id="view-grid" class="p-1.5 rounded ${state.dataView === 'compact' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}" title="Компактный вид" aria-label="Переключить на компактный вид">${icon('grid', 'w-4 h-4')}</button>
          </div>
        </div>
        <div class="mb-3"><div class="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">Фильтр</div><div class="flex flex-wrap gap-2">${filters}</div></div>
        <input id="file-json" type="file" accept=".json,application/json" class="hidden" />
        ${cards}
      </div>`;
  }

  function pageEnhance() {
    const prov = providerId();
    const loaded = new Set((state.datasets || []).map((d) => String(d.ticker || '').toUpperCase()));
    const cards = POPULAR.map((t) => {
      const on = loaded.has(t.symbol);
      return `<button type="button" data-esym="${esc(t.symbol)}" class="ticker-card${on ? ' loaded' : ''}" title="${on ? esc(t.symbol) + ' уже загружен. Нажмите для обновления' : 'Нажмите для загрузки ' + t.symbol}">
        <div class="text-sm font-medium truncate ${on ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}">${esc(t.name)}</div>
        <div class="text-xs font-mono mt-0.5 ${on ? 'text-green-600' : 'text-gray-500'}">${esc(t.symbol)}</div>
      </button>`;
    }).join('');
    return `
      ${pageHeader('Новые данные', 'Загрузка исторических данных из API', `<div class="rounded-lg border px-3 py-2 text-xs bg-white dark:bg-gray-800 dark:border-gray-700"><div class="text-gray-500">Провайдер данных</div><div class="font-semibold">${esc(providerLabel(prov))}</div></div>`)}
      <div class="bg-white border border-gray-200 rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
        <div class="enhance-toolbar">
          <div class="enhance-toolbar-main">
            <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Тикер</div>
            <form id="enhance-form" class="enhance-form">
              <input type="hidden" name="provider" value="${esc(prov)}" />
              <div class="enhance-search">
                ${icon('search', 'search-glyph')}
                <input name="symbol" value="" class="enhance-input" placeholder="AAPL, MSFT, TSLA..." />
              </div>
              <div class="enhance-actions">
                <button type="submit" class="enhance-load" disabled title="Загрузить данные">${icon('download', 'w-4 h-4')}<span class="enhance-load-label">Загрузить</span></button>
              </div>
            </form>
          </div>
          <a href="/settings" data-nav data-settings-tab="api" class="enhance-gear" title="Настройки провайдера" aria-label="Настройки провайдера">${icon('settings', 'w-4 h-4')}</a>
        </div>
        <div id="enhance-out" class="mt-3 text-sm text-gray-600 dark:text-gray-400"></div>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 mt-4">
        <span class="cat-chip">⭐ Популярные <span class="text-xs text-blue-500">(${POPULAR.length})</span></span>
      </div>
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-gray-100">Популярные</h3>
          <span class="text-sm text-gray-500">${POPULAR.length} тикеров</span>
        </div>
        <div class="ticker-card-grid">${cards}</div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">Источник данных: ${esc(prov.replace('_', ' '))} через локальный сервер</p>`;
  }

  function isSingle() { return parseTickers(state.tickerInput).length === 1; }
  function visibleStockTabs() {
    const single = isSingle();
    const tabs = STOCK_TABS.filter((t) => {
      if (t.id === 'summary') return true;
      if (!state.result) return false;
      if (SINGLE_ONLY.has(t.id) && !single) return false;
      if (MULTI_ONLY.has(t.id) && single) return false;
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
    let body = `<div class="grid lg-cols-3 lg:grid-cols-3 gap-4">
          <div class="lg-span-2 lg:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 min-h-[375px] flex items-center justify-center text-sm text-gray-500">Запустите бэктест, чтобы увидеть график</div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            ${stocksParams(tickers, isDefault, defaults)}
          </aside>
        </div>`;
    if (r) {
      if (state.stockTab === 'summary') {
        body = `<div class="grid lg-cols-3 lg:grid-cols-3 gap-4">
          <div class="lg-span-2 lg:col-span-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div class="text-sm font-semibold mb-2">${esc(tickers[0] || '')}</div>
            <div id="chart-hero" class="chart-box-lg"></div>
          </div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            ${stocksParams(tickers, isDefault, defaults)}
          </aside>
        </div>`;
      } else if (state.stockTab === 'price') body = `<div id="chart-price" class="chart-box-lg rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'tickerCharts') body = `<div id="ticker-charts" class="grid md:grid-cols-2 gap-3"></div>`;
      else if (state.stockTab === 'equity') body = `<div id="chart-eq" class="chart-box mt-4 rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'exposure') body = `<div id="chart-exp" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'drawdown') body = `<div id="chart-dd" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'openDayDrawdown') body = `<div id="odd-out"></div>`;
      else if (state.stockTab === 'trades') body = tradesTable(r.trades);
      else if (state.stockTab === 'profit') body = `<p class="mb-2">Profit factor: <b>${fmt(r.metrics?.profitFactor)}</b></p>` + tradesTable(r.trades);
      else if (state.stockTab === 'duration') {
        const avg = r.trades?.length ? r.trades.reduce((s, t) => s + (t.duration || 0), 0) / r.trades.length : 0;
        body = `<p>Средняя длительность: <b>${fmt(avg, 1)}</b> дн.</p>` + tradesTable(r.trades);
      } else if (state.stockTab === 'monthlyContribution') body = `<form id="mc-form" class="flex gap-2 mb-3"><input name="amount" type="number" value="500" class="field w-28" /><input name="day" type="number" value="1" class="field w-20" /><button class="btn-primary">Посчитать</button></form><div id="mc-out"></div>`;
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm"></div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">Считаем Buy & Hold…</div>`;
      else if (state.stockTab === 'buyAtClose') body = `<div id="bac-out">Buy at close…</div>`;
      else if (state.stockTab === 'buyAtClose4') body = `<div id="bac4-out">Buy at close 4…</div>`;
      else if (state.stockTab === 'noStopLoss') body = `<div id="nsl-out">Без стоп-лосса…</div>`;
      else if (state.stockTab === 'options') body = `<div id="opt-out">Опционы…</div>`;
    }
    const params = (state.stockTab === 'summary') ? '' : `<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3 max-w-xl">${stocksParams(tickers, isDefault, defaults)}</div>`;
    return `
      ${pageHeader('Акции', 'Бэктест стратегии на нескольких активах')}
      ${err}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) : ''}
      ${params}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        ${analysisTabs(tabs, state.stockTab, 'data-stab')}
        <div id="stock-body" class="p-4 min-h-[420px]">${body}</div>
      </div>`;
  }
  function stocksParams(tickers, isDefault, defaults) {
    return `
      <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>
        ${tickerInput('ticker-input', state.tickerInput, tickers, false)}
        ${isDefault ? '' : `<button type="button" id="reset-tickers" class="mt-1.5 w-full rounded-lg border border-dashed border-gray-300 px-2 py-1 text-left text-[11px] text-gray-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-600">↩ ${esc(defaults.join(', '))}</button>`}
      </div>
      <div><label class="mb-1 block text-xs font-medium">Маржинальность</label>
        <select id="leverage-sel" class="${inputCls()}">${levOptions(state.leverage)}</select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium" for="take-profit-percent-input">Тейк-профит</label>
        <input id="take-profit-percent-input" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(state.takeProfit)}" placeholder="Например, 2.5" class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800" />
        <p class="mt-1 text-[11px] text-gray-500">Досрочный выход, если максимум дня достиг процента прибыли от цены входа. Пусто или 0 выключает условие.</p>
      </div>
      <button id="run-bt" class="btn-primary w-full" ${state.running ? 'disabled' : ''}>${state.running ? 'Считаем…' : 'Запустить бэктест'}</button>`;
  }

  function pageEMA() {
    const tickers = parseTickers(state.tickerInput);
    return `
      ${pageHeader('EMA', 'Симулятор торговли по отклонению цены от EMA')}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs([{ id: 'summary', label: 'Сводка' }], 'summary', 'data-etab')}
        <div class="p-4 grid lg-cols-3 lg:grid-cols-3 gap-4">
          <div id="ema-out" class="lg-span-2 lg:col-span-2 min-h-[420px] flex items-center justify-center text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700">Запустите расчет EMA-стратегии</div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <form id="ema-form" class="space-y-3">
              <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>${tickerInput('ema-tickers', state.tickerInput, tickers, false)}</div>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="mb-1 block text-xs font-medium">EMA</label>
                  <select name="period" class="${inputCls()}"><option value="20">EMA 20</option><option value="200" selected>EMA 200</option></select>
                </div>
                <div><label class="mb-1 block text-xs font-medium">Маржинальность</label>
                  <select name="leverage" class="${inputCls()}">${levOptions(200)}</select>
                </div>
              </div>
              <div><label class="mb-1 block text-xs font-medium">Сигнал входа/выхода</label>
                <select name="signal" class="${inputCls()}"><option value="close">По закрытию свечи</option><option value="intraday">Касание внутри дня (вход по закрытию)</option></select>
              </div>
              <div><label class="mb-1 block text-xs font-medium">Старт EMA</label>
                <select name="start" class="${inputCls()}"><option value="full_history">После полной истории (200 дней)</option><option value="from_start">С самого начала графика</option></select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium" for="ema-take-profit">Тейк-профит</label>
                <input id="ema-take-profit" name="takeProfit" type="number" min="0" step="0.1" inputmode="decimal" placeholder="Пусто выключает" class="${inputCls()}" />
              </div>
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="noSellAtLoss" class="h-4 w-4" /> Не продавать в минус</label>
              <div><label class="mb-1 block text-xs font-medium">Зоны покупки, % от EMA</label><input name="buy" type="number" value="-20" class="${inputCls()}" /></div>
              <div><label class="mb-1 block text-xs font-medium">Зоны продажи, % от EMA</label><input name="sell" type="number" value="40" class="${inputCls()}" /></div>
              <button class="btn-primary w-full">Запустить EMA-бэктест</button>
            </form>
          </aside>
        </div>
      </div>`;
  }

  function pageOptions() {
    const tickers = parseTickers(state.tickerInput);
    const strikeOpts = [5, 10, 15, 20].map((v) => `<option value="${v}" ${v === 10 ? 'selected' : ''}>+${v}%</option>`).join('');
    const ivOpts = [0, 5, 10, 15, 20, 25, 30, 40, 50].map((v) => `<option value="${v}" ${v === 20 ? 'selected' : ''}>+${v}%</option>`).join('');
    const capOpts = [5, 10, 15, 20, 25, 30, 50].map((v) => `<option value="${v}" ${v === 10 ? 'selected' : ''}>${v}%</option>`).join('');
    return `
      ${pageHeader('Опционы', 'Бэктест опционных стратегий на нескольких активах')}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs([{ id: 'summary', label: 'Сводка' }], 'summary', 'data-otab')}
        <div class="p-4 grid lg-cols-3 lg:grid-cols-3 gap-4">
          <div id="optm-out" class="lg-span-2 lg:col-span-2 min-h-[420px] flex items-center justify-center text-sm text-gray-500 rounded-lg border border-gray-200 dark:border-gray-700">Запустите бэктест, чтобы увидеть результат</div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            <form id="opt-form" class="space-y-3">
              <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>${tickerInput('opt-tickers', state.tickerInput, tickers, false)}</div>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="mb-1 block text-xs font-medium">Страйк (+%)</label><select name="strike" class="${inputCls()}">${strikeOpts}</select></div>
                <div><label class="mb-1 block text-xs font-medium">IV Adj (+%)</label><select name="vol" class="${inputCls()}">${ivOpts}</select></div>
                <div><label class="mb-1 block text-xs font-medium">Капитал на сделку</label><select name="cap" class="${inputCls()}">${capOpts}</select></div>
                <div><label class="mb-1 block text-xs font-medium">Экспирация</label>
                  <select name="expiration" class="${inputCls()}">
                    <option value="1">1 неделя</option><option value="2">2 недели</option>
                    <option value="4" selected>1 месяц</option><option value="8">2 месяца</option>
                    <option value="12">3 месяца</option><option value="24">6 месяцев</option>
                  </select>
                </div>
                <div class="col-span-2"><label class="mb-1 block text-xs font-medium">Макс. удержание (дней)</label>
                  <input name="maxHold" type="number" min="1" max="365" value="30" class="${inputCls()}" />
                </div>
                <div class="col-span-2"><label class="mb-1 block text-xs font-medium">Маржинальность</label>
                  <select name="leverage" class="${inputCls()}">${levOptions(200)}</select>
                </div>
              </div>
              <button id="opt-run" class="btn-primary w-full">Запустить бэктест</button>
            </form>
          </aside>
        </div>
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
      ${pageHeader('Календарь торгов', 'NYSE · Американский рынок акций')}
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>Торговый · ${esc(hours.start)}–${esc(hours.end)}</span>
        <span class="flex items-center gap-1.5">${icon('calendar', 'w-3.5 h-3.5')} Выходной (Сб, Вс)</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Раннее закрытие · до 13:00</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Праздник · биржа закрыта</span>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 p-3">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <button id="cal-prev" class="icon-btn icon-btn-md icon-btn-glass">‹</button>
            <div class="font-semibold">${months[m]} ${y}</div>
            <button id="cal-next" class="icon-btn icon-btn-md icon-btn-glass">›</button>
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
            ${Object.keys(holidays).length ? Object.entries(holidays).sort().map(([k, v]) => `<div class="flex justify-between text-sm py-1"><span>${esc(typeof v === 'string' ? v : (v && v.name) || 'Holiday')}</span><span class="text-red-600">${esc(mmddLabel(k))}</span></div>`).join('') : '<p class="text-sm text-gray-500">Нет данных</p>'}
          </div>
          <div class="rounded-lg border border-amber-100 bg-amber-50 dark:bg-amber-950/20 p-3">
            <div class="flex justify-between font-medium text-amber-800 mb-2"><span>Раннее закрытие ${y}</span><span>${Object.keys(shorts).length}</span></div>
            ${Object.keys(shorts).length ? Object.entries(shorts).sort().map(([k, v]) => `<div class="flex justify-between text-sm py-1"><span>${esc(typeof v === 'string' ? v : (v && v.name) || 'Early Close')}</span><span>${esc(mmddLabel(k))}</span></div>`).join('') : '<p class="text-sm text-gray-500">Нет</p>'}
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
      const rows = Object.entries(map).flatMap(([ticker, evs]) => (evs || []).map((e) => `<tr><td class="font-mono">${esc(ticker)}</td><td>${esc(e.date)} × ${esc(e.factor)}</td><td class="text-right"><button data-ds="${esc(ticker)}" data-dd="${esc(e.date)}" class="text-red-600">удалить</button></td></tr>`)).join('');
      if (!rows) {
        body = `<div id="spl-list">
          <div class="splits-table overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>События</th><th class="text-right">Действия</th></tr></thead><tbody><tr><td colspan="3" class="text-center text-gray-500">Нет данных</td></tr></tbody></table></div>
          <div class="splits-empty-mobile">Нет данных</div>
        </div>`;
      } else {
        body = `<div id="spl-list" class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>События</th><th class="text-right">Действия</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    } else if (state.splitsTab === 'create') {
      body = `<form id="split-form" class="flex flex-wrap gap-2 mb-4">
        <input name="ticker" placeholder="AAPL" class="field w-24" />
        <input name="date" placeholder="YYYY-MM-DD" class="field w-36" />
        <input name="factor" type="number" step="0.01" placeholder="2" class="field w-20" />
        <button class="btn-primary min-h-0 py-2">Добавить</button>
      </form>`;
    } else if (state.splitsTab === 'import') {
      body = `<p class="text-sm text-gray-600 mb-2">Импорт JSON массива сплитов для тикера.</p><textarea id="split-import" class="field h-40 font-mono text-xs" placeholder='[{"date":"2020-08-31","factor":4}]'></textarea><div class="flex gap-2 mt-2"><input id="split-import-ticker" placeholder="AAPL" class="field w-24" /><button id="split-import-btn" class="btn-primary min-h-0 py-2">Импортировать</button></div>`;
    } else if (state.splitsTab === 'export') {
      body = `<pre class="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto">${esc(JSON.stringify(map, null, 2))}</pre>`;
    } else {
      body = `<p class="text-sm text-gray-500">Webull API для сплитов недоступен без токена. Сырой ответ: пустой список.</p>`;
    }
    return `
      ${pageHeader('Сплиты', 'Управление дроблениями акций', `<button id="splits-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список сплитов">${icon('refresh', 'w-4 h-4')}</button>`)}
      ${analysisTabs(SPLITS_TABS, state.splitsTab, 'data-sptab')}
      <div class="mt-6">${state.splitsTab !== 'create' ? '<form id="split-form" class="hidden"></form>' : ''}${body}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 border-t pt-4 mt-6">Изменения сохраняются в базе данных</div>`;
  }

  function pageWatches() {
    const list = (state.watches || []).map((w) => `<div class="flex justify-between items-center border rounded-lg p-3 mb-2 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div><div class="font-mono font-semibold">${esc(w.symbol)}</div><div class="text-xs text-gray-500">low ${esc(w.lowIBS)} / high ${esc(w.highIBS)}</div></div>
      <button data-dw="${esc(w.symbol)}" class="text-sm text-red-600">Удалить</button>
    </div>`).join('') || '<p class="text-sm text-gray-500">Нет активных наблюдений. Включите мониторинг на вкладке «Тикеры».</p>';
    const thr = state.settings.watchThresholdPct ?? 0.3;
    const overview = `
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
        <div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50">Пока нет закрытых сделок. Метрики появятся после первого завершенного трейда.</div>
      </div>`;
    return `
      ${pageHeader('Мониторинг', 'Отслеживание позиций и уведомления в Telegram', `<button id="watch-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список">${icon('refresh', 'w-4 h-4')}</button>`)}
      <p class="text-sm text-gray-600 dark:text-gray-300">Глобальный порог уведомлений: ${esc(thr)}% <span class="ml-2 text-xs text-gray-500">(применяется ко всем отслеживаемым акциям)</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">До следующего подсчёта сигналов: ${formatDuration(secondsToNextSignal())}</p>
      ${overview}
      ${analysisTabs(WATCH_TABS, state.watchTab, 'data-wtab')}
      <div class="mt-4">
        ${state.watchTab === 'summary' ? `<div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700"><h3 class="text-lg font-semibold mb-2">Капитал мониторинга (старт $10,000.00)</h3><p class="text-sm text-gray-500">Нет закрытых сделок для построения кривой капитала.</p></div>` : ''}
        ${state.watchTab === 'watches' ? `<form id="watch-form" class="flex gap-2 mb-4"><input name="symbol" placeholder="AAPL" class="field" /><button class="btn-primary min-h-0 py-2">Добавить</button></form><div id="watch-list">${list}</div>` : ''}
        ${state.watchTab === 'trades' ? '<div id="watch-trades" class="text-sm text-gray-500">Загрузка сделок…</div>' : ''}
        ${state.watchTab === 'ema' ? '<p class="text-sm text-gray-500">EMA-алерты появятся после сигналов мониторинга.</p>' : ''}
      </div>`;
  }

  function pageBroker() {
    const list = (state.broker || []).map((t) => `<div class="flex justify-between border rounded-lg p-3 mb-1 text-sm dark:border-gray-800 bg-white dark:bg-gray-900"><span class="font-mono">${esc(t.symbol)} ${esc(t.entryDate || '')} @ ${esc(t.entryPrice ?? '—')}</span><button data-bd="${esc(t.id)}" class="text-red-600">удалить</button></div>`).join('') || '<p class="text-sm text-gray-500">Нет сделок</p>';
    const live = state.settings?.autoTrading?.enabled;
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
      body = `<div class="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900/40 px-4 py-3 text-sm">Webull credentials are not configured</div>
        <form id="broker-form" class="hidden"></form><div id="broker-list" class="hidden">${list}</div>`;
    } else {
      body = `<p class="text-sm text-gray-500">Раздел недоступен без ключей Webull.</p><form id="broker-form" class="hidden"></form><div id="broker-list" class="hidden">${list}</div>`;
    }
    return `
      ${pageHeader('Кабинет Webull', 'Баланс счёта, позиции, ордера, история и логи исполнения по Webull', `<div class="flex items-center gap-2"><span class="rounded-full px-3 py-1 text-xs font-semibold ${live ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}">${live ? '[LIVE]' : '[OFF]'}</span><button id="broker-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить">${icon('refresh', 'w-4 h-4')}</button></div>`)}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs(BROKER_TABS, tab, 'data-btab')}
        <div class="p-4">${body}<div id="broker-token" class="text-sm text-gray-500 mt-3">${state.token && state.token.present ? 'Токен Webull задан' : ''}</div></div>
      </div>`;
  }

  function pageSettings() {
    const st = state.settings || {};
    const tab = state.settingsTab;
    let body = '';
    if (tab === 'general') {
      body = `<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-1">Уведомления</div>
          <label class="block text-sm">Порог близости к IBS, %<input name="watchThresholdPct" type="number" step="0.1" class="field mt-1" value="${esc(st.watchThresholdPct ?? 0.3)}" /></label>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-3">
          <div class="font-medium mb-1">Страница «Несколько тикеров»</div>
          <label class="block text-sm">Тикеры по умолчанию<input name="defaultMultiTickerSymbols" class="field mt-1" value="${esc(st.defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS')}" /></label>
          <p class="text-xs text-gray-500 mt-1">Пример: AAPL, MSFT, AMZN, MAGS</p>
        </div>
        <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enablePostClosePriceActualization" ${st.enablePostClosePriceActualization ? 'checked' : ''} /> актуализация после закрытия</label>`;
    } else if (tab === 'api') {
      body = `<label class="block text-sm mb-3">Провайдер котировок<select name="resultsQuoteProvider" class="field mt-1"><option ${st.resultsQuoteProvider === 'finnhub' ? 'selected' : ''} value="finnhub">finnhub</option><option ${st.resultsQuoteProvider === 'alpha_vantage' ? 'selected' : ''} value="alpha_vantage">alpha_vantage</option><option ${st.resultsQuoteProvider === 'twelve_data' ? 'selected' : ''} value="twelve_data">twelve_data</option><option ${st.resultsQuoteProvider === 'polygon' ? 'selected' : ''} value="polygon">polygon</option><option ${st.resultsQuoteProvider === 'webull' ? 'selected' : ''} value="webull">webull</option></select></label>
        <label class="block text-sm">Провайдер загрузки<select name="enhancerProvider" class="field mt-1"><option ${st.enhancerProvider === 'finnhub' ? 'selected' : ''} value="finnhub">finnhub</option><option ${st.enhancerProvider === 'alpha_vantage' ? 'selected' : ''} value="alpha_vantage">alpha_vantage</option><option ${st.enhancerProvider === 'twelve_data' ? 'selected' : ''} value="twelve_data">twelve_data</option><option ${st.enhancerProvider === 'polygon' ? 'selected' : ''} value="polygon">polygon</option></select></label>`;
    } else if (tab === 'telegram') {
      body = `<p class="text-sm text-gray-600">Порог уведомлений IBS задаётся во вкладке «Общие». Telegram-бот использует те же чат и токен, что на сервере.</p>`;
    } else if (tab === 'interface') {
      body = `<p class="text-sm text-gray-600 dark:text-gray-400">Тема переключается иконкой в шапке: Авто → Тёмная → Светлая.</p>`;
    } else {
      body = `<p class="text-sm text-gray-600">Автоторговля настраивается отдельно. Сейчас: ${(st.autoTrading && st.autoTrading.enabled) ? 'включена' : 'выключена'}.</p>`;
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
      if (e.target.closest('#confirm-no')) { state.confirm = null; document.getElementById('overlay-root').innerHTML = overlay(); return; }
      if (e.target.closest('#confirm-yes')) {
        const fn = state.confirm && state.confirm.onYes;
        state.confirm = null;
        document.getElementById('overlay-root').innerHTML = overlay();
        if (fn) fn();
      }
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
    if (menuBtn) menuBtn.innerHTML = icon(state.mobileOpen ? 'x' : 'menu');
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
      if (state.page === '/login' || !state.user) {
        app.innerHTML = loginPage();
        bindLogin();
        return;
      }
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
      state.tickerInput = el.value;
      state.selected = parseTickers(el.value);
      try { localStorage.setItem('tickersInput', state.tickerInput); } catch (_) {}
    });
  }

  async function afterRender() {
    const p = state.page;
    const root = document.getElementById('page-root');
    if (!root) return;

    if (p === '/data' || p === '/') {
      document.getElementById('file-json')?.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const json = JSON.parse(await f.text());
          await API.saveDataset(json);
          state.datasets = await API.datasets();
          toast('Датасет сохранён');
          renderPage();
        } catch (err) { toast(err.message); }
      });
      document.getElementById('view-list')?.addEventListener('click', () => { state.dataView = 'list'; localStorage.setItem('dataView', 'list'); renderPage(); });
      document.getElementById('view-grid')?.addEventListener('click', () => { state.dataView = 'compact'; localStorage.setItem('dataView', 'compact'); renderPage(); });
      root.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => { state.dataTag = b.dataset.tag; renderPage(); }));
      root.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        state.ticker = b.dataset.load;
        state.tickerInput = b.dataset.load;
        state.selected = [b.dataset.load];
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
    }

    if (p === '/enhance') {
      const form = document.getElementById('enhance-form');
      const btn = form?.querySelector('.enhance-load');
      const syncLoad = () => { if (btn && form) btn.disabled = !String(form.symbol.value || '').trim(); };
      form?.symbol.addEventListener('input', syncLoad);
      syncLoad();
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
        state.selected = d;
        renderPage();
      });
      document.getElementById('run-bt')?.addEventListener('click', runStocks);
      root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => { state.stockTab = b.dataset.stab; renderPage(); }));
      paintStockCharts();
      runNested();
    }

    if (p === '/ema') {
      syncTickerField('ema-tickers');
      document.getElementById('ema-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const loaded = await loadSelected();
          const tp = Number(String(fd.get('takeProfit') || '').replace(',', '.'));
          const ema = {
            initialCapital: 10000,
            leverage: Number(fd.get('leverage') || 200) / 100,
            emaPeriod: Number(fd.get('period') || 200),
            buyZones: [{ id: 'buy', levelPct: Number(fd.get('buy')), enabled: true }],
            sellZones: [{ id: 'sell', levelPct: Number(fd.get('sell')), enabled: true }],
            signalSource: fd.get('signal') || 'close',
            emaStartMode: fd.get('start') || 'full_history',
            noSellAtLoss: !!e.target.noSellAtLoss?.checked,
          };
          if (Number.isFinite(tp) && tp > 0) ema.takeProfitPercent = tp;
          const r = await API.calc('ema-zone', {
            tickers: loaded,
            ema,
          });
          const el = document.getElementById('ema-out');
          el.className = 'lg-span-2 lg:col-span-2 min-h-[420px]';
          el.innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + tradesTable(r.trades) + '<div id="ema-eq" class="chart-box mt-4"></div>';
          Charts.line(document.getElementById('ema-eq'), r.equity, isDark());
        } catch (err) { toast(err.message); }
      });
    }

    if (p === '/multi-ticker-options') {
      syncTickerField('opt-tickers');
      document.getElementById('opt-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const out = document.getElementById('optm-out');
        if (out) { out.className = 'lg-span-2 lg:col-span-2 min-h-[420px]'; out.textContent = 'Считаем…'; }
        await runOptionsMulti(new FormData(e.target));
      });
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
    }

    if (p === '/watches') {
      if (!state.loaded.watches) {
        try { state.watches = await API.watches() || []; } catch (_) { state.watches = []; }
        state.loaded.watches = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-wtab]').forEach((b) => b.addEventListener('click', () => { state.watchTab = b.dataset.wtab; renderPage(); }));
      document.getElementById('watch-refresh')?.addEventListener('click', async () => { state.watches = await API.watches(); renderPage(); });
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
      if (state.watchTab === 'trades') {
        try {
          const t = await API.trades();
          const list = Array.isArray(t) ? t : (t.trades || []);
          document.getElementById('watch-trades').innerHTML = tradesTable(list);
        } catch (err) { document.getElementById('watch-trades').textContent = err.message; }
      }
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
        state.loaded.settings = true;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-setab]').forEach((b) => b.addEventListener('click', () => { state.settingsTab = b.dataset.setab; renderPage(); }));
      document.getElementById('set-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const body = {};
        for (const [k, v] of fd.entries()) body[k] = v;
        if (form.enablePostClosePriceActualization) body.enablePostClosePriceActualization = form.enablePostClosePriceActualization.checked;
        if (body.watchThresholdPct != null) body.watchThresholdPct = Number(body.watchThresholdPct);
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
      riskManagement: { initialCapital: 10000, capitalUsage: 100, commission: { type: 'percentage', percentage: 0 }, slippage: 0, maxHoldDays: 30 },
    };
  }

  async function loadSelected() {
    const sel = parseTickers(state.tickerInput);
    state.selected = sel;
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
      const single = {};
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
      const loaded = await loadSelected();
      const stock = await API.calc('single-position', { tickers: loaded, strategy: defaultStrategy(), leverage: Number(fd.get('leverage') || 200) / 100 });
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
      document.getElementById('optm-out').innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + tradesTable(r.trades);
    } catch (e) { toast(e.message); }
  }

  function paintStockCharts() {
    const r = state.result;
    if (!r) return;
    const dark = isDark();
    if (state.stockTab === 'summary' && document.getElementById('chart-hero')) {
      Charts.line(document.getElementById('chart-hero'), (state.bars || []).map((b) => ({ date: b.date, value: b.close })), dark, '#4f46e5');
    }
    if (state.stockTab === 'price' && document.getElementById('chart-price')) Charts.candles(document.getElementById('chart-price'), state.bars, dark);
    if (state.stockTab === 'tickerCharts' && document.getElementById('ticker-charts')) {
      const host = document.getElementById('ticker-charts');
      host.innerHTML = (state.tickersData || []).map((t) => `<div><div class="text-sm font-semibold mb-1">${esc(t.ticker)}</div><div id="tc-${esc(t.ticker)}" class="chart-box rounded border dark:border-gray-800"></div></div>`).join('');
      (state.tickersData || []).forEach((t) => {
        const el = document.getElementById('tc-' + t.ticker);
        if (el) Charts.candles(el, t.data, dark);
      });
    }
    if (state.stockTab === 'equity' && document.getElementById('chart-eq')) Charts.line(document.getElementById('chart-eq'), r.equity, dark);
    if (state.stockTab === 'drawdown' && document.getElementById('chart-dd')) {
      Charts.line(document.getElementById('chart-dd'), (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, '#dc2626');
    }
    if (state.stockTab === 'exposure' && document.getElementById('chart-exp') && r.exposure) {
      Charts.line(document.getElementById('chart-exp'), r.exposure.map((p) => ({ date: p.date, value: p.exposurePct })), dark, '#0ea5e9');
    }
    if (state.stockTab === 'openDayDrawdown') {
      const el = document.getElementById('odd-out');
      if (el && state.bars.length) {
        const rows = (r.trades || []).map((tr) => {
          const bar = state.bars.find((b) => b.date === tr.entryDate);
          if (!bar) return null;
          const dd = bar.low != null && tr.entryPrice ? ((tr.entryPrice - bar.low) / tr.entryPrice) * 100 : 0;
          return { date: tr.entryDate, value: dd };
        }).filter(Boolean);
        el.innerHTML = '<div id="chart-odd" class="chart-box rounded border dark:border-gray-800"></div>';
        Charts.line(document.getElementById('chart-odd'), rows, dark, '#f59e0b');
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
        const r = await API.calc(name, { data: state.bars, strategy: st, trades: state.result.trades, ticker: state.ticker, tickers: state.tickersData, ...extra });
        el.innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || r.tradesList?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + tradesTable(r.trades || r.tradesList);
      } catch (e) { el.textContent = e.message; }
    };
    if (state.stockTab === 'buyhold') fill('bh-out', 'buy-hold');
    if (state.stockTab === 'buyAtClose') fill('bac-out', 'buy-at-close');
    if (state.stockTab === 'buyAtClose4') fill('bac4-out', 'buy-at-close-4', { leverage: (state.leverage || 200) / 100 });
    if (state.stockTab === 'noStopLoss') fill('nsl-out', 'no-stop-loss', { noStop: { exitMode: 'ibs-only', requireProfitableExit: false } });
    if (state.stockTab === 'options') fill('opt-out', isSingle() ? 'options' : 'options-multi', { config: { strikePct: 10, volAdjPct: 20, capitalPct: 10 } });
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
          single: { monthlyAmount: Number(fd.get('amount')), monthlyDayOfMonth: Number(fd.get('day')) },
        });
        document.getElementById('mc-out').innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + tradesTable(r.trades);
      });
    }
  }

  async function bootAuthed() {
    try { const st = await API.status(); state.apiBuildId = st.timestamp || st.buildId; } catch (_) {}
    try { state.datasets = await API.datasets(); } catch (_) { state.datasets = []; }
    try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
    if (state.settings.defaultMultiTickerSymbols && !localStorage.getItem('tickersInput')) {
      state.tickerInput = state.settings.defaultMultiTickerSymbols;
    }
    state.selected = parseTickers(state.tickerInput);
    if (state.datasets[0] && !state.ticker) state.ticker = state.datasets[0].ticker;
  }

  async function start() {
    applyTheme();
    const path = location.pathname === '/' ? '/data' : location.pathname;
    state.page = path === '/results' ? '/stocks' : path;
    const q = new URL(location.href).searchParams.get('tickers');
    if (q) {
      state.tickerInput = q.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).join(', ');
      state.selected = parseTickers(state.tickerInput);
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
