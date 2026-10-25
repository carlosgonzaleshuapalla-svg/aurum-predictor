#!/usr/bin/env python3
"""Pruebas sin red de tools/fetch_espn.py (unittest, JSON de muestra embebido)."""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_espn as fe  # noqa: E402

NOW = dt.datetime(2026, 10, 18, 12, 0, tzinfo=dt.timezone.utc)
WIN_END = dt.datetime(2026, 10, 27, 0, 0, tzinfo=dt.timezone.utc)


def st(name, state, completed):
    return {"type": {"name": name, "state": state, "completed": completed}}


def team(tid, name, ha, score=None, winner=False, order=None):
    c = {"id": tid, "homeAway": ha, "winner": winner, "type": "team",
         "team": {"id": tid, "displayName": name}}
    if score is not None:
        c["score"] = score
    if order:
        c["order"] = order
    return c


SOCCER_PRE = {
    "id": "401886165", "date": "2026-10-18T20:30Z",
    "competitions": [{
        "id": "401886165", "date": "2026-10-18T20:30Z", "neutralSite": False,
        "status": st("STATUS_SCHEDULED", "pre", False),
        "competitors": [team("1", "Alianza Atlético", "home"), team("2", "Universitario", "away")],
        "odds": [{
            "provider": {"name": "DraftKings"}, "overUnder": 2.5, "drawOdds": {"moneyLine": 400},
            "moneyline": {"home": {"open": {"odds": "+250"}, "close": {"odds": "+200"}},
                          "away": {"open": {"odds": "-110"}, "close": {"odds": "+135"}},
                          "draw": {"open": {"odds": "+270"}, "close": {"odds": "+205"}}},
            "total": {"over": {"close": {"line": "o2.5", "odds": "-105"}},
                      "under": {"close": {"line": "u2.5", "odds": "-115"}}},
            "pointSpread": {"home": {"close": {"line": "+0.5", "odds": "-150"}},
                            "away": {"close": {"line": "-0.5", "odds": "+120"}}}}]}]}

SOCCER_DRAW_FINAL = {
    "id": "10", "date": "2026-09-20T20:00Z",
    "competitions": [{"id": "10", "date": "2026-09-20T20:00Z", "status": st("STATUS_FULL_TIME", "post", True),
                      "competitors": [team("1", "A", "home", "1"), team("2", "B", "away", "1")],
                      "odds": [None]}]}

SOCCER_PENALTIES = {
    "id": "11", "date": "2026-09-21T23:00Z",
    "competitions": [{"id": "11", "date": "2026-09-21T23:00Z", "status": st("STATUS_FINAL_PEN", "post", True),
                      "competitors": [team("1", "A", "home", "1", winner=False),
                                      team("2", "B", "away", "1", winner=True)]}]}

SOCCER_POSTPONED = {
    "id": "12", "date": "2026-09-22T20:00Z",
    "competitions": [{"id": "12", "date": "2026-09-22T20:00Z", "status": st("STATUS_POSTPONED", "post", True),
                      "competitors": [team("1", "A", "home", "0"), team("2", "B", "away", "0")]}]}

MLB_PRE = {
    "id": "500", "date": "2026-10-19T00:10Z",
    "competitions": [{
        "id": "500", "date": "2026-10-19T00:10Z", "neutralSite": False,
        "status": st("STATUS_SCHEDULED", "pre", False),
        "competitors": [team("1", "Yankees", "home"), team("2", "Red Sox", "away")],
        "odds": [{"provider": {"name": "DraftKings"},
                  "moneyline": {"home": {"close": {"odds": "-150"}, "open": {"odds": "-140"}},
                                "away": {"close": {"odds": "+130"}}},
                  "total": {"over": {"close": {"line": "o8.5", "odds": "-110"}},
                            "under": {"close": {"line": "u8.5", "odds": "-110"}}}}]}]}

