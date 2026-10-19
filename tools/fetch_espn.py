#!/usr/bin/env python3
"""Aurum Predictor - Fase 2: multi-deporte desde la API publica (no oficial) de ESPN.

Uso:
  python3 tools/fetch_espn.py [--leagues soccer/per.1,mma/ufc] [--months 24]
                              [--tennis-months 9] [--days 8] [--refresh]
                              [--max-requests 900] [--today YYYY-MM-DD]

Solo libreria estandar. Escribe data/multi.json y data/multi.js
(`window.AURUM_MULTI = ...;`) de forma atomica. Cache comprimida en
data/raw_espn/ (los periodos pasados no caducan; los que incluyen hoy, 30 min).

Notas de la API (verificadas en vivo): el parametro dates solo acepta un dia
(YYYYMMDD), un mes (YYYYMM) o un ano (YYYY); los RANGOS (YYYYMMDD-YYYYMMDD)
devuelven 400. limit maximo efectivo = 1000. Si una peticion devuelve >= 1000
eventos se considera truncada y se trocea (ano -> meses -> dias).
Las cuotas solo existen en eventos no terminados; los resultados no las llevan.
"""
import argparse
import datetime as dt
import gzip
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw_espn")

BASE = "https://site.api.espn.com/apis/site/v2/sports"
UA = "Mozilla/5.0 (compatible; AurumPredictor/1.0; +local research tool)"
LIMIT = 1000
PAUSE = 0.25
TTL_LIVE = 30 * 60          # periodos que incluyen hoy / calendario
SETTLE_DAYS = 3             # un periodo es "para siempre" si se bajo 3 d despues de acabar
ERR_TTL = 24 * 3600

SPORT_NAMES = {
    "soccer": "Fútbol", "basketball": "Baloncesto", "baseball": "Béisbol",
    "football": "Fútbol americano", "hockey": "Hockey", "mma": "MMA",
    "tennis": "Tenis", "rugby": "Rugby", "volleyball": "Vóley",
    "rugby-league": "Rugby league", "cricket": "Cricket",
}
INDIVIDUAL = ("mma", "tennis")          # h/a = competidor 1 y 2, neutral, sin marcador
MONTH_MODE_SPORTS = ("tennis",)
# ligas con tantos partidos al ano que el ano siempre se trunca -> directo por meses
MONTH_MODE = {"baseball/mlb", "basketball/nba", "hockey/nhl", "tennis/atp", "tennis/wta"}
MONTHS_OVERRIDE = {}
SOCCER_MONTHS = 60   # el fútbol usa hasta 5 años: pocos partidos por temporada → más historia = mejores ratings
# NCAA (baloncesto/futbol americano/beisbol/hockey universitarios) se probo y se excluyo: el
# scoreboard sin ?groups=50 solo devuelve partidos destacados (cobertura parcial) y con groups
# el volumen revienta el presupuesto de peticiones.

