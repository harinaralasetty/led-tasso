"""Tests may never launch a model CLI or use a real memory home."""

import subprocess
import socket

import pytest


@pytest.fixture(autouse=True)
def offline_home(monkeypatch, tmp_path):
    monkeypatch.setenv("LED_TASSO_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("LED_TASSO_BACKEND", "fake")
    monkeypatch.delenv("LED_TASSO_CLAUDE_BIN", raising=False)
    monkeypatch.delenv("LED_TASSO_CODEX_BIN", raising=False)

    def blocked(*args, **kwargs):
        raise AssertionError("Tests must mock real CLI and network calls")

    monkeypatch.setattr(subprocess, "run", blocked)
    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