MLB_FINAL = {
    "id": "501", "date": "2026-10-10T23:00Z",
    "competitions": [{"id": "501", "date": "2026-10-10T23:00Z", "status": st("STATUS_FINAL", "post", True),
                      "competitors": [team("1", "Yankees", "home", "5", True),
                                      team("2", "Red Sox", "away", "3")]}]}


def fighter(aid, name, order, winner):
    return {"id": aid, "order": order, "winner": winner, "type": "athlete",
            "athlete": {"displayName": name, "fullName": name}}


UFC_EVENT = {
    "id": "600", "date": "2026-10-03T20:00Z", "status": st("STATUS_FINAL", "post", True),
    "competitions": [
        {"id": "601", "date": "2026-10-04T00:00Z", "status": st("STATUS_FINAL", "post", True),
         "competitors": [fighter("a", "Natalia Silva", 1, True), fighter("b", "Wang Cong", 2, False)]},
        {"id": "602", "date": "2026-10-03T22:00Z", "status": st("STATUS_FINAL", "post", True),
         "competitors": [fighter("c", "X Uno", 1, False), fighter("d", "Y Dos", 2, True)]},
        {"id": "603", "date": "2026-10-03T21:00Z", "status": st("STATUS_FINAL", "post", True),
         "competitors": [fighter("e", "P", 1, False), fighter("f", "Q", 2, False)]},  # sin ganador
        {"id": "604", "date": "2026-10-24T21:00Z", "status": st("STATUS_SCHEDULED", "pre", False),
         "competitors": [fighter("g", "G Uno", 1, False), fighter("h", "H Dos", 2, False)]}]}

TENNIS_EVENT = {
    "id": "315", "date": "2026-10-12T04:00Z",
    "groupings": [
        {"grouping": {"displayName": "Men's Singles"}, "competitions": [
            {"id": "9001", "date": "2026-10-14T10:00Z", "status": st("STATUS_FINAL", "post", True),
             "competitors": [dict(fighter("1", "Billy Harris", 2, True), homeAway="away"),
                             dict(fighter("2", "Taro Daniel", 1, False), homeAway="home")]},
            {"id": "9002", "date": "2026-10-14T11:00Z", "status": st("STATUS_SCHEDULED", "pre", False),
             "competitors": [fighter("3", "TBD", 1, False), fighter("4", "Otro", 2, False)]}]},
        {"grouping": {"displayName": "Men's Doubles"}, "competitions": [
            {"id": "9003", "date": "2026-10-14T12:00Z", "status": st("STATUS_FINAL", "post", True),
             "competitors": [fighter("5", "D1", 1, True), fighter("6", "D2", 2, False)]}]}]}


def parse(ev, lg="soccer/x", sport="soccer"):
    return fe.parse_event(ev, lg, sport, NOW, WIN_END)


class OddsConversion(unittest.TestCase):
    def test_american(self):
        self.assertEqual(fe.american_to_decimal("+150"), 2.5)
        self.assertEqual(fe.american_to_decimal("-150"), 1.667)
        self.assertEqual(fe.american_to_decimal(400), 5.0)
        self.assertEqual(fe.american_to_decimal("+100"), 2.0)
        self.assertEqual(fe.american_to_decimal("-110"), 1.909)

    def test_invalid_is_none(self):
        for v in (None, "", "OFF", "EVEN", "0", 0, "abc", True):
            self.assertIsNone(fe.american_to_decimal(v), v)

    def test_parse_line(self):
        self.assertEqual(fe.parse_line("o2.5"), 2.5)
        self.assertEqual(fe.parse_line("u222.5"), 222.5)
        self.assertEqual(fe.parse_line("-1.5"), -1.5)
        self.assertIsNone(fe.parse_line("OFF"))


