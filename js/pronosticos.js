/* Aurum · Pronósticos multi-deporte (UI). Se enlaza desde predictor.js con AurumPick.create(ctx). */
(function (root) {
  'use strict';
  const SPORT_NAME = { soccer: 'Fútbol', basketball: 'Baloncesto', baseball: 'Béisbol', football: 'Fútbol americano', hockey: 'Hockey', mma: 'MMA / UFC', tennis: 'Tenis', rugby: 'Rugby', volleyball: 'Vóley', cricket: 'Críquet' };
  const SPORT_ORDER = ['soccer', 'basketball', 'baseball', 'football', 'hockey', 'mma', 'tennis'];
  const CONF = { alta: 'Favorito claro', media: 'Ventaja moderada', baja: 'Pareja / poco fiable' };

  // multi.js viene empaquetado (tablas de ligas/equipos + listas); se expande aquí a objetos
  function unpackMulti(P) {
    const lgs = P.leagues.map((l) => l.id), T = P.teams;
    return { generated: P.generated, source: P.source, leagues: P.leagues, events: P.events,
      results: P.results.map((r) => { const o = { lg: lgs[r[0]], d: r[1], h: T[r[2]], a: T[r[3]], hs: r[4] < 0 ? null : r[4], as: r[5] < 0 ? null : r[5], w: r[6], neutral: !!(r[7] & 1) }; if (r[7] & 2) o.ot = true; if (r[7] & 4) o.pre = true; return o; }) };
  }
  if (root.AURUM_MULTI_PACKED && !root.AURUM_MULTI) root.AURUM_MULTI = unpackMulti(root.AURUM_MULTI_PACKED);

  root.AurumPick = {
    create(ctx) {
      const { h, X, Mo, S, od, pct, money, limaStr, saveUI } = ctx;
      const peruStatus = ctx.peruStatus || (() => null);
      const M = root.AURUM_MULTI, BTM = root.AURUM_BT_MULTI || {};
      if (!M || !M.events) return null;
      const hasRefOdds = (M.events || []).some((e) => e.odds);
      const lgById = {}; (M.leagues || []).forEach((l) => (lgById[l.id] = l));
      const spName = (s) => SPORT_NAME[s] || (M.leagues.find((l) => l.sport === s) || {}).sportName || s;
      const isPeru = (lg) => lg === 'soccer/per.1' || (lgById[lg] && lgById[lg].country === 'PE');
      let sctx = null, evs = [], fc = {}, memoKey = null;

      function prepare() {
        const key = (M.generated || '') + '|' + S.wModel + '|' + JSON.stringify(ctx.manual());
        if (memoKey === key && evs.length) { evs = evs.filter((e) => e.t > Date.now()); return; } // sin recalcular al navegar
        memoKey = key;
        const asOf = (M.generated || new Date().toISOString()).slice(0, 10);
        if (!sctx) sctx = X.buildContext(M, asOf, { globalCross: !!BTM._global && BTM._global.cross, globalAll: !!BTM._global && BTM._global.all });
        const now = Date.now();
        evs = M.events.filter((e) => e.status === 'pre' && lgById[e.lg]).map((e) => Object.assign({}, e, { t: Date.parse(e.ko) })).filter((e) => e.t > now).sort((a, b) => a.t - b.t); // los partidos en juego se excluyen: sus cuotas en vivo no sirven para pronosticar
        compute();
      }
      // todas las casas de un evento: ESPN (DraftKings) + football-data (hasta 9 casas) + las que añadió el usuario (✎)
      const sameMarket = (e, books) => X.filterBooksByMarket(books, lgById[e.lg].draw); // no mezclar 3 resultados con 2
      const allBooks = (e) => Object.assign({}, sameMarket(e, Object.assign({}, e.odds || {}, ctx.oapiBooks ? ctx.oapiBooks(e) || {} : {}, ctx.fdBooks(e) || {})), manualBooks(e) || {});
      function manualBooks(e) {
        const man = ctx.manual()[e.id]; if (!man) return null;
        const r = {}; for (const b in man) if (man[b]['1x2']) r[b + ' ✎'] = { ml: man[b]['1x2'] }; return r;
      }
      function compute() {
        fc = {}; evs.forEach((e) => { fc[e.id] = X.forecast(sctx, e, { wModel: S.wModel / 100, extraBooks: Object.assign({}, sameMarket(e, Object.assign({}, ctx.oapiBooks ? ctx.oapiBooks(e) || {} : {}, ctx.fdBooks(e) || {})), manualBooks(e) || {}), temp: BTM._temp }); });
      }
      const spOf = (e) => lgById[e.lg].sport;
      // escudos: ESPN los sirve por ruta corta (e.hl / e.al); si no cargan o la ruta no es válida, se omiten sin romper nada
      const CREST_RE = /^[a-z0-9_-]{2,30}(\/[a-z0-9_-]{1,30}){0,2}\/[A-Za-z0-9_-]{1,40}\.png$/;
      const crest = (path) => {
        if (!path || !CREST_RE.test(path)) return null;
        const i = document.createElement('img');
        i.className = 'crest'; i.alt = ''; i.width = 22; i.height = 22; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
        i.onerror = () => i.remove();
        i.src = 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + path + '&w=48&h=48';
        return i;
      };
      const teamsLine = (e) => [crest(e.hl), e.h, ' – ', crest(e.al), e.a];
      const startsIn = (e) => (e.t - Date.now()) / 3600e3;

      /* ---------- tarjeta ---------- */
      function card(e) {
        const f = fc[e.id], lg = lgById[e.lg], live = e.status === 'in' || e.t < Date.now();
        const head = h('div', {}, h('div', { class: 'teams' }, ...teamsLine(e)), h('div', { class: 'meta' }, (isPeru(e.lg) ? '🇵🇪 ' : '') + lg.name + ' · ' + (live ? 'EN JUEGO / empezado' : limaStr(e) + ' (Lima)')));
        const openKey = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); detail(e); } };
        if (!f) return h('div', { class: 'evcard', role: 'button', tabindex: '0', onkeydown: openKey, onclick: () => detail(e) }, head, h('div', { class: 'muted', style: 'font-size:13px' }, 'Sin pronóstico: no hay cuotas ni histórico suficiente'));
        const pk = f.pick, bt = BTM[e.lg], cls = pk.conf === 'alta' ? 'val' : pk.conf === 'baja' ? 'warn' : '';
        const bars = f.labels.map((l, i) => h('div', { style: 'flex:1;min-width:90px' }, h('div', { class: 'kv' }, h('span', {}, l.length > 18 ? l.slice(0, 17) + '…' : l), h('b', {}, pct(f.p[i], 0))), h('div', { class: 'pbar' }, h('i', { style: 'width:' + (f.p[i] * 100).toFixed(1) + '%;background:' + (i === pk.i ? 'var(--copper)' : 'var(--steel)') }))));
        return h('div', { class: 'evcard pick', role: 'button', tabindex: '0', 'aria-label': e.h + ' contra ' + e.a + ': ' + pk.label + ' ' + pct(pk.p, 0), onkeydown: openKey, onclick: () => detail(e) }, head,
          h('div', { style: 'text-align:right' }, h('div', { class: 'pickline' }, pk.label), h('div', {}, h('span', { class: 'badge ' + cls }, CONF[pk.conf]), ' ', h('b', {}, pct(pk.p, 0)), pk.fairOdds < 1.2 ? h('div', {}, h('span', { class: 'badge warn' }, 'cuota muy baja: casi no compensa')) : null)),
          h('div', { style: 'grid-column:1/-1' }, h('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' }, bars),
            h('div', { class: 'meta', style: 'margin-top:8px' },
              'Cuota justa ' + od(pk.fairOdds) + ' (una casa debe pagar más que esto)' + (pk.best ? ' · tu cuota ' + od(pk.best.odds) + ' (' + pk.best.book + ') → EV ' + (pk.ev > 0 ? '+' : '') + (pk.ev * 100).toFixed(0) + ' % (estimación)' : ' · añade la cuota de tu casa para ver el valor') +
              (pk.ref ? ' · referencia ' + pk.ref.book + ' ' + od(pk.ref.odds) + ' (no apostable en Perú)' : '') + ' · base: ' + f.source + (f.info.reliable === false ? ' · pocos datos del equipo' : '') + (f.info.cross ? ' · equipos de ligas distintas: fiabilidad limitada' : '') + (e.pre ? ' · pretemporada' : '') +
              (f.source === 'mercado' ? ' · pick del mercado de referencia (sin backtest propio)' : bt && bt.n >= 30 ? ' · acierto histórico del modelo en esta liga ' + pct(bt.acc, 0) + ' (n=' + bt.n + ')' : ' · sin backtest suficiente en esta liga'))));
      }

      /* ---------- cuotas por casa frente a la cuota justa del pronóstico ---------- */
      const isEx = (b) => X.isExchange(b); // bolsas: no cuentan como «mejor cuota»
      const okPeru = (b) => { const st = peruStatus(b); return !!st && (st.mine || (st.brand && !st.suspendida)); };
      function badge(b) {
        const st = peruStatus(b);
        if (st && st.mine) return h('span', { class: 'badge val', style: 'margin-left:6px' }, 'tu casa');
        if (st && st.suspendida) return h('span', { class: 'badge warn', style: 'margin-left:6px', title: 'Según la lista de terceros, con licencia suspendida temporalmente' }, 'licencia suspendida');
        if (st) return h('span', { class: 'badge val', style: 'margin-left:6px', title: st.empresa + ' · según lista de terceros; verifica en el registro oficial del MINCETUR' }, 'autorizada en Perú*');
        return h('span', { class: 'badge', style: 'margin-left:6px' }, isEx(b) ? 'bolsa · referencia' : 'referencia · no autorizada');
      }
      function oddsComparison(e, ff, redraw) {
        const all = allBooks(e), allNames = Object.keys(all).filter((b) => all[b] && all[b].ml);
        const names = S.onlyPeru === false ? allNames : allNames.filter(okPeru);
        const wrap = h('div', { class: 'stack' });
        const nHidden = allNames.length - names.length;
        const tog = h('label', { class: 'check', style: 'align-items:center' }, h('input', { type: 'checkbox', checked: S.onlyPeru !== false ? true : null, onchange: (ev) => { S.onlyPeru = ev.target.checked; saveUI(); redraw(); } }), h('span', {}, 'Mostrar solo casas autorizadas en Perú' + (S.onlyPeru !== false && nHidden ? ' (se ocultan ' + nHidden + ' de referencia)' : '')));
        const outs = ff.draw ? [0, 1, 2] : [0, 2], short = (t) => (t.length > 16 ? t.slice(0, 15) + '…' : t);
        const head = ff.draw ? [short(e.h), 'Empate', short(e.a)] : [short(e.h), short(e.a)];
        const order = names.slice().sort((a, b) => (b.includes('✎') - a.includes('✎')) || a.localeCompare(b));
        const cand = names.filter((b) => !isEx(b));
        const bestIdx = outs.map((k) => cand.reduce((m, b) => ((all[b].ml[k] || 0) > (m ? all[m].ml[k] : 0) ? b : m), null));
        const pk = ff.pick, pkCol = pk.i, bk = bestIdx[pkCol], bo = bk ? all[bk].ml[outs[pkCol]] : null;
        const scope = S.onlyPeru !== false ? 'entre las casas autorizadas en Perú' : 'entre todas las casas';
        if (bo) { const diff = bo / pk.fairOdds - 1, ev = pk.p * bo - 1; wrap.append(h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Tu pick contra el mercado'),
          h('p', { style: 'margin-top:8px' }, h('b', {}, pk.label), ' · cuota justa ', h('b', {}, od(pk.fairOdds)), '. La mejor cuota ' + scope + ' es ', h('b', {}, od(bo)), ' en ', h('b', {}, bk), ' (' + (diff >= 0 ? '+' : '') + (diff * 100).toFixed(1) + ' % frente a la justa → EV ' + (ev > 0 ? '+' : '') + (ev * 100).toFixed(1) + ' %). ',
            ev > 0.02 ? 'Paga más que la cuota justa.' : ev > -0.02 ? 'Está en la cuota justa: ni ventaja ni desventaja.' : 'Paga MENOS que la cuota justa: no compensa.', okPeru(bk) ? '' : ' Esa casa es solo de referencia.'),
          h('p', { class: 'hint' }, 'El EV es una estimación: supone que la probabilidad del pronóstico es correcta, y elegir la mejor cuota entre varias tiende a exagerarlo.'))); }
        wrap.append(tog);
        if (!names.length) {
          wrap.append(h('div', { class: 'note' }, h('b', {}, 'Sin cuotas de casas autorizadas para este evento. '), nHidden ? 'Hay ' + nHidden + ' casa(s) de referencia (' + allNames.slice(0, 4).join(', ') + (allNames.length > 4 ? '…' : '') + '); desmarca la casilla para verlas. ' : '', (ctx.online ? 'Aún no hay cuotas abiertas de casas autorizadas para este evento. Añade la cuota de tu casa más abajo para compararla con la cuota justa.' : 'Para ver Betsson, Coolbet, 1xBet y otras: pega tu clave gratuita de The Odds API en «Actualizar datos», o añade la cuota de tu casa más abajo.')));
          return wrap;
        }
        const cell = (b, k, col) => { const o = all[b].ml[k]; if (!(o > 1)) return h('td', { class: 'r muted' }, '—'); const ev = ff.p[col] * o - 1; return h('td', { class: 'r' + (b === bestIdx[col] ? ' odds-best' : '') }, h('b', { class: ev > 0.02 ? 'ev-pos' : ev < -0.02 ? 'ev-neg' : '' }, od(o)), h('small', {}, (ev > 0 ? '+' : '') + (ev * 100).toFixed(0) + ' %')); };
        wrap.append(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Casa'), outs.map((k, i) => h('th', { class: 'r' }, head[i], h('small', {}, 'justa ' + od(1 / ff.p[i]) + ' · ' + pct(ff.p[i], 0)))), h('th', { class: 'r' }, 'Margen'))),
          h('tbody', {}, order.map((b) => { const ml = all[b].ml.filter((x) => x != null), mg = ml.every((x) => x > 1) ? Mo.overround(ml) : null;
            return h('tr', {}, h('td', {}, b.replace(' ✎', ''), badge(b)), outs.map((k, i) => cell(b, k, i)), h('td', { class: 'r muted' }, mg == null ? '—' : pct(mg))); }),
            h('tr', {}, h('td', {}, h('b', {}, 'Cuota justa del pronóstico')), outs.map((k, i) => h('td', { class: 'r' }, h('b', {}, od(1 / ff.p[i])))), h('td', {}))))));
        wrap.append(h('p', { class: 'hint' }, 'Verde = la casa paga más que la cuota justa (EV positivo); rojo = paga menos. En dorado, la mejor cuota de cada columna (las bolsas no cuentan: cobran comisión). *«Autorizada en Perú» sale de una lista de terceros (no del registro oficial): confirma el dominio en apuestasdeportivas.mincetur.gob.pe. La cuota de la versión internacional de una casa puede diferir de la de su sitio en Perú.'));
        const withOU = names.filter((b) => all[b].ou25 && all[b].ou25.every((x) => x > 1));
        if (withOU.length) {
          const fair = Mo.fairFromBooks(Object.fromEntries(withOU.map((b) => [b, { ou25: all[b].ou25 }])), 'ou25'), bu = [0, 1].map((i) => withOU.filter((b) => !isEx(b)).reduce((m, b) => (all[b].ou25[i] > (m ? all[m].ou25[i] : 0) ? b : m), null));
          wrap.append(h('div', { class: 'eyebrow dim', style: 'margin-top:8px' }, 'Total de goles (más / menos de 2.5)'), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Casa'), ['Más de 2.5', 'Menos de 2.5'].map((t, i) => h('th', { class: 'r' }, t, fair ? h('small', {}, 'justa ' + od(1 / fair.probs[i]) + ' · ' + pct(fair.probs[i], 0)) : null)), h('th', { class: 'r' }, 'Margen'))),
            h('tbody', {}, withOU.map((b) => h('tr', {}, h('td', {}, b, badge(b)), [0, 1].map((i) => h('td', { class: 'r' + (b === bu[i] ? ' odds-best' : '') }, od(all[b].ou25[i]))), h('td', { class: 'r muted' }, pct(Mo.overround(all[b].ou25)))))))),
            h('p', { class: 'hint' }, 'La probabilidad «justa» de los totales sale del mercado (sin margen); el modelo no se usa aquí porque no demostró mejorar al mercado.'));
        }
        return wrap;
      }

      /* ---------- detalle ---------- */
      function lastResults(lg, team) {
        return M.results.filter((r) => r.lg === lg && (r.h === team || r.a === team)).slice(-5).reverse();
      }
      function detail(e) {
        const f = fc[e.id], body = h('div', { class: 'stack' }), m = SL.modal(e.h + ' – ' + e.a, body); m.el.classList.add('wide');
        const draw = () => {
          body.replaceChildren(); const ff = fc[e.id];
          body.append(h('p', { class: 'muted', style: 'font-size:13px' }, lgById[e.lg].name + ' · ' + limaStr(e) + ' hora de Lima'));
          if (!ff) { body.append(h('div', { class: 'note' }, 'Sin pronóstico: no hay cuotas ni histórico suficiente de estos equipos en la fuente.')); }
          else {
            const pk = ff.pick;
            body.append(h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Pronóstico'), h('div', { class: 'pickline', style: 'font-size:28px;margin:6px 0' }, pk.label + ' · ' + pct(pk.p)),
              h('p', { class: 'muted', style: 'font-size:14px' }, 'Es el resultado más probable según ' + ff.source + ', no un resultado seguro: con una probabilidad así, el pick falla en promedio unas ' + Math.round((1 - pk.p) * 100) + ' de cada 100 veces. Cuota justa: ' + od(pk.fairOdds) + '. Si tu casa paga menos que eso, no compensa; si paga más, la ventaja es solo una estimación (y el pick más probable suele tener cuotas bajas).')));
            body.append(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Resultado', 'Final', 'Mercado', 'Modelo'].map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
              h('tbody', {}, ff.labels.map((l, i) => h('tr', {}, h('td', {}, l), h('td', { class: 'r' }, pct(ff.p[i])), h('td', { class: 'r' }, ff.market ? pct(ff.market[i]) : '—'), h('td', { class: 'r' }, ff.model ? pct(ff.model[i]) : '—')))))));
            if (ff.info.altDiff != null) body.append(h('p', { class: 'hint' }, 'Altitud: ' + e.h + ' juega a mayor altura que ' + e.a + ' (≈' + ff.info.altDiff.toFixed(1) + ' km de diferencia). El modelo lo tiene en cuenta: en la Liga 1 los equipos de altura marcan más y los visitantes de llanura rinden menos.'));
            if (ff.info.lh != null) body.append(h('p', { class: 'muted', style: 'font-size:13px' }, 'Goles esperados ' + e.h + ' ' + ff.info.lh.toFixed(2) + ' · ' + e.a + ' ' + ff.info.la.toFixed(2) + ' · Más de 2.5 goles ' + pct(ff.info.ou25[0], 0) + ' · Ambos marcan ' + pct(ff.info.btts[0], 0)));
            else if (ff.info.rH != null) body.append(h('p', { class: 'muted', style: 'font-size:13px' }, 'Elo ' + e.h + ' ' + Math.round(ff.info.rH) + ' (' + ff.info.nH + ' partidos) · ' + e.a + ' ' + Math.round(ff.info.rA) + ' (' + ff.info.nA + ' partidos)'));
            body.append(oddsComparison(e, ff, draw));
          }
          [e.h, e.a].forEach((t) => { const lr = lastResults(e.lg, t); if (lr.length) body.append(h('div', {}, h('div', { class: 'eyebrow dim' }, 'Últimos resultados · ' + t), h('div', { class: 'meta' }, lr.map((r) => { const won = (r.w === 'h' && r.h === t) || (r.w === 'a' && r.a === t), d = r.w === 'd'; return h('span', { class: 'badge ' + (won ? 'val' : d ? '' : 'warn'), style: 'margin:2px 4px 2px 0' }, (r.h === t ? 'vs ' + r.a : '@ ' + r.h) + (r.hs != null ? ' ' + r.hs + '-' + r.as : '') + (won ? ' G' : d ? ' E' : ' P')); })))); });
          // cuota manual de casa peruana
          const book = h('input', { class: 'inp', placeholder: 'Casa (ej. Inkabet)', 'aria-label': 'Nombre de la casa', maxlength: 24 }), dr = (ff ? ff.draw : lgById[e.lg].draw);
          const f1 = h('input', { class: 'inp', type: 'number', step: '0.01', placeholder: 'Local', 'aria-label': 'Cuota del local' }), fx = dr ? h('input', { class: 'inp', type: 'number', step: '0.01', placeholder: 'Empate', 'aria-label': 'Cuota del empate' }) : null, f2 = h('input', { class: 'inp', type: 'number', step: '0.01', placeholder: 'Visita', 'aria-label': 'Cuota de la visita' });
          body.append(h('div', { class: 'panel stack' }, h('h3', {}, 'Añadir la cuota de tu casa'), h('p', { class: 'hint' }, 'Copia la cuota que ves en tu casa autorizada (Inkabet, Betsson, Apuesta Total…). Se compara con la cuota justa del pronóstico.'),
            h('div', { class: 'formrow' }, book, f1, fx, f2), h('button', { class: 'btn btn-primary', onclick: () => {
              const a = parseFloat(f1.value), x = fx ? parseFloat(fx.value) : null, c = parseFloat(f2.value);
              const arr = fx ? [a, x, c] : [a, c], inv = arr.reduce((t, v) => t + 1 / v, 0) - 1;
              if (!book.value.trim() || !arr.every((v) => v > 1 && v < 100)) return SL.toast('Completa la casa y las cuotas (entre 1 y 100)', 'warn');
              if (inv < -0.005 || inv > 0.15) return SL.toast('Esas cuotas no son coherentes entre sí (margen ' + (inv * 100).toFixed(0) + ' %): revisa lo que copiaste', 'warn');
              ctx.setManual(e.id, book.value.trim(), [a, fx ? x : null, c]); compute(); draw(); render(); SL.toast('Cuota añadida');
            } }, 'Guardar cuota')));
        };
        draw();
      }

      /* ---------- página ---------- */
      let listBox = null, render = () => {};
      function page() {
        prepare();
        const root_ = h('div', { class: 'wrap pg' }), top = h('div', {}), list = h('div', {}); listBox = list;
        const sports = SPORT_ORDER.filter((s) => evs.some((e) => spOf(e) === s)).concat(Array.from(new Set(evs.map(spOf))).filter((s) => !SPORT_ORDER.includes(s)));
        render = () => {
          if (S.sport !== 'all' && !sports.includes(S.sport)) S.sport = 'all';
          top.replaceChildren(); list.replaceChildren();
          const inSport = (e) => S.sport === 'all' || spOf(e) === S.sport;
          const lgsOf = Array.from(new Set(evs.filter(inSport).map((e) => e.lg))).sort((a, b) => (isPeru(b) - isPeru(a)) || lgById[a].name.localeCompare(lgById[b].name));
          if (S.mlg !== 'all' && !lgsOf.includes(S.mlg)) S.mlg = 'all';
          const cnt = (s) => evs.filter((e) => s === 'all' || spOf(e) === s).length;
          // listas desplegables en lugar de una fila de botones por cada opción
          const dd = (label, opts, cur, pick) => { const sel = h('select', { class: 'inp', 'aria-label': label, onchange: (ev) => pick(ev.target.value) }, opts.map(([v, t]) => h('option', { value: v }, t))); sel.value = cur; return SL.ui.field(label, sel); };
          const sportOpts = [['all', 'Todos los deportes · ' + cnt('all')]].concat(sports.map((s) => [s, spName(s) + ' · ' + cnt(s)]));
          const lgOpts = [['all', 'Todas las ligas · ' + evs.filter(inSport).length]].concat(lgsOf.map((l) => [l, (isPeru(l) ? '🇵🇪 ' : '') + lgById[l].name + ' · ' + evs.filter((e) => e.lg === l).length]));
          const q = h('input', { class: 'search', type: 'search', placeholder: 'Buscar equipo o peleador', value: S.q || '', oninput: (ev) => { S.q = ev.target.value; list.replaceChildren(); fill(); } });
          top.append(h('div', { class: 'filters' },
            dd('Deporte', sportOpts, S.sport, (v) => { S.sport = v; S.mlg = 'all'; saveUI(); render(); }),
            dd('Liga', lgOpts, S.mlg, (v) => { S.mlg = v; saveUI(); render(); }),
            dd('Cuándo', [['today', 'Hoy'], ['48', '48 horas'], ['week', 'Semana']], S.when, (v) => { S.when = v; saveUI(); render(); }),
            dd('Orden', [['time', 'Por hora'], ['conf', 'Por probabilidad']], S.sort, (v) => { S.sort = v; saveUI(); render(); }),
            SL.ui.field('Buscar', q)));
          fill();
        };
        function filtered() {
          const lim = S.when === '48' ? 48 : 24 * 8, qq = (S.q || '').toLowerCase(), todayLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
          return evs.filter((e) => e.t > Date.now() && (S.sport === 'all' || spOf(e) === S.sport) && (S.mlg === 'all' || e.lg === S.mlg) && (S.when === 'today' ? new Date(e.t).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === todayLima : startsIn(e) <= lim) && (!qq || (e.h + ' ' + e.a).toLowerCase().includes(qq)));
        }
        function fill() {
          const list_ = filtered().filter((e) => fc[e.id] || true);
          const withF = list_.filter((e) => fc[e.id]);
          const sorted = (S.sort === 'conf' ? withF.slice().sort((a, b) => fc[b.id].pick.p - fc[a.id].pick.p).concat(list_.filter((e) => !fc[e.id])) : list_);
          list.replaceChildren();
          const best = withF.filter((e) => fc[e.id].pick.conf === 'alta' && fc[e.id].pick.fairOdds >= 1.2).sort((a, b) => fc[b.id].pick.p - fc[a.id].pick.p).slice(0, 5);
          if (best.length) list.append(h('div', { class: 'panel', style: 'margin:20px 0' }, h('div', { class: 'eyebrow' }, 'Favoritos más probables de esta selección (suelen pagar poco; cuota justa ≥ 1.20)'),
            h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', {}, best.map((e) => h('tr', { class: 'rowlink', tabindex: '0', onkeydown: (ev) => { if (ev.key === 'Enter') detail(e); }, onclick: () => detail(e) }, h('td', {}, ...teamsLine(e), h('small', {}, (isPeru(e.lg) ? '🇵🇪 ' : '') + lgById[e.lg].name + ' · ' + limaStr(e))), h('td', {}, h('b', {}, fc[e.id].pick.label)), h('td', { class: 'r' }, pct(fc[e.id].pick.p, 0)), h('td', { class: 'r muted' }, 'justa ' + od(fc[e.id].pick.fairOdds))))))),
            h('p', { class: 'hint' }, 'Un 80 % significa que unas 2 de cada 10 veces falla. Una “combinada” de varios pronósticos altos multiplica esos fallos: tres de 80 % aciertan juntos solo ~51 %.')));
          list.append(h('div', { class: 'sec-t' }, h('h2', {}, sorted.length + ' eventos'), h('span', { class: 'muted' }, 'Toca un evento para ver el detalle y añadir la cuota de tu casa')));
          if (!sorted.length) list.append(h('div', { class: 'note' }, 'No hay eventos con estos filtros. Prueba “Semana” o “Todos los deportes”. Los datos se actualizan al ejecutar tools/fetch_espn.py.'));
          const lim = S.limit || 100;
          sorted.slice(0, lim).forEach((e) => list.append(card(e)));
          if (sorted.length > lim) list.append(h('div', { style: 'text-align:center;margin:20px 0' }, h('p', { class: 'muted' }, 'Mostrando ' + lim + ' de ' + sorted.length), h('button', { class: 'btn btn-ghost', onclick: () => { S.limit = lim + 100; saveUI(); fill(); } }, 'Ver 100 más')));
        }
        root_.append(h('span', { class: 'eyebrow' }, 'Pronósticos'), h('h1', { class: 'serif' }, 'Pronósticos para ', h('em', {}, 'cada evento'), '.'),
          h('p', { class: 'lead' }, 'Elige deporte y liga. Para cada evento verás el resultado más probable, qué tan probable es y la cuota justa. “Más probable” no significa “seguro” ni “buena apuesta”: los favoritos pagan poco.'),
          h('div', { class: 'note mt' }, h('b', {}, 'Cómo leerlo. '), hasRefOdds ? 'Las cuotas de referencia son de DraftKings (EE. UU., vía la API pública no oficial de ESPN), que no figura como autorizada en Perú: sirven para estimar la probabilidad del mercado. Para la Liga 1 y otras ligas con pocas cuotas, el pronóstico sale del modelo. Añade la cuota de tu casa para saber si paga más que la cuota justa.' : 'En la mayoría de ligas y deportes el pronóstico sale del modelo estadístico (resultados pasados de cada equipo o competidor); mira abajo, en cada tarjeta, cuánto ha acertado el modelo en esa liga. En 10 ligas europeas de fútbol, además, se comparan las cuotas de varias casas. Añade la cuota de tu casa para saber si paga más que la cuota justa. Un modelo puede equivocarse: los mercados suelen predecir mejor.'), top, list);
        render(); return root_;
      }

      /* ---------- tabla de acierto por liga (para la pestaña Modelo) ---------- */
      function accuracyTable() {
        const rows = Object.keys(BTM).filter((k) => k !== '_temp' && k !== '_oos' && BTM[k].n >= 20).sort((a, b) => (isPeru(b) - isPeru(a)) || BTM[b].n - BTM[a].n);
        if (!rows.length) return h('p', { class: 'muted' }, 'Ejecuta node tools/backtest_multi.js para calcular los aciertos por liga.');
        return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Liga', 'Partidos', 'Acierta el pick', 'Referencia', 'Log-loss'].map((c, i) => h('th', { class: i ? 'r' : '' }, c)))),
          h('tbody', {}, rows.map((k) => { const b = BTM[k], l = lgById[k]; return h('tr', {}, h('td', {}, (isPeru(k) ? '🇵🇪 ' : '') + (l ? l.name : k), h('small', {}, spName(l ? l.sport : '')), ), h('td', { class: 'r' }, String(b.n)), h('td', { class: 'r' }, h('b', {}, pct(b.acc, 1))), h('td', { class: 'r muted' }, pct(b.baseAcc, 1)), h('td', { class: 'r muted' }, b.logloss.toFixed(3))); }))));
      }
      return { page, accuracyTable, hasData: () => true };
    },
  };
})(window);
