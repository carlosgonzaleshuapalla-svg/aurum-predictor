/* Aurum · núcleo: estado, billetera, semillas justas, utilidades de UI. Depende de SLMath. */
(function () {
  'use strict';
  const M = window.SLMath;
  const KEY = 'aurum.v1';
  const MIN_BET = 0.1, MAX_BET = 5000;

  const randHex = (n) => {
    const a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)));
    return M.hex(a);
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fresh = () => ({
    user: null, balance: 0, history: [], ageOk: false,
    stats: { wagered: 0, bets: 0, wins: 0 },
    fair: { server: randHex(32), client: randHex(5), nonce: 0, past: [] },
    limits: { dailyLoss: 0, sessionMin: 0, excludedUntil: 0, pending: null }, open: [],
    daily: { day: today(), net: 0 },
  });

  let state = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(fresh(), JSON.parse(raw));
  } catch (e) { /* sin almacenamiento: la app sigue en memoria */ }
  if (state.daily.day !== today()) state.daily = { day: today(), net: 0 };
  const applyPending = () => { const p = state.limits.pending; if (p && p.at <= Date.now()) { state.limits.dailyLoss = p.dailyLoss; state.limits.pending = null; } };
  applyPending();
  // rondas que quedaron abiertas (recarga/cierre): se registran como perdidas, no se reembolsan
  (state.open || []).forEach((r) => { state.history.unshift({ id: r.id, t: Date.now(), game: r.game, bet: r.amount, payout: 0, mult: 0, nonce: r.nonce, client: r.client, hash: r.hash, meta: 'ronda interrumpida' }); state.stats.wagered = Math.round((state.stats.wagered + r.amount) * 100) / 100; state.stats.bets++; state.daily.net = Math.round((state.daily.net - r.amount) * 100) / 100; });
  state.open = []; state.history.length = Math.min(state.history.length, 200);

  const listeners = {};
  const on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn), fn);
  const off = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };
  const pageSubs = [];
  const onPage = (ev, fn) => { on(ev, fn); pageSubs.push([ev, fn]); return fn; }; // se desuscribe al cambiar de página
  const clearPage = () => { pageSubs.splice(0).forEach(([ev, fn]) => off(ev, fn)); };
  const emit = (ev, d) => (listeners[ev] || []).forEach((f) => f(d));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ } };

  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { Object.assign(state, JSON.parse(e.newValue)); emit('balance', state.balance); emit('auth'); } catch (err) { /* ignorar */ }
  });
  /* ---------- formato ---------- */
  const fmt = (n) => 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = (n) => Math.round(n * 100) / 100;

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const e = tag === 'svg' ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'class') e.setAttribute('class', v);
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  }
  const $ = (s, r) => (r || document).querySelector(s);

  function toast(msg, kind) {
    let box = $('#toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.append(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  function modal(title, content, opts) {
    opts = opts || {};
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); opts.onClose && opts.onClose(); };
    const esc = (e) => { if (e.key === 'Escape' && !opts.locked) close(); };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', { class: 'serif' }, title), opts.locked ? null : h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, content));
    const back = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === back && !opts.locked) close(); } }, box);
    document.body.append(back);
    document.addEventListener('keydown', esc);
    return { close, el: box };
  }

  const open = new Map(); let seq = 0;
  /* ---------- semillas justas ---------- */
  const fair = {
    info: () => ({ serverHash: M.sha256hex(state.fair.server), client: state.fair.client, nonce: state.fair.nonce, past: state.fair.past }),
    stream() { const s = M.stream(state.fair.server, state.fair.client, state.fair.nonce); state.fair.nonce++; save(); return s; },
    lastNonce: () => state.fair.nonce - 1,
    setClient(c) {
      if (open.size) { toast('Termina las rondas abiertas antes de cambiar la semilla', 'warn'); return false; }
      c = String(c).trim().slice(0, 40); if (c) { state.fair.client = c; save(); emit('fair'); } return true; // el nonce nunca se reinicia: no se repiten tiradas
    },
    rotate() {
      if (open.size) { toast('Termina las rondas abiertas antes de rotar la semilla', 'warn'); return false; }
      const old = state.fair;
      state.fair = { server: randHex(32), client: old.client, nonce: 0, past: [{ server: old.server, hash: M.sha256hex(old.server), client: old.client, bets: old.nonce }].concat(old.past).slice(0, 10) };
      save(); emit('fair'); return true;
    },
  };

  /* ---------- apuestas / billetera ---------- */
  const wallet = {
    get: () => state.balance,
    user: () => state.user,
    isExcluded: () => state.limits.excludedUntil > Date.now(),
    credit(n) { state.balance = round2(state.balance + n); save(); emit('balance', state.balance); },
    debit(n) { state.balance = round2(state.balance - n); save(); emit('balance', state.balance); },
  };

  function guard(amount, total) {
    applyPending();
    if (state.daily.day !== today()) state.daily = { day: today(), net: 0 };
    if (!state.user) { toast('Inicia sesión para jugar', 'warn'); emit('needAuth'); return false; }
    if (wallet.isExcluded()) { toast('Cuenta en autoexclusión hasta ' + new Date(state.limits.excludedUntil).toLocaleString('es-PE'), 'bad'); return false; }
    if (!(amount >= MIN_BET)) { toast('Apuesta mínima ' + fmt(MIN_BET), 'warn'); return false; }
    if (total > MAX_BET) { toast('Apuesta máxima ' + fmt(MAX_BET), 'warn'); return false; }
    if (amount > state.balance) { toast('Saldo insuficiente', 'warn'); emit('needFunds'); return false; }
    const lim = state.limits.dailyLoss;
    if (lim > 0 && state.daily.net - amount < -lim) { toast('Superarías tu límite de pérdida diaria (' + fmt(lim) + ')', 'bad'); return false; }
    return true;
  }
  const bet = {
    MIN: MIN_BET, MAX: MAX_BET, openCount: () => open.size,
    start(game, amount) {
      amount = round2(Number(amount));
      if (!guard(amount, amount)) return null;
      wallet.debit(amount);
      const ref = { id: ++seq, game, amount, nonce: state.fair.nonce, client: state.fair.client, hash: M.sha256hex(state.fair.server), t: Date.now() };
      open.set(ref.id, ref); state.open = Array.from(open.values()); save();
      return ref;
    },
    add(ref, extra) { // apuesta adicional (doblar)
      extra = round2(extra);
      if (!guard(extra, round2(ref.amount + extra))) return false;
      wallet.debit(extra); ref.amount = round2(ref.amount + extra); state.open = Array.from(open.values()); save(); return true;
    },
    end(ref, payout, meta) {
      if (!open.has(ref.id)) return;
      open.delete(ref.id); state.open = Array.from(open.values());
      payout = round2(payout);
      if (payout > 0) wallet.credit(payout);
      state.stats.wagered = round2(state.stats.wagered + ref.amount);
      state.stats.bets++;
      if (payout > ref.amount) state.stats.wins++;
      state.daily.net = round2(state.daily.net + payout - ref.amount);
      const rec = { id: ref.id, t: Date.now(), game: ref.game, bet: ref.amount, payout, mult: ref.amount ? round2(payout / ref.amount) : 0, nonce: ref.nonce, client: ref.client, hash: ref.hash, meta: meta || '' };
      state.history.unshift(rec);
      state.history.length = Math.min(state.history.length, 200);
      save(); emit('history', rec);
      if (payout >= ref.amount * 10 && payout > 0) toast('¡Gran premio! ' + fmt(payout) + ' (×' + rec.mult + ')', 'win');
      return rec;
    },
  };

  /* ---------- sesión ---------- */
  const session = {
    register(name, email) {
      state.user = { name, email, since: Date.now() };
      if (state.balance === 0 && state.stats.bets === 0) state.balance = 1000; // saldo ficticio de bienvenida
      save(); emit('balance', state.balance); emit('auth');
    },
    login(name, email) { state.user = { name: name || 'Jugador', email, since: Date.now() }; save(); emit('auth'); emit('balance', state.balance); },
    logout() { if (open.size) { toast('Termina la ronda en curso antes de cerrar sesión', 'warn'); return false; } state.user = null; save(); emit('auth'); },
    deposit(n) { wallet.credit(n); },
    ageOk: () => state.ageOk,
    setAgeOk() { state.ageOk = true; save(); },
    setLimits(l) {
      const L = state.limits; l = Object.assign({}, l);
      if ('excludedUntil' in l) { l.excludedUntil = Math.max(L.excludedUntil, l.excludedUntil); } // la autoexclusión nunca se acorta
      if ('dailyLoss' in l) {
        const loosen = L.dailyLoss > 0 && (l.dailyLoss === 0 || l.dailyLoss > L.dailyLoss);
        if (loosen) { L.pending = { dailyLoss: l.dailyLoss, at: Date.now() + 864e5 }; toast('Aflojar el límite rige en 24 h', 'warn'); delete l.dailyLoss; }
        else L.pending = null;
      }
      Object.assign(L, l); save(); emit('limits');
    },
    limits: () => state.limits,
    dailyNet: () => state.daily.net,
    stats: () => state.stats,
    history: () => state.history,
    reset() { const keep = state.limits.excludedUntil > Date.now() ? state.limits : null; try { localStorage.removeItem(KEY); } catch (e) { /* ignorar */ } state = fresh(); if (keep) { state.limits = keep; save(); } emit('auth'); emit('balance', 0); emit('history'); },
  };

  /* ---------- VIP ---------- */
  const VIP = [
    { name: 'Bronce', min: 0, rake: 0, bonus: 'Acceso al lobby' },
    { name: 'Plata', min: 5000, rake: 3, bonus: 'Rakeback 3 %' },
    { name: 'Oro', min: 25000, rake: 5, bonus: 'Rakeback 5 % + bono mensual' },
    { name: 'Platino', min: 100000, rake: 7, bonus: 'Rakeback 7 % + gestor personal' },
    { name: 'Diamante', min: 500000, rake: 10, bonus: 'Rakeback 10 % + eventos privados' },
  ];
  const vipLevel = () => { let l = 0; VIP.forEach((v, i) => { if (state.stats.wagered >= v.min) l = i; }); return l; };

  /* ---------- UI reutilizable ---------- */
  const ui = {
    betInput(initial) {
      const input = h('input', { type: 'number', min: MIN_BET, max: MAX_BET, step: '0.10', value: initial || 10, inputmode: 'decimal', 'aria-label': 'Monto de apuesta' });
      const clamp = () => { let v = parseFloat(input.value); if (!(v >= 0)) v = 0; input.value = round2(Math.min(v, MAX_BET)); };
      input.addEventListener('blur', clamp);
      const half = h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = round2(Math.max(MIN_BET, (parseFloat(input.value) || 0) / 2)); input.dispatchEvent(new Event('input')); } }, '½');
      const dbl = h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = round2(Math.min(MAX_BET, (parseFloat(input.value) || 0) * 2)); input.dispatchEvent(new Event('input')); } }, '2×');
      const max = h('button', { type: 'button', class: 'chip-btn', onclick: () => { input.value = round2(Math.min(MAX_BET, wallet.get())); input.dispatchEvent(new Event('input')); } }, 'Máx');
      const el = h('div', { class: 'field' }, h('label', {}, 'Monto de apuesta'), h('div', { class: 'bet-input' }, h('span', { class: 'cur' }, 'S/'), input, half, dbl, max));
      return { el, input, get: () => { clamp(); return parseFloat(input.value) || 0; }, set: (v) => (input.value = round2(v)), disable(b) { input.disabled = b; el.querySelectorAll('button').forEach((x) => (x.disabled = b)); } };
    },
    field(label, control, hint) { return h('div', { class: 'field' }, h('label', {}, label), control, hint ? h('small', { class: 'hint' }, hint) : null); },
    historyTable(gameId, limit) {
      const wrap = h('div', { class: 'table-wrap' });
      const draw = () => {
        const rows = state.history.filter((r) => !gameId || r.game === gameId).slice(0, limit || 10);
        wrap.innerHTML = '';
        if (!rows.length) { wrap.append(h('p', { class: 'muted pad' }, 'Aún no hay apuestas. Tus jugadas aparecerán aquí.')); return; }
        const names = (window.SL && SL.games) || {};
        wrap.append(h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Juego', 'Hora', 'Apuesta', 'Mult.', 'Pago', 'Nonce'].map((c, i) => h('th', { class: i > 1 ? 'r' : '' }, c)))),
          h('tbody', {}, rows.map((r) => h('tr', {},
            h('td', {}, (names[r.game] && names[r.game].name) || r.game, r.meta ? h('small', { class: 'muted' }, ' · ' + r.meta) : null),
            h('td', { class: 'muted' }, new Date(r.t).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })),
            h('td', { class: 'r' }, fmt(r.bet)),
            h('td', { class: 'r' }, '×' + r.mult.toFixed(2)),
            h('td', { class: 'r ' + (r.payout > r.bet ? 'pos' : r.payout < r.bet ? 'neg' : '') }, fmt(r.payout)),
            h('td', { class: 'r muted' }, String(r.nonce)))))));
      };
      draw(); onPage('history', draw);
      return wrap;
    },
  };

  window.SL = { M, state: () => state, on, off, onPage, clearPage, emit, save, fmt, h, $, toast, modal, fair, wallet, bet, session, VIP, vipLevel, ui, games: {}, round2, MIN_BET, MAX_BET };
})();