class SoccerParsing(unittest.TestCase):
    def test_pre_with_odds(self):
        out = parse(SOCCER_PRE)
        self.assertEqual(len(out), 1)
        kind, e = out[0]
        self.assertEqual(kind, "event")
        self.assertEqual((e["id"], e["h"], e["a"], e["status"]), ("401886165", "Alianza Atlético", "Universitario", "pre"))
        dk = e["odds"]["DraftKings"]
        self.assertEqual(dk["ml"], [3.0, 3.05, 2.35])        # usa el cierre, no la apertura
        self.assertEqual(dk["total"], {"line": 2.5, "over": 1.952, "under": 1.87})
        self.assertEqual(dk["spread"], {"line": 0.5, "home": 1.667, "away": 2.2})

    def test_null_odds_list(self):
        e = parse(dict(SOCCER_PRE, competitions=[dict(SOCCER_PRE["competitions"][0], odds=[None])]))[0][1]
        self.assertIsNone(e["odds"])

    def test_no_invented_odds_when_one_side_missing(self):
        comp = dict(SOCCER_PRE["competitions"][0])
        comp["odds"] = [{"provider": {"name": "DraftKings"},
                         "moneyline": {"home": {"close": {"odds": "-150"}}}}]
        e = parse(dict(SOCCER_PRE, competitions=[comp]))[0][1]
        self.assertIsNone(e["odds"])

    def test_draw_result(self):
        kind, r = parse(SOCCER_DRAW_FINAL)[0]
        self.assertEqual(kind, "result")
        self.assertEqual((r["w"], r["hs"], r["as"], r["d"]), ("d", 1, 1, "2026-09-20"))
        self.assertNotIn("ot", r)

    def test_penalties_flag_ot(self):
        r = parse(SOCCER_PENALTIES)[0][1]
        self.assertEqual((r["w"], r["hs"], r["as"], r.get("ot")), ("a", 1, 1, True))

    def test_postponed_discarded(self):
        self.assertEqual(parse(SOCCER_POSTPONED), [])

    def test_live_event_status_in(self):
        ev = dict(SOCCER_PRE)
        comp = dict(SOCCER_PRE["competitions"][0], status=st("STATUS_SECOND_HALF", "in", False))
        ev["competitions"] = [comp]
        self.assertEqual(parse(ev)[0][1]["status"], "in")

    def test_stale_pre_and_far_future_dropped(self):
        old = dict(SOCCER_PRE["competitions"][0], date="2026-10-17T10:00Z")
        self.assertEqual(parse(dict(SOCCER_PRE, competitions=[old])), [])
        far = dict(SOCCER_PRE["competitions"][0], date="2026-11-10T10:00Z")
        self.assertEqual(parse(dict(SOCCER_PRE, competitions=[far])), [])


class OtherSports(unittest.TestCase):
    def test_mlb_pre_odds(self):
        e = parse(MLB_PRE, "baseball/mlb", "baseball")[0][1]
        dk = e["odds"]["DraftKings"]
        self.assertEqual(dk["ml"], [1.667, None, 2.3])
        self.assertEqual(dk["total"], {"line": 8.5, "over": 1.909, "under": 1.909})
        self.assertNotIn("spread", dk)

    def test_mlb_final(self):
        r = parse(MLB_FINAL, "baseball/mlb", "baseball")[0][1]
        self.assertEqual((r["w"], r["hs"], r["as"]), ("h", 5, 3))
        self.assertFalse(r["neutral"])

    def test_mma(self):
        out = parse(UFC_EVENT, "mma/ufc", "mma")
        res = [r for k, r in out if k == "result"]
        ev = [r for k, r in out if k == "event"]
        self.assertEqual([r["id"] for r in res], ["601", "602"])      # 603 sin ganador: fuera
        self.assertEqual((res[0]["h"], res[0]["a"], res[0]["w"]), ("Natalia Silva", "Wang Cong", "h"))
        self.assertEqual(res[1]["w"], "a")
        self.assertIsNone(res[0]["hs"])
        self.assertTrue(res[0]["neutral"])
        self.assertEqual(len(ev), 1)
        self.assertEqual((ev[0]["id"], ev[0]["odds"]), ("604", None))

    def test_tennis_groupings(self):
        out = parse(TENNIS_EVENT, "tennis/atp", "tennis")
        self.assertEqual(len(out), 1)                  # dobles fuera, TBD fuera
        r = out[0][1]
        self.assertEqual((r["id"], r["h"], r["a"], r["w"]), ("9001", "Taro Daniel", "Billy Harris", "a"))
        self.assertTrue(r["neutral"])


