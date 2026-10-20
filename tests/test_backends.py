import json
import os
from pathlib import Path
import signal
import subprocess
from types import SimpleNamespace

import pytest

from led_tasso.backends import BackendError, backend_argv, generate
from led_tasso.memory import empty_memory
from led_tasso.protocol import build_prompt, parse_reply


def test_exact_argv_and_overrides(monkeypatch, tmp_path):
    output = tmp_path / "reply.txt"
    assert backend_argv("claude", output) == [
        "claude", "-p", "--output-format", "text", "--safe-mode", "--tools", "",
        "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
        "--setting-sources", "", "--no-session-persistence", "--permission-mode", "dontAsk",
    ]
    assert backend_argv("codex", output) == [
        "codex", "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
        "--ignore-user-config", "--ignore-rules", "--output-last-message", str(output), "-",
    ]
    for backend in ("claude", "codex"):
        monkeypatch.setenv(f"LED_TASSO_{backend.upper()}_BIN", "/some path/tool")
        assert backend_argv(backend, output)[0] == "/some path/tool"


@pytest.mark.parametrize("backend", ["claude", "codex"])
@pytest.mark.parametrize("override", ["tool", "./tool", "../bin/tool", "~/bin/tool", ""])
def test_binary_override_must_be_absolute(monkeypatch, tmp_path, backend, override):
    variable = f"LED_TASSO_{backend.upper()}_BIN"
    monkeypatch.setenv(variable, override)
    with pytest.raises(BackendError, match=f"{variable} must be absolute"):
        generate(backend, "private prompt")


@pytest.mark.parametrize("backend", ["claude", "codex"])
def test_cli_execution_isolated_and_cleanup(monkeypatch, backend):
    directories = []
    outputs = []

    def popen(argv, **kwargs):
        cwd = kwargs["cwd"]
        assert cwd.is_dir() and list(cwd.iterdir()) == []
        assert cwd != Path.cwd()
        assert kwargs == {"cwd": cwd, "stdin": subprocess.PIPE, "stdout": subprocess.PIPE,
                          "stderr": subprocess.PIPE, "text": True, "encoding": "utf-8",
                          "start_new_session": True}
        directories.append(cwd)

        def communicate(*, input, timeout):
            assert input == "private prompt" and timeout == 3.5
            return ('{"reply":"Final message","remember":[]}' if backend == "claude"
                    else "ignore diagnostic stdout"), ""

        if backend == "codex":
            output = Path(argv[argv.index("--output-last-message") + 1])
            assert output.parent != cwd
            outputs.append(output)
            output.write_text('{"reply":"Final message","remember":[]}')
        else:
            assert argv[1] == "-p"
        return SimpleNamespace(returncode=0, communicate=communicate)

    monkeypatch.setattr(subprocess, "Popen", popen)
    for _ in range(2):
        assert parse_reply(generate(backend, "private prompt", 3.5)) == ("Final message", [])
    assert directories[0] != directories[1]
    assert all(not path.exists() for path in directories + outputs)


@pytest.mark.parametrize("backend", ["claude", "codex"])
@pytest.mark.parametrize("failure", ["missing", "exit", "timeout", "permission", "empty", "output"])
def test_backend_errors(monkeypatch, backend, failure, capsys):
    directories = []
    killed = []
    reaped = []

    def popen(argv, **kwargs):
        directories.append(kwargs["cwd"])
        if failure == "missing":
            raise FileNotFoundError("SECRET detail")
        if failure == "permission":
            raise PermissionError("SECRET location")
        if backend == "codex" and failure == "empty":
            Path(argv[argv.index("--output-last-message") + 1]).write_text("")

        def communicate(input=None, timeout=None):
            if failure == "timeout":
                if timeout is not None:
                    raise subprocess.TimeoutExpired(argv, timeout, output="SECRET prompt")
                assert killed == [(123456, signal.SIGKILL)]
                reaped.append(True)
            return ("" if failure == "empty" else "fine"), "SECRET stderr"

        return SimpleNamespace(returncode=23 if failure == "exit" else 0,
                               pid=123456, communicate=communicate)

    monkeypatch.setattr(subprocess, "Popen", popen)
    monkeypatch.setattr(os, "killpg", lambda pid, sig: killed.append((pid, sig)))
    if backend == "claude" and failure == "output":
        assert generate(backend, "SECRET prompt", 7) == "fine"
        return
    with pytest.raises(BackendError) as exc:
        generate(backend, "SECRET prompt", 7)
    message = str(exc.value)
    assert backend.capitalize() in message
    assert "Install" in message and "log in" in message
    assert "SECRET" not in message
    if failure == "timeout":
        assert "7s" in message and "--timeout" in message
        assert killed == [(123456, signal.SIGKILL)] and reaped == [True]
    if failure == "exit":
        assert "exit 23" in message
    assert all(not directory.exists() for directory in directories)
    assert capsys.readouterr() == ("", "")


def test_default_timeout(monkeypatch):
    def communicate(*, input, timeout):
        assert input == "prompt" and timeout == 120
        return "hello", ""
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs:
                        SimpleNamespace(returncode=0, communicate=communicate))
    assert generate("claude", "prompt") == "hello"


def test_timeout_reaps_when_process_group_already_exited(monkeypatch):
    calls = []

    def communicate(input=None, timeout=None):
        calls.append((input, timeout))
        if timeout is not None:
            raise subprocess.TimeoutExpired("mock CLI", timeout)
        return "", ""

    def killpg(pid, sig):
        assert pid == 123456 and sig == signal.SIGKILL
        raise ProcessLookupError

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs:
                        SimpleNamespace(pid=123456, returncode=0, communicate=communicate))
    monkeypatch.setattr(os, "killpg", killpg)
    with pytest.raises(BackendError, match="timed out"):
        generate("claude", "prompt", 0.1)
    assert calls == [("prompt", 0.1), (None, None)]


def test_fake_is_deterministic_and_only_remembers_explicit_supported_facts():
    prompt = build_prompt(empty_memory(), "My name is Rowan. I am training for a 5K.")
    assert generate("fake", prompt) == generate("fake", prompt)
    reply, facts = parse_reply(generate("fake", prompt))
    assert "Rowan" in reply and "a 5K" in reply
    assert facts == ["User's name is Rowan.", "User is training for a 5K."]
    assert parse_reply(generate("fake", build_prompt(empty_memory(), "You are a great coach")))[1] == []


def test_fake_crisis_drops_jokes():
    reply, facts = parse_reply(generate("fake", build_prompt(empty_memory(), "I am in danger")))
    assert "right now" in reply
    assert "emergency services" in reply and "trust" in reply
    assert "muddy" not in reply and facts == []
