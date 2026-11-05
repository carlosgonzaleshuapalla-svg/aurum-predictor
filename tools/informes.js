/* Aurum Predictor · informe semanal del modelo. Para cada semana COMPLETA (lunes a domingo, hora de Lima) se vuelve a pronosticar cada
   partido jugado esa semana usando SOLO los resultados anteriores al lunes (sin mirar el futuro) y se compara con lo que ocurrió.
   Todo sale de los datos publicados; no hay texto escrito a mano con cifras. Lo usa tools/build_seo.js. */
const Mo = require('../js/model.js');
const X = require('../js/multimodel.js');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SPORT_NAME = { soccer: 'Fútbol', basketball: 'Baloncesto', baseball: 'Béisbol', football: 'Fútbol americano', hockey: 'Hockey', mma: 'MMA / UFC', tennis: 'Tenis' };
const SPORT_ORDER = ['soccer', 'basketball', 'baseball', 'football', 'hockey', 'mma', 'tennis'];
const MIN_WEEK_MATCHES = 30;      // una semana con menos partidos pronosticados no genera informe
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pc = (x, d) => (x * 100).toFixed(d == null ? 0 : d).replace('.', ',') + ' %';
const num = (x, d) => x.toFixed(d == null ? 1 : d).replace('.', ',');

const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = (ymd) => (new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = lunes
const monday = (ymd) => addDays(ymd, -dow(ymd));
const dmy = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + y; };
const dm = (ymd) => { const [, m, d] = ymd.split('-').map(Number); return d + ' de ' + MESES[m - 1]; };
function rangeText(start) { const end = addDays(start, 6); return start.slice(0, 4) === end.slice(0, 4) ? 'del ' + dm(start) + ' al ' + dmy(end) : 'del ' + dmy(start) + ' al ' + dmy(end); }

// semanas completas (lunes de inicio) anteriores a `today`, de la más reciente a la más antigua
function weekStarts(today, n) {
  const out = []; let m = monday(today);
  if (addDays(m, 6) >= today) m = addDays(m, -7); // la semana en curso aún no terminó
  for (let i = 0; i < n; i++) out.push(addDays(m, -7 * i));
  return out;
}

// cumplimiento real de cada mercado de goles
const realOf = (hs, as) => { const t = hs + as; return { o15: t >= 2, u15: t < 2, o25: t >= 3, u25: t < 3, o35: t >= 4, u35: t < 4, bs: hs > 0 && as > 0, bn: !(hs > 0 && as > 0) }; };