# (slug, nombre, pais ISO-2). Orden = prioridad (Peru primero).
SOCCER = [
    ("per.1", "Liga 1 (Perú)", "PE"), ("arg.1", "Liga Profesional (Argentina)", "AR"),
    ("bra.1", "Brasileirão Serie A", "BR"), ("col.1", "Liga BetPlay (Colombia)", "CO"),
    ("chi.1", "Primera División (Chile)", "CL"), ("uru.1", "Primera División (Uruguay)", "UY"),
    ("ecu.1", "LigaPro (Ecuador)", "EC"), ("par.1", "Primera División (Paraguay)", "PY"),
    ("bol.1", "Liga Profesional (Bolivia)", "BO"), ("ven.1", "Liga FUTVE (Venezuela)", "VE"),
    ("mex.1", "Liga MX", "MX"), ("usa.1", "MLS", "US"),
    ("conmebol.libertadores", "Copa Libertadores", "SA"),
    ("conmebol.sudamericana", "Copa Sudamericana", "SA"),
    ("uefa.champions", "UEFA Champions League", "EU"), ("uefa.europa", "UEFA Europa League", "EU"),
    ("uefa.europa.conf", "UEFA Conference League", "EU"),
    ("eng.1", "Premier League", "GB"), ("eng.2", "Championship", "GB"),
    ("esp.1", "LaLiga", "ES"), ("esp.2", "LaLiga 2", "ES"),
    ("ger.1", "Bundesliga", "DE"), ("ger.2", "2. Bundesliga", "DE"),
    ("ita.1", "Serie A", "IT"), ("fra.1", "Ligue 1", "FR"),
    ("ned.1", "Eredivisie", "NL"), ("por.1", "Primeira Liga", "PT"),
    ("tur.1", "Süper Lig", "TR"), ("sco.1", "Scottish Premiership", "GB"),
    ("bel.1", "Pro League (Bélgica)", "BE"), ("jpn.1", "J1 League", "JP"),
    ("kor.1", "K League 1", "KR"), ("chn.1", "Superliga China", "CN"),
    ("aus.1", "A-League (Australia)", "AU"), ("sau.1", "Saudi Pro League", "SA"),
    ("gre.1", "Superliga (Grecia)", "GR"), ("den.1", "Superliga (Dinamarca)", "DK"),
    ("swe.1", "Allsvenskan", "SE"), ("nor.1", "Eliteserien", "NO"),
    ("aut.1", "Bundesliga (Austria)", "AT"), ("sui.1", "Super League (Suiza)", "CH"),
    ("concacaf.champions", "Concacaf Champions Cup", "NA"),
    # selecciones
    ("fifa.world", "Copa del Mundo", "WW"), ("uefa.nations", "UEFA Nations League", "EU"),
    ("fifa.worldq.conmebol", "Eliminatorias Conmebol", "SA"),
    ("fifa.worldq.uefa", "Eliminatorias UEFA", "EU"),
    ("uefa.euroq", "Clasificatorias Eurocopa", "EU"), ("uefa.euro", "Eurocopa", "EU"),
    ("conmebol.america", "Copa América", "SA"), ("concacaf.gold", "Copa Oro", "NA"),
    ("concacaf.nations.league", "Concacaf Nations League", "NA"),
    ("fifa.friendly", "Amistosos internacionales", "WW"),
    # otras razonables
    ("arg.2", "Primera Nacional (Argentina)", "AR"), ("bra.2", "Brasileirão Serie B", "BR"),
    ("col.2", "Torneo BetPlay (Colombia)", "CO"), ("chi.2", "Primera B (Chile)", "CL"),
    ("mex.2", "Liga de Expansión MX", "MX"), ("usa.nwsl", "NWSL", "US"),
    ("usa.usl.1", "USL Championship", "US"), ("eng.3", "League One", "GB"),
    ("eng.4", "League Two", "GB"), ("eng.fa", "FA Cup", "GB"),
    ("eng.league_cup", "EFL Cup", "GB"), ("esp.copa_del_rey", "Copa del Rey", "ES"),
    ("ger.dfb_pokal", "DFB-Pokal", "DE"), ("ita.coppa_italia", "Coppa Italia", "IT"),
    ("fra.coupe_de_france", "Copa de Francia", "FR"), ("ita.2", "Serie B", "IT"),
    ("fra.2", "Ligue 2", "FR"), ("ger.3", "3. Liga", "DE"), ("por.2", "Liga Portugal 2", "PT"),
    ("tur.2", "1. Lig (Turquía)", "TR"), ("sco.2", "Scottish Championship", "GB"),
    ("bra.copa_do_brazil", "Copa do Brasil", "BR"), ("arg.copa", "Copa Argentina", "AR"),
    ("rus.1", "Liga Premier (Rusia)", "RU"), ("ukr.1", "Premier League (Ucrania)", "UA"),
    ("cze.1", "Liga Checa", "CZ"), ("pol.1", "Ekstraklasa", "PL"),
    ("cro.1", "HNL (Croacia)", "HR"), ("srb.1", "Superliga (Serbia)", "RS"),
    ("rou.1", "Liga 1 (Rumanía)", "RO"), ("isr.1", "Ligat ha'Al", "IL"),
    ("ind.1", "Superliga India", "IN"), ("egy.1", "Premier League (Egipto)", "EG"),
    ("rsa.1", "Premiership (Sudáfrica)", "ZA"), ("crc.1", "Liga Promerica (Costa Rica)", "CR"),
    ("gua.1", "Liga Nacional (Guatemala)", "GT"), ("hon.1", "Liga Nacional (Honduras)", "HN"),
    ("concacaf.leagues.cup", "Leagues Cup", "NA"), ("fifa.cwc", "Mundial de Clubes", "WW"),
    ("conmebol.recopa", "Recopa Sudamericana", "SA"), ("uefa.super_cup", "Supercopa de la UEFA", "EU"),
]
OTHERS = [
    ("basketball/nba", "NBA", "US"), ("basketball/wnba", "WNBA", "US"),
    ("baseball/mlb", "MLB", "US"), ("football/nfl", "NFL", "US"),
    ("hockey/nhl", "NHL", "US"),
    ("mma/ufc", "UFC", "US"), ("mma/pfl", "PFL", "US"), ("mma/bellator", "Bellator", "US"),
    ("tennis/atp", "ATP (individual)", "WW"), ("tennis/wta", "WTA (individual)", "WW"),
    ("rugby/180659", "Six Nations", "EU"), ("rugby/164205", "Copa Mundial de Rugby", "WW"),
    ("football/ufl", "UFL", "US"),
]
CATALOG = [("soccer/" + s, n, c) for s, n, c in SOCCER] + OTHERS
CATALOG_META = {lid: (n, c) for lid, n, c in CATALOG}

