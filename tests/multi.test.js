/* Pruebas deterministas del modelo multi-deporte (sin red). Uso: node tests/multi.test.js */
const X = require('../js/multimodel.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const near = (a, b, t) => Math.abs(a - b) <= t;
let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 864e5).toISOString().slice(0, 10);

console.log('[X1] Elo');
ok(near(X.expected(0), 0.5, 1e-12) && X.expected(400) > 0.9 && X.expected(-400) < 0.1, 'probabilidad esperada Elo');
// liga sintética 2 vías: Alfa fuerte (80 %), Beta medio, Gama débil
const str = { Alfa: 250, Beta: 0, Gama: -250 }, names = Object.keys(str), res = []; let di = 0;
for (let r = 0; r < 60; r++) for (const h of names) for (const a of names) if (h !== a) {
  const p = X.expected(str[h] + 40 - str[a]); const hw = rnd() < p;
  res.push({ lg: 'basketball/x', d: day(Math.floor(di++ / 1.2)), h, a, hs: hw ? 100 : 90, as: hw ? 90 : 100, w: hw ? 'h' : 'a' });
}
const st = X.eloRun(res, 'basketball');
ok(st.R.Alfa > st.R.Beta && st.R.Beta > st.R.Gama, 'ordena las fuerzas');
ok(near(st.R.Alfa + st.R.Beta + st.R.Gama, 4500, 120), 'Elo ≈ conserva el total (sin inflación grande)');
const pr = X.eloProb(st, 'basketball', 'Alfa', 'Gama', false);
ok(pr.p > 0.85 && pr.reliable, 'Alfa vs Gama: favorito claro (' + (pr.p * 100).toFixed(0) + ' %)');
ok(X.eloProb(st, 'basketball', 'Alfa', 'Nadie', false) === null, 'equipo desconocido → null');
const few = X.eloRun([{ lg: 'mma/u', d: '2024-01-01', h: 'A', a: 'B', w: 'h' }], 'mma');
const pf = X.eloProb(few, 'mma', 'A', 'B', true);
ok(pf.p > 0.5 && pf.p < 0.62 && !pf.reliable, 'pocos combates → probabilidad encogida a ~50 % y marcada no fiable');
const neu = X.eloRun(res.slice(0, 50), 'basketball'), pn = X.eloProb(neu, 'basketball', 'Alfa', 'Alfa', true);
ok(pn && near(pn.raw, 0.5, 1e-9), 'campo neutral sin ventaja de local');

console.log('[X2] Backtest de aciertos');
const bt = X.backtestLeague(res, 'basketball', day(100));
ok(bt && bt.n > 150 && bt.acc > 0.7, `Elo acierta ${(bt.acc * 100).toFixed(0)} % en liga con fuerzas desiguales (n=${bt.n})`);
ok(bt.logloss < Math.log(2), 'log-loss mejor que lanzar una moneda');
const calib = Object.values(bt.bins).every((b) => b.n < 30 || near(b.hit / b.n, b.pm / b.n, 0.12));
ok(calib, 'calibración razonable por tramos');
ok(X.backtestLeague([], 'basketball', '2024-01-01') === null, 'sin datos → null');

console.log('[X3] Mercado y pronóstico');
ok(near(X.marketProbs([2, null, 2])[0], 0.5, 1e-9), 'devig 2 vías');
ok(X.marketProbs([1.5, 4, 6]).length === 3, 'devig 3 vías');
ok(X.marketProbs([1.1, 1.1]) === null, 'margen imposible → ignora');
ok(X.marketProbs([0.9, null, 3]) === null, 'cuota ≤ 1 → ignora');
const multi = { leagues: [{ id: 'basketball/x', sport: 'basketball' }], results: res, events: [] };
const ctx = X.buildContext(multi, '2025-01-01');
const ev = { id: '1', lg: 'basketball/x', h: 'Alfa', a: 'Gama', odds: { DraftKings: { ml: [1.2, null, 4.5] } } };
const f = X.forecast(ctx, ev, { wModel: 0 });
ok(f.source === 'mercado' && f.pick.label === 'Gana Alfa' && f.pick.conf === 'alta', 'pronóstico = favorito del mercado, confianza alta');
ok(near(f.pick.fairOdds, 1 / f.pick.p, 1e-12) && f.pick.ref.odds === 1.2 && f.pick.best === null && f.pick.ev === null, 'cuota justa; DraftKings solo como referencia (sin EV apostable)');
const f2 = X.forecast(ctx, Object.assign({}, ev, { odds: null }), { wModel: 0 });
ok(f2.source === 'modelo' && f2.pick.label === 'Gana Alfa', 'sin cuotas usa el modelo');
const f3 = X.forecast(ctx, Object.assign({}, ev, { odds: null }), { extraBooks: { 'Inkabet ✎': { ml: [1.35, null, 3.2] } } });
ok(f3.pick.best.book === 'Inkabet ✎' && near(f3.pick.ev, f3.pick.p * 1.35 - 1, 1e-12), 'cuota manual de casa peruana entra en el EV');
ok(X.forecast(ctx, { id: 'z', lg: 'basketball/x', h: 'Q', a: 'W', odds: null }) === null, 'sin modelo ni mercado → no inventa');