function computeWeek(M, BTM, start) {
  const end = addDays(start, 6), cal = BTM && BTM._goals && BTM._goals.cal;
  const sportOf = {}, nameOf = {}; M.leagues.forEach((l) => { sportOf[l.id] = l.sport; nameOf[l.id] = l.name; });
  const by = {}; M.results.forEach((r) => (by[r.lg] = by[r.lg] || []).push(r));
  const recs = [];
  for (const lg of Object.keys(by)) {
    const sp = sportOf[lg] || lg.split('/')[0], rs = by[lg];
    const week = rs.filter((r) => r.d >= start && r.d <= end && !r.pre && !r.neutral && (r.w === 'h' || r.w === 'a' || r.w === 'd'));
    if (!week.length) continue;
    const prior = rs.filter((r) => r.d < start);
    if (sp === 'soccer') {
      const withScore = prior.filter((r) => r.hs != null);
      if (withScore.length < 60) continue;
      const fit = Mo.fitLeague(withScore.map((r) => ({ d: r.d, h: r.h, a: r.a, hg: r.hs, ag: r.as })), start, Object.assign({ k: 3 }, X.LEAGUE_OPTS[lg]));
      for (const m of week) {
        if (m.ot || m.hs == null) continue;
        const pr = Mo.predictMatch(fit, m.h, m.a, 5); if (!pr) continue;
        const p = pr.p1x2; let bi = 0; p.forEach((x, i) => { if (x > p[bi]) bi = i; });
        const real = m.hs > m.as ? 0 : m.hs === m.as ? 1 : 2, gp = X.goalPicks(pr, cal), re = realOf(m.hs, m.as);
        recs.push({ sport: sp, lg, h: m.h, a: m.a, d: m.d, hs: m.hs, as: m.as, p: p[bi], ok: bi === real, pickLabel: bi === 1 ? 'Empate' : 'Gana ' + (bi === 0 ? m.h : m.a),
          goals: gp.length ? { top: gp[0], hit: re[gp[0].k], all: gp.map((g) => ({ k: g.k, p: g.p, hit: re[g.k] })) } : null, tot: m.hs + m.as });
      }
    } else {
      if (prior.length < 40) continue;
      const st = X.eloRun(prior, sp);
      for (const m of week) {
        if (m.w === 'd') continue;
        const ep = X.eloProb(st, sp, m.h, m.a, false, m.d); if (!ep || Math.min(ep.nH, ep.nA) < 2) continue;
        const homePick = ep.p >= 0.5, p = homePick ? ep.p : 1 - ep.p;
        recs.push({ sport: sp, lg, h: m.h, a: m.a, d: m.d, hs: m.hs, as: m.as, p, ok: homePick === (m.w === 'h'), pickLabel: 'Gana ' + (homePick ? m.h : m.a), goals: null });
      }
    }
  }
  if (recs.length < MIN_WEEK_MATCHES) return null;

  const bySport = SPORT_ORDER.map((s) => { const r = recs.filter((x) => x.sport === s); return r.length ? { sport: s, name: SPORT_NAME[s] || s, n: r.length, hit: r.filter((x) => x.ok).length } : null; }).filter(Boolean);
  const soc = recs.filter((x) => x.sport === 'soccer' && x.goals), gl = { n: soc.length, hit: soc.filter((x) => x.goals.hit).length, markets: [] };
  for (const [k, label] of [['o15', 'Más de 1.5 goles'], ['o25', 'Más de 2.5 goles'], ['o35', 'Más de 3.5 goles'], ['bs', 'Ambos marcan: Sí']]) {
    const pr = soc.map((x) => x.goals.all.find((g) => g.k === k)).filter(Boolean);
    if (pr.length) gl.markets.push({ label, pred: pr.reduce((t, g) => t + g.p, 0) / pr.length, real: pr.filter((g) => g.hit).length / pr.length });
  }
  gl.avgGoals = soc.length ? soc.reduce((t, x) => t + x.tot, 0) / soc.length : null;
  const lgAgg = {}; soc.forEach((x) => { const o = (lgAgg[x.lg] = lgAgg[x.lg] || { lg: x.lg, name: nameOf[x.lg] || x.lg, n: 0, hit: 0 }); o.n++; o.hit += x.ok ? 1 : 0; });
  const leagues = Object.values(lgAgg).filter((o) => o.n >= 8).map((o) => Object.assign(o, { acc: o.hit / o.n })).sort((a, b) => b.acc - a.acc || b.n - a.n);
  const surprises = recs.filter((x) => !x.ok && x.p >= 0.75).sort((a, b) => b.p - a.p).slice(0, 5).map((x) => Object.assign({}, x, { lgName: nameOf[x.lg] || x.lg }));
  const goleadas = soc.slice().sort((a, b) => b.tot - a.tot).slice(0, 3).filter((x) => x.tot >= 6).map((x) => Object.assign({}, x, { lgName: nameOf[x.lg] || x.lg }));
  return { start, end, total: recs.length, hit: recs.filter((x) => x.ok).length, bySport, goals: gl, top: leagues.slice(0, 3), bottom: leagues.slice(-3).reverse(), nLeagues: leagues.length, surprises, goleadas };
}

function computeWeeks(M, BTM, today, n) {
  return weekStarts(today, n).map((s) => computeWeek(M, BTM, s)).filter(Boolean);
}

