#!/usr/bin/env python3
"""Aurum Predictor - arma la carpeta `dist/` que se publica en internet.

Uso:  python3 tools/build_site.py [--with-odds-api] [--out dist]

Publica SOLO lo que la web necesita (lista blanca). Nunca incluye: el casino de prueba (casino.html y js/games, sin licencia),
tools/, tests/, la clave de The Odds API, cachés ni archivos ocultos. Antes de terminar audita el resultado y falla si
encuentra algo prohibido (incluido el valor de tu clave guardada).

Por defecto NO se publican las cuotas de DraftKings (llegan por ESPN y no tienen licencia de redistribución): los pronósticos de las
ligas que solo tenían esas cuotas pasan a ser del modelo estadístico, y la web lo indica.
--con-draftkings las incluye (bajo tu responsabilidad).
--with-odds-api  incluye data/odds_api.js (cuotas de The Odds API). Por defecto NO se publican: sus términos pueden restringir
                 la redistribución pública de las cuotas; revísalos antes de activarlo.
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PUBLIC_FILES = [
    "index.html", "privacidad.html", "css/styles.css", "css/predictor.css",
    "js/model.js", "js/multimodel.js", "js/math.js", "js/core.js", "js/pronosticos.js", "js/predictor.js", "js/ads.js",
    "data/history.js", "data/fixtures.js", "data/backtest.js", "data/backtest_multi.js", "data/multi.js", "data/casas_peru.js",
]
OPTIONAL = {"data/odds_api.js": "--with-odds-api"}

# Orígenes de Google que AdSense necesita; solo se añaden a la CSP si js/ads.js tiene un ID de editor válido.
ADS_HOSTS = "https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net https://*.googleadservices.com https://*.googletagservices.com https://*.adtrafficquality.google https://*.gstatic.com"
ADS_CLIENT_RE = re.compile(r"var CLIENT = '([^']*)';")
ADS_VALID = re.compile(r"^ca-pub-\d{10,20}$")


def csp(client=""):
    ads = " " + ADS_HOSTS if client else ""
    return ("default-src 'self'; script-src 'self' 'unsafe-inline'%s; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; img-src 'self' data:%s; connect-src 'self'%s%s"
            % (ads, " https:" if client else "", ads, "; frame-src" + ads if client else ""))


def headers(client=""):
    return """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: %s; frame-ancestors 'none'
