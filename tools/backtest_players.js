#!/usr/bin/env node
/* Backtest del modelo de goleadores (js/scorers.js) con los partidos descargados en data/raw_players/.
 * Para cada partido de un equipo con >= 3 partidos previos: arma el perfil SOLO con los partidos anteriores
 * (sin mirar el futuro), calcula P(marca) de cada jugador del perfil y compara con quién marcó de verdad.
 * λ = goles a favor medios ponderados del equipo (el sitio usa el λ del modelo del partido, que es mejor: esto es una cota).
 * Uso: node tools/backtest_players.js [--grid]   -> data/backtest_players.json y .js */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const S = require('../js/scorers.js');
const root = path.join(__dirname, '..'), RAW = path.join(root, 'data', 'raw_players');

function loadAll() {
  const out = [];
  if (!fs.existsSync(RAW)) return out;
  for (const f of fs.readdirSync(RAW)) {
    if (!f.endsWith('.json.gz')) continue;
    try { const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RAW, f))).toString('utf8')); if (d.teams && d.teams.length === 2) out.push(d); } catch (e) { /* ignora */ }
  }
  return out;
}

// mismo armado que tools/fetch_players.py (priors = extractos anteriores, el más reciente primero)
function buildT(name, exs, coef) {
  const m = [], pidx = {}, p = [], s = [], a = [];
  exs.forEach((ex) => {
    const tm = ex.teams.find((t) => t.n === name), op = ex.teams.find((t) => t.n !== name); if (!tm || !op) return;
    const idx = m.length, sc = ex.score || [], i = ex.teams.indexOf(tm), j = ex.teams.indexOf(op);
    m.push([ex.d, op.n, parseInt(sc[i], 10) || 0, parseInt(sc[j], 10) || 0, tm.ha === 'home' ? 1 : 0, ex.loc >= 4 ? 1 : 0]);
    const xgm = {};
    const roster = new Set(tm.pl.map((x) => x[0]));
    tm.sh.forEach((t) => { const xg = S.xgOf(coef, t[0], t[1], t[5], t[6]); if (t[3] && roster.has(t[3])) xgm[t[3]] = (xgm[t[3]] || 0) + xg; s.push([Math.round(t[0]), Math.round(t[1]), t[2], Math.round(xg * 100), idx, t[6]]); });
    op.sh.forEach((t) => a.push([Math.round(t[0]), Math.round(t[1]), t[2], Math.round(S.xgOf(coef, t[0], t[1], t[5], t[6]) * 100), idx, t[6]]));
    tm.pl.forEach((pl) => {
      if (pidx[pl[0]] == null) { pidx[pl[0]] = p.length; p.push([pl[0], pl[1], []]); }
      const row = p[pidx[pl[0]]]; if (pl[1] && (!row[1] || (row[1] === 'SUB' && pl[1] !== 'SUB'))) row[1] = pl[1];
      row[2].push([idx, pl[2], pl[3], pl[4], pl[5], Math.round((xgm[pl[0]] || 0) * 100), pl[6]]);
    });
  });
  return { m, p, s, a };
}

function run(coef, opts, NPRIOR) {
  const all = loadAll().filter((d) => d.loc > 0 || d.teams.some((t) => t.pl.length));
  const by = {};
  all.forEach((ex) => ex.teams.forEach((t) => { (by[t.n] = by[t.n] || []).push(ex); }));
  const preds = [], teamMatches = []; let nM = 0;
  for (const name in by) {
    const L = by[name].sort((x, y) => (x.d < y.d ? -1 : 1));
    for (let k = 3; k < L.length; k++) {
      const prior = L.slice(Math.max(0, k - NPRIOR), k).reverse(), T = buildT(name, prior, coef);
      const rows = S.scorers(T, null, opts); if (!rows.length) continue;
      const cur = L[k].teams.find((t) => t.n === name), scored = {}; let anyG = 0;
      cur.pl.forEach((pl) => { if (pl[5] > 0) { scored[pl[0]] = 1; anyG++; } });
      nM++;
      const top = rows.slice(0, 3).map((r) => r.name), byGoals = rows.slice().sort((x, y) => y.g - x.g)[0].name;
      teamMatches.push({ anyG, top1: scored[top[0]] ? 1 : 0, top3: top.some((n) => scored[n]) ? 1 : 0, base1: scored[byGoals] ? 1 : 0 });
      rows.forEach((r) => preds.push([r.p, scored[r.name] ? 1 : 0]));
    }
  }
  const n = preds.length, rate = n ? preds.reduce((s, x) => s + x[1], 0) / n : 0;
  const brier = preds.reduce((s, x) => s + (x[0] - x[1]) * (x[0] - x[1]), 0) / n, brierBase = preds.reduce((s, x) => s + (rate - x[1]) * (rate - x[1]), 0) / n;
  const ll = -preds.reduce((s, x) => s + (x[1] ? Math.log(Math.max(x[0], 1e-6)) : Math.log(Math.max(1 - x[0], 1e-6))), 0) / n;
  const edges = [0, 0.05, 0.10, 0.15, 0.20, 0.30, 1.01], bins = [];
  for (let i = 0; i < edges.length - 1; i++) { const b = preds.filter((x) => x[0] >= edges[i] && x[0] < edges[i + 1]); bins.push({ lo: edges[i], hi: Math.min(1, edges[i + 1]), n: b.length, pm: b.length ? b.reduce((s, x) => s + x[0], 0) / b.length : null, hit: b.length ? b.reduce((s, x) => s + x[1], 0) / b.length : null }); }
  const sc = teamMatches.filter((t) => t.anyG > 0), tm = teamMatches.length;
  return { _preds: preds, matches: nM, preds: n, rate, brier, brierBase, ll, bins, top1: teamMatches.reduce((s, t) => s + t.top1, 0) / tm, base1: teamMatches.reduce((s, t) => s + t.base1, 0) / tm, top3: teamMatches.reduce((s, t) => s + t.top3, 0) / tm, scoredMatches: sc.length, top3Given: sc.length ? sc.reduce((s, t) => s + t.top3, 0) / sc.length : null };
}

