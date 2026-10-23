/* Gate 0 · determinista. Uso: node tests/gate.js  (falla con código 1 si algo está roto) */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const M = require('../js/math.js');

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('[1] Sintaxis de todos los .js');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(__dirname, '..', 'js'))) {
  if (!f.endsWith('.js')) continue;
  try { cp.execFileSync('node', ['--check', f], { stdio: 'pipe' }); ok(true, path.relative(path.join(__dirname, '..'), f)); }
  catch (e) { ok(false, f + ' → ' + e.stderr.toString().split('\n')[0]); }
}

console.log('[2] Criptografía (vectores conocidos)');
ok(M.sha256hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256("abc")');
ok(M.sha256hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'SHA-256("")');
ok(M.sha256hex('a'.repeat(1000)) === '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3', 'SHA-256 mensaje multibloque');
const key = new Uint8Array(20).fill(0x0b);
ok(M.hex(M.hmac(key, M.enc('Hi There'))) === 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7', 'HMAC-SHA256 RFC 4231 #1');
const s1 = M.stream('srv', 'cli', 0), s2 = M.stream('srv', 'cli', 0);
ok(Array.from({ length: 20 }, () => s1.next()).join() === Array.from({ length: 20 }, () => s2.next()).join(), 'stream reproducible (mismas semillas → mismos números)');
ok(M.stream('srv', 'cli', 1).next() !== M.stream('srv', 'cli', 0).next(), 'el nonce cambia el resultado');

console.log('[3] Matemática de juegos (simulación, 400k rondas)');
const N = 400000, rnd = () => Math.random();
// Dados: RTP debe ser ≈99% para cualquier objetivo
for (const [mode, target] of [['over', 50], ['under', 25], ['over', 90], ['under', 2]]) {
  const ch = M.diceChance(mode, target), mult = M.diceMultiplier(ch); let ret = 0;
  for (let i = 0; i < N; i++) if (M.diceWin(mode, target, M.diceRoll(rnd()))) ret += mult;
  ok(near(ret / N, 0.99, 0.03), `Dados ${mode} ${target}: RTP ${(ret / N * 100).toFixed(1)}%`);
}
ok(M.diceMultiplier(49.5) === 2, 'Dados: 49.5% → ×2.0000');
// Crash
let ge2 = 0, inst = 0;
for (let i = 0; i < N; i++) { const c = M.crashPoint(rnd()); if (c >= 2) ge2++; if (c === 1) inst++; }
ok(near(ge2 / N, 0.495, 0.01), `Crash: P(≥2×) = ${(ge2 / N * 100).toFixed(1)}% (esperado 49.5%)`);
ok(near(inst / N, 0.02, 0.005), `Crash: P(se redondea a 1.00×) = ${(inst / N * 100).toFixed(2)}% (esperado ≈2%)`);
// Minas
ok(M.minesMultiplier(3, 1) === 1.12, 'Minas: 3 minas, 1 acierto = ×1.12');
ok(M.minesMultiplier(24, 1) === 24.75, 'Minas: 24 minas, 1 acierto = ×24.75');
ok(M.minesMultiplier(1, 24) === 24.75, 'Minas: 1 mina, 24 aciertos = ×24.75');
for (const [m, k] of [[3, 4], [10, 2]]) {
  let w = 0; const T = 200000;
  for (let i = 0; i < T; i++) { const pos = new Set(M.minesPositions({ next: rnd }, m)); let good = true; for (let j = 0; j < k; j++) if (pos.has(j)) good = false; if (good) w++; }
  ok(near((w / T) * M.minesMultiplier(m, k), 0.99, 0.03), `Minas ${m}m/${k}: RTP ${((w / T) * M.minesMultiplier(m, k) * 100).toFixed(1)}%`);
}
ok(new Set(M.minesPositions(M.stream('a', 'b', 0), 10)).size === 10, 'Minas: posiciones sin repetir');
// Ruleta
ok(M.WHEEL.length === 37 && new Set(M.WHEEL).size === 37, 'Ruleta: 37 casillas únicas');
ok(M.rouletteReturn([{ type: 'n', value: 17, amount: 1 }], 17) === 36, 'Ruleta: pleno paga 35:1');
ok(M.rouletteReturn([{ type: 'red', value: null, amount: 10 }], 0) === 0, 'Ruleta: el 0 pierde apuestas externas');
ok(M.rouletteReturn([{ type: 'd2', value: null, amount: 1 }], 14) === 3, 'Ruleta: docena paga 2:1');
for (const t of ['red', 'black', 'even', 'odd', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3']) {
  let r = 0; for (let n = 0; n < 37; n++) r += M.rouletteReturn([{ type: t, value: null, amount: 1 }], n);
  ok(near(r / 37, 36 / 37, 1e-9), `Ruleta ${t}: RTP ${(r / 37 * 100).toFixed(2)}% (97.30%)`);
}
// Tragaperras (exacto, enumerando)
const rtp = M.slotRTP();
ok(rtp > 0.94 && rtp < 0.975, `Tragaperras: RTP exacto ${(rtp * 100).toFixed(2)}% (objetivo 94–97.5%)`);
ok(M.SLOT_STRIP.length === 32, 'Tragaperras: cinta de 32');
// Blackjack
ok(M.handValue([0, 12]).total === 21 && M.isBlackjack([0, 12]), 'BJ: A+K = 21 blackjack');
ok(M.handValue([0, 0, 8]).total === 21, 'BJ: A+A+9 = 21');
ok(M.handValue([12, 11, 5]).total === 26, 'BJ: K+Q+6 = 26 (bust)');
ok(M.bjSettle([0, 12], [5, 6]) === 2.5 && M.bjSettle([12, 6], [12, 6]) === 1 && M.bjSettle([12, 11, 5], [1, 1]) === 0, 'BJ: pagos 3:2 / push / bust');
ok(new Set(M.newDeck(M.stream('x', 'y', 0))).size === 52, 'BJ: mazo de 52 únicas');

console.log('[4] Estructura de la app (index.html = Predictor, casino.html = casino)');
const root = path.join(__dirname, '..');
for (const page of ['index.html', 'casino.html']) {
  if (page === 'casino.html' && !fs.existsSync(path.join(root, page))) { console.log('  (sin casino.html: prototipo no incluido, correcto para el repositorio público)'); continue; }
  const html = fs.existsSync(path.join(root, page)) ? fs.readFileSync(path.join(root, page), 'utf8') : '';
  ok(!!html, page + ' existe');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css|data)\/[^"?]+)[^"]*"/g)].map((m) => m[1]);
  refs.forEach((r) => ok(fs.existsSync(path.join(root, r)) || r.startsWith('data/'), page + ' → ' + r));
}
if (fs.existsSync(path.join(root, 'casino.html')) && fs.existsSync(path.join(root, 'js', 'games'))) {
  const html = fs.readFileSync(path.join(root, 'casino.html'), 'utf8'), gamesDir = path.join(root, 'js', 'games');
  fs.readdirSync(gamesDir).filter((f) => f.endsWith('.js')).forEach((f) => ok(html.includes('js/games/' + f), 'juego cargado en casino.html: ' + f));
}

console.log('[5] Modelo deportivo');
try { cp.execFileSync('node', [path.join(__dirname, 'model.test.js')], { stdio: 'pipe' }); ok(true, 'tests/model.test.js'); }
catch (e) { ok(false, 'tests/model.test.js\n' + e.stdout.toString().split('\n').filter((l) => l.includes('✗')).join('\n')); }

console.log('[5b] Modelo multi-deporte');
try { cp.execFileSync('node', [path.join(__dirname, 'multi.test.js')], { stdio: 'pipe' }); ok(true, 'tests/multi.test.js'); }
catch (e) { ok(false, 'tests/multi.test.js\n' + e.stdout.toString().split('\n').filter((l) => l.includes('✗')).join('\n')); }

console.log('[5c] Datos multi-deporte (si existen)');
const mp = path.join(root, 'data', 'multi.json');
if (fs.existsSync(mp)) {
  const MU = JSON.parse(fs.readFileSync(mp, 'utf8')), lgs = new Set(MU.leagues.map((l) => l.id));
  ok(MU.leagues.length > 20 && MU.results.length > 5000 && MU.events.length > 20, `multi: ${MU.leagues.length} ligas, ${MU.results.length} resultados, ${MU.events.length} eventos`);
  ok(lgs.has('soccer/per.1'), 'incluye la Liga 1 de Perú');
  ok(['soccer', 'basketball', 'baseball', 'football', 'hockey', 'mma', 'tennis'].every((sp) => MU.leagues.some((l) => l.sport === sp)), 'cubre fútbol, baloncesto, béisbol, NFL, hockey, MMA y tenis');
  ok(MU.events.every((e) => lgs.has(e.lg) && e.id && e.h && e.a && !isNaN(Date.parse(e.ko))), 'eventos: campos y liga válida');
  ok(MU.results.every((r) => lgs.has(r.lg) && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && ['h', 'a', 'd'].includes(r.w)), 'resultados: fecha y ganador válidos');
  ok(MU.results.filter((r) => r.hs != null && r.as != null).every((r) => (r.hs > r.as ? 'h' : r.hs < r.as ? 'a' : 'd') === r.w || r.ot), 'resultados: ganador coherente con el marcador (salvo prórroga/penales)');
  ok(MU.events.every((e) => !e.odds || Object.values(e.odds).every((b) => !b.ml || b.ml.filter((x) => x != null).every((x) => x > 1))), 'cuotas multi > 1');
  ok(fs.existsSync(path.join(root, 'data', 'multi.js')), 'data/multi.js');
  { // el paquete compacto de la web debe expandirse a los mismos datos que multi.json
    const sandbox = {}; new Function('window', fs.readFileSync(path.join(root, 'data', 'multi.js'), 'utf8'))(sandbox);
    const P = sandbox.AURUM_MULTI_PACKED; ok(!!P && P.results.length === MU.results.length && P.events.length === MU.events.length, 'multi.js empaquetado: ' + (P && P.results.length) + ' resultados = multi.json');
    const i = Math.floor(P.results.length / 2), r = P.results[i], o = MU.results[i];
    ok(P.leagues[r[0]].id === o.lg && P.teams[r[2]] === o.h && P.teams[r[3]] === o.a && r[1] === o.d && r[6] === o.w, 'multi.js empaquetado coincide en un resultado de muestra');
  }
} else console.log('  (sin data/multi.json: ejecuta python3 tools/fetch_espn.py)');

console.log('[5d] Herramientas Python (sin red)');
for (const t of ['test_fetch.py', 'test_espn.py', 'test_serve.py', 'test_odds_api.py', 'test_build.py']) {
  try { cp.execFileSync('python3', ['-I', path.join(root, 'tools', t)], { stdio: 'pipe', timeout: 60000 }); ok(true, 'tools/' + t); }
  catch (e) { ok(false, 'tools/' + t + ' ' + String((e.stderr || '')).split('\n').slice(-4).join(' ')); }
}

console.log('[5e] Lista de casas con licencia en Perú y cuotas de The Odds API (si existen)');
{
  const cp = path.join(root, 'data', 'casas_peru.json');
  if (fs.existsSync(cp)) { const C = JSON.parse(fs.readFileSync(cp, 'utf8')); ok(C.marcas.length > 30 && C.marcas.every((m) => m.marca && m.empresa) && /mincetur/i.test(C.registro_oficial), `casas_peru: ${C.marcas.length} marcas, con enlace al registro oficial y aviso`); ok(/NO es el registro oficial/i.test(C.fuente), 'casas_peru declara que NO es el registro oficial'); ok(fs.existsSync(path.join(root, 'data', 'casas_peru.js')), 'data/casas_peru.js'); }
  const oa = path.join(root, 'data', 'odds_api.json');
  if (fs.existsSync(oa)) { const O = JSON.parse(fs.readFileSync(oa, 'utf8')); ok(Array.isArray(O.events) && O.events.every((e) => e.h && e.a && e.ko && Object.values(e.books).every((b) => b.ml.filter((x) => x != null).every((x) => x > 1))), 'odds_api: ' + O.events.length + ' eventos con cuotas > 1'); }
  else console.log('  (sin data/odds_api.json: opcional, requiere ODDS_API_KEY)');
}

console.log('[5f] Publicación');
{
  const wf = path.join(root, '.github', 'workflows', 'publicar.yml'), gi = path.join(root, '.gitignore');
  ok(fs.existsSync(wf) && /build_site\.py/.test(fs.readFileSync(wf, 'utf8')) && /deploy-pages/.test(fs.readFileSync(wf, 'utf8')), 'workflow de GitHub Pages usa build_site.py y deploy-pages');
  ok(!/ODDS_API_KEY:\s*['"]?[A-Za-z0-9]{16,}/.test(fs.readFileSync(wf, 'utf8')), 'workflow no contiene ninguna clave escrita');
  const g = fs.readFileSync(gi, 'utf8'); ok(/tools\/\.odds_api_key/.test(g) && /data\/raw/.test(g) && /dist\//.test(g), '.gitignore excluye la clave, cachés y dist/');
  ok(fs.existsSync(path.join(root, 'DESPLIEGUE.md')), 'DESPLIEGUE.md');
}

console.log('[6] Datos (si existen)');
const hp = path.join(root, 'data', 'history.json'), fp = path.join(root, 'data', 'fixtures.json');
if (fs.existsSync(hp) && fs.existsSync(fp)) {
  const H = JSON.parse(fs.readFileSync(hp, 'utf8')), F = JSON.parse(fs.readFileSync(fp, 'utf8'));
  ok(H.matches.length > 1000, 'histórico: ' + H.matches.length + ' partidos');
  ok(H.matches.every((m) => m.d && m.lg && m.h && m.a && Number.isInteger(m.hg) && Number.isInteger(m.ag)), 'histórico: campos obligatorios');
  ok(H.matches.every((m, i) => i === 0 || H.matches[i - 1].d <= m.d), 'histórico ordenado por fecha');
  ok(H.matches.every((m) => !m.o || Object.values(m.o).every((a) => a.every((x) => x > 1))), 'histórico: cuotas > 1');
  ok(F.events.every((e) => e.id && e.ko && e.h && e.a && Object.keys(e.books).length), 'fixtures: ' + F.events.length + ' eventos con casas' + (F.events.length ? '' : ' (ninguno ahora: válido, p. ej. parón de selecciones)'));
  ok(F.events.every((e) => Object.values(e.books).every((b) => !b['1x2'] || b['1x2'].every((x) => x > 1))), 'fixtures: cuotas > 1');
  const known = new Set(H.matches.flatMap((m) => [m.lg + '|' + m.h, m.lg + '|' + m.a]));
  const miss = F.events.flatMap((e) => [e.h, e.a].filter((t) => !known.has(e.lg + '|' + t)).map((t) => e.lg + ':' + t));
  ok(miss.length <= Math.ceil(F.events.length * 0.03), 'fixtures: equipos sin histórico ' + miss.length + (miss.length ? ' (' + miss.slice(0, 6).join(', ') + ')' : ''));
  for (const f of ['history.js', 'fixtures.js']) ok(fs.existsSync(path.join(root, 'data', f)), 'data/' + f + ' (para abrir sin servidor)');
} else console.log('  (sin data/ todavía: ejecuta python3 tools/fetch_data.py)');

console.log(fails ? `\nGATE FALLÓ (${fails})` : '\nGATE OK');
process.exit(fails ? 1 : 0);
