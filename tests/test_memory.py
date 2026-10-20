import json
import os
from pathlib import Path
import stat

import pytest

from led_tasso.memory import MemoryStore, empty_memory


def test_defaults_and_private_directory(monkeypatch, tmp_path):
    store = MemoryStore()
    assert store.path == tmp_path / "home" / "memory.json"
    assert store.load() == empty_memory()
    assert stat.S_IMODE(store.home.stat().st_mode) == 0o700
    monkeypatch.delenv("LED_TASSO_HOME")
    assert MemoryStore().path == Path.home() / ".led_tasso" / "memory.json"


def test_dedupe_cap_and_last_ten_exchanges(tmp_path):
    store = MemoryStore(tmp_path / "memory")
    data = store.load()
    for index in range(55):
        store.record(data, f"Question {index}", f"Reply {index}",
                     [f"Fact {index}", f" FACT {index} "])
    reloaded = store.load()
    assert reloaded == data
    assert len(data["facts"]) == 50
    assert data["facts"][0]["text"] == "Fact 5"
    assert data["facts"][-1]["text"] == "Fact 54"
    assert all(fact["added_at"].endswith("+00:00") for fact in data["facts"])
    assert len(data["turns"]) == 10
    assert data["turns"][0] == {"user": "Question 45", "coach": "Reply 45"}


def test_casefold_dedupe_keeps_original_timestamp(tmp_path):
    store = MemoryStore(tmp_path)
    data = store.load()
    store.record(data, "one", "reply", ["Straße"])
    original = data["facts"][0].copy()
    store.record(data, "two", "reply", ["STRASSE"])
    assert data["facts"] == [original]


def test_atomic_replace_and_private_file(monkeypatch, tmp_path):
    store = MemoryStore(tmp_path)
    old = empty_memory()
    store.save(old)
    new = {"facts": [{"text": "User likes hills.", "added_at": "today"}], "turns": []}
    real_replace = os.replace
    observed = []

    def replace(source, destination):
        assert Path(source).parent == destination.parent
        assert json.loads(destination.read_text()) == old
        assert json.loads(Path(source).read_text()) == new
        observed.append(True)
        return real_replace(source, destination)

    monkeypatch.setattr(os, "replace", replace)
    store.save(new)
    assert observed == [True]
    assert store.load() == new
    assert stat.S_IMODE(store.path.stat().st_mode) == 0o600
    assert list(tmp_path.glob(".memory-*.tmp")) == []


def test_failed_replace_preserves_old_file_and_removes_temp(monkeypatch, tmp_path):
    store = MemoryStore(tmp_path)
    store.save(empty_memory())

    def fail(*args):
        raise PermissionError("blocked")

    monkeypatch.setattr(os, "replace", fail)
    with pytest.raises(PermissionError):
        store.save({"facts": [{"text": "new", "added_at": "today"}], "turns": []})
    assert store.load() == empty_memory()
    assert list(tmp_path.glob(".memory-*.tmp")) == []


@pytest.mark.parametrize("raw", [b"not JSON", b"\xff", b"[]", b"{}",
    b'{"facts": "bad", "turns": []}', b'{"facts":[4],"turns":[]}',
    b'{"facts":[],"turns":[{"user":4,"coach":"x"}]}'])
def test_corrupt_recovery(raw, tmp_path, capsys):
    store = MemoryStore(tmp_path)
    store.path.write_bytes(raw)
    assert store.load() == empty_memory()
    backups = list(tmp_path.glob("memory.json.bak-*"))
    assert len(backups) == 1
    assert backups[0].read_bytes() == raw
    assert "Warning: unreadable memory moved" in capsys.readouterr().err
    store.save(empty_memory())
    assert store.load() == empty_memory()


def test_unreadable_file_recovery(monkeypatch, tmp_path, capsys):
    store = MemoryStore(tmp_path)
    store.save(empty_memory())
    read_text = Path.read_text

    def unreadable(path, *args, **kwargs):
        if path == store.path:
            raise PermissionError("unreadable")
        return read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", unreadable)
    assert store.load() == empty_memory()
    assert len(list(tmp_path.glob("memory.json.bak-*"))) == 1
    assert "starting fresh" in capsys.readouterr().err


def test_forget_and_clear(tmp_path):
    store = MemoryStore(tmp_path)
    data = store.load()
    store.record(data, "User text", "Coach text", ["Fact one", "Fact two"])
    store.forget(data, 1)
    assert [fact["text"] for fact in store.load()["facts"]] == ["Fact two"]
    assert store.load()["turns"] == []
    store.clear()
    assert store.load() == empty_memory()


@pytest.mark.parametrize("number", [0, -1, 2])
def test_forget_invalid_number(tmp_path, number):
    store = MemoryStore(tmp_path)
    data = store.load()
    store.record(data, "x", "y", ["Only fact"])
    with pytest.raises(ValueError, match="fact number"):
        store.forget(data, number)
    assert len(store.load()["facts"]) == 1
