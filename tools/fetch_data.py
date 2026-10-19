#!/usr/bin/env python3
"""Aurum Predictor - descarga y normalizacion de datos de football-data.co.uk.

Uso:
  python3 tools/fetch_data.py [--seasons 2526,2627] [--leagues E0,SP1]
                              [--odds-key KEY] [--refresh] [--today YYYY-MM-DD]

Solo libreria estandar. Escribe data/history.json|.js y data/fixtures.json|.js
de forma atomica. La clave de The Odds API (opcional, o env ODDS_API_KEY) nunca
se imprime ni se guarda.
"""
import argparse
import csv
import datetime as dt
import difflib
import io
import json
import os
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
ALIASES_PATH = os.path.join(DATA_DIR, "team_aliases.json")

BASE = "https://football-data.co.uk"
UA = "Mozilla/5.0 (compatible; AurumPredictor/1.0; +local research tool)"

LEAGUES = {
    "E0": "Premier League",
    "E1": "Championship",
    "SP1": "La Liga",
    "D1": "Bundesliga",
    "I1": "Serie A",
    "F1": "Ligue 1",
    "N1": "Eredivisie",
    "P1": "Primeira Liga",
    "T1": "Super Lig",
    "SC0": "Scottish Premiership",
}
DEFAULT_SEASONS = ["2223", "2324", "2425", "2526", "2627"]

# Prefijo de columna CSV -> nombre normalizado de casa (1X2: <p>H/<p>D/<p>A)
BOOK_1X2 = {
    "B365": "Bet365", "PS": "Pinnacle", "PP": "Pinnacle", "BW": "Bwin",
    "BV": "BetVictor", "BFD": "Betfair", "BFE": "BetfairExchange",
    "SKB": "SkyBet", "Max": "Max", "Avg": "Avg",
    "BMGM": "BetMGM", "CL": "Coral", "LB": "Ladbrokes", "WH": "WilliamHill",
    "IW": "InterWetten", "VC": "VCBet", "SJ": "StanJames", "GB": "Gamebookers",
    "BS": "BlueSquare", "SO": "SportingOdds", "SB": "Sportingbet",
}
# Prefijo -> casa para over/under 2.5 (<p>>2.5, <p><2.5)
BOOK_OU = {
    "B365": "Bet365", "P": "Pinnacle", "PS": "Pinnacle", "PP": "Pinnacle",
    "Max": "Max", "Avg": "Avg", "BFE": "BetfairExchange", "GB": "Gamebookers",
    "BW": "Bwin", "BV": "BetVictor",
}

ODDS_SPORTS = {
    "E0": "soccer_epl", "E1": "soccer_efl_champ", "SP1": "soccer_spain_la_liga",
    "D1": "soccer_germany_bundesliga", "I1": "soccer_italy_serie_a",
    "F1": "soccer_france_ligue_one", "N1": "soccer_netherlands_eredivisie",
    "P1": "soccer_portugal_primeira_liga", "T1": "soccer_turkey_super_league",
    "SC0": "soccer_spl",
}
ODDS_BOOK_NAMES = {
    "bet365": "Bet365", "pinnacle": "Pinnacle", "betfair": "Betfair",
    "betfair_ex_eu": "BetfairExchange", "betfair_ex_uk": "BetfairExchange",
    "williamhill": "WilliamHill", "betvictor": "BetVictor", "bwin": "Bwin",
    "skybet": "SkyBet", "unibet": "Unibet", "unibet_eu": "Unibet",
    "unibet_uk": "Unibet", "ladbrokes_uk": "Ladbrokes", "coral": "Coral",
    "paddypower": "PaddyPower", "betway": "Betway", "888sport": "888sport",
    "betfred_uk": "Betfred", "boylesports": "BoyleSports", "matchbook": "Matchbook",
    "betclic": "Betclic", "betsson": "Betsson", "nordicbet": "NordicBet",
    "marathonbet": "Marathonbet", "sport888": "888sport", "tipico_de": "Tipico",
    "winamax_fr": "Winamax", "winamax_de": "Winamax", "leovegas": "LeoVegas",
    "coolbet": "Coolbet", "suprabets": "Suprabets", "gtbets": "GTbets",
    "draftkings": "DraftKings", "fanduel": "FanDuel", "betmgm": "BetMGM",
    "betrivers": "BetRivers", "williamhill_us": "WilliamHill",
    "sportsbet": "Sportsbet", "tab": "TAB", "ladbrokes_au": "Ladbrokes",
    "neds": "Neds", "unibet_au": "Unibet",
}


