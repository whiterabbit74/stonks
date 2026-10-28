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
        <button type="button" id="stale-refresh" class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100" title="Обновить данные" aria-label="Обновить данные">${icon('refresh', 'h-3.5 w-3.5' + spin)}</button>
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
            <button type="button" id="hero-trades-toggle" class="mt-2 flex w-full items-center justify-between rounded-lg bg-gray-100 px-2 py-1.5 text-[11px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
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
      <div class="scroll-cue-shell"><div class="scroll-cue min-w-0 overflow-x-auto"><div class="flex min-w-max items-center gap-1.5 pr-8">${ranges}</div></div></div>
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
      <div>Макс. просадка<div class="font-semibold">${fmtPct(result.maxDrawdown ?? m.maxDrawdown)}</div></div>
      <div>Доля прибыльных<div class="font-semibold">${fmtPct(m.winRate)}</div></div>
      <div>Профит-фактор<div class="font-semibold">${pf}</div></div>
      <div class="col-span-2">Сделок <b>${m.totalTrades ?? (result.trades || []).length}</b></div>
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
    const avgWin = wins.length ? wins.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / losses.length : 0;
    const avgAll = x.trades.length ? x.trades.reduce((s, t) => s + (Number(t.pnlPercent) || 0), 0) / x.trades.length : 0;
    const gp = wins.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const gl = losses.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    return `<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${Number.isFinite(pf) ? fmt(pf) : '∞'}</div><div class="text-xs text-gray-500">Профит-фактор</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmtPct(x.metrics.winRate)}</div><div class="text-xs text-gray-500">Доля прибыльных</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(avgAll, 2)}%</div><div class="text-xs text-gray-500">Средний PnL</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold pos">${fmtUsd(gp)}</div><div class="text-xs text-gray-500">Валовая прибыль</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold neg">${fmtUsd(gl)}</div><div class="text-xs text-gray-500">Валовый убыток</div></div>
    </div>
    <p class="text-sm text-gray-500 mb-3">Прибыльных ${wins.length} · убыточных ${losses.length} · средний убыток ${fmt(avgLoss, 2)}% · средний плюс ${fmt(avgWin, 2)}%</p>
    <div class="text-xs font-medium text-gray-500 mb-1">Распределение PnL%</div>
    <div id="chart-pnl-hist" class="chart-box rounded-lg border dark:border-gray-800"></div>`;
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
    return `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(avg, 1)}</div><div class="text-xs text-gray-500">Средняя, дн.</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(med, 1)}</div><div class="text-xs text-gray-500">Медиана, дн.</div></div>
      <div class="rounded-lg border p-3 text-center"><div class="text-xl font-bold">${fmt(max, 1)}</div><div class="text-xs text-gray-500">Макс., дн.</div></div>
    </div>
    <div class="text-xs font-medium text-gray-500 mb-1">Длительность сделок</div>
    <div id="chart-dur-hist" class="chart-box rounded-lg border dark:border-gray-800 mb-3"></div>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="overflow-auto"><table class="trades"><thead><tr><th>Дней</th><th>Сделок</th><th>%</th></tr></thead><tbody>${dayRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div>
      <div class="overflow-auto"><table class="trades"><thead><tr><th>Причина выхода</th><th>Сделок</th><th>Ср. PnL</th></tr></thead><tbody>${reasonRows}</tbody></table></div>
    </div>`;
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
            <div class="text-sm font-medium break-words ${on ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-gray-100'}">${esc(t.name)}</div>
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
    const initial = initialCapital();
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

  function pageHeader(title, subtitle, actions, ico) {
    return `<div class="mb-6">
      <div class="page-header-layout flex flex-col gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100${ico ? ' flex items-center gap-2' : ''}">${ico ? icon(ico, 'w-6 h-6') : ''}${esc(title)}</h1>
          ${subtitle ? `<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">${esc(subtitle)}</p>` : ''}
        </div>
        ${actions ? `<div class="page-header-actions flex flex-wrap items-center gap-2">${actions}</div>` : ''}
      </div>
      <div class="mt-3 h-px bg-gradient-to-r from-indigo-500/50 via-sky-500/40 to-transparent"></div>
    </div>`;
  }
  function sideItemInner(ico, lab) {
    return `${icon(ico, 'w-5 h-5')}<span class="app-side-lab">${esc(lab)}</span>`;
  }
  function sideNavHTML() {
    return TABS.map((t) => `<a href="${t.to}" data-nav class="app-side-item ${state.page === t.to ? 'app-side-item-on' : ''}" title="${esc(t.label)}">${sideItemInner(t.icon, t.label)}</a>`).join('');
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
    btn.dataset.collapsed = slim ? 'true' : 'false';
    morphBrandIcon(btn, btn.matches(':hover') ? (slim ? 'open' : 'close') : 'brand');
  }
  function analysisTabs(tabs, active, attr, label) {
    return `<div class="scroll-cue-shell border-b border-gray-200 dark:border-gray-700">
      <div class="scroll-cue overflow-x-auto">
        <div class="flex items-center gap-2 flex-nowrap min-w-max px-1" role="tablist"${label ? ` aria-label="${esc(label)}"` : ''}>
        ${tabs.map((t) => `<button ${attr}="${esc(t.id)}" role="tab" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}" class="px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap sm:px-6 ${t.id === active ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}">${esc(t.label)}</button>`).join('')}
        </div>
      </div>
    </div>`;
  }
  function tickerInput(id, value) {
    return `<div>
      <input id="${id}" type="text" value="${esc(value)}" placeholder="AAPL, MSFT, AMZN, MAGS" class="${inputCls()} text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
    </div>`;
  }
  function metricsGrid(m, finalValue, maxDrawdown, baseline) {
    if (!m) return '';
    const fv = finalValue ?? m.finalValue;
    const dd = maxDrawdown ?? m.maxDrawdown;
    const pf = Number.isFinite(m.profitFactor) ? fmt(m.profitFactor) : '∞';
    const bm = baseline?.metrics;
    const vs = (value, format) => bm ? `<div class="text-xs text-gray-500 mt-1">vs ${format(value)} без маржи</div>` : '';
    const card = (span, tone, value, label, compare) => `<div class="${span ? span + ' ' : ''}bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center"><div class="text-2xl font-bold ${tone}">${value}</div><div class="text-sm text-gray-600 dark:text-gray-400">${label}</div>${compare || ''}</div>`;
    const baseValue = baseline?.finalValue ?? bm?.finalValue;
    const baseDD = baseline?.maxDrawdown ?? bm?.maxDrawdown;
    const baseTrades = bm?.totalTrades ?? (baseline?.trades || []).length;
    const compare = (value, format) => bm ? vs(value, format) : '';
    return `<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
      ${card('col-span-2', 'text-green-600', fmtUsd(fv, 0), 'Итоговый баланс', compare(baseValue, (v) => fmtUsd(v, 0)))}
      ${card('col-span-2', 'text-blue-600', fmtPct(m.totalReturn), 'Общая доходность', compare(bm?.totalReturn, fmtPct))}
      ${card('', 'text-orange-600', fmtPct(m.cagr), 'CAGR', compare(bm?.cagr, fmtPct))}
      ${card('', 'text-purple-600', fmtPct(m.winRate), 'Доля прибыльных', compare(bm?.winRate, fmtPct))}
      ${card('', 'text-red-600', fmtPct(dd), 'Макс. просадка', compare(baseDD, fmtPct))}
      ${card('', 'text-indigo-600', m.totalTrades ?? 0, 'Всего сделок', compare(baseTrades, (v) => fmt(v, 0)))}
      ${card('', 'text-teal-600', pf, 'Профит-фактор', compare(bm?.profitFactor, (v) => Number.isFinite(v) ? fmt(v) : '∞'))}
      ${m.contributionCount ? card('col-span-2', 'text-gray-700 dark:text-gray-300', fmtUsd(m.totalContribution, 0), `Пополнения (${m.contributionCount})`) : ''}
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
      const hasEntryProblem = entryIbsNum != null && (Math.abs(entryIbsNum) <= 1.5 ? entryIbsNum : entryIbsNum / 100) > liveLowIBS();
      const hasExitProblem = exitIbsNum != null && (Math.abs(exitIbsNum) <= 1.5 ? exitIbsNum : exitIbsNum / 100) < liveHighIBS();
      const lev = toNum(ctx.leverage);
      const deposit = toNum(ctx.currentCapitalAfterExit);
      const entryIso = t.entryDate || '—';
      const exitIso = t.exitDate || '—';
      const ibsLab = (n) => n == null ? '—' : fmt(Math.abs(n) <= 1.5 ? n * 100 : n, 1) + '%';
      return `<tr>
      <td>${(page - 1) * PAGE_SIZE + i + 1}</td>
      ${showTicker ? `<td class="font-mono">${esc(tradeTicker(t) || '—')}</td>` : ''}
      <td title="${esc(entryIso)} – ${esc(exitIso)}" class="${(hasEntryProblem || hasExitProblem) ? 'bg-orange-50 dark:bg-orange-950/20' : ''}">
        ${esc(fmtTradingDate(t.entryDate))} – ${esc(fmtTradingDate(t.exitDate))}
      </td>
      <td>${fmtUsd(t.entryPrice, 2)} – ${fmtUsd(t.exitPrice, 2)}</td>
      <td>${esc(ibsLab(entryIbsNum))} – ${esc(ibsLab(exitIbsNum))}</td>
      <td>${fmt(t.quantity, 0)}</td>
      <td>${invested == null ? '—' : fmtUsd(invested)}${lev != null && lev > 1 ? `<div class="text-xs text-gray-500">${esc(lev)}:1</div>` : ''}</td>
      <td class="${pnlClass(t.pnl)}">${fmtUsd(t.pnl)}</td>
      <td class="${pnlClass(t.pnlPercent)}">${t.pnlPercent == null ? '—' : fmt(t.pnlPercent, 2) + '%'}</td>
      ${showDeposit ? `<td>${deposit == null ? '—' : fmtUsd(deposit)}</td>` : ''}
      <td>${esc(t.duration ?? '')}</td><td>${esc(reason)}</td>
    </tr>`;
    }).join('');
    const cols = 10 + (showTicker ? 1 : 0) + (showDeposit ? 1 : 0);
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
      <div class="table-wrap rounded-lg border dark:border-gray-800"><table class="trades"><thead><tr><th>#</th>${showTicker ? '<th>Тикер</th>' : ''}<th>Период</th><th>Цена покупки / продажи</th><th>IBS вход / выход</th><th>Кол-во</th><th>Вложено</th><th>PnL, $</th><th>PnL, %</th>${showDeposit ? '<th>Депозит, $</th>' : ''}<th>Дней</th><th>Причина</th></tr></thead><tbody>${rows || `<tr><td colspan="${cols}">Нет сделок</td></tr>`}</tbody></table></div>
      ${pager}
    </div>`;
  }
  // Что этот брокер сделал с позицией: сколько держит и по какой цене вошёл.
  // Пусто — брокер в этой позиции не участвовал, и это нормальное состояние,
  // а не расхождение.
  function legSummary(leg) {
    if (!leg || (!(leg.qty > 0) && !leg.entryOrderId)) return '—';
    const qty = leg.qty > 0 ? fmt(leg.qty, 0) + ' шт' : 'вышел';
    if (leg.entryPrice == null) return qty;
    return qty + ' @ ' + fmtUsd(leg.entryPrice, 2);
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
        <td>${esc(t.status === 'open' ? 'открыта' : 'закрыта')}${t.isTest ? ' · тест' : ''}</td>
        <td title="${esc(t.entryDate || '')} – ${esc(t.exitDate || '')}">${esc(fmtTradingDate(t.entryDate))} – ${esc(fmtTradingDate(t.exitDate))}</td>
        <td>${t.entryPrice == null ? '—' : fmtUsd(t.entryPrice, 2)} – ${t.exitPrice == null ? '—' : fmtUsd(t.exitPrice, 2)}</td>
        <td>${esc(ibs.split(' → ')[0] || '—')} – ${esc(ibs.split(' → ')[1] || '—')}</td>
        <td class="${pnlClass(pct)}">${pct == null ? '—' : fmtSignedPct(pct, 2)} ${pnl == null ? '' : '(' + fmtSignedUsd(pnl) + ')'}</td>
        <td class="text-xs">${esc(legSummary(t.webull))}</td>
        <td class="text-xs">${esc(legSummary(t.robinhood))}</td>
        <td>${t.status === 'open' && t.id ? actionIcon('x', 'Закрыть позицию', `data-close-mon="${esc(t.id)}" data-close-sym="${esc(t.symbol || '')}"`, 'action-icon-danger') : ''}${t.id ? actionIcon('edit', 'Изменить позицию', `data-edit-mon="${esc(t.id)}"`, 'action-icon-edit') : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="flex flex-wrap gap-2 mb-2 text-sm">
      ${[['all', 'Все'], ['open', 'Открытые'], ['closed', 'Закрытые'], ['win', 'Прибыль'], ['loss', 'Убыток']].map(([id, lab]) => `<button type="button" data-wfilter="${id}" class="px-3 py-1.5 rounded-lg text-xs font-medium ${filter === id ? 'chip-on' : 'chip-off'}">${lab}</button>`).join('')}
      <button type="button" id="watch-hidden-toggle" class="px-3 py-1.5 rounded-lg text-xs font-medium chip-off">${includeHidden ? 'Скрыть скрытые' : 'Показать скрытые'}</button>
      <button type="button" id="watch-export-json" class="btn-secondary min-h-0 py-1.5 px-3 text-xs">JSON</button>
      <button type="button" id="watch-export-csv" class="btn-secondary min-h-0 py-1.5 px-3 text-xs">CSV</button>
      <span class="text-xs text-gray-500 self-center">${list.length} позиций</span>
    </div>
    <div class="table-wrap rounded-lg border dark:border-gray-800"><table class="trades"><thead><tr><th>Тикер</th><th>Статус</th><th>Период</th><th>Цена покупки / продажи</th><th>IBS вход / выход</th><th>PnL</th><th>Webull</th><th>Robinhood</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="text-center text-gray-500">Нет позиций</td></tr>'}</tbody></table></div>`;
  }
  function overlay() {
    let html = '';
    if (state.confirm) {
      html += `<div class="modal-backdrop" id="confirm-box" role="dialog" aria-modal="true">
        <div class="modal-card">
        <h3 class="text-lg font-semibold mb-2">${esc(state.confirm.title || 'Подтверждение')}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${esc(state.confirm.message || '')}</p>
        <div class="flex justify-end gap-2"><button id="confirm-no" class="btn-secondary">Отмена</button><button id="confirm-yes" class="btn-danger">${esc(state.confirm.okLabel || 'Удалить')}</button></div>
      </div></div>`;
    }
    if (state.modal) {
      let m = state.modal;
      if (m.indexOf('role="dialog"') < 0) {
        m = m.replace('class="modal-backdrop"', 'class="modal-backdrop" role="dialog" aria-modal="true"');
      }
      html += m;
    }
    if (state.toast) html += `<div class="toast">${esc(state.toast)}</div>`;
    return html;
  }
  const OVERLAY_FOCUSABLE = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  let overlayDialogKey = '';
  function currentOverlayDialogKey() {
    if (state.confirm) return 'confirm';
    if (state.modal) return 'modal';
    return '';
  }
  function paintOverlay() {
    const ov = document.getElementById('overlay-root');
    if (!ov) return;
    const key = currentOverlayDialogKey();
    const opened = key && key !== overlayDialogKey;
    ov.innerHTML = overlay();
    overlayDialogKey = key;
    if (!opened) return;
    const dlg = ov.querySelector('[role="dialog"]');
    const first = dlg && dlg.querySelector(OVERLAY_FOCUSABLE);
    if (first && typeof first.focus === 'function') first.focus();
  }
  function trapOverlayTab(e, dlg) {
    const nodes = Array.from(dlg.querySelectorAll(OVERLAY_FOCUSABLE)).filter((el) => !el.disabled);
    if (!nodes.length) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !dlg.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last || !dlg.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
  function closeOverlayDialog() {
    if (state.modal) { closeModal(); return true; }
    if (state.confirm) { state.confirm = null; paintOverlay(); return true; }
    return false;
  }
  let toastTimer = null;
  async function withBusy(el, fn) {
    if (!el) { await fn(); return; }
    if (el.disabled) return;
    el.disabled = true;
    try { await fn(); } finally { el.disabled = false; }
  }
  function toast(msg) {
    state.toast = msg;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    const host = document.getElementById('overlay-root');
    if (host) {
      let el = host.querySelector('.toast');
      if (el) el.textContent = msg;
      else {
        el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.textContent = msg;
        host.appendChild(el);
      }
    }
    toastTimer = setTimeout(() => {
      toastTimer = null;
      if (state.toast !== msg) return;
      state.toast = null;
      const t = document.querySelector('#overlay-root .toast');
      if (t) t.remove();
    }, 2500);
  }

  function navigate(path, replace) {
    if (path === '/results') path = '/stocks';
    if (replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
    state.page = path.split('?')[0];
    state.mobileOpen = false;
    applyURLTickers();
    state.menuTicker = null;
    state.heroSettingsOpen = false;
    state.quoteOpen = false;
    renderPage();
  }
  window.addEventListener('popstate', () => {
    state.page = location.pathname === '/' ? '/data' : location.pathname;
    applyURLTickers();
    renderPage();
  });

  function statusBadgeHTML() {
    const st = state.serverStatus;
    if (st === 'offline') {
      return `<span id="footer-status" title="Офлайн" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-200"><span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>Офлайн</span>`;
    }
    if (st === 'checking') {
      return `<span id="footer-status" title="Проверка" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"><span class="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>Проверка</span>`;
    }
      return `<span id="footer-status" title="Онлайн" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-200"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>Онлайн</span>`;
  }
  function footerHTML(apiVer) {
    const year = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date());
    return `<footer class="bg-white border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 mt-[50px]">
      <div class="max-w-7xl mx-auto px-6 py-8">
        <div class="footer-grid grid grid-cols-1 lg:grid-cols-2 gap-8">
          <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Анализ и тестирование торговых стратегий на исторических данных. Специализация на стратегиях mean reversion и техническом анализе.</p>
          <div class="space-y-2">
            <h4 class="text-sm font-semibold uppercase tracking-wider">Система</h4>
            <div class="flex items-center justify-between text-sm gap-4"><span class="text-gray-600 dark:text-gray-400">Версия API:</span><span id="api-ver" class="font-mono text-xs bg-gray-100 px-2 py-1 rounded dark:bg-gray-800">${esc(apiVer || 'dev')}</span></div>
            <div class="flex items-center justify-between text-sm gap-4"><span class="text-gray-600 dark:text-gray-400">Статус:</span>${statusBadgeHTML()}</div>
          </div>
        </div>
        <div class="border-t border-gray-200 dark:border-gray-800 mt-8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="text-sm text-gray-600 dark:text-gray-400">© ${year} Trading strategies. Все права защищены.</div>
          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span>Создано с ❤️ для трейдеров</span>
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
      <div class="app-frame ${slim ? 'app-frame-slim' : ''} min-h-screen bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
        <aside class="app-side" aria-label="Основная навигация">
          <button type="button" id="app-side-toggle" class="app-side-brand app-side-brand-toggle" title="${toggleTitle}" aria-label="${toggleTitle}" aria-expanded="${slim ? 'false' : 'true'}">
            <span class="app-side-brand-icon" aria-hidden="true">${brandIcon(slim)}</span>
            <span class="app-side-brand-label">Trading strategies</span>
          </button>
          <nav class="app-side-nav desktop-nav">${sideNavHTML()}</nav>
          <div class="app-side-tools">
            <button type="button" id="theme-btn" class="app-side-item" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${sideItemInner(themeIcon(), 'Тема')}</button>
            <a href="/settings" data-nav id="settings-btn" class="app-side-item ${state.page === '/settings' ? 'app-side-item-on' : ''}" title="Настройки" aria-label="Настройки">${sideItemInner('settings', 'Настройки')}</a>
          </div>
        </aside>
        <div class="app-main">
          <header class="app-top border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
            <div class="px-4 py-3 flex items-center justify-between gap-3">
              <a href="/data" data-nav class="flex min-w-0 items-center gap-3 hover:opacity-80">
                ${logo('sm')}
                <span class="truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">Trading strategies</span>
              </a>
              <div class="flex items-center gap-2">
                <button type="button" id="theme-btn-top" class="icon-btn icon-btn-lg icon-btn-glass" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${icon(themeIcon())}</button>
                <button id="menu-btn" class="icon-btn icon-btn-lg icon-btn-glass" title="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-label="${state.mobileOpen ? 'Закрыть меню' : 'Открыть меню'}" aria-expanded="${state.mobileOpen}">${icon(state.mobileOpen ? 'x' : 'menu')}</button>
              </div>
            </div>
            <div id="mobile-drawer" class="${state.mobileOpen ? '' : 'hidden'} border-t border-gray-200 dark:border-gray-700 bg-white/95 backdrop-blur-sm dark:bg-slate-900/95"></div>
          </header>
          <main id="main-content" class="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-6 pb-32 md:pb-8 safe-area-pb">
            <div id="page-root"></div>
          </main>
          <nav class="bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 z-40 grid grid-cols-3 items-center h-16" role="navigation" aria-label="Основная навигация">${bottom}</nav>
          ${footerHTML(state.apiBuildId)}
        </div>
      </div>
      <div id="overlay-root">${overlay()}</div>`;
  }
  function mobileDrawerHTML() {
    return `<div class="px-3 py-3 space-y-0.5">${MOBILE_MENU.map((t) => {
      const on = state.page === t.to;
      return `<a href="${t.to}" data-nav class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${on ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200'}">${icon(t.icon, 'w-5 h-5 ' + (on ? 'text-white' : 'text-gray-400'))}<span>${t.label}</span></a>`;
    }).join('')}</div>`;
  }

  function loginPage() {
    return `
      <div class="min-h-screen bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100 flex flex-col">
        <header class="border-b bg-white/60 backdrop-blur dark:bg-slate-900/60 dark:border-slate-800">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">${logo('sm')}<span class="hidden truncate text-lg font-semibold sm:inline">Trading strategies</span></div>
            <button id="theme-btn" class="icon-btn icon-btn-lg icon-btn-glass" title="Тема: ${themeLabel()}" aria-label="Тема: ${themeLabel()}">${icon(themeIcon())}</button>
          </div>
        </header>
        <main class="flex-1 flex items-center justify-center px-4 pb-24">
          <div class="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg border dark:bg-gray-900 dark:border-gray-800">
            <h2 class="text-lg font-semibold mb-3">Вход</h2>
            <div id="login-error" class="mb-2 text-sm text-red-600 hidden"></div>
            <form id="login-form" class="space-y-3">
              <div><label class="block text-sm mb-1" for="login-user">Эл. почта</label><input id="login-user" name="username" type="email" autocomplete="email" class="field w-full" placeholder="ivan@example.com" autofocus /></div>
              <div><label class="block text-sm mb-1" for="login-pass">Пароль</label><input id="login-pass" name="password" type="password" autocomplete="current-password" class="field w-full" placeholder="••••••••" /></div>
              <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="remember" /> Запомнить меня</label>
              <div class="flex justify-end"><button type="submit" class="btn-primary">Войти</button></div>
            </form>
          </div>
        </main>
        ${footerHTML('dev')}
      </div>`;
  }

