"""CLI adapters; the deterministic fake uses the same prompt and JSON protocol."""

import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile

from .protocol import CONTEXT_MARKER


class BackendError(Exception):
    """An actionable CLI failure, safe to show without subprocess diagnostics."""


def backend_argv(backend: str, output: Path) -> list[str]:
    override = os.environ.get(f"LED_TASSO_{backend.upper()}_BIN")
    if override is not None and not Path(override).is_absolute():
        raise BackendError(f"LED_TASSO_{backend.upper()}_BIN must be absolute.")
    if backend == "claude":
        return [os.environ.get("LED_TASSO_CLAUDE_BIN", "claude"),
                "-p", "--output-format", "text", "--safe-mode", "--tools", "",
                "--disable-slash-commands", "--strict-mcp-config",
                "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
                "--no-session-persistence", "--permission-mode", "dontAsk"]
    if backend == "codex":
        return [os.environ.get("LED_TASSO_CODEX_BIN", "codex"),
                "exec", "--sandbox", "read-only", "--skip-git-repo-check",
                "--ephemeral", "--ignore-user-config", "--ignore-rules",
                "--output-last-message", str(output), "-"]
    raise ValueError("Choose a backend: claude, codex, or fake.")


def fake_reply(prompt: str) -> str:
    context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
    message = context["user"]
    remember = []
    name_match = re.search(r"\bmy name is ([\w'-]+)\b", message, re.IGNORECASE)
    goal_match = re.search(r"\bI am training for ([^.!?\n]+)", message, re.IGNORECASE)
    if name_match:
        remember.append(f"User's name is {name_match[1]}.")
    if goal_match:
        remember.append(f"User is training for {goal_match[1].strip()}.")

    # This is a demo fixture, not a general language or crisis classifier.
    if any(word in message.casefold() for word in (
        "self-harm", "suicide", "kill myself", "hurt myself", "in danger",
    )):
        reply = ("I'm glad you told me, and you deserve support. Please contact local "
                 "emergency services or a crisis line, or a person you trust, right now.")
        remember = []
    else:
        name = name_match[1] if name_match else None
        goal = goal_match[1].strip() if goal_match else None
        for fact in context["facts"]:
            if name is None and fact["text"].startswith("User's name is "):
                name = fact["text"][15:].rstrip(".")
            if goal is None and fact["text"].startswith("User is training for "):
                goal = fact["text"][21:].rstrip(".")
        greeting = f"Good to see you, {name}." if name else "Glad you stopped by."
        step = (f"For {goal}, pick one small practice step you can manage today."
                if goal else "Pick one small next step you can manage today.")
        reply = f"{greeting} {step} Even a muddy field gets crossed one boot at a time."
    return json.dumps({"reply": reply, "remember": remember}, ensure_ascii=False)


def generate(backend: str, prompt: str, timeout: float = 120) -> str:
    if backend == "fake":
        return fake_reply(prompt)
    label = {"claude": "Claude", "codex": "Codex"}.get(backend, backend)
    remedy = f"Install {label} CLI, check its binary override, and log in with that CLI."
    with tempfile.TemporaryDirectory(prefix="led-tasso-") as directory:
        root = Path(directory)
        work = root / "work"
        work.mkdir()
        output = root / "reply.txt"
        argv = backend_argv(backend, output)
        try:
            proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, cwd=work, text=True,
                                    encoding="utf-8", start_new_session=True)
            try:
                stdout, _ = proc.communicate(input=prompt, timeout=timeout)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.communicate()
                raise BackendError(f"{label} CLI timed out after {timeout:g}s. "
                                   f"Check CLI login or increase --timeout. {remedy}") from None
        except FileNotFoundError:
            raise BackendError(f"{label} CLI was not found. {remedy}") from None
        except (OSError, UnicodeError):
            raise BackendError(f"{label} CLI could not run or return readable text. {remedy}") from None
        if proc.returncode != 0:
            raise BackendError(f"{label} CLI failed (exit {proc.returncode}). {remedy}")
        try:
            reply = output.read_text(encoding="utf-8") if backend == "codex" else stdout
        except (OSError, UnicodeError):
            raise BackendError(f"{label} CLI did not write a readable final message. {remedy}") from None
        if not reply.strip():
            raise BackendError(f"{label} CLI returned an empty reply. {remedy}")
        return reply
