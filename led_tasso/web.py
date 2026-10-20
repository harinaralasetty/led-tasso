"""Small local HTTP interface to the same pipeline used by the terminal."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
import threading
from urllib.parse import unquote, urlsplit

from . import cli
from .backends import BackendError
from .memory import MemoryStore


ASSETS = Path(__file__).with_name("web")
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml; charset=utf-8"),
}
API_PATHS = {"/api/state", "/api/chat", "/api/memory/forget", "/api/memory/clear"}
MAX_BODY = 16 * 1024


class RequestError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)


class CoachServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, host, port, backend, timeout, allow_remote, store):
        self.backend = backend
        self.backend_timeout = timeout
        self.allow_remote = allow_remote
        self.store = store
        self.turn_lock = threading.Lock()
        super().__init__((host, port), CoachHandler)


class CoachHandler(BaseHTTPRequestHandler):
    server_version = "CoachLocal/1"

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, format, *args):
        # Base error diagnostics can contain request text; never emit them.
        pass

    def log_request(self, code="-", size="-"):
        # Queries and unknown paths may contain personal text, so redact them.
        path = getattr(self, "route", "[unrecognized]")
        if path not in STATIC and path not in API_PATHS:
            path = "[unrecognized]"
        method = self.command if self.command in {"GET", "POST", "HEAD", "OPTIONS"} else "OTHER"
        print(f"{method} {path} {code}", file=sys.stderr, flush=True)

    def send_error(self, code, message=None, explain=None):
        self.respond(code, {"error": "That request could not be handled."})

    def respond(self, status, data, content_type="application/json; charset=utf-8"):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8") if isinstance(data, dict) else data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
                         "style-src 'self'; img-src 'self'; connect-src 'self'; "
                         "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        if self.command != "HEAD":
            self.wfile.write(body)

    def protect(self):
        target = urlsplit(self.path)
        if target.scheme or target.netloc:
            raise RequestError(400, "Use a local page path.")
        self.route = unquote(target.path, errors="strict")
        hosts = self.headers.get_all("Host", [])
        port = self.server.server_address[1]
        if len(hosts) != 1 or (not self.server.allow_remote and hosts[0] not in {
            f"127.0.0.1:{port}", f"localhost:{port}",
        }):
            raise RequestError(403, "Open Coach using the local website address.")
        if self.command == "POST":
            origins = self.headers.get_all("Origin", [])
            if origins and (len(origins) != 1 or origins[0] != f"http://{hosts[0]}"):
                raise RequestError(403, "Send messages from Coach's own page.")
            types = self.headers.get_all("Content-Type", [])
            if len(types) != 1 or types[0].split(";", 1)[0].strip().lower() != "application/json":
                raise RequestError(415, "Please send JSON with Content-Type application/json.")

    def read_json(self):
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") is not None or len(lengths) != 1:
            raise RequestError(400, "Send a JSON body with its Content-Length.")
        try:
            length = int(lengths[0])
        except ValueError:
            raise RequestError(400, "Invalid request body length.") from None
        if length < 0:
            raise RequestError(400, "Invalid request body length.")
        if length > MAX_BODY:
            raise RequestError(413, "That message is too large. Please keep it under 16 KB.")
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise RequestError(400, "The message was incomplete. Please try again.")
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeError, RecursionError):
            raise RequestError(400, "That message needs to be a JSON object.") from None
        if not isinstance(data, dict):
            raise RequestError(400, "That message needs to be a JSON object.")
        return data

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_OPTIONS(self):
        self.dispatch()

    def dispatch(self):
        try:
            self.protect()
            if self.command in {"GET", "HEAD"}:
                if self.route in STATIC:
                    filename, content_type = STATIC[self.route]
                    self.respond(200, (ASSETS / filename).read_bytes(), content_type)
                elif self.route == "/api/state":
                    with self.server.turn_lock:
                        data = self.server.store.load()
                    self.respond(200, {"backend": self.server.backend, "facts": data["facts"]})
                else:
                    raise RequestError(404, "Coach couldn't find that page.")
            elif self.command == "POST":
                self.post(self.read_json())
            else:
                raise RequestError(405, "Use GET to open Coach or POST to send JSON.")
        except RequestError as error:
            self.respond(error.status, {"error": str(error)})
        except BackendError as error:
            self.respond(502, {"error": "Coach hit a snag: " + " ".join(str(error).splitlines())})
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "Please check your request and try again."})
        except (BrokenPipeError, ConnectionResetError):
            pass  # The tab closed; do not log request or response contents.
        except TimeoutError:
            self.respond(408, {"error": "That request took too long. Please try again."})
        except OSError:
            self.respond(500, {"error": "Coach can't read or write local files; check permissions and free space."})

    def post(self, body):
        if self.route not in API_PATHS - {"/api/state"}:
            raise RequestError(404, "Coach couldn't find that action.")
        # Load through save is one turn: other tabs cannot interleave memory edits.
        with self.server.turn_lock:
            store = self.server.store
            data = store.load()
            if self.route == "/api/chat":
                message = body.get("message")
                if not isinstance(message, str) or not message.strip() or len(message.strip()) > 2000:
                    raise RequestError(400, "Give Coach a message between 1 and 2000 characters.")
                previous = {fact["text"].casefold() for fact in data["facts"]}
                reply = cli.ask(store, data, self.server.backend, self.server.backend_timeout, message.strip())
                remembered = [fact["text"] for fact in data["facts"] if fact["text"].casefold() not in previous]
                result = {"reply": reply, "remembered": remembered}
            elif self.route == "/api/memory/forget":
                number = body.get("number")
                if type(number) is not int or not 1 <= number <= len(data["facts"]):
                    raise RequestError(400, "Choose a fact number shown in Coach's memory.")
                store.forget(data, number)
                result = {"facts": data["facts"]}
            else:
                if body.get("confirm") is not True:
                    raise RequestError(400, "Confirm before clearing Coach's memory.")
                store.clear()
                result = {"facts": []}
        self.respond(200, result)


def create_server(host="127.0.0.1", port=8765, backend="claude", timeout=120,
                  allow_remote=False, store=None):
    """Construct a server; port 0 lets offline tests choose an unused local port."""
    if host != "127.0.0.1" and not allow_remote:
        raise ValueError("Only --host 127.0.0.1 is allowed without --allow-remote.")
    if not 0 <= port <= 65535:
        raise ValueError("Choose a port between 0 and 65535.")
    if allow_remote:
        print("Warning: remote access is enabled with no login; anyone who can reach "
              "this server can read the memory.", file=sys.stderr, flush=True)
    return CoachServer(host, port, backend, timeout, allow_remote, store or MemoryStore())


def serve(host="127.0.0.1", port=8765, backend="claude", timeout=120, allow_remote=False):
    try:
        server = create_server(host, port, backend, timeout, allow_remote)
    except OSError:
        raise ValueError("Can't start the local server; check socket permissions and port availability.") from None
    with server as running:
        print(f"Coach is ready: http://{host}:{running.server_address[1]}", flush=True)
        try:
            running.serve_forever()
        except KeyboardInterrupt:
            print("\nCoach is heading home. See you next time!", flush=True)
