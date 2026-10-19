#!/usr/bin/env python3
"""Aurum Predictor - cuotas de casas con licencia en Perú (Betsson, Coolbet, 1xBet, Betano...) vía The Odds API.

Uso:  ODDS_API_KEY=tu_clave python3 tools/fetch_odds_api.py [--max-credits 5] [--regions eu] [--hours 36] [--reserve 20]

- Clave GRATIS en https://the-odds-api.com. Las consultas de calendario (/sports y /events) NO gastan créditos; las de cuotas gastan
  (mercados × regiones) por deporte. Por eso primero se mira qué ligas tienen partidos en las próximas --hours horas y solo se
  piden cuotas de esas, por orden de prioridad, hasta --max-credits créditos por corrida.
- Plan gratis (500/mes) con una actualización cada 8 h (≈90 al mes): 5 créditos por corrida = 450 al mes.
- La clave se toma de --key, de ODDS_API_KEY o de la casilla de la web (se guarda en tools/.odds_api_key, solo legible por tu usuario).
- Sin clave: no hace nada y sale con código 0 (es opcional).
- Escribe data/odds_api.json y data/odds_api.js (window.AURUM_ODDSAPI) de forma atómica. La clave nunca se imprime ni se guarda.
- Respeta tu cuota: se detiene al quedar menos de --reserve créditos.
- Aviso: las cuotas son las de la versión internacional de cada casa; pueden diferir de las de su sitio en Perú.
"""
import argparse
import datetime as dt
import time
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_data as fd  # noqa: E402  (reutiliza ssl_context, atomic_write, write_pair)

BASE = "https://api.the-odds-api.com/v4"
UA = "AurumPredictor/1.0 (+uso personal)"
GROUPS = {"Soccer": "soccer", "Basketball": "basketball", "Baseball": "baseball", "American Football": "football",
          "Ice Hockey": "hockey", "Mixed Martial Arts": "mma", "Tennis": "tennis"}
# Prioridad de consulta (menor = antes). Se prefieren las ligas que interesan en Perú.
SA_HINTS = ("conmebol", "brazil", "argentina", "mexico", "chile", "colombia", "peru", "uruguay", "usa_mls", "libertadores")


KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".odds_api_key")


def load_key(cli_key=None):
    """Orden: --key, variable ODDS_API_KEY, archivo oculto que guarda la web (tools/.odds_api_key)."""
    if cli_key:
        return cli_key
    if os.environ.get("ODDS_API_KEY"):
        return os.environ["ODDS_API_KEY"]
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def mask(msg, key):
    return str(msg).replace(key, "***") if key else str(msg)


def priority(sp):
    k, g = sp["key"], sp.get("group", "")
    if g == "Mixed Martial Arts":
        return 0
    if k in ("basketball_nba",):
        return 1
    if k in ("baseball_mlb", "americanfootball_nfl", "icehockey_nhl"):
        return 2
    if g == "Soccer" and any(h in k for h in SA_HINTS):
        return 3
    if g == "Soccer" and ("uefa" in k or "epl" in k or "spain_la_liga" in k):
        return 4
    if g == "Soccer":
        return 5
    if g == "Tennis":
        return 6
    return 7


def pick_sports(sports, limit):
    ok = [s for s in sports if s.get("active") and not s.get("has_outrights") and s.get("group") in GROUPS]
    ok.sort(key=lambda s: (priority(s), s["key"]))
    return ok[:limit]


def parse_event(ev, group):
    """Evento de The Odds API -> {'id','sport','ko','h','a','books':{titulo:{'ml':[local, empate|None, visita]}}} o None."""
    h, a = ev.get("home_team"), ev.get("away_team")
    if not h or not a:
        return None
    books = {}
    for bm in ev.get("bookmakers") or []:
        title = bm.get("title") or bm.get("key")
        for mk in bm.get("markets") or []:
            if mk.get("key") != "h2h":
                continue
            price = {o.get("name"): o.get("price") for o in mk.get("outcomes") or []}
            ph, pa, pd = price.get(h), price.get(a), price.get("Draw")
            if not all(isinstance(x, (int, float)) and x > 1 for x in (ph, pa)) or (pd is not None and not pd > 1):
                continue
            if title not in books:                      # misma casa en varias regiones: se queda con la primera
                books[title] = {"ml": [round(ph, 3), None if pd is None else round(pd, 3), round(pa, 3)]}
    if not books:
        return None
    return {"id": ev.get("id"), "sport": GROUPS.get(group, group), "ko": ev.get("commence_time"), "h": h, "a": a, "books": books}


