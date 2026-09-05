const API = {
  _onUnauthorized: null,
  _lastUnauthorizedAt: 0,
  onUnauthorized(fn) { API._onUnauthorized = fn; },
  async req(path, opts = {}) {
    const { skipAuth, headers, ...rest } = opts;
    const method = String(rest.method || 'GET').toUpperCase();
    const hdrs = { ...(headers || {}) };
    if (method !== 'GET' && method !== 'HEAD' && !hdrs['Content-Type'] && !hdrs['content-type']) {
      hdrs['Content-Type'] = 'application/json';
    }
    let r;
    try {
      r = await fetch(path, {
        credentials: 'include',
        headers: hdrs,
        ...rest,
      });
    } catch (netErr) {
      const err = new Error((netErr && netErr.message) || 'Сеть недоступна');
      err.status = 0;
      err.data = null;
      throw err;
    }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (r.status === 401 && !skipAuth && data && data.code === 'session_expired') {
      const now = Date.now();
      if (typeof API._onUnauthorized === 'function' && now - API._lastUnauthorizedAt > 800) {
        API._lastUnauthorizedAt = now;
        try { API._onUnauthorized(); } catch (_) { /* ignore */ }
      }
    }
    if (!r.ok) {
      const err = new Error((data && (data.error || data.message)) || r.statusText || ('HTTP ' + r.status));
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get: (p, opts) => API.req(p, opts),
  post: (p, body, opts) => API.req(p, { method: 'POST', body: JSON.stringify(body || {}), ...(opts || {}) }),
  put: (p, body, opts) => API.req(p, { method: 'PUT', body: JSON.stringify(body || {}), ...(opts || {}) }),
  patch: (p, body, opts) => API.req(p, { method: 'PATCH', body: JSON.stringify(body || {}), ...(opts || {}) }),
  del: (p, opts) => API.req(p, { method: 'DELETE', ...(opts || {}) }),
  status: () => API.get('/api/status'),
  authCheck: () => API.get('/api/auth/check', { skipAuth: true }),
  login: (username, password, remember) => API.post('/api/login', { username, password, remember }, { skipAuth: true }),
  logout: () => API.post('/api/logout', {}, { skipAuth: true }),
  datasets: () => API.get('/api/datasets'),
  dataset: (id) => API.get('/api/datasets/' + encodeURIComponent(id)),
  saveDataset: (payload) => API.post('/api/datasets', payload),
  deleteDataset: (id) => API.del('/api/datasets/' + encodeURIComponent(id)),
  refreshDataset: (id, provider) => {
    const q = provider ? ('?provider=' + encodeURIComponent(provider)) : '';
    return API.post('/api/datasets/' + encodeURIComponent(id) + '/refresh' + q);
  },
  applyDatasetSplits: (id) => API.post('/api/datasets/' + encodeURIComponent(id) + '/apply-splits'),
  patchDatasetMeta: (id, body) => API.patch('/api/datasets/' + encodeURIComponent(id) + '/metadata', body),
  settings: () => API.get('/api/settings'),
  saveSettings: (body) => API.patch('/api/settings', body),
  calendar: () => API.get('/api/trading-calendar'),
  patchCalendarDay: (body) => API.patch('/api/trading-calendar/day', body),
  splits: () => API.get('/api/splits'),
  tickerSplits: (s) => API.get('/api/splits/' + encodeURIComponent(s)),
  putSplits: (s, events) => API.put('/api/splits/' + encodeURIComponent(s), events),
  deleteSplit: (s, date) => API.del('/api/splits/' + encodeURIComponent(s) + '/' + encodeURIComponent(date)),
  watches: () => API.get('/api/telegram/watches'),
  addWatch: (body) => API.post('/api/telegram/watch', body),
  patchWatch: (s, body) => API.patch('/api/telegram/watch/' + encodeURIComponent(s), body),
  deleteWatch: (s) => API.del('/api/telegram/watch/' + encodeURIComponent(s)),
  trades: () => API.get('/api/trades'),
  monitorTrades: () => API.get('/api/telegram/trades'),
  brokerTrades: () => API.get('/api/broker-trades'),
  autoConfig: () => API.get('/api/autotrade/config'),
  saveAutoConfig: (body) => API.patch('/api/autotrade/config', body),
  tokenStatus: () => API.get('/api/autotrade/webull/token/status'),
  tokenCreate: () => API.post('/api/autotrade/webull/token/create', {}),
  tokenCheck: (token) => API.post('/api/autotrade/webull/token/check', { token: token || '' }),
  saveToken: (token, expiresAt) => API.put('/api/autotrade/webull/token', { token, expiresAt: expiresAt || '' }),
  testBuy: (symbol, quantity) => API.post('/api/autotrade/webull/test-buy', { symbol: symbol || 'AAL', quantity: quantity || 1 }),
  closePosition: (symbol) => API.post('/api/autotrade/webull/close-position', { symbol }),
  closeMonitor: (id, body) => API.post('/api/trades/' + encodeURIComponent(id) + '/close-monitor', body || {}),
  simulate: (stage) => API.post('/api/telegram/simulate', { stage }),
  updateAll: () => API.post('/api/telegram/update-all', {}),
  consistency: () => API.get('/api/monitor/consistency'),
  dashboard: (refresh) => API.get('/api/autotrade/webull/dashboard' + (refresh ? '?refresh=1' : '')),
  reconcile: (mode) => API.post('/api/monitor/reconcile', { mode: mode || 'apply' }),
  webullBatch: (symbols) => API.get('/api/quotes/webull-batch?symbols=' + encodeURIComponent((symbols || []).join(','))),
  patchBrokerTrade: (id, body) => API.patch('/api/broker-trades/' + encodeURIComponent(id), body),
  patchTrade: (id, body) => API.patch('/api/trades/' + encodeURIComponent(id), body),
  account: () => API.get('/api/autotrade/webull/account'),
  autoStatus: () => API.get('/api/autotrade/status'),
  execute: () => API.post('/api/autotrade/execute', {}),
  logs: (limit) => API.get('/api/autotrade/logs' + (limit ? ('?limit=' + limit) : '')),
  emaAlerts: () => API.get('/api/telegram/ema-alerts'),
  addEmaAlert: (body) => API.post('/api/telegram/ema-alerts', body),
  updateEmaAlert: (id, body) => API.patch('/api/telegram/ema-alerts/' + encodeURIComponent(id), body),
  deleteEmaAlert: (id) => API.del('/api/telegram/ema-alerts/' + encodeURIComponent(id)),
  telegramTest: (message) => API.post('/api/telegram/test', { message }),
  testProvider: (provider) => API.post('/api/test-provider', { provider }),
  syncCalendar: () => API.post('/api/trading-calendar/import-webull', {}), // persist holidays/short days
  webullSplits: (q) => API.get('/api/splits/webull-raw?' + q),
  calc: (name, body) => API.post('/api/calc/' + name, body),
  quote: (symbol, provider) => API.get('/api/quote/' + encodeURIComponent(symbol) + '?provider=' + encodeURIComponent(provider || 'finnhub')),
  brokersHealth: () => API.get('/api/brokers/health'),
  rhStart: () => API.post('/api/autotrade/robinhood/oauth/start', {}),
  rhComplete: (callbackUrl) => API.post('/api/autotrade/robinhood/oauth/complete', { callbackUrl }),
  rhDisconnect: () => API.post('/api/autotrade/robinhood/oauth/disconnect', {}),
  rhStatus: () => API.get('/api/autotrade/robinhood/oauth/status'),
  rhAccount: () => API.get('/api/autotrade/robinhood/account'),
  rhDashboard: (refresh) => API.get('/api/autotrade/robinhood/dashboard' + (refresh ? '?refresh=1' : '')),
  rhTools: () => API.get('/api/autotrade/robinhood/tools'),
  rhClose: (symbol) => API.post('/api/autotrade/robinhood/close-position', { symbol }),
  rhTestBuy: (symbol, quantity) => API.post('/api/autotrade/robinhood/test-buy', { symbol: symbol || 'AAL', quantity: quantity || 1 }),
  resolveTracker: (clientOrderId, body) => API.post('/api/autotrade/trackers/' + encodeURIComponent(clientOrderId) + '/resolve', body || {}),
  clearTrackerPersistBlock: (broker, note) => API.post('/api/autotrade/trackers/persist-block/' + encodeURIComponent(broker) + '/resolve', { note: note || '' }),
};
