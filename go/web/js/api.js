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
  settings: () => API.get('/api/settings'),
  saveSettings: (body) => API.patch('/api/settings', body),
  calendar: () => API.get('/api/trading-calendar'),
  splits: () => API.get('/api/splits'),
  tickerSplits: (s) => API.get('/api/splits/' + encodeURIComponent(s)),
  putSplits: (s, events) => API.put('/api/splits/' + encodeURIComponent(s), events),
  watches: () => API.get('/api/telegram/watches'),
  addWatch: (body) => API.post('/api/telegram/watch', body),
  deleteWatch: (s) => API.del('/api/telegram/watch/' + encodeURIComponent(s)),
  trades: () => API.get('/api/trades'),
  brokerTrades: () => API.get('/api/broker-trades'),
  autoConfig: () => API.get('/api/autotrade/config'),
  calc: (name, body) => API.post('/api/calc/' + name, body),
};