class Client:
    def __init__(self, key, log=print):
        self.key, self.log, self.remaining, self.used = key, log, None, None
        self.ctx = fd.ssl_context()

    def get(self, path, params):
        q = urllib.parse.urlencode(dict(params, apiKey=self.key))
        req = urllib.request.Request("%s/%s?%s" % (BASE, path, q), headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30, context=self.ctx) as r:
                self.remaining = r.headers.get("x-requests-remaining", self.remaining)
                self.used = r.headers.get("x-requests-used", self.used)
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError("HTTP %s en %s" % (e.code, path)) from None   # sin la URL (lleva la clave)
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(mask(e, self.key)) from None


def parse_iso(t):
    try:
        return dt.datetime.fromisoformat(str(t).replace("Z", "+00:00"))
    except ValueError:
        return None


def run(client, max_credits, regions, reserve, hours=36, log=print, now=None):
    """Elige ligas con partidos próximos (consulta gratuita) y pide cuotas solo de esas, sin pasar de max_credits."""
    now = now or dt.datetime.now(dt.timezone.utc)
    cost = max(1, len([r for r in regions.split(",") if r]))        # créditos por deporte (mercado h2h × regiones)
    sports = client.get("sports/", {})
    candidates = pick_sports(sports, 80)
    soon = []
    for sp in candidates:
        try:
            evs = client.get("sports/%s/events/" % sp["key"], {"dateFormat": "iso"})   # gratis
        except RuntimeError as e:
            log("  %-45s calendario no disponible (%s): se consultará igual" % (sp["key"], e))
            evs = None
        if evs is None:
            n = 1
        else:
            end = now + dt.timedelta(hours=hours)
            n = sum(1 for ev in evs if (parse_iso(ev.get("commence_time")) or now) >= now and (parse_iso(ev.get("commence_time")) or end) <= end)
        if n:
            soon.append((priority(sp), -n, sp))
        time.sleep(0.05)
    soon.sort(key=lambda x: (x[0], x[1], x[2]["key"]))
    chosen = [sp for _, _, sp in soon][: max(0, max_credits // cost)]
    log("Ligas con partidos en las próximas %dh: %d; se consultan %d (%d créditos por liga, tope %d)." % (hours, len(soon), len(chosen), cost, max_credits))
    events, skipped = [], []
    for sp in chosen:
        if client.remaining is not None and int(float(client.remaining)) - cost < reserve:
            skipped.append(sp["key"])
            continue
        try:
            data = client.get("sports/%s/odds/" % sp["key"], {"regions": regions, "markets": "h2h", "oddsFormat": "decimal", "dateFormat": "iso"})
        except RuntimeError as e:
            log("  %-45s error: %s" % (sp["key"], e))
            continue
        n = 0
        for ev in data if isinstance(data, list) else []:
            p = parse_event(ev, sp.get("group"))
            if p:
                p["lg"] = sp["key"]
                events.append(p)
                n += 1
        log("  %-45s eventos con cuotas %3d   créditos restantes %s" % (sp["key"], n, client.remaining))
    return events, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", default=None, help="clave (o env ODDS_API_KEY)")
    ap.add_argument("--max-credits", type=int, default=int(os.environ.get("ODDS_API_MAX_CREDITS") or 5), help="créditos máximos por corrida (env ODDS_API_MAX_CREDITS)")
    ap.add_argument("--hours", type=int, default=36, help="solo ligas con partidos dentro de estas horas")
    ap.add_argument("--regions", default="eu")
    ap.add_argument("--reserve", type=int, default=20, help="créditos que se dejan sin gastar")
    args = ap.parse_args(argv)
    key = load_key(args.key)
    if not key:
        print("The Odds API: omitido (sin clave: pégala en «Actualizar datos» de la web; gratis en https://the-odds-api.com). Las casas peruanas se pueden añadir a mano en cada evento.")
        return 0
    client = Client(key)
    try:
        events, skipped = run(client, args.max_credits, args.regions, args.reserve, args.hours)
    except RuntimeError as e:
        print("ERROR The Odds API: %s" % mask(e, key), file=sys.stderr)
        return 1
    doc = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "the-odds-api", "regions": args.regions, "events": events}
    fd.write_pair("odds_api", "AURUM_ODDSAPI", doc)
    houses = sorted({b for e in events for b in e["books"]})
    print("Proyección: a 3 corridas al día ≈ %d créditos/mes (tu plan gratis trae 500; el panel de The Odds API muestra tu consumo real)." % (min(args.max_credits, len(events) * 0 + args.max_credits) * 90))
    print("The Odds API: %d eventos, %d casas (%s). Créditos usados %s, restantes %s.%s" % (
        len(events), len(houses), ", ".join(houses[:12]) + ("…" if len(houses) > 12 else ""), client.used, client.remaining,
        (" Omitidos por reserva: %d." % len(skipped)) if skipped else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
