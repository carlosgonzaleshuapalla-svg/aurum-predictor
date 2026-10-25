/* Aurum · banderas de los países de cada liga (archivos propios en flags/, sin pedir nada a terceros al visitar la web).
   Regiones (Sudamérica, Norteamérica, mundo) usan un emoji de globo; UEFA/Europa usa la bandera de la UE. */
(function (root) {
  'use strict';
  const HAVE = new Set('ad ae al am ao ar at au aw az ba bb be bf bg bh bi bj bm bo br bs bt bw by bz ca cd cg ch ci cl cm cn co cr cu cv cy cz de dj dk do dz ec ee eg es eu fi fj fr ga gb gb-eng gb-sct gb-wls ge gh gm gn gr gt gw gy hk hn hr ht hu id ie il in iq ir is it jm jo jp ke kg kh kr kw kz la lb lc li lk lr lt lu lv ma mc md me mg mk mm mn mt mu mw mx my na ng ni nl no np nz pa pe pg ph pk pl pr pt py qa ro rs ru rw sa sd se sg si sk sn sr sv sy th tj tm tn to tr tt tw tz ua ug us uy uz ve vn ws ye za zm zw'.split(' '));
  const REGION = { SA: ['🌎', 'Sudamérica'], NA: ['🌎', 'Norteamérica'], WW: ['🌍', 'Mundial'] };
  // códigos de país que usa ESPN en tenis y MMA (tipo COI: ger, sui, ned…) -> archivo de flags/
  const IOC = {};
  'alb:al alg:dz and:ad ang:ao arg:ar arm:am aru:aw aus:au aut:at aze:az bah:bs bar:bb bdi:bi bel:be ben:bj ber:bm bhu:bt bih:ba blr:by blz:bz bol:bo bot:bw bra:br brn:bh bul:bg bur:bf cam:kh can:ca cgo:cg chi:cl chn:cn civ:ci cmr:cm col:co cpv:cv crc:cr cro:hr cub:cu cyp:cy cze:cz den:dk dji:dj dom:do drc:cd ecu:ec egy:eg eng:gb-eng esa:sv esp:es est:ee fij:fj fin:fi fra:fr gab:ga gam:gm gbr:gb gbs:gw geo:ge ger:de gha:gh gre:gr gua:gt gui:gn guy:gy hai:ht hkg:hk hon:hn hun:hu ina:id ind:in iri:ir irl:ie irq:iq isl:is isr:il ita:it jam:jm jor:jo jpn:jp kaz:kz ken:ke kgz:kg kor:kr ksa:sa kuw:kw lao:la lat:lv lbr:lr lca:lc lib:lb lie:li ltu:lt lux:lu mad:mg mar:ma mas:my maw:mw mda:md mex:mx mgl:mn mkd:mk mlt:mt mne:me mon:mc mri:mu mtg:me mya:mm nam:na nca:ni ned:nl nep:np ngr:ng nor:no nzl:nz pak:pk pan:pa par:py per:pe phi:ph png:pg pol:pl por:pt pur:pr qat:qa rom:ro rsa:za rus:ru rwa:rw sam:ws sct:gb-sct sen:sn ser:rs sin:sg sko:kr slo:si sri:lk sud:sd sui:ch sur:sr svk:sk swe:se syr:sy tan:tz tga:to tha:th tjk:tj tkm:tm tpo:tw tri:tt tun:tn tur:tr uae:ae uga:ug ukr:ua uru:uy usa:us uzb:uz ven:ve vie:vn wal:gb-wls yem:ye zam:zm zim:zw'.split(' ').forEach((kv) => { const i = kv.indexOf(':'); IOC[kv.slice(0, i)] = kv.slice(i + 1); });
  const GB = { eng: 'gb-eng', sco: 'gb-sct' };
  const NAME = { pe: 'Perú', ar: 'Argentina', br: 'Brasil', co: 'Colombia', cl: 'Chile', uy: 'Uruguay', ec: 'Ecuador', py: 'Paraguay', bo: 'Bolivia', ve: 'Venezuela', mx: 'México', us: 'Estados Unidos', es: 'España', de: 'Alemania', it: 'Italia', fr: 'Francia', nl: 'Países Bajos', pt: 'Portugal', tr: 'Turquía', be: 'Bélgica', jp: 'Japón', cn: 'China', au: 'Australia', gr: 'Grecia', dk: 'Dinamarca', se: 'Suecia', no: 'Noruega', at: 'Austria', ch: 'Suiza', ru: 'Rusia', ro: 'Rumania', il: 'Israel', in: 'India', za: 'Sudáfrica', cr: 'Costa Rica', gt: 'Guatemala', hn: 'Honduras', eu: 'Europa', 'gb-eng': 'Inglaterra', 'gb-sct': 'Escocia' };

  // lg = { id, country }  ->  { code, label } | { emoji, label } | null
  function flagFor(lg) {
    if (!lg) return null;
    const c = String(lg.country || '');
    if (c === 'GB') { const k = String(lg.id || '').split('/')[1] || ''; const code = GB[k.split('.')[0]]; return code ? { code, label: NAME[code] } : null; }
    if (c === 'EU') return { code: 'eu', label: NAME.eu };
    if (REGION[c]) return { emoji: REGION[c][0], label: REGION[c][1] };
    const code = c.toLowerCase();
    return /^[A-Z]{2}$/.test(c) && HAVE.has(code) ? { code, label: NAME[code] } : null;
  }

  // deportistas (tenis, MMA): código ESPN de 3 letras -> { code } | null
  function athleteFlag(code) {
    const f = IOC[String(code || '').toLowerCase()];
    return f && HAVE.has(f) ? { code: f, label: '' } : null;
  }
  function athleteFlagHtml(code, prefix, esc) {
    const f = athleteFlag(code);
    return f ? '<img class="flag ath" src="' + esc((prefix || '') + 'flags/' + f.code + '.svg') + '" alt="" width="20" height="20" loading="lazy"> ' : '';
  }

  // prefijo = ruta hasta la carpeta flags/ desde la página que lo usa ('' en la portada, '../../' en ligas/<liga>/)
  function flagHtml(lg, prefix, esc) {
    const f = flagFor(lg);
    if (!f) return '';
    return f.code ? '<img class="flag" src="' + esc((prefix || '') + 'flags/' + f.code + '.svg') + '" alt="" width="16" height="16" loading="lazy" title="' + esc(f.label) + '"> '
      : '<span class="flag-emoji" title="' + esc(f.label) + '">' + f.emoji + '</span> ';
  }

  const api = { flagFor, flagHtml, athleteFlag, athleteFlagHtml, IOC, HAVE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AurumFlags = api;
})(typeof window !== 'undefined' ? window : globalThis);
