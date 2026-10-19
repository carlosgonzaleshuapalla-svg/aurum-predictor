/* Aurum Predictor · interfaz. Usa SLModel (js/model.js) y los datos de data/*.js */
(function () {
  'use strict';
  const { h, $ } = SL, Mo = window.SLModel;
  const view = $('#view');
  const LG = { E0: 'Premier League', E1: 'Championship', E2: 'League One', E3: 'League Two', SC0: 'Premiership (Escocia)', SC1: 'Scottish Championship', D1: 'Bundesliga', D2: '2. Bundesliga', I1: 'Serie A', I2: 'Serie B', SP1: 'LaLiga', SP2: 'LaLiga 2', F1: 'Ligue 1', F2: 'Ligue 2', N1: 'Eredivisie', P1: 'Primeira Liga', T1: 'Süper Lig', G1: 'Super League (Grecia)', B1: 'Pro League (Bélgica)' };
  const lgName = (c) => LG[c] || c;
  const pct = (x, d) => (x * 100).toFixed(d == null ? 1 : d) + ' %';
  const od = (x) => (x == null ? '—' : x.toFixed(2));
  const money = (n) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorar */ } };

  // Los CSV traen hora del Reino Unido (BST entre el último domingo de marzo y el de octubre)
  const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
  function ukEpoch(ko) {
    const [dd, tt] = ko.split('T'), [y, mo, d] = dd.split('-').map(Number), [hh, mi] = (tt || '00:00').split(':').map(Number);
    const asUtc = Date.UTC(y, mo - 1, d, hh, mi), bst = asUtc >= lastSun(y, 2) && asUtc < lastSun(y, 9);
    return asUtc - (bst ? 3600e3 : 0);
  }
  const limaFmt = (t, o) => new Date(t).toLocaleString('es-PE', Object.assign({ timeZone: 'America/Lima' }, o));
  const limaStr = (e) => limaFmt(e.t, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const limaDay = (e) => new Date(e.t).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

  /* ---------- Estado ---------- */
  const H = window.AURUM_HISTORY, F = window.AURUM_FIXTURES, BT = window.AURUM_BACKTEST;
  const S = { lg: 'all', market: 'all', minEV: 3, minP: 20, wModel: 0, bankroll: 1000, onlyModel: false, sport: 'all', mlg: 'all', when: 'week', sort: 'time', q: '', limit: 100 };
  { const saved = lsGet('aurum.pred.ui.v4', {}); if (saved && typeof saved === 'object') for (const k of Object.keys(S)) if (Object.prototype.hasOwnProperty.call(saved, k) && typeof saved[k] === typeof S[k]) S[k] = saved[k]; } // solo claves conocidas
  function cleanManual(m) { // valida lo guardado en el navegador: solo cuotas numéricas > 1
    const out = {}; if (!m || typeof m !== 'object') return out;
    for (const id of Object.keys(m)) { const bk = m[id]; if (!bk || typeof bk !== 'object' || /^(__proto__|constructor|prototype)$/.test(id)) continue;
      for (const b of Object.keys(bk)) { const x = bk[b]; if (/^(__proto__|constructor|prototype)$/.test(b) || !x || !Array.isArray(x['1x2']) || x['1x2'].length !== 3 || !x['1x2'].every((v, i) => (i === 1 && v === null) || (typeof v === 'number' && v > 1 && v < 1000))) continue;
        (out[id] = out[id] || {})[b] = { '1x2': x['1x2'], ou25: Array.isArray(x.ou25) && x.ou25.length === 2 && x.ou25.every((v) => typeof v === 'number' && v > 1) ? x.ou25 : undefined }; } }
    return out;
  }
  let manual = cleanManual(lsGet('aurum.manual', {}));
  let events = [], fits = {}, preds = {}, analysis = {}, asOf = '';

  function prepare() {
    if (!H || !F) return false;
    asOf = (F.generated || new Date().toISOString()).slice(0, 10);
    const byLg = {}; H.matches.forEach((m) => (byLg[m.lg] = byLg[m.lg] || []).push(m));
    fits = {}; for (const lg in byLg) fits[lg] = Mo.fitLeague(byLg[lg], asOf);
    events = F.events.map((e) => {
      const books = Object.assign({}, e.books);
      const man = manual[e.id] || {};
      for (const b in man) books[b + ' ✎'] = man[b];
      return Object.assign({}, e, { books, t: ukEpoch(e.ko) });
    }).filter((e) => e.t > Date.now()).sort((a, b) => a.t - b.t); // partidos ya empezados no se analizan
    events.forEach((e) => { preds[e.id] = Mo.predictMatch(fits[e.lg], e.h, e.a); });
    recompute(); return true;
  }
  function recompute() {
    analysis = {};
    events.forEach((e) => { analysis[e.id] = Mo.analyzeEvent(e, preds[e.id], { wModel: S.wModel / 100, wModelOU: 0 }); });
  }
  const allSel = () => events.flatMap((e) => (analysis[e.id] || []).map((s) => Object.assign({ ev_: e }, s)));
  const saveUI = () => lsSet('aurum.pred.ui.v4', S);
  const nBooks = () => new Set(events.flatMap((e) => Object.keys(e.books))).size;
  const evById = (id) => events.find((e) => e.id === id);

  /* ---------- Componentes ---------- */
  const pbar = (mk, md) => h('div', { class: 'pbar' }, h('i', { style: 'width:' + (mk * 100).toFixed(1) + '%' }), md == null ? null : h('b', { style: 'left:' + (md * 100).toFixed(1) + '%' }));
  const link = (id) => '#/partido/' + encodeURIComponent(id);
  const noData = () => h('div', { class: 'wrap pg' }, h('span', { class: 'eyebrow' }, 'Sin datos'), h('h1', {}, 'Aún no hay datos cargados'),
    h('p', { class: 'lead' }, 'Falta generar el histórico y las cuotas. Ejecuta en una terminal, desde la carpeta del proyecto:'),
    h('div', { class: 'code mt' }, 'python3 tools/fetch_data.py'),
    h('p', { class: 'hint mt' }, 'Después recarga esta página. Opcional: ODDS_API_KEY=tu_clave python3 tools/fetch_data.py añade más casas (The Odds API).'));

  const foreignNote = () => h('div', { class: 'note mt' }, h('b', {}, 'Casas de referencia. '), 'Pinnacle, Betfair, SkyBet, BetVictor, Bwin y DraftKings no figuran como autorizadas en Perú: sirven para comparar precios y estimar probabilidades. Bet365 y otras sí aparecen en listas de terceros como autorizadas, pero verifica siempre el dominio exacto en el registro oficial del MINCETUR (apuestasdeportivas.mincetur.gob.pe); las cuotas de la versión internacional pueden diferir de las de su sitio en Perú.');
  function filtersBar(rerender, opts) {
    opts = opts || {};
    const lgs = Array.from(new Set(events.map((e) => e.lg)));
    const pills = h('div', { class: 'leagues' }, [['all', 'Todas']].concat(lgs.map((c) => [c, lgName(c)])).map(([c, l]) => h('button', { class: 'pill' + (S.lg === c ? ' on' : ''), onclick: () => { S.lg = c; saveUI(); rerender(); } }, l)));
    const num = (label, key, min, max, step, hint) => { const i = h('input', { class: 'inp', type: 'number', min, max, step, value: S[key], onchange: () => { S[key] = parseFloat(i.value) || 0; saveUI(); recompute(); rerender(); } }); return SL.ui.field(label, i, hint); };
    const w = h('input', { type: 'range', min: 0, max: 100, step: 5, value: S.wModel, 'aria-label': 'Peso del modelo' });
    const wl = h('b', {}, S.wModel + ' %');
    w.addEventListener('input', () => { wl.textContent = w.value + ' %'; });
    w.addEventListener('change', () => { S.wModel = +w.value; saveUI(); recompute(); rerender(); });
    return h('div', {}, h('div', { class: 'filters' },
      num('EV mínimo (%)', 'minEV', 0, 50, 0.5), num('Prob. mínima (%)', 'minP', 1, 95, 1),
      SL.ui.field('Peso del modelo', h('div', {}, h('div', { class: 'kv' }, h('span', {}, '0 = solo mercado'), wl), w), '100 = solo modelo'),
      opts.noLeague ? null : SL.ui.field('Liga', pills)));
  }

  function evidence() {
    if (!BT) return h('div', { class: 'note mt' }, h('b', {}, 'Honestidad primero. '), 'Las casas cobran un margen del 2–8 % y los mercados son eficientes. Ejecuta node tools/backtest.js para ver cuánto acierta el modelo con datos pasados.');
    const m0 = BT.metrics[0], m1 = BT.metrics[1], vb = BT.valueBets, rs = (BT.realStrategy || []).find((x) => x.thr === 0.03) || {}, rs0 = (BT.realStrategy || []).find((x) => x.thr === 0) || {};
    const f = (x) => (x == null ? '—' : (x * 100).toFixed(1) + ' %');
    const ci = (x) => (x && x.ci != null ? ' ± ' + (x.ci * 100).toFixed(0) + ' pts' : '');
    return h('div', { class: 'note mt' }, h('b', {}, 'Lo que dicen los datos pasados (' + BT.n + ' partidos desde ' + BT.testFrom + '). '),
      BT.marketBeatsModel ? 'Las probabilidades del mercado predicen mejor que el modelo (log-loss ' + m0.logloss.toFixed(3) + ' vs ' + m1.logloss.toFixed(3) + '), por eso el peso del modelo viene en 0 %. ' : 'El modelo iguala o mejora al mercado (log-loss ' + m1.logloss.toFixed(3) + ' vs ' + m0.logloss.toFixed(3) + '). ',
      'La estrategia de esta pantalla (mejor cuota entre casas contra la probabilidad justa de Pinnacle) habría dado ' + f(rs.roi) + ci(rs) + ' con EV ≥ 3 % (' + (rs.n || 0) + ' apuestas) y ' + f(rs0.roi) + ci(rs0) + ' con EV ≥ 0 (' + (rs0.n || 0) + ' apuestas): no se distingue de cero. Las “apuestas de valor” del modelo dieron ' + f(vb.roiAvg) + '. Esto no es una recomendación de apostar.');
  }

  /* ---------- Página: Valor ---------- */
  function pageHome() {
    const root = h('div', { class: 'wrap pg' });
    const body = h('div', {});
    const draw = () => {
      body.replaceChildren();
      const sel = allSel().filter((s) => (S.lg === 'all' || s.ev_.lg === S.lg) && s.ev * 100 >= S.minEV && s.p * 100 >= S.minP && (!S.onlyModel || s.hasModel)).sort((a, b) => b.ev - a.ev).slice(0, 40);
      body.append(filtersBar(draw));
      body.append(h('div', { class: 'sec-t' }, h('h2', {}, 'Apuestas de valor'), h('span', { class: 'muted' }, sel.length + ' selecciones · ordenadas por valor esperado (EV)')));
      if (!sel.length) { body.append(h('div', { class: 'note' }, h('b', {}, 'Sin resultados. '), 'Con estos filtros el modelo no ve ventaja sobre el mercado. Eso es lo normal: los mercados son eficientes y la mayoría de los días no hay valor. Prueba a bajar el EV mínimo, pero ten en cuenta que valores bajos pueden ser ruido.')); return; }
      body.append(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Partido', 'Selección', 'Mejor cuota', 'Prob. mercado', 'Prob. modelo', 'Prob. final', 'EV'].map((c, i) => h('th', { class: i > 1 ? 'r' : '' }, c)))),
        h('tbody', {}, sel.map((s) => h('tr', { class: 'rowlink', onclick: () => (location.hash = link(s.evId)) },
          h('td', {}, s.ev_.h + ' – ' + s.ev_.a, h('small', {}, lgName(s.ev_.lg) + ' · ' + limaStr(s.ev_))),
          h('td', {}, s.label, s.market === 'ou25' ? h('small', {}, 'Goles') : null),
          h('td', { class: 'r' }, h('b', {}, od(s.odds)), h('small', {}, s.book)),
          h('td', { class: 'r' }, pct(s.pMarket)), h('td', { class: 'r' }, s.pModel == null ? '—' : pct(s.pModel)), h('td', { class: 'r' }, pct(s.p)),
          h('td', { class: 'r ' + (s.ev > 0 ? 'ev-pos' : 'ev-neg') }, (s.ev > 0 ? '+' : '') + (s.ev * 100).toFixed(1) + ' %')))))));
      body.append(h('p', { class: 'hint mt' }, 'EV = prob. final × cuota − 1, con la mejor cuota disponible entre las casas cargadas. Prob. final = mezcla del modelo y la probabilidad justa del mercado (sin margen). Un EV positivo es una estimación, no una promesa. '));
    };
    const nVal = allSel().filter((s) => s.hasModel && s.ev * 100 >= 3).length;
    root.append(h('span', { class: 'eyebrow' }, 'Predictor deportivo'), h('h1', { class: 'serif' }, 'Cuotas, probabilidades y ', h('em', {}, 'valor'), '.'),
      h('p', { class: 'lead' }, 'Compara las cuotas de varias casas, quita su margen, estima la probabilidad real con el histórico de cada equipo y marca dónde el precio parece mejor que el riesgo. No apuesta por ti.'),
      h('div', { class: 'kpis' }, [[events.length, 'partidos próximos'], [nBooks(), 'casas comparadas'], [Object.keys(fits).filter((k) => fits[k]).length, 'ligas modeladas'], [nVal, 'selecciones con EV ≥ 3 %']].map(([n, l]) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, l)))),
      evidence(), foreignNote(),
      body);
    draw(); return root;
  }

  /* ---------- Página: Partidos ---------- */
  function pagePartidos() {
    const root = h('div', { class: 'wrap pg' }), list = h('div', {});
    const draw = () => {
      list.replaceChildren(filtersBar(draw));
      const evs = events.filter((e) => S.lg === 'all' || e.lg === S.lg);
      let day = '';
      const box = h('div', {});
      evs.forEach((e) => {
        const d = limaDay(e); if (d !== day) { day = d; box.append(h('h3', { class: 'serif', style: 'font-size:24px;margin:32px 0 6px' }, new Date(d + 'T12:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }))); }
        const a = analysis[e.id] || [], p = preds[e.id];
        const best = [0, 1, 2].map((i) => Mo.bestOdds(e.books, '1x2', i));
        const mv = (i) => a.find((s) => s.market === '1x2' && s.sel === i);
        box.append(h('div', { class: 'evcard', onclick: () => (location.hash = link(e.id)) },
          h('div', {}, h('div', { class: 'teams' }, e.h + ' – ' + e.a), h('div', { class: 'meta' }, lgName(e.lg) + ' · ' + limaStr(e) + ' (Lima) · ' + Object.keys(e.books).length + ' casas' + (p ? ' · modelo λ ' + p.lh.toFixed(2) + '–' + p.la.toFixed(2) : ' · sin modelo (histórico insuficiente)'))),
          h('div', { class: 'odds3' }, ['1', 'X', '2'].map((l, i) => { const s = mv(i), isV = s && s.hasModel && s.ev >= S.minEV / 100; return h('div', { class: 'odd' + (isV ? ' v' : '') }, od(best[i] && best[i].odds), h('small', {}, l + (s && s.hasModel ? ' · ' + pct(s.p, 0) : ''))); }))));
      });
      list.append(box);
    };
    root.append(h('span', { class: 'eyebrow' }, 'Calendario'), h('h1', { class: 'serif' }, 'Partidos y mejores cuotas'), h('p', { class: 'lead' }, 'La cuota más alta de cada resultado entre todas las casas. En verde, donde el modelo ve valor.'), foreignNote(), list);
    draw(); return root;
  }

  /* ---------- Página: Detalle ---------- */
  function pageMatch(id) {
    const e = evById(id); if (!e) return h('div', { class: 'wrap pg' }, h('h1', {}, 'Partido no encontrado'), h('a', { class: 'btn btn-ghost', href: '#/partidos' }, 'Volver'));
    const p = preds[e.id], a = analysis[e.id] || [];
    const books = Object.keys(e.books).filter((b) => b !== 'Max' && b !== 'Avg');
    const bestOf = (m, i) => { const bo = Mo.bestOdds(e.books, m, i); return bo ? bo.odds : 0; };
    const cols = [['1x2', 0, '1'], ['1x2', 1, 'X'], ['1x2', 2, '2'], ['ou25', 0, '+2.5'], ['ou25', 1, '−2.5']];
    const tbl = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Casa'), cols.map((c) => h('th', { class: 'r' }, c[2])), h('th', { class: 'r' }, 'Margen 1X2'))),
      h('tbody', {}, books.map((b) => { const bk = e.books[b]; return h('tr', {}, h('td', {}, b), cols.map(([m, i]) => { const v = (bk[m] || [])[i]; return h('td', { class: 'r' + (v && v === bestOf(m, i) ? ' odds-best' : '') }, od(v)); }), h('td', { class: 'r muted' }, bk['1x2'] ? pct(Mo.overround(bk['1x2'])) : '—')); }))));
    const fair = Mo.fairFromBooks(e.books, '1x2');
    const probs = h('div', { class: 'panel' }, h('h3', {}, 'Probabilidades 1X2'),
      ['Gana ' + e.h, 'Empate', 'Gana ' + e.a].map((l, i) => { const s = a.find((x) => x.market === '1x2' && x.sel === i); return h('div', { style: 'margin-top:12px' }, h('div', { class: 'kv' }, h('span', {}, l), h('b', {}, (fair ? 'Mercado ' + pct(fair.probs[i]) : '') + (p ? ' · Modelo ' + pct(p.p1x2[i]) : '') + (s ? ' · Final ' + pct(s.p) : ''))), pbar(fair ? fair.probs[i] : 0, p ? p.p1x2[i] : null)); }),
      h('p', { class: 'hint' }, 'Barra = mercado sin margen' + (fair ? ' (' + fair.src + ')' : '') + '. Marca blanca = modelo.'));
    let heat = h('p', { class: 'muted' }, 'Sin modelo: el histórico de uno de los equipos es insuficiente.');
    if (p) {
      const Mx = Mo.scoreMatrix(p.lh, p.la); let mx = 0, best = [0, 0];
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (Mx[i][j] > mx) { mx = Mx[i][j]; best = [i, j]; }
      const cells = [h('div', { class: 'ax' }, '')];
      for (let j = 0; j < 7; j++) cells.push(h('div', { class: 'ax' }, String(j)));
      for (let i = 0; i < 7; i++) { cells.push(h('div', { class: 'ax' }, String(i))); for (let j = 0; j < 7; j++) cells.push(h('div', { style: 'background:rgba(255,240,204,' + (Mx[i][j] / mx * 0.55).toFixed(3) + ')' }, Mx[i][j] >= 0.01 ? (Mx[i][j] * 100).toFixed(0) : '')); }
      heat = h('div', {}, h('div', { class: 'kv' }, h('span', {}, 'Goles esperados'), h('b', {}, e.h + ' ' + p.lh.toFixed(2) + ' · ' + e.a + ' ' + p.la.toFixed(2))),
        h('div', { class: 'kv' }, h('span', {}, 'Marcador más probable'), h('b', {}, best[0] + '–' + best[1] + ' (' + pct(mx) + ')')),
        h('div', { class: 'kv' }, h('span', {}, 'Más de 2.5 goles · Ambos marcan'), h('b', {}, pct(p.ou25[0], 0) + ' · ' + pct(p.btts[0], 0))),
        h('div', { class: 'heat mt' }, cells), h('p', { class: 'hint' }, 'Filas: goles del local. Columnas: goles del visitante. Cada celda: % de probabilidad.'));
    }
    const sel = a.slice().sort((x, y) => y.ev - x.ev);
    const val = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Selección', 'Mejor cuota', 'Prob. final', 'EV'].map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
      h('tbody', {}, sel.map((s) => h('tr', {}, h('td', {}, s.label, s.hasModel ? null : h('span', { class: 'badge warn', style: 'margin-left:8px' }, 'sin modelo')), h('td', { class: 'r' }, h('b', {}, od(s.odds)), h('small', {}, s.book)), h('td', { class: 'r' }, pct(s.p)), h('td', { class: 'r ' + (s.ev > 0 ? 'ev-pos' : 'ev-neg') }, (s.ev > 0 ? '+' : '') + (s.ev * 100).toFixed(1) + ' %'))))));
    return h('div', { class: 'wrap pg' }, h('a', { class: 'btn btn-ghost', href: '#/partidos' }, '← Partidos'),
      h('h1', { class: 'serif', style: 'margin-top:20px' }, e.h + ' – ' + e.a), h('p', { class: 'lead' }, lgName(e.lg) + ' · ' + limaStr(e) + ' hora de Lima'),
      foreignNote(),
      h('div', { class: 'sec-t' }, h('h2', {}, 'Cuotas por casa')), tbl,
      h('p', { class: 'hint' }, 'En dorado, la mejor cuota de cada columna. «✎» = cuota que añadiste a mano.'),
      h('div', { class: 'pgrid' }, probs, h('div', { class: 'panel' }, h('h3', {}, 'Modelo de goles'), heat)),
      h('div', { class: 'sec-t' }, h('h2', {}, 'Valor de cada selección')), val,
      h('p', { class: 'hint mt' }, 'Solo “con modelo” tiene opinión propia; “sin modelo” repite al mercado y su EV es solo la diferencia entre casas, no una predicción.'),
      h('div', { class: 'mt' }, h('a', { class: 'btn btn-ghost', href: '#/cuotas' }, 'Añadir cuotas de otra casa (p. ej. peruana)')));
  }

  /* ---------- Página: Combinadas ---------- */
  function pageParlays() {
    const root = h('div', { class: 'wrap pg' }), body = h('div', {});
    const draw = () => {
      body.replaceChildren(filtersBar(draw, { noLeague: true }));
      const legs = allSel().filter((s) => s.ev > 0 && s.p * 100 >= S.minP && (S.lg === 'all' || s.ev_.lg === S.lg)).map((s) => Object.assign({}, s, { name: s.ev_.h + ' – ' + s.ev_.a }));
      const bks = Array.from(new Set(legs.flatMap((l) => Object.keys(l.byBook))));
      let ps = [];
      bks.forEach((b) => { // una combinada solo existe dentro de UNA casa: se recalcula con las cuotas de esa casa
        const lb = legs.filter((l) => l.byBook[b]).map((l) => Object.assign({}, l, { odds: l.byBook[b], book: b, ev: l.p * l.byBook[b] - 1 })).filter((l) => l.ev > 0);
        Mo.parlays(lb, { minP: Math.max(0.3, S.minP / 100), maxLegs: 3, pool: 10 }).slice(0, 3).forEach((x) => ps.push(Object.assign(x, { book: b })));
      });
      ps = ps.sort((a, b) => b.ev - a.ev).slice(0, 8);
      body.append(h('div', { class: 'sec-t' }, h('h2', {}, 'Mejores combinadas'), h('span', { class: 'muted' }, legs.length + ' selecciones con EV > 0 · cada combinada es de una sola casa')));
      if (!ps.length) { body.append(h('div', { class: 'note' }, h('b', {}, 'No hay combinadas con valor. '), 'Se necesitan al menos 2 selecciones de partidos distintos, con EV positivo, en la misma casa. Baja el EV o la probabilidad mínima, o espera a nuevas cuotas.')); return; }
      ps.forEach((x) => body.append(h('div', { class: 'parlay' }, h('div', { class: 'meta', style: 'margin-bottom:6px' }, h('span', { class: 'badge' }, x.book)),
        x.legs.map((l) => h('div', { class: 'leg', onclick: () => (location.hash = link(l.evId)), style: 'cursor:pointer' }, h('span', {}, l.name, h('small', { class: 'muted', style: 'display:block' }, l.label)), h('b', {}, od(l.odds)))),
        h('div', { class: 'tot' }, h('span', {}, 'Cuota total ', h('b', {}, od(x.odds))), h('span', {}, 'Prob. de acertar todas ', h('b', {}, pct(x.p))), h('span', {}, 'EV ', h('b', { class: x.ev > 0 ? 'ev-pos' : 'ev-neg' }, (x.ev * 100).toFixed(1) + ' %'))))));
      body.append(h('div', { class: 'note mt' }, h('b', {}, 'Cuidado con las combinadas. '), 'Multiplican la cuota pero también el margen de la casa y el error del modelo: un error del 3 % en cada pata se vuelve ~9 % en tres. Aquí se asumen eventos independientes y nunca se combinan dos selecciones del mismo partido. Elegir las mejores de muchas combinaciones infla el EV mostrado (la “maldición del ganador”).'));
    };
    root.append(h('span', { class: 'eyebrow' }, 'Combinadas'), h('h1', { class: 'serif' }, 'La mejor combinación'), h('p', { class: 'lead' }, 'Combinaciones de 2 o 3 selecciones de partidos distintos, dentro de una misma casa, con mayor valor esperado.'), foreignNote(), body);
    draw(); return root;
  }

  /* ---------- Página: Modelo y backtest ---------- */
  function pageModel() {
    const out = h('div', {});
    const run = h('button', { class: 'btn btn-primary btn-lg' }, 'Ejecutar backtest');
    run.addEventListener('click', () => {
      run.disabled = true; run.textContent = 'Calculando…';
      out.replaceChildren(h('p', { class: 'muted' }, 'Reajustando el modelo semana a semana sobre el último año… (unos segundos)'));
      setTimeout(() => {
        const last = H.matches[H.matches.length - 1].d, y = +last.slice(0, 4) - 1, from = y + last.slice(4);
        const r = Mo.backtest(H.matches, { testFrom: from, wGrid: [0, 0.15, 0.3, 0.5, 0.75, 1], evThr: S.minEV / 100 });
        const ws = Object.keys(r.metrics), best = ws.reduce((b, w) => (r.metrics[w].logloss < r.metrics[b].logloss ? w : b), ws[0]);
        const verdict = r.metrics[best].logloss < r.metrics[0].logloss - 0.0005 ? 'La mezcla con peso de modelo ' + Math.round(best * 100) + ' % mejora ligeramente al mercado solo.' : 'El modelo NO mejora al mercado: la mejor opción es fiarse de las cuotas (peso 0 %).';
        out.replaceChildren(
          h('p', { class: 'lead' }, 'Prueba sobre ' + r.n + ' partidos desde ' + from + '. Para cada partido el modelo solo usa datos anteriores a esa fecha (sin trampa).'),
          h('div', { class: 'table-wrap mt' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Peso del modelo', 'Log-loss ↓', 'Brier ↓'].map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
            h('tbody', {}, ws.map((w) => h('tr', { class: w === best ? 'me' : '' }, h('td', {}, Math.round(w * 100) + ' %' + (w == 0 ? ' (solo mercado)' : w == 1 ? ' (solo modelo)' : ''), w === best ? h('span', { class: 'badge val', style: 'margin-left:8px' }, 'mejor') : null), h('td', { class: 'r' }, r.metrics[w].logloss.toFixed(4)), h('td', { class: 'r' }, r.metrics[w].brier.toFixed(4))))))),
          h('div', { class: 'note mt' }, h('b', {}, 'Lectura: '), verdict, ' Menor log-loss = mejores probabilidades.'),
          h('h3', { class: 'serif', style: 'font-size:26px;margin:32px 0 10px' }, 'Simulación de apuestas de valor'),
          h('p', { class: 'muted' }, 'Apostar 1 unidad a cada selección donde la mezcla 50/50 modelo-mercado ve EV ≥ ' + S.minEV + ' % (cuotas medias del mercado; no es la estrategia de la pantalla Valor): ' + r.bets.n + ' apuestas, ' + r.bets.wins + ' ganadas.'),
          h('div', { class: 'kpis', style: 'grid-template-columns:repeat(2,1fr)' }, [[r.roiAvg == null ? '—' : (r.roiAvg * 100).toFixed(1) + ' %', 'ROI a cuota media (realista)'], [r.roiMax == null ? '—' : (r.roiMax * 100).toFixed(1) + ' %', 'ROI a mejor cuota del mercado (optimista)']].map(([n, l]) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l)))),
          h('p', { class: 'hint mt' }, 'Si el ROI a cuota media es negativo, la “ventaja” detectada no existió en el pasado. Con pocas apuestas el resultado es muy ruidoso: 100 apuestas con cuota 2.5 tienen una desviación típica de ~±15 % de ROI.'));
        run.disabled = false; run.textContent = 'Repetir backtest';
      }, 60);
    });
    const steps = [['Mercado sin margen', 'Convertimos cada cuota en probabilidad y quitamos el margen de la casa (método de potencia, que corrige el sesgo favorito-longshot). La referencia es Pinnacle si existe: es la casa más “afilada”.'], ['Fuerza de cada equipo', 'Estimamos ataque y defensa de cada equipo por liga con los goles de las últimas temporadas, dando más peso a lo reciente (vida media ≈ 1 año) y encogiendo hacia el promedio a los equipos con pocos partidos.'], ['Goles → probabilidades', 'Con los goles esperados de cada lado, un modelo Poisson con corrección Dixon-Coles da la probabilidad de cada marcador y de ahí 1X2, más/menos 2.5 y ambos marcan.'], ['Mezcla y valor', 'Final = peso·modelo + (1−peso)·mercado. EV = prob. final × mejor cuota − 1. El stake sugerido es ¼ de Kelly con tope del 5 % de la banca.'], ['Lo que NO ve', 'Lesiones, alineaciones, cansancio, motivación, clima, árbitro, cambios de entrenador y mercados de jugadores. El modelo usa solo resultados y goles; no analiza jugadores individualmente.']];
    return h('div', { class: 'wrap pg' }, h('span', { class: 'eyebrow' }, 'Transparencia'), h('h1', { class: 'serif' }, 'Modelo y ', h('em', {}, 'backtest')), h('p', { class: 'lead' }, 'Cómo se calculan las probabilidades y, sobre todo, cuánto aciertan con datos pasados.'),
      h('div', { class: 'two' }, steps.map(([t, d], i) => h('div', { class: 'panel' }, h('h3', {}, (i + 1) + ' · ' + t), h('p', { class: 'muted', style: 'font-size:14px' }, d)))),
      h('div', { class: 'sec-t' }, h('h2', {}, 'Backtest')), run, h('div', { class: 'mt' }, out),
      PICK ? h('div', {}, h('div', { class: 'sec-t' }, h('h2', {}, 'Acierto por liga (todos los deportes)')), h('p', { class: 'muted' }, 'Con resultados pasados: cuántas veces acertó el resultado más probable según el modelo, frente a decir siempre “gana el local”. Sin cuotas históricas no se puede medir rentabilidad, solo acierto.'), PICK.accuracyTable()) : null);
  }

  /* ---------- Página: Mis cuotas (casas nacionales, a mano) ---------- */
  function pageManual() {
    const sel = h('select', { class: 'inp', 'aria-label': 'Partido' }, events.map((e) => h('option', { value: e.id }, limaStr(e) + ' · ' + e.h + ' – ' + e.a)));
    const book = h('input', { class: 'inp', placeholder: 'Ej. Inkabet', maxlength: 24 });
    const f = ['1', 'X', '2', '+2.5', '−2.5'].map((l) => h('input', { class: 'inp', type: 'number', step: '0.01', min: '1.01', placeholder: l, 'aria-label': 'Cuota ' + l }));
    const list = h('div', {});
    const drawList = () => {
      const rows = [];
      for (const id in manual) for (const b in manual[id]) { const e = evById(id) || F.events.find((x) => x.id === id) || ((window.AURUM_MULTI && window.AURUM_MULTI.events) || []).find((x) => x.id === id); rows.push([id, b, e ? e.h + ' – ' + e.a : 'Evento ' + id, manual[id][b]]); }
      list.replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Partido', 'Casa', '1 / X / 2', '', ''].map((c) => h('th', {}, c)))), h('tbody', {}, rows.map(([id, b, n, v]) => h('tr', {}, h('td', {}, n), h('td', {}, b), h('td', {}, (v['1x2'] || []).map(od).join(' / ')), h('td', {}, v.ou25 ? v.ou25.map(od).join(' / ') : ''), h('td', { class: 'r' }, h('button', { class: 'chip-btn', onclick: () => { delete manual[id][b]; if (!Object.keys(manual[id]).length) delete manual[id]; lsSet('aurum.manual', manual); prepare(); drawList(); } }, 'Quitar'))))))) : h('p', { class: 'muted' }, 'Aún no añadiste cuotas.'));
    };
    const add = () => {
      const v = f.map((i) => parseFloat(i.value)), name = book.value.trim();
      if (!name) return SL.toast('Escribe el nombre de la casa', 'warn');
      if (!(v[0] > 1 && v[1] > 1 && v[2] > 1) || v.slice(0, 3).some((x) => x >= 100)) return SL.toast('Introduce las tres cuotas 1X2 (entre 1 y 100)', 'warn');
      const inv = v.slice(0, 3).reduce((t, x) => t + 1 / x, 0) - 1;
      if (inv < -0.005 || inv > 0.15) return SL.toast('Esas cuotas no son coherentes entre sí (margen ' + (inv * 100).toFixed(0) + ' %): revisa lo que copiaste', 'warn');
      const entry = { '1x2': v.slice(0, 3) }; if (v[3] > 1 && v[4] > 1) entry.ou25 = v.slice(3, 5);
      (manual[sel.value] = manual[sel.value] || {})[name] = entry; lsSet('aurum.manual', manual); prepare(); drawList(); SL.toast('Cuota añadida: se compara con las demás casas');
    };
    drawList();
    return h('div', { class: 'wrap pg' }, h('span', { class: 'eyebrow' }, 'Casas nacionales'), h('h1', { class: 'serif' }, 'Mis cuotas'),
      h('p', { class: 'lead' }, 'Las casas peruanas (Inkabet, Betsson, Apuesta Total, Doradobet…) no ofrecen datos abiertos y rastrearlas va contra sus términos. Copia aquí las cuotas que veas y entrarán en la comparación y en el cálculo del mejor precio.'),
      h('div', { class: 'panel mt stack' }, SL.ui.field('Partido', sel), h('div', { class: 'formrow' }, SL.ui.field('Casa', book), f.map((i, k) => SL.ui.field(['Local', 'Empate', 'Visita', 'Más 2.5', 'Menos 2.5'][k], i))),
        h('button', { class: 'btn btn-primary', onclick: add }, 'Añadir cuota'), h('p', { class: 'hint' }, 'Solo se guardan en este navegador. Verifica siempre la cuota en la casa antes de decidir. Usa solo casas autorizadas por MINCETUR.')),
      h('div', { class: 'sec-t' }, h('h2', {}, 'Tus cuotas')), list);
  }

  /* ---------- Botón «Actualizar datos» (requiere tools/serve.py) ---------- */
  function openRefresh() {
    let timer = 0;
    const body = h('div', { class: 'stack' }), m = SL.modal('Actualizar datos', body, { onClose: () => clearInterval(timer) });
    const unsupported = () => {
      clearInterval(timer); body.replaceChildren(
        h('p', { class: 'muted' }, 'Este botón necesita el servidor local de Aurum. Ábrelo desde una terminal, en la carpeta del proyecto:'),
        h('div', { class: 'code' }, 'python3 tools/serve.py'),
        h('p', { class: 'hint' }, 'y entra en http://localhost:5183/. O actualiza a mano con: python3 tools/fetch_data.py && python3 tools/fetch_espn.py && node tools/backtest.js && node tools/backtest_multi.js'));
    };
    const ICON = { pending: '○', running: '…', ok: '✓', error: '✕' };
    const draw = (d) => {
      body.replaceChildren(
        h('p', { class: 'muted', style: 'font-size:14px' }, d.running ? 'Descargando y recalculando. Puede tardar un par de minutos la primera vez.' : d.ok ? 'Listo. Datos actualizados.' : 'Terminó con avisos. Revisa los pasos con ✕ (suele ser un fallo de red de una fuente; las demás sí se actualizaron).'),
        h('div', { class: 'stack' }, d.steps.map((st) => h('div', { class: 'kv', style: 'align-items:flex-start;gap:12px' }, h('span', { style: 'flex:1;color:' + (st.state === 'error' ? 'var(--rose)' : st.state === 'ok' ? 'var(--sage)' : 'var(--fog)') }, ICON[st.state] + ' ' + st.name, st.tail ? h('small', { class: 'hint', style: 'white-space:pre-wrap' }, st.tail) : null), h('b', {}, st.secs == null ? '' : st.secs + ' s')))),
        d.running ? null : h('button', { class: 'btn btn-primary btn-block', onclick: () => location.reload() }, 'Recargar la página'));
    };
    const poll = () => { timer = setInterval(() => { fetch('/api/status').then((r) => r.json()).then((d) => { draw(d); if (!d.running && d.finished) { clearInterval(timer); if (d.ok) setTimeout(() => location.reload(), 1500); } }).catch(unsupported); }, 1200); };
    const start = () => {
      body.replaceChildren(h('p', { class: 'muted' }, 'Iniciando…'));
      fetch('/api/refresh', { method: 'POST' }).then((r) => { if (r.status === 202 || r.status === 409) poll(); else if (r.status === 429) body.replaceChildren(h('p', { class: 'muted' }, 'Ya actualizaste hace un momento. Espera un par de minutos y vuelve a intentarlo.')); else unsupported(); }).catch(unsupported);
    };
    /* Clave de The Odds API: se guarda SOLO en este computador (archivo oculto tools/.odds_api_key); la web nunca la vuelve a mostrar completa */
    const keyBox = h('div', { class: 'panel stack' });
    const drawKey = (st) => {
      const msg = h('div', { class: 'neg', style: 'font-size:13px;min-height:16px' });
      const input = h('input', { class: 'inp', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Pega aquí tu clave de The Odds API', 'aria-label': 'Clave de The Odds API' });
      const save = () => {
        const k = input.value.trim(); if (!k) { msg.textContent = 'Pega tu clave primero.'; return; }
        fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }) })
          .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => { if (!ok) { msg.textContent = j.error || 'No se pudo guardar.'; return; } input.value = ''; SL.toast('Clave guardada en tu computador'); drawKey(j); }).catch(unsupported);
      };
      const remove = () => fetch('/api/key', { method: 'DELETE' }).then((r) => r.json()).then((j) => { SL.toast('Clave eliminada'); drawKey(j); }).catch(unsupported);
      keyBox.replaceChildren(h('h3', {}, 'Cuotas de casas con licencia en Perú'),
        h('p', { class: 'hint', style: 'margin-top:0' }, 'Betsson, Coolbet, 1xBet y otras. Necesitan una clave gratuita de The Odds API (the-odds-api.com). Se guarda solo en tu computador y no se comparte.'),
        st && st.has ? h('div', { class: 'stack' }, h('div', { class: 'kv' }, h('span', {}, 'Clave guardada'), h('b', {}, st.masked)), h('div', { class: 'chips' }, h('button', { class: 'chip-btn', onclick: () => drawKey({ has: false }) }, 'Cambiar'), h('button', { class: 'chip-btn', onclick: remove }, 'Quitar')))
          : h('div', { class: 'stack' }, input, msg, h('button', { class: 'btn btn-ghost btn-block', onclick: save }, 'Guardar clave')));
    };
    body.append(keyBox, h('button', { class: 'btn btn-primary btn-block btn-lg', onclick: start }, 'Actualizar ahora'), h('p', { class: 'hint' }, 'Descarga calendarios, resultados y cuotas, y recalcula los pronósticos. Sin clave, se omiten las casas de The Odds API.'));
    fetch('/api/key').then((r) => (r.ok ? r.json() : Promise.reject())).then(drawKey).catch(unsupported);
  }
  // En internet (no en tu computador) no hay servidor de refresco: el botón se oculta y los datos los actualiza la publicación automática
  const LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || /\.localhost$/.test(location.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const ONLINE = /^https?:$/.test(location.protocol) && !LOCALHOST;
  if (ONLINE) $('#refresh').remove(); else $('#refresh').addEventListener('click', openRefresh);

  /* ---------- Router ---------- */
  let PICK = null;
  function route() {
    const hash = location.hash.replace(/^#\/?/, ''); const [r, arg] = hash.split('/');
    let el;
    const fd = !(window.__noData || !H || !F);
    const pages = { valor: pageHome, partidos: pagePartidos, combinadas: pageParlays, modelo: pageModel, cuotas: pageManual };
    try {
      if ((r === '' || r === 'pronosticos') && PICK) el = PICK.page();
      else if (r === 'partido') el = fd ? pageMatch(decodeURIComponent(arg || '')) : noData();
      else if (r === '' || r === 'valor') el = fd ? pageHome() : noData();
      else if (pages[r]) el = (fd || r === 'modelo') ? pages[r]() : noData();
      else el = PICK ? PICK.page() : (fd ? pageHome() : noData());
    } catch (e) { console.error(e); el = h('div', { class: 'wrap pg' }, h('h1', {}, 'Algo salió mal'), h('p', { class: 'muted' }, String(e.message))); }
    view.replaceChildren(el);
    const cur = r === '' || r === 'pronosticos' ? 'home' : r === 'partido' ? 'partidos' : r;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === cur));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('#menu').addEventListener('click', (e) => { const o = $('#nav').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  $('#nav').addEventListener('click', () => $('#nav').classList.remove('open'));

  // Une cada evento de ESPN con el mismo partido de football-data (9 casas) por liga, fecha y nombres de equipos
  const FD_OF = { 'soccer/eng.1': 'E0', 'soccer/eng.2': 'E1', 'soccer/esp.1': 'SP1', 'soccer/ger.1': 'D1', 'soccer/ita.1': 'I1', 'soccer/fra.1': 'F1', 'soccer/ned.1': 'N1', 'soccer/por.1': 'P1', 'soccer/tur.1': 'T1', 'soccer/sco.1': 'SC0' };
  /* Casas con licencia en Perú (lista de terceros en data/casas_peru.js: NO es el registro oficial) */
  const CP = window.AURUM_CASAS_PE;
  const normB = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
  const brandMap = {}; if (CP) CP.marcas.forEach((m) => (brandMap[normB(m.marca)] = m));
  function peruStatus(name) {
    if (name.includes('✎')) return { mine: true };
    if (!CP) return null;
    let k = normB(name); if (CP.alias && CP.alias[k]) k = normB(CP.alias[k]);
    const m = brandMap[k]; return m ? { brand: m.marca, empresa: m.empresa, suspendida: !!m.suspendida } : null;
  }
  /* Cuotas de The Odds API (Betsson, Coolbet, 1xBet…) unidas al evento de ESPN por fecha y equipos (también con local/visita invertidos) */
  const oapi = (window.AURUM_ODDSAPI && window.AURUM_ODDSAPI.events || []).map((x) => Object.assign({}, x, { t: Date.parse(x.ko) }));
  const oapiCache = {};
  function oapiBooks(e) {
    if (!oapi.length || !window.SLMulti) return null;
    if (oapiCache[e.id] !== undefined) return oapiCache[e.id];
    const X = window.SLMulti; let flip = false, f = X.matchEvent(e, oapi);
    if (!f) { f = X.matchEvent({ t: e.t, h: e.a, a: e.h }, oapi); flip = !!f; }
    const out = {};
    if (f) for (const b of Object.keys(f.books)) { const ml = f.books[b].ml; out[b] = { ml: flip ? [ml[2], ml[1], ml[0]] : ml.slice() }; }
    return (oapiCache[e.id] = Object.keys(out).length ? out : null);
  }
  const fdCache = {};
  function fdBooks(e) {
    const code = FD_OF[e.lg]; if (!code || !window.SLMulti) return null;
    if (fdCache[e.id] !== undefined) return fdCache[e.id];
    const f = window.SLMulti.matchEvent(e, events.filter((x) => x.lg === code));
    const out = {};
    if (f) for (const b of Object.keys(f.books)) { if (b === 'Max' || b === 'Avg') continue; const bk = f.books[b]; if (bk['1x2']) out[b] = { ml: bk['1x2'], ou25: bk.ou25 || null }; }
    return (fdCache[e.id] = Object.keys(out).length ? out : null);
  }
  (function purgeManual() {
    const ids = new Set([].concat((F && F.events) || [], (window.AURUM_MULTI && window.AURUM_MULTI.events) || []).map((e) => e.id));
    if (!ids.size) return; let ch = false;
    for (const id of Object.keys(manual)) if (!ids.has(id)) { delete manual[id]; ch = true; }
    if (ch) lsSet('aurum.manual', manual);
  })();
  const ok = prepare();
  if (window.AurumPick && window.AURUM_MULTI && window.SLMulti) {
    PICK = window.AurumPick.create({ h, X: window.SLMulti, Mo, fdBooks, oapiBooks, peruStatus, online: ONLINE, S, od, pct, money, limaStr, saveUI, manual: () => manual,
      setManual: (id, book, ml) => { (manual[id] = manual[id] || {})[book] = { '1x2': ml }; lsSet('aurum.manual', manual); } });
  }
  const gens = [F && F.generated, window.AURUM_MULTI && window.AURUM_MULTI.generated, window.AURUM_ODDSAPI && window.AURUM_ODDSAPI.generated].filter(Boolean).map((g) => new Date(g).getTime());
  const gen = gens.length ? Math.min.apply(null, gens) : 0; // la fuente más antigua manda
  const ageH = gen ? (Date.now() - gen) / 36e5 : 0;
  $('#fresh').textContent = gen ? 'datos de hace ' + (ageH < 1 ? '<1' : Math.round(ageH)) + ' h' : 'sin datos';
  if (ageH > 12) $('#fresh').classList.add('warn');
  route();
})();
