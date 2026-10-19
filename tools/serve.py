#!/usr/bin/env python3
"""Aurum Predictor - servidor local con boton "Actualizar datos".

Uso:  python3 tools/serve.py [puerto]      (por defecto 5183)
Abre  http://localhost:5183/

Sirve la web desde la carpeta del proyecto y expone dos rutas SOLO locales:
  POST /api/refresh  -> lanza (en segundo plano) la descarga de datos y los backtests
  GET  /api/status   -> estado del refresco (para la barra de progreso)

Seguridad: escucha solo en 127.0.0.1, rechaza peticiones cuyo Host u Origin no sean
localhost (evita que otra web abierta en tu navegador lo dispare), ejecuta una lista
fija de comandos sin ningun dato de la peticion y permite un unico refresco a la vez.
"""
import http.server
import json
import re
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_PATH = os.path.join(ROOT, "tools", ".odds_api_key")   # oculto, permisos 600, nunca se sirve por HTTP ni se devuelve completo
KEY_RE = re.compile(r"^[A-Za-z0-9]{16,64}$")
PY = sys.executable or "python3"
NODE = shutil.which("node")


def default_steps():
    steps = [
        ("Cuotas e histórico de fútbol (football-data)", [PY, "tools/fetch_data.py"]),
        ("Calendarios, resultados y cuotas de todos los deportes (ESPN)", [PY, "tools/fetch_espn.py"]),
        ("Cuotas de casas con licencia en Perú (The Odds API, opcional: requiere ODDS_API_KEY)", [PY, "tools/fetch_odds_api.py"]),
    ]
    if NODE:
        steps += [
            ("Backtest del fútbol multi-casa", [NODE, "tools/backtest.js"]),
            ("Aciertos y calibración por liga", [NODE, "tools/backtest_multi.js"]),
        ]
    return steps


COOLDOWN = 120          # segundos mínimos entre refrescos (evita machacar las fuentes)
# Solo se sirve lo que la web necesita: páginas, css, js y los datos .js. Nada de tools/, tests/, data/raw*, *.json ni archivos ocultos.
PUBLIC = re.compile(r"^/(|index\.html|casino\.html|css/[\w.\-]+\.css|js/[\w.\-]+\.js|js/games/[\w.\-]+\.js|data/[\w.\-]+\.js)$")


class Job:
    """Un unico refresco a la vez; el estado se consulta desde otro hilo."""

    def __init__(self, steps, timeout=1800, cooldown=COOLDOWN):
        self.steps, self.timeout, self.cooldown = steps, timeout, cooldown
        self.lock = threading.Lock()
        self.state = {"running": False, "ok": None, "started": None, "finished": None, "steps": []}

    def snapshot(self):
        with self.lock:
            return json.loads(json.dumps(self.state))

    def start(self):
        with self.lock:
            if self.state["running"]:
                return False
            fin = self.state.get("finished")
            if fin and time.time() - fin < self.cooldown:
                return "cooldown"
            self.state = {"running": True, "ok": None, "started": time.time(), "finished": None,
                          "steps": [{"name": n, "state": "pending", "secs": None, "tail": ""} for n, _ in self.steps]}
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _set(self, i, **kw):
        with self.lock:
            self.state["steps"][i].update(kw)

    def _run(self):
        try:
            self._run_steps()
        finally:                      # pase lo que pase, el estado no se queda en «running»
            with self.lock:
                if self.state["running"]:
                    self.state.update(running=False, ok=False, finished=time.time())

    def _run_steps(self):
        ok = True
        for i, (name, cmd) in enumerate(self.steps):
            t0 = time.time()
            self._set(i, state="running")
            try:
                p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=self.timeout)
                out = ((p.stdout or "") + (p.stderr or "")).strip().splitlines()
                self._set(i, state="ok" if p.returncode == 0 else "error", secs=round(time.time() - t0, 1),
                          tail="\n".join(out[-3:])[-400:])
                if p.returncode != 0:
                    ok = False  # se sigue con el resto: un fallo de red en una fuente no debe bloquear las demas
            except Exception as e:  # noqa: BLE001 - se informa en la UI
                self._set(i, state="error", secs=round(time.time() - t0, 1), tail=str(e)[:400])
                ok = False
        with self.lock:
            self.state.update(running=False, ok=ok, finished=time.time())


