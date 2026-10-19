/* Calcula el backtest sobre data/history.json y escribe data/backtest.json|.js. Uso: node tools/backtest.js */
const fs = require('fs'), path = require('path');
const Mo = require('../js/model.js');
const dir = path.join(__dirname, '..', 'data');
const H = JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'));
const last = H.matches[H.matches.length - 1].d, testFrom = (+last.slice(0, 4) - 1) + last.slice(4);
const r = Mo.backtest(H.matches, { testFrom, wGrid: [0, 0.15, 0.3, 0.5, 0.75, 1], evThr: 0.04 });
const ws = Object.keys(r.metrics), best = ws.reduce((b, w) => (r.metrics[w].logloss < r.metrics[b].logloss ? w : b), ws[0]);
const ms = H.matches.filter((m) => m.d >= testFrom);
const real = [0, 0.03, 0.05].map((t) => Mo.realStrategy(ms, t));
const pinCov = ms.filter((m) => m.o && m.o.Pinnacle).length / ms.length;
const out = { generated: new Date().toISOString(), testFrom, last, n: r.n, bestW: +best, metrics: r.metrics, valueBets: { thr: 0.04, n: r.bets.n, wins: r.bets.wins, roiAvg: r.roiAvg, roiMax: r.roiMax }, realStrategy: real, pinnacleCoverage: pinCov, marketBeatsModel: r.metrics[0].logloss <= r.metrics[1].logloss };
const wr = (f, c) => { const t = path.join(dir, f + '.tmp'); fs.writeFileSync(t, c); fs.renameSync(t, path.join(dir, f)); }; // escritura atómica
wr('backtest.json', JSON.stringify(out, null, 1));
wr('backtest.js', 'window.AURUM_BACKTEST = ' + JSON.stringify(out) + ';\n');
console.log(JSON.stringify({ n: out.n, bestW: out.bestW, ll: Object.fromEntries(ws.map((w) => [w, +r.metrics[w].logloss.toFixed(4)])), valueBets: out.valueBets, realStrategy: out.realStrategy }, null, 1));
