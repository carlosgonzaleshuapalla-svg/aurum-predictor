"""Pruebas del servidor local (sin red externa). Uso: python3 tools/test_serve.py"""
import http.client
import json
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402


class ServeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.steps = [("rápido", [sys.executable, "-c", "print('ok')"]),
                     ("lento", [sys.executable, "-c", "import time; time.sleep(0.6); print('fin')"]),
                     ("falla", [sys.executable, "-c", "import sys; sys.exit(3)"])]
        import socket
        sk = socket.socket(); sk.bind(("127.0.0.1", 0)); cls.port = sk.getsockname()[1]; sk.close()  # puerto libre
        cls.job = serve.Job(cls.steps, cooldown=1)
        cls.srv = serve.http.server.ThreadingHTTPServer(("127.0.0.1", cls.port), serve.make_handler(cls.job, cls.port))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close()

    def req(self, method, path, host=None, origin=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or "localhost:%d" % self.port}
        if origin:
            h["Origin"] = origin
        c.request(method, path, headers=h)
        r = c.getresponse(); body = r.read(); c.close()
        return r.status, dict(r.getheaders()), body

    def test_serves_index_without_cache(self):
        s, h, b = self.req("GET", "/index.html")
        self.assertEqual(s, 200)
        self.assertEqual(h.get("Cache-Control"), "no-store")
        self.assertIn(b"Aurum", b)

    def test_status_shape(self):
        s, _, b = self.req("GET", "/api/status")
        self.assertEqual(s, 200)
        d = json.loads(b)
        for k in ("running", "ok", "started", "finished", "steps"):
            self.assertIn(k, d)

    def test_rejects_foreign_host_and_origin(self):
        self.assertEqual(self.req("POST", "/api/refresh", host="evil.example.com")[0], 403)
        self.assertEqual(self.req("POST", "/api/refresh", origin="https://evil.example.com")[0], 403)
        self.assertEqual(self.req("GET", "/api/status", host="evil.example.com")[0], 403)

    def test_unknown_post_is_404(self):
        self.assertEqual(self.req("POST", "/api/otra")[0], 404)

    def test_path_traversal_blocked(self):
        s, _, b = self.req("GET", "/../../../../etc/passwd")
        self.assertNotIn(b"root:", b)

    def test_refresh_runs_once_and_reports(self):
        time.sleep(1.3)  # deja pasar el enfriamiento (1 s en pruebas) de otros tests
        s, _, _ = self.req("POST", "/api/refresh", origin="http://localhost:%d" % self.port)
        self.assertEqual(s, 202)
        s2, _, _ = self.req("POST", "/api/refresh")
        self.assertEqual(s2, 409, "un solo refresco a la vez")
        time.sleep(0.01)
        for _ in range(60):
            d = json.loads(self.req("GET", "/api/status")[2])
            if not d["running"]:
                break
            time.sleep(0.1)
        self.assertFalse(d["running"])
        self.assertEqual([x["state"] for x in d["steps"]], ["ok", "ok", "error"])
        self.assertFalse(d["ok"], "un paso fallido marca el conjunto como no ok")
        self.assertIn("fin", d["steps"][1]["tail"])
        self.assertIsNotNone(d["steps"][1]["secs"])

    def test_static_whitelist_and_host_check(self):
        for path in ("/tools/serve.py", "/tests/gate.js", "/data/multi.json", "/data/raw/_report.json", "/.DS_Store", "/LEDGER.md", "/data/", "/js/"):
            self.assertEqual(self.req("GET", path)[0], 404, path)
        self.assertEqual(self.req("GET", "/css/styles.css")[0], 200)
        self.assertEqual(self.req("GET", "/index.html", host="evil.example.com")[0], 403, "GET estático con Host ajeno")
        self.assertEqual(self.req("HEAD", "/tools/serve.py")[0], 404)

    def test_cooldown_between_refreshes(self):
        time.sleep(1.2)  # deja pasar el enfriamiento de pruebas del test anterior
        s, _, _ = self.req("POST", "/api/refresh")
        if s == 202:
            for _ in range(60):
                if not json.loads(self.req("GET", "/api/status")[2])["running"]:
                    break
                time.sleep(0.1)
            s2, _, _ = self.req("POST", "/api/refresh")
            self.assertEqual(s2, 429, "relanzar sin pausa debe esperar")

    def req_body(self, method, path, body=None, host=None, origin=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or "localhost:%d" % self.port, "Content-Type": "application/json"}
        if origin:
            h["Origin"] = origin
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        r = c.getresponse(); b = r.read(); c.close()
        return r.status, b

    def test_api_key_roundtrip_is_private(self):
        import tempfile, stat
        old = serve.KEY_PATH
        with tempfile.TemporaryDirectory() as d:
            serve.KEY_PATH = os.path.join(d, ".odds_api_key")
            try:
                self.assertFalse(json.loads(self.req("GET", "/api/key")[2])["has"])
                self.assertEqual(self.req_body("POST", "/api/key", {"key": "corta"})[0], 400)
                self.assertEqual(self.req_body("POST", "/api/key", {"key": "con espacios y símbolos!!!!!!!!"})[0], 400)
                secret = "abcd1234efgh5678ijkl9012mnop3456"
                s, b = self.req_body("POST", "/api/key", {"key": secret})
                self.assertEqual(s, 200)
                self.assertNotIn(secret.encode(), b, "la respuesta nunca incluye la clave completa")
                st = json.loads(self.req("GET", "/api/key")[2])
                self.assertTrue(st["has"]); self.assertEqual(st["masked"], "abcd…3456")
                self.assertNotIn(secret, json.dumps(st))
                self.assertEqual(stat.S_IMODE(os.stat(serve.KEY_PATH).st_mode), 0o600, "solo tu usuario puede leer el archivo")
                self.assertEqual(self.req_body("POST", "/api/key", {"key": secret}, origin="https://evil.example.com")[0], 403)
                self.assertEqual(self.req_body("POST", "/api/key", {"key": secret}, host="evil.example.com")[0], 403)
                self.assertEqual(self.req("GET", "/tools/.odds_api_key")[0], 404, "el archivo no se sirve por HTTP")
                self.assertFalse(json.loads(self.req_body("DELETE", "/api/key")[1])["has"])
                self.assertFalse(os.path.exists(serve.KEY_PATH))
            finally:
                serve.KEY_PATH = old

    def test_default_steps_are_fixed_commands(self):
        for name, cmd in serve.default_steps():
            self.assertTrue(cmd[1].startswith("tools/"), name)
            self.assertTrue(os.path.exists(os.path.join(serve.ROOT, cmd[1])), cmd[1])


if __name__ == "__main__":
    unittest.main(verbosity=1)