console.log('[X4] Fútbol (Poisson) con resultados ESPN');
const sres = [], tm = ['A', 'B', 'C', 'D']; seed = 5; let k = 0;
const pz = (l) => { const L = Math.exp(-l); let q = 0, p = 1; do { q++; p *= rnd(); } while (p > L); return q - 1; };
for (let r = 0; r < 25; r++) for (const h of tm) for (const a of tm) if (h !== a) { const hs = pz(h === 'A' ? 2.2 : 1.2), as = pz(a === 'A' ? 1.6 : 1.0); sres.push({ lg: 'soccer/per.1', d: day(k++ % 330), h, a, hs, as, w: hs > as ? 'h' : hs === as ? 'd' : 'a' }); }
const sctx = X.buildContext({ leagues: [{ id: 'soccer/per.1', sport: 'soccer' }], results: sres, events: [] }, '2025-06-01');
const sf = X.forecast(sctx, { id: 's', lg: 'soccer/per.1', h: 'A', a: 'D', odds: null });
ok(sf && sf.draw && sf.p.length === 3 && near(sf.p[0] + sf.p[1] + sf.p[2], 1, 1e-9) && sf.pick.label === 'Gana A', 'fútbol: 3 resultados, suma 1, favorito A');
ok(sf.info.ou25 && sf.info.btts, 'fútbol: más/menos 2.5 y ambos marcan');
const sbt = X.backtestLeague(sres, 'soccer', day(200));
ok(sbt && sbt.n > 50, 'backtest fútbol Poisson corre (n=' + (sbt && sbt.n) + ')');

console.log('[X4b] Correcciones de la revisión');
const sn = X.forecast(sctx, { id: 'n', lg: 'soccer/per.1', h: 'A', a: 'B', odds: null, neutral: true }), sh = X.forecast(sctx, { id: 'n', lg: 'soccer/per.1', h: 'A', a: 'B', odds: null }), sr = X.forecast(sctx, { id: 'n', lg: 'soccer/per.1', h: 'B', a: 'A', odds: null, neutral: true });
ok(near(sn.p[0], sr.p[2], 1e-9) && sn.p[0] < sh.p[0] + 0.2, 'sede neutral es simétrica (intercambiar equipos intercambia probabilidades)');
const bad2 = X.forecast(sctx, { id: 'm', lg: 'soccer/per.1', h: 'A', a: 'D', odds: { DraftKings: { ml: [1.5, null, 2.6] } } });
ok(bad2 && bad2.source === 'modelo' && bad2.p.length === 3 && bad2.p.every((x) => !isNaN(x)), 'fútbol ignora un mercado de 2 vías (sin NaN)');
const bb = []; for (let i = 0; i < 40; i++) bb.push({ lg: 'baseball/m', d: '2024-03-0' + (1 + (i % 9)), h: 'X', a: 'Y', hs: 5, as: 5, w: 'd' }, { lg: 'baseball/m', d: '2024-06-' + String(1 + (i % 28)).padStart(2, '0'), h: 'X', a: 'Y', hs: 5, as: 2, w: 'h' });
const bst = X.eloRun(bb, 'baseball'); ok(bst.N.X === 40, 'béisbol: pretemporada y empates no cuentan (N=' + bst.N.X + ')');
const pause = X.eloRun([{ lg: 'b', d: '2024-01-01', h: 'P', a: 'Q', hs: 100, as: 90, w: 'h' }, { lg: 'b', d: '2024-01-03', h: 'P', a: 'Q', hs: 100, as: 90, w: 'h' }, { lg: 'b', d: '2024-01-05', h: 'P', a: 'Q', hs: 100, as: 90, w: 'h' }], 'basketball');
const pNow = X.eloProb(pause, 'basketball', 'P', 'Q', true, '2024-01-10'), pLater = X.eloProb(pause, 'basketball', 'P', 'Q', true, '2024-09-01');
ok(pLater.raw < pNow.raw, 'tras una pausa larga la predicción se regresa a la media (igual que en el entrenamiento)');
ok(X.backtestLeague(sres.map((r) => Object.assign({}, r, { ot: r.hs === r.as })), 'soccer', day(200)).n < sbt.n, 'backtest fútbol excluye prórroga/penales');
ok(X.backtestLeague(res, 'tennis', day(100)).baseAcc === 0.5, 'tenis/MMA: referencia = moneda, no «siempre local»');