// cuerpo HTML del informe de una semana (st = cifras históricas de contentStats para comparar)
function renderWeek(rep, st, nav) {
  const soccer = rep.bySport.find((s) => s.sport === 'soccer'), hist = st && st.sports && st.sports.find((s) => s.name === 'Fútbol');
  let b = '<p class="muted"><a href="../">Informes</a> · semana ' + esc(rangeText(rep.start)) + '</p>\n';
  b += '<h1>Informe semanal del modelo: ' + esc(rangeText(rep.start)) + '</h1>\n';
  b += '<p>Entre el ' + esc(dm(rep.start)) + ' y el ' + esc(dmy(rep.end)) + ' el modelo de Aurum Predictor volvió a pronosticar <b>' + rep.total + ' partidos</b> de ' + rep.bySport.length + ' deportes usando solo lo que se sabía antes de que empezara la semana, y acertó el resultado más probable en <b>' + rep.hit + '</b> (' + pc(rep.hit / rep.total, 1) + ').';
  if (soccer && hist) b += ' En fútbol acertó ' + pc(soccer.hit / soccer.n, 1) + ' de ' + soccer.n + ' partidos; su promedio histórico en la prueba larga es ' + pc(hist.acc, 1) + '.';
  b += ' Una sola semana es una muestra pequeña: las diferencias de unos puntos son ruido, no una mejora o un empeoramiento real.</p>\n';
  b += '<h2>Acierto por deporte</h2>\n<div class="table-wrap"><table class="tbl"><thead><tr><th>Deporte</th><th class="r">Partidos</th><th class="r">Aciertos</th><th class="r">Acierto</th></tr></thead><tbody>' +
    rep.bySport.map((s) => '<tr><td>' + esc(s.name) + '</td><td class="r">' + s.n + '</td><td class="r">' + s.hit + '</td><td class="r"><b>' + pc(s.hit / s.n, 1) + '</b></td></tr>').join('') + '</tbody></table></div>\n';
  b += '<p class="hint">Pronóstico del resultado más probable (quién gana; en fútbol también el empate). Los partidos en campo neutral y la pretemporada se excluyen.</p>\n';
  const g = rep.goals;
  if (g.n >= 20) {
    b += '<h2>Goles en fútbol</h2>\n<p>De ' + g.n + ' partidos de fútbol, el mercado de goles más probable de cada uno (más/menos de 1.5, 2.5 o 3.5, o ambos marcan) se cumplió en <b>' + g.hit + '</b> (' + pc(g.hit / g.n, 1) + '). Se marcaron <b>' + num(g.avgGoals, 2) + '</b> goles por partido en promedio.</p>\n';
    b += '<div class="table-wrap"><table class="tbl"><thead><tr><th>Mercado</th><th class="r">Lo que decía el modelo</th><th class="r">Lo que ocurrió</th></tr></thead><tbody>' +
      g.markets.map((m) => '<tr><td>' + esc(m.label) + '</td><td class="r">' + pc(m.pred, 1) + '</td><td class="r"><b>' + pc(m.real, 1) + '</b></td></tr>').join('') + '</tbody></table></div>\n';
    b += '<p class="hint">Si las dos columnas se parecen, el modelo estuvo bien calibrado esa semana. Mira la guía de <a href="../../guias/calibracion-por-que-un-modelo-sobreestima/" style="text-decoration:underline">calibración</a>.</p>\n';
  }
  if (rep.nLeagues >= 4) {
    const row = (o) => '<tr><td>' + esc(o.name) + '</td><td class="r">' + o.n + '</td><td class="r"><b>' + pc(o.acc, 0) + '</b></td></tr>';
    b += '<h2>Ligas de fútbol: mejor y peor semana</h2>\n<div class="pgrid2"><div><h3>Mejor acierto</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Liga</th><th class="r">Partidos</th><th class="r">Acierto</th></tr></thead><tbody>' + rep.top.map(row).join('') + '</tbody></table></div></div>' +
      '<div><h3>Peor acierto</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Liga</th><th class="r">Partidos</th><th class="r">Acierto</th></tr></thead><tbody>' + rep.bottom.map(row).join('') + '</tbody></table></div></div></div>\n<p class="hint">Solo ligas con al menos 8 partidos pronosticados esa semana. Con tan pocos partidos, el orden cambia mucho de una semana a otra.</p>\n';
  }
  if (rep.surprises.length) {
    b += '<h2>Los favoritos que fallaron</h2>\n<p>Pronósticos con probabilidad de 75 % o más que no se cumplieron. Son recordatorio de que un favorito claro también falla:</p>\n<ul>' +
      rep.surprises.map((x) => '<li>' + esc(x.h) + ' ' + x.hs + '-' + x.as + ' ' + esc(x.a) + ' (' + esc(x.lgName) + ', ' + esc(dm(x.d)) + '): el modelo daba <b>' + esc(x.pickLabel) + '</b> con ' + pc(x.p, 0) + '.</li>').join('') + '</ul>\n';
  }
  if (rep.goleadas.length) b += '<h2>Partidos con más goles</h2>\n<ul>' + rep.goleadas.map((x) => '<li>' + esc(x.h) + ' ' + x.hs + '-' + x.as + ' ' + esc(x.a) + ' (' + esc(x.lgName) + ', ' + esc(dm(x.d)) + '): ' + x.tot + ' goles.</li>').join('') + '</ul>\n';
  b += '<h2>Cómo se calcula este informe</h2>\n<p>Para cada partido jugado en la semana, el modelo se reajusta con los resultados de su liga anteriores al lunes y pronostica sin conocer el resultado. La probabilidad de goles usa la calibración histórica del modelo (la calibración se calculó con una muestra amplia que incluye estas semanas; el efecto es mínimo, pero no es una prueba estrictamente ciega). No usa cuotas de casas. Detalles en <a href="../../metodologia/" style="text-decoration:underline">Metodología</a>. Esto es información, no una recomendación de apuestas.</p>\n';
  if (nav) b += '<p>' + (nav.prev ? '<a href="../' + nav.prev.start + '/" style="text-decoration:underline">← Semana anterior</a>' : '') + (nav.prev && nav.next ? ' · ' : '') + (nav.next ? '<a href="../' + nav.next.start + '/" style="text-decoration:underline">Semana siguiente →</a>' : '') + '</p>\n';
  return b;
}

function renderIndex(reps) {
  return '<h1>Informes semanales del modelo</h1>\n<p>Cada semana revisamos cuántos partidos acertó el modelo, cómo salieron los goles y qué favoritos fallaron. Los informes se generan solos con los resultados reales y se publican al terminar cada semana (lunes a domingo, hora de Lima).</p>\n<ul>' +
    reps.map((r) => '<li><a href="' + r.start + '/" style="text-decoration:underline"><b>Semana ' + esc(rangeText(r.start)) + '</b></a> · ' + r.total + ' partidos, acierto ' + pc(r.hit / r.total, 1) + '</li>').join('') + '</ul>\n<p class="hint">Una semana es una muestra pequeña: el acierto sube y baja por azar. Lee la <a href="../metodologia/" style="text-decoration:underline">Metodología</a> para ver la prueba larga.</p>\n';
}

module.exports = { computeWeek, computeWeeks, weekStarts, renderWeek, renderIndex, rangeText, addDays, monday, MIN_WEEK_MATCHES };
