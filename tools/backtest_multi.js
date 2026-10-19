/* Acierto histórico del modelo por liga (walk-forward) → data/backtest_multi.json|.js. Uso: node tools/backtest_multi.js */
const fs = require('fs'), path = require('path');
const X = require('../js/multimodel.js');
const dir = path.join(__dirname, '..', 'data');
const M = JSON.parse(fs.readFileSync(path.join(dir, 'multi.json'), 'utf8'));
const sportOf = {}; M.leagues.forEach((l) => (sportOf[l.id] = l.sport));
const by = {}; M.results.forEach((r) => (by[r.lg] = by[r.lg] || []).push(r));
const out = {}, lines = [], pool = {};
for (const lg of Object.keys(by)) {
  const rs = by[lg].sort((a, b) => a.d.localeCompare(b.d)); if (rs.length < 60) continue;
  const testFrom = rs[Math.floor(rs.length * 0.45)].d; // se predice la segunda mitad con lo aprendido antes
  const sp = sportOf[lg] || lg.split('/')[0], items = []; const r = X.backtestLeague(rs, sp, testFrom, items); (pool[sp] = pool[sp] || []).push(...items);
  if (!r) continue;
  out[lg] = { sport: sportOf[lg], n: r.n, acc: r.acc, baseAcc: r.baseAcc, logloss: r.logloss, brier: r.brier, testFrom };
  lines.push([lg, r.n, (r.acc * 100).toFixed(1), (r.baseAcc * 100).toFixed(1), r.logloss.toFixed(3)].join('\t'));
}
const temp = {}, oos = {};
for (const sp in pool) { // se ajusta con la mitad par y se evalúa en la impar; solo se usa si mejora fuera de muestra
  const even = pool[sp].filter((_, i) => i % 2 === 0), odd = pool[sp].filter((_, i) => i % 2 === 1), s0 = X.fitTemp(even);
  const ll = (arr, k) => arr.reduce((a, t) => a - Math.log(Math.max(X.calib(t.p, k)[t.r], 1e-9)), 0) / (arr.length || 1);
  oos[sp] = { s: s0, antes: +ll(odd, 1).toFixed(4), despues: +ll(odd, s0).toFixed(4) };
  temp[sp] = (oos[sp].antes - oos[sp].despues) >= 0.002 ? oos[sp].s : 1; // solo si mejora ≥ 0.002 fuera de muestra, y con el s validado
}
out._oos = oos;

// ¿Conviene compartir ratings entre competiciones (ajuste global de fútbol)? Se compara en la misma ventana: últimos 18 meses
const soccerLgs = M.leagues.filter((l) => l.sport === 'soccer').map((l) => l.id).filter((lg) => (by[lg] || []).length >= 60);
const lastD = M.results.map((r) => r.d).sort().pop(), tf = new Date(Date.parse(lastD) - 540 * 864e5).toISOString().slice(0, 10);
const groups = { cross: soccerLgs.filter((lg) => X.isCross(lg)), domestic: soccerLgs.filter((lg) => !X.isCross(lg)) };
const glob = X.backtestGlobal(M.results, new Set(soccerLgs), tf, null, X.makeKeyer(M.leagues, M.results)), cmp = {};
const llOf = (t) => -Math.log(Math.max(t.p[t.r], 1e-9));
for (const g in groups) { // comparación PAREADA: solo partidos que ambos ajustes pueden predecir
  const diffs = []; let nOwn = 0, nGlob = 0;
  for (const lg of groups[g]) {
    const own = X.backtestLeague(by[lg], 'soccer', tf), gl = glob[lg]; if (!own || !gl) continue;
    nOwn += own.n; nGlob += gl.n;
    const gm = new Map(gl._test.map((t) => [t.k, t]));
    for (const t of own._test) { const u = gm.get(t.k); if (u) diffs.push(llOf(t) - llOf(u)); } // >0 → el global es mejor en ese partido
  }
  const n = diffs.length, mean = n ? diffs.reduce((a, b) => a + b, 0) / n : 0, sd = n > 1 ? Math.sqrt(diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0, se = n ? sd / Math.sqrt(n) : 0;
  cmp[g] = { nComunes: n, partidosPorLiga: nOwn, partidosGlobal: nGlob, mejoraGlobal: +mean.toFixed(4), ee: +se.toFixed(4) };
}
// se usa el ajuste global solo si mejora de forma material y significativa en los partidos comunes (≥0.003 y > 2 errores estándar)
const better = (c) => c.nComunes >= 100 && c.mejoraGlobal >= 0.003 && c.mejoraGlobal > 2 * c.ee;
out._global = { cross: better(cmp.cross), all: better(cmp.domestic), compare: cmp, testFrom: tf };
// lo que se muestra por liga usa el ajuste que realmente se aplica
for (const lg of soccerLgs) { const useG = (X.isCross(lg) && out._global.cross) || out._global.all; if (useG && glob[lg] && out[lg]) { const g = glob[lg]; out[lg] = Object.assign(out[lg], { n: g.n, acc: g.acc, baseAcc: g.baseAcc, logloss: g.logloss, brier: g.brier, testFrom: tf, global: true }); } }
console.log('ajuste global vs por liga, partidos comunes (mejora = log-loss ahorrado; ee = error estándar):', JSON.stringify(cmp), '→ usar global:', JSON.stringify({ cross: out._global.cross, all: out._global.all }));
out._temp = temp;
const wr = (f, c) => { const t = path.join(dir, f + '.tmp'); fs.writeFileSync(t, c); fs.renameSync(t, path.join(dir, f)); }; // escritura atómica
wr('backtest_multi.json', JSON.stringify(out, null, 1));
wr('backtest_multi.js', 'window.AURUM_BT_MULTI = ' + JSON.stringify(out) + ';\n');
console.log('calibración fuera de muestra:', JSON.stringify(oos));
console.log('temperaturas por deporte (1 = ya calibrado, <1 = el modelo sobreestimaba):', JSON.stringify(temp));
console.log('liga\tn\tacierto%\tsiempre-local%\tlogloss'); console.log(lines.join('\n'));
