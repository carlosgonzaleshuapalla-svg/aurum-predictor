/* Pruebas de las páginas para buscadores (sin red). Uso: node tests/seo.test.js */
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../tools/build_seo.js');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

console.log('[S1] Utilidades');
ok(S.slugify('Liga 1 (Perú)') === 'liga-1-peru', 'slug sin tildes ni paréntesis');
ok(S.esc('<script>"a"&\'b\'') === '&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;', 'escapa HTML');
const sl = S.leagueSlugs([{ id: 'a/1', name: 'Premier League' }, { id: 'b/2', name: 'Premier League' }]);
ok(sl['a/1'] !== sl['b/2'], 'nombres repetidos → slugs distintos');

console.log('[S1b] Banderas');
const FL = require('../js/flags.js'), fs2 = require('fs');
ok(FL.flagFor({ id: 'soccer/per.1', country: 'PE' }).code === 'pe', 'Perú → pe');
ok(FL.flagFor({ id: 'soccer/eng.2', country: 'GB' }).code === 'gb-eng' && FL.flagFor({ id: 'soccer/sco.1', country: 'GB' }).code === 'gb-sct', 'Reino Unido se separa en Inglaterra y Escocia');
ok(FL.flagFor({ id: 'soccer/uefa.champions', country: 'EU' }).code === 'eu' && FL.flagFor({ id: 'soccer/conmebol.libertadores', country: 'SA' }).emoji, 'UEFA → UE; Conmebol → globo (no confundir SA con Arabia Saudita)');
ok(FL.flagFor({ id: 'x/y', country: 'ZZ' }) === null && FL.flagFor(null) === null, 'país desconocido → sin bandera');
ok(Array.from(FL.HAVE).every((c) => fs2.existsSync(require('path').join(__dirname, '..', 'flags', c + '.svg'))), 'cada bandera declarada existe como archivo en flags/');
ok(FL.athleteFlagHtml('GER', '../../', S.esc).includes('src="../../flags/de.svg"') && FL.athleteFlagHtml('blank', '', S.esc) === '' && FL.athleteFlagHtml('"><script>', '', S.esc) === '', 'deportistas: código ESPN → archivo de bandera; desconocidos o raros → nada');
ok(Object.values(FL.IOC).every((f) => FL.HAVE.has(f)), 'todo código de ESPN apunta a una bandera que existe');
ok(!FL.flagHtml({ id: 'a', country: 'PE' }, '../../', S.esc).includes('onerror'), 'HTML de bandera sin atributos de evento');

console.log('[S2] Generación sobre un dist sintético');
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
fs.mkdirSync(path.join(dist, 'data'));
fs.writeFileSync(path.join(dist, 'index.html'), '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><meta name="google-adsense-account" content="ca-pub-1234567890123456"><link rel="stylesheet" href="css/styles.css?v=9"><link rel="stylesheet" href="css/predictor.css?v=9"></head><body><script src="js/ads.js?v=9"></script></body></html>');
const teams = ['Alfa', 'Beta', 'Gama', '<b>Delta</b>'], res = [];
let k = 0;
for (let r = 0; r < 14; r++) for (let h = 0; h < 4; h++) for (let a = 0; a < 4; a++) if (h !== a) {
  const hs = (h + r) % 3, as = (a + k) % 2; k++;
  res.push([0, new Date(Date.UTC(2026, 0, 1) + k * 864e5 / 3).toISOString().slice(0, 10), h, a, hs, as, hs > as ? 'h' : hs === as ? 'd' : 'a', 0]);
}
const future = new Date(Date.now() + 2 * 864e5).toISOString();
const packed = { generated: new Date().toISOString(), source: 'espn', teams, leagues: [{ id: 'soccer/per.1', sport: 'soccer', sportName: 'Fútbol', name: 'Liga 1 (Perú)', country: 'PE', draw: true }, { id: 'soccer/x.1', sport: 'soccer', sportName: 'Fútbol', name: 'Liga Chica', draw: true }],
  events: [{ id: '1', lg: 'soccer/per.1', ko: future, h: 'Alfa', a: '<b>Delta</b>', status: 'pre', neutral: false, odds: null },
    { id: '2', lg: 'soccer/per.1', ko: new Date(Date.now() + 864e5).toISOString(), h: 'Beta', a: 'Gama', status: 'pre', neutral: false, odds: null, hl: 'soccer/500/1.png', al: 'soccer/500/2.png" onerror="a.png' }], results: res };
