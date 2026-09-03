const API = {
  async req(path, opts = {}) {
    const r = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!r.ok) {
      const err = new Error((data && data.error) || r.statusText);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get: (p) => API.req(p),
  post: (p, body) => API.req(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (p, body) => API.req(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  patch: (p, body) => API.req(p, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  del: (p) => API.req(p, { method: 'DELETE' }),
  status: () => API.get('/api/status'),
  authCheck: () => API.get('/api/auth/check'),
  login: (username, password, remember) => API.post('/api/login', { username, password, remember }),
  logout: () => API.post('/api/logout'),
  datasets: () => API.get('/api/datasets'),
  dataset: (id) => API.get('/api/datasets/' + encodeURIComponent(id)),
  saveDataset: (payload) => API.post('/api/datasets', payload),
  deleteDataset: (id) => API.del('/api/datasets/' + encodeURIComponent(id)),
  refreshDataset: (id) => API.post('/api/datasets/' + encodeURIComponent(id) + '/refresh'),
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
  deleteEmaAlert: (id) => API.del('/api/telegram/ema-alerts/' + encodeURIComponent(id)),
  telegramTest: (message) => API.post('/api/telegram/test', { message }),
  testProvider: (provider) => API.post('/api/test-provider', { provider }),
  syncCalendar: () => API.post('/api/trading-calendar/import-webull', {}),
  webullSplits: (q) => API.get('/api/splits/webull-raw?' + q),
  calc: (name, body) => API.post('/api/calc/' + name, body),
  quote: (symbol, provider) => API.get('/api/quote/' + encodeURIComponent(symbol) + '?provider=' + encodeURIComponent(provider || 'finnhub')),
};
