#!/usr/bin/env python3
"""Aurum Predictor - jugadores y mapas de tiros desde el resumen de partido de ESPN (API publica no oficial).

Para cada partido de futbol proximo (siguientes --days dias) baja el resumen de los ultimos --matches partidos
terminados de CADA equipo y guarda solo lo util y compacto:
  - plantilla de ese partido (titular / suplente que entro / tiros / a puerta / goles / asistencias)
  - cada tiro con su posicion real en el campo (x, y de 0 a 100, siempre en el sentido de ataque del que dispara),
    quien lo tirio, el minuto, si fue de cabeza o penal, y su xG (calculado aqui con un modelo de distancia y angulo
    AJUSTADO a los propios tiros descargados).
Salida: data/players.json y data/players.js (window.AURUM_PLAYERS). La cache data/raw_players/ no caduca
(un partido terminado no cambia). Solo libreria estandar.

Uso: python3 tools/fetch_players.py [--days 3] [--matches 6] [--max-requests 350] [--today YYYY-MM-DD]
No inventa nada: si ESPN no trae posiciones de tiros para una liga (p. ej. ligas menores), ese equipo queda sin mapa.
"""
import argparse
import datetime as dt
import gzip
import json
import math
import os
import re
import sys
import threading
import time
import concurrent.futures

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_espn as fe  # noqa: E402

ROOT = fe.ROOT
DATA_DIR = fe.DATA_DIR
RAW_ESPN = fe.RAW_DIR
RAW = os.path.join(DATA_DIR, "raw_players")
CACHE_V = 2
LOOKBACK_DAYS = 150

# Coeficientes por defecto del xG (se usan si hay pocos tiros para ajustar): [const, distancia(m), angulo(rad)]
# (la marca de «de cabeza» se descartó: el texto de ESPN para los goles no la trae de forma fiable y filtraba el resultado)
XG_DEFAULT = [-2.2, -0.05, 1.9]
PEN_XG = 0.76


# ------------------------------------------------------------------ extraccion
KIND = {"shot-on-target": "t", "shot-off-target": "o", "shot-blocked": "b", "shot-hit-woodwork": "w", "goal": "g"}


def shooter_of(text):
    t = re.sub(r"^Goal!.*?\d\.\s+", "", text or "")
    t = re.sub(r"^(Attempt \w+|Penalty[^.]*)\.\s+", "", t)
    m = re.match(r"([^()]+?) \(([^)]+)\)", t)
    return (m.group(1).strip(), m.group(2).strip()) if m else (None, None)


def minute_of(play):
    s = ((play.get("clock") or {}).get("displayValue") or "")
    m = re.match(r"(\d+)(?:\+(\d+))?", s)
    return int(m.group(1)) + (int(m.group(2)) if m.group(2) else 0) if m else None


def extract(summ, lg, evid, date):
    """-> dict compacto o None si la respuesta no sirve."""
    ros = summ.get("rosters") or []
    if len(ros) < 2:
        return None
    teams = []
    for r in ros:
        name = (r.get("team") or {}).get("displayName")
        pl = []
        for x in r.get("roster") or []:
            ath = x.get("athlete") or {}
            st = {s.get("name"): s.get("value") for s in (x.get("stats") or [])}
            started, sin = bool(x.get("starter")), bool(x.get("subbedIn"))
            if not started and not sin:
                continue                                                   # no jugo
            pl.append([ath.get("displayName"), (x.get("position") or {}).get("abbreviation") or "",
                       1 if started else 2, int(st.get("totalShots") or 0), int(st.get("shotsOnTarget") or 0),
                       int(st.get("totalGoals") or 0), int(st.get("goalAssists") or 0)])
        teams.append({"n": name, "ha": r.get("homeAway"), "pl": pl, "sh": []})
    by = {t["n"]: t for t in teams}
    score = {}
    for c in ((summ.get("header") or {}).get("competitions") or [{}])[0].get("competitors") or []:
        score[(c.get("team") or {}).get("displayName")] = c.get("score")
    for c in summ.get("commentary") or []:
        p = c.get("play") or {}
        ty = (p.get("type") or {}).get("type") or ""
        pen = ty.startswith("penalty")
        if ty in KIND:
            k = KIND[ty]
        elif ty == "penalty---scored":
            k = "g"
        elif ty in ("penalty---saved",):
            k = "t"
        elif ty in ("penalty---missed",):
            k = "o"
        else:
            continue
        if p.get("fieldPositionX") is None and not pen:
            continue
        team = (p.get("team") or {}).get("displayName")
        if team not in by:
            continue
        who, _wteam = shooter_of(p.get("text"))   # el equipo del texto a veces es abreviado (PSG, Inter...): se valida luego contra la plantilla
        x = p.get("fieldPositionX") if p.get("fieldPositionX") is not None else 88.5
        y = p.get("fieldPositionY") if p.get("fieldPositionY") is not None else 50.0
        by[team]["sh"].append([round(x, 1), round(y, 1), k, who, minute_of(p), 1 if "header" in (p.get("text") or "") else 0, 1 if pen else 0])
    n_loc = sum(len(t["sh"]) for t in teams)
    return {"v": CACHE_V, "id": evid, "lg": lg, "d": date, "teams": teams,
            "score": [score.get(t["n"]) for t in teams], "loc": n_loc}