BAD_STATUS = ("POSTPONED", "CANCEL", "SUSPEND", "ABANDON", "DELAY", "WALKOVER", "FORFEIT",
              "NO_CONTEST", "UNKNOWN")
OT_MARKS = ("AET", "PEN", "_OT", "SHOOTOUT", "_SO", "EXTRA")
SKIP_NAMES = ("tbd", "tba", "")
SKIP_GROUPS = ("double", "mixed", "doble")

# ------------------------------------------------------------------ utilidades


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def american_to_decimal(v):
    """'+150'/'-150'/150 -> 2.5/1.667. None si no es una cuota valida (<=1.0, OFF, EVEN no se inventa)."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, str):
        s = v.strip().replace("−", "-")
        if not re.fullmatch(r"[+-]?\d+(\.\d+)?", s):
            return None
        a = float(s)
    elif isinstance(v, (int, float)):
        a = float(v)
    else:
        return None
    if a == 0:
        return None
    dec = 1 + a / 100.0 if a > 0 else 1 + 100.0 / abs(a)
    if dec <= 1.0:
        return None
    return round(dec, 3)


def parse_line(v):
    """'o2.5'/'u2.5'/'-1.5'/'+0.5'/2.5 -> float; None si OFF o ilegible."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower().replace("−", "-")
    s = re.sub(r"^[ou]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def _tier_odds(side, tier):
    node = side.get(tier) if isinstance(side, dict) else None
    return node if isinstance(node, dict) else {}


def _pair_tiers(state):
    # pre: cierre > apertura ; en juego: actual > cierre > apertura
    return ("current", "close", "open") if state == "in" else ("close", "open", "current")


def parse_odds_entry(o, state="pre"):
    """Un elemento de competitions[].odds -> {'ml':[h,d|None,a],'total':{..},'spread':{..}} o None."""
    if not isinstance(o, dict):
        return None
    tiers = _pair_tiers(state)
    out = {}
    ml = o.get("moneyline") if isinstance(o.get("moneyline"), dict) else {}
    for t in tiers:
        h = american_to_decimal(_tier_odds(ml.get("home"), t).get("odds"))
        a = american_to_decimal(_tier_odds(ml.get("away"), t).get("odds"))
        if h and a:
            d = american_to_decimal(_tier_odds(ml.get("draw"), t).get("odds"))
            if d is None and isinstance(o.get("drawOdds"), dict):
                d = american_to_decimal(o["drawOdds"].get("moneyLine"))
            out["ml"] = [h, d, a]
            break
    tot = o.get("total") if isinstance(o.get("total"), dict) else {}
    for t in tiers:
        ov, un = _tier_odds(tot.get("over"), t), _tier_odds(tot.get("under"), t)
        lo, lu = parse_line(ov.get("line")), parse_line(un.get("line"))
        co, cu = american_to_decimal(ov.get("odds")), american_to_decimal(un.get("odds"))
        if lo is not None and lo == lu and co and cu:
            out["total"] = {"line": lo, "over": co, "under": cu}
            break
    sp = o.get("pointSpread") if isinstance(o.get("pointSpread"), dict) else {}
    for t in tiers:
        hh, aa = _tier_odds(sp.get("home"), t), _tier_odds(sp.get("away"), t)
        lh, la = parse_line(hh.get("line")), parse_line(aa.get("line"))
        ch, ca = american_to_decimal(hh.get("odds")), american_to_decimal(aa.get("odds"))
        if lh is not None and la is not None and abs(lh + la) < 1e-9 and ch and ca:
            out["spread"] = {"line": lh, "home": ch, "away": ca}
            break
    return out or None


def parse_odds(comp, state="pre"):
    """competitions[].odds (lista, a veces [null]) -> {casa: {...}} o None. Nunca inventa."""
    res = {}
    for o in comp.get("odds") or []:
        if not isinstance(o, dict):
            continue
        prov = o.get("provider") or {}
        name = str(prov.get("displayName") or prov.get("name") or "DraftKings")
        name = "DraftKings" if "draft" in name.lower() else name.replace(" ", "")
        e = parse_odds_entry(o, state)
        if e and name not in res:
            res[name] = e
    return res or None


def comp_status(comp):
    t = (comp.get("status") or {}).get("type") or {}
    return (t.get("name") or ""), (t.get("state") or ""), bool(t.get("completed"))


def score_of(c):
    s = c.get("score")
    if isinstance(s, dict):
        s = s.get("value", s.get("displayValue"))
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def comp_name(c):
    t = c.get("team") or {}
    a = c.get("athlete") or {}
    n = t.get("displayName") or t.get("name") or a.get("displayName") or a.get("fullName") or ""
    return n.strip()


def order_sides(comps):
    """-> (home, away) competidores. Por homeAway si existe; si no, por 'order'."""
    if len(comps) != 2:
        return None
    ha = {c.get("homeAway"): c for c in comps if c.get("homeAway") in ("home", "away")}
    if len(ha) == 2:
        return ha["home"], ha["away"]
    s = sorted(comps, key=lambda c: c.get("order", 9))
    return s[0], s[1]


def iter_competitions(ev):
    """Rinde (id, comp) por cada partido del evento. Tenis: events[].groupings[].competitions[]."""
    if ev.get("groupings"):
        for g in ev["groupings"]:
            gname = str((g.get("grouping") or {}).get("displayName") or "").lower()
            if any(x in gname for x in SKIP_GROUPS):
                continue
            for c in g.get("competitions") or []:
                yield str(c.get("id")), c
    else:
        comps = ev.get("competitions") or []
        for c in comps:
            yield (str(ev.get("id")) if len(comps) == 1 else str(c.get("id"))), c


def parse_event(ev, lg, sport, now, window_end):
    """Evento ESPN -> lista de ('event'|'result', dict). Descarta estados no validos."""
    out = []
    # ESPN: season.type 1 = pretemporada (alineaciones B, resultados poco representativos)
    preseason = sport != "soccer" and (ev.get("season") or {}).get("type") == 1
    for cid, comp in iter_competitions(ev):
        sides = order_sides(comp.get("competitors") or [])
        if not sides:
            continue
        hc, ac = sides
        if (hc.get("type") == "team") != (ac.get("type") == "team") and sport in INDIVIDUAL:
            continue
        h, a = comp_name(hc), comp_name(ac)
        if h.lower() in SKIP_NAMES or a.lower() in SKIP_NAMES or h == a:
            continue
        name, state, completed = comp_status(comp)
        ko = comp.get("date") or comp.get("startDate") or ev.get("date")
        if not ko or any(b in name.upper() for b in BAD_STATUS):
            continue
        neutral = True if sport in INDIVIDUAL else bool(comp.get("neutralSite"))
        try:
            kod = dt.datetime.strptime(ko[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
        if state == "post":
            if not completed:
                continue
            hs = as_ = None
            if sport not in INDIVIDUAL:
                hs, as_ = score_of(hc), score_of(ac)
            w, ot = decide_winner(hc, ac, hs, as_, name, sport)
            if w is None:
                continue
            r = {"lg": lg, "d": kod.strftime("%Y-%m-%d"), "h": h, "a": a, "hs": hs, "as": as_,
                 "w": w, "neutral": neutral}
            if ot:
                r["ot"] = True
            if preseason:
                r["pre"] = True
            out.append(("result", {"id": cid, "ko": ko, **r}))
        elif state in ("pre", "in"):
            if state == "pre" and (kod < now - dt.timedelta(hours=3)):
                continue                      # programado pero vencido: aplazado/colgado
            if kod >= window_end:
                continue
            e = {"id": cid, "lg": lg, "ko": ko, "h": h, "a": a, "status": state,
                 "neutral": neutral, "odds": parse_odds(comp, state)}
            if preseason:
                e["pre"] = True
            out.append(("event", e))
    return out


def decide_winner(hc, ac, hs, as_, status_name, sport):
    """-> (w, ot). w in h|a|d o None si no hay resultado utilizable."""
    ot = any(m in status_name.upper() for m in OT_MARKS)
    if hs is not None and as_ is not None and hs != as_:
        return ("h" if hs > as_ else "a"), ot
    hw, aw = bool(hc.get("winner")), bool(ac.get("winner"))
    if hw != aw:
        return ("h" if hw else "a"), (ot or (hs is not None and hs == as_))
    if hs is not None and as_ is not None and hs == as_:
        return "d", False
    return None, False


# ------------------------------------------------------------------ red y cache
_CTX = None


def ssl_context():
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
              "/opt/homebrew/etc/ca-certificates/cert.pem", "/usr/local/etc/openssl/cert.pem"]
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


class Net:
    def __init__(self, max_requests, refresh=False):
        self.n = 0
        self.max = max_requests
        self.refresh = refresh
        self.last = 0.0
        self.exhausted = False

    def get(self, url, timeout=40, retries=3):
        """-> (status, json|None). 4xx no se reintenta. Lanza RuntimeError si se agota el presupuesto."""
        if self.n >= self.max:
            self.exhausted = True
            raise RuntimeError("presupuesto de peticiones agotado")
        err = None
        for i in range(retries):
            wait = PAUSE - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.n += 1
            self.last = time.time()
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            try:
                with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as r:
                    raw = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    return r.status, json.loads(raw.decode("utf-8"))
            except urllib.error.HTTPError as e:
                if 400 <= e.code < 500 and e.code != 429:
                    return e.code, None
                err = "HTTP %s" % e.code
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                err = str(e)
            time.sleep(1.5 * (i + 1))
            if self.n >= self.max:
                break
        return 0, {"_error": err}


DROP_ODDS_KEYS = {"link", "logos", "tracking", "header", "footer", "awayTeamOdds", "homeTeamOdds"}


def strip_odds(o):
    if isinstance(o, dict):
        return {k: strip_odds(v) for k, v in o.items() if k not in DROP_ODDS_KEYS}
    if isinstance(o, list):
        return [strip_odds(x) for x in o]
    return o


def slim_status(s):
    t = (s or {}).get("type") or {}
    return {"type": {"name": t.get("name"), "state": t.get("state"), "completed": t.get("completed")}}


def slim_competitor(c):
    out = {k: c[k] for k in ("id", "order", "homeAway", "winner", "score", "type") if k in c}
    if isinstance(out.get("score"), dict):
        out["score"] = out["score"].get("value", out["score"].get("displayValue"))
    t = c.get("team")
    if t:
        out["team"] = {"id": t.get("id"), "displayName": t.get("displayName") or t.get("name")}
    a = c.get("athlete")
    if a:
        out["athlete"] = {"displayName": a.get("displayName"), "fullName": a.get("fullName")}
    return out


def slim_comp(c):
    out = {"id": c.get("id"), "date": c.get("date") or c.get("startDate"),
           "neutralSite": c.get("neutralSite"), "status": slim_status(c.get("status")),
           "competitors": [slim_competitor(x) for x in c.get("competitors") or []]}
    if c.get("odds"):
        out["odds"] = [strip_odds(o) if o else None for o in c["odds"]]
    return out


def slim_event(e):
    out = {"id": e.get("id"), "date": e.get("date"), "status": slim_status(e.get("status"))}
    if (e.get("season") or {}).get("type") is not None:
        out["season"] = {"type": e["season"]["type"]}   # 1 = pretemporada
    if e.get("groupings"):
        out["groupings"] = [{"grouping": {"displayName": (g.get("grouping") or {}).get("displayName")},
                             "competitions": [slim_comp(c) for c in g.get("competitions") or []]}
                            for g in e["groupings"]]
    else:
        out["competitions"] = [slim_comp(c) for c in e.get("competitions") or []]
    return out


def cache_path(lid, key):
    return os.path.join(RAW_DIR, "%s__%s.json.gz" % (lid.replace("/", "_"), key))


def load_cache(path):
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_cache(path, obj):
    os.makedirs(RAW_DIR, exist_ok=True)
    tmp = path + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    os.replace(tmp, path)


def period_bounds(key):
    """'2025' | '202510' | '20251018' -> (inicio, fin) como fechas (fin inclusive)."""
    if len(key) == 4:
        y = int(key)
        return dt.date(y, 1, 1), dt.date(y, 12, 31)
    if len(key) == 6:
        y, m = int(key[:4]), int(key[4:])
        nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
        return dt.date(y, m, 1), nxt - dt.timedelta(days=1)
    d = dt.date(int(key[:4]), int(key[4:6]), int(key[6:]))
    return d, d


def fresh(entry, key, now):
    if not entry or "t" not in entry:
        return False
    fetched = dt.datetime.fromtimestamp(entry["t"], dt.timezone.utc)
    _, end = period_bounds(key)
    age = (now - fetched).total_seconds()
    err = entry.get("err")
    if err:  # un 4xx es definitivo (slug inexistente); un fallo transitorio (0/5xx) se reintenta pronto
        return age < (ERR_TTL if str(err).startswith("HTTP 4") else 300)
    settled = fetched.date() > end + dt.timedelta(days=SETTLE_DAYS)
    return settled or age < TTL_LIVE


class LeagueFetcher:
    def __init__(self, net, now):
        self.net, self.now = net, now

    def request(self, lid, key):
        """-> dict {'t','events':[slim], 'err'?} usando cache. Puede lanzar RuntimeError (presupuesto)."""
        path = cache_path(lid, key)
        prev = load_cache(path)                       # lo que ya teníamos (también con --refresh)
        ent = None if self.net.refresh else prev
        if fresh(ent, key, self.now):
            return ent
        url = "%s/%s/scoreboard?dates=%s&limit=%d" % (BASE, lid, key, LIMIT)
        code, js = self.net.get(url)
        if code == 200 and isinstance(js, dict) and "events" in js:
            ent = {"t": time.time(), "events": [slim_event(e) for e in js["events"]]}
        elif prev and not prev.get("err") and prev.get("events"):
            # fallo transitorio: NUNCA se pisa una caché buena con un error; se usa lo anterior y se cuenta el aviso
            self.net.stale_used = getattr(self.net, "stale_used", 0) + 1
            return prev
        else:
            ent = {"t": time.time(), "events": [], "err": "HTTP %s" % code}
        save_cache(path, ent)
        return ent

    def events_for_period(self, lid, key, stats):
        """Trocea ano -> mes -> dia si la respuesta llega al limite (truncada)."""
        ent = self.request(lid, key)
        if ent.get("err"):
            stats["errors"].append((key, ent["err"]))
            return []
        evs = ent["events"]
        if len(evs) < LIMIT or len(key) == 8:
            if len(evs) >= LIMIT:
                stats["truncated"].append(key)
            return evs
        out = []
        start, end = period_bounds(key)
        if len(key) == 4:
            subs = ["%s%02d" % (key, m) for m in range(1, 13)]
        else:
            subs = [(start + dt.timedelta(days=i)).strftime("%Y%m%d")
                    for i in range((end - start).days + 1)]
        for s in subs:
            out += self.events_for_period(lid, s, stats)
        return out


def month_keys(first, last):
    y, m = first.year, first.month
    keys = []
    while (y, m) <= (last.year, last.month):
        keys.append("%04d%02d" % (y, m))
        y, m = y + (m == 12), m % 12 + 1
    return keys


def add_months(d, n):
    m = d.month - 1 - n
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30,
                      31, 31, 30, 31, 30, 31][m - 1])
    return dt.date(y, m, day)


