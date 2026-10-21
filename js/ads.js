/* Anuncios de Google AdSense, solo con consentimiento.
   Mientras CLIENT esté vacío esto no hace nada: no carga scripts de Google ni muestra aviso de cookies.
   Para activarlo, pega tu ID de editor (ca-pub-…) en CLIENT; tools/build_site.py lo copia también a ads.txt, al <meta> de
   verificación y a la política de seguridad (CSP). El ID de editor es público: no es una clave secreta. */
(function () {
  'use strict';
  var CLIENT = '';
  var KEY = 'aurum_cookies_v1';
  var VALID = /^ca-pub-\d{10,20}$/;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* sin almacenamiento: se vuelve a preguntar */ } }

  function loadAds() {
    if (document.getElementById('adsense-js')) return;
    var s = document.createElement('script');
    s.id = 'adsense-js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CLIENT);
    document.head.appendChild(s);
  }

  function closeBanner() {
    var b = document.getElementById('cookie-bar');
    if (b) b.remove();
  }

  function choose(v) {
    set(v);
    closeBanner();
    if (v === 'yes') loadAds();
  }

  function showBanner() {
    if (document.getElementById('cookie-bar')) return;
    var b = document.createElement('div');
    b.id = 'cookie-bar';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookies de publicidad');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('Esta web puede mostrar anuncios de Google AdSense, que usan cookies para personalizar la publicidad y medirla. Sin tu permiso no se carga nada de Google. '));
    var a = document.createElement('a');
    a.href = 'privacidad.html';
    a.textContent = 'Más información';
    p.appendChild(a);
    var row = document.createElement('div');
    row.className = 'cookie-btns';
    var no = document.createElement('button');
    no.type = 'button'; no.className = 'btn btn-ghost'; no.textContent = 'Rechazar';
    no.addEventListener('click', function () { choose('no'); });
    var yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'btn btn-ghost'; yes.textContent = 'Aceptar';
    yes.addEventListener('click', function () { choose('yes'); });
    row.appendChild(no); row.appendChild(yes);
    b.appendChild(p); b.appendChild(row);
    document.body.appendChild(b);
  }

  function init() {
    if (!VALID.test(CLIENT)) return;                 // anuncios desactivados
    var v = get();
    if (v === 'yes') loadAds();
    else if (v !== 'no') showBanner();
    var link = document.getElementById('cookie-settings');
    if (link) {
      link.hidden = false;
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var was = get();
        set('');                                      // vuelve a preguntar
        if (was === 'yes') { location.reload(); return; }
        showBanner();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
