  function pageBroker() {
    const kind = state.page === '/robinhood' ? 'robinhood' : 'webull';
    const tabs = kind === 'robinhood' ? BROKER_TABS : BROKER_TABS.filter((t) => t.id !== 'connect');
    const tab = (state.brokerTab && state.brokerTab[kind]) || 'overview';
    const dash = (state.dashboard && state.dashboard.broker === kind) ? state.dashboard : null;
    const health = (state.brokerHealth || []).find((h) => h.broker === kind) || {};
    const ac = state.autoConfig || {};
    const autoOn = !!ac.enabled;
    const tradeOn = brokerFlag(ac, kind, 'enabled');
    const entriesOn = brokerFlag(ac, kind, 'allowNewEntries');
    const exitsOn = brokerFlag(ac, kind, 'allowExits');
    const autoCls = autoOn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
    const tradeCls = tradeOn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
    const connCls = health.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : (health.status === 'EXPIRING_SOON' ? 'bg-amber-100 text-amber-800' : (health.status ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'));
    const connectionNotice = health.status && health.status !== 'OK' ? `<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div><div class="font-semibold">${esc(brokerLabel(kind))}: ${esc(brokerHealthText(health) || 'подключение недоступно')}</div><div class="mt-1">Данные брокера сейчас недоступны. Технические детали находятся в раскрывающихся блоках ниже.</div></div>
      ${kind === 'robinhood' ? '<button type="button" data-btab="connect" class="btn-secondary min-h-0 py-2">Подключить Robinhood</button>' : '<a href="/settings" data-nav data-settings-tab="autotrade" class="btn-secondary min-h-0 py-2">Открыть настройки</a>'}
    </div>` : '';
    let body = '';
    if ((tab === 'overview' || tab === 'positions' || tab === 'orders' || tab === 'fills') && !dash) {
      body = '<p class="text-sm text-gray-500">Загрузка…</p>';
    } else if (tab === 'connect') {
      const st = state.rhStatus || {};
      body = `<div class="space-y-3 max-w-xl">
        <p class="text-sm text-gray-600 dark:text-gray-300">Откройте ссылку в десктопном браузере, войдите в Robinhood, разрешите доступ. Браузер попробует открыть 127.0.0.1 и покажет ошибку — это нормально. Скопируйте адрес из адресной строки целиком и вставьте ниже.</p>
        <div class="flex flex-col gap-2 sm:flex-row"><input id="rh-auth-url" readonly class="field min-w-0 flex-1" value="${esc(st.authorizationUrl || state.rhAuthUrl || '')}" /><button type="button" id="rh-get-link" class="btn-primary min-h-0 py-2 sm:w-auto">Получить ссылку</button><button type="button" id="rh-copy-link" class="btn-secondary min-h-0 py-2 sm:w-auto">Копировать</button></div>
        <label class="block text-sm">Вставьте адрес после разрешения<input id="rh-callback" class="field mt-1 w-full" placeholder="http://127.0.0.1:53682/callback?code=..." /></label>
        <div class="flex gap-2"><button type="button" id="rh-connect" class="btn-primary min-h-0 py-2">Подключить</button><button type="button" id="rh-disconnect" class="btn-secondary min-h-0 py-2">Отключить</button></div>
        <p class="text-sm text-gray-500">Статус: ${esc(brokerHealthText(st) || (st.connected ? 'подключено' : 'не подключено'))}${st.expiresAt ? ' · истекает ' + esc(formatDateTimeET(st.expiresAt)) : ''}</p>
      </div>`;
    } else if (tab === 'journal') {
      // Одна строка — одна позиция: блок сигнала, затем что сделал каждый
      // брокер. Тестовые покупки — реальные ордера, но не сделки стратегии,
      // поэтому в журнал стратегии они попадают только под «показать скрытые».
      const shown = (state.broker || []).filter((t) => state.brokerShowHidden || (!t.isHidden && !t.isTest));
      const legCell = (leg) => {
        if (!leg || (!(leg.qty > 0) && !leg.entryOrderId)) return '<td class="text-gray-400">—</td><td class="text-gray-400">—</td>';
        const qty = leg.qty > 0 ? fmt(leg.qty, 0) : '0';
        const prices = `${leg.entryPrice == null ? '—' : fmtUsd(leg.entryPrice, 2)} – ${leg.exitPrice == null ? '—' : fmtUsd(leg.exitPrice, 2)}`;
        return `<td>${esc(qty)}</td><td class="text-xs">${prices}</td>`;
      };
      const jrows = shown.map((t) => `<tr class="${t.isHidden ? 'opacity-50' : ''}">
        <td class="font-mono">${esc(t.symbol || '—')}</td>
        <td>${esc(tradeSourceText(t.source))}${t.isTest ? ' · тест' : ''}</td>
        <td>${esc(t.status === 'open' ? 'открыта' : 'закрыта')}</td>
        <td>${esc(fmtTradingDate(t.entryDate))}</td>
        <td>${esc(fmtTradingDate(t.exitDate))}</td>
        <td>${t.entryPrice == null ? '—' : fmtUsd(t.entryPrice, 2)} – ${t.exitPrice == null ? '—' : fmtUsd(t.exitPrice, 2)}</td>
        <td>${t.quantity == null ? '—' : fmt(t.quantity, 0)}</td>
        <td class="${pnlClass(t.pnlAbsolute)}">${t.pnlAbsolute == null ? '—' : fmtUsd(t.pnlAbsolute)}</td>
        <td class="${pnlClass(t.pnlPercent)}">${t.pnlPercent == null ? '—' : fmt(t.pnlPercent, 2) + '%'}</td>
        <td>${t.entryIBS == null ? '—' : fmt(Number(t.entryIBS) <= 1.5 ? Number(t.entryIBS) * 100 : Number(t.entryIBS), 1) + '%'} – ${t.exitIBS == null ? '—' : fmt(Number(t.exitIBS) <= 1.5 ? Number(t.exitIBS) * 100 : Number(t.exitIBS), 1) + '%'}</td>
        <td>${esc(t.holdingDays ?? '')}</td>
        ${legCell(t.webull)}
        ${legCell(t.robinhood)}
        <td class="text-xs">${esc(t.notes || '')}</td>
        <td>${actionIcon('edit', 'Изменить позицию', `data-edit-bt="${esc(t.id)}"`, 'action-icon-edit')}${actionIcon(t.isHidden ? 'eye' : 'eyeoff', t.isHidden ? 'Показать позицию' : 'Скрыть позицию', `data-hide-bt="${esc(t.id)}"`, 'action-icon-edit')}${actionIcon('trash', 'Удалить позицию', `data-bd="${esc(t.id)}"`, 'action-icon-danger')}</td>
      </tr>`).join('');
      body = `<div class="flex flex-wrap gap-2 mb-3">
        <button type="button" id="broker-journal-refresh" class="btn-secondary min-h-0 py-2">Обновить</button>
        <button type="button" id="broker-show-hidden" class="btn-secondary min-h-0 py-2">${state.brokerShowHidden ? 'Только стратегия' : 'Показать скрытые и тестовые'}</button>
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
      ${jrows ? `<div class="overflow-auto"><table class="trades"><thead>
        <tr><th colspan="11">Позиция</th><th colspan="2">Webull</th><th colspan="2">Robinhood</th><th colspan="2"></th></tr>
        <tr><th>Тикер</th><th>Источник</th><th>Статус</th><th>Дата входа</th><th>Дата выхода</th><th>Цена покупки / продажи</th><th>Кол-во</th><th>PnL, $</th><th>PnL, %</th><th>IBS вход / выход</th><th>Дней</th>
        <th>Кол-во</th><th>Цена вх. / вых.</th><th>Кол-во</th><th>Цена вх. / вых.</th><th>Заметки</th><th>Действия</th></tr>
      </thead><tbody>${jrows}</tbody></table></div>` : '<p class="text-sm text-gray-500">Позиций нет</p>'}`;
    } else if (tab === 'overview') {
      const bal = extractBalanceSummary(state.dashboard);
      if (bal.unrealizedPnl == null) {
        // Robinhood's portfolio snapshot carries no aggregate PnL - sum the positions.
        const nums = normalizePositions(dashboardPositions(state.dashboard)).map((p) => toNum(p.unrealizedPnl)).filter((n) => n != null);
        if (nums.length) bal.unrealizedPnl = nums.reduce((a, b) => a + b, 0);
      }
      const err = state.dashboard && (state.dashboard.error || (Array.isArray(state.dashboard.errors) && state.dashboard.errors[0]));
      body = `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Всего активов</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.totalAssets)}</div><div class="text-xs text-gray-400 mt-1">Валюта: ${esc(bal.currency || 'USD')}</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Свободные деньги</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.cashBalance)}</div><div class="text-xs text-gray-400 mt-1">Наличные / расчётные средства</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Покупательная способность</div><div class="text-xl font-semibold mt-1">${fmtUsd(bal.buyingPower)}</div><div class="text-xs text-gray-400 mt-1">${bal.accountType ? ('Тип счёта: ' + esc(accountTypeText(bal.accountType))) : 'Доступно для покупок'}</div></div>
        <div class="rounded-lg border p-4"><div class="text-xs text-gray-500">Нереализованный PnL</div><div class="text-xl font-semibold mt-1 ${pnlClass(bal.unrealizedPnl)}">${fmtUsd(bal.unrealizedPnl)}</div><div class="text-xs text-gray-400 mt-1">${bal.fetchedAt ? ('Обновлено ' + esc(formatDateTimeET(bal.fetchedAt))) : ''}</div></div>
      </div>${err ? `<p class="mt-3 text-sm text-amber-700">${esc(typeof err === 'string' ? err : (err.message || JSON.stringify(err)))}</p>` : ''}
      ${rawJsonBlock('Исходные данные баланса', state.dashboard && state.dashboard.balance)}
      ${rawJsonBlock('Исходные данные счёта', state.dashboard && state.dashboard.account)}`;
    } else if (tab === 'positions') {
      const pos = normalizePositions(dashboardPositions(state.dashboard));
      // Пустая таблица позиций одинаково выглядит и когда позиций правда нет,
      // и когда в конфиге указан не тот счёт, и когда чтение позиций упало
      // (Webull отвечает 429 на пачку запросов панели). Счета и ошибка чтения
      // приходят от сервера, так что это видно.
      const dashObj = asObject(state.dashboard) || {};
      const cfgAccount = dashObj.configuredAccountId == null ? '' : String(dashObj.configuredAccountId);
      const accountIds = asRows(dashObj.accounts).map((a) => String(firstDefined(a, ['account_id', 'accountId', 'account_number']) ?? ''));
      const posError = dashObj.positionsError == null ? '' : String(dashObj.positionsError);
      const accountNotice = posError
        ? `<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">Позиции не прочитаны: ${esc(posError)}. Пустая таблица ниже не означает, что позиций нет — обновите страницу.</div>`
        : cfgAccount && accountIds.length && !accountIds.includes(cfgAccount)
        ? `<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Настроенный счёт <span class="font-mono">${esc(cfgAccount)}</span> не найден среди счетов Webull (${esc(accountIds.join(', '))}). Позиции читаются по настроенному счёту, поэтому таблица пуста. Исправьте <span class="font-mono">WEBULL_ACCOUNT_ID</span>.</div>`
        : (dashObj.accountsError ? `<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Список счетов Webull не прочитан: ${esc(String(dashObj.accountsError))}</div>` : '');
      const posRows = pos.map((p) => `<tr>
        <td class="font-mono">${esc(p.symbol)}</td>
        <td>${esc(instrumentTypeText(p.instrumentType))}</td>
        <td>${esc(p.currency || '')}</td>
        <td>${p.quantity == null ? '—' : esc(p.quantity)}</td>
        <td>${p.avgPrice == null ? '—' : fmt(toNum(p.avgPrice))}</td>
        <td>${p.totalCost == null ? '—' : fmtUsd(p.totalCost)}</td>
        <td>${p.marketPrice == null ? '—' : fmt(toNum(p.marketPrice))}</td>
        <td>${p.marketValue == null ? '—' : fmtUsd(p.marketValue)}</td>
        <td class="${pnlClass(toNum(p.unrealizedPnl))}">${p.unrealizedPnl == null ? '—' : fmtUsd(p.unrealizedPnl)}</td>
        <td class="${pnlClass(toNum(p.unrealizedPnlRate))}">${formatRatioPercent(p.unrealizedPnlRate)}</td>
        <td>${formatRatioPercent(p.holdingProportion)}</td>
        <td>${p.symbol && p.symbol !== '—' ? actionIcon('x', 'Закрыть позицию', `data-close-pos="${esc(p.symbol)}"`, 'action-icon-danger') : ''}</td>
      </tr>`).join('');
      body = `${accountNotice}${posRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Тип</th><th>Валюта</th><th>Кол-во</th><th>Средняя цена</th><th>Себестоимость</th><th>Рыночная цена</th><th>Рыночная стоимость</th><th>Нереализ. PnL</th><th>PnL %</th><th>Доля</th><th>Действия</th></tr></thead><tbody>${posRows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Тип', 'Валюта', 'Кол-во', 'Средняя цена', 'Себестоимость', 'Рыночная цена', 'Рыночная стоимость', 'Нереализ. PnL', 'PnL %', 'Доля', 'Действия'], posError ? 'Позиции не прочитаны' : 'Открытых позиций нет')}
      ${rawJsonBlock('Исходные данные позиций', dashboardPositions(state.dashboard))}
      ${rawJsonBlock('Исходные данные счетов', state.dashboard && state.dashboard.accounts)}`;
    } else if (tab === 'orders') {
      const orders = normalizeOrders(state.dashboard && state.dashboard.openOrders);
      const orderRows = orders.map((o) => `<tr>
        <td class="font-mono">${esc(o.symbol)}</td><td>${esc(orderSideText(o.side))}</td><td>${esc(orderStatusText(o.status))}</td>
        <td>${o.quantity == null ? '—' : esc(o.quantity)}</td><td>${o.filledQuantity == null ? '—' : esc(o.filledQuantity)}</td>
        <td>${esc(orderTypeText(o.orderType))}</td><td>${esc(instrumentTypeText(o.instrumentType))}</td><td>${esc(comboTypeText(o.comboType))}</td>
        <td>${esc(entrustTypeText(o.entrustType))}</td><td>${esc(tifText(o.timeInForce))}</td><td>${esc(sessionText(o.tradingSession))}</td>
        <td>${o.limitPrice == null ? (o.avgPrice == null ? '—' : fmt(toNum(o.avgPrice))) : fmt(toNum(o.limitPrice))}</td>
        <td class="text-xs">${esc(o.orderId)}</td><td class="text-xs">${esc(o.clientOrderId)}</td>
        <td class="text-xs">${esc(formatDateTimeET(o.createdAt))}</td>
      </tr>`).join('');
      body = `${orderRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Направление</th><th>Статус</th><th>Кол-во</th><th>Исполнено</th><th>Тип</th><th>Инструмент</th><th>Комбинация</th><th>Поручение</th><th>Срок</th><th>Сессия</th><th>Цена</th><th>ID ордера</th><th>ID клиента</th><th>Создан</th></tr></thead><tbody>${orderRows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Направление', 'Статус', 'Кол-во', 'Исполнено', 'Тип', 'Инструмент', 'Комбинация', 'Поручение', 'Срок', 'Сессия', 'Цена', 'ID ордера', 'ID клиента', 'Создан'], 'Активных ордеров нет')}
      ${rawJsonBlock('Исходные данные открытых ордеров', state.dashboard && state.dashboard.openOrders)}`;
    } else if (tab === 'fills') {
      const fills = normalizeOrders(state.dashboard && state.dashboard.orderHistory);
      const fillRows = fills.map((o) => `<tr>
        <td class="text-xs">${esc(formatDateTimeET(o.filledAt || o.createdAt))}</td>
        <td class="font-mono">${esc(o.symbol)}</td><td>${esc(orderSideText(o.side))}</td><td>${esc(orderStatusText(o.status))}</td>
        <td>${o.filledQuantity == null ? '—' : esc(o.filledQuantity)}</td>
        <td>${o.quantity == null ? '—' : esc(o.quantity)}</td>
        <td>${esc(orderTypeText(o.orderType))}</td><td>${esc(instrumentTypeText(o.instrumentType))}</td><td>${esc(comboTypeText(o.comboType))}</td>
        <td>${esc(entrustTypeText(o.entrustType))}</td><td>${esc(tifText(o.timeInForce))}</td><td>${esc(sessionText(o.tradingSession))}</td>
        <td>${o.avgPrice == null ? '—' : fmt(toNum(o.avgPrice))}</td>
        <td class="text-xs">${esc(o.orderId)}</td><td class="text-xs">${esc(o.clientOrderId)}</td>
      </tr>`).join('');
      body = `${fillRows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Исполнено</th><th>Тикер</th><th>Направление</th><th>Статус</th><th>Кол-во</th><th>Кол-во в ордере</th><th>Тип</th><th>Инструмент</th><th>Комбинация</th><th>Поручение</th><th>Срок</th><th>Сессия</th><th>Средняя цена</th><th>ID ордера</th><th>ID клиента</th></tr></thead><tbody>${fillRows}</tbody></table></div>` : emptyBrokerTable(['Исполнено', 'Тикер', 'Направление', 'Статус', 'Кол-во', 'Кол-во в ордере', 'Тип', 'Инструмент', 'Комбинация', 'Поручение', 'Срок', 'Сессия', 'Средняя цена', 'ID ордера', 'ID клиента'], 'История ордеров пока не пришла')}
      ${rawJsonBlock('Исходные данные истории ордеров', state.dashboard && state.dashboard.orderHistory)}`;
    } else if (tab === 'autotrade') {
      const st = state.autoStatus || {};
      const last = (st.state && st.state.lastRunAt) || '—';
      const ac = state.autoConfig || {};
      const tok = state.token || {};
      const conn = (state.dashboard && state.dashboard.connection) || {};
      const pending = asRows(state.autoLogs && state.autoLogs.pending);
      const recent = asRows(state.autoLogs && state.autoLogs.recent);
      const seen = new Set();
      const tracked = pending.concat(recent).filter((o) => o.broker === kind).filter((o) => {
        const id = o.clientOrderId || o.startedAt || o.symbol;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 20);
      const stuckStatuses = ['execution_unknown', 'unresolved'];
      const pendingRows = tracked.map((o) => {
        const stuck = stuckStatuses.includes(o.status);
        const oid = esc(o.clientOrderId || '');
        const actions = stuck && o.clientOrderId
          ? `<button type="button" data-resolve-tracker="${oid}" data-resolve-outcome="filled" class="compact inline-flex min-w-0 min-h-0 px-1 py-1 text-xs text-emerald-600 mr-2">Исполнено у брокера</button><button type="button" data-resolve-tracker="${oid}" data-resolve-outcome="absent" class="compact inline-flex min-w-0 min-h-0 px-1 py-1 text-xs text-red-600">Заявки нет</button>`
          : '';
        return `<tr class="${stuck ? 'bg-amber-50 dark:bg-amber-950/30' : ''}"><td>${esc(o.symbol || '')}</td><td>${esc(brokerLabel(o.broker))}</td><td>${esc(orderSideText(o.action))}</td><td class="${stuck ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}">${esc(trackerStatusText(o.status))}</td><td>${esc(o.quantity ?? '')}</td><td>${esc(formatDateTimeET(o.startedAt || o.started_at || ''))}</td><td>${actions}</td></tr>`;
      }).join('');
      const persistBlocks = (state.settings && state.settings.trackerPersistFail) || {};
      const persistBlockedBrokers = Object.keys(persistBlocks).filter((b) => persistBlocks[b]);
      const persistBlockBanner = persistBlockedBrokers.length ? `<div class="mt-3 space-y-2">${persistBlockedBrokers.map((b) => `
        <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center justify-between gap-3">
          <span>Входы у брокера <b>${esc(brokerLabel(b))}</b> заблокированы: заявка ушла, но трекер не сохранился. Проверьте у брокера вручную, затем снимите блокировку.</span>
          <button type="button" data-clear-persist-block="${esc(b)}" class="btn-secondary min-h-0 py-1 whitespace-nowrap">Снять блокировку</button>
        </div>`).join('')}</div>` : '';
      const mode = capitalModeByValue(ac.entryCapitalMode);
      const lastPack = st.state && st.state.lastResult;
      // What this broker did in the last cycle. The monitoring's own decision
      // is not this broker's and is not shown as one (AUD-021).
      const lastRes = (lastPack && lastPack.brokerDecisions && lastPack.brokerDecisions[kind]) || {};
      // Broker-specific connection card: Webull uses a pasted API token,
      // Robinhood uses the copy-paste OAuth flow on the "Подключение" tab -
      // rendering the Webull token panel here on /robinhood was P2-3.
      const rhStatus = state.rhStatus || {};
      const connectionCard = kind === 'robinhood'
        ? `<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
              <div class="text-xs uppercase tracking-wide text-gray-500">Подключение (Robinhood)</div>
              <div class="mt-1 text-sm">${esc(brokerHealthText(rhStatus) || (rhStatus.connected ? 'подключено' : 'не подключено'))}${rhStatus.expiresAt ? ' · истекает ' + esc(formatDateTimeET(rhStatus.expiresAt) || rhStatus.expiresAt) : ''}</div>
              <p class="text-xs text-gray-500 mt-1">OAuth настраивается на вкладке «Подключение».</p>
            </div>`
        : `<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-950/40">
              <div class="text-xs uppercase tracking-wide text-gray-500">Подключение (Webull)</div>
              <div class="mt-1 text-sm">${conn.configured || tok.hasToken || tok.present ? 'Webull подключен' : 'Webull не настроен'}</div>
              <div class="mt-1 text-sm">Токен: ${tok.hasToken || tok.present ? 'есть' : 'не задан'} • источник: ${esc(tokenSourceText(tok.source))} • проверка: ${esc(brokerHealthText({ status: tok.lastCheckStatus }) || tok.lastCheckStatus || '—')}</div>
              <div class="text-xs text-gray-500 mt-1">истекает ${esc(formatDateTimeET(tok.expiresAt) || tok.expiresAt || '—')} · осталось: ${esc(tok.daysLeft != null ? tok.daysLeft + ' дн.' : '—')} · последняя проверка: ${esc(formatDateTimeET(tok.lastCheckAt))}</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button type="button" id="auto-token-check" class="btn-secondary min-h-0 py-2">Проверить токен</button>
                <button type="button" id="auto-token-create" class="btn-secondary min-h-0 py-2">Создать токен</button>
              </div>
              <div class="mt-2 flex gap-2">
                <input id="auto-token-input" type="password" autocomplete="off" placeholder="Вставьте токен Webull" class="field min-w-0 flex-1" />
                <button type="button" id="auto-token-save" class="btn-secondary min-h-0 py-2">Сохранить токен</button>
              </div>
            </div>`;
      body = `<div class="space-y-4">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-3">Состояние автоторговли — общее</h2>
          <div class="broker-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Статус</div><div class="mt-1 font-semibold">${ac.enabled ? 'Включена' : 'Выключена'}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Последний запуск</div><div class="mt-1 text-sm">${esc(formatDateTimeET(last) === '—' ? last : formatDateTimeET(last))}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Входы / выходы (${esc(brokerLabel(kind))})</div><div class="mt-1 text-sm">${brokerFlag(ac, kind, 'allowNewEntries') ? 'да' : 'нет'} / ${brokerFlag(ac, kind, 'allowExits') ? 'да' : 'нет'}</div></div>
            <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Последнее решение</div><div class="mt-1 text-sm">${esc(decisionActionText(lastRes.action))} ${esc(lastRes.symbol || '')}</div><div class="text-xs text-gray-500">${esc(decisionReasonText(lastRes.reason || ''))}</div></div>
          </div>
          <div class="mt-4 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-950/40">
            <div class="flex items-center justify-between gap-3 mb-2">
              <div class="font-medium">Настройки автоторговли</div>
              <a href="/settings" data-nav data-settings-tab="autotrade" class="btn-secondary min-h-0 py-2">Изменить</a>
            </div>
            <dl class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Размер входа</dt><dd>${esc(capitalModeLabel(mode))}, целые акции</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Пороги IBS</dt><dd>вход &lt; ${esc(liveLowIBS())} · выход &gt; ${esc(liveHighIBS())}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Котировки</dt><dd>${esc(ac.provider || 'finnhub')} → резерв автоматически</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Заявки</dt><dd>рыночные, DAY, основная сессия</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Окно исполнения</dt><dd>${esc(ac.executionWindowSeconds ?? 90)} сек до закрытия</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Порог проскальзывания</dt><dd>${esc(ac.maxSlippageBps ?? 25)} bps</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-gray-500">Резерв на вход</dt><dd>не меньше ${esc((effectiveReservePct(mode, ac) * 100).toFixed(2))}%</dd></div>
            </dl>
            <p class="text-xs text-gray-500 mt-2">${esc(capitalModeHint(mode, ac))}. Торгуются тикеры со страницы «Мониторинг».${ac.lastModifiedAt ? (' Обновлено: ' + esc(formatDateTimeET(ac.lastModifiedAt)) + ' ET') : ''}</p>
            <p class="text-xs text-gray-500 mt-2">Автоторговля только следует сигналам мониторинга на T-1: выход мониторинга продаёт у брокера всё, вход покупается только в пустой счёт. Порог проскальзывания — уже не только уведомление постфактум: перед расчётом количества акций из доступных средств вычитается резерв, равный максимуму из порога проскальзывания, настроенного резерва на вход и жёсткого минимума 0.5%. Заявка при этом остаётся рыночной и отправляется в любом случае — резерв защищает не саму заявку, а точность её размера.</p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" id="auto-enable" class="btn-primary min-h-0 py-2">${ac.enabled ? 'Выключить автоторговлю' : 'Включить автоторговлю'}</button>
            <button type="button" id="auto-refresh" class="btn-secondary min-h-0 py-2">Обновить статус</button>
          </div>
          ${rawJsonBlock('Исходные данные настроек автоторговли', ac)}
          ${rawJsonBlock('Исходные данные отслеживаемых ордеров', tracked)}
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-3">${esc(brokerLabel(kind))} — подключение и тестовая заявка</h2>
          <div class="broker-grid grid gap-3 md:grid-cols-2">
            ${connectionCard}
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" id="auto-test-buy" class="btn-secondary min-h-0 py-2">Купить AAL, 1 шт. по рынку (${esc(brokerLabel(kind))})</button>
          </div>
          <p class="mt-3 text-xs text-gray-500">Тестовая кнопка отправляет реальный ордер, если на сервере включён ${kind === 'robinhood' ? 'ROBINHOOD_ENABLE_LIVE_TEST_BUY' : 'WEBULL_ENABLE_LIVE_TEST_BUY'}.</p>
          ${rawJsonBlock('Исходные данные подключения', kind === 'robinhood' ? rhStatus : conn)}
          ${rawJsonBlock('Исходные данные панели', state.dashboard)}
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h3 class="font-semibold mb-2">Ожидающие и последние отслеживаемые ордера</h3>
          ${persistBlockBanner}
          ${pendingRows ? `<div class="overflow-auto mt-2"><table class="trades"><thead><tr><th>Тикер</th><th>Брокер</th><th>Операция</th><th>Статус</th><th>Кол-во</th><th>Старт</th><th>Действия</th></tr></thead><tbody>${pendingRows}</tbody></table></div>` : '<p class="text-sm text-gray-500 mt-2">Отслеживаемых ордеров пока нет</p>'}
          <p class="mt-2 text-xs text-gray-500">Заявки с неподтверждённым исполнением блокируют новые входы у брокера и требуют ручного разбора: проверьте заявку у брокера и нажмите «Исполнено у брокера» либо «Заявки нет».</p>
        </div>
      </div>`;
    } else if (tab === 'monitor') {
      const cons = state.consistency || {};
      const issues = Array.isArray(cons.issues) ? cons.issues : [];
      const actions = Array.isArray(cons.proposedActions) ? cons.proposedActions : [];
      const consLabel = issues.some((i) => i && i.autoFixable) ? 'Есть что починить' : (issues.length ? 'Замечания' : 'Согласовано');
      const wrows = (state.watches || []).map((w) => {
        const q = (state.brokerQuotes || {})[w.symbol] || {};
        const quote = q.quote || q;
        const rng = q.range || quote || {};
        const last = toNum(quote.current ?? quote.close ?? quote.last ?? rng.close);
        const high = toNum(rng.high ?? quote.high);
        const low = toNum(rng.low ?? quote.low);
        const prev = toNum(quote.prevClose ?? quote.previousClose ?? rng.prevClose);
        // Same rule as the engine (go/internal/live/telegram.go): require
        // high > low, then clamp to [0,1]. An extended-hours last price
        // outside the session range must not show the operator an IBS the
        // engine would never act on.
        const ibs = (high != null && low != null && last != null && high > low) ? Math.max(0, Math.min(1, (last - low) / (high - low))) : toNum(w.lastIbs ?? w.ibs);
        const delta = (last != null && prev != null && prev !== 0) ? ((last - prev) / prev) * 100 : null;
        const lo = Number(w.lowIBS ?? liveLowIBS());
        const hi = Number(w.highIBS ?? liveHighIBS());
        const ibsCls = ibs == null ? '' : (ibs < lo ? 'text-emerald-600' : (ibs > hi ? 'text-red-600' : ''));
        const openPx = toNum(quote.open ?? quote.o ?? rng.open ?? w.todayOpen);
        return `<tr>
          <td class="font-mono">${esc(w.symbol)}</td>
          <td>${openPx == null ? '—' : fmt(openPx)}</td>
          <td>${high == null ? '—' : fmt(high)}</td><td>${low == null ? '—' : fmt(low)}</td>
          <td>${last == null ? '—' : fmt(last)}</td>
          <td class="${ibsCls}">${ibs == null ? '—' : fmt(ibs, 3)}</td>
          <td>${prev == null ? '—' : fmt(prev)}</td>
          <td class="${pnlClass(delta)}">${delta == null ? '—' : fmt(delta, 2) + '%'}</td>
          <td>${w.entryPrice == null ? '—' : fmtUsd(w.entryPrice, 2)}</td>
          <td>${esc('< ' + Number(w.lowIBS ?? liveLowIBS()).toFixed(2))}</td>
          <td>${esc('> ' + Number(w.highIBS ?? liveHighIBS()).toFixed(2))}</td>
          <td>${w.isOpenPosition ? 'Открыта' : 'В мониторинге'}</td>
          <td class="text-xs">${esc(formatDateTimeET(q.dateKey || quote.updatedAt || ''))}</td>
          <td class="text-xs">${esc(q.provider || q.error || '')}</td>
          <td>${actionIcon('refresh', 'Обновить котировку', `data-bq="${esc(w.symbol)}"`, 'action-icon-edit')}</td>
        </tr>`;
      }).join('');
      body = `<div class="flex flex-wrap gap-2 mb-3">
          <button type="button" id="broker-reconcile" class="btn-primary min-h-0 py-2" aria-label="Сверить данные (Reconcile Candidate)">Сверить данные</button>
          <button type="button" id="broker-quotes-refresh" class="btn-secondary min-h-0 py-2">Обновить котировки</button>
        </div>
        <div class="grid gap-3 md:grid-cols-4 mb-3">
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Отслеживаемые</div><div class="text-lg font-semibold">${(state.watches || []).length}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Открытые позиции</div><div class="text-lg font-semibold">${(state.watches || []).filter((w) => w.isOpenPosition).length}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Согласованность</div><div class="text-lg font-semibold">${esc(consLabel)}</div></div>
          <div class="rounded-lg border p-3"><div class="text-xs text-gray-500">Обновлено</div><div class="text-sm">${esc(formatDateTimeET((state.dashboard && state.dashboard.fetchedAt) || ''))}</div></div>
        </div>
        ${issues.length ? issues.map((i) => `<div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-2">${esc(i.message || i.code)}</div>`).join('') : ''}
        ${wrows ? `<div class="overflow-auto"><table class="trades"><thead><tr><th>Тикер</th><th>Открытие</th><th>Макс.</th><th>Мин.</th><th>Цена</th><th>Текущий IBS</th><th>Пред. закрытие</th><th>Изменение</th><th>Вход</th><th>Вход, IBS &lt;</th><th>Выход, IBS &gt;</th><th>Позиция</th><th>Обновлено</th><th>Источник</th><th>Действия</th></tr></thead><tbody>${wrows}</tbody></table></div>` : emptyBrokerTable(['Тикер', 'Открытие', 'Макс.', 'Мин.', 'Цена', 'Текущий IBS', 'Пред. закрытие', 'Изменение', 'Вход', 'Вход, IBS &lt;', 'Выход, IBS &gt;', 'Позиция', 'Обновлено', 'Источник', 'Действия'], 'Нет отслеживаемых акций')}
        ${rawJsonBlock('Исходные данные мониторинга', { watches: state.watches, quotes: state.brokerQuotes, consistency: state.consistency })}`;
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
        const extra = [l.broker, l.symbol, l.action, l.status, l.client_order_id || l.clientOrderId, l.method, l.path, l.responseStatus, l.error].filter(Boolean).join(' • ');
        return `${ts} ${lvl} ${ev}${extra ? ' • ' + extra : ''}`.trim();
      }).join('\n');
      const monitor = lines(pack.monitor) || 'Логи мониторинга пока пусты';
      const auto = lines(pack.autotrade || pack.logs) || 'Логи автоторговли пока пусты';
      const raw = lines(pack.brokerRaw) || auto;
      body = `<div class="space-y-3">
        <div><h2 class="text-sm font-semibold mb-1">Логи мониторинга (${(pack.monitor || pack.logs || []).length})</h2><pre class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-52">${esc(monitor)}</pre></div>
        <div><h2 class="text-sm font-semibold mb-1">Логи автоторговли (все брокеры) (${(pack.autotrade || pack.logs || []).length})</h2><pre id="broker-logs" class="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-52">${esc(auto)}</pre></div>
        <details class="raw-json"><summary>Сырые данные брокера</summary><pre>${esc(raw)}</pre></details>
      </div>`;
    }
    return `
      ${pageHeader(kind === 'robinhood' ? 'Кабинет Robinhood' : 'Кабинет Webull', kind === 'robinhood' ? 'Баланс счёта, позиции, ордера и копи-паст авторизация Robinhood' : 'Баланс счёта, позиции, ордера, история и логи исполнения по Webull', `<div class="flex flex-wrap items-center gap-2"><span class="rounded-full px-3 py-1 text-xs font-semibold ${autoCls}">Автоторговля: ${autoOn ? 'включена' : 'выключена'}</span><span class="rounded-full px-3 py-1 text-xs font-semibold ${tradeCls}" title="входы ${entriesOn ? 'да' : 'нет'} · выходы ${exitsOn ? 'да' : 'нет'}">Торговля через ${esc(brokerLabel(kind))}: ${tradeOn ? 'вкл' : 'выкл'}</span><span class="rounded-full px-3 py-1 text-xs font-semibold ${connCls}">Подключение: ${esc(brokerHealthText(health) || '—')}</span><button id="broker-refresh" class="icon-btn icon-btn-md icon-btn-glass" title="Обновить" aria-label="Обновить">${icon('refresh', 'w-4 h-4')}</button></div>`, kind)}
      ${connectionNotice}
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        ${analysisTabs(tabs, tab, 'data-btab')}
        <div class="p-4">${body}</div>
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
          <div class="font-medium mb-1">Капитал</div>
          <label class="block text-sm">Стартовый капитал, $<input name="initialCapital" type="number" min="1" step="1" class="field mt-1" value="${esc(st.initialCapital ?? DEFAULT_INITIAL_CAPITAL)}" /></label>
          <p class="text-xs text-gray-500 mt-1">База для метрик мониторинга и бэктеста, если стратегия не задаёт своё значение.</p>
        </div>
        <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enablePostClosePriceActualization" ${st.enablePostClosePriceActualization ? 'checked' : ''} /> Автоактуализация цен после закрытия рынка</label>`;
    } else if (tab === 'api') {
      body = `<div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Тестирование API</div>
          <p class="text-xs text-gray-500 mb-3">Проверьте подключение к API провайдерам (используется тестовый символ AAPL)</p>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">${['alpha_vantage', 'finnhub', 'twelve_data', 'polygon', 'webull'].map((p) => `<button type="button" data-testprov="${p}" class="btn-primary min-h-0 py-2 text-sm">Тест ${esc(providerLabel(p))}</button>`).join('')}</div>
          <p class="text-xs text-gray-500 mt-3">Polygon: ${st.polygonApiKeyConfigured ? 'ключ задан' : 'ключ не задан'}. Ключ живёт в серверном <code>.env</code> (<code>POLYGON_API_KEY</code>), поле ввода здесь не нужно.</p>
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
          <div class="flex gap-2"><input id="tg-test-msg" class="field min-w-0 flex-1" value="Тестовое сообщение" /><button type="button" id="tg-test-send" class="btn-primary min-h-0 py-2">Отправить тест</button></div>
          <div id="tg-test-out" class="text-sm mt-2"></div>
        </div>`;
    } else if (tab === 'interface') {
      const chips = (state.analysisTabsConfig || []).map((t) => `<button type="button" data-vis="${esc(t.id)}" class="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm border-b-2 ${t.visible ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 line-through'}">${esc(t.label)}</button>`).join('');
      body = `<p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Тема переключается иконкой в шапке: Авто → Тёмная → Светлая.</p>
        <div class="rounded-xl border overflow-hidden">
          <div class="px-4 pt-4 pb-2"><div class="text-sm font-semibold">Вкладки страницы «Акции»</div>
          <div class="text-xs text-gray-500">Нажмите, чтобы скрыть или показать</div></div>
          <div class="scroll-cue-shell border-t"><div class="scroll-cue flex overflow-x-auto">${chips}</div></div>
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
          ${[['webull','Webull'],['robinhood','Robinhood']].map(([id, label]) => {
            const h = (state.brokerHealth || []).find((x) => x.broker === id) || {};
            return `<div class="rounded-lg border p-3 mb-2">
              <div class="font-medium mb-2 flex items-center gap-2">${icon(id, 'w-4 h-4')}<span>${label} <span class="text-xs font-normal text-gray-500">${esc(brokerHealthText(h) || '')}</span></span></div>
              <label class="inline-flex items-center gap-2 text-sm mr-3"><input type="checkbox" name="${id}Enabled" ${brokerFlag(ac, id, 'enabled') ? 'checked' : ''} /> разрешено торговать</label>
              <label class="inline-flex items-center gap-2 text-sm mr-3"><input type="checkbox" name="${id}AllowEntries" ${brokerFlag(ac, id, 'allowNewEntries') ? 'checked' : ''} /> Разрешить входы</label>
              <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="${id}AllowExits" ${brokerFlag(ac, id, 'allowExits') ? 'checked' : ''} /> Разрешить выходы</label>
              ${id === 'robinhood' ? '<p class="text-xs text-gray-500 mt-1">На Agentic-счёте нет маржинального плеча: режимы 125–200% срежутся покупательской способностью.</p>' : ''}
            </div>`;
          }).join('')}
          <p class="text-xs text-gray-500 mt-1">Тормоз на случай, когда нужно свернуть торговлю: снимите «входы», и открытая позиция будет доторгована до выхода, но новых сделок не появится. Снимать «выходы» стоит только осознанно — позиция останется висеть.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Сколько покупать</div>
          <p class="text-xs text-gray-500 mb-2">Всегда покупается на весь счёт — вопрос только в том, сколько это «весь счёт». Размер в любом случае ограничен реальной покупательной способностью у брокера.</p>
          ${(state.capitalModes || []).map((m) => `<label class="flex items-start gap-2 text-sm mb-2"><input type="radio" name="entryCapitalMode" value="${esc(m.value)}" ${cap === m.value ? 'checked' : ''} class="mt-1" /><span><strong>${esc(capitalModeLabel(m))}</strong><br /><span class="text-xs text-gray-500">${esc(capitalModeHint(m, ac))}</span></span></label>`).join('')}
          <p class="text-xs text-gray-500 mt-2">Покупается всегда целое число акций: остаток меньше цены одной акции остаётся на счёте до следующего входа. Продаётся при выходе вся позиция целиком, включая дробный остаток, если его оставил сплит.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Пороги IBS по умолчанию</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm">Вход, IBS ниже<input name="autoLowIBS" type="number" step="0.01" min="0" max="1" required value="${esc(ac.lowIBS ?? liveLowIBS())}" class="field mt-1" /></label>
            <label class="text-sm">Выход, IBS выше<input name="autoHighIBS" type="number" step="0.01" min="0" max="1" required value="${esc(ac.highIBS ?? liveHighIBS())}" class="field mt-1" /></label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Сравнение строгое с обеих сторон: ровно 0.10 — это не вход. У каждого тикера на странице «Мониторинг» есть собственные пороги, и они важнее этих: здесь задаётся только значение по умолчанию.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Откуда берутся цены</div>
          <label class="inline-flex items-center gap-2 text-sm mr-4"><input type="radio" name="autoQuote" value="finnhub" ${quote === 'finnhub' ? 'checked' : ''} /> Finnhub</label>
          <label class="inline-flex items-center gap-2 text-sm mr-4"><input type="radio" name="autoQuote" value="webull" ${quote === 'webull' ? 'checked' : ''} /> Webull</label>
          <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="autoQuote" value="robinhood" ${quote === 'robinhood' ? 'checked' : ''} /> Robinhood</label>
          <p class="text-xs text-gray-500 mt-1">Это тот, кого спрашивают первым. Если он не ответил или прислал негодную котировку, следующий в цепочке (Finnhub → Webull → Robinhood) спрашивается автоматически — настраивать порядок не нужно. Провайдеры с дневными барами (Alpha Vantage, Twelve Data, Polygon) для живого решения не используются: они ответят вчерашней свечой.</p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Что торгуем</div>
          <p class="text-sm">${watched ? esc(watched) : 'Список пуст'}</p>
          <p class="text-xs text-gray-500 mt-1">Ровно то, что стоит на странице «Мониторинг», — отдельного списка здесь нет специально, чтобы тикер не мог отслеживаться и молча не торговаться. <a href="/watches" data-nav class="text-indigo-600">Изменить список</a></p>
        </div>
        <div class="rounded-xl border p-4 mb-3">
          <div class="font-medium mb-2">Защита</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm">Окно исполнения, сек<input name="autoWindow" type="number" min="15" step="1" required value="${esc(ac.executionWindowSeconds ?? 90)}" class="field mt-1" /></label>
            <label class="text-sm">Порог проскальзывания, bps<input name="autoSlippage" type="number" min="0" max="1000" step="1" required value="${esc(ac.maxSlippageBps ?? 25)}" class="field mt-1" /></label>
            <label class="text-sm">Резерв на вход, %<input name="autoEntryReserve" type="number" min="0.5" max="10" step="0.1" required title="От 0.5% до 10%" value="${esc(((ac.entryReservePct ?? 0.005) * 100).toFixed(2))}" class="field mt-1" /></label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Окно исполнения сейчас ни на что не влияет: кнопки «Исполнить» больше нет, заявки уходят только в цикле T-1 вслед за мониторингом.</p>
          <p class="text-xs text-gray-500 mt-1">Проскальзывание больше не только предупреждает: заявку оно не ограничивает (она рыночная и должна исполниться), но перед расчётом количества акций из доступных средств вычитается резерв — не меньше 0.5%, не меньше выставленного здесь значения и не меньше самого порога проскальзывания (25 bps = 0.25% резерва). Так количество акций считается не впритык к покупательной способности: движение цены между котировкой на T-1 и фактическим исполнением не даст брокеру отклонить заявку по нехватке средств.</p>
        </div>
        <p class="text-sm text-gray-600">Состояние брокеров — на страницах <a href="/webull" data-nav class="text-indigo-600">Webull</a> и <a href="/robinhood" data-nav class="text-indigo-600">Robinhood</a>.</p>`;
    }
    return `
      ${pageHeader('Настройки', 'Конфигурация приложения и параметры стратегии', `<button form="set-form" class="btn-primary min-h-0 py-2 px-4">Сохранить</button>`)}
      ${analysisTabs(SETTINGS_TABS, tab, 'data-setab')}
      <form id="set-form" class="mt-4 space-y-3 max-w-3xl">
        ${body}
        <div id="set-msg" class="text-sm"></div>
      </form>
      <div class="mt-8 max-w-3xl rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <div class="font-medium mb-1">Аккаунт</div>
        <p class="text-xs text-gray-500 mb-3">Выйти из сессии на этом устройстве.</p>
        <button type="button" id="logout-btn" class="btn-secondary min-h-0 py-2 px-4">Выйти</button>
      </div>`;
  }

