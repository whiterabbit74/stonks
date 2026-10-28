  function pageData() {
    const tags = new Set();
    state.datasets.forEach((d) => (d.tag || '').split(',').forEach((t) => { const x = t.trim(); if (x) tags.add(x); }));
    const filtered = state.dataTag === 'all' ? state.datasets : state.datasets.filter((d) => (d.tag || '').split(',').map((t) => t.trim()).includes(state.dataTag));
    const tagCount = (name) => state.datasets.filter((d) => (d.tag || '').split(',').map((x) => x.trim()).includes(name)).length;
    const filters = [`<button data-tag="all" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === 'all' ? 'chip-on' : 'chip-off'}">Все (${state.datasets.length})</button>`]
      .concat([...tags].sort().map((t) => `<button data-tag="${esc(t)}" class="px-3 py-1.5 rounded-lg text-xs font-medium ${state.dataTag === t ? 'chip-on' : 'chip-off'}">${esc(t)} (${tagCount(t)})</button>`)).join('');
    let cards = '';
    if (!state.datasets.length) {
      cards = `<div class="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
        ${icon('database', 'mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600')}
        <h3 class="mb-1 text-base font-semibold text-gray-700 dark:text-gray-300">Датасетов пока нет</h3>
        <p class="mb-4 text-sm text-gray-500">Загрузите данные по тикерам из API, чтобы начать бэктестинг</p>
        <a href="/enhance" data-nav class="btn-primary">${icon('plus', 'h-4 w-4')} Загрузить тикеры</a>
      </div>`;
    } else if (state.dataView === 'compact') {
      cards = `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">${filtered.map((d) => {
        const active = state.ticker === d.ticker;
        const tagsHtml = (d.tag || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).map((t) => `<span class="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded dark:bg-gray-800 dark:text-gray-400">${esc(t)}</span>`).join('');
        return `<div class="relative h-full">
          <a href="/stocks?tickers=${encodeURIComponent(d.ticker)}" data-load="${esc(d.ticker)}" class="block relative h-full w-full p-3 rounded-lg border text-left ${active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/30' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900'}">
            ${active ? '<div class="absolute top-1.5 left-1.5 w-2 h-2 bg-green-500 rounded-full"></div>' : ''}
            <div class="font-mono font-semibold text-sm pr-6">${esc(d.ticker)}</div>
            ${datasetCompany(d) ? `<div class="text-xs text-gray-500 break-words mt-0.5">${esc(datasetCompany(d))}</div>` : ''}
            <div class="text-[10px] text-gray-400 mt-1">${d.dataPoints || 0} баров</div>
            ${tagsHtml ? `<div class="flex items-center gap-1 mt-1.5">${tagsHtml}</div>` : ''}
          </a>
          <button data-menu="${esc(d.ticker)}" class="icon-btn absolute top-2 right-2 h-8 w-8 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700" title="Открыть меню действий" aria-label="Открыть меню действий">${icon('more', 'w-4 h-4')}</button>
          ${state.menuTicker === d.ticker ? `<div class="absolute right-2 top-14 z-10 w-40 rounded-lg border bg-white shadow dark:bg-gray-800 dark:border-gray-700 text-sm">
            ${actionIcon('edit', 'Изменить датасет', `data-edit="${esc(d.ticker)}"`, 'action-icon-edit')}
            <button data-refresh="${esc(d.ticker)}" class="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">Обновить датасет</button>
            <button data-export="${esc(d.ticker)}" class="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">Экспорт JSON</button>
            ${actionIcon('trash', 'Удалить датасет', `data-del="${esc(d.ticker)}"`, 'action-icon-danger')}
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
    } else {
      cards = filtered.map((d) => `<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 bg-white dark:bg-gray-900 dark:border-gray-800">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2"><div class="font-semibold font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">${esc(d.ticker)}</div>${datasetCompany(d) ? `<span class="text-xs text-gray-500">${esc(datasetCompany(d))}</span>` : ''}${state.ticker === d.ticker ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">Выбран</span>' : ''}</div>
          <div class="text-xs text-gray-500">${d.dataPoints || 0} баров · ${esc(fmtTradingDate(d.dateRange?.from))} — ${esc(fmtTradingDate(d.dateRange?.to))}${d.uploadDate ? ' · Сохранён: ' + esc(fmtTradingDate(d.uploadDate)) : ''}</div>
          ${(d.tag || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="inline-block mr-1 mt-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded dark:bg-gray-800">${esc(t)}</span>`).join('')}
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <a href="/stocks?tickers=${encodeURIComponent(d.ticker)}" data-load="${esc(d.ticker)}" class="btn-primary">Открыть</a>
          ${actionIcon('edit', 'Изменить датасет', `data-edit="${esc(d.ticker)}"`, 'action-icon-edit')}
          <button data-refresh="${esc(d.ticker)}" class="btn-secondary min-h-0 py-1.5 px-3 text-sm">Обновить</button>
          <button data-export="${esc(d.ticker)}" class="btn-secondary min-h-0 py-1.5 px-3 text-sm">Экспорт</button>
          ${actionIcon('trash', 'Удалить датасет', `data-del="${esc(d.ticker)}"`, 'action-icon-danger')}
        </div>
      </div>`).join('');
    }
    return `
      ${pageHeader('Данные', 'Управление загруженными датасетами')}
      <div class="bg-white rounded-lg border p-4 mb-6 dark:bg-gray-900 dark:border-gray-800">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex items-center justify-center w-8 h-8 bg-blue-50 rounded-lg dark:bg-blue-950/20">${icon('database', 'w-4 h-4 text-blue-600')}</div>
          <div class="flex-1"><h3 class="font-semibold text-base">Библиотека датасетов</h3><p class="text-xs text-gray-500">${filtered.length}${state.dataTag !== 'all' ? ' из ' + state.datasets.length : ''} датасетов</p></div>
          ${state.datasets.length ? `<a href="/enhance" data-nav title="Загрузить новые данные из API" aria-label="Загрузить новые данные из API" class="icon-btn icon-btn-md icon-btn-glass">${icon('plus', 'w-4 h-4')}</a>` : ''}
        </div>
        ${state.datasetsError ? `<div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30">Ошибка загрузки: ${esc(state.datasetsError)}</div>` : ''}
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-1.5">${state.serverStatus === 'offline'
            ? '<div class="w-2 h-2 bg-red-500 rounded-full"></div><span class="text-xs text-red-600 font-medium">Офлайн</span>'
            : (state.serverStatus === 'checking'
              ? '<div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div><span class="text-xs text-gray-500 font-medium">Проверяем…</span>'
              : '<div class="w-2 h-2 bg-green-500 rounded-full"></div><span class="text-xs text-green-600 font-medium">Онлайн</span>')}</div>
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button id="view-list" class="inline-flex h-11 w-11 items-center justify-center rounded-lg p-0 ${state.dataView === 'list' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-500'}" title="Список" aria-label="Переключить на режим списка">${icon('list', 'w-4 h-4')}</button>
            <button id="view-grid" class="inline-flex h-11 w-11 items-center justify-center rounded-lg p-0 ${state.dataView === 'compact' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-500'}" title="Компактный вид" aria-label="Переключить на компактный вид">${icon('grid', 'w-4 h-4')}</button>
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
      return `<button type="button" data-ecat="${c.id}" class="${on ? 'cat-chip' : 'cat-chip-off'}">${c.icon} ${esc(c.label)} <span class="text-xs ${on ? '' : 'text-gray-400'}">(${n})</span></button>`;
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
      <div class="scroll-cue-shell mt-4"><div class="scroll-cue flex gap-2 overflow-x-auto pb-2">${chips}</div></div>
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
          <div class="pc-ranges" role="group" aria-label="Период">${ranges}</div>
          <div class="pc-ind-wrap">
            <button type="button" data-pc-ind class="icon-btn icon-btn-md icon-btn-glass ${ui.indOpen ? 'icon-btn-active' : ''}" title="Индикаторы" aria-label="Индикаторы" aria-expanded="${ui.indOpen ? 'true' : 'false'}" aria-controls="pc-ind-panel">${icon('indicators', 'w-4 h-4')}</button>
            <div id="pc-ind-panel" class="pc-ind-panel ${ui.indOpen ? '' : 'hidden'}" data-pc-ind-panel>
              ${lineRow('ema20', 'EMA 20', p.ema20 !== false, 'ema20')}
              ${lineRow('ema200', 'EMA 200', p.ema200 !== false, 'ema200', bandRows + `<button type="button" data-pc-band-add class="pc-add">+ Добавить отклонение</button>`)}
              <div class="pc-row"><label><input type="checkbox" data-pc="ibs" ${p.ibs !== false ? 'checked' : ''} /> IBS</label></div>
              <div class="pc-row"><label><input type="checkbox" data-pc="volume" ${p.volume !== false ? 'checked' : ''} /> Объём</label></div>
              <div class="pc-row"><label><input type="checkbox" data-pc="splits" ${p.splits !== false ? 'checked' : ''} /> Сплиты</label></div>
              <div class="pc-row"><label><input type="checkbox" data-pc="trades" ${p.trades !== false ? 'checked' : ''} /> Сделки</label></div>
            </div>
          </div>
          <button type="button" data-pc-csv class="icon-btn icon-btn-md icon-btn-glass" title="Экспортировать данные графика в CSV" aria-label="Экспортировать данные графика в CSV">${icon('download', 'h-4 w-4')}</button>
          <button type="button" data-pc-fs class="icon-btn icon-btn-md icon-btn-glass" title="${fsOn ? 'Свернуть' : 'Во весь экран'}" aria-label="${fsOn ? 'Свернуть' : 'Во весь экран'}">${icon(fsOn ? 'minimize' : 'maximize', 'h-4 w-4')}</button>
        </div>
      </div>
      <div id="${esc(chartId)}" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>
    </div>`;
  }
  function pageStocks() {
    const tabs = visibleStockTabs();
    const r = state.result;
    const err = state.error ? `<div class="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-950/30">${esc(state.error)}</div>` : '';
    let body = `<div class="hero-grid">
          <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 min-h-[375px] flex items-center justify-center text-sm text-gray-500">Запустите бэктест, чтобы увидеть график</div>
          <aside class="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3 dark:bg-gray-800/50 dark:border-gray-700">
            <div class="text-sm font-semibold">Параметры</div>
            ${stocksParams()}
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
            ${stocksParams()}
            ${asideExtrasHTML(r)}
          </aside>
        </div>`;
      } else if (state.stockTab === 'price') body = priceChartPanelHTML('chart-price');
      else if (state.stockTab === 'tickerCharts') body = `<div id="ticker-charts" class="grid md:grid-cols-2 gap-3"></div>`;
      else if (state.stockTab === 'equity') body = '<div id="chart-eq" class="chart-box mt-4 rounded-lg border dark:border-gray-800"></div>';
      else if (state.stockTab === 'exposure') body = `<div class="text-xs text-gray-500 mb-1" id="exp-avg"></div><div id="chart-exp" class="chart-box rounded-lg border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'drawdown') body = `<div id="dd-stats" class="mb-3"></div><div id="chart-dd" class="chart-box rounded-lg border dark:border-gray-800"></div>`;
      else if (state.stockTab === 'openDayDrawdown') body = `<div id="odd-out"></div>`;
      else if (state.stockTab === 'trades') body = tradesTable(r.trades, { page: state.tradesPage });
      else if (state.stockTab === 'profit') body = profitBody(r);
      else if (state.stockTab === 'duration') body = durationBody(r);
      else if (state.stockTab === 'splits') body = `<div id="splits-box" class="text-sm"></div>`;
      else if (state.stockTab === 'buyhold') body = `<div id="bh-out">
        <form id="bh-lev-form" class="flex flex-wrap items-end gap-3 mb-3">
          <label class="text-xs">Маржинальность, %<input name="pct" type="number" min="1" step="1" value="100" class="field mt-1 w-40" /></label>
          <button class="btn-primary">Посчитать</button>
          <span id="bh-lev-now" class="text-xs text-gray-500 pb-2">Текущее плечо: ×1.00</span>
        </form>
        <div id="chart-bh" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>
      </div>`;
    }
    return `
      ${pageHeader('Акции', 'Бэктест стратегии на нескольких активах')}
      ${err}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown, r && (state.leverage || 200) > 100 ? state.baselineResult : null) : ''}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        ${analysisTabs(tabs, state.stockTab, 'data-stab')}
        <div id="stock-body" class="p-4 min-h-[420px]">${body}</div>
      </div>`;
  }
  function stocksParams() {
    const presets = (state.stockPresets || []).map((p) => `<option value="${esc(p.id)}"${p.id === state.stockPresetId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    return `
      <div>
        <label class="mb-1 block text-xs font-medium">Пресеты</label>
        <div class="flex gap-2"><select id="stock-preset" class="${inputCls()} min-w-0 flex-1"><option value="">— Выбрать пресет —</option>${presets}</select>
        <button type="button" id="stock-preset-del" class="icon-btn icon-btn-md icon-btn-glass" title="Удалить пресет" aria-label="Удалить пресет">${icon('trash', 'w-3.5 h-3.5')}</button></div>
        <div class="mt-2 flex gap-2"><input id="stock-preset-name" class="${inputCls()} min-w-0 flex-1" placeholder="Название пресета" /><button type="button" id="stock-preset-save" class="btn-secondary min-h-0 py-2">Сохранить</button></div>
      </div>
      <div><label class="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300" for="ticker-input">Тикеры</label>
        ${tickerInput('ticker-input', state.tickerInput)}
      </div>
      <div><label class="mb-1 block text-xs font-medium" for="leverage-sel">Маржинальность</label>
        <select id="leverage-sel" class="${inputCls()}">${levOptions(state.leverage)}</select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium" for="take-profit-percent-input">Тейк-профит</label>
        <input id="take-profit-percent-input" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(state.takeProfit)}" placeholder="Например, 2.5" class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800" />
        <p class="mt-1 text-[11px] text-gray-500">Досрочный выход, если максимум дня достиг процента прибыли от цены входа. Пусто или 0 выключает условие.</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium" for="monthly-contribution-input">Пополнение в месяц, $</label>
        <input id="monthly-contribution-input" type="number" min="0" step="100" inputmode="decimal" value="${esc(state.monthlyContribution)}" placeholder="Например, 500" class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800" />
        <p class="mt-1 text-[11px] text-gray-500">Зачисляется в первый торговый день каждого месяца. Пусто или 0 выключает пополнения.</p>
      </div>
      <button id="run-bt" class="btn-primary w-full" ${state.running ? 'disabled' : ''}>${state.running ? 'Считаем…' : 'Запустить бэктест'}</button>`;
  }

  function emaFormHTML() {
    const f = state.emaForm;
    const tickers = parseTickers(state.emaTickers);
    const presets = (state.emaPresets || []).map((p) => `<option value="${esc(p.id)}"${p.id === state.emaPresetId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    return `
      <form id="ema-form" class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium">Пресеты</label>
          <div class="flex gap-2"><select id="ema-preset" class="${inputCls()} min-w-0 flex-1"><option value="">— Выбрать пресет —</option>${presets}</select>
          <button type="button" id="ema-preset-del" class="icon-btn icon-btn-md icon-btn-glass" title="Удалить пресет" aria-label="Удалить пресет">${icon('trash', 'w-3.5 h-3.5')}</button></div>
          <div class="mt-2 flex gap-2"><input id="ema-preset-name" class="${inputCls()} min-w-0 flex-1" placeholder="Название пресета" /><button type="button" id="ema-preset-save" class="btn-secondary min-h-0 py-2">Сохранить</button></div>
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
        emaDeviation: '<div id="chart-ema-dev" class="chart-box-lg rounded-lg border dark:border-gray-800"></div><div class="mt-2 text-xs text-gray-500">Зелёные/красные линии — зоны покупки/продажи. Маркеры — сделки.</div>',
        equity: '<div id="chart-ema-eq" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>',
        exposure: '<div id="chart-ema-exp" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>',
        drawdown: '<div id="chart-ema-dd" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>',
        trades: tradesTable(r.trades),
        profit: profitBody(r),
        duration: durationBody(r),
      };
      main = `<div class="p-4">${bodies[tab] || ''}</div>`;
    }
    return `
      ${pageHeader('EMA', 'Симулятор торговли по отклонению цены от EMA')}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown, r && state.emaBaseline && Number(state.emaForm.leverage) > 100 ? state.emaBaseline : null) : ''}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        ${analysisTabs(tabs, tab, 'data-etab')}
        ${main}
      </div>`;
  }

  function optFormHTML() {
    const f = state.optForm;
    const presets = (state.optPresets || []).map((p) => `<option value="${esc(p.id)}"${p.id === state.optPresetId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const sel = (opts, cur, fmt) => opts.map((v) => `<option value="${v}" ${Number(cur) === v ? 'selected' : ''}>${fmt(v)}</option>`).join('');
    return `
      <form id="opt-form" class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium">Пресеты</label>
          <div class="flex gap-2"><select id="opt-preset" class="${inputCls()} min-w-0 flex-1"><option value="">— Выбрать пресет —</option>${presets}</select>
          <button type="button" id="opt-preset-del" class="icon-btn icon-btn-md icon-btn-glass" title="Удалить пресет" aria-label="Удалить пресет">${icon('trash', 'w-3.5 h-3.5')}</button></div>
          <div class="mt-2 flex gap-2"><input id="opt-preset-name" class="${inputCls()} min-w-0 flex-1" placeholder="Название пресета" /><button type="button" id="opt-preset-save" class="btn-secondary min-h-0 py-2">Сохранить</button></div>
        </div>
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
        equity: '<div id="chart-opt-eq" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>',
        price: priceChartPanelHTML('chart-opt-price'),
        tickerCharts: '<div id="opt-ticker-charts" class="grid md:grid-cols-2 gap-3"></div>',
        drawdown: '<div id="chart-opt-dd" class="chart-box-lg rounded-lg border dark:border-gray-800"></div>',
        trades: tradesTable(r.trades),
        profit: profitBody(r),
        duration: durationBody(r),
        splits: '<div id="opt-splits-box" class="text-sm"></div>',
      };
      main = `<div class="p-4">${bodies[tab] || ''}</div>`;
    }
    return `
      ${pageHeader('Опционы', 'Бэктест опционных стратегий на нескольких активах')}
      ${r ? metricsGrid(r.metrics, r.finalValue, r.maxDrawdown, r && state.optBaseline && Number(state.optForm.leverage) > 100 ? state.optBaseline : null) : ''}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mt-4">
        ${analysisTabs(tabs, tab, 'data-otab')}
        ${main}
      </div>`;
  }

  function calendarNotImported() {
    if (!state.loaded.cal && !(state.cal && state.cal.data)) return false;
    const data = state.cal && state.cal.data;
    const coverage = data && data.metadata && data.metadata.webullCoverageThrough;
    const hol = data && data.holidays;
    let emptyHolidays = !hol || typeof hol !== 'object';
    if (!emptyHolidays) {
      emptyHolidays = true;
      for (const y of Object.keys(hol)) {
        const days = hol[y];
        if (days && typeof days === 'object' && Object.keys(days).length) {
          emptyHolidays = false;
          break;
        }
      }
    }
    return !coverage || emptyHolidays;
  }
  function calendarFallbackNote() {
    if (state.cal && state.cal.error) {
      return `<p data-calendar-error class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-800 mb-3">Календарь недоступен: ${esc(state.cal.error)}. Показанные дни не подтверждены источником.</p>`;
    }
    if (!calendarNotImported()) return '';
    return `<p data-calendar-not-imported class="rounded-lg border border-amber-100 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 mb-3">Календарь не импортирован — используются расчётные праздники NYSE</p>`;
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
      ${calendarFallbackNote()}
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>Торговый · ${esc(hours.start)}–${esc(hours.end)}</span>
        <span class="flex items-center gap-1.5">${icon('calendar', 'w-3.5 h-3.5')} Выходной (Сб, Вс)</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Раннее закрытие · до ${esc((state.cal.data?.tradingHours?.short?.end) || '13:00')}</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Праздник · биржа закрыта</span>
      </div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 p-3">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <button id="cal-prev" class="icon-btn icon-btn-md icon-btn-glass" title="Предыдущий месяц" aria-label="Предыдущий месяц">${icon('chevronleft', 'w-4 h-4')}</button>
            <div class="font-semibold">${months[m]} ${y}</div>
            <button id="cal-next" class="icon-btn icon-btn-md icon-btn-glass" title="Следующий месяц" aria-label="Следующий месяц">${icon('chevronright', 'w-4 h-4')}</button>
            <select id="cal-year" class="field">${(Array.isArray(state.cal.data?.metadata?.years) && state.cal.data.metadata.years.length ? state.cal.data.metadata.years : [y - 1, y, y + 1]).map((yy) => `<option ${Number(yy) === y ? 'selected' : ''}>${yy}</option>`).join('')}</select>
            <select id="cal-month" class="field">${months.map((name, i) => `<option value="${i}" ${i === m ? 'selected' : ''}>${name}</option>`).join('')}</select>
            <button id="cal-today" class="btn-secondary min-h-0 py-2 px-3 text-sm">Сегодня</button>
          </div>
          <div class="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-1">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((x) => `<div class="text-center">${x}</div>`).join('')}</div>
          <div class="cal-grid grid grid-cols-7 gap-1">${cells}</div>
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
      const splitEntries = Object.entries(map);
      const records = splitEntries.map(([ticker, evs]) => {
        const events = (evs || []).map((e) => `<li class="split-event"><time datetime="${esc(e.date || '')}">${esc(fmtTradingDate(e.date))}</time><span class="split-event-factor">× ${esc(e.factor)}</span></li>`).join('');
        return `<article class="split-record">
          <header class="split-record-header">
            <div class="min-w-0"><h3 class="font-mono text-lg font-semibold tracking-tight">${esc(ticker)}</h3><p class="text-xs text-gray-500 dark:text-gray-400">${(evs || []).length} ${(evs || []).length === 1 ? 'событие' : 'событий'}</p></div>
            <div class="split-record-actions">${actionIcon('edit', 'Изменить сплиты', `data-edit-split="${esc(ticker)}"`, 'action-icon-edit')}${actionIcon('trash', 'Удалить тикер', `data-del-ticker="${esc(ticker)}"`, 'action-icon-danger')}</div>
          </header>
          ${events ? `<ul class="split-events">${events}</ul>` : '<p class="text-sm text-gray-500">Событий нет</p>'}
        </article>`;
      }).join('');
      body = `<div id="spl-list"><div class="split-records">${records || '<div class="split-empty-state">Нет данных о сплитах</div>'}</div></div>`;
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
        <p class="text-sm text-gray-500 mb-4">Запрос корпоративных событий по акциям из Webull API — для анализа</p>
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

  function watchMarginSelect() {
    return `<label class="text-xs text-gray-500" for="watch-margin">Маржинальность</label>
      <select id="watch-margin" class="field mt-1 w-full">${MONITOR_MARGIN_OPTIONS.map((n) => `<option value="${n}" ${state.monitorMarginPercent === n ? 'selected' : ''}>${n}%${n === 100 ? ' = без маржи' : n === 200 ? ' = 2x' : ''}</option>`).join('')}</select>`;
  }
  function pageWatches() {
    const loadErr = state.watchLoadError
      ? `<div class="rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm mb-3">${esc(state.watchLoadError)}</div>`
      : '';
    const cons = state.consistency || {};
    const issues = Array.isArray(cons.issues) ? cons.issues : [];
    const actions = Array.isArray(cons.proposedActions) ? cons.proposedActions : [];
    const consOk = !!state.consistency && issues.length === 0;
    const consKind = !state.consistency ? '…' : (issues.some((i) => i && i.autoFixable) ? 'Есть что починить' : (issues.length ? 'Замечания' : 'OK'));
    const consLabel = consKind === 'OK' ? 'Согласовано' : consKind;
    const consBadgeCls = consKind === 'OK' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : (issues.length ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800');
    const consCards = issues.map((i) => `<div class="rounded-lg border px-3 py-2 text-sm mb-1">${esc(i.message || i.code || '')}</div>`).join('');
    const consText = !state.consistency
      ? 'Проверка согласованности…'
      : (consOk ? 'Журнал и книги брокеров сходятся.' : (consCards || 'Есть замечания по состоянию: смотрите список ниже.'));

    const simulated = applyMonitorMarginSimulation(state.monitorTrades, state.monitorMarginPercent);
    const stats = monitorStats(simulated);
    const rows = (state.watches || []).map((w) => `<tr>
      <td class="font-mono"><a href="/stocks?tickers=${encodeURIComponent(w.symbol)}" data-nav class="text-blue-600">${esc(w.symbol)}</a></td>
      <td>${esc('< ' + (w.lowIBS ?? liveLowIBS()).toFixed(2))}</td>
      <td>${esc('> ' + Number(w.highIBS ?? liveHighIBS()).toFixed(2))}</td>
      <td>${w.entryPrice != null ? fmtUsd(w.entryPrice, 2) : '—'}${w.isOpenPosition && w.entryDate ? `<div class="text-[11px] text-gray-500">${esc(fmtTradingDate(w.entryDate))}${w.entryIBS != null ? ' · IBS ' + fmt(ibsPct(w.entryIBS), 1) + '%' : ''}</div>` : ''}</td>
      <td><span class="rounded-full px-2 py-0.5 text-xs ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}">${w.isOpenPosition ? 'Открыта' : 'Нет'}</span></td>
      <td>${w.isOpenPosition && w.currentTradeId ? actionIcon('x', 'Закрыть мониторинг', `data-close-mon="${esc(w.currentTradeId)}" data-close-sym="${esc(w.symbol)}"`, 'action-icon-danger') : ''}${actionIcon('sliders', 'Изменить пороги', `data-watch-thr="${esc(w.symbol)}"`, 'action-icon-edit')}${actionIcon('trash', 'Удалить тикер из мониторинга', `data-dw="${esc(w.symbol)}"`, 'action-icon-danger')}</td>
    </tr>`).join('');
    const alerts = (state.emaAlerts || []).map((a) => `<tr>
      <td class="font-mono">${esc(a.symbol)}</td><td>EMA ${esc(a.emaPeriod || 200)}</td>
      <td>${esc(a.buyLevelPct)} / ${esc(a.sellLevelPct)}</td>
      <td>${esc(a.nextAction === 'sell' ? 'продажу' : 'покупку')}${a.thresholdPct != null ? `<div class="text-[11px] text-gray-500">Близость ${esc(a.thresholdPct)}%</div>` : ''}${a.infoLevelPct != null ? `<div class="text-[11px] text-gray-500">Инфо ${esc(a.infoLevelPct)}%</div>` : ''}</td>
      <td><div class="flex flex-wrap items-center gap-1">
        <button type="button" data-ema-on="${esc(a.id)}" class="rounded-lg px-2 py-1 text-xs font-medium ${a.enabled === false ? 'chip-off' : 'chip-on'}">${a.enabled === false ? 'Выключено' : 'Включено'}</button>
        <button type="button" data-ema-act="${esc(a.id)}" data-ema-next="buy" class="rounded-lg px-2 py-1 text-xs font-medium chip-off">Ждать покупку</button>
        <button type="button" data-ema-act="${esc(a.id)}" data-ema-next="sell" class="rounded-lg px-2 py-1 text-xs font-medium chip-off">Ждать продажу</button>
        ${actionIcon('trash', 'Удалить EMA-оповещение', `data-dea="${esc(a.id)}"`, 'action-icon-danger')}
      </div></td>
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
          ${watchMarginSelect()}
        </div>
      </div>` : `<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50">Пока нет закрытых сделок. Метрики появятся после первого завершенного трейда.</div>
        <div class="mt-3 max-w-xs">${watchMarginSelect()}
          <p class="text-[11px] text-gray-500 mt-1">100% = без маржи, 200% = 2x. Пересчитывает PnL закрытых сделок.</p>
        </div>`;
    return `
      ${pageHeader('Мониторинг', 'Отслеживание позиций и уведомления в Telegram', `<button id="watch-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить список" aria-label="Обновить список">${icon('refresh', 'w-4 h-4')}</button>`)}
      ${loadErr}
      ${calendarFallbackNote()}
      ${analysisTabs(WATCH_TABS, state.watchTab, 'data-wtab', 'Разделы мониторинга')}
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-300">Глобальный порог уведомлений: ${esc(thr)}% <span class="ml-2 text-xs text-gray-500">(применяется ко всем отслеживаемым акциям)</span></p>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">До следующего подсчёта сигналов: <span id="watch-countdown">${formatDuration(secondsToNextSignal())}</span></p>
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-800 dark:border-gray-700 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold">Согласованность мониторинга и брокера</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">Статус синхронизации виртуальной позиции мониторинга и реального брокерского журнала.</p>
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
        ${state.watchTab === 'watches' ? `<form id="watch-form" class="flex flex-wrap items-center gap-2 mb-4"><input name="symbol" placeholder="AAPL" class="field min-w-0 flex-1" /><button class="btn-primary min-h-0 py-2">Добавить</button>
          <button type="button" id="watch-t11" class="btn-secondary min-h-0 py-2">Тест T-11</button>
          <button type="button" id="watch-t1" class="btn-secondary min-h-0 py-2">Тест T-1</button>
          <button type="button" id="watch-prices" class="btn-secondary min-h-0 py-2">Обновить цены и позиции</button></form>
          <div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Вход, IBS &lt;</th><th>Выход, IBS &gt;</th><th>Цена входа</th><th>Позиция</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-gray-500">Нет активных наблюдений. Добавьте тикер в форму выше.</td></tr>'}</tbody></table></div>
          <p class="text-xs text-gray-500 mt-2">Пороги в строке задаются для тикера и перекрывают значения по умолчанию из настроек автоторговли.</p>` : ''}
        ${state.watchTab === 'trades' ? `${(() => {
            const open = visibleMonitorTrades(simulated, false).find((t) => t.status === 'open');
            const watchSyms = (state.watches || []).map((w) => w.symbol);
            const hasOpen = !!open;
            return `${open ? `<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-3 dark:bg-emerald-950/20"><div class="font-semibold">Текущая позиция: ${esc(open.symbol)}</div><div class="text-sm">Вход ${esc(fmtTradingDate(open.entryDate))} по ${open.entryPrice == null ? '—' : fmtUsd(open.entryPrice, 2)}${open.entryIBS != null ? ', IBS ' + fmt(ibsPct(open.entryIBS), 1) + '%' : ''}</div><div class="mt-2 flex gap-1">${actionIcon('edit', 'Изменить сделку', `data-edit-mon="${esc(open.id)}"`, 'action-icon-edit')}${actionIcon('x', 'Закрыть сделку', `data-close-mon="${esc(open.id)}" data-close-sym="${esc(open.symbol)}"`, 'action-icon-danger')}</div></div>` : ''}
          <div class="rounded-lg border p-4 mb-3 bg-white dark:bg-gray-800"><h3 class="font-semibold mb-1">Ручная корректировка сделки мониторинга</h3>
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
          <div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>EMA</th><th>Диапазон</th><th>Ждём</th><th>Действия</th></tr></thead><tbody>${alerts || '<tr><td colspan="5" class="text-center text-gray-500">EMA-оповещений пока нет</td></tr>'}</tbody></table></div>` : ''}
      </div>`;
  }

  function unwrapAutoConfig(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (Array.isArray(payload.capitalModes) && payload.capitalModes.length) {
      state.capitalModes = payload.capitalModes;
    }
    if (payload.minEntryReservePct != null && Number.isFinite(Number(payload.minEntryReservePct))) {
      state.minEntryReservePct = Number(payload.minEntryReservePct);
    }
    if (payload.effectiveReservePct != null && Number.isFinite(Number(payload.effectiveReservePct))) {
      state.effectiveReservePct = Number(payload.effectiveReservePct);
    }
    if (payload.config && typeof payload.config === 'object') return payload.config;
    return payload;
  }
  function effectiveReservePct() {
    return Number(state.effectiveReservePct) || 0.005;
  }
  function capitalModeLabel(mode) {
    if (!mode) return '';
    if (CAPITAL_MODE_LABELS[mode.value]) return CAPITAL_MODE_LABELS[mode.value];
    const pct = Math.round((Number(mode.multiplier) || 1) * 100);
    return pct + '%';
  }
  function capitalModeHint(mode, cfg) {
    if (!mode) return '';
    const mult = Number(mode.multiplier) || 1;
    const pct = Math.round(mult * 100);
    const reserve = (effectiveReservePct(mode, cfg) * 100).toFixed(2);
    if (mode.value === 'standard_safe') {
      return pct + '% капитала с запасом ' + reserve + '% под рыночную заявку';
    }
    if (mult === 1) {
      return pct + '% капитала, резерв ' + reserve + '%';
    }
    return pct + '% базового капитала, резерв ' + reserve + '%';
  }
  function capitalModeByValue(value) {
    const modes = Array.isArray(state.capitalModes) ? state.capitalModes : [];
    const want = value || 'standard_safe';
    return modes.find((m) => m.value === want) || modes[0] || { value: want, multiplier: 1, reservePct: 0 };
  }
  function emptyBrokerTable(cols, empty) {
    return `<div class="overflow-auto"><table class="trades"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody><tr><td colspan="${cols.length}" class="text-center text-gray-500">${empty}</td></tr></tbody></table></div>`;
  }