def key_status():
    try:
        with open(KEY_PATH, encoding="utf-8") as f:
            k = f.read().strip()
    except OSError:
        return {"has": False}
    return {"has": bool(k), "masked": (k[:4] + "…" + k[-4:]) if len(k) >= 12 else "…"}


def save_key(k):
    fd = os.open(KEY_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)   # solo tu usuario puede leerlo
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(k + "\n")
    os.chmod(KEY_PATH, 0o600)


def make_handler(job, port):
    allowed_hosts = {"localhost:%d" % port, "127.0.0.1:%d" % port}

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=ROOT, **kw)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")  # siempre los datos y el codigo mas recientes
            super().end_headers()

        def log_message(self, fmt, *args):  # menos ruido: solo las llamadas a /api/ y los errores
            try:
                msg = fmt % args
            except Exception:  # noqa: BLE001
                msg = str(fmt)
            if "/api/" in msg or " 4" in msg or " 5" in msg:
                sys.stderr.write("%s - %s\n" % (self.address_string(), msg))

        def _local_only(self):
            host = (self.headers.get("Host") or "").lower()
            origin = self.headers.get("Origin")
            if host not in allowed_hosts:
                return False
            if origin:
                o = urllib.parse.urlparse(origin)
                if (o.netloc or "").lower() not in allowed_hosts:
                    return False
            return True

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _static_ok(self):
            path = urllib.parse.unquote(self.path.split("?")[0].split("#")[0])
            return bool(PUBLIC.match(path))

        def list_directory(self, path):          # sin listados de carpetas
            self.send_error(404)
            return None

        def do_HEAD(self):
            if not self._local_only() or not self._static_ok():
                return self._json(404, {"error": "no existe"})
            return super().do_HEAD()

        def do_GET(self):
            if self.path.split("?")[0] == "/api/status":
                if not self._local_only():
                    return self._json(403, {"error": "solo local"})
                return self._json(200, job.snapshot())
            if self.path.split("?")[0] == "/api/key":
                if not self._local_only():
                    return self._json(403, {"error": "solo local"})
                return self._json(200, key_status())          # nunca la clave completa
            if not self._local_only():           # también para archivos: evita DNS-rebinding
                return self._json(403, {"error": "solo local"})
            if not self._static_ok():
                return self._json(404, {"error": "no existe"})
            return super().do_GET()

        def do_DELETE(self):
            if self.path.split("?")[0] != "/api/key":
                return self._json(404, {"error": "no existe"})
            if not self._local_only():
                return self._json(403, {"error": "solo local"})
            try:
                os.remove(KEY_PATH)
            except OSError:
                pass
            return self._json(200, key_status())

        def do_POST(self):
            path = self.path.split("?")[0]
            if path == "/api/key":
                if not self._local_only():
                    return self._json(403, {"error": "solo local"})
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    k = str(json.loads(self.rfile.read(min(n, 1024)) or b"{}").get("key", "")).strip()
                except (ValueError, TypeError):
                    return self._json(400, {"error": "petición no válida"})
                if not KEY_RE.match(k):
                    return self._json(400, {"error": "La clave debe tener entre 16 y 64 letras o números, sin espacios"})
                save_key(k)
                return self._json(200, key_status())
            if path != "/api/refresh":
                return self._json(404, {"error": "no existe"})
            if not self._local_only():
                return self._json(403, {"error": "solo local"})
            r = job.start()
            if r == "cooldown":
                return self._json(429, {"error": "espera unos minutos antes de volver a actualizar"})
            if not r:
                return self._json(409, {"error": "ya hay un refresco en curso"})
            return self._json(202, {"started": True})

    return Handler


def make_server(port, steps=None):
    job = Job(steps if steps is not None else default_steps())
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), make_handler(job, port))
    return srv, job


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5183
    srv, _ = make_server(port)
    print("Aurum Predictor en http://localhost:%d/  (Ctrl+C para salir)" % port)
    if not NODE:
        print("Aviso: no se encontró 'node'; el botón actualizará datos pero no recalculará los backtests.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
