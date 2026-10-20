"""Small, private JSON memory with atomic replacement and recovery."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty_memory() -> dict:
    return {"facts": [], "turns": []}


def normalize(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Memory must be an object")
    facts, turns = data["facts"], data["turns"]
    if not isinstance(facts, list) or not isinstance(turns, list):
        raise ValueError("Memory collections must be lists")
    unique, seen = [], set()
    for fact in facts:
        if (not isinstance(fact, dict)
                or not isinstance(fact.get("text"), str)
                or not isinstance(fact.get("added_at"), str)):
            raise ValueError("Invalid fact")
        text = fact["text"].strip()
        if text and text.casefold() not in seen:
            unique.append({"text": text, "added_at": fact["added_at"]})
            seen.add(text.casefold())
    for turn in turns:
        if (not isinstance(turn, dict)
                or not isinstance(turn.get("user"), str)
                or not isinstance(turn.get("coach"), str)):
            raise ValueError("Invalid turn")
    return {"facts": unique[-50:], "turns": turns[-10:]}


class MemoryStore:
    def __init__(self, home: Path | None = None):
        self.home = home if home is not None else Path(
            os.environ.get("LED_TASSO_HOME", "~/.led_tasso")
        ).expanduser()
        self.path = self.home / "memory.json"

    def load(self) -> dict:
        self.home.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            return normalize(json.loads(self.path.read_text(encoding="utf-8")))
        except FileNotFoundError:
            return empty_memory()
        except (OSError, UnicodeError, ValueError, KeyError):
            suffix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            backup = self.path.with_name(f"memory.json.bak-{suffix}")
            self.path.replace(backup)
            print(f"Warning: unreadable memory moved to {backup.name}; starting fresh.",
                  file=sys.stderr)
            return empty_memory()

    def save(self, data: dict) -> None:
        data = normalize(data)
        self.home.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".memory-", suffix=".tmp", dir=self.home)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path)
        finally:
            Path(name).unlink(missing_ok=True)

    def record(self, data: dict, user: str, reply: str, remember: list[str]) -> None:
        for text in remember:
            data["facts"].append({"text": text, "added_at": timestamp()})
        data["turns"].append({"user": user, "coach": reply})
        updated = normalize(data)
        self.save(updated)
        data.update(updated)

    def forget(self, data: dict, number: int) -> None:
        if not 1 <= number <= len(data["facts"]):
            raise ValueError("Choose a fact number shown by 'memory list'.")
        del data["facts"][number - 1]
        # Remove exchanges too so forgotten information cannot reappear as context.
        data["turns"] = []
        self.save(data)

    def clear(self) -> None:
        self.save(empty_memory())
