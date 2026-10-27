#!/usr/bin/env node
/* Aurum Predictor · páginas estáticas para buscadores.
   Uso: node tools/build_seo.js [--dist dist]   (después de tools/build_site.py)

   La web principal pinta todo con JavaScript y rutas con «#», que Google casi no indexa. Aquí se genera, dentro de dist/,
   una página HTML real por liga (ligas/<liga>/index.html) con el pronóstico de los próximos partidos, la forma reciente,
   los últimos resultados y el acierto histórico del modelo, más ligas/index.html, sitemap.xml y robots.txt.
   Lee SOLO los datos ya publicados en dist/ (sin cuotas de DraftKings): lo que sale aquí es lo mismo que ve cualquiera en la web. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = (process.env.SITE_URL || 'https://aurum-predictor.com').replace(/\/+$/, '');
const MIN_RESULTS = 150;                    // ligas con menos histórico no tienen página (contenido pobre)
const SPORT_NAME = { soccer: 'Fútbol', basketball: 'Baloncesto', baseball: 'Béisbol', football: 'Fútbol americano', hockey: 'Hockey', mma: 'MMA / UFC', tennis: 'Tenis', rugby: 'Rugby', volleyball: 'Vóley', cricket: 'Críquet' };
const SPORT_ORDER = ['soccer', 'basketball', 'baseball', 'football', 'hockey', 'mma', 'tennis'];
const CONF = { alta: 'Favorito claro', media: 'Ventaja moderada', baja: 'Pareja / poco fiable' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pct = (p, d) => (p * 100).toFixed(d == null ? 0 : d).replace('.', ',') + ' %';
const odd = (x) => x.toFixed(2).replace('.', ',');

function loadWindow(file) {
  const w = {}; vm.createContext(w); w.window = w;
  vm.runInContext(fs.readFileSync(file, 'utf8'), w);
  return w;
}

// mismo desempaquetado que js/pronosticos.js
function unpackMulti(P) {
  const lgs = P.leagues.map((l) => l.id), T = P.teams;
  return { generated: P.generated, source: P.source, leagues: P.leagues, events: P.events,
    results: P.results.map((r) => { const o = { lg: lgs[r[0]], d: r[1], h: T[r[2]], a: T[r[3]], hs: r[4] < 0 ? null : r[4], as: r[5] < 0 ? null : r[5], w: r[6], neutral: !!(r[7] & 1) }; if (r[7] & 2) o.ot = true; if (r[7] & 4) o.pre = true; return o; }) };
}

function limaWhen(iso) {
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

const FLAGS = require('../js/flags.js');
const fl = (lg, prefix) => FLAGS.flagHtml(lg, prefix, esc);
const CREST_RE = /^[a-z0-9_-]{2,30}(\/[a-z0-9_-]{1,30}){0,2}\/[A-Za-z0-9_-]{1,40}\.png$/;
const crest = (p) => (p && CREST_RE.test(p) ? '<img class="crest" src="https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + esc(p) + '&amp;w=48&amp;h=48" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer"> ' : '');
const side = (path, code, prefix) => crest(path) || FLAGS.athleteFlagHtml(code, prefix, esc);
const teamsHtml = (e, sep, prefix) => side(e.hl, e.hf, prefix) + esc(e.h) + sep + side(e.al, e.af, prefix) + esc(e.a);
const limaYMD = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const limaLong = (ymd) => new Date(ymd + 'T12:00:00Z').toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function leagueSlugs(leagues) {
  const used = {}, out = {};
  for (const l of leagues) {
    let s = slugify(l.name) || slugify(l.id);
    if (used[s]) s += '-' + slugify(l.id);
    used[s] = true; out[l.id] = s;
  }
  return out;
}

function resultText(r) {
  if (r.hs != null && r.as != null) return r.h + ' ' + r.hs + '-' + r.as + ' ' + r.a;
  return r.w === 'h' ? r.h + ' venció a ' + r.a : r.w === 'a' ? r.a + ' venció a ' + r.h : r.h + ' – ' + r.a;
}

// forma reciente: puntos en los últimos 5 partidos de cada equipo (solo deportes con marcador)
function form(results, draw) {
  const by = {};
  for (const r of results) {
    if (r.hs == null || r.as == null) continue;
    for (const [t, gf, ga] of [[r.h, r.hs, r.as], [r.a, r.as, r.hs]]) (by[t] = by[t] || []).push({ d: r.d, gf, ga });
  }
  const last = results.length ? results[results.length - 1].d : '';
  const lim = new Date(Date.parse(last) - 120 * 864e5).toISOString().slice(0, 10);
  const rows = [];
  for (const t in by) {
    const g = by[t].slice(-5);
    if (g.length < 5 || g[g.length - 1].d < lim) continue;
    let pts = 0, w = 0, d = 0, l = 0, gd = 0;
    for (const x of g) { gd += x.gf - x.ga; if (x.gf > x.ga) { w++; pts += draw ? 3 : 1; } else if (x.gf === x.ga) { d++; pts += draw ? 1 : 0; } else l++; }
    rows.push({ t, pts, w, d, l, gd });
  }
  return rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || a.t.localeCompare(b.t)).slice(0, 8);
}

function shell(opts) {
  // opts: title, desc, canonical, depth, headBits, body
  const up = '../'.repeat(opts.depth);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: opts.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: c[1] })) };
  return '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  ' + opts.headBits.join('\n  ') + '\n' +
    '  <title>' + esc(opts.title) + '</title>\n  <meta name="description" content="' + esc(opts.desc) + '">\n' +
    '  <link rel="canonical" href="' + esc(opts.canonical) + '">\n  <meta name="robots" content="index,follow,max-image-preview:large">\n  <meta name="theme-color" content="#08080a">\n' +
    '  <meta property="og:type" content="website"><meta property="og:locale" content="es_PE"><meta property="og:site_name" content="Aurum Predictor">\n' +
    '  <meta property="og:title" content="' + esc(opts.title) + '"><meta property="og:description" content="' + esc(opts.desc) + '"><meta property="og:url" content="' + esc(opts.canonical) + '">\n' +
    '  <link rel="stylesheet" href="' + up + opts.css[0] + '">\n  <link rel="stylesheet" href="' + up + opts.css[1] + '">\n' +
    '  <script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n' +
    (opts.extraLd ? '  <script type="application/ld+json">' + JSON.stringify(opts.extraLd).replace(/</g, '\\u003c') + '</script>\n' : '') + '</head>\n<body>\n' +
    '  <header class="top"><div class="top-in"><a class="logo" href="' + up + '" aria-label="Aurum Predictor, inicio"><i></i>Aurum<span class="logo-sub">Predictor</span></a>' +
    '<nav class="main" aria-label="Principal"><a href="' + up + '">Pronósticos</a><a href="' + up + 'pronosticos-hoy/">Hoy</a><a href="' + up + 'pronosticos-manana/">Mañana</a><a href="' + up + 'ligas/">Ligas</a></nav></div></header>\n' +
    '  <div class="safebar"><span><b>18+</b> · Herramienta de análisis, no recomendación ni garantía de ganancia. Juega solo en casas autorizadas por MINCETUR; si el juego te afecta, busca ayuda profesional y usa los límites y la autoexclusión de tu casa. <b>Los juegos y apuestas deportivas a distancia realizados en exceso pueden causar ludopatía.</b></span></div>\n' +
    '  <main><div class="wrap pg legal-page seo-page">\n' + opts.body + '\n  </div></main>\n' +
    '  <footer class="foot"><div class="wrap"><p class="legal"><b>Aviso:</b> Aurum Predictor es una herramienta de análisis estadístico. <b>No acepta apuestas, no mueve dinero y no garantiza resultados.</b> Las probabilidades son estimaciones de un modelo y pueden estar equivocadas; las casas incluyen un margen y la mayoría de apostadores pierde a largo plazo. Datos de terceros (ESPN y football-data.co.uk), sin afiliación ni garantía. ' +
    '<a href="' + up + 'pronosticos-hoy/" style="text-decoration:underline">Pronósticos de hoy</a> · <a href="' + up + 'pronosticos-manana/" style="text-decoration:underline">de mañana</a> · <a href="' + up + 'ligas/" style="text-decoration:underline">Ligas</a> · '+
    '<a href="' + up + 'privacidad.html" style="text-decoration:underline">Privacidad y cookies</a> · <a href="#" id="cookie-settings" hidden style="text-decoration:underline">Cookies</a></p></div></footer>\n' +
    '  <script src="' + up + opts.adsJs + '"></script>\n</body>\n</html>\n';
}

function leaguePage(lg, ctxIn) {
  const { M, X, sctx, BTM, slugs, head } = ctxIn;
  const sport = lg.sport, draw = !!lg.draw, sname = SPORT_NAME[sport] || lg.sportName || sport;
  const res = M.results.filter((r) => r.lg === lg.id).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const now = Date.now();
  const evs = M.events.filter((e) => e.lg === lg.id && e.status === 'pre' && Date.parse(e.ko) > now).sort((a, b) => Date.parse(a.ko) - Date.parse(b.ko));
  const bt = BTM[lg.id];
  let body = '<p class="muted"><a href="../">Ligas</a> › ' + esc(sname) + '</p>\n<h1>' + fl(lg, '../../') + 'Pronósticos ' + esc(lg.name) + ': probabilidades y cuota justa</h1>\n';
  body += '<p class="muted">Actualizado: ' + esc((M.generated || '').slice(0, 10)) + ' · se recalcula cada 8 horas.</p>\n';
  const method = X.isGoals(sport) ? 'un modelo de goles (Poisson / Dixon-Coles) ajustado con los partidos recientes de la liga' : 'un sistema de ratings Elo con ventaja de local y pesos por margen, ajustado con los resultados de la liga';
  body += '<p>Estas son las probabilidades que estima Aurum Predictor para los próximos partidos de ' + esc(lg.name) + ' · ' + esc(sname.toLowerCase()) + ', calculadas con ' + method + '. ' +
    'La <b>cuota justa</b> es 1 dividido entre la probabilidad: una casa debería pagar más que ese valor para que la apuesta compense. No es una apuesta segura ni una recomendación.</p>\n';
  body += '<h2>Próximos partidos y pronóstico</h2>\n';
  const rows = [];
  for (const e of evs.slice(0, 20)) {
    const f = ctxIn.fcMap[e.id], url = ctxIn.matchUrl[e.id];
    const name = url ? '<a href="../../partidos/' + url + '/" style="text-decoration:underline">' + teamsHtml(e, ' – ', '../../') + '</a>' : teamsHtml(e, ' – ', '../../');
    if (!f) { rows.push('<tr><td>' + name + '</td><td>' + esc(limaWhen(e.ko)) + '</td><td colspan="3" class="muted">Sin pronóstico: datos insuficientes</td></tr>'); continue; }
    const pk = f.pick;
    rows.push('<tr><td>' + name + '</td><td style="white-space:nowrap">' + esc(limaWhen(e.ko)) + '</td><td><b>' + esc(pk.label) + '</b><br><small class="muted">' + esc(CONF[pk.conf] || '') + '</small></td><td class="r">' + pct(pk.p) + '</td><td class="r">' + odd(pk.fairOdds) + '</td></tr>');
  }
  if (rows.length) body += '<div class="table-wrap"><table class="tbl"><thead><tr><th>Partido</th><th>Hora (Lima)</th><th>Pronóstico</th><th class="r">Probabilidad</th><th class="r">Cuota justa</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>\n';
  else body += '<p class="muted">No hay partidos programados en los próximos días (pausa de la liga o calendario aún no publicado). Esta página se actualiza sola cuando haya.</p>\n';
  body += '<p><a href="../../" style="text-decoration:underline">Abrir el comparador completo con cuotas, valor y combinadas →</a></p>\n';

  if (draw && res.length) {
    const fr = form(res, true);
    if (fr.length) body += '<h2>Mejor forma reciente</h2>\n<p class="muted">Puntos en los últimos 5 partidos de cada equipo (3 por victoria, 1 por empate).</p>\n<div class="table-wrap"><table class="tbl"><thead><tr><th>Equipo</th><th class="r">Pts</th><th class="r">G-E-P</th><th class="r">Dif. goles</th></tr></thead><tbody>' +
      fr.map((r) => '<tr><td>' + esc(r.t) + '</td><td class="r">' + r.pts + '</td><td class="r">' + r.w + '-' + r.d + '-' + r.l + '</td><td class="r">' + (r.gd > 0 ? '+' : '') + r.gd + '</td></tr>').join('') + '</tbody></table></div>\n';
  }
  if (res.length) body += '<h2>Últimos resultados</h2>\n<ul>' + res.slice(-8).reverse().map((r) => '<li>' + esc(r.d) + ' · ' + esc(resultText(r)) + '</li>').join('') + '</ul>\n';

  body += '<h2>¿Qué tan fiable es el modelo en esta liga?</h2>\n';
  if (bt && bt.n >= 30) body += '<p>En una prueba histórica sin mirar el futuro («walk-forward»), el modelo acertó el resultado más probable en el <b>' + pct(bt.acc) + '</b> de ' + bt.n + ' partidos' + (bt.baseAcc != null ? '; elegir siempre al local habría acertado el ' + pct(bt.baseAcc) + '' : '') + '. Acertar más que el azar no basta para ganar dinero: las casas ya descuentan esa información en sus cuotas.</p>\n';
  else body += '<p>Aún no hay histórico suficiente en esta liga para medir el acierto del modelo; tómalo como una referencia orientativa.</p>\n';
  body += '<p class="hint">Base de datos: ' + res.length + ' resultados de ' + esc(lg.name) + ' (fuente: ESPN, sin afiliación). Más detalles en <a href="../../#/modelo" style="text-decoration:underline">Modelo y backtest</a>.</p>\n';

  const desc = ('Pronósticos de ' + lg.name + ': probabilidad de cada resultado y cuota justa para los próximos partidos, forma reciente y acierto histórico del modelo.').slice(0, 158);
  return shell({ title: 'Pronósticos ' + lg.name + ' · cuota justa y probabilidades | Aurum Predictor', desc, canonical: SITE + '/ligas/' + slugs[lg.id] + '/', depth: 2, ...head,
    crumbs: [['Inicio', SITE + '/'], ['Ligas', SITE + '/ligas/'], [lg.name, SITE + '/ligas/' + slugs[lg.id] + '/']], body });
}


function lastGames(res, team, n) {
  return res.filter((r) => r.h === team || r.a === team).slice(-n).reverse().map((r) => {
    const home = r.h === team, opp = home ? r.a : r.h;
    let res_ = r.w === (home ? 'h' : 'a') ? 'G' : r.w === 'd' ? 'E' : 'P';
    const sc = r.hs != null && r.as != null ? (home ? r.hs + '-' + r.as : r.as + '-' + r.hs) : '';
    return '<li>' + esc(r.d) + ' · <b>' + res_ + '</b> ' + sc + ' ' + (home ? 'vs ' : 'en ') + esc(opp) + '</li>';
  });
}

function matchPage(it, ctxIn) {
  const { M, slugs, head } = ctxIn;
  const { e, lg, f, url } = it, pk = f.pick, res = it.res;
  const when = limaWhen(e.ko), day = limaYMD(e.ko);
  const parts = f.labels.map((l, i) => l + ' ' + pct(f.p[i])).join(', ');
  let body = '<p class="muted"><a href="../../ligas/">Ligas</a> › <a href="../../ligas/' + slugs[lg.id] + '/">' + esc(lg.name) + '</a></p>\n';
  body += '<h1>' + teamsHtml(e, ' vs ', '../../') + ': pronóstico, probabilidades y cuota justa</h1>\n';
  body += '<p class="muted">' + fl(lg, '../../') + esc(lg.name) + ' · ' + esc(when) + ' (hora de Lima) · actualizado ' + esc((M.generated || '').slice(0, 10)) + '</p>\n';
  body += '<p>Para el partido <b>' + esc(e.h) + ' – ' + esc(e.a) + '</b> de ' + esc(lg.name) + ', el modelo de Aurum Predictor estima: ' + esc(parts) + '. ' +
    'El resultado más probable es <b>' + esc(pk.label) + '</b> (' + pct(pk.p) + '), con una cuota justa de <b>' + odd(pk.fairOdds) + '</b>: una casa tendría que pagar más que eso para que valga la pena. ' +
    (pk.conf === 'baja' ? 'Es un partido parejo y el pronóstico es poco fiable. ' : pk.conf === 'alta' ? 'Es un favorito claro, pero un favorito claro también falla: ' + pct(1 - pk.p) + ' de las veces el resultado es otro. ' : '') +
    'No es una apuesta segura ni una recomendación.</p>\n';
  body += '<h2>Probabilidades y cuota justa</h2>\n<div class="table-wrap"><table class="tbl"><thead><tr><th>Resultado</th><th class="r">Probabilidad</th><th class="r">Cuota justa</th></tr></thead><tbody>' +
    f.labels.map((l, i) => '<tr><td>' + (i === pk.i ? '<b>' + esc(l) + '</b>' : esc(l)) + '</td><td class="r">' + pct(f.p[i]) + '</td><td class="r">' + odd(1 / f.p[i]) + '</td></tr>').join('') + '</tbody></table></div>\n';
  body += '<p class="hint">Cuota justa = 1 ÷ probabilidad. ' + (f.info && f.info.reliable === false ? 'Hay pocos datos de alguno de los equipos: tómalo con cautela. ' : '') + (f.info && f.info.cross ? 'Los equipos vienen de ligas distintas: la fiabilidad es limitada. ' : '') + 'En el comparador completo puedes añadir la cuota de tu casa para ver si paga más que la justa.</p>\n';
  body += '<p><a href="../../" style="text-decoration:underline">Abrir el comparador completo →</a></p>\n';
  const fh = lastGames(res, e.h, 5), fa = lastGames(res, e.a, 5);
  if (fh.length || fa.length) body += '<h2>Forma reciente</h2>\n<div class="pgrid2"><div><h3>' + esc(e.h) + '</h3><ul>' + fh.join('') + '</ul></div><div><h3>' + esc(e.a) + '</h3><ul>' + fa.join('') + '</ul></div></div>\n<p class="hint">G = ganó, E = empató, P = perdió.</p>\n';
  const h2h = res.filter((r) => (r.h === e.h && r.a === e.a) || (r.h === e.a && r.a === e.h)).slice(-5).reverse();
  if (h2h.length) body += '<h2>Enfrentamientos previos</h2>\n<ul>' + h2h.map((r) => '<li>' + esc(r.d) + ' · ' + esc(resultText(r)) + '</li>').join('') + '</ul>\n';
  const bt = ctxIn.BTM[lg.id];
  if (bt && bt.n >= 30) body += '<h2>Fiabilidad del modelo en esta liga</h2>\n<p>En una prueba histórica sin mirar el futuro, el modelo acertó el resultado más probable en el <b>' + pct(bt.acc) + '</b> de ' + bt.n + ' partidos de ' + esc(lg.name) + '. Acertar más que el azar no basta para ganar dinero: las casas ya descuentan esa información en sus cuotas.</p>\n';
  // Sin datos estructurados de «Evento»: Google exige lugar (location) y solo sirven para venta de entradas; no inventamos estadios.
  const desc = (pk.label + ' (' + pct(pk.p) + '), cuota justa ' + odd(pk.fairOdds) + '. Probabilidades, forma reciente y enfrentamientos previos de ' + e.h + ' vs ' + e.a + ' · ' + lg.name + '.').slice(0, 158);
  return shell({ title: e.h + ' vs ' + e.a + ': pronóstico y cuota justa | Aurum Predictor', desc, canonical: SITE + '/partidos/' + url + '/', depth: 2, ...head,
    crumbs: [['Inicio', SITE + '/'], ['Ligas', SITE + '/ligas/'], [lg.name, SITE + '/ligas/' + slugs[lg.id] + '/'], [e.h + ' vs ' + e.a, SITE + '/partidos/' + url + '/']], body });
}

function dayPage(kind, ymd, items, ctxIn) {
  const { M, head, slugs } = ctxIn;
  const hoy = kind === 'hoy', label = hoy ? 'hoy' : 'mañana';
  const dir = hoy ? 'pronosticos-hoy' : 'pronosticos-manana';
  const list = items.filter((it) => limaYMD(it.e.ko) === ymd).sort((a, b) => Date.parse(a.e.ko) - Date.parse(b.e.ko));
  let body = '<h1>Pronósticos deportivos de ' + label + ': ' + esc(limaLong(ymd)) + '</h1>\n<p class="muted">Hora de Lima · actualizado ' + esc((M.generated || '').slice(0, 10)) + ' · se recalcula cada 8 horas.</p>\n';
  body += '<p>Probabilidad de cada resultado y cuota justa para los partidos de ' + label + ' en las ligas que cubre Aurum Predictor. Son estimaciones de un modelo estadístico, no apuestas seguras: un 70 % de probabilidad significa que 3 de cada 10 veces el resultado es otro.</p>\n';
  if (!list.length) body += '<p class="muted">No hay partidos con pronóstico para ' + label + ' en las ligas cubiertas. Mira <a href="../ligas/" style="text-decoration:underline">las ligas</a> o <a href="../pronosticos-' + (hoy ? 'manana' : 'hoy') + '/" style="text-decoration:underline">los pronósticos de ' + (hoy ? 'mañana' : 'hoy') + '</a>.</p>\n';
  const byLg = new Map();
  for (const it of list.slice(0, 250)) { if (!byLg.has(it.lg.id)) byLg.set(it.lg.id, []); byLg.get(it.lg.id).push(it); }
  for (const [id, arr] of byLg) {
    const lg = arr[0].lg;
    body += '<h2>' + fl(lg, '../') + '<a href="../ligas/' + slugs[id] + '/" style="text-decoration:underline">' + esc(lg.name) + '</a></h2>\n<div class="table-wrap"><table class="tbl"><thead><tr><th>Partido</th><th>Hora</th><th>Pronóstico</th><th class="r">Prob.</th><th class="r">Cuota justa</th></tr></thead><tbody>' +
      arr.map((it) => '<tr><td><a href="../partidos/' + it.url + '/" style="text-decoration:underline">' + teamsHtml(it.e, ' – ', '../') + '</a></td><td style="white-space:nowrap">' + esc(new Date(it.e.ko).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })) + '</td><td><b>' + esc(it.f.pick.label) + '</b></td><td class="r">' + pct(it.f.pick.p) + '</td><td class="r">' + odd(it.f.pick.fairOdds) + '</td></tr>').join('') + '</tbody></table></div>\n';
  }
  body += '<p><a href="../" style="text-decoration:underline">Abrir el comparador completo →</a></p>\n';
  return shell({ title: 'Pronósticos deportivos de ' + label + ' (' + limaLong(ymd) + ') | Aurum Predictor', desc: ('Pronósticos de ' + label + ': probabilidad y cuota justa de cada partido, Liga 1 de Perú y las principales ligas del mundo. ' + list.length + ' partidos.').slice(0, 158),
    canonical: SITE + '/' + dir + '/', depth: 1, ...head, crumbs: [['Inicio', SITE + '/'], ['Pronósticos de ' + label, SITE + '/' + dir + '/']], body });
}

function indexPage(groups, slugs, head, M) {
  let body = '<h1>Ligas y deportes con pronósticos</h1>\n<p class="muted">Actualizado: ' + esc((M.generated || '').slice(0, 10)) + '</p>\n' +
    '<p>Elige una liga para ver la probabilidad de cada resultado, la cuota justa y la forma reciente. Todo son estimaciones de un modelo estadístico, no apuestas seguras.</p>\n';
  for (const [sp, list] of groups) {
    body += '<h2>' + esc(SPORT_NAME[sp] || sp) + '</h2>\n<ul>' + list.map((l) => '<li>' + fl(l, '../') + '<a href="' + slugs[l.id] + '/" style="text-decoration:underline">' + esc(l.name) + '</a>' + (l._next ? ' <span class="muted">· ' + l._next + ' partido(s) próximo(s)</span>' : '') + '</li>').join('') + '</ul>\n';
  }
  return shell({ title: 'Ligas y deportes con pronósticos | Aurum Predictor', desc: 'Pronósticos por liga y deporte: probabilidades, cuota justa y forma reciente. Liga 1 de Perú, ligas de fútbol, NBA, MLB, UFC y más.', canonical: SITE + '/ligas/', depth: 1, ...head,
    crumbs: [['Inicio', SITE + '/'], ['Ligas', SITE + '/ligas/']], body });
}

function build(dist) {
  dist = path.resolve(dist);
  const idxPath = path.join(dist, 'index.html');
  if (!fs.existsSync(idxPath) || !fs.existsSync(path.join(dist, 'data', 'multi.js'))) throw new Error('Falta dist/index.html o dist/data/multi.js: ejecuta antes tools/build_site.py');
  const idx = fs.readFileSync(idxPath, 'utf8');
  const bits = [];
  const csp = idx.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/); if (csp) bits.push(csp[0]);
  const ad = idx.match(/<meta name="google-adsense-account"[^>]*>/); if (ad) bits.push(ad[0]);
  const css = [(idx.match(/href="(css\/styles\.css[^"]*)"/) || [, 'css/styles.css'])[1], (idx.match(/href="(css\/predictor\.css[^"]*)"/) || [, 'css/predictor.css'])[1]];
  const adsJs = (idx.match(/src="(js\/ads\.js[^"]*)"/) || [, 'js/ads.js'])[1];
  const head = { headBits: bits, css, adsJs };

  const X = require('../js/multimodel.js');
  const M = unpackMulti(loadWindow(path.join(dist, 'data', 'multi.js')).AURUM_MULTI_PACKED);
  const btFile = path.join(dist, 'data', 'backtest_multi.js');
  const BTM = fs.existsSync(btFile) ? (loadWindow(btFile).AURUM_BT_MULTI || {}) : {};
  const asOf = (M.generated || new Date().toISOString()).slice(0, 10);
  const sctx = X.buildContext(M, asOf, { globalCross: !!BTM._global && BTM._global.cross, globalAll: !!BTM._global && BTM._global.all });

  const count = {}; M.results.forEach((r) => (count[r.lg] = (count[r.lg] || 0) + 1));
  const now = Date.now(), nextBy = {};
  M.events.forEach((e) => { if (e.status === 'pre' && Date.parse(e.ko) > now) nextBy[e.lg] = (nextBy[e.lg] || 0) + 1; });
  const leagues = M.leagues.filter((l) => (count[l.id] || 0) >= MIN_RESULTS || l.id === 'soccer/per.1');
  const slugs = leagueSlugs(leagues);
  leagues.forEach((l) => (l._next = nextBy[l.id] || 0));

  const outDir = path.join(dist, 'ligas'), mDir = path.join(dist, 'partidos');
  for (const d of [outDir, mDir, path.join(dist, 'pronosticos-hoy'), path.join(dist, 'pronosticos-manana')]) fs.rmSync(d, { recursive: true, force: true });
  const lgOk = new Set(leagues.map((l) => l.id)), lgById = {}; leagues.forEach((l) => (lgById[l.id] = l));
  const fcMap = {}, matchUrl = {}, items = [], usedUrl = new Set();
  const resBy = {}; M.results.forEach((r) => { if (lgOk.has(r.lg)) (resBy[r.lg] = resBy[r.lg] || []).push(r); });
  Object.values(resBy).forEach((a) => a.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0)));
  M.events.filter((e) => lgOk.has(e.lg) && e.status === 'pre' && Date.parse(e.ko) > now).sort((a, b) => Date.parse(a.ko) - Date.parse(b.ko)).forEach((e) => {
    const f = X.forecast(sctx, e, { wModel: 0, temp: BTM._temp });
    if (!f) return;
    fcMap[e.id] = f;
    let u = slugs[e.lg] + '-' + slugify(e.h) + '-vs-' + slugify(e.a) + '-' + limaYMD(e.ko);
    if (usedUrl.has(u)) u += '-' + slugify(e.id);
    usedUrl.add(u); matchUrl[e.id] = u;
    items.push({ e, lg: lgById[e.lg], f, url: u, res: resBy[e.lg] || [] });
  });
  const ctxIn = { M, X, sctx, BTM, slugs, head, fcMap, matchUrl };
  for (const l of leagues) {
    const dir = path.join(outDir, slugs[l.id]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), leaguePage(l, ctxIn));
  }
  for (const it of items) {
    const dir = path.join(mDir, it.url);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), matchPage(it, ctxIn));
  }
  const today = limaYMD(new Date().toISOString()), tomorrow = limaYMD(new Date(now + 864e5).toISOString());
  for (const [kind, ymd, dir] of [['hoy', today, 'pronosticos-hoy'], ['manana', tomorrow, 'pronosticos-manana']]) {
    fs.mkdirSync(path.join(dist, dir), { recursive: true });
    fs.writeFileSync(path.join(dist, dir, 'index.html'), dayPage(kind, ymd, items, ctxIn));
  }
  const groups = [];
  const sports = Array.from(new Set(leagues.map((l) => l.sport))).sort((a, b) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
  for (const sp of sports) groups.push([sp, leagues.filter((l) => l.sport === sp).sort((a, b) => (b.id === 'soccer/per.1') - (a.id === 'soccer/per.1') || a.name.localeCompare(b.name))]);
  fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(groups, slugs, head, M));

  const day = asOf;
  const urls = [SITE + '/', SITE + '/pronosticos-hoy/', SITE + '/pronosticos-manana/', SITE + '/ligas/', SITE + '/privacidad.html'].concat(leagues.map((l) => SITE + '/ligas/' + slugs[l.id] + '/'), items.map((it) => SITE + '/partidos/' + it.url + '/'));
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + esc(u) + '</loc><lastmod>' + day + '</lastmod></url>').join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
  return { pages: leagues.length, matches: items.length, urls: urls.length };
}

module.exports = { build, esc, slugify, leagueSlugs, form, unpackMulti };

if (require.main === module) {
  const i = process.argv.indexOf('--dist');
  const r = build(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'dist'));
  console.log('SEO listo: ' + r.pages + ' páginas de liga, ' + r.matches + ' de partido, hoy y mañana; sitemap con ' + r.urls + ' direcciones, robots.txt con el sitemap.');
}
