/* Pruebas del informe semanal (sin red). Uso: node tests/informes.test.js */
const I = require('../tools/informes.js');
const C = require('../tools/contenido.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

console.log('[I1] Semanas');
ok(I.monday('2026-11-04') === '2026-11-02' && I.monday('2026-11-02') === '2026-11-02' && I.monday('2026-11-08') === '2026-11-02', 'lunes de una semana');
ok(I.weekStarts('2026-11-04', 3).join() === '2026-10-26,2026-10-19,2026-10-12', 'miércoles: la última semana completa empieza el 26 de oct');
ok(I.weekStarts('2026-11-09', 1)[0] === '2026-11-02', 'lunes siguiente: la semana que acaba de terminar ya cuenta');
ok(I.weekStarts('2026-11-08', 1)[0] === '2026-10-26', 'domingo: la semana en curso no cuenta');
ok(I.rangeText('2026-10-26') === 'del 26 de octubre al 1 de noviembre de 2026' && I.rangeText('2026-12-28') === 'del 28 de diciembre de 2026 al 3 de enero de 2027', 'texto de rango, incluso cruzando el año');

console.log('[I2] Cálculo sobre datos sintéticos');
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pz = (l) => { const L = Math.exp(-l); let q = 0, p = 1; do { q++; p *= rnd(); } while (p > L); return q - 1; };
const teams = ['Alfa', 'Beta', 'Gama', '<b>Delta</b>', 'Épsilon', 'Zeta'], results = [];
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
for (let i = 0; i < 280; i++) for (let k = 0; k < 8; k++) { const h = teams[(i + k) % 6], a = teams[(i + k + 1 + (k % 3)) % 6]; if (h === a) continue; const hs = pz(h === 'Alfa' ? 2.2 : 1.3), as = pz(1.1); results.push({ lg: 'soccer/x.1', d: day(i), h, a, hs, as, w: hs > as ? 'h' : hs === as ? 'd' : 'a', neutral: false }); }
const M = { leagues: [{ id: 'soccer/x.1', sport: 'soccer', name: 'Liga <X>' }], results };
const BTM = { _goals: { cal: {} } };
const rep = I.computeWeek(M, BTM, '2026-09-28');
ok(rep && rep.total >= I.MIN_WEEK_MATCHES && rep.hit <= rep.total && rep.hit > 0, 'semana con partidos: total ' + (rep && rep.total) + ', aciertos ' + (rep && rep.hit));
ok(rep.goals.n === rep.total && rep.goals.markets.length === 4 && rep.goals.markets.every((m) => m.pred > 0 && m.pred < 1 && m.real >= 0 && m.real <= 1), 'mercados de goles con probabilidades válidas');
ok(I.computeWeek(M, BTM, '2020-01-06') === null, 'semana sin partidos → null (no inventa)');
const first = I.computeWeek({ leagues: M.leagues, results: results.filter((r) => r.d < '2026-03-01' || r.d >= '2026-09-28') }, BTM, '2026-09-28');
ok(first && first.total > 0, 'solo usa resultados anteriores al lunes (los de la propia semana no entran al ajuste)');

console.log('[I3] Texto');
const html = I.renderWeek(rep, { sports: [{ name: 'Fútbol', acc: 0.5, base: 0.45, n: 100 }] }, { prev: { start: '2026-09-21' }, next: null });
ok(/Informe semanal del modelo/.test(html) && !/undefined|NaN/.test(html), 'informe sin undefined ni NaN');
ok(!html.includes('<b>Delta</b>') || html.includes('&lt;b&gt;Delta') , 'nombres de equipo escapados');
ok(html.includes('2026-09-21') && html.includes('Semana anterior'), 'navegación a la semana anterior');
ok(I.renderIndex([rep]).includes(rep.start + '/'), 'índice enlaza a cada semana');

console.log('[I4] Guías programadas');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sched = C.GUIAS.filter((g) => g.published);
ok(sched.length >= 4 && sched.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.published)), 'al menos 4 guías con fecha de publicación válida');
const ds = sched.map((g) => g.published).sort();
ok(ds.every((d, i) => i === 0 || (Date.parse(d) - Date.parse(ds[i - 1])) === 7 * 864e5), 'una guía por semana (7 días de separación)');
ok(C.GUIAS.every((g) => (g.rel || []).every((r) => C.guiaBySlug[r])), 'todos los enlaces «sigue leyendo» apuntan a guías que existen');
const st = { nResults: 1, nLeagues: 1, sports: [{ name: 'Fútbol', n: 10, acc: 0.5, base: 0.45 }, { name: 'Baloncesto', n: 10, acc: 0.67, base: 0.55 }], goals: { n: 100, hit: 78, acc: 0.78 } };
ok(C.GUIAS.every((g) => { const t = g.body(st); return t.length > 1500 && !/undefined|NaN/.test(t); }), 'cada guía tiene texto suficiente y sin undefined/NaN');
console.log(fails ? `\nINFORMES FALLÓ (${fails})` : '\nINFORMES OK');
process.exit(fails ? 1 : 0);
