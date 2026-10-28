  function pageHTML() {
    const p = state.page;
    if (p === '/enhance') return pageEnhance();
    if (p === '/stocks') return pageStocks();
    if (p === '/ema') return pageEMA();
    if (p === '/multi-ticker-options') return pageOptions();
    if (p === '/calendar') return pageCalendar();
    if (p === '/split') return pageSplits();
    if (p === '/watches') return pageWatches();
    if (p === '/broker' || p === '/webull' || p === '/robinhood') return pageBroker();
    if (p === '/settings') return pageSettings();
    return pageData();
  }

  let shellBound = false;
  function bindShellOnce() {
    if (shellBound) return;
    shellBound = true;
    window.addEventListener('resize', updateScrollCues);
    const app = document.getElementById('app');
    const morphTarget = (btn) => btn.dataset.collapsed === 'true' ? 'open' : 'close';
    app.addEventListener('pointerover', (e) => {
      const iconTarget = e.target.closest('.app-side-brand-icon');
      const btn = iconTarget?.closest('#app-side-toggle');
      if (btn && !iconTarget.contains(e.relatedTarget)) morphBrandIcon(btn, morphTarget(btn));
    });
    app.addEventListener('pointerout', (e) => {
      const iconTarget = e.target.closest('.app-side-brand-icon');
      const btn = iconTarget?.closest('#app-side-toggle');
      if (btn && !iconTarget.contains(e.relatedTarget) && !btn.matches(':focus-visible')) morphBrandIcon(btn, 'brand');
    });
    app.addEventListener('focusin', (e) => {
      const btn = e.target.closest('#app-side-toggle');
      if (btn) morphBrandIcon(btn, morphTarget(btn));
    });
    app.addEventListener('focusout', (e) => {
      const btn = e.target.closest('#app-side-toggle');
      if (btn && !btn.matches(':hover')) morphBrandIcon(btn, 'brand');
    });
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
      if (e.target.closest('#logout-btn')) {
        if (!window.confirm('Выйти из аккаунта?')) return;
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
        renderPage({ keepCharts: true });
        return;
      }
      if (state.mobileOpen && !e.target.closest('#menu-btn') && !e.target.closest('#mobile-drawer')) {
        state.mobileOpen = false;
        updateChrome();
      }
      if (e.target.closest('#confirm-no')) { state.confirm = null; paintOverlay(); return; }
      if (e.target.closest('#confirm-yes')) {
        const fn = state.confirm && state.confirm.onYes;
        state.confirm = null;
        paintOverlay();
        if (fn) Promise.resolve().then(fn).catch((err) => toast(errText(err)));
        return;
      }
    });
    document.addEventListener('keydown', (e) => {
      const dlg = document.querySelector('#overlay-root [role="dialog"]');
      if (dlg && (state.modal || state.confirm)) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeOverlayDialog();
          return;
        }
        if (e.key === 'Tab') {
          trapOverlayTab(e, dlg);
          return;
        }
      }
      if (e.key !== 'Escape') return;
      const closeMenu = !!state.menuTicker;
      if (state.mobileOpen) state.mobileOpen = false;
      if (state.menuTicker) state.menuTicker = null;
      state.heroSettingsOpen = false;
      state.quoteOpen = false;
      document.getElementById('hero-settings-pop')?.classList.add('hidden');
      document.getElementById('quote-pop')?.classList.add('hidden');
      if (closeMenu) renderPage({ keepCharts: true });
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
    applyNavCollapsed();
    const badge = document.getElementById('footer-status');
    if (badge) {
      const wrap = document.createElement('div');
      wrap.innerHTML = statusBadgeHTML();
      const next = wrap.firstElementChild;
      if (next) badge.replaceWith(next);
    }
  }

  function updateScrollCues() {
    document.querySelectorAll('.scroll-cue').forEach((el) => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      el.classList.toggle('scroll-cue-overflow', overflow);
      el.parentElement?.classList.toggle('scroll-cue-overflow', overflow);
    });
  }

  let pageGen = 0;
  async function renderPage(opts) {
    opts = opts || {};
    const gen = ++pageGen;
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
    paintOverlay();
    await afterRender(gen);
    if (gen !== pageGen) return;
    requestAnimationFrame(() => {
      document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
      updateScrollCues();
    });
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

  function askDelete(message, onYes, opts) {
    opts = opts || {};
    state.confirm = { title: opts.title || 'Удалить?', message, onYes, okLabel: opts.okLabel || 'Удалить' };
    paintOverlay();
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

  async function afterRender(gen) {
    if (gen == null) gen = pageGen;
    const p = state.page;
    const root = document.getElementById('page-root');
    if (!root) return;

    if (p === '/data' || p === '/') {
      if (!state.loaded.statusPing) {
        state.loaded.statusPing = true;
        API.status().then(() => {
          if (gen !== pageGen) return;
          state.serverStatus = 'online';
          updateChrome();
        }).catch(() => {
          if (gen !== pageGen) return;
          state.serverStatus = 'offline';
          updateChrome();
        });
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
        renderPage({ keepCharts: true });
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
        setTimeout(() => URL.revokeObjectURL(a.href), 500);
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
        paintOverlay();
        document.getElementById('edit-cancel')?.addEventListener('click', () => { state.modal = null; paintOverlay(); });
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
        await withBusy(b, async () => {
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
        });
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
      document.getElementById('monthly-contribution-input')?.addEventListener('input', (e) => { state.monthlyContribution = e.target.value; try { localStorage.setItem('stocksMonthlyContribution', state.monthlyContribution); } catch (_) {} });
      document.getElementById('stock-preset-save')?.addEventListener('click', () => {
        const name = document.getElementById('stock-preset-name')?.value.trim();
        if (!name) return;
        syncStockParamsFromDom();
        const payload = { id: String(Date.now()), name, tickers: state.tickerInput, leverage: state.leverage, takeProfit: state.takeProfit, monthlyContribution: state.monthlyContribution };
        const existing = state.stockPresets.findIndex((p) => String(p.name || '').toLowerCase() === name.toLowerCase());
        if (existing >= 0) {
          state.stockPresets[existing] = { ...state.stockPresets[existing], ...payload, id: state.stockPresets[existing].id };
          state.stockPresetId = state.stockPresets[existing].id;
        } else {
          state.stockPresets.push(payload);
          state.stockPresetId = payload.id;
        }
        persistStockPresets();
        toast('Пресет сохранён');
        renderPage();
      });
      document.getElementById('stock-preset-del')?.addEventListener('click', () => {
        const id = document.getElementById('stock-preset')?.value;
        if (!id) return;
        state.stockPresets = state.stockPresets.filter((p) => p.id !== id);
        if (state.stockPresetId === id) state.stockPresetId = '';
        persistStockPresets();
        renderPage();
      });
      document.getElementById('stock-preset')?.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) { state.stockPresetId = ''; return; }
        const pset = state.stockPresets.find((x) => x.id === id);
        if (!pset) return;
        state.stockPresetId = pset.id;
        applyStockPreset(pset);
        await renderPage();
        await runStocks();
      });
      document.getElementById('run-bt')?.addEventListener('click', runStocks);
      root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => { state.stockTab = b.dataset.stab; state.tradesPage = 1; renderPage(); }));
      bindPriceChartControls('chart-price');
      paintStockCharts();
      bindTradesPager(root);
      paintHistograms();
      if (state.result && state.stockTab === 'summary') bindHero(root, { quote: true, pro: 'price' });
      runNested();
      // A ?tickers= link is a request for a backtest, not just for the form.
      if (state.pendingRun) {
        state.pendingRun = false;
        runStocks();
      }
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
        if (existing >= 0) {
          state.emaPresets[existing] = { ...state.emaPresets[existing], ...payload, id: state.emaPresets[existing].id };
          state.emaPresetId = state.emaPresets[existing].id;
        } else {
          state.emaPresets.push(payload);
          state.emaPresetId = payload.id;
        }
        try { localStorage.setItem('emaPresets', JSON.stringify(state.emaPresets)); } catch (_) {}
        toast('Пресет сохранён');
        renderPage();
      });
      document.getElementById('ema-preset-del')?.addEventListener('click', () => {
        const id = document.getElementById('ema-preset')?.value;
        if (!id) return;
        state.emaPresets = state.emaPresets.filter((p) => p.id !== id);
        if (state.emaPresetId === id) state.emaPresetId = '';
        try { localStorage.setItem('emaPresets', JSON.stringify(state.emaPresets)); } catch (_) {}
        renderPage();
      });
      document.getElementById('ema-preset')?.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) { state.emaPresetId = ''; return; }
        const pset = state.emaPresets.find((x) => x.id === id);
        if (!pset) return;
        state.emaPresetId = pset.id;
        state.emaForm = normalizeEmaForm(pset.form);
        persistEmaForm();
        if (pset.tickers) { state.emaTickers = pset.tickers; try { localStorage.setItem('ema.tickers', state.emaTickers); } catch (_) {} }
        await renderPage();
        await runEma();
      });
      bindEmaZones(root);
      document.getElementById('ema-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        syncEmaFormFromDom();
        persistEmaForm();
        await runEma();
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
      document.getElementById('opt-preset-save')?.addEventListener('click', () => {
        const name = document.getElementById('opt-preset-name')?.value.trim();
        if (!name) return;
        const form = document.getElementById('opt-form');
        const fd = new FormData(form);
        state.optTickers = document.getElementById('opt-tickers')?.value || state.optTickers;
        state.optForm = {
          strike: Number(fd.get('strike') || 10), vol: Number(fd.get('vol') || 20), cap: Number(fd.get('cap') || 10),
          expiration: Number(fd.get('expiration') || 4), maxHold: Number(fd.get('maxHold') || 30), leverage: Number(fd.get('leverage') || 200),
        };
        const payload = { id: String(Date.now()), name, tickers: state.optTickers, form: { ...state.optForm } };
        const existing = state.optPresets.findIndex((p) => String(p.name || '').toLowerCase() === name.toLowerCase());
        if (existing >= 0) {
          state.optPresets[existing] = { ...state.optPresets[existing], ...payload, id: state.optPresets[existing].id };
          state.optPresetId = state.optPresets[existing].id;
        } else {
          state.optPresets.push(payload);
          state.optPresetId = payload.id;
        }
        persistOptPresets();
        try { localStorage.setItem('options.tickers', state.optTickers); } catch (_) {}
        toast('Пресет сохранён');
        renderPage();
      });
      document.getElementById('opt-preset-del')?.addEventListener('click', () => {
        const id = document.getElementById('opt-preset')?.value;
        if (!id) return;
        state.optPresets = state.optPresets.filter((p) => p.id !== id);
        if (state.optPresetId === id) state.optPresetId = '';
        persistOptPresets();
        renderPage();
      });
      document.getElementById('opt-preset')?.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) { state.optPresetId = ''; return; }
        const pset = state.optPresets.find((x) => x.id === id);
        if (!pset) return;
        state.optPresetId = pset.id;
        state.optForm = { ...state.optForm, ...(pset.form || {}) };
        if (pset.tickers) state.optTickers = pset.tickers;
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
        try { state.cal.data = await API.calendar(); state.cal.error = ''; } catch (e) { state.cal.data = {}; state.cal.error = (e && e.message) || 'не удалось прочитать'; }
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
        const rows = (list) => list.map((e, i) => `<div class="flex gap-2 mb-1" data-split-row="${i}"><input data-sd class="field w-40" value="${esc(e.date || '')}" /><input data-sf type="number" step="0.01" class="field w-24" value="${esc(e.factor ?? '')}" />${actionIcon('trash', 'Удалить событие', `data-rm-row="${i}"`, 'action-icon-danger')}</div>`).join('');
        state.modal = `<div class="modal-backdrop" id="split-edit-modal"><div class="modal-card max-w-lg">
          <h3 class="text-lg font-semibold mb-3">Сплиты ${esc(ticker)}</h3>
          <div id="split-edit-rows">${rows(evs)}</div>
          <button type="button" id="split-add-row" class="btn-secondary min-h-0 py-1 mb-3">+ событие</button>
          <div class="flex justify-end gap-2"><button id="split-edit-cancel" class="btn-secondary">Отмена</button><button id="split-edit-save" class="btn-primary min-h-0 py-2">Сохранить</button></div>
        </div></div>`;
        paintOverlay();
        const host = document.getElementById('split-edit-rows');
        const readRows = () => Array.from(host.querySelectorAll('[data-split-row]')).map((row) => ({ date: row.querySelector('[data-sd]').value, factor: Number(row.querySelector('[data-sf]').value) })).filter((e) => e.date);
        const paint = (list) => { host.innerHTML = rows(list); host.querySelectorAll('[data-rm-row]').forEach((btn) => btn.addEventListener('click', () => { const next = readRows().filter((_, i) => i !== Number(btn.dataset.rmRow)); paint(next); })); };
        paint(evs);
        document.getElementById('split-add-row')?.addEventListener('click', () => paint(readRows().concat([{ date: '', factor: 2 }])));
        document.getElementById('split-edit-cancel')?.addEventListener('click', () => { state.modal = null; paintOverlay(); });
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
        try {
          const calP = state.loaded.cal ? Promise.resolve(state.cal.data) : API.calendar().then((c) => { state.cal.error = ''; return c; }).catch((e) => { state.cal.error = (e && e.message) || 'не удалось прочитать'; return {}; });
          const [w, t, a, c, cal, ac] = await Promise.all([
            API.watches(),
            API.positions(),
            API.emaAlerts(),
            API.consistency().catch((e) => ({ issues: [{ code: 'fetch_failed', message: (e && e.message) || 'Не удалось получить согласованность' }] })),
            calP,
            API.autoConfig().catch(() => ({})),
          ]);
          state.watchLoadError = '';
          state.watches = w || [];
          state.monitorTrades = Array.isArray(t) ? t : (t.positions || []);
          state.emaAlerts = Array.isArray(a) ? a : (a.alerts || []);
          state.consistency = c || { issues: [] };
          state.cal.data = cal || {};
          state.loaded.cal = true;
          state.autoConfig = ac && ac.config ? ac.config : (ac || {});
        } catch (e) {
          state.watchLoadError = (e && e.message) || 'Не удалось загрузить мониторинг';
          state.watches = state.watches || [];
          state.monitorTrades = state.monitorTrades || [];
          state.emaAlerts = state.emaAlerts || [];
        }
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
      root.querySelectorAll('[data-watch-thr]').forEach((b) => b.addEventListener('click', () => openWatchThresholdsModal(b.dataset.watchThr)));
      document.getElementById('watch-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await API.addWatch({ symbol: e.target.symbol.value, lowIBS: liveLowIBS(), highIBS: liveHighIBS() });
          state.watches = await API.watches();
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('watch-t11')?.addEventListener('click', async (e) => {
        await withBusy(e.currentTarget, async () => {
          try { const r = await API.simulate('overview'); if (r && r.success && r.sent) toast('Симуляция T-11'); else toast((r && (r.reason || r.error)) || 'Симуляция T-11 не отправлена'); } catch (err) { toast(err.message); }
        });
      });
      document.getElementById('watch-t1')?.addEventListener('click', async (e) => {
        await withBusy(e.currentTarget, async () => {
          try { const r = await API.simulate('confirmations'); if (r && r.success && r.sent) toast('Симуляция T-1'); else toast((r && (r.reason || r.error)) || 'Симуляция T-1 не отправлена'); } catch (err) { toast(err.message); }
        });
      });
      document.getElementById('watch-prices')?.addEventListener('click', async (e) => {
        await withBusy(e.currentTarget, async () => {
          try {
            const r = await API.updateAll();
            const prices = (r && r.prices) || r || {};
            const n = prices.count;
            const failed = (prices.failedTickers || []).join(', ');
            toast((prices.success || prices.updated ? 'Обновлено' : (prices.reason || 'Цены не обновлены')) + (n != null ? ' · ' + n : '') + (failed ? ' · ошибки: ' + failed : ''));
            state.loaded.watches = false;
            renderPage();
          } catch (err) { toast(errText(err)); }
        });
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
          await API.addPosition(rec);
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
            <label class="block text-sm">Тикер<input id="em-sym" class="field mt-1" value="${esc(t.symbol || '')}" /></label>
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
              symbol: document.getElementById('em-sym').value.toUpperCase().trim(),
              entryDate: document.getElementById('em-ed').value,
              exitDate: document.getElementById('em-xd').value,
              entryPrice: document.getElementById('em-ep').value === '' ? null : Number(document.getElementById('em-ep').value),
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
            await API.patchPosition(t.id, payload);
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
      toast('Страница /broker перенесена в /webull');
      navigate('/webull', true);
      return;
    }
    if (p === '/webull' || p === '/robinhood') {
      const kind = p === '/robinhood' ? 'robinhood' : 'webull';
      if (state.loaded.broker !== kind) {
        const rh = p === '/robinhood';
        // Каждый из запросов подменялся пустой заглушкой, и страница рисовала
        // «позиций нет» / «расхождений нет» там, где на самом деле «не знаю».
        // Заглушка остаётся (иначе страница вообще не соберётся), но молчать о
        // ней нельзя: оператор должен видеть, что пусто не значит пусто.
        const failed = [];
        const orEmpty = (name, fallback) => (e) => {
          failed.push(name);
          return typeof fallback === 'function' ? fallback(e) : fallback;
        };
        const [bt, tok, ac, dash, logs, st, w, cons, health, settings] = await Promise.all([
          API.positions({ includeHidden: true, includeTest: true }).catch(orEmpty('журнал сделок', { positions: [] })),
          rh ? API.rhStatus().catch(orEmpty('статус брокера', (e) => e.data || {})) : API.tokenStatus().catch(orEmpty('статус брокера', (e) => e.data || { present: false, hasToken: false })),
          API.autoConfig().catch(orEmpty('настройки автоторговли', {})),
          rh ? API.rhDashboard(true).catch((e) => (e && e.data) || { error: (e && e.message) || 'dashboard', positions: [] }) : API.dashboard(true).catch((e) => (e && e.data) || { error: (e && e.message) || 'dashboard', positions: [] }),
          API.logs(300).catch(orEmpty('журнал автоторговли', { logs: [] })),
          API.autoStatus().catch(orEmpty('состояние автоторговли', null)),
          API.watches().catch(orEmpty('список наблюдения', [])),
          API.consistency().catch(orEmpty('сверка с брокером', { issues: [] })),
          API.brokersHealth().catch(orEmpty('здоровье брокеров', [])),
          API.settings().catch(orEmpty('настройки', {})),
        ]);
        if (failed.length) toast('Не загрузилось: ' + failed.join(', ') + '. Пустые блоки — это отказ запроса, а не отсутствие данных.');
        state.brokerHealth = Array.isArray(health) ? health : [];
        // На /robinhood статус брокера — это уже загруженный tok: второй такой
        // же запрос в этом же Promise.all был лишним (AUD-123).
        state.rhStatus = rh ? (tok || {}) : {};
        state.broker = Array.isArray(bt) ? bt : (bt.positions || []);
        state.token = tok;
        state.autoConfig = unwrapAutoConfig(ac);
        state.dashboard = { ...(dash || {}), broker: kind };
        state.autoLogs = logs || { logs: [] };
        state.autoStatus = st;
        state.settings = settings || {};
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
        state.loaded.broker = kind;
        renderPage();
        return;
      }
      root.querySelectorAll('[data-btab]').forEach((b) => b.addEventListener('click', () => { state.brokerTab[kind] = b.dataset.btab; renderPage(); }));
      document.getElementById('broker-refresh')?.addEventListener('click', async () => {
        state.loaded.broker = false;
        renderPage();
      });
      document.getElementById('rh-get-link')?.addEventListener('click', async () => {
        try {
          const r = await API.rhStart();
          state.rhAuthUrl = r.authorizationUrl || '';
          state.rhStatus = { ...(state.rhStatus || {}), authorizationUrl: state.rhAuthUrl };
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('rh-copy-link')?.addEventListener('click', async () => {
        const v = document.getElementById('rh-auth-url')?.value || '';
        try { await navigator.clipboard.writeText(v); toast('Скопировано'); } catch (_) { toast(v); }
      });
      document.getElementById('rh-connect')?.addEventListener('click', async () => {
        try {
          await API.rhComplete(document.getElementById('rh-callback')?.value || '');
          toast('Подключено');
          state.loaded.broker = false;
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      document.getElementById('rh-disconnect')?.addEventListener('click', async () => {
        try { await API.rhDisconnect(); toast('Отключено'); state.loaded.broker = false; renderPage(); } catch (err) { toast(errText(err)); }
      });
      root.querySelectorAll('[data-bd]').forEach((b) => b.addEventListener('click', () => {
        askDelete('Удалить брокерскую сделку?', async () => {
          try {
            await API.deletePosition(b.dataset.bd);
            const bt = await API.positions({ includeHidden: true, includeTest: true }).catch(() => ({ positions: [] }));
            state.broker = Array.isArray(bt) ? bt : (bt.positions || []);
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
            symbol, entryDate, entryPrice: fd.get('entryPrice') ? entryPrice : null,
            quantity: fd.get('quantity') ? Number(fd.get('quantity')) : undefined,
            notes: fd.get('notes') || '',
            source: 'manual',
            status: (exitDate && exitPrice > 0) ? 'closed' : 'open',
            // Запись о бумагах у брокера, а не позиция мониторинга (CORE §15).
            isTest: true,
          };
          if (exitDate) rec.exitDate = exitDate;
          if (exitPrice > 0) rec.exitPrice = exitPrice;
          await API.addPosition(rec);
          const bt = await API.positions({ includeHidden: true, includeTest: true }).catch(() => ({ positions: [] }));
          state.broker = Array.isArray(bt) ? bt : (bt.positions || []);
          state.brokerShowHidden = true;
          toast('Сделка записана вне мониторинга');
          renderPage();
        } catch (err) { toast(errText(err)); }
      });
      root.querySelectorAll('[data-edit-bt]').forEach((b) => b.addEventListener('click', () => {
        const t = (state.broker || []).find((x) => String(x.id) === String(b.dataset.editBt));
        if (!t) return;
        const ibsOut = t.exitIBS == null ? '' : (ibsPct(t.exitIBS) ?? '');
        setModal(`<div class="modal-backdrop"><div class="modal-card max-w-lg">
          <h3 class="text-lg font-semibold mb-2">Редактировать брокерскую сделку: ${esc(t.symbol)}</h3>
          <p class="text-sm text-gray-500 mb-3">Заполните дату и цену выхода, чтобы ручной записью закрыть сделку в журнале брокера сайта.</p>
          <div id="eb-err" class="text-sm text-red-600 mb-2 hidden"></div>
          <div class="grid sm:grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-sm mb-3 dark:bg-gray-950/40">
            <div><div class="text-xs text-gray-500">Вход</div><div class="font-mono">${esc(fmtTradingDate(t.entryDate))}</div></div>
            <div><div class="text-xs text-gray-500">Цена входа</div><div class="font-mono">${t.entryPrice == null ? '—' : fmt(t.entryPrice)}</div></div>
            <div><div class="text-xs text-gray-500">Статус</div><div>${t.status === 'open' ? 'открыта' : 'закрыта'}</div></div>
          </div>
          <div class="grid sm:grid-cols-2 gap-2">
            <label class="text-sm">Дата выхода<input id="eb-xd" class="field mt-1" value="${esc(t.exitDate || '')}" /></label>
            <label class="text-sm">Цена выхода<input id="eb-xp" type="number" step="0.01" class="field mt-1" value="${esc(t.exitPrice ?? '')}" /></label>
            <label class="text-sm col-span-2">IBS выхода, %<input id="eb-ibs" type="number" step="0.1" min="0" max="100" class="field mt-1" value="${esc(ibsOut)}" placeholder="Необязательно" /></label>
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
            if (!Number.isFinite(n) || n < 0 || n > 100) { errEl.textContent = 'IBS выхода должен быть в диапазоне 0-100%.'; errEl.classList.remove('hidden'); return; }
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
            await API.patchPosition(t.id, payload);
            closeModal();
            const bt = await API.positions({ includeHidden: true, includeTest: true }).catch(() => ({ positions: [] }));
            state.broker = Array.isArray(bt) ? bt : (bt.positions || []);
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
          await API.patchPosition(t.id, { isHidden: !t.isHidden });
          const bt = await API.positions({ includeHidden: true, includeTest: true }).catch(() => ({ positions: [] }));
          state.broker = Array.isArray(bt) ? bt : (bt.positions || []);
          renderPage();
        } catch (err) { toast(errText(err)); }
      }));
      document.getElementById('broker-reconcile')?.addEventListener('click', async () => {
        try {
          const r = await API.reconcile('apply');
          toast((r && r.status) || 'Сверка выполнена');
          state.loaded.broker = false;
          renderPage();
        } catch (err) { toast(err.message); }
      });
      document.getElementById('broker-quotes-refresh')?.addEventListener('click', async () => {
        // Quotes only: reloading the whole page fired the dashboard and the
        // consistency read as well, and their two concurrent Webull positions
        // calls tripped TOO_MANY_REQUESTS. One snapshot request covers the
        // whole watch list, exactly like the per-row refresh above.
        const symbols = (state.watches || []).map((x) => x.symbol).filter(Boolean);
        if (!symbols.length) return;
        try {
          const batch = await API.webullBatch(symbols);
          const map = {};
          (batch.results || []).forEach((row) => { if (row && row.symbol) map[row.symbol] = row; });
          state.brokerQuotes = map;
          renderPage();
        } catch (err) { toast(errText(err)); }
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
      document.getElementById('auto-test-buy')?.addEventListener('click', async (ev) => {
        if (!window.confirm('Отправить BUY AAL 1 шт по рынку в ' + brokerLabel(kind) + '?')) return;
        await withBusy(ev.currentTarget, async () => {
          try {
            const r = kind === 'robinhood' ? await API.rhTestBuy('AAL', 1) : await API.testBuy('AAL', 1);
            toast(r.submitted ? ('Ордер ' + (r.clientOrderId || 'отправлен')) : (r.error || 'не отправлен'));
          } catch (err) { toast(errText(err)); }
        });
      });
      document.getElementById('auto-refresh')?.addEventListener('click', () => { reloadBroker(); });
      root.querySelectorAll('[data-close-pos]').forEach((b) => b.addEventListener('click', async () => {
        if (!window.confirm('Закрыть позицию ' + b.dataset.closePos + ' рыночным ордером в ' + brokerLabel(kind) + '?')) return;
        await withBusy(b, async () => {
          try {
            const r = kind === 'robinhood' ? await API.rhClose(b.dataset.closePos) : await API.closePosition(b.dataset.closePos);
            toast(r.submitted || r.success ? 'Ордер на закрытие отправлен' : errText({ message: r.error || 'не отправлен', data: r }));
            await reloadBroker();
          } catch (err) { toast(errText(err)); }
        });
      }));
      root.querySelectorAll('[data-resolve-tracker]').forEach((b) => b.addEventListener('click', async () => {
        const clientOrderId = b.dataset.resolveTracker;
        const outcome = b.dataset.resolveOutcome;
        const label = outcome === 'filled' ? 'Пометить исполненной у брокера' : 'Пометить как «заявки нет»';
        if (!window.confirm(label + ' (' + clientOrderId + ')?\nЭто снимет блокировку входов по этому трекеру.')) return;
        const note = window.prompt('Причина (для журнала autotrade_logs):', outcome === 'filled' ? 'Подтверждено у брокера вручную' : 'У брокера заявки нет') || '';
        try {
          await API.resolveTracker(clientOrderId, { outcome, note });
          toast('Трекер разрешён: ' + outcome);
          await reloadBroker();
        } catch (err) { toast(errText(err)); }
      }));
      root.querySelectorAll('[data-clear-persist-block]').forEach((b) => b.addEventListener('click', async () => {
        const broker = b.dataset.clearPersistBlock;
        if (!window.confirm('Снять блокировку входов у брокера ' + brokerLabel(broker) + '?\nУбедитесь, что заявка проверена вручную.')) return;
        const note = window.prompt('Причина снятия блокировки (для журнала autotrade_logs):', 'Проверено у брокера вручную') || '';
        try {
          await API.clearTrackerPersistBlock(broker, note);
          toast('Блокировка снята: ' + brokerLabel(broker));
          await reloadBroker();
        } catch (err) { toast(errText(err)); }
      }));
    }

    if (p === '/settings') {
      if (!state.loaded.settings) {
        try { state.settings = await API.settings() || {}; } catch (_) { state.settings = {}; }
        try {
          const ac = await API.autoConfig() || {};
          state.autoConfig = unwrapAutoConfig(ac);
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
        if (form.autoEnabled) {
          const updates = {
            enabled: form.autoEnabled.checked,
            provider: fd.get('autoQuote') || 'finnhub',
            entryCapitalMode: fd.get('entryCapitalMode') || 'standard_safe',
            lowIBS: Number(fd.get('autoLowIBS')),
            highIBS: Number(fd.get('autoHighIBS')),
            executionWindowSeconds: Number(fd.get('autoWindow')),
            maxSlippageBps: Number(fd.get('autoSlippage')),
            entryReservePct: Number(fd.get('autoEntryReserve')) / 100,
          };
          const brokers = brokerFlagsPatch(state.autoConfig || {}, form);
          if (Object.keys(brokers).length) updates.brokers = brokers;
          try {
            const saved = await API.saveAutoConfig(updates);
            state.autoConfig = { ...(state.autoConfig || {}), ...(saved && saved.config ? saved.config : updates) };
          } catch (err) {
            // Отказ автоторговли — конец сохранения: следующий успешный запрос
            // настроек писал «Сохранено» над несохранённым переключателем (AUD-171).
            const msg = document.getElementById('set-msg');
            if (msg) msg.textContent = errText(err);
            toast(errText(err));
            return;
          }
        }
        const body = {};
        const settingsKeys = ['watchThresholdPct', 'indicatorPanePercent', 'defaultMultiTickerSymbols',
          'enablePostClosePriceActualization', 'resultsQuoteProvider', 'resultsRefreshProvider',
          'enhancerProvider', 'initialCapital'];
        for (const k of settingsKeys) {
          if (k === 'enablePostClosePriceActualization') {
            if (form.enablePostClosePriceActualization) body[k] = !!form.enablePostClosePriceActualization.checked;
            continue;
          }
          if (form[k] == null) continue;
          const v = fd.get(k);
          if (v == null) continue;
          body[k] = v;
        }
        if (body.watchThresholdPct != null) body.watchThresholdPct = Number(body.watchThresholdPct);
        if (body.indicatorPanePercent != null) body.indicatorPanePercent = Number(body.indicatorPanePercent);
        if (body.initialCapital != null) body.initialCapital = Number(body.initialCapital);
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