console.log('[X4c] Ajuste global (liga + copa)');
seed = 9; const gm = []; let gi = 0; const gdate = () => day(Math.floor(gi++ / 4));
const pz2 = (l) => { const L = Math.exp(-l); let q = 0, p = 1; do { q++; p *= rnd(); } while (p > L); return q - 1; };
const strongA = { A1: 1.7, A2: 1.0, A3: 0.7 }, strongB = { B1: 1.0, B2: 0.8, B3: 0.6 }; // la liga A es más fuerte que la B
const play = (lg, T, muH, muA, rounds) => { for (let r = 0; r < rounds; r++) for (const h in T) for (const a in T) if (h !== a) gm.push({ lg, d: gdate(), h, a, hs: pz2(muH * T[h] / Math.sqrt(T[a])), as: pz2(muA * T[a] / Math.sqrt(T[h])) }); };
play('soccer/lA', strongA, 1.4, 1.1, 20); play('soccer/lB', strongB, 1.3, 1.0, 20);
for (let r = 0; r < 12; r++) for (const h in strongA) for (const a in strongB) { const x = r % 2 ? [h, a] : [a, h]; const T = Object.assign({}, strongA, strongB); gm.push({ lg: 'soccer/cup', d: gdate(), h: x[0], a: x[1], hs: pz2(1.2 * T[x[0]] / Math.sqrt(T[x[1]])), as: pz2(1.0 * T[x[1]] / Math.sqrt(T[x[0]])) }); }
gm.forEach((r) => { r.w = r.hs > r.as ? 'h' : r.hs === r.as ? 'd' : 'a'; });
const gAsOf = '2024-08-01', gmulti = { leagues: [{ id: 'soccer/lA', sport: 'soccer' }, { id: 'soccer/lB', sport: 'soccer' }, { id: 'soccer/cup', sport: 'soccer' }], results: gm, events: [] };
const gx = X.buildContext(gmulti, gAsOf, { globalAll: true }), lx = X.buildContext(gmulti, gAsOf, {});
ok(gx.global['soccer/cup'] && gx.global['soccer/lA'] && !lx.global['soccer/cup'], 'contexto global se activa por opción');
const gf = X.forecast(gx, { id: 'g', lg: 'soccer/cup', h: 'A3', a: 'B1', odds: null, neutral: true });
ok(gf && gf.p.length === 3 && near(gf.p[0] + gf.p[1] + gf.p[2], 1, 1e-9), 'pronóstico en copa con ratings compartidos');
const gv = X.fitView(X.fitGlobal(gm.filter((r) => r.lg !== 'soccer/cup').map((r) => ({ d: r.d, lg: r.lg, h: r.h, a: r.a, hg: r.hs, ag: r.as })), gAsOf, { k: 3 }), 'soccer/lA');
ok(gv && gv.teams.A1.att > gv.teams.A3.att, 'fitGlobal ordena equipos dentro de la liga');
const gbt = X.backtestGlobal(gm, new Set(['soccer/cup']), day(55));
ok(gbt['soccer/cup'] && gbt['soccer/cup'].n > 5, 'backtest global corre en la copa (n=' + (gbt['soccer/cup'] && gbt['soccer/cup'].n) + ')');

const ky = X.makeKeyer([{ id: 'soccer/eng.1', country: 'GB' }, { id: 'soccer/uru.1', country: 'UY' }, { id: 'soccer/uefa.champions', country: 'WW' }, { id: 'soccer/conmebol.sudamericana', country: 'WW' }, { id: 'soccer/arg.1', country: 'AR' }],
  [{ lg: 'soccer/eng.1', h: 'Liverpool', a: 'Arsenal' }, { lg: 'soccer/uru.1', h: 'Liverpool', a: 'Nacional' }, { lg: 'soccer/arg.1', h: 'Boca', a: 'River' }]);