class StatusFilter(unittest.TestCase):
    def test_bad_statuses(self):
        for name in ("STATUS_CANCELED", "STATUS_SUSPENDED", "STATUS_ABANDONED", "STATUS_DELAYED",
                     "STATUS_FORFEIT", "STATUS_WALKOVER"):
            ev = {"id": "z", "date": "2026-09-01T10:00Z", "competitions": [
                {"id": "z", "date": "2026-09-01T10:00Z", "status": st(name, "post", True),
                 "competitors": [team("1", "A", "home", "1", True), team("2", "B", "away", "0")]}]}
            self.assertEqual(parse(ev), [], name)

    def test_post_not_completed_dropped(self):
        ev = {"id": "z", "date": "2026-09-01T10:00Z", "competitions": [
            {"id": "z", "date": "2026-09-01T10:00Z", "status": st("STATUS_FINAL", "post", False),
             "competitors": [team("1", "A", "home", "1", True), team("2", "B", "away", "0")]}]}
        self.assertEqual(parse(ev), [])


class CrestTests(unittest.TestCase):
    def ev(self, hlogo, alogo):
        h, a = team("1", "Local", "home"), team("2", "Visita", "away")
        if hlogo:
            h["team"]["logo"] = hlogo
        if alogo:
            a["team"]["logo"] = alogo
        return {"id": "7", "date": "2026-10-20T20:00Z", "competitions": [
            {"id": "7", "date": "2026-10-20T20:00Z", "status": st("STATUS_SCHEDULED", "pre", False), "competitors": [h, a]}]}

    def test_crest_path_kept_short(self):
        out = parse(self.ev("https://a.espncdn.com/i/teamlogos/soccer/500/123.png", "https://a.espncdn.com/i/teamlogos/soccer/500/9.png"))
        e = [r for k, r in out if k == "event"][0]
        self.assertEqual((e["hl"], e["al"]), ("soccer/500/123.png", "soccer/500/9.png"))

    def test_foreign_or_odd_logo_urls_are_dropped(self):
        out = parse(self.ev("https://evil.example/x.png", 'https://a.espncdn.com/i/teamlogos/soccer/500/1.png" onerror="a.png'))
        e = [r for k, r in out if k == "event"][0]
        self.assertNotIn("hl", e)
        self.assertNotIn("al", e)

    def test_no_logo_no_keys(self):
        e = [r for k, r in parse(self.ev(None, None)) if k == "event"][0]
        self.assertNotIn("hl", e)

    def test_cache_slimming_keeps_logo(self):
        c = team("1", "Local", "home")
        c["team"]["logo"] = "https://a.espncdn.com/i/teamlogos/soccer/500/123.png"
        self.assertEqual(fe.slim_competitor(c)["team"]["logo"], "https://a.espncdn.com/i/teamlogos/soccer/500/123.png")


class CacheVersionTest(unittest.TestCase):
    def test_old_unsettled_entry_is_refetched_once(self):
        now = dt.datetime(2026, 10, 25, 18, 0, tzinfo=dt.timezone.utc)
        t = (now - dt.timedelta(minutes=5)).timestamp()
        self.assertFalse(fe.fresh({"t": t, "events": []}, "202610", now))               # sin versión: se vuelve a bajar
        self.assertTrue(fe.fresh({"t": t, "v": fe.CACHE_V, "events": []}, "202610", now))
        old = (now - dt.timedelta(days=90)).timestamp()
        self.assertTrue(fe.fresh({"t": old, "events": []}, "202501", now))              # periodo cerrado: no se toca


