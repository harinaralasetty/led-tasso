import json
from pathlib import Path
import subprocess

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
def test_cli_execution_isolated_and_cleanup(monkeypatch, backend):
    directories = []
    outputs = []

    def run(argv, **kwargs):
        cwd = kwargs["cwd"]
        assert cwd.is_dir() and list(cwd.iterdir()) == []
        assert cwd != Path.cwd()
        assert kwargs == {"input": "private prompt", "cwd": cwd, "capture_output": True,
                          "text": True, "encoding": "utf-8", "timeout": 3.5, "check": False}
        directories.append(cwd)
        if backend == "codex":
            output = Path(argv[argv.index("--output-last-message") + 1])
            assert output.parent != cwd
            outputs.append(output)
            output.write_text('{"reply":"Final message","remember":[]}')
            return subprocess.CompletedProcess(argv, 0, "ignore diagnostic stdout", "")
        assert argv[1] == "-p"
        return subprocess.CompletedProcess(argv, 0, '{"reply":"Final message","remember":[]}', "")

    monkeypatch.setattr(subprocess, "run", run)
    for _ in range(2):
        assert parse_reply(generate(backend, "private prompt", 3.5)) == ("Final message", [])
    assert directories[0] != directories[1]
    assert all(not path.exists() for path in directories + outputs)


@pytest.mark.parametrize("backend", ["claude", "codex"])
@pytest.mark.parametrize("failure", ["missing", "exit", "timeout", "permission", "empty", "output"])
def test_backend_errors(monkeypatch, backend, failure, capsys):
    directories = []

    def run(argv, **kwargs):
        directories.append(kwargs["cwd"])
        if failure == "missing":
            raise FileNotFoundError("SECRET detail")
        if failure == "timeout":
            raise subprocess.TimeoutExpired(argv, 7, output="SECRET prompt")
        if failure == "permission":
            raise PermissionError("SECRET location")
        if failure == "exit":
            return subprocess.CompletedProcess(argv, 23, "SECRET stdout", "SECRET stderr")
        if backend == "codex" and failure == "empty":
            Path(argv[argv.index("--output-last-message") + 1]).write_text("")
        return subprocess.CompletedProcess(argv, 0, "" if failure == "empty" else "fine", "")

    monkeypatch.setattr(subprocess, "run", run)
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
    if failure == "exit":
        assert "exit 23" in message
    assert all(not directory.exists() for directory in directories)
    assert capsys.readouterr() == ("", "")


def test_default_timeout(monkeypatch):
    def run(argv, **kwargs):
        assert kwargs["timeout"] == 120
        return subprocess.CompletedProcess(argv, 0, "hello", "")
    monkeypatch.setattr(subprocess, "run", run)
    assert generate("claude", "prompt") == "hello"


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
