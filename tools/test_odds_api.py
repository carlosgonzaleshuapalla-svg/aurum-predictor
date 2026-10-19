"""Pruebas de fetch_odds_api (sin red ni clave). Uso: python3 tools/test_odds_api.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_odds_api as oa  # noqa: E402

# HERMETICIDAD: estas pruebas NUNCA deben usar la clave real del usuario ni salir a la red (gastarían sus créditos).
_REAL_KEY_FILE = oa.KEY_FILE
oa.KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".no_existe_clave_de_pruebas")
os.environ.pop("ODDS_API_KEY", None)


def _no_network(*a, **k):
    raise AssertionError("las pruebas no deben usar la red ni una clave real")


oa.Client = _no_network

EV = {"id": "e1", "commence_time": "2026-10-24T19:00:00Z", "home_team": "Sporting Cristal", "away_team": "Alianza Lima",
      "bookmakers": [
          {"key": "betsson", "title": "Betsson", "markets": [{"key": "h2h", "outcomes": [
              {"name": "Sporting Cristal", "price": 2.1}, {"name": "Alianza Lima", "price": 3.4}, {"name": "Draw", "price": 3.2}]}]},
          {"key": "coolbet", "title": "Coolbet", "markets": [{"key": "h2h", "outcomes": [
              {"name": "Alianza Lima", "price": 3.5}, {"name": "Sporting Cristal", "price": 2.05}, {"name": "Draw", "price": 3.1}]}]},
          {"key": "malo", "title": "Roto", "markets": [{"key": "h2h", "outcomes": [
              {"name": "Sporting Cristal", "price": 0.9}, {"name": "Alianza Lima", "price": 3.5}]}]},
          {"key": "totales", "title": "SoloTotales", "markets": [{"key": "totals", "outcomes": []}]},
          {"key": "betsson", "title": "Betsson", "markets": [{"key": "h2h", "outcomes": [
              {"name": "Sporting Cristal", "price": 9.0}, {"name": "Alianza Lima", "price": 9.0}, {"name": "Draw", "price": 9.0}]}]}]}


class ParseTests(unittest.TestCase):
    def test_parse_orders_outcomes_and_filters(self):
        p = oa.parse_event(EV, "Soccer")
        self.assertEqual(p["sport"], "soccer")
        self.assertEqual(p["books"]["Betsson"]["ml"], [2.1, 3.2, 3.4], "orden local, empate, visita")
        self.assertEqual(p["books"]["Coolbet"]["ml"], [2.05, 3.1, 3.5], "sin importar el orden de la fuente")
        self.assertNotIn("Roto", p["books"], "cuota <= 1 se descarta")
        self.assertNotIn("SoloTotales", p["books"])
        self.assertEqual(p["books"]["Betsson"]["ml"][0], 2.1, "casa repetida: se queda con la primera")

    def test_two_way_sport_has_no_draw(self):
        ev = {"id": "n", "commence_time": "x", "home_team": "A", "away_team": "B", "bookmakers": [
            {"key": "k", "title": "K", "markets": [{"key": "h2h", "outcomes": [{"name": "A", "price": 1.5}, {"name": "B", "price": 2.6}]}]}]}
        self.assertEqual(oa.parse_event(ev, "Basketball")["books"]["K"]["ml"], [1.5, None, 2.6])

    def test_event_without_books_is_none(self):
        self.assertIsNone(oa.parse_event({"home_team": "A", "away_team": "B", "bookmakers": []}, "Soccer"))
        self.assertIsNone(oa.parse_event({"bookmakers": []}, "Soccer"))


class SelectionTests(unittest.TestCase):
    def test_pick_sports_priority_and_filters(self):
        sp = [{"key": "soccer_epl", "group": "Soccer", "active": True}, {"key": "mma_mixed_martial_arts", "group": "Mixed Martial Arts", "active": True},
              {"key": "soccer_brazil_campeonato", "group": "Soccer", "active": True}, {"key": "soccer_fifa_world_cup_winner", "group": "Soccer", "active": True, "has_outrights": True},
              {"key": "basketball_nba", "group": "Basketball", "active": True}, {"key": "golf_masters", "group": "Golf", "active": True},
              {"key": "soccer_old", "group": "Soccer", "active": False}]
        keys = [s["key"] for s in oa.pick_sports(sp, 10)]
        self.assertEqual(keys, ["mma_mixed_martial_arts", "basketball_nba", "soccer_brazil_campeonato", "soccer_epl"])
        self.assertEqual(len(oa.pick_sports(sp, 2)), 2)


import datetime as _dt

_NOW = _dt.datetime(2026, 10, 18, 12, 0, tzinfo=_dt.timezone.utc)
_SOON = (_NOW + _dt.timedelta(hours=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
_LATER = (_NOW + _dt.timedelta(days=9)).strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeClient:
    """Simula la API: /events (gratis) y /odds (gasta 1 crédito por región)."""

    def __init__(self, remaining, calendar=None):
        self.remaining, self.used, self.calls = remaining, 0, []
        self.calendar = calendar or {"basketball_nba": _SOON, "mma_mixed_martial_arts": _SOON, "soccer_epl": _LATER}

    def get(self, path, params):
        self.calls.append(path)
        if path == "sports/":
            return [{"key": "basketball_nba", "group": "Basketball", "active": True}, {"key": "mma_mixed_martial_arts", "group": "Mixed Martial Arts", "active": True},
                    {"key": "soccer_epl", "group": "Soccer", "active": True}, {"key": "soccer_brazil_campeonato", "group": "Soccer", "active": True}]
        key = path.split("/")[1]
        if path.endswith("/events/"):
            return [{"id": "x", "commence_time": self.calendar[key]}] if key in self.calendar else []
        self.remaining = str(int(self.remaining) - len([r for r in params["regions"].split(",") if r]))
        return [{"id": path, "commence_time": _SOON, "home_team": "A", "away_team": "B", "bookmakers": [
            {"key": "k", "title": "K", "markets": [{"key": "h2h", "outcomes": [{"name": "A", "price": 1.5}, {"name": "B", "price": 2.6}]}]}]}]


class RunTests(unittest.TestCase):
    def go(self, client, credits=5, regions="eu", reserve=20, hours=36):
        return oa.run(client, credits, regions, reserve, hours, log=lambda *_: None, now=_NOW)

    def odds_calls(self, c):
        return [x for x in c.calls if x.endswith("/odds/")]

    def test_only_leagues_with_upcoming_matches_cost_credits(self):
        c = FakeClient("400")
        ev, skipped = self.go(c)
        self.assertEqual(len(ev), 2, "NBA y MMA tienen partido en <36 h; EPL (en 9 días) y Brasil (sin partidos) no")
        self.assertEqual(len(self.odds_calls(c)), 2)
        self.assertEqual(sorted(e["lg"] for e in ev), ["basketball_nba", "mma_mixed_martial_arts"])

    def test_credit_cap_per_run(self):
        c = FakeClient("400")
        ev, _ = self.go(c, credits=1)
        self.assertEqual(len(self.odds_calls(c)), 1, "con 1 crédito y 1 región: solo una liga (la de mayor prioridad: MMA)")
        self.assertEqual(ev[0]["lg"], "mma_mixed_martial_arts")
        c2 = FakeClient("400")
        self.go(c2, credits=4, regions="eu,uk")
        self.assertEqual(len(self.odds_calls(c2)), 2, "2 regiones = 2 créditos por liga")

    def test_events_endpoint_is_free_and_used(self):
        c = FakeClient("400")
        self.go(c)
        self.assertTrue(any(x.endswith("/events/") for x in c.calls))
        self.assertEqual(c.remaining, "398", "solo se gastaron los 2 créditos de las cuotas")

    def test_run_stops_at_reserve(self):
        c = FakeClient("20")                           # ya en la reserva: no gasta nada
        ev, skipped = self.go(c)
        self.assertEqual(ev, [])
        self.assertTrue(skipped)
        self.assertEqual(self.odds_calls(c), [])

    def test_calendar_failure_falls_back_to_query(self):
        class Boom(FakeClient):
            def get(self, path, params):
                if path.endswith("/events/"):
                    raise RuntimeError("HTTP 500")
                return super().get(path, params)
        ev, _ = self.go(Boom("400"), credits=2)
        self.assertEqual(len(ev), 2, "si /events falla, se consulta igual (respetando el tope)")

    def test_no_key_is_a_noop(self):
        self.assertFalse(os.path.exists(oa.KEY_FILE), "la clave real no debe verse desde las pruebas")
        self.assertEqual(oa.load_key(), "")
        self.assertEqual(oa.main([]), 0)          # sin clave: no llama a Client (que aquí lanzaría un error)

    def test_tests_do_not_point_at_real_key_file(self):
        self.assertNotEqual(oa.KEY_FILE, _REAL_KEY_FILE)

    def test_load_key_priority(self):
        import tempfile
        old_env, old_file = os.environ.pop("ODDS_API_KEY", None), oa.KEY_FILE
        with tempfile.TemporaryDirectory() as d:
            oa.KEY_FILE = os.path.join(d, ".odds_api_key")
            try:
                self.assertEqual(oa.load_key(), "")
                with open(oa.KEY_FILE, "w") as f:
                    f.write("DELARCHIVO\n")
                self.assertEqual(oa.load_key(), "DELARCHIVO")
                os.environ["ODDS_API_KEY"] = "DELENTORNO"
                self.assertEqual(oa.load_key(), "DELENTORNO")
                self.assertEqual(oa.load_key("DELACLI"), "DELACLI")
            finally:
                oa.KEY_FILE = old_file
                os.environ.pop("ODDS_API_KEY", None)
                if old_env is not None:
                    os.environ["ODDS_API_KEY"] = old_env

    def test_mask_hides_key(self):
        self.assertNotIn("SECRETO", oa.mask("fallo https://x?apiKey=SECRETO", "SECRETO"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
