/* Aurum · lógica pura (sin DOM). Corre en navegador y en Node para el gate. */
(function (root) {
  'use strict';

  /* ---------- SHA-256 / HMAC (síncrono, para ser provably fair sin async) ---------- */
  const P = [];
  for (let n = 2; P.length < 64; n++) {
    let ok = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { ok = false; break; }
    if (ok) P.push(n);
  }
  const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296);
  const K = P.map((p) => frac(Math.cbrt(p)));
  const H0 = P.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const enc = (s) => new TextEncoder().encode(s);

  function sha256(msg) {
    const l = msg.length;
    const padLen = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(padLen);
    m.set(msg);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(padLen - 8, Math.floor((l * 8) / 4294967296));
    dv.setUint32(padLen - 4, (l * 8) >>> 0);
    const h = H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    const out = new Uint8Array(32);
    const o = new DataView(out.buffer);
    h.forEach((v, i) => o.setUint32(i * 4, v));
    return out;
  }

  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64);
    k.set(key);
    const ipad = new Uint8Array(64 + msg.length);
    const opad = new Uint8Array(96);
    for (let i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
    ipad.set(msg, 64);
    opad.set(sha256(ipad), 64);
    return sha256(opad);
  }

  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const sha256hex = (s) => hex(sha256(enc(s)));

  /* Flujo de números en [0,1): HMAC(server, client:nonce:ronda) → 8 floats por hash */
  function stream(server, client, nonce) {
    let round = 0, buf = [], i = 0;
    return {
      next() {
        if (i >= buf.length) {
          const h = hmac(enc(server), enc(client + ':' + nonce + ':' + round));
          round++; buf = []; i = 0;
          for (let k = 0; k + 4 <= 32; k += 4) {
            buf.push(h[k] / 256 + h[k + 1] / 65536 + h[k + 2] / 16777216 + h[k + 3] / 4294967296);
          }
        }
        return buf[i++];
      },
    };
  }

  function shuffle(arr, s) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(s.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const floor2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

  /* ---------- Dados ---------- */
  const diceRoll = (f) => Math.floor(f * 10001) / 100; // 0.00–100.00
  const diceChance = (mode, target) => (mode === 'over' ? 100 - target : target);
  const diceMultiplier = (chance) => Math.floor((99 / chance) * 10000) / 10000;
  const diceWin = (mode, target, roll) => (mode === 'over' ? roll > target : roll < target);

  /* ---------- Crash ---------- */
  const CRASH_RATE = 0.13; // m(t) = e^(rate·t), t en segundos
  const crashPoint = (f) => Math.max(1, Math.floor((0.99 / (1 - f)) * 100) / 100);
  const crashMultAt = (t) => Math.exp(CRASH_RATE * t);
  const crashTimeFor = (m) => Math.log(m) / CRASH_RATE;

  /* ---------- Minas (tablero 5×5) ---------- */
  function comb(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
  const minesMultiplier = (mines, picks) =>
    picks === 0 ? 1 : floor2((0.99 * comb(25, picks)) / comb(25 - mines, picks));
  function minesPositions(s, mines) {
    const idx = shuffle(Array.from({ length: 25 }, (_, i) => i), s);
    return idx.slice(0, mines);
  }

  /* ---------- Ruleta europea ---------- */
  const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const rouletteSpin = (f) => Math.floor(f * 37);
  const rouletteColor = (n) => (n === 0 ? 'green' : REDS.includes(n) ? 'red' : 'black');
  function betWins(type, value, n) {
    if (type === 'n') return n === value;
    if (n === 0) return false;
    switch (type) {
      case 'red': return REDS.includes(n);
      case 'black': return !REDS.includes(n);
      case 'even': return n % 2 === 0;
      case 'odd': return n % 2 === 1;
      case 'low': return n <= 18;
      case 'high': return n >= 19;
      case 'd1': return n <= 12;
      case 'd2': return n >= 13 && n <= 24;
      case 'd3': return n >= 25;
      case 'c1': return n % 3 === 1;
      case 'c2': return n % 3 === 2;
      case 'c3': return n % 3 === 0;
    }
    return false;
  }
  const ROULETTE_RETURN = { n: 36, red: 2, black: 2, even: 2, odd: 2, low: 2, high: 2, d1: 3, d2: 3, d3: 3, c1: 3, c2: 3, c3: 3 };
  function rouletteReturn(bets, n) {
    let t = 0;
    for (const b of bets) if (betWins(b.type, b.value, n)) t += b.amount * ROULETTE_RETURN[b.type];
    return Math.round(t * 100) / 100;
  }

  /* ---------- Tragaperras 3×3, 5 líneas ---------- */
  // Cada símbolo: veces en la cinta de 32, pago ×apuesta-de-línea por 3 iguales (m3) y por 2 iguales desde la izquierda (m2)
  const SLOT_SYMS = [
    { g: '♣', c: 8, m3: 10, m2: 1 },
    { g: '♠', c: 7, m3: 15, m2: 1 },
    { g: '♥', c: 6, m3: 20, m2: 1 },
    { g: '♦', c: 5, m3: 40, m2: 2 },
    { g: '◆', c: 3, m3: 100, m2: 3 },
    { g: '★', c: 2, m3: 200, m2: 5 },
    { g: '7', c: 1, m3: 800, m2: 10 },
  ];
  const SLOT_LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  const SLOT_STRIP = (() => {
    const a = [];
    SLOT_SYMS.forEach((s, i) => { for (let k = 0; k < s.c; k++) a.push(i); });
    let x = 12345; // mezcla determinista (LCG) para que la cinta sea siempre la misma
    for (let i = a.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) & 0x7fffffff; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  })();
  function slotGridFromStops(stops) {
    const L = SLOT_STRIP.length;
    const grid = [[], [], []];
    stops.forEach((st, reel) => { for (let row = 0; row < 3; row++) grid[row][reel] = SLOT_STRIP[(st - 1 + row + L) % L]; });
    return grid;
  }
  function slotEval(grid) {
    const wins = []; let mult = 0;
    SLOT_LINES.forEach((ln, li) => {
      const s = ln.map((row, reel) => grid[row][reel]);
      let m = 0, count = 0;
      if (s[0] === s[1] && s[1] === s[2]) { m = SLOT_SYMS[s[0]].m3; count = 3; }
      else if (s[0] === s[1]) { m = SLOT_SYMS[s[0]].m2; count = 2; }
      if (m) { wins.push({ line: li, count, sym: s[0], m }); mult += m; }
    });
    return { wins, lineMult: mult }; // pago = apuesta/5 × lineMult
  }
  function slotRTP() {
    const L = SLOT_STRIP.length; let tot = 0;
    for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) tot += slotEval(slotGridFromStops([a, b, c])).lineMult / 5;
    return tot / (L * L * L);
  }

  /* ---------- Blackjack ---------- */
  const cardRank = (c) => c % 13; // 0=A, 1..9 = 2..10, 10=J, 11=Q, 12=K
  const cardSuit = (c) => Math.floor(c / 13);
  function handValue(cards) {
    let t = 0, aces = 0;
    for (const c of cards) { const r = cardRank(c); if (r === 0) { aces++; t += 11; } else t += Math.min(r + 1, 10); }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { total: t, soft: aces > 0 };
  }
  const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
  const newDeck = (s) => shuffle(Array.from({ length: 52 }, (_, i) => i), s);
  function bjSettle(player, dealer) { // multiplicador de retorno sobre la apuesta
    const p = handValue(player).total, d = handValue(dealer).total;
    if (p > 21) return 0;
    if (isBlackjack(player)) return isBlackjack(dealer) ? 1 : 2.5;
    if (isBlackjack(dealer)) return 0;
    if (d > 21 || p > d) return 2;
    return p === d ? 1 : 0;
  }

  const api = {
    sha256, hmac, hex, sha256hex, enc, stream, shuffle, floor2,
    diceRoll, diceChance, diceMultiplier, diceWin,
    crashPoint, crashMultAt, crashTimeFor, CRASH_RATE,
    comb, minesMultiplier, minesPositions,
    REDS, WHEEL, rouletteSpin, rouletteColor, betWins, rouletteReturn, ROULETTE_RETURN,
    SLOT_SYMS, SLOT_LINES, SLOT_STRIP, slotGridFromStops, slotEval, slotRTP,
    cardRank, cardSuit, handValue, isBlackjack, newDeck, bjSettle,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SLMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
