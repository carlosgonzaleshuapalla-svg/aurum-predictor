/* Pruebas deterministas del modelo (sin red). Uso: node tests/model.test.js */
const Mo = require('../js/model.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const near = (a, b, t) => Math.abs(a - b) <= t;

console.log('[M1] Cuotas → probabilidades');
const o = [2.0, 3.5, 4.0];
ok(near(Mo.overround(o), 1 / 2 + 1 / 3.5 + 1 / 4 - 1, 1e-12), 'overround = Σ1/o − 1');
for (const f of [Mo.devigProportional, Mo.devigPower]) { const p = f(o); ok(near(p.reduce((a, b) => a + b), 1, 1e-9) && p.every((x) => x > 0 && x < 1), f.name + ' suma 1'); }
const pp = Mo.devigProportional(o), pw = Mo.devigPower(o);
ok(pw[0] > pp[0] && pw[2] < pp[2], 'potencia: favorito sube y longshot baja (sesgo favorito-longshot)');
ok(near(Mo.devigPower([2, 2])[0], 0.5, 1e-9), 'cuotas justas 2.00/2.00 → 50 %');

console.log('[M2] Poisson / Dixon-Coles');
const M = Mo.scoreMatrix(1.5, 1.1);
let tot = 0; M.forEach((r) => r.forEach((x) => (tot += x)));
ok(near(tot, 1, 1e-9), 'matriz de marcadores suma 1');
const mk = Mo.marketsFromMatrix(M);
ok(near(mk.p1x2.reduce((a, b) => a + b), 1, 1e-9) && mk.p1x2[0] > mk.p1x2[2], '1X2 coherente (local con más λ gana más)');
ok(near(mk.ou25[0] + mk.ou25[1], 1, 1e-12), 'over+under = 1');
const sym = Mo.marketsFromMatrix(Mo.scoreMatrix(1.3, 1.3)).p1x2;
ok(near(sym[0], sym[2], 1e-9), 'λ iguales → local = visitante');
ok(Mo.marketsFromMatrix(Mo.scoreMatrix(3, 3)).ou25[0] > Mo.marketsFromMatrix(Mo.scoreMatrix(0.8, 0.8)).ou25[0], 'más λ → más over 2.5');

console.log('[M3] Ajuste de fuerzas (datos sintéticos con fuerzas conocidas)');
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const poisSample = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const teams = { Fuerte: [1.6, 0.7], Medio: [1.0, 1.0], Debil: [0.7, 1.4], Medio2: [1.1, 0.95] }; // [ataque, defensa(más alto = peor)]
const names = Object.keys(teams), ms = []; let day = 0;
for (let r = 0; r < 40; r++) for (const h of names) for (const a of names) if (h !== a) {
  const d = new Date(Date.UTC(2024, 0, 1) + day * 864e5 / 3).toISOString().slice(0, 10); day++;
  ms.push({ d, lg: 'T', h, a, hg: poisSample(1.4 * teams[h][0] * teams[a][1]), ag: poisSample(1.1 * teams[a][0] * teams[h][1]) });
}
const fit = Mo.fitLeague(ms, '2030-01-01', { xi: 0 });
ok(fit && fit.teams.Fuerte.att > fit.teams.Medio.att && fit.teams.Medio.att > fit.teams.Debil.att, 'ordena el ataque correctamente');
ok(fit.teams.Fuerte.def < fit.teams.Debil.def, 'ordena la defensa correctamente');
const pr = Mo.predictMatch(fit, 'Fuerte', 'Debil');
ok(pr.p1x2[0] > 0.6, `Fuerte vs Débil: gana local ${(pr.p1x2[0] * 100).toFixed(0)} %`);
ok(Mo.predictMatch(fit, 'Fuerte', 'NoExiste') === null, 'equipo desconocido → sin predicción (no inventa)');
ok(Mo.fitLeague(ms.slice(0, 10), '2030-01-01') === null, 'pocos datos → null');
const fitFuture = Mo.fitLeague(ms, '2024-01-02', { xi: 0 });
ok(fitFuture === null || fitFuture.n < ms.length, 'no usa partidos posteriores a la fecha de corte (sin fuga)');

console.log('[M4] Valor, Kelly, mejor cuota');
ok(near(Mo.expectedValue(0.55, 2.0), 0.1, 1e-12), 'EV = p·cuota − 1');
ok(Mo.kelly(0.5, 2.0) === 0 && Mo.kelly(0.4, 2.0) === 0, 'Kelly = 0 sin ventaja');
ok(Mo.kelly(0.9, 3.0) <= 0.05, 'Kelly respeta el tope 5 %');
ok(near(Mo.kelly(0.55, 2.0, 1, 1), 0.1, 1e-12), 'Kelly completo = (p·o−1)/(o−1)');
const ev = { id: 'x', books: { Bet365: { '1x2': [2.1, 3.4, 3.6] }, Pinnacle: { '1x2': [2.2, 3.3, 3.5] }, Max: { '1x2': [9, 9, 9] } } };
ok(Mo.bestOdds(ev.books, '1x2', 0).book === 'Pinnacle' && Mo.bestOdds(ev.books, '1x2', 1).book === 'Bet365', 'mejor cuota entre casas reales (ignora Max/Avg)');
const sel = Mo.analyzeEvent(ev, { p1x2: [0.6, 0.2, 0.2], ou25: [0.5, 0.5] });
ok(sel.length === 3 && sel[0].ev > 0 && sel[0].hasModel, 'analizar evento: modelo 60 % vs mercado ≈45 % → value en local');
ok(Mo.analyzeEvent(ev, null).every((s) => !s.hasModel && near(s.p, s.pMarket, 1e-12)), 'sin modelo usa solo mercado');

const bad = { id: 'y', books: { Avg: { ou25: [1.34, 3.06] }, BetfairExchange: { ou25: [1.41, 1.1] }, Bet365: { ou25: [1.36, 3.1] } } };
const fb = Mo.fairFromBooks(bad.books, 'ou25');
ok(fb.src === 'Avg' && fb.probs[1] < 0.35, 'ignora O/U de bolsa con margen imposible (bug Groningen–Ajax)');
ok(Mo.analyzeEvent(bad, null).every((s) => s.ev < 0.1), 'sin EV absurdo en datos sucios');
ok(Mo.bestOdds({ BetfairExchange: { '1x2': [9, 9, 9] }, Bet365: { '1x2': [2, 3, 4] } }, '1x2', 0).book === 'Bet365', 'la bolsa no cuenta como mejor cuota de casa');

const outl = { A: { '1x2': [2.0, 3.4, 3.6] }, B: { '1x2': [2.05, 3.4, 3.5] }, C: { '1x2': [2.0, 3.3, 3.6] }, D: { '1x2': [3.5, 1.9, 3.0] }, Pinnacle: { '1x2': [2.0, 3.4, 3.7] } };
ok(Mo.bestOdds(outl, '1x2', 0).odds === 2.05, 'descarta cuota atípica (3.5 vs mediana ≈2.0)');
const pe = Mo.devigPower([1.01, 1.01]); ok(near(pe[0] + pe[1], 1, 1e-6), 'devigPower normaliza en extremos');
ok(Mo.fairFromBooks({ Pinnacle: { '1x2': [2.2, 3.4, 3.5] }, Bet365: { '1x2': [1.5, 4, 8] } }, '1x2').src === 'Pinnacle', 'fair prefiere Pinnacle');
ok(Object.keys(Mo.oddsByBook(outl, '1x2', 0)).length === 5, 'oddsByBook lista casas');
const ou = Mo.analyzeEvent({ id: 'z', books: { Avg: { ou25: [1.9, 1.95] }, Bet365: { ou25: [1.95, 1.9] } } }, { p1x2: [.3, .3, .4], ou25: [0.9, 0.1] });
ok(ou.every((s) => near(s.p, s.pMarket, 1e-12)), 'más/menos 2.5 no usa el modelo (sin validar)');
const rsd = Mo.realStrategy([{ d: '2025-01-01', hg: 1, ag: 0, o: { Pinnacle: [2.0, 3.5, 4.0], Bet365: [2.2, 3.4, 3.9], Bwin: [2.1, 3.4, 3.9], Coral: [2.1, 3.4, 3.8], Ladbrokes: [2.05, 3.4, 3.9] } }], 0);
ok(rsd.n >= 1 && rsd.roi != null, 'realStrategy calcula ROI de la estrategia mostrada');

console.log('[M5] Combinadas');
const legs = [
  { evId: 'a', odds: 2, p: 0.55, ev: 0.1 }, { evId: 'a', odds: 3, p: 0.4, ev: 0.2 }, { evId: 'b', odds: 1.8, p: 0.6, ev: 0.08 }, { evId: 'c', odds: 2.2, p: 0.5, ev: 0.1 },
];
const ps = Mo.parlays(legs, { minP: 0.3 });
ok(ps.every((x) => new Set(x.legs.map((l) => l.evId)).size === x.legs.length), 'nunca combina dos selecciones del mismo partido');
ok(ps.every((x, i) => i === 0 || ps[i - 1].ev >= x.ev), 'ordenadas por EV');
const two = ps.find((x) => x.legs.length === 2 && x.legs[0].evId === 'b' && x.legs[1].evId === 'c' || x.legs[1].evId === 'b' && x.legs[0].evId === 'c');
ok(two && near(two.odds, 1.8 * 2.2, 1e-9) && near(two.p, 0.6 * 0.5, 1e-9), 'cuota y probabilidad de la combinada = productos');

console.log('[M6] Backtest sobre datos sintéticos');
const bt = Mo.backtest(ms.map((m) => { const lh = 1.4 * teams[m.h][0] * teams[m.a][1], la = 1.1 * teams[m.a][0] * teams[m.h][1]; const p = Mo.marketsFromMatrix(Mo.scoreMatrix(lh, la)).p1x2; const od = p.map((x) => 1 / (x * 1.05)); return Object.assign({}, m, { o: { Avg: od, Max: od } }); }), { testFrom: '2024-03-15', wGrid: [0, 1] });
ok(bt.n > 100 && bt.metrics[1].logloss < 1.2, `backtest corre (${bt.n} partidos), logloss modelo ${bt.metrics[1].logloss.toFixed(3)}`);

console.log(fails ? `\nMODELO FALLÓ (${fails})` : '\nMODELO OK');
process.exit(fails ? 1 : 0);
