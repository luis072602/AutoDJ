"""AutoDJ - servidor local.

Sirve la aplicación y entrega a la página el audio de las canciones de YouTube,
para que pasen por el mismo motor que los archivos (análisis de BPM, mezcla y ecualizador).

Uso:  py server.py [puerto] [--red]      (puerto por defecto 8080; --red lo abre a tu Wi-Fi)
"""
import json
import os
import re
import socket
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    import yt_dlp
except ImportError:
    sys.exit("Falta yt-dlp. Instálalo con:  py -m pip install yt-dlp")

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
CACHE_MAX = 3 * 1024**3  # el audio descargado se guarda aquí; al pasar de 3 GB se borra lo más viejo
VID = re.compile(r"^[\w-]{11}$")
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
TYPES = {".webm": "audio/webm", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".opus": "audio/ogg"}
QUIET = {"quiet": True, "no_warnings": True, "noprogress": True}

_locks = {}
_locks_guard = threading.Lock()


def cached(vid):
    return next((p for p in CACHE.glob(vid + ".*") if p.suffix in TYPES), None)


def prune(keep):
    files = sorted((p for p in CACHE.iterdir() if p.suffix in TYPES), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in files)
    for p in files:
        if total <= CACHE_MAX:
            break
        if p != keep:
            total -= p.stat().st_size
            p.unlink(missing_ok=True)


def fetch_audio(vid):
    """Devuelve la ruta del audio de un video, descargándolo si no está en la caché."""
    with _locks_guard:
        lock = _locks.setdefault(vid, threading.Lock())
    with lock:
        hit = cached(vid)
        if hit:
            os.utime(hit)
            return hit
        opts = {**QUIET, "format": "251/140/bestaudio[acodec!=none]", "noplaylist": True,
                "outtmpl": str(CACHE / "%(id)s.%(ext)s")}
        for attempt in (1, 2):  # YouTube rechaza peticiones sueltas de vez en cuando; un reintento suele bastar
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info("https://www.youtube.com/watch?v=" + vid)
                    path = Path(ydl.prepare_filename(info))
                break
            except yt_dlp.utils.DownloadError:
                if attempt == 2:
                    raise
                time.sleep(1.5)
        prune(path)
        return path


def read_playlist(url):
    """Lee los títulos de una lista (o un video suelto) pública de YouTube / YouTube Music."""
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in YT_HOSTS:
        raise ValueError("Pega un enlace de youtube.com o music.youtube.com")
    opts = {**QUIET, "extract_flat": "in_playlist", "skip_download": True, "playlistend": 500}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    items = []
    for e in info.get("entries") or [info]:
        if not e or not VID.match(e.get("id") or "") or not e.get("title"):
            continue
        title = e["title"]
        # En YouTube Music el artista es el canal «Artista - Topic»; en videos normales ya viene en el título
        channel = e.get("channel") or e.get("uploader") or ""
        artist = channel[:-8] if channel.endswith(" - Topic") else ""
        name = title if not artist or artist.lower() in title.lower() else artist + " - " + title
        items.append({"vid": e["id"], "name": name, "len": e.get("duration")})
    return {"title": info.get("title") or "Lista", "items": items}


def clean(err):
    msg = re.sub(r"\x1b\[[0-9;]*m", "", str(err))
    msg = re.sub(r"^ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?", "", msg)
    if "not a bot" in msg or "Sign in" in msg:
        return "YouTube pide iniciar sesión para entregar esta canción (control anti-bots)"
    if "unavailable" in msg.lower() or "private" in msg.lower():
        return "el video no está disponible"
    return msg[:160]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/api/ping":
                self.send_json({"ok": True})
            elif u.path == "/api/audio":
                vid = q.get("v", "")
                if not VID.match(vid):
                    return self.send_json({"error": "Identificador de video inválido"}, 400)
                self.send_audio(fetch_audio(vid))
            elif u.path == "/api/playlist":
                self.send_json(read_playlist(q.get("url", "")))
            else:
                self.send_json({"error": "No existe"}, 404)
        except (BrokenPipeError, ConnectionError):
            pass
        except Exception as e:  # yt-dlp falla de muchas formas; la página solo necesita el motivo
            self.send_json({"error": clean(e)}, 502)

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_audio(self, path):
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()
        with open(path, "rb") as f:
            self.copyfile(f, self.wfile)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/") and not self.path.startswith("/api/ping"):
            super().log_message(fmt, *args)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no envía nada: solo averigua qué interfaz sale a la red
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--red"]
    lan = "--red" in sys.argv  # abre el servidor a los demás aparatos de tu Wi-Fi (celular, tablet)
    port = int(args[0]) if args else 8080
    CACHE.mkdir(exist_ok=True)
    try:
        srv = ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", port), Handler)
    except OSError:
        sys.exit(f"El puerto {port} está ocupado. Cierra el otro servidor o usa:  py server.py {port + 1}")
    print(f"AutoDJ listo en  http://localhost:{port}   (Ctrl+C para salir)")
    if lan:
        ip = lan_ip()
        print(f"Desde el celular (misma Wi-Fi):  http://{ip}:{port}" if ip else "No encontré la IP de este equipo en la red.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