class FetchError(Exception):
    pass


# ----------------------------------------------------------------- utilidades
def fold(s):
    """Minusculas, sin acentos, espacios colapsados (clave de comparacion)."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().replace(".", " ").replace("'", "").split())


def load_aliases(path=ALIASES_PATH):
    """Devuelve (mapa fold(alias)->canonico, conjunto de canonicos)."""
    amap, canon = {}, set()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        for c, als in raw.items():
            if c.startswith("_"):
                continue
            canon.add(c)
            amap[fold(c)] = c
            for a in als:
                amap[fold(a)] = c
    return amap, canon


def norm_team(name, amap):
    name = " ".join((name or "").replace("﻿", "").split())
    return amap.get(fold(name), name)


def parse_date(s):
    """dd/mm/yyyy o dd/mm/yy -> 'YYYY-MM-DD'; None si no es valida."""
    s = (s or "").strip().replace("﻿", "")
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return dt.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def parse_odd(v):
    """float > 1.0 o None."""
    try:
        x = float((v or "").strip().replace(",", "."))
    except (ValueError, AttributeError):
        return None
    if x != x or x <= 1.0 or x == float("inf"):
        return None
    return x


def parse_int(v):
    try:
        s = (v or "").strip()
        if s == "":
            return None
        x = float(s)
        if x != x or x < 0 or x != int(x):
            return None
        return int(x)
    except (ValueError, AttributeError):
        return None


def decode_bytes(b):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return b.decode(enc).lstrip("﻿")
        except UnicodeDecodeError:
            continue
    return b.decode("latin-1", "replace")


def read_rows(text):
    text = text.lstrip("﻿")
    rdr = csv.reader(io.StringIO(text))
    try:
        header = [h.strip().lstrip("﻿") for h in next(rdr)]
    except StopIteration:
        return []
    out = []
    for row in rdr:
        if not row or all(not c.strip() for c in row):
            continue
        d = {}
        for i, h in enumerate(header):
            if h:
                d[h] = row[i].strip() if i < len(row) else ""
        out.append(d)
    return out


def extract_1x2(row):
    res = {}
    for p, name in BOOK_1X2.items():
        trio = [parse_odd(row.get(p + s)) for s in ("H", "D", "A")]
        if all(trio):
            # si dos prefijos mapean a la misma casa (PS/PP) gana el primero con datos
            res.setdefault(name, trio)
    return res


def extract_ou(row):
    res = {}
    for p, name in BOOK_OU.items():
        pair = [parse_odd(row.get(p + ">2.5")), parse_odd(row.get(p + "<2.5"))]
        if all(pair):
            res.setdefault(name, pair)
    return res


def parse_history_rows(rows, lg, amap):
    out = []
    for r in rows:
        d = parse_date(r.get("Date"))
        h, a = r.get("HomeTeam", ""), r.get("AwayTeam", "")
        hg, ag = parse_int(r.get("FTHG")), parse_int(r.get("FTAG"))
        if not d or not h or not a or hg is None or ag is None:
            continue
        m = {"d": d, "lg": lg, "h": norm_team(h, amap), "a": norm_team(a, amap),
             "hg": hg, "ag": ag}
        for key, col in (("hs", "HS"), ("as", "AS"), ("hst", "HST"), ("ast", "AST")):
            v = parse_int(r.get(col))
            if v is not None:
                m[key] = v
        o = extract_1x2(r)
        if o:
            m["o"] = o
        ou = extract_ou(r)
        if ou:
            m["ou"] = ou
        out.append(m)
    return out


def parse_fixture_rows(rows, amap, today):
    """today: 'YYYY-MM-DD'. Devuelve (eventos, ligas_no_soportadas:dict)."""
    events, skipped = [], {}
    for r in rows:
        d = parse_date(r.get("Date"))
        lg = (r.get("Div") or "").strip()
        h, a = r.get("HomeTeam", ""), r.get("AwayTeam", "")
        if not d or not h or not a:
            continue
        if lg not in LEAGUES:
            skipped[lg or "?"] = skipped.get(lg or "?", 0) + 1
            continue
        if d < today:
            continue
        o, ou = extract_1x2(r), extract_ou(r)
        if not o:
            continue
        books = {}
        for name, trio in o.items():
            books[name] = {"1x2": trio}
        for name, pair in ou.items():
            books.setdefault(name, {})["ou25"] = pair
        # casas con solo ou25 (sin 1x2) se descartan de books para mantener contrato
        books = {k: v for k, v in books.items() if "1x2" in v}
        hn, an = norm_team(h, amap), norm_team(a, amap)
        t = (r.get("Time") or "").strip()
        if len(t) < 4 or ":" not in t:
            t = "00:00"
        events.append({
            "id": "%s|%s|%s|%s" % (lg, d, hn, an), "lg": lg, "lgName": LEAGUES[lg],
            "ko": "%sT%s" % (d, t.zfill(5)), "h": hn, "a": an, "books": books,
        })
    events.sort(key=lambda e: (e["ko"], e["lg"], e["h"]))
    return events, skipped


# ------------------------------------------------------------------ descarga
_CTX = None


def ssl_context():
    """Contexto TLS verificado. Algunos Python de macOS no traen CA: se prueban
    certifi y los bundles del sistema (nunca se desactiva la verificacion)."""
    global _CTX
    if _CTX is not None:
        return _CTX
    cands = [None]
    try:
        import certifi  # type: ignore
        cands.append(certifi.where())
    except Exception:
        pass
    cands += ["/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt",
              "/opt/homebrew/etc/ca-certificates/cert.pem",
              "/usr/local/etc/openssl/cert.pem"]
    for c in cands:
        if c is not None and not os.path.exists(c):
            continue
        ctx = ssl.create_default_context(cafile=c)
        if c is None and not ctx.cert_store_stats().get("x509_ca"):
            continue
        _CTX = ctx
        return _CTX
    _CTX = ssl.create_default_context()
    return _CTX


def http_get(url, timeout=30, retries=3):
    last = None
    for i in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as resp:  # sigue redirecciones
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 403, 410):
                raise FetchError("HTTP %d" % e.code)
            last = "HTTP %d" % e.code
        except Exception as e:  # red, timeout
            last = type(e).__name__
        time.sleep(1.5 * (i + 1))
    raise FetchError(last or "error desconocido")


def cached_csv(url, fname, refresh=False, max_age_h=None):
    """Descarga con cache en data/raw/. max_age_h: caducidad (None = no caduca)."""
    os.makedirs(RAW_DIR, exist_ok=True)
    path = os.path.join(RAW_DIR, fname)
    if os.path.exists(path) and not refresh:
        age_h = (time.time() - os.path.getmtime(path)) / 3600.0
        if max_age_h is None or age_h < max_age_h:
            with open(path, "rb") as f:
                return decode_bytes(f.read()), "cache"
    try:
        b = http_get(url)
    except FetchError:
        if os.path.exists(path):  # red caida: usar cache vieja
            with open(path, "rb") as f:
                return decode_bytes(f.read()), "cache-vieja"
        raise
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(b)
    os.replace(tmp, path)
    return decode_bytes(b), "red"


def current_season(today):
    y, m = int(today[:4]), int(today[5:7])
    s = y if m >= 7 else y - 1
    return "%02d%02d" % (s % 100, (s + 1) % 100)


# ------------------------------------------------------------------ escritura
def atomic_write(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def write_pair(basename, var, obj, data_dir=DATA_DIR):
    os.makedirs(data_dir, exist_ok=True)
    js = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    jp = os.path.join(data_dir, basename + ".json")
    sp = os.path.join(data_dir, basename + ".js")
    atomic_write(jp, js + "\n")
    atomic_write(sp, "window.%s = %s;\n" % (var, js))
    return jp, sp


def now_iso():
    return dt.datetime.now().replace(microsecond=0).isoformat()


# ------------------------------------------------------------------ Odds API
def _mask(msg, key):
    return msg.replace(key, "***") if key else msg


def odds_api_merge(events, key, amap, teams_by_lg, log=print):
    """Fusiona casas extra en events (in place). Devuelve nº de eventos enriquecidos."""
    if not key:
        return 0
    idx = {}
    for e in events:
        idx.setdefault(e["lg"], []).append(e)
    enriched, unmatched_names = 0, set()
    for lg, sport in ODDS_SPORTS.items():
        if lg not in idx:
            continue
        qs = urllib.parse.urlencode({"apiKey": key, "regions": "eu,uk,us,au",
                                     "markets": "h2h,totals", "oddsFormat": "decimal",
                                     "dateFormat": "iso"})
        url = "https://api.the-odds-api.com/v4/sports/%s/odds/?%s" % (sport, qs)
        try:
            data = json.loads(http_get(url).decode("utf-8"))
        except Exception as ex:
            log("  Odds API %s: omitido (%s)" % (lg, _mask(str(ex), key)))
            continue
        known = teams_by_lg.get(lg, set())
        folded = {fold(t): t for t in known}

        def canon(n):
            c = norm_team(n, amap)
            if c in known:
                return c
            m = difflib.get_close_matches(fold(c), list(folded), n=1, cutoff=0.86)
            if m:
                return folded[m[0]]
            unmatched_names.add(c)
            return c

        for ev in data if isinstance(data, list) else []:
            try:
                h, a = canon(ev["home_team"]), canon(ev["away_team"])
                day = dt.datetime.strptime(ev["commence_time"][:10], "%Y-%m-%d").date()
            except Exception:
                continue
            target = None
            for e in idx[lg]:
                if e["h"] == h and e["a"] == a:
                    ed = dt.datetime.strptime(e["ko"][:10], "%Y-%m-%d").date()
                    if abs((ed - day).days) <= 1:
                        target = e
                        break
            if not target:
                continue
            added = False
            for bm in ev.get("bookmakers", []):
                bname = ODDS_BOOK_NAMES.get(bm.get("key"), bm.get("title") or bm.get("key"))
                for mk in bm.get("markets", []):
                    if mk.get("key") == "h2h":
                        px = {}
                        for o in mk.get("outcomes", []):
                            nm = o.get("name")
                            px["D" if nm == "Draw" else canon(nm)] = parse_odd(str(o.get("price")))
                        trio = [px.get(h), px.get("D"), px.get(a)]
                        if all(trio) and "1x2" not in target["books"].get(bname, {}):
                            target["books"].setdefault(bname, {})["1x2"] = trio
                            added = True
                    elif mk.get("key") == "totals":
                        ov = un = None
                        for o in mk.get("outcomes", []):
                            if o.get("point") == 2.5:
                                if o.get("name") == "Over":
                                    ov = parse_odd(str(o.get("price")))
                                elif o.get("name") == "Under":
                                    un = parse_odd(str(o.get("price")))
                        if ov and un and bname in target["books"] and "ou25" not in target["books"][bname]:
                            target["books"][bname]["ou25"] = [ov, un]
                            added = True
            if added:
                enriched += 1
    if unmatched_names:
        log("  Odds API: nombres sin coincidencia (revisar alias): %s"
            % ", ".join(sorted(unmatched_names)[:20]))
    return enriched


# ------------------------------------------------------------------------ main
def main(argv=None):
    ap = argparse.ArgumentParser(description="Descarga datos de football-data.co.uk")
    ap.add_argument("--seasons", default=",".join(DEFAULT_SEASONS))
    ap.add_argument("--leagues", default=",".join(LEAGUES))
    ap.add_argument("--odds-key", default=None, help="The Odds API (o env ODDS_API_KEY)")
    ap.add_argument("--refresh", action="store_true", help="ignorar cache")
    ap.add_argument("--today", default=None, help="YYYY-MM-DD (para pruebas)")
    args = ap.parse_args(argv)

    today = args.today or dt.date.today().isoformat()
    seasons = [s.strip() for s in args.seasons.split(",") if s.strip()]
    leagues = [l.strip() for l in args.leagues.split(",") if l.strip()]
    bad = [l for l in leagues if l not in LEAGUES]
    if bad:
        print("Ligas desconocidas: %s" % ",".join(bad), file=sys.stderr)
        return 2
    key = args.odds_key or os.environ.get("ODDS_API_KEY") or ""
    amap, _ = load_aliases()
    cur = current_season(today)

    matches, counts, missing = [], {}, []
    for s in seasons:
        for lg in leagues:
            url = "%s/mmz4281/%s/%s.csv" % (BASE, s, lg)
            try:
                text, how = cached_csv(url, "%s_%s.csv" % (s, lg), args.refresh,
                                       max_age_h=6 if s == cur else None)
            except FetchError as e:
                missing.append("%s/%s (%s)" % (s, lg, e))
                continue
            ms = parse_history_rows(read_rows(text), lg, amap)
            counts[(s, lg)] = len(ms)
            matches.extend(ms)
    seen, uniq = set(), []
    for m in sorted(matches, key=lambda m: (m["d"], m["lg"], m["h"], m["a"])):
        k = (m["d"], m["lg"], m["h"], m["a"])
        if k not in seen:
            seen.add(k)
            uniq.append(m)
    matches = uniq

    events, skipped = [], {}
    try:
        text, how = cached_csv(BASE + "/fixtures.csv", "fixtures.csv", args.refresh, max_age_h=1)
        events, skipped = parse_fixture_rows(read_rows(text), amap, today)
    except FetchError as e:
        print("fixtures.csv: no disponible (%s)" % e)

    teams_by_lg = {}
    for m in matches:
        teams_by_lg.setdefault(m["lg"], set()).update((m["h"], m["a"]))
    source = "football-data.co.uk"
    if key:
        n = odds_api_merge(events, key, amap, teams_by_lg)
        print("The Odds API: %d eventos enriquecidos" % n)
        if n:
            source += "+the-odds-api"
    else:
        print("The Odds API: omitido (sin --odds-key ni ODDS_API_KEY)")

    gen = now_iso()
    write_pair("history", "AURUM_HISTORY",
               {"generated": gen, "source": "football-data.co.uk", "matches": matches})
    write_pair("fixtures", "AURUM_FIXTURES",
               {"generated": gen, "source": source, "events": events})

    # ---- informe
    print("\nPartidos por temporada/liga:")
    for s in seasons:
        row = ["%s:%d" % (lg, counts[(s, lg)]) for lg in leagues if (s, lg) in counts]
        print("  %s  %s" % (s, "  ".join(row)))
    print("Total historico: %d partidos" % len(matches))
    if missing:
        print("Sin datos (saltados): %s" % "; ".join(missing))
    print("Eventos futuros (>= %s): %d" % (today, len(events)))
    if skipped:
        print("Fixtures en ligas fuera de alcance: %s" % skipped)
    books = {}
    for e in events:
        for b in e["books"]:
            books[b] = books.get(b, 0) + 1
    print("Casas en fixtures: %s" % ", ".join("%s(%d)" % kv for kv in sorted(books.items())))
    hbooks = {}
    for m in matches:
        for b in m.get("o", {}):
            hbooks[b] = hbooks.get(b, 0) + 1
    print("Casas en historico: %s" % ", ".join("%s(%d)" % kv for kv in sorted(hbooks.items())))
    unk = sorted({(e["lg"], t) for e in events for t in (e["h"], e["a"])
                  if t not in teams_by_lg.get(e["lg"], set())})
    print("Equipos de fixtures SIN coincidencia en historico: %d" % len(unk))
    for lg, t in unk:
        print("  %s  %s" % (lg, t))
    for p in ("history.json", "history.js", "fixtures.json", "fixtures.js"):
        print("  %s: %.1f KB" % (p, os.path.getsize(os.path.join(DATA_DIR, p)) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
