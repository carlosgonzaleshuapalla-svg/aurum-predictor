#!/usr/bin/env python3
"""Pruebas sin red de fetch_data.py (CSV de muestra embebido)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_data as fd  # noqa: E402

HIST_CSV = (
    "﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST,"
    "B365H,B365D,B365A,PSH,PSD,PSA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,"
    "B365>2.5,B365<2.5,P>2.5,P<2.5,BWH,BWD,BWA\n"
    "E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2,H,19,10,10,3,"
    "1.3,6,8.5,1.34,6.5,9.5,1.36,6.8,10,1.31,5.96,8.31,1.36,3.2,1.41,2.95,1.0,5,7\n"
    "E0,16/08/25,15:00,Man United,Arsenal,0,1,A,,,,,"
    "2.9,3.4,2.5,,,,3.0,3.5,2.6,2.8,3.3,2.4,,,,,,,\n"
    "E0,17/08/2025,15:00,Chelsea,Fulham,,,,,,,,2,3,4,,,,,,,,,,,,,,,\n"          # sin resultado
    "E0,18/08/2025,15:00,Everton,Wolves,1,1,D,,,,,0.9,3,4,abc,3,4,,,,,,,,,,,,,\n"  # cuotas invalidas
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n"
    "E0,xx/yy/zzzz,15:00,Foo,Bar,1,0,H,,,,,2,3,4,,,,,,,,,,,,,,,\n"               # fecha mala
)

FIX_CSV = (
    "﻿Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,PPH,PPD,PPA,"
    "B365>2.5,B365<2.5,MaxH,MaxD,MaxA\n"
    "E0,17/10/2026,16:00,Manchester Utd,Chelsea,2.1,3.4,3.6,2.15,3.45,3.7,1.9,1.95,2.2,3.5,3.8\n"
    "E0,25/10/2026,12:30,Arsenal,Liverpool,2.0,3.5,3.8,,,,,,,,\n"
    "E0,25/10/2026,15:00,Everton,Fulham,,,,,,,,,,,\n"       # sin 1x2 -> fuera
    "ZZ9,25/10/2026,15:00,A,B,2,3,4,,,,,,,,\n"               # liga fuera de alcance
)

ALIASES = {"Man United": ["Manchester Utd", "Manchester United"], "Arsenal": ["Arsenal FC"]}


def amap_from(d):
    p = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(d, p)
    p.close()
    try:
        return fd.load_aliases(p.name)[0]
    finally:
        os.unlink(p.name)


class TestParsing(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(fd.parse_date("15/08/2025"), "2025-08-15")
        self.assertEqual(fd.parse_date("15/08/25"), "2025-08-15")
        self.assertEqual(fd.parse_date("﻿01/02/2024"), "2024-02-01")
        for bad in ("", None, "2025-08-15", "32/01/2025", "abc"):
            self.assertIsNone(fd.parse_date(bad))

    def test_odds(self):
        self.assertEqual(fd.parse_odd("2.5"), 2.5)
        self.assertEqual(fd.parse_odd("2,5"), 2.5)
        for bad in ("", "1.0", "0.9", "abc", None, "nan", "inf"):
            self.assertIsNone(fd.parse_odd(bad))

    def test_bom_removed_from_header(self):
        rows = fd.read_rows(HIST_CSV)
        self.assertIn("Div", rows[0])
        self.assertNotIn("﻿Div", rows[0])
        rows2 = fd.read_rows(fd.decode_bytes(HIST_CSV.encode("utf-8")))
        self.assertIn("Div", rows2[0])
        self.assertEqual(fd.decode_bytes("Año".encode("cp1252")), "Año")

    def test_blank_rows_skipped(self):
        rows = fd.read_rows(HIST_CSV)
        self.assertEqual(len(rows), 5)  # 6 filas menos la completamente vacia


class TestHistory(unittest.TestCase):
    def setUp(self):
        self.amap = amap_from(ALIASES)
        self.ms = fd.parse_history_rows(fd.read_rows(HIST_CSV), "E0", self.amap)

    def test_invalid_rows_dropped(self):
        # sin resultado y fecha mala se descartan; cuotas <=1.0 se descartan pero el partido se conserva
        self.assertEqual([m["h"] for m in self.ms], ["Liverpool", "Man United", "Everton"])
        self.assertNotIn("o", self.ms[2])

    def test_schema(self):
        m = self.ms[0]
        self.assertEqual((m["d"], m["lg"], m["hg"], m["ag"]), ("2025-08-15", "E0", 4, 2))
        self.assertEqual((m["hs"], m["as"], m["hst"], m["ast"]), (19, 10, 10, 3))
        self.assertEqual(m["o"]["Bet365"], [1.3, 6.0, 8.5])
        self.assertEqual(m["o"]["Pinnacle"], [1.34, 6.5, 9.5])
        self.assertEqual(m["ou"]["Pinnacle"], [1.41, 2.95])
        self.assertEqual(m["ou"]["Bet365"], [1.36, 3.2])
        self.assertNotIn("Bwin", m["o"])  # BWH=1.0 -> invalida

    def test_missing_optional_fields_omitted(self):
        m = self.ms[1]
        for k in ("hs", "as", "hst", "ast", "ou"):
            self.assertNotIn(k, m)
        self.assertNotIn("Pinnacle", m["o"])

    def test_book_names_normalized(self):
        names = set(self.ms[0]["o"])
        self.assertTrue(names <= set(fd.BOOK_1X2.values()))
        self.assertEqual(fd.BOOK_1X2["B365"], "Bet365")
        self.assertEqual(fd.BOOK_1X2["PS"], "Pinnacle")
        self.assertEqual(fd.BOOK_1X2["PP"], "Pinnacle")
        self.assertEqual(fd.BOOK_1X2["BFD"], "Betfair")
        self.assertEqual(fd.BOOK_1X2["BFE"], "BetfairExchange")
        self.assertEqual(fd.BOOK_1X2["SKB"], "SkyBet")
        self.assertEqual(fd.BOOK_1X2["BV"], "BetVictor")
        self.assertEqual(fd.BOOK_1X2["BW"], "Bwin")


class TestAliases(unittest.TestCase):
    def test_alias_and_fold(self):
        a = amap_from(ALIASES)
        self.assertEqual(fd.norm_team("Manchester Utd", a), "Man United")
        self.assertEqual(fd.norm_team("  manchester   UNITED ", a), "Man United")
        self.assertEqual(fd.norm_team("Man United", a), "Man United")
        self.assertEqual(fd.norm_team("Unknown FC", a), "Unknown FC")
        self.assertEqual(fd.fold("Atlético  Madrid"), "atletico madrid")

    def test_real_alias_file_consistent(self):
        raw = json.load(open(fd.ALIASES_PATH, encoding="utf-8"))
        seen = {}
        for c, als in raw.items():
            self.assertIsInstance(als, list)
            for n in [c] + als:
                k = fd.fold(n)
                self.assertEqual(seen.setdefault(k, c), c, "colision de alias: %s" % n)


class TestFixtures(unittest.TestCase):
    def setUp(self):
        self.amap = amap_from(ALIASES)
        self.ev, self.skipped = fd.parse_fixture_rows(fd.read_rows(FIX_CSV), self.amap, "2026-10-18")

    def test_filtering(self):
        self.assertEqual(len(self.ev), 1 + 0)  # 17/10 pasado, Everton sin 1x2, ZZ9 fuera
        self.assertEqual(self.skipped, {"ZZ9": 1})

    def test_schema_and_alias(self):
        e = self.ev[0]
        self.assertEqual(e["id"], "E0|2026-10-25|Arsenal|Liverpool")
        self.assertEqual((e["lg"], e["lgName"], e["ko"]), ("E0", "Premier League", "2026-10-25T12:30"))
        self.assertEqual(e["books"], {"Bet365": {"1x2": [2.0, 3.5, 3.8]}})

    def test_today_included_and_alias_applied(self):
        ev, _ = fd.parse_fixture_rows(fd.read_rows(FIX_CSV), self.amap, "2026-10-17")
        e = [x for x in ev if x["a"] == "Chelsea"][0]
        self.assertEqual(e["h"], "Man United")
        self.assertEqual(e["id"], "E0|2026-10-17|Man United|Chelsea")
        self.assertEqual(e["books"]["Bet365"], {"1x2": [2.1, 3.4, 3.6], "ou25": [1.9, 1.95]})
        self.assertEqual(e["books"]["Pinnacle"], {"1x2": [2.15, 3.45, 3.7]})
        self.assertEqual(e["books"]["Max"]["1x2"], [2.2, 3.5, 3.8])


class TestOutput(unittest.TestCase):
    def test_atomic_pair_and_js_wrapper(self):
        with tempfile.TemporaryDirectory() as d:
            obj = {"generated": "x", "source": "s", "matches": [{"d": "2025-01-01", "h": "Año"}]}
            jp, sp = fd.write_pair("history", "AURUM_HISTORY", obj, d)
            self.assertEqual(json.load(open(jp, encoding="utf-8")), obj)
            txt = open(sp, encoding="utf-8").read()
            self.assertTrue(txt.startswith("window.AURUM_HISTORY = "))
            self.assertTrue(txt.rstrip().endswith(";"))
            body = txt[len("window.AURUM_HISTORY = "):].rstrip().rstrip(";")
            self.assertEqual(json.loads(body), obj)
            self.assertEqual(sorted(os.listdir(d)), ["history.js", "history.json"])  # sin .tmp

    def test_current_season(self):
        self.assertEqual(fd.current_season("2026-10-18"), "2627")
        self.assertEqual(fd.current_season("2027-03-01"), "2627")

    def test_odds_merge_without_key_is_noop(self):
        ev = [{"books": {}}]
        self.assertEqual(fd.odds_api_merge(ev, "", {}, {}), 0)


if __name__ == "__main__":
    unittest.main()
