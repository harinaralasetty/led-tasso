"""Offline HTTP regression tests: only connections to our ephemeral server escape."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
import errno
import http.client
import io
import json
from pathlib import Path
import re
import socket
import threading
from types import SimpleNamespace

import pytest

from led_tasso import cli, web
from led_tasso.backends import BackendError
from led_tasso.memory import MemoryStore, empty_memory
from led_tasso.protocol import CONTEXT_MARKER


REAL_CONNECT = socket.socket.connect


class MemorySocket:
    """Feed real HTTP bytes through BaseHTTPRequestHandler without a listener."""

    def __init__(self, raw):
        self.input = io.BytesIO(raw)
        self.output = bytearray()

    def makefile(self, *args):
        return self.input

    def settimeout(self, timeout):
        pass

    def sendall(self, data):
        self.output.extend(data)


@pytest.fixture(params=["http", "in-memory"])
def server(monkeypatch, request):
    if request.param == "in-memory":
        yield SimpleNamespace(server_address=("127.0.0.1", 8765), server_port=8765,
                              backend="fake", backend_timeout=7, allow_remote=False,
                              store=MemoryStore(), turn_lock=threading.Lock(), in_memory=True)
        return
    try:
        listener = web.create_server(port=0, backend="fake", timeout=7)
    except OSError as error:
        if error.errno in (errno.EPERM, errno.EACCES):
            pytest.skip("Sandbox denies loopback socket binding; in-memory HTTP cases still run")
        raise
    with listener as server:
        address = server.server_address

        def connect(sock, target):
            assert target == address, "Only this test's local HTTP server is allowed"
            return REAL_CONNECT(sock, target)

        monkeypatch.setattr(socket.socket, "connect", connect)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .01})
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join(timeout=5)
            assert not thread.is_alive()


def exchange(server, raw):
    if getattr(server, "in_memory", False):
        sock = MemorySocket(raw)
        web.CoachHandler(sock, server.server_address, server)
        response = http.client.HTTPResponse(MemorySocket(bytes(sock.output)))
        response.begin()
        return response.status, dict(response.getheaders()), response.read()
    sock = socket.socket()
    sock.settimeout(5)
    sock.connect(server.server_address)
    try:
        sock.sendall(raw)
        response = http.client.HTTPResponse(sock)
        response.begin()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        sock.close()


def request(server, path="/api/state", method="GET", data=None, headers=None, raw=None):
    body = raw if raw is not None else json.dumps(data) if data is not None else None
    body = body.encode("utf-8") if isinstance(body, str) else body or b""
    values = {"Content-Type": "application/json", "Host": f"127.0.0.1:{server.server_port}",
              "Content-Length": str(len(body)), **(headers or {})}
    raw = f"{method} {path} HTTP/1.0\r\n" + "".join(f"{key}: {value}\r\n" for key, value in values.items())
    return exchange(server, raw.encode() + b"\r\n" + body)


def api(server, path="/api/state", data=None, **kwargs):
    status, headers, body = request(server, path, "POST" if data is not None else "GET", data, **kwargs)
    assert headers["Content-Type"] == "application/json; charset=utf-8"
    return status, json.loads(body)


@pytest.mark.parametrize("path, content_type, marker", [
    ("/", "text/html", b"Coach Led Tasso"),
    ("/index.html", "text/html", b"chat-form"),
    ("/app.js", "text/javascript", b"textContent"),
    ("/style.css", "text/css", b"prefers-reduced-motion"),
])
def test_static_files_and_content_types(server, path, content_type, marker):
    status, headers, body = request(server, path)
    assert status == 200 and marker in body
    assert headers["Content-Type"] == content_type + "; charset=utf-8"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]


@pytest.mark.parametrize("path", [
    "/../memory.py", "/%2e%2e/memory.py", "/%2e%2e%2fpersona.md", "/web/",
    "/web/../../README.md", "/app.js/../persona.md", "/%2Fetc%2Fpasswd",
    "/..%5cmemory.py", "/%00", "/persona.md", "/web.py", "/.git/config",
])
def test_path_traversal_and_directory_listing_blocked(server, path):
    assert api(server, path)[0] == 404


def test_state_and_chat_use_shared_ask_pipeline(server, monkeypatch):
    original = cli.ask
    calls = []

    def ask(store, data, backend, timeout, message):
        calls.append((backend, timeout, message))
        return original(store, data, backend, timeout, message)

    monkeypatch.setattr(cli, "ask", ask)
    assert api(server) == (200, {"backend": "fake", "facts": []})
    status, result = api(server, "/api/chat", {"message": "  My name is Rowan.  "})
    assert status == 200 and "Rowan" in result["reply"]
    assert result["remembered"] == ["User's name is Rowan."]
    assert calls == [("fake", 7, "My name is Rowan.")]
    _, state = api(server)
    assert state["facts"] == server.store.load()["facts"]
    assert state["facts"][0]["text"] == "User's name is Rowan."
    assert state["facts"][0]["added_at"]
    assert api(server, "/api/chat", {"message": "My name is Rowan."})[1]["remembered"] == []
    assert "Rowan" in api(server, "/api/chat", {"message": "What next?"})[1]["reply"]
    assert len(server.store.load()["turns"]) == 3


@pytest.mark.parametrize("body", [{}, {"message": ""}, {"message": " \n "},
    {"message": "x" * 2001}, {"message": 7}, {"message": None}, {"message": ["hello"]}])
def test_invalid_message_is_400_without_saving(server, body):
    assert api(server, "/api/chat", body)[0] == 400
    assert server.store.load() == empty_memory()


def test_max_message_length_after_stripping(server):
    assert api(server, "/api/chat", {"message": " " + "x" * 2000 + " "})[0] == 200


@pytest.mark.parametrize("raw", ["[1]", "null", "{bad", '"hello"', b"\xff", "[" * 1500],
                         ids=["array", "null", "invalid", "string", "encoding", "deep"])
def test_malformed_json_is_400(server, raw):
    assert request(server, "/api/chat", "POST", raw=raw)[0] == 400


def test_oversize_body_is_413_even_without_sending_it(server):
    assert request(server, "/api/chat", "POST", raw="{}",
                   headers={"Content-Length": str(web.MAX_BODY + 1)})[0] == 413
    assert api(server, "/api/chat", {"message": "x" * web.MAX_BODY})[0] == 413


@pytest.mark.parametrize("value", ["text/plain", "text/html", "application/x-www-form-urlencoded", ""])
def test_wrong_content_type_is_415(server, value):
    assert api(server, "/api/chat", {"message": "hi"}, headers={"Content-Type": value})[0] == 415


def test_json_charset_and_same_origin_allowed(server):
    origin = f"http://localhost:{server.server_port}"
    headers = {"Host": f"localhost:{server.server_port}", "Origin": origin,
               "Content-Type": "application/json; charset=utf-8"}
    assert api(server, "/api/chat", {"message": "hi"}, headers=headers)[0] == 200


@pytest.mark.parametrize("origin", ["https://example.invalid", "null", "http://localhost:1", ""])
def test_foreign_origin_is_403(server, origin):
    assert api(server, "/api/chat", {"message": "hi"}, headers={"Origin": origin})[0] == 403


@pytest.mark.parametrize("host", ["example.invalid", "localhost", "127.0.0.1:1", "evil.localhost:8765", ""])
@pytest.mark.parametrize("path, data", [("/", None), ("/api/state", None), ("/api/chat", {"message": "hi"})])
def test_foreign_host_is_403(server, host, path, data):
    assert api(server, path, data, headers={"Host": host})[0] == 403


def test_duplicate_security_headers_rejected(server):
    raw = (f"GET /api/state HTTP/1.0\r\nHost: localhost:{server.server_port}\r\n"
           "Host: example.invalid\r\n\r\n").encode()
    assert exchange(server, raw)[0] == 403


@pytest.mark.parametrize("header, status", [("Origin", 403), ("Content-Type", 415), ("Content-Length", 400)])
def test_duplicate_post_headers_rejected(server, header, status):
    values = {"Origin": f"http://localhost:{server.server_port}",
              "Content-Type": "application/json", "Content-Length": "2"}
    raw = (f"POST /api/chat HTTP/1.0\r\nHost: localhost:{server.server_port}\r\n" +
           "".join(f"{key}: {value}\r\n" for key, value in values.items()) +
           f"{header}: {values[header]}\r\n\r\n{{}}")
    assert exchange(server, raw.encode())[0] == status


def test_missing_content_length_rejected(server):
    raw = (f"POST /api/chat HTTP/1.0\r\nHost: localhost:{server.server_port}\r\n"
           "Content-Type: application/json\r\n\r\n{}")
    assert exchange(server, raw.encode())[0] == 400


@pytest.mark.parametrize("length", ["-1", "broken"])
def test_invalid_content_length_is_400(server, length):
    assert request(server, "/api/chat", "POST", raw="{}", headers={"Content-Length": length})[0] == 400


def test_transfer_encoding_is_rejected(server):
    assert request(server, "/api/chat", "POST", raw="{}", headers={"Transfer-Encoding": "chunked"})[0] == 400


def test_backend_error_is_friendly_502_and_preserves_memory(server, monkeypatch, capsys):
    api(server, "/api/chat", {"message": "My name is Rowan."})
    before = server.store.path.read_bytes()

    def fail(*args):
        raise BackendError("Claude CLI failed.\nInstall and log in.")

    monkeypatch.setattr(cli, "generate", fail)
    assert api(server, "/api/chat", {"message": "secret message"}) == (
        502, {"error": "Coach hit a snag: Claude CLI failed. Install and log in."})
    assert server.store.path.read_bytes() == before
    output = capsys.readouterr()
    assert "Traceback" not in output.err and "Rowan" not in output.err and "secret" not in output.err


def test_forget_clear_and_confirmation(server):
    api(server, "/api/chat", {"message": "My name is Rowan. I am training for a 5K."})
    status, result = api(server, "/api/memory/forget", {"number": 1})
    assert status == 200
    assert [fact["text"] for fact in result["facts"]] == ["User is training for a 5K."]
    assert server.store.load()["turns"] == []
    for body in ({}, {"confirm": False}, {"confirm": "true"}, {"confirm": 1}):
        assert api(server, "/api/memory/clear", body)[0] == 400
        assert server.store.load()["facts"]
    assert api(server, "/api/memory/clear", {"confirm": True}) == (200, {"facts": []})
    assert server.store.load() == empty_memory()
    assert api(server)[1]["facts"] == []


@pytest.mark.parametrize("number", [0, -1, 1, True, "1", None, 1.5])
def test_invalid_forget_number(server, number):
    assert api(server, "/api/memory/forget", {"number": number})[0] == 400


def test_two_simultaneous_chats_are_complete_serial_turns(server, monkeypatch):
    first_entered = threading.Event()
    release_first = threading.Event()
    second_waiting = threading.Event()
    contexts = []

    class ObservedLock:
        def __init__(self):
            self.lock = threading.Lock()

        def __enter__(self):
            if self.lock.locked():
                second_waiting.set()
            self.lock.acquire()

        def __exit__(self, *args):
            self.lock.release()

    server.turn_lock = ObservedLock()

    def generate(backend, prompt, timeout):
        context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
        contexts.append(context)
        if len(contexts) == 1:
            first_entered.set()
            assert release_first.wait(3)
        return json.dumps({"reply": "One step at a time.", "remember": [context["user"]]})

    monkeypatch.setattr(cli, "generate", generate)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(api, server, "/api/chat", {"message": "First fact"})
        try:
            assert first_entered.wait(3)
            other = pool.submit(api, server, "/api/chat", {"message": "Second fact"})
            assert second_waiting.wait(3)
            assert len(contexts) == 1
        finally:
            release_first.set()
        assert first.result()[0] == other.result()[0] == 200
    assert contexts[1]["facts"][0]["text"] == "First fact"
    assert contexts[1]["turns"][0]["user"] == "First fact"
    assert len(server.store.load()["facts"]) == len(server.store.load()["turns"]) == 2


def test_logs_contain_only_method_safe_path_status(server, capsys):
    api(server, "/api/chat", {"message": "My name is SECRETNAME."})
    request(server, "/api/state?SECRETQUERY")
    request(server, "/SECRETUNKNOWN")
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err.splitlines() == ["POST /api/chat 200", "GET /api/state 200", "GET [unrecognized] 404"]


@pytest.mark.parametrize("host", ["0.0.0.0", "localhost", "::1", "example.invalid"])
def test_non_loopback_host_refused_without_opt_in(host):
    with pytest.raises(ValueError, match="--allow-remote"):
        web.create_server(host=host, port=0)


def test_allow_remote_warning_and_origin_protection(server, monkeypatch, capsys):
    def construct(host, port, backend, timeout, allow_remote, store):
        assert (host, port, backend, allow_remote) == ("0.0.0.0", 0, "fake", True)
        return server

    monkeypatch.setattr(web, "CoachServer", construct)
    assert web.create_server(host="0.0.0.0", port=0, backend="fake", allow_remote=True) is server
    assert "no login" in capsys.readouterr().err
    server.allow_remote = True
    headers = {"Host": "coach.example:8765", "Origin": "http://coach.example:8765"}
    assert api(server, "/api/chat", {"message": "hi"}, headers=headers)[0] == 200
    headers["Origin"] = "http://foreign.example"
    assert api(server, "/api/chat", {"message": "hi"}, headers=headers)[0] == 403


def test_serve_parser_accepts_both_option_positions():
    for args in (["--backend", "fake", "--timeout", "9", "serve"],
                 ["serve", "--backend", "fake", "--timeout", "9"]):
        parsed = cli.make_parser().parse_args(args)
        assert parsed.backend == "fake" and parsed.timeout == 9
        assert parsed.host == "127.0.0.1" and parsed.port == 8765


def test_serve_ctrl_c_is_clean(monkeypatch, capsys):
    def interrupt():
        raise KeyboardInterrupt

    server = SimpleNamespace(server_address=("127.0.0.1", 8765), serve_forever=interrupt)
    monkeypatch.setattr(web, "create_server", lambda *args: nullcontext(server))
    assert cli.main(["--backend", "fake", "serve", "--port", "0"]) == 0
    output = capsys.readouterr()
    assert "http://127.0.0.1:" in output.out and "heading home" in output.out
    assert output.err == ""


def test_serve_refuses_invalid_host_and_port(capsys):
    for args in (["--host", "0.0.0.0"], ["--port", "-1"], ["--port", "65536"]):
        assert cli.main(["serve", *args]) == 1
        assert len(capsys.readouterr().err.splitlines()) == 1


def test_serve_socket_failure_is_friendly(monkeypatch, capsys):
    def fail(*args):
        raise PermissionError("private diagnostics")

    monkeypatch.setattr(web, "create_server", fail)
    assert cli.main(["serve"]) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Coach hit a snag: Can't start the local server; check socket permissions and port availability.\n"


@pytest.mark.parametrize("theme", [0, 1], ids=["light", "dark"])
def test_text_colour_contrast_is_at_least_4_5(theme):
    css = (web.ASSETS / "style.css").read_text()
    roots = re.findall(r":root\s*\{([^}]+)\}", css)
    colours = dict(re.findall(r"--([\w-]+)\s*:\s*(#[0-9a-f]{6})", roots[theme]))

    def luminance(colour):
        rgb = [int(colour[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in rgb]
        return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))

    pairs = [(text, background) for text in ("ink", "muted") for background in ("page", "panel", "stage", "bubble")]
    pairs += [("user-ink", "user"), ("accent-ink", "accent"), ("error", "bubble")]
    for text, background in pairs:
        first, second = sorted((luminance(colours[text]), luminance(colours[background])))
        assert (second + .05) / (first + .05) >= 4.5, (text, background)


def test_static_page_is_local_accessible_and_uses_text_nodes():
    page = (web.ASSETS / "index.html").read_text()
    script = (web.ASSETS / "app.js").read_text()
    css = (web.ASSETS / "style.css").read_text()
    assert "innerHTML" not in script and "outerHTML" not in script and "insertAdjacentHTML" not in script
    assert "textContent" in script and "replaceChildren" in script
    assert not re.search(r"https?://|(?:src|href)=[\"']\s*//|url\(\s*[\"']?//", page + script + css)
    assert 'aria-live="polite"' in page and 'aria-atomic="true"' in page
    assert 'role="img"' in page and 'aria-labelledby="coach-title coach-desc"' in page
    assert "prefers-reduced-motion" in css and "prefers-reduced-motion" in script
    assert re.search(r"prefers-color-scheme\s*:\s*dark", css) and ":focus-visible" in css
    for state in ("idle", "thinking", "talking", "cheer"):
        assert f"#coach.{state}" in css
    assert "announcer.textContent = `Coach: ${reply}`" in script
    package = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text()
    assert all(f'"web/*.{extension}"' in package for extension in ("html", "js", "css"))
