"""Terminal commands and one shared ask pipeline."""

import argparse
import math
import os
import sys

from .backends import BackendError, generate
from .memory import MemoryStore
from .protocol import build_prompt, parse_reply


class UsageError(Exception):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise UsageError(message)


def positive_timeout(value: str) -> float:
    try:
        number = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("timeout must be a positive number") from None
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("timeout must be a positive finite number")
    return number


def make_parser() -> Parser:
    parser = Parser(description="Chat with Coach Led Tasso, an original encouraging coach.")
    parser.add_argument("--backend", choices=("claude", "codex", "fake"),
                        default=os.environ.get("LED_TASSO_BACKEND", "claude"))
    parser.add_argument("--timeout", type=positive_timeout, default=120,
                        help="CLI timeout in seconds (default: 120)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("chat", help="Start a conversation; /quit exits, /memory lists facts")
    ask = commands.add_parser("ask", help="Ask once")
    ask.add_argument("text")
    memory = commands.add_parser("memory", help="Manage local memory")
    actions = memory.add_subparsers(dest="action", required=True)
    actions.add_parser("list", help="List remembered facts")
    forget = actions.add_parser("forget", help="Forget one fact and reset recent conversation")
    forget.add_argument("number", type=int)
    clear = actions.add_parser("clear", help="Clear facts and recent conversation")
    clear.add_argument("--yes", action="store_true", help="Skip confirmation")
    return parser


def list_facts(data: dict) -> None:
    if not data["facts"]:
        print("No remembered facts yet.")
    for index, fact in enumerate(data["facts"], 1):
        print(f"{index}. {fact['text']}")


def ask(store: MemoryStore, data: dict, backend: str, timeout: float, message: str) -> str:
    if not message.strip():
        raise ValueError("Give Coach a little text to work with.")
    output = generate(backend, build_prompt(data, message), timeout)
    reply, remember = parse_reply(output)
    store.record(data, message, reply, remember)
    return reply


def run(args) -> None:
    if args.backend not in ("claude", "codex", "fake"):
        raise ValueError("Choose a backend: claude, codex, or fake.")
    store = MemoryStore()
    data = store.load()
    if args.command == "ask":
        print(ask(store, data, args.backend, args.timeout, args.text))
    elif args.command == "chat":
        print("Coach Led Tasso is here. /memory lists facts; /quit heads home.")
        while True:
            try:
                message = input("You: ").strip()
            except EOFError:
                break
            if message == "/quit":
                break
            if message == "/memory":
                list_facts(data)
            elif message:
                print(ask(store, data, args.backend, args.timeout, message))
    elif args.action == "list":
        list_facts(data)
    elif args.action == "forget":
        store.forget(data, args.number)
        print("Fact forgotten; recent conversation reset.")
    elif args.action == "clear":
        confirmed = args.yes
        if not confirmed:
            try:
                confirmed = input("Clear all facts and recent conversation? [y/N] ").strip().lower() in ("y", "yes")
            except EOFError:
                confirmed = False
        if confirmed:
            store.clear()
            print("Memory cleared.")
        else:
            print("Memory kept.")


def main(argv: list[str] | None = None) -> int:
    try:
        args = make_parser().parse_args(argv)
        run(args)
    except (UsageError, BackendError, ValueError) as error:
        print("Coach hit a snag: " + " ".join(str(error).splitlines()), file=sys.stderr)
        return 1
    except OSError:
        print("Coach hit a snag: can't read or write local files; check permissions and free space.",
              file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Coach hit a snag: interrupted; try again when you're ready.", file=sys.stderr)
        return 1
    return 0
