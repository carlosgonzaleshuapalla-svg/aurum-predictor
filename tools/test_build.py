"""Pruebas del empaquetado para internet. Uso: python3 tools/test_build.py"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_site as bs  # noqa: E402

INDEX = """<html><head><title>x</title></head><body>
<a href="casino.html" style="text-decoration:underline">Prototipo anterior del casino</a>.
<script src="js/model.js?v=16"></script>
<script src="js/core.js"></script>
<script>['multi', 'odds_api'].forEach(function (n) { document.write('<script src="data/' + n + '.js?t=' + Date.now() + '"><\\/script>'); });</script>
</body></html>"""


def tree(root, with_key="CLAVEDEPRUEBA0123456789abcdef", ads=""):
    def w(rel, txt="x"):
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(txt)
    w("index.html", INDEX)
    for rel in bs.PUBLIC_FILES:
        if rel == "data/multi.js":
            w(rel, 'window.AURUM_MULTI_PACKED = {"events":[],"results":[]};\n')
        elif rel == "privacidad.html":
            w(rel, "<html><head><title>p</title></head><body>p</body></html>")
        elif rel == "js/ads.js":
            w(rel, "var CLIENT = '%s';" % ads)
        elif rel != "index.html":
            w(rel, "// ok")
    # cosas que NO deben publicarse
    w("casino.html"); w("js/app.js"); w("js/games/dice.js"); w("tools/serve.py"); w("tests/gate.js")
    w("data/raw/x.csv"); w("data/raw_espn/y.gz"); w("data/multi.json", "{}"); w("data/odds_api.js", "// cuotas")
    if with_key:
        w("tools/.odds_api_key", with_key + "\n")


class BuildTests(unittest.TestCase):
    def build(self, **kw):
        d = tempfile.mkdtemp()
        tree(d, kw.pop("key", "CLAVEDEPRUEBA0123456789abcdef"), kw.pop("ads", ""))
        out = bs.build(d, os.path.join(d, "dist"), stamp="TEST", log=lambda *_: None, **kw)
        return d, out

    def files(self, out):
        return sorted(os.path.relpath(os.path.join(dp, f), out).replace(os.sep, "/") for dp, _, fs in os.walk(out) for f in fs)

    def test_only_whitelist_is_published(self):
        _, out = self.build()
        fs = self.files(out)
        for bad in ("casino.html", "js/app.js", "js/games/dice.js", "tools/serve.py", "tests/gate.js", "data/multi.json", "data/odds_api.js", ".odds_api_key"):
            self.assertNotIn(bad, fs)
        self.assertFalse([f for f in fs if f.startswith(("tools/", "tests/", "data/raw"))])
        for need in ("index.html", "_headers", "robots.txt", ".nojekyll", "data/multi.js", "js/predictor.js", "css/styles.css"):
            self.assertIn(need, fs)

    def test_odds_api_only_with_flag(self):
        self.assertIn("data/odds_api.js", self.files(self.build(with_odds_api=True)[1]))
        self.assertNotIn("data/odds_api.js", self.files(self.build()[1]))

    def test_index_transformed(self):
        _, out = self.build()
        with open(os.path.join(out, "index.html"), encoding="utf-8") as f:
            h = f.read()
        self.assertNotIn("casino", h.lower())
        self.assertNotIn("Date.now()", h)
        self.assertIn("?t=' + 'TEST'", h.replace("'TEST'", "'TEST'"))
        self.assertIn("js/model.js?v=TEST", h)
        self.assertIn("js/core.js?v=TEST", h, "todos los js/css llevan versión")
        self.assertIn("Content-Security-Policy", h, "CSP también en el HTML (GitHub Pages ignora _headers)")
        self.assertNotIn("odds_api", h, "no se pide un archivo que no se publica")

    def test_audit_blocks_secret_leak(self):
        d, out = self.build()
        with open(os.path.join(out, "js", "predictor.js"), "a", encoding="utf-8") as f:
            f.write("// CLAVEDEPRUEBA0123456789abcdef")
        self.assertTrue([p for p in bs.audit(d, out) if "CLAVE" in p])

    def test_audit_blocks_forbidden_file_and_text(self):
        d, out = self.build()
        os.makedirs(os.path.join(out, "js", "games"), exist_ok=True)
        with open(os.path.join(out, "js", "games", "x.js"), "w") as f:
            f.write("x")
        with open(os.path.join(out, "css", "styles.css"), "a") as f:
            f.write("/* ver casino.html */")
        probs = bs.audit(d, out)
        self.assertTrue(any("games" in p or "casino" in p for p in probs))
        self.assertTrue(any("texto prohibido" in p for p in probs))

    def test_missing_data_fails_with_instructions(self):
        d = tempfile.mkdtemp(); tree(d)
        os.remove(os.path.join(d, "data", "multi.js"))
        with self.assertRaises(SystemExit) as cm:
            bs.build(d, os.path.join(d, "dist"), stamp="T", log=lambda *_: None)
        self.assertIn("fetch_espn.py", str(cm.exception))

    def test_refuses_output_outside_or_root(self):
        d = tempfile.mkdtemp(); tree(d)
        with self.assertRaises(SystemExit):
            bs.build(d, d, stamp="T")
        with self.assertRaises(SystemExit):
            bs.build(d, tempfile.mkdtemp(), stamp="T")

    def test_out_must_be_named_dist(self):
        d = tempfile.mkdtemp(); tree(d)
        with self.assertRaises(SystemExit):
            bs.build(d, os.path.join(d, "css"), stamp="T", log=lambda *_: None)
        self.assertTrue(os.path.exists(os.path.join(d, "css", "styles.css")), "no se borró nada")

    def test_stale_zip_removed_when_audit_fails(self):
        d = tempfile.mkdtemp(); tree(d)
        with open(os.path.join(d, "dist.zip"), "w") as f:
            f.write("viejo")
        bs.build(d, os.path.join(d, "dist"), stamp="T", log=lambda *_: None)
        self.assertFalse(os.path.exists(os.path.join(d, "dist.zip")))

    def test_env_key_also_audited(self):
        d, out = self.build(key="")
        os.environ["ODDS_API_KEY"] = "CLAVEDELENTORNO0123456789"
        try:
            with open(os.path.join(out, "js", "predictor.js"), "a") as f:
                f.write("// CLAVEDELENTORNO0123456789")
            self.assertTrue([p for p in bs.audit(d, out) if "CLAVE" in p])
        finally:
            os.environ.pop("ODDS_API_KEY", None)

    def test_strip_draftkings_by_default(self):
        d = tempfile.mkdtemp(); tree(d)
        with open(os.path.join(d, "data", "multi.js"), "w", encoding="utf-8") as f:
            f.write('window.AURUM_MULTI_PACKED = {"events":[{"id":"1","odds":{"DraftKings":{"ml":[1.5,null,2.5]}}}],"results":[]};\n')
        out = bs.build(d, os.path.join(d, "dist"), stamp="T", log=lambda *_: None, con_draftkings=False)
        with open(os.path.join(out, "data", "multi.js"), encoding="utf-8") as f:
            txt = f.read()
        self.assertNotIn("DraftKings", txt); self.assertIn('"odds":null', txt)

    def test_con_draftkings_keeps_odds(self):
        d = tempfile.mkdtemp(); tree(d)
        with open(os.path.join(d, "data", "multi.js"), "w", encoding="utf-8") as f:
            f.write('window.AURUM_MULTI_PACKED = {"events":[{"id":"1","odds":{"DraftKings":{"ml":[1.5,null,2.5]}}}],"results":[]};\n')
        out = bs.build(d, os.path.join(d, "dist"), stamp="T", log=lambda *_: None, con_draftkings=True)
        with open(os.path.join(out, "data", "multi.js"), encoding="utf-8") as f:
            self.assertIn("DraftKings", f.read())

    def test_footer_does_not_cite_draftkings_when_stripped(self):
        h = bs.transform_index("<head></head>(calendarios, resultados y cuotas de referencia de DraftKings)", "T")
        self.assertNotIn("DraftKings", h)

    def test_headers_have_csp_and_cache(self):
        _, out = self.build()
        with open(os.path.join(out, "_headers")) as f:
            t = f.read()
        self.assertIn("Content-Security-Policy", t); self.assertIn("frame-ancestors 'none'", t); self.assertIn("/data/*", t)


    def test_ads_off_by_default(self):
        _, out = self.build()
        self.assertNotIn("ads.txt", self.files(out))
        with open(os.path.join(out, "index.html"), encoding="utf-8") as f:
            h = f.read()
        self.assertNotIn("googlesyndication", h)
        self.assertNotIn("adsense", h.lower(), "sin ID no hay nada de AdSense en la CSP ni en el <meta>")
        with open(os.path.join(out, "_headers"), encoding="utf-8") as f:
            self.assertNotIn("googlesyndication", f.read())

    def test_ads_on_adds_txt_meta_and_csp(self):
        _, out = self.build(ads="ca-pub-1234567890123456")
        with open(os.path.join(out, "ads.txt"), encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0")
        for page in ("index.html", "privacidad.html"):
            with open(os.path.join(out, page), encoding="utf-8") as f:
                h = f.read()
            self.assertIn('<meta name="google-adsense-account" content="ca-pub-1234567890123456">', h)
            self.assertIn("googlesyndication.com", h)
        with open(os.path.join(out, "_headers"), encoding="utf-8") as f:
            self.assertIn("googlesyndication", f.read())

    def test_bad_ads_id_fails(self):
        with self.assertRaises(SystemExit):
            self.build(ads="pub-123")


    def test_crests_csp_and_strip(self):
        self.assertIn("img-src 'self' data: https://a.espncdn.com", bs.csp("", True))
        self.assertNotIn("espncdn", bs.csp("", False))
        d = tempfile.mkdtemp()
        p = os.path.join(d, "multi.js")
        with open(p, "w", encoding="utf-8") as f:
            f.write('window.AURUM_MULTI_PACKED = {"events":[{"id":"1","odds":{"DK":1},"hl":"soccer/500/1.png","al":"soccer/500/2.png"}],"results":[]};\n')
        bs.strip_draftkings(p, drop_odds=False, drop_crests=True)
        with open(p, encoding="utf-8") as f:
            t = f.read()
        self.assertNotIn('"hl"', t)
        self.assertIn('"DK"', t)


if __name__ == "__main__":
    unittest.main(verbosity=1)