# ------------------------------------------------------------------ xG
def geom(x, y):
    dx, dy = (100.0 - x) * 1.05, (y - 50.0) * 0.68
    d = math.hypot(dx, dy)
    ang = math.atan2(7.32 * dx, dx * dx + dy * dy - 3.66 ** 2)
    if ang < 0:
        ang += math.pi
    return d, ang


def feats(s):
    d, ang = geom(s[0], s[1])
    return [1.0, d, ang]


def xg_of(coef, s):
    if s[6]:
        return PEN_XG
    z = sum(c * f for c, f in zip(coef, feats(s)))
    return 1.0 / (1.0 + math.exp(-max(-30, min(30, z))))


def fit_xg(shots):
    """Regresion logistica (Newton con ridge) sobre tiros sin penales. Devuelve coeficientes o None si hay pocos."""
    X = [feats(s) for s in shots if not s[6]]
    y = [1.0 if s[2] == "g" else 0.0 for s in shots if not s[6]]
    if len(X) < 600 or sum(y) < 40:
        return None
    k = 3
    b = list(XG_DEFAULT)
    for _ in range(25):
        g = [0.0] * k
        H = [[0.0] * k for _ in range(k)]
        for xi, yi in zip(X, y):
            z = sum(b[j] * xi[j] for j in range(k))
            p = 1.0 / (1.0 + math.exp(-max(-30, min(30, z))))
            for j in range(k):
                g[j] += (yi - p) * xi[j]
                for l in range(k):
                    H[j][l] += p * (1 - p) * xi[j] * xi[l]
        for j in range(k):
            H[j][j] += 1e-6
        # resolver H d = g (eliminacion gaussiana)
        A = [H[j][:] + [g[j]] for j in range(k)]
        for i in range(k):
            piv = max(range(i, k), key=lambda r: abs(A[r][i]))
            A[i], A[piv] = A[piv], A[i]
            if abs(A[i][i]) < 1e-12:
                return None
            for r in range(i + 1, k):
                f = A[r][i] / A[i][i]
                for c in range(i, k + 1):
                    A[r][c] -= f * A[i][c]
        d = [0.0] * k
        for i in range(k - 1, -1, -1):
            d[i] = (A[i][k] - sum(A[i][c] * d[c] for c in range(i + 1, k))) / A[i][i]
        b = [b[j] + d[j] for j in range(k)]
        if max(abs(v) for v in d) < 1e-7:
            break
    return [round(v, 5) for v in b]


