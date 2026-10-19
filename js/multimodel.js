/* Aurum · modelos multi-deporte (puro, navegador y Node). Fútbol: Poisson (model.js). Resto: Elo con ventaja de local y margen de victoria. */
(function (root) {
  'use strict';
  const Mo = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.SLModel;
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  // k = velocidad de aprendizaje, hfa = ventaja de local en puntos Elo, mov = usa margen de victoria, minGames = partidos mínimos para fiarse
  const SPORT = {
    basketball: { k: 20, hfa: 90, mov: true, minGames: 8 },
    baseball: { k: 5, hfa: 24, mov: true, minGames: 20 },
    football: { k: 20, hfa: 48, mov: true, minGames: 4 },
    hockey: { k: 8, hfa: 30, mov: true, minGames: 12 },
    mma: { k: 40, hfa: 0, mov: false, minGames: 2 },
    tennis: { k: 28, hfa: 0, mov: false, minGames: 4 },
    default: { k: 20, hfa: 40, mov: true, minGames: 6 },
  };
  const cfgOf = (sport) => SPORT[sport] || SPORT.default;
  const isGoals = (sport) => sport === 'soccer';

  /* ---------- Elo ---------- */
  const expected = (dr) => 1 / (1 + Math.pow(10, -dr / 400));
  // Pretemporada de ligas americanas por fechas (la caché antigua no trae el tipo de temporada)
  const isPreseasonDate = (lg, d) => { const md = d.slice(5); return lg === 'basketball/nba' ? (md >= '10-01' && md <= '10-18') : lg === 'hockey/nhl' ? (md >= '09-15' && md <= '10-06') : lg === 'football/nfl' ? (md >= '08-01' && md <= '09-04') : false; };
  const usable = (r, sport) => { // descarta pretemporada de béisbol (antes del 25-mar) y empates fuera del fútbol/rugby
    if (r.w !== 'h' && r.w !== 'a' && r.w !== 'd') return false;
    if (r.w === 'd' && !isGoals(sport)) return false;
    if (r.pre) return false; // marcado como pretemporada por la fuente
    if (r.lg && isPreseasonDate(r.lg, r.d)) return false;
    if (sport === 'baseball') { const md = r.d.slice(5); if (md < '03-25' || md > '11-15') return false; }
    return true;
  };
  function eloRun(results, sport, onPredict) {
    results = results.filter((r) => usable(r, sport));
    const c = cfgOf(sport), R = {}, N = {}, last = {};
    const get = (t) => (R[t] == null ? (R[t] = 1500, N[t] = 0, 1500) : R[t]);
    const rs = results.slice().sort((a, b) => a.d.localeCompare(b.d));
    for (const m of rs) {
      if (m.w !== 'h' && m.w !== 'a' && m.w !== 'd') continue;
      for (const t of [m.h, m.a]) { // regresión a la media tras una pausa larga (entre temporadas)
        get(t); if (last[t] && (Date.parse(m.d) - Date.parse(last[t])) / 864e5 > 120) R[t] = 1500 + 0.75 * (R[t] - 1500);
      }
      const hfa = m.neutral ? 0 : c.hfa, dr = R[m.h] + hfa - R[m.a], e = expected(dr);
      if (onPredict) onPredict(m, e, N[m.h], N[m.a]);
      const s = m.w === 'h' ? 1 : m.w === 'a' ? 0 : 0.5;
      let mult = 1;
      if (c.mov && m.hs != null && m.as != null && m.hs !== m.as) {
        const diff = Math.abs(m.hs - m.as), wDr = (s === 1 ? dr : -dr);
        mult = Math.log(diff + 1) * (2.2 / (wDr * 0.001 + 2.2));
      }
      const delta = c.k * mult * (s - e);
      R[m.h] += delta; R[m.a] -= delta; N[m.h]++; N[m.a]++; last[m.h] = last[m.a] = m.d;
    }
    return { R, N, last };
  }
  // probabilidad de que gane el local; se encoge hacia 50 % si hay pocos partidos de alguno
  function eloProb(state, sport, h, a, neutral, onDate) {
    const c = cfgOf(sport); if (!state || state.R[h] == null || state.R[a] == null) return null;
    const nMin = Math.min(state.N[h], state.N[a]);
    const reg = (t) => (onDate && state.last[t] && (Date.parse(onDate) - Date.parse(state.last[t])) / 864e5 > 120 ? 1500 + 0.75 * (state.R[t] - 1500) : state.R[t]); // misma regresión que en el entrenamiento
    const rH0 = reg(h), rA0 = reg(a);
    const p = expected(rH0 + (neutral ? 0 : c.hfa) - rA0), w = Math.min(1, nMin / c.minGames);
    return { p: 0.5 + (p - 0.5) * w, raw: p, nH: state.N[h], nA: state.N[a], reliable: nMin >= c.minGames, rH: rH0, rA: rA0 };
  }

  /* ---------- Mercado (cuotas decimales de una casa: ml = [local, empate|null, visita]) ---------- */
  function marketProbs(ml) {
    if (!ml) return null;
    const odds = ml[1] == null ? [ml[0], ml[2]] : ml;
    if (!odds.every((x) => x > 1)) return null;
    const ov = Mo.overround(odds); if (ov < -0.005 || ov > 0.2) return null;
    return Mo.devigPower(odds);
  }

  /* ---------- Ajuste GLOBAL de fútbol: un equipo tiene un solo rating en todas sus competiciones (liga + copas). Cada
     competición conserva su propio promedio de goles. Las copas conectan las ligas entre sí. ---------- */
  // Clave de equipo para el ajuste global: «nombre|país» en su liga; en copas se resuelve al país de su liga doméstica; si el nombre existe
  // en varios países (Liverpool UY/GB, Santos BR/MX…) no se comparte entre copas (se aísla por competición).
  function makeKeyer(leagues, results) {
    const ctry = {}; leagues.forEach((l) => (ctry[l.id] = l.country || '?'));
    const dom = {}; results.forEach((r) => { if (isCross(r.lg)) return; [r.h, r.a].forEach((t) => (dom[t] = dom[t] || new Set()).add(ctry[r.lg])); });
    return (lg, name) => {
      if (!isCross(lg)) return name + '|' + (ctry[lg] || '?');
      const c = dom[name]; return c && c.size === 1 ? name + '|' + [...c][0] : c && c.size > 1 ? name + '|' + lg : name + '|?';
    };
  }
  function fitGlobal(matches, asOf, o) {
    o = Object.assign({ xi: 0.0019, k: 4, iters: 25, minW: 0.02 }, o || {});
    const t0 = Mo.dayNum(asOf), ms = [], sw = {}, sh = {}, sa = {};
    for (const m of matches) {
      const dn = Mo.dayNum(m.d); if (dn >= t0) continue;
      const w = Math.exp(-o.xi * (t0 - dn)); if (w < o.minW) continue;
      ms.push({ h: m.h, a: m.a, hg: m.hg, ag: m.ag, lg: m.lg, w });
      sw[m.lg] = (sw[m.lg] || 0) + w; sh[m.lg] = (sh[m.lg] || 0) + w * m.hg; sa[m.lg] = (sa[m.lg] || 0) + w * m.ag;
    }
    if (ms.length < 30) return null;
    const mus = {}; for (const lg in sw) mus[lg] = { h: sh[lg] / sw[lg], a: sa[lg] / sw[lg] };
    const teams = {};
    for (const m of ms) for (const t of [m.h, m.a]) if (!teams[t]) teams[t] = { att: 1, def: 1, n: 0 };
    for (const m of ms) { teams[m.h].n += m.w; teams[m.a].n += m.w; }
    for (let it = 0; it < o.iters; it++) {
      const na = {}, da = {}, nd = {}, dd = {};
      for (const t in teams) na[t] = da[t] = nd[t] = dd[t] = 0;
      for (const m of ms) {
        const H = teams[m.h], A = teams[m.a], mu = mus[m.lg];
        na[m.h] += m.w * m.hg; da[m.h] += m.w * mu.h * A.def; na[m.a] += m.w * m.ag; da[m.a] += m.w * mu.a * H.def;
        nd[m.h] += m.w * m.ag; dd[m.h] += m.w * mu.a * A.att; nd[m.a] += m.w * m.hg; dd[m.a] += m.w * mu.h * H.att;
      }
      let s1 = 0, s2 = 0, c = 0;
      for (const t in teams) { teams[t].att = (na[t] + o.k) / (da[t] + o.k); teams[t].def = (nd[t] + o.k) / (dd[t] + o.k); s1 += teams[t].att; s2 += teams[t].def; c++; }
      for (const t in teams) { teams[t].att /= s1 / c; teams[t].def /= s2 / c; }
    }
    return { mus, teams, n: ms.length, asOf };
  }
  const fitView = (g, lg) => (g && g.mus[lg] ? { muH: g.mus[lg].h, muA: g.mus[lg].a, teams: g.teams, n: g.n, asOf: g.asOf } : null);

  /* ---------- Contexto por liga: ajusta una vez, predice muchos eventos ---------- */
  function buildContext(multi, asOf, copts) {
    copts = copts || {};
    const byLg = {};
    (multi.results || []).forEach((r) => (byLg[r.lg] = byLg[r.lg] || []).push(r));
    const sportOf = {}; (multi.leagues || []).forEach((l) => (sportOf[l.id] = l.sport));
    const ctx = { fits: {}, elo: {}, sportOf, byLg, global: {} };
    let G = null;
    const wantsGlobal = (lg) => copts.globalAll || (copts.globalCross && isCross(lg));
    if (Object.keys(byLg).some((lg) => isGoals(sportOf[lg] || lg.split('/')[0]) && wantsGlobal(lg))) {
      ctx.keyer = makeKeyer(multi.leagues || [], multi.results || []);
      const all = []; for (const lg in byLg) if (isGoals(sportOf[lg] || lg.split('/')[0])) byLg[lg].forEach((r) => { if (r.hs != null) all.push({ d: r.d, lg, h: ctx.keyer(lg, r.h), a: ctx.keyer(lg, r.a), hg: r.hs, ag: r.as }); });
      G = fitGlobal(all, asOf, { k: 3 });
    }
    for (const lg in byLg) {
      const sp = sportOf[lg] || lg.split('/')[0];
      if (isGoals(sp) && G && wantsGlobal(lg) && fitView(G, lg)) { ctx.fits[lg] = fitView(G, lg); ctx.global[lg] = true; }
      else if (isGoals(sp)) ctx.fits[lg] = Mo.fitLeague(byLg[lg].filter((r) => r.hs != null).map((r) => ({ d: r.d, h: r.h, a: r.a, hg: r.hs, ag: r.as })), asOf, { k: 3 });
      else ctx.elo[lg] = eloRun(byLg[lg], sp);
    }
    return ctx;
  }

  /* ---------- Pronóstico de un evento ---------- */
  // Un mercado de 3 resultados (1X2 con empate, tiempo reglamentario) NO es comparable con uno de 2 (quién gana, con prórroga):
  // en deportes sin empate se descartan las casas que publican empate, y en fútbol las que no lo publican.
  function filterBooksByMarket(books, draw) {
    const out = {}; for (const b in books) { const ml = books[b] && books[b].ml; if (!ml) continue; if ((ml[1] != null) === !!draw) out[b] = books[b]; } return out;
  }
  const isExchange = (b) => /exchange|matchbook|smarkets/i.test(b); // bolsas: cobran comisión, no cuentan como «mejor cuota»
  const isCross = (lg) => /\/(uefa|conmebol|concacaf|fifa|afc|caf)\./.test(lg) || /friendly|cup|copa|pokal|coppa|coupe|\.fa$|supercup|supercopa|nations|world|gold|leagues/.test(lg);
  function forecast(ctx, ev, opts) {
    opts = Object.assign({ wModel: 0, extraBooks: null }, opts || {});
    const sp = ctx.sportOf[ev.lg] || ev.lg.split('/')[0], goals = isGoals(sp);
    const draw = goals;
    const labels = draw ? [ev.h, 'Empate', ev.a] : [ev.h, ev.a];
    let model = null, info = {};
    if (goals) {
      const kh = ctx.global[ev.lg] ? ctx.keyer(ev.lg, ev.h) : ev.h, ka = ctx.global[ev.lg] ? ctx.keyer(ev.lg, ev.a) : ev.a;
      const pr = Mo.predictMatch(ctx.fits[ev.lg], kh, ka, 5);
      if (pr && ev.neutral) { // sede neutral: se promedia con el partido invertido para quitar la ventaja de local
        const q = Mo.predictMatch(ctx.fits[ev.lg], ka, kh, 5);
        if (q) { pr.p1x2 = [(pr.p1x2[0] + q.p1x2[2]) / 2, (pr.p1x2[1] + q.p1x2[1]) / 2, (pr.p1x2[2] + q.p1x2[0]) / 2]; pr.ou25 = [(pr.ou25[0] + q.ou25[0]) / 2, (pr.ou25[1] + q.ou25[1]) / 2]; pr.btts = [(pr.btts[0] + q.btts[0]) / 2, (pr.btts[1] + q.btts[1]) / 2]; const lh = (pr.lh + q.la) / 2, la = (pr.la + q.lh) / 2; pr.lh = lh; pr.la = la; }
      }
      if (pr) { model = pr.p1x2; info = { lh: pr.lh, la: pr.la, ou25: pr.ou25, btts: pr.btts, reliable: true }; }
    } else {
      const ep = eloProb(ctx.elo[ev.lg], sp, ev.h, ev.a, ev.neutral, (ev.ko || '').slice(0, 10));
      if (ep) { model = [ep.p, 1 - ep.p]; info = { rH: ep.rH, rA: ep.rA, nH: ep.nH, nA: ep.nA, reliable: ep.reliable }; }
    }
    // cuotas: DraftKings + las manuales (para casas nacionales)
    const books = Object.assign({}, ev.odds || {}, opts.extraBooks || {});
    let market = null, marketSrc = null;
    const rank = (b) => (b === 'Pinnacle' ? 0 : isExchange(b) ? 1 : b === 'DraftKings' ? 2 : 3); // referencia: la casa más «afilada» disponible
    for (const b of Object.keys(books).sort((x, y) => rank(x) - rank(y))) { if (b.includes('✎')) continue; const mp = books[b] && marketProbs(books[b].ml); if (mp && (mp.length === 3) === draw) { market = mp; marketSrc = b; break; } }
    if (!model && !market) return null;
    let p, source;
    if (model && opts.temp && opts.temp[sp]) model = calib(model, opts.temp[sp]);
    if (model && market) { p = model.map((x, i) => opts.wModel * x + (1 - opts.wModel) * market[i]); source = opts.wModel === 0 ? 'mercado' : 'mezcla'; }
    else if (market) { p = market; source = 'mercado'; } else { p = model; source = 'modelo'; }
    const tot = sum(p); p = p.map((x) => x / tot);
    let bi = 0; p.forEach((x, i) => { if (x > p[bi]) bi = i; });
    // cuota de referencia (DraftKings, no apostable en Perú) y mejor cuota MANUAL (casa del usuario): el EV solo se calcula con la segunda
    let ref = null, best = null; const idx = draw ? [0, 1, 2][bi] : [0, 2][bi];
    for (const b of Object.keys(books)) { if (b === 'Max' || b === 'Avg' || isExchange(b)) continue; const ml = books[b] && books[b].ml; const o = ml && ml[idx]; if (!(o > 1)) continue; if (b.includes('✎')) { if (!best || o > best.odds) best = { book: b, odds: o }; } else if (!ref || o > ref.odds) ref = { book: b, odds: o }; }
    const reliable = info.reliable !== false && (model != null || market != null);
    const alta = draw ? 0.6 : 0.68, media = draw ? 0.45 : 0.58;
    let conf = !reliable && source === 'modelo' ? 'baja' : p[bi] >= alta ? 'alta' : p[bi] >= media ? 'media' : 'baja';
    const cross = isCross(ev.lg) && !ctx.global[ev.lg] && source !== 'mercado';
    if (cross && conf === 'alta') conf = 'media'; // equipos de ligas distintas: el modelo solo conoce sus partidos en esta competición
    if (ev.pre) conf = conf === 'alta' ? 'media' : conf; // pretemporada: alineaciones de prueba
    const pickLabel = draw && bi === 1 ? 'Empate' : 'Gana ' + labels[bi];
    return { sport: sp, labels, p, model, market, marketSrc, source, pick: { i: bi, label: pickLabel, p: p[bi], fairOdds: 1 / p[bi], best, ref, ev: best ? p[bi] * best.odds - 1 : null, conf }, info: Object.assign(info, cross ? { cross: true } : {}), draw, hasOdds: !!market };
  }

  /* ---------- Calibración: p_i^s normalizado (s<1 suaviza un modelo sobreconfiado) ---------- */
  const calib = (p, s) => { if (!s || s === 1) return p; const q = p.map((x) => Math.pow(x, s)), t = sum(q); return q.map((x) => x / t); };
  function fitTemp(items) {
    if (!items || items.length < 100) return 1;
    let best = 1, bl = Infinity;
    for (let s = 0.4; s <= 1.0001; s += 0.02) { let ll = 0; for (const t of items) ll += -Math.log(Math.max(calib(t.p, s)[t.r], 1e-9)); if (ll < bl) { bl = ll; best = s; } }
    return Math.round(best * 100) / 100;
  }

  /* ---------- Backtest de aciertos por liga (sin cuotas históricas: mide al modelo contra "gana el local") ---------- */
  function backtestLeague(results, sport, testFrom, collect, fopts) {
    const rs = results.filter((r) => usable(r, sport)).slice().sort((a, b) => a.d.localeCompare(b.d));
    const test = []; // {p:[...], r: índice real}
    if (isGoals(sport)) {
      let fit = null, fitDay = -1e9;
      const ms = rs.filter((r) => r.hs != null).map((r) => ({ d: r.d, h: r.h, a: r.a, hg: r.hs, ag: r.as, ot: r.ot }));
      for (const m of ms) {
        if (m.d < testFrom || m.ot) continue; // prórroga/penales: el resultado a los 90' no se conoce con certeza
        const dn = Mo.dayNum(m.d); if (dn - fitDay >= 14) { fit = Mo.fitLeague(ms, m.d, Object.assign({ k: 3 }, fopts || {})); fitDay = dn; }
        const pr = Mo.predictMatch(fit, m.h, m.a, 5); if (!pr) continue;
        test.push({ p: pr.p1x2, r: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, k: m.d + '|' + m.h + '|' + m.a });
      }
    } else {
      eloRun(rs, sport, (m, e, nH, nA) => {
        if (m.d < testFrom || m.w === 'd') return;
        const c = cfgOf(sport), w = Math.min(1, Math.min(nH, nA) / c.minGames), p = 0.5 + (e - 0.5) * w;
        if (Math.min(nH, nA) < 2) return;
        test.push({ p: [p, 1 - p], r: m.w === 'h' ? 0 : 1 });
      });
    }
    if (!test.length) return null;
    if (collect) test.forEach((t) => collect.push(t));
    return Object.assign(summarize(test, sport), { _test: test });
  }
  function summarize(test, sport) {
    let hit = 0, ll = 0, br = 0, base = 0; const bins = {};
    const homeRate = test.filter((t) => t.r === 0).length / test.length;
    for (const t of test) {
      let bi = 0; t.p.forEach((x, i) => { if (x > t.p[bi]) bi = i; });
      if (bi === t.r) hit++;
      if (t.r === 0) base++;
      ll += -Math.log(Math.max(t.p[t.r], 1e-9)); br += sum(t.p.map((x, i) => Math.pow(x - (i === t.r ? 1 : 0), 2)));
      const k = Math.min(9, Math.floor(t.p[bi] * 10)); const b = (bins[k] = bins[k] || { n: 0, hit: 0, pm: 0 }); b.n++; b.pm += t.p[bi]; if (bi === t.r) b.hit++;
    }
    const n = test.length;
    const coin = sport === 'mma' || sport === 'tennis'; // h/a son competidor 1/2 (orden arbitrario): la referencia es la moneda
    return { n, acc: hit / n, baseAcc: coin ? 0.5 : base / n, logloss: ll / n, brier: br / n, homeRate, bins };
  }
  // Backtest del ajuste global de fútbol: devuelve {liga: métricas} para las ligas pedidas (la predicción usa TODAS las competiciones)
  function backtestGlobal(results, lgs, testFrom, fopts, keyer) {
    const K = keyer || ((lg, n) => n);
    const ms = results.filter((r) => usable(r, 'soccer') && r.hs != null).map((r) => ({ d: r.d, lg: r.lg, h: K(r.lg, r.h), a: K(r.lg, r.a), rh: r.h, ra: r.a, hg: r.hs, ag: r.as, ot: r.ot })).sort((a, b) => a.d.localeCompare(b.d));
    const tests = {}; let fit = null, fitDay = -1e9;
    for (const m of ms) {
      if (m.d < testFrom) continue;
      const dn = Mo.dayNum(m.d); if (dn - fitDay >= 14) { fit = fitGlobal(ms, m.d, Object.assign({ k: 3 }, fopts || {})); fitDay = dn; }
      if (m.ot || !lgs.has(m.lg)) continue;
      const pr = Mo.predictMatch(fitView(fit, m.lg), m.h, m.a, 5); if (!pr) continue;
      (tests[m.lg] = tests[m.lg] || []).push({ p: pr.p1x2, r: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, k: m.d + '|' + m.rh + '|' + m.ra });
    }
    const out = {}; for (const lg in tests) out[lg] = Object.assign(summarize(tests[lg], 'soccer'), { _test: tests[lg] });
    return out;
  }

  /* ---------- Unir nombres de equipos entre fuentes (ESPN ↔ football-data) ---------- */
  const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ssc', 'cd', 'club', 'de', 'the', 'ud', 'sv', 'fk', 'bk', 'if', 'sk', 'vfb', 'vfl', 'tsg', 'rb', 'us', 'ca']);
  const ALIAS = { qpr: 'queens park rangers', 'm gladbach': 'monchengladbach', koln: 'cologne', 'sp lisbon': 'sporting cp', buyuksehyr: 'istanbul basaksehir', 'man united': 'manchester united', 'man city': 'manchester city', 'ath madrid': 'atletico madrid', 'ath bilbao': 'athletic club', 'espanol': 'espanyol', 'vallecano': 'rayo vallecano', 'betis': 'real betis', 'sociedad': 'real sociedad' };
  const normTeam = (n) => { const t = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x && !STOP.has(x)); const a = ALIAS[t.join(' ')]; return a ? a.split(' ') : t; };
  function teamSim(a, b) {
    const A = normTeam(a), B = normTeam(b); if (!A.length || !B.length) return 0;
    if (A.join(' ') === B.join(' ')) return 1;
    const [S, L] = A.length <= B.length ? [A, B] : [B, A];
    const tokOk = (t) => L.some((u) => u === t || (t.length >= 3 && u.startsWith(t)) || (u.length >= 3 && t.startsWith(u)) || (t.length >= 4 && u.length >= 4 && t.slice(0, 4) === u.slice(0, 4)));
    if (S.every(tokOk)) return 0.9;
    const bg = (x) => { const z = x.join(' '), o = []; for (let i = 0; i < z.length - 1; i++) o.push(z.slice(i, i + 2)); return o; };
    const x = bg(A), y = bg(B); let m = 0; const cnt = {}; y.forEach((g) => (cnt[g] = (cnt[g] || 0) + 1)); x.forEach((g) => { if (cnt[g] > 0) { m++; cnt[g]--; } });
    return (2 * m) / (x.length + y.length);
  }
  // Busca, entre los eventos de otra fuente, el mismo partido (mismos dos equipos, misma liga, día ±1)
  function matchEvent(ev, others, minSim) {
    minSim = minSim || 0.75; let best = null;
    for (const o of others) {
      if (Math.abs(o.t - ev.t) > 36 * 3600e3) continue;
      const sh = teamSim(ev.h, o.h), sa = teamSim(ev.a, o.a); if (sh < minSim || sa < minSim) continue;
      const sc = sh + sa; if (!best || sc > best.sc) best = { o, sc };
    }
    return best && best.o;
  }

  const api = { filterBooksByMarket, isExchange, makeKeyer, normTeam, teamSim, matchEvent, fitGlobal, fitView, backtestGlobal, summarize, isPreseasonDate, isCross, calib, fitTemp, SPORT, cfgOf, isGoals, eloRun, eloProb, expected, marketProbs, buildContext, forecast, backtestLeague };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SLMulti = api;
})(typeof window !== 'undefined' ? window : globalThis);
