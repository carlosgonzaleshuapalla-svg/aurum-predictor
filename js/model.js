/* Aurum Predictor · modelo estadístico puro (sin DOM). Navegador y Node. */
(function (root) {
  'use strict';

  const dayNum = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  /* ---------- Cuotas → probabilidades ---------- */
  const overround = (odds) => sum(odds.map((o) => 1 / o)) - 1;
  const devigProportional = (odds) => { const s = sum(odds.map((o) => 1 / o)); return odds.map((o) => 1 / o / s); };
  // Método de potencia: p_i = (1/o_i)^k con k tal que sum = 1 (corrige el sesgo favorito-longshot)
  function devigPower(odds) {
    const q = odds.map((o) => 1 / o);
    if (sum(q) <= 1) return devigProportional(odds);
    let lo = 1, hi = 200;
    for (let i = 0; i < 60; i++) { const k = (lo + hi) / 2; if (sum(q.map((x) => Math.pow(x, k))) > 1) lo = k; else hi = k; }
    const k = (lo + hi) / 2; return q.map((x) => Math.pow(x, k));
  }

  /* ---------- Poisson / Dixon-Coles ---------- */
  const factCache = [1]; const fact = (n) => { for (let i = factCache.length; i <= n; i++) factCache[i] = factCache[i - 1] * i; return factCache[n]; };
  const pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / fact(k);
  const RHO = -0.05, MAXG = 10;
  function scoreMatrix(lh, la, rho) {
    rho = rho == null ? RHO : rho;
    const M = []; let tot = 0;
    for (let i = 0; i <= MAXG; i++) { M[i] = []; for (let j = 0; j <= MAXG; j++) {
      let t = 1;
      if (i === 0 && j === 0) t = 1 - lh * la * rho; else if (i === 0 && j === 1) t = 1 + lh * rho; else if (i === 1 && j === 0) t = 1 + la * rho; else if (i === 1 && j === 1) t = 1 - rho;
      M[i][j] = pois(i, lh) * pois(j, la) * Math.max(t, 0); tot += M[i][j];
    } }
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) M[i][j] /= tot;
    return M;
  }
  function marketsFromMatrix(M) {
    let h = 0, d = 0, a = 0, over = 0, btts = 0;
    for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
      const p = M[i][j];
      if (i > j) h += p; else if (i === j) d += p; else a += p;
      if (i + j >= 3) over += p;
      if (i > 0 && j > 0) btts += p;
    }
    return { p1x2: [h, d, a], ou25: [over, 1 - over], btts: [btts, 1 - btts] };
  }

  /* ---------- Ajuste de fuerzas por liga (ataque/defensa con decaimiento temporal) ---------- */
  function fitLeague(matches, asOf, opts) {
    opts = Object.assign({ xi: 0.0019, k: 4, iters: 30, minW: 0.02 }, opts || {}); // vida media ≈ 365 días
    const t0 = dayNum(asOf);
    const ms = [];
    for (const m of matches) {
      const dn = dayNum(m.d); if (dn >= t0) continue;
      const w = Math.exp(-opts.xi * (t0 - dn)); if (w < opts.minW) continue;
      ms.push({ h: m.h, a: m.a, hg: m.hg, ag: m.ag, w });
    }
    if (ms.length < 30) return null;
    let sw = 0, sh = 0, sa = 0;
    for (const m of ms) { sw += m.w; sh += m.w * m.hg; sa += m.w * m.ag; }
    const muH = sh / sw, muA = sa / sw;
    const teams = {};
    for (const m of ms) for (const t of [m.h, m.a]) if (!teams[t]) teams[t] = { att: 1, def: 1, n: 0 };
    for (const m of ms) { teams[m.h].n += m.w; teams[m.a].n += m.w; }
    for (let it = 0; it < opts.iters; it++) {
      const na = {}, da = {}, nd = {}, dd = {};
      for (const t in teams) na[t] = da[t] = nd[t] = dd[t] = 0;
      for (const m of ms) {
        const H = teams[m.h], A = teams[m.a];
        na[m.h] += m.w * m.hg; da[m.h] += m.w * muH * A.def;
        na[m.a] += m.w * m.ag; da[m.a] += m.w * muA * H.def;
        nd[m.h] += m.w * m.ag; dd[m.h] += m.w * muA * A.att;
        nd[m.a] += m.w * m.hg; dd[m.a] += m.w * muH * H.att;
      }
      let sa2 = 0, sd2 = 0, c = 0;
      for (const t in teams) { teams[t].att = (na[t] + opts.k) / (da[t] + opts.k); teams[t].def = (nd[t] + opts.k) / (dd[t] + opts.k); sa2 += teams[t].att; sd2 += teams[t].def; c++; }
      for (const t in teams) { teams[t].att /= sa2 / c; teams[t].def /= sd2 / c; }
    }
    return { muH, muA, teams, n: ms.length, asOf };
  }
  function predictMatch(fit, home, away, minN) {
    if (!fit) return null;
    const H = fit.teams[home], A = fit.teams[away], need = minN == null ? 6 : minN;
    if (!H || !A || H.n < need || A.n < need) return null;
    const lh = fit.muH * H.att * A.def, la = fit.muA * A.att * H.def;
    return Object.assign({ lh, la }, marketsFromMatrix(scoreMatrix(lh, la)));
  }

  /* ---------- Mercado: mejor cuota, probabilidad justa ---------- */
  const SHARP = ['Pinnacle', 'Avg', 'BetfairExchange'];
  // un mercado es utilizable solo si su margen es plausible (cuotas obsoletas o de bolsa dan margen enorme o negativo)
  const sane = (o) => !!o && o.every((x) => x > 1) && overround(o) > -0.005 && overround(o) < 0.15;
  function fairFromBooks(books, market) {
    for (const b of SHARP) { const o = books[b] && books[b][market]; if (sane(o)) return { probs: devigPower(o), src: b }; }
    const all = Object.keys(books).filter((b) => b !== 'Max' && !b.includes('✎') && sane(books[b][market])).map((b) => devigPower(books[b][market]));
    if (!all.length) return null;
    return { probs: all[0].map((_, i) => sum(all.map((p) => p[i])) / all.length), src: 'media de casas' };
  }
  const NOT_BOOK = ['Max', 'Avg', 'BetfairExchange', 'Matchbook'];
  function bestOdds(books, market, idx) {
    const cands = [];
    for (const b in books) { if (NOT_BOOK.includes(b)) continue; const o = books[b][market]; if (sane(o) && o[idx] > 1) cands.push({ book: b, odds: o[idx] }); }
    if (!cands.length) return null;
    if (cands.length >= 4) { // descarta cuotas obsoletas/atípicas: >25 % sobre la mediana de las demás
      const sorted = cands.map((c) => c.odds).sort((x, y) => x - y), med = sorted[Math.floor(sorted.length / 2)];
      const ok = cands.filter((c) => c.odds <= med * 1.25); if (ok.length) return ok.reduce((x, y) => (y.odds > x.odds ? y : x));
    }
    return cands.reduce((x, y) => (y.odds > x.odds ? y : x));
  }
  function oddsByBook(books, market, idx) {
    const r = {}; for (const b in books) { if (NOT_BOOK.includes(b)) continue; const o = books[b][market]; if (sane(o) && o[idx] > 1) r[b] = o[idx]; } return r;
  }
  const expectedValue = (p, odds) => p * odds - 1;
  function kelly(p, odds, frac, cap) { const f = (p * odds - 1) / (odds - 1); return Math.max(0, Math.min(cap == null ? 0.05 : cap, f * (frac == null ? 0.25 : frac))); }

  const SELS = {
    '1x2': [['Gana local', 0], ['Empate', 1], ['Gana visitante', 2]],
    ou25: [['Más de 2.5 goles', 0], ['Menos de 2.5 goles', 1]],
  };
  /* Analiza un evento: mezcla modelo y mercado y devuelve selecciones con valor esperado */
  function analyzeEvent(ev, pred, opts) {
    opts = Object.assign({ wModel: 0.35, wModelOU: 0, kellyFrac: 0.25, cap: 0.05 }, opts || {}); // más/menos 2.5 nunca se validó contra el mercado → sin modelo
    const out = [];
    for (const market of ['1x2', 'ou25']) {
      const fair = fairFromBooks(ev.books, market); if (!fair) continue;
      const model = pred ? (market === '1x2' ? pred.p1x2 : pred.ou25) : null;
      SELS[market].forEach(([label, i]) => {
        const best = bestOdds(ev.books, market, i); if (!best) return;
        const pm = fair.probs[i], pmod = model ? model[i] : null;
        const wm = market === '1x2' ? opts.wModel : opts.wModelOU, p = pmod == null ? pm : wm * pmod + (1 - wm) * pm;
        const ev_ = expectedValue(p, best.odds);
        out.push({ evId: ev.id, market, sel: i, label, book: best.book, odds: best.odds, pMarket: pm, pModel: pmod, byBook: oddsByBook(ev.books, market, i), p, ev: ev_, kelly: kelly(p, best.odds, opts.kellyFrac, opts.cap), src: fair.src, hasModel: pmod != null });
      });
    }
    return out;
  }

  /* ---------- Combinadas ---------- */
  function parlays(legs, opts) {
    opts = Object.assign({ minLegs: 2, maxLegs: 3, pool: 12, minP: 0.45 }, opts || {});
    const pool = legs.filter((l) => l.p >= opts.minP).sort((a, b) => b.ev - a.ev).slice(0, opts.pool);
    const res = [];
    const rec = (start, cur) => {
      if (cur.length >= opts.minLegs) {
        const odds = cur.reduce((x, l) => x * l.odds, 1), p = cur.reduce((x, l) => x * l.p, 1);
        res.push({ legs: cur.slice(), odds, p, ev: p * odds - 1 });
      }
      if (cur.length === opts.maxLegs) return;
      for (let i = start; i < pool.length; i++) { if (cur.some((l) => l.evId === pool[i].evId)) continue; cur.push(pool[i]); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    return res.sort((a, b) => b.ev - a.ev);
  }

  /* ---------- Backtest walk-forward ---------- */
  function resultIdx(m) { return m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2; }
  function backtest(allMatches, opts) {
    opts = Object.assign({ testFrom: null, refitDays: 14, wGrid: [0, 0.15, 0.3, 0.5, 0.75, 1], evThr: 0.04, marketBook: 'Avg' }, opts || {});
    const byLg = {}; allMatches.forEach((m) => (byLg[m.lg] = byLg[m.lg] || []).push(m));
    const stat = {}; opts.wGrid.forEach((w) => (stat[w] = { n: 0, brier: 0, ll: 0 }));
    const bets = { n: 0, stake: 0, retAvg: 0, retMax: 0, wins: 0, byBand: {} };
    let nTest = 0;
    for (const lg in byLg) {
      const ms = byLg[lg]; let fit = null, fitDay = -1e9;
      for (const m of ms) {
        if (opts.testFrom && m.d < opts.testFrom) continue;
        const dn = dayNum(m.d);
        if (dn - fitDay >= opts.refitDays) { fit = fitLeague(ms, m.d); fitDay = dn; }
        const mk = m.o && m.o[opts.marketBook]; if (!mk) continue;
        const pred = predictMatch(fit, m.h, m.a); if (!pred) continue;
        const pmk = devigPower(mk), r = resultIdx(m); nTest++;
        for (const w of opts.wGrid) {
          const p = [0, 1, 2].map((i) => w * pred.p1x2[i] + (1 - w) * pmk[i]);
          const s = stat[w]; s.n++; s.brier += sum(p.map((x, i) => Math.pow(x - (i === r ? 1 : 0), 2))); s.ll += -Math.log(Math.max(p[r], 1e-9));
        }
        // simulación de value bets (modelo puro vs cuota media del mercado; pago a cuota media y a cuota máxima)
        const w0 = opts.valueW == null ? 0.5 : opts.valueW, mx = m.o.Max;
        for (let i = 0; i < 3; i++) {
          const p = w0 * pred.p1x2[i] + (1 - w0) * pmk[i], odds = (m.o.Avg || mk)[i];
          if (p * odds - 1 >= opts.evThr) {
            bets.n++; bets.stake++; const win = i === r; if (win) { bets.wins++; bets.retAvg += odds; }
            if (mx && win) bets.retMax += mx[i];
            const band = Math.min(4, Math.floor((p * odds - 1) / 0.04)); const b = (bets.byBand[band] = bets.byBand[band] || { n: 0, ret: 0 }); b.n++; if (win) b.ret += odds;
          }
        }
      }
    }
    const metrics = {}; for (const w of opts.wGrid) { const s = stat[w]; metrics[w] = { n: s.n, brier: s.brier / s.n, logloss: s.ll / s.n }; }
    return { n: nTest, metrics, bets, roiAvg: bets.stake ? bets.retAvg / bets.stake - 1 : null, roiMax: bets.stake ? bets.retMax / bets.stake - 1 : null };
  }

  /* Estrategia que muestra la web: w = 0, mejor cuota de las casas, prob. justa de Pinnacle/Avg; stake 1 por selección */
  function realStrategy(matches, thr) {
    const rs = [];
    for (const m of matches) {
      if (!m.o) continue;
      const books = {}; for (const b in m.o) books[b] = { '1x2': m.o[b] };
      const fair = fairFromBooks(books, '1x2'); if (!fair) continue; const r = resultIdx(m);
      for (let i = 0; i < 3; i++) { const best = bestOdds(books, '1x2', i); if (best && fair.probs[i] * best.odds - 1 >= thr) rs.push((i === r ? best.odds : 0) - 1); }
    }
    const n = rs.length; if (!n) return { thr, n: 0, roi: null, ci: null };
    const mean = sum(rs) / n, sd = Math.sqrt(sum(rs.map((x) => (x - mean) * (x - mean))) / Math.max(1, n - 1));
    return { thr, n, roi: mean, ci: 1.96 * sd / Math.sqrt(n) };
  }

  const api = { realStrategy, oddsByBook, dayNum, overround, devigProportional, devigPower, pois, scoreMatrix, marketsFromMatrix, fitLeague, predictMatch, fairFromBooks, bestOdds, expectedValue, kelly, analyzeEvent, parlays, backtest, resultIdx, SELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SLModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
