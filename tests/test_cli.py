import builtins
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from led_tasso import cli
from led_tasso.backends import BackendError
from led_tasso.memory import MemoryStore, empty_memory
from led_tasso.protocol import CONTEXT_MARKER


# Only this explicit Python + fake invocation may escape the global subprocess block.
REAL_RUN = subprocess.run
REAL_POPEN = subprocess.Popen


def test_end_to_end_fake_ask_and_memory_list(tmp_path, monkeypatch):
    env = {**os.environ, "LED_TASSO_HOME": str(tmp_path / "home")}

    def popen(argv, **kwargs):
        assert argv[:5] == [sys.executable, "-m", "led_tasso", "--backend", "fake"]
        return REAL_POPEN(argv, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", popen)

    def run(*arguments):
        result = REAL_RUN([sys.executable, "-m", "led_tasso", "--backend", "fake", *arguments],
                          env=env, capture_output=True, text=True, timeout=10)
        assert result.returncode == 0, result.stderr
        assert result.stderr == ""
        return result.stdout

    assert "Rowan" in run("ask", "My name is Rowan. I am training for a 5K.")
    second = run("ask", "What should I work on today?")
    assert "Rowan" in second and "a 5K" in second
    assert run("memory", "list") == "1. User's name is Rowan.\n2. User is training for a 5K.\n"
    data = json.loads((tmp_path / "home" / "memory.json").read_text())
    assert len(data["turns"]) == 2 and len(data["facts"]) == 2
    assert data["turns"][-1]["coach"] == second.strip()
    assert "Fact forgotten" in run("memory", "forget", "1")
    assert "Rowan" not in run("memory", "list")
    assert run("memory", "clear", "--yes") == "Memory cleared.\n"
    assert json.loads((tmp_path / "home" / "memory.json").read_text()) == empty_memory()


def test_ask_pipeline_passes_persona_and_context(monkeypatch, capsys):
    store = MemoryStore()
    data = store.load()
    store.record(data, "earlier user", "earlier coach", ["User likes hills."])

    def generate(backend, prompt, timeout):
        assert backend == "fake" and timeout == 9
        assert "Coach Led Tasso" in prompt
        context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
        assert context["facts"] == data["facts"]
        assert context["turns"] == data["turns"]
        assert context["user"] == "I like trails."
        return 'Some text ```json\n{"reply":"Try a short trail.","remember":["User likes trails."]}\n```'

    monkeypatch.setattr(cli, "generate", generate)
    assert cli.main(["--backend", "fake", "--timeout", "9", "ask", "I like trails."]) == 0
    assert capsys.readouterr().out == "Try a short trail.\n"
    saved = store.load()
    assert [fact["text"] for fact in saved["facts"]] == ["User likes hills.", "User likes trails."]
    assert saved["turns"][-1] == {"user": "I like trails.", "coach": "Try a short trail."}


@pytest.mark.parametrize("answer, cleared", [("y", True), ("yes", True), ("n", False), ("", False), (None, False)])
def test_clear_confirmation(monkeypatch, capsys, answer, cleared):
    store = MemoryStore()
    data = store.load()
    store.record(data, "hi", "hello", ["User likes trails."])
    prompts = []

    def input_(prompt):
        prompts.append(prompt)
        if answer is None:
            raise EOFError
        return answer

    monkeypatch.setattr(builtins, "input", input_)
    assert cli.main(["memory", "clear"]) == 0
    assert prompts and "[y/N]" in prompts[0]
    assert (store.load() == empty_memory()) is cleared
    assert ("Memory cleared." if cleared else "Memory kept.") in capsys.readouterr().out


def test_clear_yes_never_prompts(monkeypatch, capsys):
    def fail(*args):
        raise AssertionError("--yes must not prompt")
    monkeypatch.setattr(builtins, "input", fail)
    assert cli.main(["memory", "clear", "--yes"]) == 0
    assert capsys.readouterr().out == "Memory cleared.\n"


@pytest.mark.parametrize("exit_message", ["/quit", None])
def test_chat_memory_and_exit(monkeypatch, capsys, exit_message):
    messages = iter(["", "My name is Rowan.", "/memory", "What next?", exit_message])

    def input_(prompt):
        value = next(messages)
        if value is None:
            raise EOFError
        return value

    monkeypatch.setattr(builtins, "input", input_)
    assert cli.main(["chat"]) == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert "1. User's name is Rowan." in output.out
    assert "Good to see you, Rowan." in output.out
    assert len(MemoryStore().load()["turns"]) == 2


def test_chat_backend_failure_then_success_keeps_memory(monkeypatch, capsys):
    store = MemoryStore()
    data = store.load()
    store.record(data, "earlier user", "earlier reply", ["User likes walks."])
    before = store.path.read_bytes()
    messages = iter(["failed turn", "successful turn", "/quit"])
    calls = []

    def generate(backend, prompt, timeout):
        context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
        calls.append(context["user"])
        assert context["facts"] == data["facts"]
        assert context["turns"] == data["turns"]
        assert store.path.read_bytes() == before
        if len(calls) == 1:
            raise BackendError("Claude CLI failed.\nInstall and log in.")
        return '{"reply":"Welcome back.","remember":["User likes hills."]}'

    monkeypatch.setattr(builtins, "input", lambda _: next(messages))
    monkeypatch.setattr(cli, "generate", generate)
    assert cli.main(["chat"]) == 0
    assert calls == ["failed turn", "successful turn"]
    output = capsys.readouterr()
    assert output.err == "Coach hit a snag: Claude CLI failed. Install and log in.\n"
    assert "Welcome back." in output.out
    saved = store.load()
    assert saved["turns"] == [*data["turns"], {"user": "successful turn", "coach": "Welcome back."}]
    assert [fact["text"] for fact in saved["facts"]] == ["User likes walks.", "User likes hills."]


@pytest.mark.parametrize("argv", [[], ["nonsense"], ["--backend", "bad", "ask", "hi"],
    ["--timeout", "0", "ask", "hi"], ["--timeout", "-1", "ask", "hi"],
    ["--timeout", "nan", "ask", "hi"], ["--timeout", "inf", "ask", "hi"],
    ["--timeout", "bad", "ask", "hi"], ["memory", "forget", "x"],
    ["memory", "forget", "1"], ["ask", "  "], ["ask", "hi", "--unknown"]])
def test_expected_errors_are_one_friendly_line(argv, capsys):
    assert cli.main(argv) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err.startswith("Coach hit a snag: ")
    assert len(output.err.splitlines()) == 1
    assert "Traceback" not in output.err


def test_backend_selection(monkeypatch):
    monkeypatch.delenv("LED_TASSO_BACKEND")
    assert cli.make_parser().parse_args(["ask", "hi"]).backend == "claude"
    monkeypatch.setenv("LED_TASSO_BACKEND", "codex")
    assert cli.make_parser().parse_args(["ask", "hi"]).backend == "codex"
    assert cli.make_parser().parse_args(["--backend", "fake", "ask", "hi"]).backend == "fake"


def test_invalid_environment_backend(monkeypatch, capsys):
    monkeypatch.setenv("LED_TASSO_BACKEND", "invalid")
    assert cli.main(["ask", "hi"]) == 1
    assert "Choose a backend" in capsys.readouterr().err


@pytest.mark.parametrize("error", [BackendError("Claude CLI failed. Install and log in."), PermissionError("secret"),
                                        KeyboardInterrupt()])
def test_pipeline_failure_does_not_save_memory(monkeypatch, capsys, error):
    def fail(*args):
        raise error
    monkeypatch.setattr(cli, "generate", fail)
    assert cli.main(["ask", "hi"]) == 1
    output = capsys.readouterr()
    assert len(output.err.splitlines()) == 1 and "Traceback" not in output.err
    assert output.out == "" and "secret" not in output.err
    assert not MemoryStore().path.exists()
