// One-off migration: extract splits from dataset files into centralized splits.json
// Usage (inside container): node server/migrate-splits.js
const fs = require('fs-extra');
const path = require('path');

async function main() {
  const rootDir = __dirname;
  const datasetsDir = path.join(rootDir, 'datasets');
  const splitsPath = path.join(rootDir, 'splits.json');

  function toTicker(v) {
    return String(v || '')
      .replace(/[^A-Za-z0-9._-]/g, '')
      .toUpperCase();
  }
  function normalize(events) {
    const list = Array.isArray(events) ? events : [];
    const valid = list
      .filter(e => e && typeof e.date === 'string' && e.date.length >= 10 && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0)
      .map(e => ({ date: e.date.slice(0, 10), factor: Number(e.factor) }))
      .filter(e => e.factor !== 1);
    const byDate = new Map();
    for (const e of valid) byDate.set(e.date, e);
    return Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  await fs.ensureDir(datasetsDir);
  let map = {};
  try { map = await fs.readJson(splitsPath); } catch { map = {}; }
  if (typeof map !== 'object' || !map) map = {};

  const files = (await fs.readdir(datasetsDir))
    .filter(f => f.endsWith('.json') && !f.startsWith('._'));

  const summary = [];
  for (const f of files) {
    const fp = path.join(datasetsDir, f);
    let json;
    try { json = await fs.readJson(fp); } catch { continue; }
    const ticker = toTicker(json && json.ticker ? json.ticker : path.basename(f, '.json').split('_')[0]);
    if (!ticker) continue;
    const incoming = normalize(json && json.splits);
    if (incoming.length === 0) {
      // If no splits inside file, nothing to import
      continue;
    }
    const existing = normalize(map[ticker] || []);
    const byDate = new Map();
    for (const e of existing) byDate.set(e.date, e);
    for (const e of incoming) byDate.set(e.date, e);
    const merged = Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    map[ticker] = merged;
    // Remove in-file splits to avoid duplication going forward
    try {
      delete json.splits;
      await fs.writeJson(fp, json, { spaces: 2 });
    } catch {}
    summary.push({ ticker, added: incoming.length, total: merged.length, file: f });
  }

  await fs.writeJson(splitsPath, map, { spaces: 2 });
  console.log(JSON.stringify({ ok: true, tickers: Object.keys(map).length, summary }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });


