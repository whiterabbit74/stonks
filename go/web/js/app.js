  function defaultStrategy() {
    return {
      id: 'ibs-mean-reversion', type: 'ibs-mean-reversion', name: 'IBS',
      parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 },
      riskManagement: {
        initialCapital: initialCapital(), capitalUsage: 100, slippage: 0, maxHoldDays: 30,
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

  async function runEma() {
    const f = state.emaForm;
    try {
      const names = parseTickers(state.emaTickers);
      const tp = Number(String(f.takeProfit || '').replace(',', '.'));
      const lev = Number(f.leverage || 200) / 100;
      const ema = {
        initialCapital: initialCapital(),
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
      const mc = Number(String(state.monthlyContribution).replace(',', '.'));
      if (Number.isFinite(mc) && mc > 0) single.monthlyAmount = mc;
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
      const lev = Number(fd.get('leverage') || 200) / 100;
      const [stock] = await Promise.all([
        API.calc('single-position', { tickers: calcTickerRefs(names), strategy: defaultStrategy(), leverage: lev, includeBaseline: lev > 1, single: { allowSameDayReentry: true } }),
        loadSelected(),
      ]);
      const optionPayload = {
        tickers: calcTickerRefs(names), trades: stock.trades,
        config: {
          // Тот же капитал, что у прогона акций: без него сервер брал 10000 (AUD-156).
          initialCapital: initialCapital(),
          strikePct: Number(fd.get('strike') || 10),
          volAdjPct: Number(fd.get('vol') || 20),
          capitalPct: Number(fd.get('cap') || 10),
          expirationWeeks: Number(fd.get('expiration') || 4),
          maxHoldingDays: Number(fd.get('maxHold') || 30),
        },
      };
      const r = await API.calc('options-multi', optionPayload);
      if (lev > 1 && stock.baseline && stock.baseline.trades) {
        r.baseline = await API.calc('options-multi', { ...optionPayload, trades: stock.baseline.trades });
      }
      state.optResult = resultOf(r);
      state.optBaseline = lev > 1 ? resultOf(r && r.baseline) : null;
      if (!state.optResult.metrics || !Object.keys(state.optResult.metrics).length) {
        try {
          const m = await API.calc('metrics', { trades: state.optResult.trades, equity: state.optResult.equity, initialCapital: initialCapital() });
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
    const opts = {
      dark: isDark(),
      kind: hp().kind,
      range: hp().range,
      timeframe: state.heroTf,
      trades: tradesForTicker(t, result),
      showTrades: hp().showTrades,
      currentPrice: Charts.livePrice(q && q.current),
      todayQuote: q,
      isTrading: isMarketOpen(),
      todayISO: nyseParts().iso,
    };
    const bars = barsForTicker(t);
    if (typeof Charts.setHeroData === 'function' && Charts.setHeroData(el, bars, opts)) return;
    Charts.destroy();
    Charts.hero(el, bars, opts);
  }
  async function loadQuote(ticker) {
    if (!ticker) return;
    const want = ticker;
    const seq = (state.quoteSeq = (state.quoteSeq || 0) + 1);
    state.quoteLoading = true;
    const iconEl = document.querySelector('#hero-refresh svg');
    if (iconEl) iconEl.classList.add('animate-spin');
    try {
      const raw = await API.quote(ticker, state.settings.resultsQuoteProvider || providerId() || 'finnhub');
      if (selectedHeroTicker() !== want || seq !== state.quoteSeq) return;
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
      root.querySelectorAll('[data-hero-kind]').forEach((x) => {
        x.className = 'hero-kind ' + (x.dataset.heroKind === hp().kind ? 'hero-kind-on' : 'hero-kind-off');
      });
      paintCurrentHero();
    }));
    document.getElementById('hero-trades-toggle')?.addEventListener('click', () => {
      hp().showTrades = !hp().showTrades;
      persistHero();
      const lab = document.querySelector('#hero-trades-toggle span:last-child');
      if (lab) {
        lab.textContent = hp().showTrades ? 'Вкл' : 'Выкл';
        lab.className = hp().showTrades ? 'text-green-600 dark:text-green-300' : 'text-gray-500';
      }
      paintCurrentHero();
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
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (state.priceChartUi.tickerOpen && !(t && t.closest && t.closest('[data-pc-ticker-menu], [data-pc-ticker-toggle]'))) {
        state.priceChartUi.tickerOpen = false;
        document.querySelector('[data-pc-ticker-menu]')?.classList.add('hidden');
      }
      if (state.priceChartUi.indOpen && !(t && t.closest && t.closest('.pc-ind-wrap'))) {
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
      paintPriceChart(chartId, { preserveRange: false });
    }));
    shell.querySelector('.pc-ind-wrap')?.addEventListener('click', (e) => e.stopPropagation());
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
      const ticker = selectedHeroTicker() || 'chart-data';
      const bars = barsForTicker(ticker);
      if (!bars || !bars.length) return;
      const stamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
      Charts.downloadCsv(ticker + '-' + stamp + '.csv', Charts.csvFromBars(bars));
    });
  }
  function paintPriceChart(chartId, opts) {
    opts = opts || {};
    const el = document.getElementById(chartId);
    if (!el) return;
    const p = state.priceChart || {};
    const t = selectedHeroTicker();
    const result = state.page === '/ema' ? resultOf(state.emaResult) : (state.page === '/multi-ticker-options' ? resultOf(state.optResult) : resultOf(state.result));
    const emaForm = state.page === '/ema' ? (state.emaRunParams || state.emaForm) : null;
    let vis = null;
    if (opts.preserveRange !== false) {
      try { vis = Charts.live[0] && Charts.live[0].timeScale().getVisibleLogicalRange(); } catch (_) {}
    }
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
    try { if (vis && Charts.live[0]) Charts.live[0].timeScale().setVisibleLogicalRange(vis); } catch (_) {}
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
          <div id="tc-${esc(t.ticker)}" class="chart-box rounded-lg border dark:border-gray-800"></div>
          <div class="ticker-mini-stats mt-1"><div>Сделок ${tt.length}</div><div>Прибыльных ${tt.length ? fmt((wins / tt.length) * 100, 0) : '—'}%</div><div>PnL ${fmtUsd(pnl)}</div><div>Ср. дни ${fmt(avgDur, 1)}</div></div>
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
      if (stats) stats.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm"><div class="rounded-lg border p-2">Макс. дневная просадка<div class="font-semibold">${fmt(Math.max.apply(null, pts.map((p) => p.value || 0).concat([0])), 2)}%</div></div><div class="rounded-lg border p-2">Точек с просадкой<div class="font-semibold">${withDd.length}/${pts.length}</div></div><div class="rounded-lg border p-2">Частота<div class="font-semibold">${pts.length ? fmt((withDd.length / pts.length) * 100, 1) : 0}%</div></div></div>`;
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
            <div class="bg-red-50 px-3 py-2 rounded-lg border border-red-200 text-red-700 dark:bg-red-950/30">Средняя просадка в день открытия: ${avg.toFixed(2)}%</div>
            <div class="bg-gray-50 px-3 py-2 rounded-lg border dark:bg-gray-800">Максимальная просадка: ${max.toFixed(2)}%</div>
          </div><div id="chart-odd" class="chart-box rounded-lg border dark:border-gray-800"></div>`;
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
      host.innerHTML = (state.tickersData || []).map((t) => `<div><div class="text-sm font-semibold mb-1">${esc(t.ticker)}</div><div id="otc-${esc(t.ticker)}" class="chart-box rounded-lg border dark:border-gray-800"></div></div>`).join('');
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
        const events = arr.map((e) => `<li class="split-event"><time datetime="${esc(e.date || '')}">${esc(fmtTradingDate(e.date))}</time><span class="split-event-factor">× ${esc(e.factor)}</span></li>`).join('');
        cards.push(`<article class="split-record"><header class="split-record-header"><div><h3 class="font-mono font-semibold">${esc(sym)}</h3><p class="text-xs text-gray-500">${arr.length ? `Найдено ${arr.length} событий${last ? ' · последний ' + esc(fmtTradingDate(last.date)) : ''}` : 'Сплитов нет'}</p></div><a class="text-xs text-indigo-600 hover:underline" href="https://seekingalpha.com/symbol/${esc(sym)}/splits" target="_blank" rel="noopener">Источник</a></header>${events ? `<ul class="split-events">${events}</ul>` : '<p class="split-empty-state">Нет данных о сплитах</p>'}</article>`);
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
          const m = await API.calc('metrics', { trades: r.trades, equity: r.equity, initialCapital: initialCapital() });
          r.metrics = m;
          r.maxDrawdown = m.maxDrawdown ?? r.maxDrawdown;
        } catch (_) {}
      }
      const chartId = id + '-eq';
      el.innerHTML = metricsGrid(r.metrics, r.finalValue, r.maxDrawdown) + `<p class="text-sm my-2">Сделок: ${r.trades?.length || 0}${r.finalValue != null ? ', итог ' + fmt(r.finalValue) : ''}</p>` + `<div id="${chartId}" class="chart-box rounded-lg border dark:border-gray-800 my-3"></div>` + tradesTable(r.trades, { page: 1 });
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
            const host = document.getElementById('chart-bh');
            if (!host) return;
            Charts.destroyIn(host);
            Charts.line(host, scaled.equity, isDark());
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
    if (state.stockTab === 'splits') {
      const el = document.getElementById('splits-box');
      if (el) await paintSplitsForTickers(el, (state.tickersData || []).map((t) => t.ticker));
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
    applyURLTickers();
    if (state.datasets[0] && !state.ticker) state.ticker = state.datasets[0].ticker;
  }

  async function start() {
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
        rememberReturnPath(path + location.search);
        state.user = false;
        state.page = '/login';
        document.getElementById('app').innerHTML = loginPage();
        bindLogin();
      } else {
        state.user = false;
        state.authUnknown = true;
        document.getElementById('app').innerHTML = `<div class="p-8 max-w-lg mx-auto text-center space-y-3">
          <h1 class="text-xl font-semibold">Сервис недоступен</h1>
          <p class="text-sm text-gray-500">Не удалось подтвердить вход. Обновите страницу.</p>
          <button type="button" class="btn-primary min-h-0 py-2" onclick="location.reload()">Повторить</button>
        </div>`;
      }
    }
  }
  start();
