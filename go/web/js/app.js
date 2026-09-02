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
    { to: '/data', label: 'Данные' },
    { to: '/stocks', label: 'Акции' },
    { to: '/ema', label: 'EMA' },
    { to: '/multi-ticker-options', label: 'Опционы' },
    { to: '/broker', label: 'Брокер' },
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

  const state = {
    dark: localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches),
    user: false,
    apiBuildId: null,
    page: '/',
    datasets: [],
    result: null,
    ticker: 'GOOGL',
    selected: [],
    tickersData: [],
    stockTab: 'summary',
    bars: [],
    error: null,
    cal: { year: new Date().getFullYear(), month: new Date().getMonth(), data: null },
  };

  function logo(size) {
    const cls = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
    return `<svg class="${cls} text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`;
  }

  function applyTheme() {
    document.documentElement.classList.toggle('dark', state.dark);
    localStorage.setItem('theme', state.dark ? 'dark' : 'light');
  }

  function navigate(path, replace) {
    if (path === '/results') path = '/stocks';
    if (replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
    state.page = path;
    render();
  }

  window.addEventListener('popstate', () => {
    state.page = location.pathname;
    render();
  });

  function layout(inner) {
    const nav = TABS.map((t) => `<a href="${t.to}" data-nav class="px-3 py-1 rounded text-sm border ${state.page === t.to ? 'nav-active' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800'}">${t.label}</a>`).join('');
    const mobile = TABS.concat([{ to: '/settings', label: 'Настройки' }]).map((t) => `<a href="${t.to}" data-nav class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${state.page === t.to ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200'}">${t.label}</a>`).join('');
    const bottom = BOTTOM.map((t) => `<a href="${t.to}" data-nav class="flex flex-col items-center justify-center gap-1 py-2 text-xs ${state.page === t.to ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}">${t.label}</a>`).join('');
    return `
      <div class="min-h-screen flex flex-col bg-gray-50 text-gray-800 dark:text-gray-100">
        <header class="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <a href="/data" data-nav class="flex min-w-0 items-center gap-3 hover:opacity-80">
              ${logo('sm')}
              <span class="hidden truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:inline">IBS Trading Strategy</span>
            </a>
            <div class="flex items-center gap-2">
              <button id="theme-btn" class="px-3 py-1.5 rounded border text-sm bg-white dark:bg-gray-900 dark:border-gray-800">${state.dark ? 'Светлая' : 'Тёмная'}</button>
              <a href="/settings" data-nav class="hidden md:inline-flex px-3 py-1.5 rounded border text-sm bg-white dark:bg-gray-900 dark:border-gray-800">Настройки</a>
              <button id="logout-btn" class="hidden md:inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-800">Выйти</button>
            </div>
          </div>
        </header>
        <main id="main-content" class="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-32 md:pb-24 safe-area-pb">
          <nav class="hidden md:flex gap-2 flex-wrap mb-4 desktop-nav">${nav}</nav>
          <div class="md:hidden mb-4 space-y-0.5">${mobile}</div>
          ${inner}
        </main>
        <nav class="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 grid grid-cols-5 items-center h-16">${bottom}</nav>
        <footer class="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
          <div class="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="space-y-4">
              <div class="flex items-center gap-3">${logo('md')}<h3 class="font-bold">IBS Trading Strategy</h3></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Анализ и тестирование торговых стратегий на исторических данных. Специализация на стратегиях mean reversion и техническом анализе.</p>
            </div>
            <div class="space-y-2">
              <h4 class="text-sm font-semibold uppercase tracking-wider">Система</h4>
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Версия API:</span><span class="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800">${state.apiBuildId || 'dev'}</span></div>
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600 dark:text-gray-400">Статус:</span><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-200">Online</span></div>
            </div>
          </div>
        </footer>
      </div>`;
  }

  function loginPage() {
    return `
      <div class="min-h-screen bg-gray-50 text-gray-800 dark:text-gray-100 flex flex-col">
        <header class="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
          <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-3">${logo('sm')}<span class="text-lg font-semibold">IBS Trading Strategy</span></div>
            <button id="theme-btn" class="px-3 py-1.5 rounded border text-sm">${state.dark ? 'Светлая' : 'Тёмная'}</button>
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
      </div>`;
  }

  function fmt(n, d = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    if (!Number.isFinite(n)) return String(n);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pnlClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }

  function tradesTable(trades) {
    const rows = (trades || []).slice(0, 200).map((t) => `<tr>
      <td>${t.entryDate}</td><td>${t.exitDate}</td>
      <td>${fmt(t.entryPrice)}</td><td>${fmt(t.exitPrice)}</td>
      <td>${fmt(t.quantity, 4)}</td>
      <td class="${pnlClass(t.pnl)}">${fmt(t.pnl)}</td>
      <td>${t.duration}</td><td>${t.exitReason || ''}</td>
    </tr>`).join('');
    return `<div class="table-wrap rounded border dark:border-gray-800"><table class="trades"><thead><tr><th>Вход</th><th>Выход</th><th>Цена входа</th><th>Цена выхода</th><th>Кол-во</th><th>P&L</th><th>Дней</th><th>Причина</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Нет сделок</td></tr>'}</tbody></table></div>`;
  }

  function metricsGrid(m) {
    if (!m) return '';
    const items = [
      ['Доходность', fmt(m.totalReturn) + '%'],
      ['CAGR', fmt(m.cagr) + '%'],
      ['Макс. просадка', fmt(m.maxDrawdown) + '%'],
      ['Win rate', fmt(m.winRate) + '%'],
      ['Sharpe', fmt(m.sharpeRatio)],
      ['Сделок', m.totalTrades ?? ''],
    ];
    return `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">${items.map(([k, v]) => `<div class="rounded-lg border p-3 bg-white dark:bg-gray-900 dark:border-gray-800"><div class="text-xs text-gray-500">${k}</div><div class="text-lg font-semibold mono">${v}</div></div>`).join('')}</div>`;
  }

  async function pageData() {
    const list = state.datasets.map((d) => `<div class="flex items-center justify-between rounded border p-3 bg-white dark:bg-gray-900 dark:border-gray-800">
      <div><div class="font-semibold">${d.ticker}</div><div class="text-xs text-gray-500">${d.dataPoints || 0} баров · ${d.dateRange?.from || ''} — ${d.dateRange?.to || ''}</div></div>
      <div class="flex gap-2">
        <button data-load="${d.ticker}" class="px-3 py-1.5 rounded text-sm bg-indigo-600 text-white">Открыть</button>
        <button data-del="${d.ticker}" class="px-3 py-1.5 rounded text-sm border">Удалить</button>
      </div>
    </div>`).join('');
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Данные</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Загрузите JSON датасет (OHLC) или выберите сохранённый. Расчёты выполняются на сервере.</p>
      <div class="flex flex-wrap gap-3 mb-6">
        <input id="file-json" type="file" accept=".json,application/json" class="text-sm" />
        <button id="enhance-link" class="px-3 py-1.5 rounded border text-sm">Перейти к загрузке с API</button>
      </div>
      <div class="space-y-2">${list || '<div class="text-sm text-gray-500">Нет датасетов. Загрузите JSON.</div>'}</div>
    `);
  }

  function pageEnhance() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Загрузка с API</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Провайдеры (Alpha Vantage, Finnhub, Twelve Data, Polygon, Webull) доступны через те же маршруты <span class="mono">/api/fetch/:provider/:symbol</span>.</p>
      <form id="enhance-form" class="flex gap-2 items-end">
        <div><label class="block text-sm mb-1">Тикер</label><input name="symbol" value="AAPL" class="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700" /></div>
        <div><label class="block text-sm mb-1">Провайдер</label>
          <select name="provider" class="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700">
            <option value="finnhub">finnhub</option><option value="alpha_vantage">alpha_vantage</option>
            <option value="twelve_data">twelve_data</option><option value="polygon">polygon</option>
          </select>
        </div>
        <button class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Запросить</button>
      </form>
      <pre id="enhance-out" class="mt-4 text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto"></pre>
    `);
  }

  function isSingle() { return (state.selected || []).length === 1; }

  function visibleStockTabs() {
    const single = isSingle();
    return STOCK_TABS.filter((t) => {
      if (SINGLE_ONLY.has(t.id) && !single) return false;
      if (MULTI_ONLY.has(t.id) && single) return false;
      return true;
    });
  }

  function pageStocks() {
    const tabs = visibleStockTabs().map((t) => `<button data-stab="${t.id}" class="tab-btn px-3 py-1 rounded text-sm border ${state.stockTab === t.id ? 'active' : 'bg-white dark:bg-gray-900 dark:border-gray-800'}">${t.label}</button>`).join('');
    const checks = state.datasets.map((d) => `<label class="inline-flex items-center gap-1 text-sm mr-3"><input type="checkbox" data-ticker="${d.ticker}" ${state.selected.includes(d.ticker) ? 'checked' : ''} /> ${d.ticker}</label>`).join('');
    const r = state.result;
    let body = '<p class="text-sm text-gray-500">Выберите тикеры и запустите портфельный IBS (одна позиция).</p>';
    if (r) {
      if (state.stockTab === 'summary') body = metricsGrid(r.metrics) + `<p class="text-sm mt-3">Тикеры: ${(state.selected || []).join(', ')}. Сделок: ${r.trades?.length || 0}. Итог: ${fmt(r.finalValue ?? r.metrics?.finalValue)}</p>`;
      else if (state.stockTab === 'price') body = `<div id="chart-price" class="chart-box-lg rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'tickerCharts') body = `<div id="ticker-charts" class="grid md:grid-cols-2 gap-3"></div>`;
      else if (state.stockTab === 'equity') body = `${metricsGrid(r.metrics)}<div id="chart-eq" class="chart-box mt-4 rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'exposure') body = `<div id="chart-exp" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'drawdown') body = `<div id="chart-dd" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'openDayDrawdown') body = `<div id="odd-out"></div>`;
      else if (state.stockTab === 'trades') body = tradesTable(r.trades);
      else if (state.stockTab === 'profit') body = `<p class="mb-2">Profit factor: <b>${fmt(r.metrics?.profitFactor)}</b></p>` + tradesTable(r.trades);
      else if (state.stockTab === 'duration') {
        const avg = r.trades?.length ? r.trades.reduce((s, t) => s + (t.duration || 0), 0) / r.trades.length : 0;
        body = `<p>Средняя длительность: <b>${fmt(avg, 1)}</b> дн.</p>` + tradesTable(r.trades);
      } else if (state.stockTab === 'monthlyContribution') body = `<form id="mc-form" class="flex gap-2 mb-3"><input name="amount" type="number" value="500" class="rounded border px-2 py-1 w-28 dark:bg-gray-800" /><input name="day" type="number" value="1" class="rounded border px-2 py-1 w-20 dark:bg-gray-800" /><button class="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Посчитать</button></form><div id="mc-out"></div>`;
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm">Загрузка сплитов…</div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">Считаем Buy & Hold…</div>`;
      else if (state.stockTab === 'buyAtClose') body = `<div id="bac-out">Buy at close…</div>`;
      else if (state.stockTab === 'buyAtClose4') body = `<div id="bac4-out">Buy at close 4…</div>`;
      else if (state.stockTab === 'noStopLoss') body = `<div id="nsl-out">Без стоп-лосса…</div>`;
      else if (state.stockTab === 'options') body = `<div id="opt-out">Опционы…</div>`;
    }
    return layout(`
      <h1 class="text-xl font-semibold mb-2">Акции</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Несколько тикеров — одна открытая позиция, вход в инструмент с наименьшим IBS. Расчёт: <span class="mono">POST /api/calc/single-position</span>.</p>
      <div class="mb-3">${checks || '<span class="text-sm text-gray-500">Нет датасетов</span>'}</div>
      <div class="flex gap-2 mb-4">
        <button id="run-bt" class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Запустить портфель</button>
      </div>
      <div class="flex flex-wrap gap-2 mb-4">${tabs}</div>
      <div id="stock-body">${body}</div>
    `);
  }

  function pageEMA() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">EMA</h1>
      <form id="ema-form" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <label class="text-sm">Тикер<select name="ticker" class="block w-full rounded border px-2 py-1 dark:bg-gray-800">${state.datasets.map((d) => `<option>${d.ticker}</option>`).join('')}</select></label>
        <label class="text-sm">Период EMA<input name="period" type="number" value="200" class="block w-full rounded border px-2 py-1 dark:bg-gray-800" /></label>
        <label class="text-sm">Buy %<input name="buy" type="number" value="-20" class="block w-full rounded border px-2 py-1 dark:bg-gray-800" /></label>
        <label class="text-sm">Sell %<input name="sell" type="number" value="40" class="block w-full rounded border px-2 py-1 dark:bg-gray-800" /></label>
        <button class="px-3 py-2 rounded bg-indigo-600 text-white text-sm col-span-2">Запустить</button>
      </form>
      <div id="ema-out"></div>
    `);
  }

  function pageOptions() {
    const checks = state.datasets.map((d) => `<label class="inline-flex items-center gap-1 text-sm mr-3"><input type="checkbox" data-oticker="${d.ticker}" ${state.selected.includes(d.ticker) ? 'checked' : ''} /> ${d.ticker}</label>`).join('');
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Опционы</h1>
      <p class="text-sm text-gray-600 mb-3">Портфельные IBS-сделки, затем <span class="mono">POST /api/calc/options-multi</span>. Black–Scholes на сервере.</p>
      <div class="mb-3">${checks}</div>
      <button id="opt-run" class="px-3 py-2 rounded bg-indigo-600 text-white text-sm mb-4">Посчитать опционы</button>
      <div id="optm-out"></div>
    `);
  }

  function pageCalendar() {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const y = state.cal.year, m = state.cal.month;
    const first = new Date(Date.UTC(y, m, 1));
    const startDow = (first.getUTCDay() + 6) % 7;
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const holidays = state.cal.data?.holidays?.[String(y)] || {};
    const shorts = state.cal.data?.shortDays?.[String(y)] || {};
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<div></div>';
    for (let d = 1; d <= daysIn; d++) {
      const mmdd = String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const hol = holidays[mmdd];
      const sh = shorts[mmdd];
      const cls = hol ? 'bg-red-100 dark:bg-red-950/40' : sh ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-white dark:bg-gray-900';
      cells += `<button data-cday="${mmdd}" class="border rounded p-2 text-sm ${cls} dark:border-gray-800">${d}${hol ? '<div class="text-[10px] text-red-700">выходной</div>' : ''}${sh ? '<div class="text-[10px] text-amber-700">короткий</div>' : ''}</button>`;
    }
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Календарь</h1>
      <div class="flex items-center gap-3 mb-4">
        <button id="cal-prev" class="px-2 py-1 border rounded">‹</button>
        <div class="font-semibold">${months[m]} ${y}</div>
        <button id="cal-next" class="px-2 py-1 border rounded">›</button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-1">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((x)=>`<div>${x}</div>`).join('')}</div>
      <div class="grid grid-cols-7 gap-1">${cells}</div>
      <form id="cal-edit" class="mt-4 flex flex-wrap gap-2 items-end">
        <input name="mmdd" placeholder="MM-DD" class="rounded border px-2 py-1 w-28 dark:bg-gray-800" />
        <select name="type" class="rounded border px-2 py-1 dark:bg-gray-800"><option value="normal">обычный</option><option value="holiday">выходной</option><option value="short">короткий</option></select>
        <input name="name" placeholder="Название" class="rounded border px-2 py-1 dark:bg-gray-800" />
        <button class="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Сохранить день</button>
      </form>
      <p class="text-xs text-gray-500 mt-2">Клик по дню подставляет дату. Сохранение — PATCH /api/trading-calendar/day.</p>
    `);
  }
  function pageSplits() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Сплиты</h1>
      <form id="split-form" class="flex flex-wrap gap-2 mb-4">
        <input name="ticker" placeholder="AAPL" class="rounded border px-2 py-1 w-24 dark:bg-gray-800" />
        <input name="date" type="date" class="rounded border px-2 py-1 dark:bg-gray-800" />
        <input name="factor" type="number" step="0.01" placeholder="2" class="rounded border px-2 py-1 w-20 dark:bg-gray-800" />
        <button class="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Добавить</button>
      </form>
      <div id="spl-list"></div>
    `);
  }
  function pageWatches() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Мониторинг</h1>
      <form id="watch-form" class="flex gap-2 mb-4">
        <input name="symbol" placeholder="AAPL" class="rounded border px-3 py-2 dark:bg-gray-800" />
        <button class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Добавить</button>
      </form>
      <div id="watch-list"></div>
    `);
  }
  function pageBroker() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Брокер</h1>
      <p class="text-sm text-gray-600 mb-3">Журнал брокерских сделок. Живые ордера без ключей не отправляются.</p>
      <form id="broker-form" class="flex flex-wrap gap-2 mb-4">
        <input name="symbol" placeholder="AAPL" class="rounded border px-2 py-1 w-24 dark:bg-gray-800" />
        <input name="entryDate" type="date" class="rounded border px-2 py-1 dark:bg-gray-800" />
        <input name="entryPrice" type="number" step="0.01" placeholder="цена" class="rounded border px-2 py-1 w-24 dark:bg-gray-800" />
        <button class="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Добавить</button>
      </form>
      <div id="broker-list"></div>
      <div id="broker-token" class="text-sm text-gray-500 mt-3"></div>
    `);
  }
  function pageSettings() {
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Настройки</h1>
      <form id="set-form" class="space-y-3 max-w-lg">
        <label class="block text-sm">Порог уведомления IBS %<input name="watchThresholdPct" type="number" step="0.1" class="block w-full rounded border px-2 py-1 dark:bg-gray-800" /></label>
        <label class="block text-sm">Провайдер котировок
          <select name="resultsQuoteProvider" class="block w-full rounded border px-2 py-1 dark:bg-gray-800">
            <option value="finnhub">finnhub</option><option value="alpha_vantage">alpha_vantage</option>
            <option value="twelve_data">twelve_data</option><option value="polygon">polygon</option><option value="webull">webull</option>
          </select>
        </label>
        <label class="block text-sm">Провайдер загрузки
          <select name="enhancerProvider" class="block w-full rounded border px-2 py-1 dark:bg-gray-800">
            <option value="finnhub">finnhub</option><option value="alpha_vantage">alpha_vantage</option>
            <option value="twelve_data">twelve_data</option><option value="polygon">polygon</option>
          </select>
        </label>
        <label class="block text-sm">Тикеры по умолчанию<input name="defaultMultiTickerSymbols" class="block w-full rounded border px-2 py-1 dark:bg-gray-800" /></label>
        <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enablePostClosePriceActualization" /> актуализация после закрытия</label>
        <button class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Сохранить</button>
        <div id="set-msg" class="text-sm"></div>
      </form>
    `);
  }

  async function render() {
    applyTheme();
    const app = document.getElementById('app');
    const p = state.page;
    if (p === '/login') {
      app.innerHTML = loginPage();
      bindCommon();
      return;
    }
    if (!state.user) {
      app.innerHTML = `<div class="min-h-screen flex items-center justify-center flex-col gap-4"><div class="flex items-center gap-2 text-gray-600">Проверка авторизации…</div></div>`;
      return;
    }
    if (p === '/data' || p === '/') app.innerHTML = await pageData();
    else if (p === '/enhance') app.innerHTML = pageEnhance();
    else if (p === '/stocks') app.innerHTML = pageStocks();
    else if (p === '/ema') app.innerHTML = pageEMA();
    else if (p === '/multi-ticker-options') app.innerHTML = pageOptions();
    else if (p === '/calendar') app.innerHTML = pageCalendar();
    else if (p === '/split') app.innerHTML = pageSplits();
    else if (p === '/watches') app.innerHTML = pageWatches();
    else if (p === '/broker') app.innerHTML = pageBroker();
    else if (p === '/settings') app.innerHTML = pageSettings();
    else app.innerHTML = await pageData();
    bindCommon();
    await afterRender();
  }

  function bindCommon() {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.getAttribute('href')); });
    });
    document.getElementById('theme-btn')?.addEventListener('click', () => { state.dark = !state.dark; render(); });
    document.getElementById('logout-btn')?.addEventListener('click', async () => { try { await API.logout(); } catch {} state.user = false; navigate('/login', true); });
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

  async function afterRender() {
    const p = state.page;
    if (p === '/data') {
      document.getElementById('file-json')?.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const json = JSON.parse(await f.text());
        await API.saveDataset(json);
        state.datasets = await API.datasets();
        render();
      });
      document.getElementById('enhance-link')?.addEventListener('click', () => navigate('/enhance'));
      document.querySelectorAll('[data-load]').forEach((b) => b.addEventListener('click', () => { state.ticker = b.dataset.load; navigate('/stocks'); }));
      document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { await API.deleteDataset(b.dataset.del); state.datasets = await API.datasets(); render(); }));
    }
    if (p === '/enhance') {
      document.getElementById('enhance-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const out = document.getElementById('enhance-out');
        try {
          const r = await API.get(`/api/fetch/${fd.get('provider')}/${fd.get('symbol')}`);
          out.textContent = JSON.stringify(r, null, 2);
        } catch (err) {
          out.textContent = err.message + '\n' + JSON.stringify(err.data, null, 2);
        }
      });
    }
    if (p === '/stocks') {
      document.querySelectorAll('[data-ticker]').forEach((el) => el.addEventListener('change', () => {
        state.selected = [...document.querySelectorAll('[data-ticker]:checked')].map((x) => x.dataset.ticker);
        state.ticker = state.selected[0] || state.ticker;
      }));
      document.getElementById('run-bt')?.addEventListener('click', runStocks);
      document.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => { state.stockTab = b.dataset.stab; render(); }));
      paintStockCharts();
      runNested();
    }
    if (p === '/ema') {
      document.getElementById('ema-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const ds = await API.dataset(fd.get('ticker'));
        const r = await API.calc('ema-zone', {
          data: ds.data,
          ticker: fd.get('ticker'),
          ema: {
            initialCapital: 10000, leverage: 1, emaPeriod: Number(fd.get('period')),
            buyZones: [{ id: 'buy', levelPct: Number(fd.get('buy')), enabled: true }],
            sellZones: [{ id: 'sell', levelPct: Number(fd.get('sell')), enabled: true }],
            signalSource: 'close', emaStartMode: 'full_history', noSellAtLoss: false,
          },
        });
        document.getElementById('ema-out').innerHTML = metricsGrid(r.metrics) + tradesTable(r.trades) + '<div id="ema-eq" class="chart-box mt-4"></div>';
        Charts.line(document.getElementById('ema-eq'), r.equity, state.dark);
      });
    }
    if (p === '/multi-ticker-options') {
      document.querySelectorAll('[data-oticker]').forEach((el) => el.addEventListener('change', () => {
        state.selected = [...document.querySelectorAll('[data-oticker]:checked')].map((x) => x.dataset.oticker);
      }));
      document.getElementById('opt-run')?.addEventListener('click', runOptionsMulti);
    }
    if (p === '/calendar') {
      if (!state.cal.data) {
        state.cal.data = await API.calendar();
        render();
        return;
      }
      document.getElementById('cal-prev')?.addEventListener('click', () => {
        if (state.cal.month === 0) { state.cal.month = 11; state.cal.year--; } else state.cal.month--;
        render();
      });
      document.getElementById('cal-next')?.addEventListener('click', () => {
        if (state.cal.month === 11) { state.cal.month = 0; state.cal.year++; } else state.cal.month++;
        render();
      });
      document.querySelectorAll('[data-cday]').forEach((b) => b.addEventListener('click', () => {
        const form = document.getElementById('cal-edit');
        if (form) form.mmdd.value = b.dataset.cday;
      }));
      document.getElementById('cal-edit')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.patch('/api/trading-calendar/day', { year: String(state.cal.year), mmdd: fd.get('mmdd'), type: fd.get('type'), name: fd.get('name') });
        state.cal.data = await API.calendar();
        render();
      });
    }
    if (p === '/split') {
      const map = await API.splits();
      const el = document.getElementById('spl-list');
      const rows = Object.entries(map || {}).map(([ticker, evs]) => `<div class="mb-3"><div class="font-semibold">${ticker}</div>${(evs || []).map((e) => `<div class="flex justify-between text-sm"><span>${e.date} × ${e.factor}</span><button data-ds="${ticker}" data-dd="${e.date}" class="text-red-600">удалить</button></div>`).join('')}</div>`).join('') || '<p class="text-sm text-gray-500">Нет сплитов</p>';
      if (el) el.innerHTML = rows;
      document.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', async () => {
        await API.del(`/api/splits/${b.dataset.ds}/${b.dataset.dd}`);
        render();
      }));
      document.getElementById('split-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const ticker = fd.get('ticker');
        const existing = (map && map[ticker]) || [];
        existing.push({ date: fd.get('date'), factor: Number(fd.get('factor')) });
        await API.putSplits(ticker, existing);
        render();
      });
    }
    if (p === '/watches') {
      const list = await API.watches();
      document.getElementById('watch-list').innerHTML = (list || []).map((w) => `<div class="flex justify-between border rounded p-2 mb-2 dark:border-gray-800"><span>${w.symbol} · low ${w.lowIBS} / high ${w.highIBS}</span><button data-dw="${w.symbol}" class="text-sm">Удалить</button></div>`).join('') || '<p class="text-sm text-gray-500">Пусто</p>';
      document.querySelectorAll('[data-dw]').forEach((b) => b.addEventListener('click', async () => { await API.deleteWatch(b.dataset.dw); render(); }));
      document.getElementById('watch-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await API.addWatch({ symbol: e.target.symbol.value, lowIBS: 0.1, highIBS: 0.75 });
        render();
      });
    }
    if (p === '/broker') {
      const [bt, tok] = await Promise.all([API.brokerTrades().catch(() => []), API.get('/api/autotrade/webull/token/status').catch((e) => e.data)]);
      const el = document.getElementById('broker-list');
      if (el) el.innerHTML = (bt || []).map((t) => `<div class="flex justify-between border rounded p-2 mb-1 text-sm dark:border-gray-800"><span>${t.symbol} ${t.entryDate || ''} @ ${t.entryPrice ?? '—'}</span><button data-bd="${t.id}" class="text-red-600">удалить</button></div>`).join('') || '<p class="text-sm text-gray-500">Нет сделок</p>';
      document.querySelectorAll('[data-bd]').forEach((b) => b.addEventListener('click', async () => { await API.del('/api/broker-trades/' + b.dataset.bd); render(); }));
      const tokEl = document.getElementById('broker-token');
      if (tokEl) tokEl.textContent = 'Токен Webull: ' + JSON.stringify(tok);
      document.getElementById('broker-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.post('/api/broker-trades', { symbol: fd.get('symbol'), entryDate: fd.get('entryDate'), entryPrice: Number(fd.get('entryPrice')), status: 'open', source: 'manual' });
        render();
      });
    }
    if (p === '/settings') {
      const st = await API.settings();
      const form = document.getElementById('set-form');
      if (form && st) {
        form.watchThresholdPct.value = st.watchThresholdPct ?? 0.3;
        form.resultsQuoteProvider.value = st.resultsQuoteProvider || 'finnhub';
        form.enhancerProvider.value = st.enhancerProvider || 'finnhub';
        form.defaultMultiTickerSymbols.value = st.defaultMultiTickerSymbols || '';
        form.enablePostClosePriceActualization.checked = !!st.enablePostClosePriceActualization;
      }
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        await API.saveSettings({
          watchThresholdPct: Number(fd.get('watchThresholdPct')),
          resultsQuoteProvider: fd.get('resultsQuoteProvider'),
          enhancerProvider: fd.get('enhancerProvider'),
          defaultMultiTickerSymbols: fd.get('defaultMultiTickerSymbols'),
          enablePostClosePriceActualization: form.enablePostClosePriceActualization.checked,
        });
        document.getElementById('set-msg').textContent = 'Сохранено';
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
    const sel = state.selected.length ? state.selected : (state.datasets[0] ? [state.datasets[0].ticker] : []);
    state.selected = sel;
    const loaded = [];
    for (const t of sel) {
      const ds = await API.dataset(t);
      loaded.push({ ticker: t, data: ds.data || [] });
    }
    state.tickersData = loaded;
    state.ticker = sel[0];
    state.bars = loaded[0]?.data || [];
    return loaded;
  }

  async function runStocks() {
    const loaded = await loadSelected();
    state.result = await API.calc('single-position', { tickers: loaded, strategy: defaultStrategy(), leverage: 1 });
    render();
  }

  async function runOptionsMulti() {
    const loaded = await loadSelected();
    const stock = await API.calc('single-position', { tickers: loaded, strategy: defaultStrategy(), leverage: 1 });
    const r = await API.calc('options-multi', { tickers: loaded, trades: stock.trades, config: { strikePct: 10, volAdjPct: 20, capitalPct: 10 } });
    document.getElementById('optm-out').innerHTML = `<p>Сделок: ${r.trades?.length || 0}, итог: ${fmt(r.finalValue)}</p>` + tradesTable(r.trades);
  }

  function paintStockCharts() {
    const r = state.result;
    if (!r) return;
    const dark = state.dark;
    if (state.stockTab === 'price' && document.getElementById('chart-price')) Charts.candles(document.getElementById('chart-price'), state.bars, dark);
    if (state.stockTab === 'tickerCharts' && document.getElementById('ticker-charts')) {
      const host = document.getElementById('ticker-charts');
      host.innerHTML = (state.tickersData || []).map((t) => `<div><div class="text-sm font-semibold mb-1">${t.ticker}</div><div id="tc-${t.ticker}" class="chart-box rounded border dark:border-gray-800"></div></div>`).join('');
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
        el.innerHTML = metricsGrid(r.metrics) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || r.tradesList?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + tradesTable(r.trades || r.tradesList);
      } catch (e) { el.textContent = e.message; }
    };
    if (state.stockTab === 'buyhold') fill('bh-out', 'buy-hold');
    if (state.stockTab === 'buyAtClose') fill('bac-out', 'buy-at-close');
    if (state.stockTab === 'buyAtClose4') fill('bac4-out', 'buy-at-close-4', { leverage: 1 });
    if (state.stockTab === 'noStopLoss') fill('nsl-out', 'no-stop-loss', { noStop: { exitMode: 'ibs-only', requireProfitableExit: false } });
    if (state.stockTab === 'options') fill('opt-out', isSingle() ? 'options' : 'options-multi', { config: { strikePct: 10, volAdjPct: 20, capitalPct: 10 } });
    if (state.stockTab === 'splits') {
      const el = document.getElementById('splits-box');
      if (el) {
        try { el.textContent = JSON.stringify(await API.tickerSplits(state.ticker), null, 2); }
        catch (e) { el.textContent = e.message; }
      }
    }
    if (state.stockTab === 'monthlyContribution') {
      document.getElementById('mc-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const r = await API.calc('single-position', { data: state.bars, ticker: state.ticker, strategy: st, leverage: 1, single: { monthlyAmount: Number(fd.get('amount')), monthlyDayOfMonth: Number(fd.get('day')) } });
        document.getElementById('mc-out').innerHTML = metricsGrid(r.metrics) + tradesTable(r.trades);
      });
    }
  }

  async function bootAuthed() {
    try { const st = await API.status(); state.apiBuildId = st.timestamp || st.buildId; } catch {}
    try { state.datasets = await API.datasets(); } catch { state.datasets = []; }
    if (state.datasets[0] && !state.ticker) state.ticker = state.datasets[0].ticker;
    if (!state.selected.length && state.datasets[0]) state.selected = [state.datasets[0].ticker];
  }

  async function start() {
    applyTheme();
    state.page = location.pathname === '/' ? '/data' : location.pathname;
    if (state.page === '/results') state.page = '/stocks';
    try {
      await API.authCheck();
      state.user = true;
      await bootAuthed();
      if (location.pathname === '/login') navigate('/data', true);
      else render();
    } catch (e) {
      if (e.status === 401) {
        state.user = false;
        navigate('/login', true);
      } else {
        state.user = true;
        await bootAuthed();
        render();
      }
    }
  }
  start();
})();