/data/*
  Cache-Control: public, max-age=600
/js/*
  Cache-Control: public, max-age=3600
/css/*
  Cache-Control: public, max-age=3600
""" % csp(client)


def ads_client(root):
    """ID de editor de AdSense escrito en js/ads.js ('' = anuncios desactivados). Un ID mal escrito falla en vez de ignorarse."""
    p = os.path.join(root, "js", "ads.js")
    if not os.path.exists(p):
        return ""
    with open(p, encoding="utf-8") as f:
        m = ADS_CLIENT_RE.search(f.read())
    cid = m.group(1).strip() if m else ""
    if cid and not ADS_VALID.match(cid):
        raise SystemExit("El ID de AdSense en js/ads.js no tiene el formato ca-pub-0000000000000000: %r" % cid)
    return cid


SITE_URL = "https://aurum-predictor.com"
ROBOTS = "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE_URL

# Cosas que jamás deben aparecer en lo publicado (nombres de archivo y texto)
FORBIDDEN_PATHS = re.compile(r"(casino|/games/|\.odds_api_key|(^|/)tools/|(^|/)tests/|/raw|\.tmp$|(^|/)\.[^/]+$|\.json$|\.py$|node_modules)", re.I)
FORBIDDEN_TEXT = [r"casino\.html", r"js/games", r"\.odds_api_key"]


def stamp_now():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M")


def transform_index(html, stamp, with_odds_api=False, con_dk=False, client=""):
    """Adapta index.html para internet: sin enlace al casino, versión de caché fija (no Date.now()), CSP también en GitHub Pages
    (que ignora _headers) y sin pedir archivos que no se publican."""
    html = re.sub(r'\s*<a href="casino\.html"[^>]*>[^<]*</a>\.?', "", html)
    html = html.replace("Date.now()", "'%s'" % stamp)
    html = re.sub(r"\?v=\d+", "", html)
    html = re.sub(r'((?:src|href)="(?:js|css)/[^"?]+)"', r'\1?v=%s"' % stamp, html)
    if not with_odds_api:
        html = html.replace(", 'odds_api']", "]")
    if not con_dk:  # el pie de página no debe citar una fuente de cuotas que ya no se publica
        html = html.replace("(calendarios, resultados y cuotas de referencia de DraftKings)", "(calendarios y resultados)")
    if "Content-Security-Policy" not in html:
        if "<head>" in html:
            meta = '<meta http-equiv="Content-Security-Policy" content="%s">' % csp(client).replace('"', "&quot;")
            if client:   # verificación de AdSense: no carga nada, solo identifica el sitio
                meta += '\n  <meta name="google-adsense-account" content="%s">' % client
            html = html.replace("<head>", "<head>\n  " + meta, 1)
        else:
            raise SystemExit("index.html no tiene <head>: no se puede añadir la política de seguridad (CSP)")
    return html


def strip_draftkings(path):
    """Quita las cuotas (odds) de los eventos en data/multi.js sin tocar el resto."""
    with open(path, encoding="utf-8") as f:
        t = f.read()
    m = re.match(r"^(window\.AURUM_MULTI_PACKED = )(.*);\s*$", t, re.S)
    if not m:
        raise SystemExit("Formato inesperado en data/multi.js: no se pueden quitar las cuotas de DraftKings")
    d = json.loads(m.group(2))
    for e in d.get("events", []):
        e["odds"] = None
    with open(path, "w", encoding="utf-8") as f:
        f.write(m.group(1) + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")


def build(root, out, with_odds_api=False, stamp=None, log=print, con_draftkings=False):
    stamp = stamp or stamp_now()
    root, out = os.path.abspath(root), os.path.abspath(out)
    if os.path.commonpath([root, out]) != root or out == root:
        raise SystemExit("La carpeta de salida debe estar DENTRO del proyecto y no ser la raíz: %s" % out)
    if not os.path.basename(out).startswith("dist"):      # protege css/, js/, data/, tools/… de un --out equivocado
        raise SystemExit("La carpeta de salida debe llamarse «dist» (o empezar por «dist»): %s" % out)
    for stale in (out, out.rstrip("/") + ".zip"):          # nada de restos de una corrida anterior
        if os.path.isdir(stale):
            shutil.rmtree(stale)
        elif os.path.exists(stale):
            os.remove(stale)
    client = ads_client(root)
    files = list(PUBLIC_FILES) + [f for f in OPTIONAL if with_odds_api]
    missing = []
    for rel in files:
        src = os.path.join(root, rel)
        if not os.path.exists(src):
            if rel.startswith("data/") and rel not in ("data/casas_peru.js",) and rel not in OPTIONAL:
                missing.append(rel)
            continue
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if rel in ("index.html", "privacidad.html"):
            with open(src, encoding="utf-8") as f:
                html = transform_index(f.read(), stamp, with_odds_api, con_draftkings, client)
            with open(dst, "w", encoding="utf-8") as f:
                f.write(html)
        else:
            shutil.copyfile(src, dst)
            if rel == "data/multi.js" and not con_draftkings:
                strip_draftkings(dst)
    if missing:
        raise SystemExit("Faltan datos para publicar: %s\nEjecuta primero: python3 tools/fetch_data.py && python3 tools/fetch_espn.py && node tools/backtest.js && node tools/backtest_multi.js" % ", ".join(missing))
    extra = [("_headers", headers(client)), ("robots.txt", ROBOTS), (".nojekyll", "")]
    if client:   # ads.txt: Google lo exige en la raíz del dominio para pagar los anuncios
        extra.append(("ads.txt", "google.com, %s, DIRECT, f08c47fec0942fa0\n" % client.replace("ca-", "", 1)))
    for name, text in extra:
        with open(os.path.join(out, name), "w", encoding="utf-8") as f:
            f.write(text)
    problems = audit(root, out)
    if problems:
        shutil.rmtree(out)
        raise SystemExit("AUDITORÍA FALLIDA, no se generó dist:\n - " + "\n - ".join(problems))
    return out


def audit(root, out):
    """Devuelve la lista de problemas (vacía = OK)."""
    problems, secret = [], ""
    kp = os.path.join(root, "tools", ".odds_api_key")
    secrets = [os.environ.get("ODDS_API_KEY", "").strip()]          # también la clave del entorno (CI)
    if os.path.exists(kp):
        with open(kp, encoding="utf-8") as f:
            secrets.append(f.read().strip())
    secrets = [x for x in secrets if len(x) >= 12]
    for dp, _, fns in os.walk(out):
        for fn in fns:
            full = os.path.join(dp, fn)
            rel = os.path.relpath(full, out).replace(os.sep, "/")
            if rel not in ("_headers", "robots.txt", ".nojekyll", "ads.txt") and FORBIDDEN_PATHS.search(rel):
                problems.append("archivo no permitido: " + rel)
                continue
            if not rel.endswith((".html", ".js", ".css", ".txt", "_headers")):
                continue
            with open(full, encoding="utf-8", errors="replace") as f:
                txt = f.read()
            if any(sc in txt for sc in secrets):
                problems.append("¡LA CLAVE de The Odds API aparece en %s!" % rel)
            for pat in FORBIDDEN_TEXT:
                if re.search(pat, txt) and rel not in ("js/predictor.js", "js/pronosticos.js"):  # estos solo la nombran en un texto de ayuda
                    problems.append("texto prohibido /%s/ en %s" % (pat, rel))
    return problems


def make_zip(out):
    zp = out.rstrip("/") + ".zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fns in os.walk(out):
            for fn in fns:
                full = os.path.join(dp, fn)
                z.write(full, os.path.relpath(full, out))
    return zp


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="dist")
    ap.add_argument("--with-odds-api", action="store_true")
    ap.add_argument("--no-zip", action="store_true")
    ap.add_argument("--con-draftkings", action="store_true", help="incluye las cuotas de DraftKings (ESPN); por defecto NO")
    a = ap.parse_args(argv)
    out = build(ROOT, os.path.join(ROOT, a.out), a.with_odds_api, con_draftkings=a.con_draftkings)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out) for f in fs) / 1e6
    print("Listo: %s (%.1f MB sin comprimir; los hosts lo comprimen ~4×). Auditoría OK: sin casino, sin claves, sin herramientas, %s%s." % (os.path.relpath(out, ROOT), size, "con cuotas de DraftKings" if a.con_draftkings else "sin cuotas de DraftKings",
          ", anuncios AdSense ACTIVADOS (%s)" % ads_client(ROOT) if ads_client(ROOT) else ", sin anuncios"))
    if not a.no_zip:
        print("También: %s (para subir como .zip)" % os.path.relpath(make_zip(out), ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