def league_periods(lid, sport, today, months, tennis_months, days):
    n = MONTHS_OVERRIDE.get(lid, tennis_months if sport in MONTH_MODE_SPORTS else (max(months, SOCCER_MONTHS) if sport == "soccer" else months))
    first = add_months(today, n)
    last = today + dt.timedelta(days=days)
    if lid in MONTH_MODE or sport in MONTH_MODE_SPORTS:
        return month_keys(first, last), first
    return [str(y) for y in range(first.year, last.year + 1)], first


def process_league(lf, lid, today, now, window_end, months, tennis_months, days):
    sport = lid.split("/")[0]
    periods, first = league_periods(lid, sport, today, months, tennis_months, days)
    stats = {"errors": [], "truncated": []}
    events, results, seen = [], [], set()
    for i, key in enumerate(periods):
        raw = lf.events_for_period(lid, key, stats)
        if i == 0 and stats["errors"] and stats["errors"][0][1].startswith("HTTP 4"):
            break                      # slug inexistente: no gastar mas peticiones
        for ev in raw:
            for kind, rec in parse_event(ev, lid, sport, now, window_end):
                k = (kind, rec["id"])
                if k in seen:
                    continue
                seen.add(k)
                if kind == "event":
                    events.append(rec)
                elif rec["d"] >= first.isoformat() and rec["d"] <= today.isoformat():
                    results.append(rec)
    return {"events": events, "results": results, "stats": stats}


