/* Aurum Predictor · goleadores probables y mapa de tiros (sin DOM). Navegador y Node.
 *
 * Modelo (solo con datos reales de los últimos partidos de cada equipo, descargados por tools/fetch_players.py):
 *   1) Cada jugador aporta "producción" = 80 % xG (calidad de sus tiros según dónde los hizo) + 20 % goles reales. En la
 *      prueba con partidos pasados, dar más peso a los goles empeoraba la predicción (son muy ruidosos con tan pocos
 *      partidos). Los partidos recientes pesan más (decaimiento 0.88 por partido).
 *   2) Se reparte entre jugadores con un prior por posición (un delantero rinde más que un defensa) y se encoge hacia
 *      ese prior cuando el jugador tiene pocos minutos (equivale a ~3 partidos de evidencia).
 *   3) La disponibilidad esperada (titular reciente) multiplica su parte; las partes se normalizan a 1 y se multiplican
 *      por los goles esperados del equipo en ESE partido (λ del modelo Poisson): P(marca) = 1 − e^(−λ·parte).
 *   No conoce lesiones ni alineaciones: es la probabilidad si todo sigue como en los últimos partidos.
 */
(function (root) {
  'use strict';

  const DECAY = 0.88, ALPHA = 0.2, SHRINK = 3, SUB_W = 0.3;   // valores elegidos por backtest (tools/backtest_players.js --grid)
  // multiplicador de producción esperada por posición (abreviaturas de ESPN), medido en 286 partidos reales:
  // promedio de (goles por partido y tiros por partido) de cada posición, relativo a un delantero centro (F = 1)
  const POS = { G: 0.01, 'CD-L': 0.18, 'CD-R': 0.18, CD: 0.18, CB: 0.18, SW: 0.24, D: 0.2, LB: 0.21, RB: 0.19, WB: 0.22, LWB: 0.22, RWB: 0.22,
    DM: 0.2, CM: 0.31, 'CM-L': 0.33, 'CM-R': 0.28, M: 0.31, LM: 0.36, RM: 0.38, AM: 0.7, 'AM-L': 0.69, 'AM-R': 0.68, SS: 0.8, LW: 0.7, RW: 0.7,
    LF: 0.6, RF: 0.85, 'CF-L': 0.7, 'CF-R': 0.76, RCF: 0.9, CF: 0.9, F: 1, FW: 1, ST: 1, SUB: 0.55 };
  const posMult = (a) => (a && POS[a] != null ? POS[a] : 0.4);
  const posGroup = (a) => {
    if (!a) return 'Jugador'; if (a === 'G') return 'Portero'; if (a === 'SUB') return 'Suplente';
    if (/^(CD|CB|SW|D|LB|RB|WB|LWB|RWB)/.test(a)) return 'Defensa'; if (/^(DM|CM|M|LM|RM)/.test(a)) return 'Centrocampista';
    if (/^(AM|SS|LW|RW)/.test(a)) return 'Mediapunta'; if (/^(CF|F|LF|RF|ST|FW|RCF)/.test(a)) return 'Delantero'; return 'Jugador';
  };

  const W = (i, d) => Math.pow(d == null ? DECAY : d, i);

  /* ---------- xG por geometría del tiro (mismo modelo que tools/fetch_players.py) ---------- */
  function geom(x, y) {
    const dx = (100 - x) * 1.05, dy = (y - 50) * 0.68;
    let ang = Math.atan2(7.32 * dx, dx * dx + dy * dy - 3.66 * 3.66); if (ang < 0) ang += Math.PI;
    return [Math.hypot(dx, dy), ang];
  }
  function xgOf(coef, x, y, head, pen) /* head se ignora: ver tools/fetch_players.py */ {
    if (pen) return 0.76;
    const g = geom(x, y), z = coef[0] + coef[1] * g[0] + coef[2] * g[1];
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  }

  /* ---------- goleadores ---------- */
  // T = { m:[[fecha, rival, gf, ga, local, conCoordenadas]], p:[[nombre, pos, [[idx, rol(1 titular|2 suplente), tiros, aPuerta, goles, xG*100, asist]]]] }
  function scorers(T, lambda, opts) {
    opts = opts || {};
    const nM = T.m.length, wm = []; let wTot = 0;
    for (let i = 0; i < nM; i++) { wm[i] = W(i, opts.decay); wTot += wm[i]; }
    const rows = [];
    for (const pl of T.p) {
      let e = 0, O = 0, start = 0, sub = 0, g = 0, xg = 0, sh = 0, sot = 0, ast = 0, n = 0, last = -1;
      for (const r of pl[2]) {
        const w = wm[r[0]]; if (w == null) continue;
        const f = r[1] === 1 ? 1 : SUB_W;
        e += w * f; if (r[1] === 1) start += w; else sub += w;
        O += w * ((opts.alpha == null ? ALPHA : opts.alpha) * r[4] + (1 - (opts.alpha == null ? ALPHA : opts.alpha)) * r[5] / 100);
        g += r[4]; xg += r[5] / 100; sh += r[2]; sot += r[3]; ast += r[6]; n++; if (last < 0 || r[0] < last) last = r[0];
      }
      if (!n) continue;
      rows.push({ name: pl[0], pos: pl[1], mult: posMult(pl[1]), e, O, avail: Math.min(1, (start + SUB_W * sub) / wTot), g, xg, sh, sot, ast, apps: n, last });
    }
    if (!rows.length) return [];
    let num = 0, den = 0; for (const r of rows) { num += r.O; den += r.e * r.mult; }
    const base = den > 0 ? num / den : 0.15, K = opts.shrink == null ? SHRINK : opts.shrink;
    let tot = 0;
    for (const r of rows) { r.q = (r.O + K * base * r.mult) / (r.e + K); r.u = r.avail * r.q; tot += r.u; }
    if (tot <= 0) return [];
    const lam = lambda != null ? lambda : (T.m.reduce((s, m, i) => s + (m[2] == null ? 0 : wm[i] * m[2]), 0) / wTot) || 1.2;
    for (const r of rows) { r.share = r.u / tot; r.p = 1 - Math.exp(-lam * r.share); }
    rows.sort((a, b) => b.p - a.p);
    rows.lambda = lam;
    return rows;
  }

  /* ---------- mapa de calor de tiros ---------- */
  // pts = [[x, y, tipo(g|t|o|b|w), xG*100, idx, penal]] en sentido de ataque de quien dispara (portería en x = 100)
  function heat(pts, opts) {
    opts = opts || {};
    const cols = opts.cols || 26, rows = opts.rows || 17, sig = opts.sigma || 7.5, dec = opts.decay == null ? 0.9 : opts.decay, mirror = !!opts.mirror;
    const cells = new Array(cols * rows).fill(0); let n = 0;
    for (const p of pts) {
      const px = mirror ? 100 - p[0] : p[0], py = mirror ? 100 - p[1] : p[1], w = Math.pow(dec, p[4] || 0); n++;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * 100 / cols, cy = (r + 0.5) * 100 / rows, dx = (px - cx) * 1.05, dy = (py - cy) * 0.68;
        cells[r * cols + c] += w * Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig));
      }
    }
    let max = 0; for (const v of cells) if (v > max) max = v;
    return { cols, rows, cells, max, n };
  }

  // reparto por zonas (en sentido de ataque)
  function zones(pts) {
    const z = { n: pts.length, six: 0, box: 0, out: 0, left: 0, mid: 0, right: 0, goals: 0, xg: 0, onT: 0 };
    for (const p of pts) {
      const dy = Math.abs(p[1] - 50);
      if (p[0] >= 94.8 && dy <= 13.5) z.six++; else if (p[0] >= 84.3 && dy <= 29.6) z.box++; else z.out++;
      if (p[1] < 33) z.left++; else if (p[1] > 67) z.right++; else z.mid++;
      if (p[2] === 'g') z.goals++; if (p[2] === 'g' || p[2] === 't') z.onT++;
      z.xg += (p[3] || 0) / 100;
    }
    return z;
  }

  // calibración empírica p' = a·p^b (la calcula tools/backtest_players.js); sin parámetros devuelve p tal cual
  const calibrate = (p, cal) => (cal && cal.a ? Math.min(0.9, cal.a * Math.pow(p, cal.b)) : p);

  const api = { calibrate, scorers, heat, zones, geom, xgOf, posGroup, posMult, W, DECAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AurumScorers = api;
})(typeof window !== 'undefined' ? window : globalThis);