class SchemaAndCache(unittest.TestCase):
    def test_slim_keeps_parseable_shape(self):
        for ev, sport in ((SOCCER_PRE, "soccer"), (UFC_EVENT, "mma"), (TENNIS_EVENT, "tennis")):
            self.assertEqual(parse(fe.slim_event(ev), "x/y", sport), parse(ev, "x/y", sport))

    def test_result_and_event_schema(self):
        kind, r = parse(SOCCER_DRAW_FINAL)[0]
        self.assertTrue({"lg", "d", "h", "a", "hs", "as", "w", "neutral"} <= set(r))
        self.assertIn(r["w"], ("h", "a", "d"))
        kind, e = parse(SOCCER_PRE)[0]
        self.assertTrue({"id", "lg", "ko", "h", "a", "status", "neutral", "odds"} <= set(e))
        self.assertIn(e["status"], ("pre", "in"))
        ml = e["odds"]["DraftKings"]["ml"]
        self.assertEqual(len(ml), 3)
        self.assertTrue(all(x is None or x > 1.0 for x in ml))

    def test_period_bounds_and_freshness(self):
        self.assertEqual(fe.period_bounds("202402"), (dt.date(2024, 2, 1), dt.date(2024, 2, 29)))
        old = {"t": dt.datetime(2026, 3, 10, tzinfo=dt.timezone.utc).timestamp()}
        self.assertTrue(fe.fresh(old, "202601", NOW))            # mes cerrado y asentado
        cur = {"t": (NOW - dt.timedelta(hours=2)).timestamp()}
        self.assertFalse(fe.fresh(cur, "2026", NOW))             # periodo actual: caduca a 30 min
        cur2 = {"t": (NOW - dt.timedelta(minutes=5)).timestamp(), "v": fe.CACHE_V}
        self.assertTrue(fe.fresh(cur2, "2026", NOW))

    def test_add_months_and_keys(self):
        self.assertEqual(fe.add_months(dt.date(2026, 10, 18), 24), dt.date(2024, 10, 18))
        self.assertEqual(fe.add_months(dt.date(2026, 3, 31), 1), dt.date(2026, 2, 28))
        self.assertEqual(fe.month_keys(dt.date(2026, 11, 3), dt.date(2027, 1, 2)),
                         ["202611", "202612", "202701"])


class CacheSafetyTest(unittest.TestCase):
    def test_failed_refresh_keeps_good_cache(self):
        import tempfile
        old_dir = fe.RAW_DIR
        with tempfile.TemporaryDirectory() as d:
            fe.RAW_DIR = d
            try:
                class FakeNet:
                    refresh = True
                    def get(self, url):
                        return 0, None            # fallo de red
                lf = fe.LeagueFetcher(FakeNet(), fe.utcnow())
                path = fe.cache_path("soccer/per.1", "2026")
                fe.save_cache(path, {"t": 1.0, "events": [{"id": "1"}]})
                ent = lf.request("soccer/per.1", "2026")
                self.assertEqual(ent["events"], [{"id": "1"}])
                self.assertNotIn("err", fe.load_cache(path))
            finally:
                fe.RAW_DIR = old_dir


class PackTest(unittest.TestCase):
    def test_pack_roundtrip_fields(self):
        doc = {"generated": "2026-10-18T00:00:00Z", "source": "espn",
               "leagues": [{"id": "soccer/per.1"}, {"id": "mma/ufc"}], "events": [],
               "results": [{"lg": "soccer/per.1", "d": "2026-01-02", "h": "A", "a": "B", "hs": 2, "as": 1, "w": "h", "neutral": False},
                           {"lg": "mma/ufc", "d": "2026-01-03", "h": "X", "a": "A", "hs": None, "as": None, "w": "a", "neutral": True, "ot": True, "pre": True}]}
        p = fe.pack(doc)
        self.assertEqual(p["teams"], ["A", "B", "X"])
        self.assertEqual(p["results"][0], [0, "2026-01-02", 0, 1, 2, 1, "h", 0])
        self.assertEqual(p["results"][1], [1, "2026-01-03", 2, 0, -1, -1, "a", 7])


if __name__ == "__main__":
    unittest.main(verbosity=1)