def build(args):
    now = utcnow()
    today = dt.date.fromisoformat(args.today) if args.today else now.date()
    window_end = dt.datetime.combine(today + dt.timedelta(days=args.days + 1), dt.time(0),
                                     tzinfo=dt.timezone.utc)
    net = Net(args.max_requests, args.refresh)
    lf = LeagueFetcher(net, now)
    wanted = [x.strip() for x in args.leagues.split(",")] if args.leagues else None
    catalog = [c for c in CATALOG if not wanted or c[0] in wanted]
    for w in wanted or []:
        if w not in CATALOG_META:
            catalog.append((w, w, "WW"))
    leagues, events, results, discarded, per = [], [], [], [], {}
    for lid, name, country in catalog:
        try:
            r = process_league(lf, lid, today, now, window_end, args.months, args.tennis_months,
                               args.days)
        except RuntimeError as e:
            discarded.append((lid, str(e)))
            continue
        nres, nev = len(r["results"]), len(r["events"])
        per[lid] = {"results": nres, "upcoming": nev,
                    "upcoming_with_odds": sum(1 for e in r["events"] if e["odds"]),
                    "truncated": r["stats"]["truncated"], "errors": r["stats"]["errors"][:3]}
        if nres == 0:
            why = "error API: %s" % r["stats"]["errors"][0][1] if r["stats"]["errors"] else \
                "0 resultados históricos"
            discarded.append((lid, why))
            print("  descartada %-45s %s" % (lid, why), file=sys.stderr)
            continue
        sport = lid.split("/")[0]
        has_draw = sport == "soccer" or sport.startswith("rugby") or any(
            x["w"] == "d" for x in r["results"])
        leagues.append({"id": lid, "sport": sport, "sportName": SPORT_NAMES.get(sport, sport),
                        "name": name, "country": country, "draw": bool(has_draw)})
        for e in r["events"]:
            e.pop("ko_d", None)
            events.append(e)
        for x in r["results"]:
            x.pop("id", None)
            x.pop("ko", None)
            results.append(x)
        print("  %-45s resultados %5d  próximos %3d  req %d" % (lid, nres, nev, net.n),
              file=sys.stderr)
    # El feed ATP trae también partidos WTA y viceversa: se unifica en una sola liga de tenis y se deduplica
    if any(l["id"] == "tennis/wta" for l in leagues) and any(l["id"] == "tennis/atp" for l in leagues):
        leagues = [l for l in leagues if l["id"] != "tennis/wta"]
        for l in leagues:
            if l["id"] == "tennis/atp":
                l["name"] = "Tenis (ATP + WTA)"
        seen_r, seen_e, res2, ev2 = set(), set(), [], []
        for x in results:
            if x["lg"] == "tennis/wta":
                x["lg"] = "tennis/atp"
            if x["lg"] == "tennis/atp":
                k = (x["d"], x["h"], x["a"])
                if k in seen_r:
                    continue
                seen_r.add(k)
            res2.append(x)
        for e in events:
            if e["lg"] == "tennis/wta":
                e["lg"] = "tennis/atp"
            if e["lg"] == "tennis/atp":
                if e["id"] in seen_e:
                    continue
                seen_e.add(e["id"])
            ev2.append(e)
        results, events = res2, ev2
    events.sort(key=lambda e: (e["ko"], e["lg"], e["id"]))
    results.sort(key=lambda r: (r["d"], r["lg"], r["h"], r["a"]))
    doc = {"generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "espn",
           "leagues": leagues, "events": events, "results": results}
    return doc, {"requests": net.n, "budget_exhausted": net.exhausted, "per_league": per,
                 "discarded": discarded}