ok(ky('soccer/eng.1', 'Liverpool') === 'Liverpool|GB' && ky('soccer/uru.1', 'Liverpool') === 'Liverpool|UY', 'equipos homónimos no se fusionan en su liga');
ok(ky('soccer/uefa.champions', 'Liverpool') === 'Liverpool|soccer/uefa.champions' && ky('soccer/uefa.champions', 'Arsenal') === 'Arsenal|GB' && ky('soccer/uefa.champions', 'Boca') === 'Boca|AR', 'en copas: nombre único → su país; ambiguo → aislado');
ok(ky('soccer/uefa.champions', 'Equipo desconocido') === 'Equipo desconocido|?', 'sin liga doméstica conocida → compartido entre copas');
ok(['soccer/eng.fa', 'soccer/esp.copa_del_rey', 'soccer/ger.dfb_pokal', 'soccer/ita.coppa_italia', 'soccer/fra.coupe_de_france', 'soccer/arg.copa'].every(X.isCross) && !X.isCross('soccer/per.1') && !X.isCross('soccer/eng.1'), 'copas domésticas cuentan como competición cruzada');

console.log('[X4d] Unir eventos entre fuentes');
const T0 = Date.UTC(2026, 9, 24, 19);
const oev = [{ t: T0 + 3600e3, h: 'Tottenham Hotspur', a: 'Coventry City', books: {} }, { t: T0, h: 'Man United', a: 'Brighton', books: {} }];
ok(X.matchEvent({ t: T0, h: 'Tottenham', a: 'Coventry' }, oev) === oev[0], 'une «Tottenham» con «Tottenham Hotspur» (misma fecha ±36 h)');
ok(X.matchEvent({ t: T0, h: 'Manchester United', a: 'Brighton & Hove Albion' }, oev) === oev[1], 'une «Man United» con «Manchester United»');
ok(X.matchEvent({ t: T0 + 5 * 864e5, h: 'Tottenham', a: 'Coventry' }, oev) === undefined || X.matchEvent({ t: T0 + 5 * 864e5, h: 'Tottenham', a: 'Coventry' }, oev) === null, 'no une partidos de otra fecha');
ok(!X.matchEvent({ t: T0, h: 'Tottenham', a: 'Arsenal' }, oev), 'no une si un equipo no coincide');
ok(X.isExchange('Betfair Exchange') && X.isExchange('BetfairExchange') && X.isExchange('Matchbook') && !X.isExchange('Betsson'), 'detecta bolsas por nombre');

const bk = { Betsson: { ml: [1.69, null, 2.16] }, Coolbet: { ml: [2.2, 4.1, 2.85] }, Casa3: { ml: [2.0, 3.5, 3.6] } };
ok(Object.keys(X.filterBooksByMarket(bk, false)).join() === 'Betsson', 'sin empate (NHL, NBA…): se descartan casas con mercado de 3 resultados');
ok(Object.keys(X.filterBooksByMarket(bk, true)).join() === 'Coolbet,Casa3', 'fútbol: solo casas con empate');

console.log('[X5] Calibración');
const q = X.calib([0.9, 0.1], 0.5); ok(near(q[0] + q[1], 1, 1e-12) && q[0] < 0.9 && q[0] > 0.5, 'calib(<1) suaviza y normaliza');
ok(X.calib([0.7, 0.3], 1)[0] === 0.7, 'calib(1) no cambia nada');
seed = 3; const over = []; for (let i = 0; i < 4000; i++) { const tr = 0.5 + 0.2 * (rnd() - 0.5), fake = Math.min(0.99, 0.5 + (tr - 0.5) * 3); over.push({ p: [fake, 1 - fake], r: rnd() < tr ? 0 : 1 }); }
const tp = X.fitTemp(over); ok(tp < 0.7, 'fitTemp detecta un modelo sobreconfiado (s=' + tp + ')');
ok(X.fitTemp([]) === 1, 'sin datos suficientes → 1');
const fT = X.forecast(ctx, { id: 'c', lg: 'basketball/x', h: 'Alfa', a: 'Gama', odds: null }, { temp: { basketball: 0.5 } }), fN = X.forecast(ctx, { id: 'c', lg: 'basketball/x', h: 'Alfa', a: 'Gama', odds: null });
ok(fT.pick.p < fN.pick.p, 'forecast aplica la calibración por deporte');

console.log(fails ? `\nMULTI FALLÓ (${fails})` : '\nMULTI OK');
process.exit(fails ? 1 : 0);
