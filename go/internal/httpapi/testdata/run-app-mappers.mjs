import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, '../../../web/js/app.js');
const fixturePath = path.join(here, 'webull-nested-dashboard.json');
const src = fs.readFileSync(appPath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function extractFunction(name) {
  const needle = 'function ' + name + '(';
  const i = src.indexOf(needle);
  if (i < 0) throw new Error('shipped app.js missing ' + name);
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const names = [
  'toNum', 'fmt', 'fmtUsd', 'asObject', 'firstDefined', 'asRows',
  'formatRatioPercent', 'extractBalanceSummary', 'normalizePositions',
  'normalizeMonitorMarginPercent', 'applyMonitorMarginSimulation',
  'esc', 'pnlClass', 'tradeTicker', 'tradesTable', 'brokerFlag', 'brokerFlagsPatch',
];
const consts = [];
if (src.includes('const MONITOR_MARGIN_OPTIONS')) {
  const m = src.match(/const MONITOR_MARGIN_OPTIONS = \[[^\]]+\];/);
  if (m) consts.push(m[0]);
}
const code = consts.join('\n') + '\n' + names.map(extractFunction).join('\n');
const fns = {};
const wrapped = code + '\n' + names.map((n) => `fns.${n} = ${n};`).join('\n');
const runner = new Function('fns', wrapped);
runner(fns);

const dashOnlyAccount = { account: fixture.account, positions: fixture.positions };
const nested = fns.extractBalanceSummary(dashOnlyAccount);
const lifted = fns.extractBalanceSummary(fixture);
const liveZeroMarket = fns.extractBalanceSummary({
  balance: {
    total_asset_currency: 'USD',
    total_cash_balance: '2110.05',
    total_market_value: '0.00',
    account_currency_assets: [{
      currency: 'USD',
      net_liquidation_value: '2110.05',
      cash_balance: '2110.05',
      margin_power: '2110.05',
    }],
  },
});
const pos = fns.normalizePositions(fixture.positions);
const nestedHoldings = fns.normalizePositions({
  data: { has_next: false, holdings: [{ symbol: 'MSFT', total_cost: '9.00', market_value: '11.00' }] },
});
const scaled = fns.applyMonitorMarginSimulation(
  [{ status: 'closed', pnlPercent: 10, pnlAbsolute: 50 }, { status: 'open', pnlPercent: 10, pnlAbsolute: 50 }],
  200,
);
const html = fns.tradesTable([{
  context: { ticker: 'AAPL' },
  entryDate: '2024-01-02',
  exitDate: '2024-01-05',
  entryPrice: 10.5,
  exitPrice: 11.25,
  quantity: 2,
  pnl: 1.5,
  pnlPercent: 7.1,
  duration: 3,
  exitReason: 'ibs_signal',
}]);

const fail = [];
const expectEq = (label, got, want) => {
  if (got !== want) fail.push(`${label}: got ${got} want ${want}`);
};

expectEq('nested.totalAssets', nested.totalAssets, 12345.67);
expectEq('nested.cashBalance', nested.cashBalance, 1000);
expectEq('nested.buyingPower', nested.buyingPower, 2000);
expectEq('nested.unrealizedPnl', nested.unrealizedPnl, 200);
expectEq('lifted.totalAssets', lifted.totalAssets, 12345.67);
expectEq('lifted.buyingPower', lifted.buyingPower, 2000);
expectEq('liveZeroMarket.totalAssets', liveZeroMarket.totalAssets, 2110.05);
expectEq('liveZeroMarket.cashBalance', liveZeroMarket.cashBalance, 2110.05);
expectEq('liveZeroMarket.buyingPower', liveZeroMarket.buyingPower, 2110.05);
if (!pos.length || pos[0].symbol !== 'AAPL') fail.push('position symbol ' + JSON.stringify(pos[0]));
if (String(pos[0].totalCost) !== '1800.00') fail.push('totalCost ' + pos[0].totalCost);
if (!nestedHoldings.length || nestedHoldings[0].symbol !== 'MSFT') fail.push('asRows nested data.holdings ' + JSON.stringify(nestedHoldings[0]));
if (String(pos[0].marketValue) !== '1900.00') fail.push('marketValue ' + pos[0].marketValue);
if (scaled[0].pnlPercent !== 20) fail.push('margin pnlPercent ' + scaled[0].pnlPercent);
if (scaled[0].pnlAbsolute !== 100) fail.push('margin pnlAbsolute ' + scaled[0].pnlAbsolute);
if (scaled[1].pnlPercent !== 10) fail.push('open trade must not scale');
if (!html.includes('AAPL') || !html.includes('2024-01-02') || !html.includes('2024-01-05')) fail.push('tradesTable missing ticker/dates');
if (!html.includes('Цена входа') || !html.includes('Цена выхода') || !html.includes('Тикер')) fail.push('tradesTable missing headers');
if (src.includes("state.stockTab !== 'summary'")) fail.push('params still injected off summary');

const legacy = {
  enabled: true,
  allowNewEntries: true,
  allowExits: true,
  brokers: { webull: {}, robinhood: {} },
};
expectEq('brokerFlag.webull.enabled', fns.brokerFlag(legacy, 'webull', 'enabled'), true);
expectEq('brokerFlag.webull.allowNewEntries', fns.brokerFlag(legacy, 'webull', 'allowNewEntries'), true);
expectEq('brokerFlag.webull.allowExits', fns.brokerFlag(legacy, 'webull', 'allowExits'), true);
expectEq('brokerFlag.robinhood.enabled', fns.brokerFlag(legacy, 'robinhood', 'enabled'), false);
expectEq('brokerFlag.robinhood.allowNewEntries', fns.brokerFlag(legacy, 'robinhood', 'allowNewEntries'), false);
expectEq('brokerFlag.robinhood.allowExits', fns.brokerFlag(legacy, 'robinhood', 'allowExits'), false);

const matchingForm = {
  webullEnabled: { checked: true }, webullAllowEntries: { checked: true }, webullAllowExits: { checked: true },
  robinhoodEnabled: { checked: false }, robinhoodAllowEntries: { checked: false }, robinhoodAllowExits: { checked: false },
};
const emptyPatch = fns.brokerFlagsPatch(legacy, matchingForm);
if (Object.keys(emptyPatch).length) fail.push('unchanged brokers must omit patch ' + JSON.stringify(emptyPatch));
const flipped = { ...matchingForm, webullEnabled: { checked: false } };
const webullPatch = fns.brokerFlagsPatch(legacy, flipped);
expectEq('brokerFlagsPatch.webull.enabled', webullPatch.webull && webullPatch.webull.enabled, false);
if (webullPatch.robinhood) fail.push('unchanged robinhood must be omitted');
if (webullPatch.webull && 'allowNewEntries' in webullPatch.webull) fail.push('unchanged webull allow must be omitted');

const out = {
  appPath,
  nested,
  liveZeroMarket,
  position: pos[0],
  scaledClosed: scaled[0],
  tradesHasTicker: html.includes('AAPL'),
  ok: fail.length === 0,
  fail,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
if (fail.length) process.exit(1);