const dp = path.join(root, 'data', 'players.json'); let coef = [-2.2, -0.05, 1.9];
try { coef = JSON.parse(fs.readFileSync(dp, 'utf8')).xg.coef; } catch (e) { /* por defecto */ }
if (process.argv.includes('--grid')) {
  const res = [];
  for (const alpha of [0, 0.05, 0.1, 0.2, 0.35]) for (const shrink of [3, 4, 5]) for (const decay of [0.88, 0.92]) { const r = run(coef, { alpha, shrink, decay }, 6); res.push([alpha, shrink, decay, r.ll, r.brier, r.top1]); }
  res.sort((a, b) => a[3] - b[3]); console.log('alpha shrink decay | logloss brier top1'); res.slice(0, 8).forEach((r) => console.log(r.map((x) => +x.toFixed(4)).join('  ')));
  process.exit(0);
}
const r = run(coef, {}, 6);
// calibración p' = a·p^b (mínimos cuadrados en logaritmos sobre los tramos de probabilidad, ponderado por n): corrige que los
// titulares probables a veces no juegan (lesión/rotación) y que el λ real de cada partido difiere del medio del equipo
{
  const ll = (aa, bb) => -r._preds.reduce((t, x) => { const q = Math.min(0.9, Math.max(1e-4, aa * Math.pow(x[0], bb))); return t + (x[1] ? Math.log(q) : Math.log(1 - q)); }, 0) / r._preds.length;
  let aa = 1, bb = 1, best = ll(1, 1);
  for (let st = 0.2; st > 0.002; st /= 2) for (let it = 0; it < 40; it++) { let moved = false; for (const [da, db] of [[st, 0], [-st, 0], [0, st], [0, -st]]) { const v = ll(aa + da, bb + db); if (aa + da > 0.05 && bb + db > 0.2 && v < best - 1e-9) { best = v; aa += da; bb += db; moved = true; } } if (!moved) break; }
  const cal = (p) => Math.min(0.9, aa * Math.pow(p, bb));
  r.cal = { a: +aa.toFixed(4), b: +bb.toFixed(4) };
  r.brierCal = r._preds.reduce((t, x) => t + Math.pow(cal(x[0]) - x[1], 2), 0) / r._preds.length;
  r.binsCal = r.bins.map((bn) => { const q = r._preds.filter((x) => x[0] >= bn.lo && x[0] < bn.hi + 1e-9 * (bn.hi === 1)); return { lo: bn.lo, hi: bn.hi, n: q.length, pm: q.length ? q.reduce((t, x) => t + cal(x[0]), 0) / q.length : null, hit: bn.hit }; });
}
delete r._preds;
r.generated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'data', 'backtest_players.json'), JSON.stringify(r));
fs.writeFileSync(path.join(root, 'data', 'backtest_players.js'), 'window.AURUM_BT_PLAYERS = ' + JSON.stringify(r) + ';\n');
const pc = (x) => (x == null ? '—' : (x * 100).toFixed(1) + ' %');
console.log('partidos-equipo', r.matches, '| predicciones', r.preds, '| tasa base', pc(r.rate));
console.log('Brier modelo', r.brier.toFixed(4), '| calibrado', r.brierCal.toFixed(4), 'vs constante', r.brierBase.toFixed(4), '| logloss', r.ll.toFixed(4), '| calibración p\' = ' + r.cal.a + '·p^' + r.cal.b);
console.log('1.º candidato marcó', pc(r.top1), '(máx. goleador de la ventana:', pc(r.base1) + ') | alguno de los 3 primeros', pc(r.top3), '| dado que el equipo marcó', pc(r.top3Given));
r.bins.forEach((b, i) => console.log('  ' + (b.lo * 100) + '–' + Math.round(b.hi * 100) + ' %: n=' + b.n + ' prob. media ' + pc(b.pm) + ' (calibrada ' + pc(r.binsCal[i].pm) + ') acierto real ' + pc(b.hit)));
