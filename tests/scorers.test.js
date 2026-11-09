/* Pruebas deterministas de js/scorers.js (goleadores probables y mapa de tiros). Uso: node tests/scorers.test.js */
const S = require('../js/scorers.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const near = (a, b, t) => Math.abs(a - b) <= t;

// equipo sintético, 6 partidos: el delantero juega siempre y genera mucho; el defensa casi nada; un suplente apenas aparece
const ent = (idx, rol, sh, sot, g, xg, ast) => [idx, rol, sh, sot, g, xg, ast || 0];
const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const T = {
  m: mk(6, (i) => ['2026-10-0' + (6 - i), 'R' + i, 2, 1, 1, 1]),
  p: [
    ['Delantero Uno', 'F', mk(6, (i) => ent(i, 1, 4, 2, i % 2 ? 1 : 0, 60))],
    ['Extremo Dos', 'RW', mk(6, (i) => ent(i, 1, 2, 1, i === 2 ? 1 : 0, 25))],
    ['Medio Tres', 'CM', mk(6, (i) => ent(i, 1, 1, 0, 0, 6))],
    ['Defensa Cuatro', 'CD', mk(6, (i) => ent(i, 1, 0, 0, 0, 2))],
    ['Portero Cinco', 'G', mk(6, (i) => ent(i, 1, 0, 0, 0, 0))],
    ['Suplente Seis', 'F', [ent(5, 2, 1, 0, 1, 30)]],
  ],
  s: [[90, 50, 'g', 60, 0, 0], [80, 40, 't', 20, 1, 0], [75, 70, 'o', 5, 2, 0], [95, 50, 'g', 50, 0, 0]],
  a: [[88, 52, 'o', 10, 0, 0]],
};
console.log('[S1] Goleadores');
const r = S.scorers(T, 1.8);
ok(r.length === 6 && r[0].name === 'Delantero Uno', 'el delantero con más xG y goles es el primero');
ok(r.every((x, i) => i === 0 || x.p <= r[i - 1].p), 'ordenados de mayor a menor probabilidad');
ok(near(r.reduce((s, x) => s + x.share, 0), 1, 1e-9), 'las partes suman 1');
const exp = r.reduce((s, x) => s + -Math.log(1 - x.p), 0);
ok(near(exp, 1.8, 1e-6), 'Σ −ln(1−p) = goles esperados del equipo (' + exp.toFixed(3) + ')');
const rp = r.find((x) => x.name === 'Portero Cinco'), rd = r.find((x) => x.name === 'Defensa Cuatro'), rm = r.find((x) => x.name === 'Medio Tres');
ok(rp.p < rd.p && rd.p < rm.p && rm.p < r[0].p, 'portero < defensa < medio < delantero');
ok(r.find((x) => x.name === 'Suplente Seis').p < r[0].p / 2, 'un suplente con una sola aparición no supera la mitad del titular (encogimiento)');
ok(S.scorers(T, 3.6)[0].p > r[0].p && S.scorers(T, 0.6)[0].p < r[0].p, 'más goles esperados del equipo → más probabilidad');
ok(r.every((x) => x.p > 0 && x.p < 1), 'probabilidades dentro de (0, 1)');
ok(S.scorers({ m: [], p: [] }, 1).length === 0, 'sin datos → lista vacía');
const rl = S.scorers(T, null); ok(rl.lambda > 1.5 && rl.lambda < 2.5, 'sin λ usa los goles a favor recientes del equipo (' + rl.lambda.toFixed(2) + ')');
ok(S.posGroup('F') === 'Delantero' && S.posGroup('G') === 'Portero' && S.posGroup('CD') === 'Defensa' && S.posGroup('AM-L') === 'Mediapunta' && S.posGroup('CM-R') === 'Centrocampista' && S.posGroup('SUB') === 'Suplente' && S.posGroup('???') === 'Jugador', 'grupos de posición');

console.log('[S2] xG por geometría');
const coef = [-2.2, -0.05, 1.9];
ok(S.xgOf(coef, 94, 50) > S.xgOf(coef, 75, 50) && S.xgOf(coef, 75, 50) > S.xgOf(coef, 60, 50), 'más cerca del arco, más xG');
ok(S.xgOf(coef, 90, 50) > S.xgOf(coef, 90, 10), 'de frente vale más que desde un ángulo cerrado');
ok(S.xgOf(coef, 88, 50, false, true) === 0.76, 'penal = 0,76');

console.log('[S3] Mapa de calor y zonas');
const H = S.heat([[95, 50, 'g', 50, 0, 0], [94, 52, 't', 30, 0, 0], [93, 48, 'o', 10, 1, 0]], { cols: 26, rows: 17 });
const imax = H.cells.indexOf(H.max), cx = ((imax % H.cols) + 0.5) * 100 / H.cols, cy = (Math.floor(imax / H.cols) + 0.5) * 100 / H.rows;
ok(H.n === 3 && cx > 88 && near(cy, 50, 8), 'el máximo cae donde se agrupan los tiros (' + cx.toFixed(0) + ', ' + cy.toFixed(0) + ')');
const Hm = S.heat([[95, 50, 'g', 50, 0, 0]], { cols: 26, rows: 17, mirror: true }), im = Hm.cells.indexOf(Hm.max);
ok(((im % Hm.cols) + 0.5) * 100 / Hm.cols < 12, 'modo defensa: el calor se refleja hacia el arco propio (izquierda)');
const Z = S.zones([[97, 50, 'g', 60], [90, 30, 't', 20], [70, 80, 'o', 3], [86, 50, 'b', 10]]);
ok(Z.six === 1 && Z.box === 2 && Z.out === 1 && Z.goals === 1 && Z.onT === 2 && near(Z.xg, 0.93, 1e-9), 'zonas, goles y xG acumulado');
ok(Z.left + Z.mid + Z.right === 4, 'izquierda + centro + derecha = total');
process.exit(fails ? 1 : 0);