fs.writeFileSync(path.join(dist, 'data', 'multi.js'), 'window.AURUM_MULTI_PACKED = ' + JSON.stringify(packed) + ';');
fs.writeFileSync(path.join(dist, 'data', 'backtest_multi.js'), 'window.AURUM_BT_MULTI = {"soccer/per.1":{"sport":"soccer","n":120,"acc":0.5,"baseAcc":0.45}};');
const r = S.build(dist);
ok(r.pages === 1, 'solo las ligas con histórico suficiente (o Perú) tienen página: ' + r.pages);
const page = fs.readFileSync(path.join(dist, 'ligas', 'liga-1-peru', 'index.html'), 'utf8');
ok(/<title>Pronósticos Liga 1 \(Perú\)/.test(page) && page.includes('<link rel="canonical" href="https://aurum-predictor.com/ligas/liga-1-peru/">'), 'título y canonical');
ok(page.includes('Content-Security-Policy') && page.includes('google-adsense-account'), 'hereda la CSP y la etiqueta de AdSense del index');
ok(page.includes('../../css/styles.css?v=9') && page.includes('../../js/ads.js?v=9'), 'rutas relativas con versión');
ok(!page.includes('<b>Delta</b>') && page.includes('&lt;b&gt;Delta&lt;/b&gt;'), 'nombres de equipo escapados (sin inyección)');
ok(/Gana Alfa|Gana &lt;b&gt;Delta|Empate/.test(page) && page.includes('Cuota justa'), 'pronóstico y cuota justa del próximo partido');
ok(page.includes('src="../../flags/pe.svg"'), 'página de liga con la bandera del país (ruta relativa)');
ok(/ludopat/.test(page) && /No acepta apuestas/.test(page), 'aviso de juego responsable y de que no acepta apuestas');
ok(!/DraftKings/i.test(page), 'sin cuotas de DraftKings');
const idx = fs.readFileSync(path.join(dist, 'ligas', 'index.html'), 'utf8');
ok(idx.includes('href="liga-1-peru/"'), 'índice de ligas enlaza la página');
const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
ok(sm.includes('<loc>https://aurum-predictor.com/ligas/liga-1-peru/</loc>') && sm.includes('<loc>https://aurum-predictor.com/</loc>'), 'sitemap con portada y liga');
ok(fs.readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes('Sitemap: https://aurum-predictor.com/sitemap.xml'), 'robots.txt apunta al sitemap');
const mdirs = fs.readdirSync(path.join(dist, 'partidos'));
ok(mdirs.length === 2 && mdirs.every((d) => /^liga-1-peru-.*-vs-.*-\d{4}-\d{2}-\d{2}$/.test(d)), 'una página por partido próximo con slug estable (liga-equipos-fecha): ' + mdirs.join(', '));
const mp = fs.readFileSync(path.join(dist, 'partidos', mdirs.find((d) => d.includes('beta-vs-gama')), 'index.html'), 'utf8');
ok(/<h1>\s*Beta vs\s+Gama: pronóstico, probabilidades y cuota justa<\/h1>/.test(mp.replace(/<img[^>]*>/g, '')) && mp.includes('"@type":"SportsEvent"') && mp.includes('Forma reciente') && mp.includes('Fiabilidad del modelo'), 'página de partido: título, SportsEvent, forma y fiabilidad');
ok(/ludopat/.test(mp) && /No es una apuesta segura/.test(mp), 'partido: aviso de juego responsable');
ok(mp.includes('combiner/i?img=/i/teamlogos/soccer/500/1.png&amp;w=48') && !mp.includes('onerror'), 'escudo válido sí; ruta con inyección descartada');
const dp = fs.readdirSync(path.join(dist, 'partidos')).map((d) => fs.readFileSync(path.join(dist, 'partidos', d, 'index.html'), 'utf8')).join('');
ok(!dp.includes('<b>Delta</b>') && dp.includes('&lt;b&gt;Delta&lt;/b&gt;'), 'partidos: equipos escapados');
const mn = fs.readFileSync(path.join(dist, 'pronosticos-manana', 'index.html'), 'utf8'), hy = fs.readFileSync(path.join(dist, 'pronosticos-hoy', 'index.html'), 'utf8');
ok(mn.includes('Beta – Gama') && !mn.includes('Alfa –'), 'mañana: lista solo los partidos de mañana (Lima)');
ok(hy.includes('Pronósticos deportivos de hoy') && sm.includes('/pronosticos-hoy/') && sm.includes('/partidos/' + mdirs[0] + '/'), 'hoy existe y el sitemap incluye hoy, mañana y partidos');
let threw = false; try { S.build(path.join(dist, 'nada')); } catch (e) { threw = true; }
ok(threw, 'sin dist/ publicado falla con un mensaje claro');
fs.rmSync(dist, { recursive: true, force: true });
if (fails) { console.log('\n' + fails + ' fallos'); process.exit(1); }
console.log('\nSEO OK');
