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
    { id: 'price', label: 'Цены' },
    { id: 'equity', label: 'Капитал' },
    { id: 'exposure', label: 'Экспозиция' },
    { id: 'drawdown', label: 'Просадка' },
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

  const state = {
    dark: localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches),
    user: false,
    apiBuildId: null,
    page: '/',
    datasets: [],
    result: null,
    ticker: 'GOOGL',
    stockTab: 'price',
    bars: [],
    error: null,
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

  function pageStocks() {
    const tabs = STOCK_TABS.map((t) => `<button data-stab="${t.id}" class="tab-btn px-3 py-1 rounded text-sm border ${state.stockTab === t.id ? 'active' : 'bg-white dark:bg-gray-900 dark:border-gray-800'}">${t.label}</button>`).join('');
    const r = state.result;
    let body = '<p class="text-sm text-gray-500">Запустите бэктест.</p>';
    if (r) {
      if (state.stockTab === 'price') body = `<div id="chart-price" class="chart-box-lg rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'equity') body = `${metricsGrid(r.metrics)}<div id="chart-eq" class="chart-box mt-4 rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'exposure') body = `<div id="chart-exp" class="chart-box rounded border dark:border-gray-800"></div><p class="text-sm text-gray-500 mt-2">Экспозиция считается на сервере вместе с капиталом.</p>`;
      else if (state.stockTab === 'drawdown') body = `<div id="chart-dd" class="chart-box rounded border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'trades') body = tradesTable(r.trades);
      else if (state.stockTab === 'profit') body = `<p class="mb-2">Profit factor: <b>${fmt(r.metrics?.profitFactor)}</b></p>` + tradesTable(r.trades);
      else if (state.stockTab === 'duration') {
        const avg = r.trades?.length ? r.trades.reduce((s, t) => s + (t.duration || 0), 0) / r.trades.length : 0;
        body = `<p>Средняя длительность: <b>${fmt(avg, 1)}</b> дн.</p>` + tradesTable(r.trades);
      } else if (state.stockTab === 'monthlyContribution') body = `<form id="mc-form" class="flex gap-2 mb-3"><input name="amount" type="number" value="500" class="rounded border px-2 py-1 w-28 dark:bg-gray-800" /><input name="day" type="number" value="1" class="rounded border px-2 py-1 w-20 dark:bg-gray-800" /><button class="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Посчитать</button></form><div id="mc-out"></div>`;
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm">Загрузка сплитов…</div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">Считаем Buy & Hold…</div>`;
      else if (state.stockTab === 'buyAtClose') body = `<div id="bac-out">Buy at close (вход по nextOpen)…</div>`;
      else if (state.stockTab === 'buyAtClose4') body = `<div id="bac4-out">Buy at close 4…</div>`;
      else if (state.stockTab === 'noStopLoss') body = `<div id="nsl-out">Без стоп-лосса…</div>`;
      else if (state.stockTab === 'options') body = `<div id="opt-out">Опционы (Black–Scholes на сервере)…</div>`;
    }
    return layout(`
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div><label class="block text-sm mb-1">Тикер</label>
          <select id="ticker-sel" class="rounded border px-3 py-2 dark:bg-gray-800 dark:border-gray-700">${state.datasets.map((d) => `<option ${d.ticker === state.ticker ? 'selected' : ''}>${d.ticker}</option>`).join('')}</select>
        </div>
        <button id="run-bt" class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Запустить IBS бэктест</button>
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
    return layout(`
      <h1 class="text-xl font-semibold mb-4">Опционы</h1>
      <p class="text-sm text-gray-600 mb-3">Сначала IBS-сделки, затем опционный бэктест на тех же входах. Формула Black–Scholes с коэффициентами Абрамовица–Стегана — на сервере.</p>
      <form id="opt-form" class="flex flex-wrap gap-3 mb-4">
        <select name="ticker" class="rounded border px-2 py-1 dark:bg-gray-800">${state.datasets.map((d) => `<option>${d.ticker}</option>`).join('')}</select>
        <button class="px-3 py-2 rounded bg-indigo-600 text-white text-sm">Посчитать</button>
      </form>
      <div id="optm-out"></div>
    `);
  }

  function pageCalendar() {
    return layout(`<h1 class="text-xl font-semibold mb-4">Календарь</h1><pre id="cal-out" class="text-xs bg-white dark:bg-gray-900 border rounded p-3 overflow-auto dark:border-gray-800"></pre>`);
  }
  function pageSplits() {
    return layout(`<h1 class="text-xl font-semibold mb-4">Сплиты</h1><pre id="spl-out" class="text-xs bg-white dark:bg-gray-900 border rounded p-3 overflow-auto dark:border-gray-800"></pre>`);
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
    return layout(`<h1 class="text-xl font-semibold mb-4">Брокер</h1><p class="text-sm text-gray-600 mb-3">Сделки брокера и статус Webull. Живые ордера в локальной Go-версии не отправляются.</p><pre id="broker-out" class="text-xs bg-white dark:bg-gray-900 border rounded p-3 dark:border-gray-800"></pre>`);
  }
  function pageSettings() {
    return layout(`<h1 class="text-xl font-semibold mb-4">Настройки</h1><pre id="set-out" class="text-xs bg-white dark:bg-gray-900 border rounded p-3 dark:border-gray-800"></pre>`);
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
      document.getElementById('ticker-sel')?.addEventListener('change', (e) => { state.ticker = e.target.value; });
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
      document.getElementById('opt-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const t = e.target.ticker.value;
        const ds = await API.dataset(t);
        const clean = await API.calc('clean-backtest', { data: ds.data, strategy: defaultStrategy() });
        const r = await API.calc('options', { data: ds.data, trades: clean.trades, config: { strikePct: 10, volAdjPct: 20, capitalPct: 10 } });
        document.getElementById('optm-out').innerHTML = `<p>Сделок: ${r.trades?.length || 0}, итог: ${fmt(r.finalValue)}</p>` + tradesTable(r.trades);
      });
    }
    if (p === '/calendar') {
      const c = await API.calendar();
      document.getElementById('cal-out').textContent = JSON.stringify(c, null, 2);
    }
    if (p === '/split') {
      const c = await API.splits();
      document.getElementById('spl-out').textContent = JSON.stringify(c, null, 2);
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
      const [bt, st] = await Promise.all([API.brokerTrades().catch(() => []), API.get('/api/autotrade/webull/account').catch((e) => e.data)]);
      document.getElementById('broker-out').textContent = JSON.stringify({ brokerTrades: bt, account: st }, null, 2);
    }
    if (p === '/settings') {
      const st = await API.settings();
      document.getElementById('set-out').textContent = JSON.stringify(st, null, 2);
    }
  }

  function defaultStrategy() {
    return {
      id: 'ibs-mean-reversion', type: 'ibs-mean-reversion', name: 'IBS',
      parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 },
      riskManagement: { initialCapital: 10000, capitalUsage: 100, commission: { type: 'percentage', percentage: 0 }, slippage: 0, maxHoldDays: 30 },
    };
  }

  async function runStocks() {
    const ds = await API.dataset(state.ticker);
    state.bars = ds.data || [];
    state.result = await API.calc('clean-backtest', { data: state.bars, strategy: defaultStrategy() });
    render();
  }

  function paintStockCharts() {
    const r = state.result;
    if (!r) return;
    const dark = state.dark;
    if (state.stockTab === 'price' && document.getElementById('chart-price')) Charts.candles(document.getElementById('chart-price'), state.bars, dark);
    if (state.stockTab === 'equity' && document.getElementById('chart-eq')) Charts.line(document.getElementById('chart-eq'), r.equity, dark);
    if (state.stockTab === 'drawdown' && document.getElementById('chart-dd')) {
      Charts.line(document.getElementById('chart-dd'), (r.equity || []).map((p) => ({ date: p.date, value: p.drawdown })), dark, '#dc2626');
    }
    if (state.stockTab === 'exposure' && document.getElementById('chart-exp') && r.exposure) {
      Charts.line(document.getElementById('chart-exp'), r.exposure.map((p) => ({ date: p.date, value: p.exposurePct })), dark, '#0ea5e9');
    }
  }

  async function runNested() {
    if (!state.result || !state.bars?.length) return;
    const st = defaultStrategy();
    const fill = async (id, name, extra) => {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        const r = await API.calc(name, { data: state.bars, strategy: st, trades: state.result.trades, ticker: state.ticker, ...extra });
        el.innerHTML = metricsGrid(r.metrics) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || r.tradesList?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + tradesTable(r.trades || r.tradesList);
      } catch (e) { el.textContent = e.message; }
    };
    if (state.stockTab === 'buyhold') fill('bh-out', 'buy-hold');
    if (state.stockTab === 'buyAtClose') fill('bac-out', 'buy-at-close');
    if (state.stockTab === 'buyAtClose4') fill('bac4-out', 'buy-at-close-4', { leverage: 1 });
    if (state.stockTab === 'noStopLoss') fill('nsl-out', 'no-stop-loss', { noStop: { exitMode: 'ibs-only', requireProfitableExit: false } });
    if (state.stockTab === 'options') fill('opt-out', 'options', { config: { strikePct: 10, volAdjPct: 20, capitalPct: 10 } });
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