# ------------------------------------------------------------------ datos de entrada
def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def finished_by_team(today):
    """Partidos de futbol terminados desde las caches de ESPN: team -> [(fecha, slug, id)] (mas nuevo primero)."""
    out, seen = {}, set()
    lim = (today - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    for fn in sorted(os.listdir(RAW_ESPN)):
        if not (fn.startswith("soccer_") and fn.endswith(".json.gz")):
            continue
        slug = fn.split("__")[0][len("soccer_"):]
        d = fe.load_cache(os.path.join(RAW_ESPN, fn))
        for e in (d or {}).get("events") or []:
            st = ((e.get("status") or {}).get("type") or {})
            date = (e.get("date") or "")[:10]
            if not st.get("completed") or not date or date < lim or date > today.isoformat():
                continue
            if (e.get("season") or {}).get("type") == 1:
                pass                                                       # pretemporada: igual sirve para el jugador
            comp = (e.get("competitions") or [{}])[0]
            names = [((c.get("team") or {}).get("displayName")) for c in comp.get("competitors") or []]
            key = (slug, e.get("id"))
            if key in seen or len(names) != 2:
                continue
            seen.add(key)
            for n in names:
                if n:
                    out.setdefault(n, []).append((date, slug, e.get("id")))
    for n in out:
        out[n].sort(reverse=True)
    return out


def upcoming_teams(multi, today, days, only=()):
    end = (today + dt.timedelta(days=days)).isoformat()
    t0 = today.isoformat()
    res = []
    for e in sorted((multi or {}).get("events") or [], key=lambda x: x.get("ko") or ""):
        if not str(e.get("lg", "")).startswith("soccer/") or e.get("status") != "pre":
            continue
        d = (e.get("ko") or "")[:10]
        if only and e["lg"].split("/", 1)[1] not in only:
            continue
        if t0 <= d <= end:
            res.append(e)
    return res


def cache_file(evid):
    return os.path.join(RAW, "%s.json.gz" % evid)


def read_extract(evid):
    try:
        with gzip.open(cache_file(evid), "rt", encoding="utf-8") as f:
            d = json.load(f)
        return d if d.get("v") == CACHE_V else None
    except (OSError, ValueError):
        return None


def write_extract(evid, obj):
    os.makedirs(RAW, exist_ok=True)
    tmp = cache_file(evid) + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    os.replace(tmp, cache_file(evid))


# ------------------------------------------------------------------ construccion
def build(args):
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()
    multi = load_json(os.path.join(DATA_DIR, "multi.json"))
    evs = upcoming_teams(multi, today, args.days, tuple(x for x in args.leagues.split(",") if x))
    fin = finished_by_team(today)
    targets = []                                                             # equipos en orden de cercania del partido
    for e in evs:
        for t in (e["h"], e["a"]):
            if t not in targets:
                targets.append(t)
    net = fe.Net(args.max_requests)
    need, seen = [], set()
    for r in range(args.matches):                                          # ronda r = el r-esimo partido mas reciente de cada equipo
        for t in targets:
            lst = fin.get(t, [])
            if r < len(lst) and lst[r][2] not in seen:
                seen.add(lst[r][2])
                need.append(lst[r])
    got = miss = 0
    t_end = time.time() + args.max_minutes * 60
    todo = [m for m in need if read_extract(m[2]) is None]
    lock = threading.Lock()
    state = {"stop": False}

    def work(item):
        nonlocal got, miss
        date, slug, evid = item
        if state["stop"] or time.time() > t_end:
            state["stop"] = True
            return
        try:
            status, js = net.get("%s/soccer/%s/summary?event=%s" % (fe.BASE, slug, evid))
        except RuntimeError:
            state["stop"] = True
            return
        ex = extract(js, slug, evid, date) if status == 200 and js else None
        if ex is not None:
            write_extract(evid, ex)
            with lock:
                got += 1
        elif status in (200, 404):
            write_extract(evid, {"v": CACHE_V, "id": evid, "lg": slug, "d": date, "teams": [], "score": [], "loc": 0, "empty": 1})
            with lock:
                miss += 1
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex_:
        list(ex_.map(work, todo))
    if state["stop"]:
        print("AVISO: se alcanzó el tope de tiempo o de peticiones; el resto se completa en la próxima corrida.", file=sys.stderr)
    # todos los extractos disponibles de los equipos objetivo
    per_team, allshots = {}, []
    for t in targets:
        ms = []
        for date, slug, evid in fin.get(t, [])[: args.matches]:
            ex = read_extract(evid)
            if ex and ex.get("teams"):
                ms.append(ex)
        per_team[t] = ms
    for fn in os.listdir(RAW) if os.path.isdir(RAW) else []:                # todos los tiros descargados (aunque ya no sean objetivo) para ajustar el xG
        ex = read_extract(fn.split(".")[0])
        if ex:
            for tm in ex.get("teams") or []:
                allshots += tm["sh"]
    coef = fit_xg(allshots)
    fitted = coef is not None
    coef = coef or XG_DEFAULT
    gl = sum(1 for s in allshots if s[2] == "g" and not s[6])
    teams_out = {}
    for t, ms in per_team.items():
        if not ms:
            continue
        mrows, pidx, prow, own, ag = [], {}, [], [], []
        for mi, ex in enumerate(ms):                                         # mi = 0 el mas reciente
            tm = next((x for x in ex["teams"] if x["n"] == t), None)
            op = next((x for x in ex["teams"] if x["n"] != t), None)
            if tm is None or op is None:
                continue
            idx = len(mrows)
            sc = ex.get("score") or []
            gf = ga = None
            try:
                gf = int(sc[ex["teams"].index(tm)])
                ga = int(sc[ex["teams"].index(op)])
            except (TypeError, ValueError, IndexError):
                pass
            mrows.append([ex["d"], op["n"], gf, ga, 1 if tm["ha"] == "home" else 0, 1 if ex.get("loc", 0) >= 4 else 0])
            xgm = {}
            roster = {pl[0] for pl in tm["pl"]}
            for s in tm["sh"]:
                xg = xg_of(coef, s)
                if s[3] and s[3] not in roster:
                    s[3] = None
                if s[3]:
                    xgm[s[3]] = xgm.get(s[3], 0.0) + xg
                own.append([round(s[0]), round(s[1]), s[2], round(xg * 100), idx, s[6]])
            for s in op["sh"]:
                ag.append([round(s[0]), round(s[1]), s[2], round(xg_of(coef, s) * 100), idx, s[6]])
            for pl in tm["pl"]:
                nm = pl[0]
                if nm not in pidx:
                    pidx[nm] = len(prow)
                    prow.append([nm, pl[1], []])
                row = prow[pidx[nm]]
                if pl[1] and (not row[1] or (row[1] == "SUB" and pl[1] != "SUB")):
                    row[1] = pl[1]                                         # la posición más reciente que no sea «SUB» (banquillo)
                row[2].append([idx, pl[2], pl[3], pl[4], pl[5], round(xgm.get(nm, 0.0) * 100), pl[6]])
        if mrows:
            teams_out[t] = {"m": mrows, "p": prow, "s": own, "a": ag}
    doc = {"generated": fe.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "xg": {"coef": coef, "fitted": fitted, "shots": len(allshots), "goals": gl},
           "teams": teams_out}
    return doc, {"need": len(need), "descargados": got, "sin_datos": miss, "equipos": len(targets), "con_datos": len(teams_out), "peticiones": net.n}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--matches", type=int, default=6)
    ap.add_argument("--max-requests", type=int, default=350)
    ap.add_argument("--today", default="")
    ap.add_argument("--workers", type=int, default=3, help="descargas en paralelo (educado: 3)")
    ap.add_argument("--max-minutes", type=float, default=12, help="corta la descarga tras este tiempo (la caché guarda lo avanzado)")
    ap.add_argument("--leagues", default="", help="solo equipos de estas ligas (p. ej. eng.1,esp.1); por defecto todas")
    args = ap.parse_args(argv)
    doc, rep = build(args)
    js = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    fe.write_atomic(os.path.join(DATA_DIR, "players.json"), js)
    fe.write_atomic(os.path.join(DATA_DIR, "players.js"), "window.AURUM_PLAYERS = " + js + ";\n")
    print("equipos con datos %(con_datos)d de %(equipos)d | partidos pedidos %(need)d (descargados %(descargados)d, sin datos %(sin_datos)d) | peticiones %(peticiones)d" % rep)
    print("xG: %s | %d tiros, %d goles" % ("ajustado" if doc["xg"]["fitted"] else "coeficientes por defecto", doc["xg"]["shots"], doc["xg"]["goals"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