def write_atomic(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def pack(doc):
    """Formato compacto para la web (~45 % menos): ligas y equipos en tablas, resultados como listas.
    r = [liga, fecha, local, visita, hs|-1, as|-1, ganador, banderas(1 neutral, 2 prórroga, 4 pretemporada)]"""
    lgs = [l["id"] for l in doc["leagues"]]
    li = {l: i for i, l in enumerate(lgs)}
    teams, ti = [], {}
    def t(n):
        if n not in ti:
            ti[n] = len(teams)
            teams.append(n)
        return ti[n]
    rs = []
    for r in doc["results"]:
        fl = (1 if r.get("neutral") else 0) | (2 if r.get("ot") else 0) | (4 if r.get("pre") else 0)
        rs.append([li[r["lg"]], r["d"], t(r["h"]), t(r["a"]), -1 if r.get("hs") is None else r["hs"],
                   -1 if r.get("as") is None else r["as"], r["w"], fl])
    return {"generated": doc["generated"], "source": doc["source"], "leagues": doc["leagues"], "events": doc["events"],
            "teams": teams, "results": rs}


def write_outputs(doc, report):
    os.makedirs(DATA_DIR, exist_ok=True)
    js = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    write_atomic(os.path.join(DATA_DIR, "multi.json"), js)
    write_atomic(os.path.join(DATA_DIR, "multi.js"), "window.AURUM_MULTI_PACKED = " + json.dumps(pack(doc), ensure_ascii=False, separators=(",", ":")) + ";\n")
    os.makedirs(RAW_DIR, exist_ok=True)
    write_atomic(os.path.join(RAW_DIR, "_report.json"),
                 json.dumps(report, ensure_ascii=False, indent=1, default=str))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--leagues", default="", help="lista separada por comas (p. ej. soccer/per.1)")
    ap.add_argument("--months", type=int, default=24)
    ap.add_argument("--tennis-months", type=int, default=9)
    ap.add_argument("--days", type=int, default=8)
    ap.add_argument("--refresh", action="store_true", help="ignora la cache")
    ap.add_argument("--max-requests", type=int, default=900)
    ap.add_argument("--today", default="", help="YYYY-MM-DD (pruebas)")
    args = ap.parse_args(argv)
    doc, report = build(args)
    old = os.path.join(DATA_DIR, "multi.json")
    if os.path.exists(old):                                  # protección: no pisar datos buenos con una descarga rota
        try:
            with open(old, encoding="utf-8") as f:
                n_old = len(json.load(f).get("results", []))
        except (OSError, ValueError):
            n_old = 0
        if n_old and len(doc["results"]) < 0.8 * n_old:
            print("ERROR: la descarga trajo %d resultados frente a %d guardados (<80 %%); no se sobrescribe. "
                  "Revisa la red y reintenta." % (len(doc["results"]), n_old), file=sys.stderr)
            return 3
    write_outputs(doc, report)
    print("ligas %d | resultados %d | eventos próximos %d (con cuotas %d) | peticiones %d"
          % (len(doc["leagues"]), len(doc["results"]), len(doc["events"]),
             sum(1 for e in doc["events"] if e["odds"]), report["requests"]))
    if report.get("budget_exhausted"):
        print("AVISO: se agotó el presupuesto de peticiones; los datos pueden estar incompletos.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
