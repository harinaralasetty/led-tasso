"""Build the context and tolerate CLI prose around the reply protocol."""

import json
from pathlib import Path

from .memory import new_facts


CONTEXT_MARKER = "\nConversation data (JSON):\n"


def build_prompt(memory: dict, message: str) -> str:
    persona = Path(__file__).with_name("persona.md").read_text(encoding="utf-8")
    context = {"facts": memory["facts"], "turns": memory["turns"], "user": message}
    return persona + CONTEXT_MARKER + json.dumps(context, ensure_ascii=False)


def parse_reply(output: str) -> tuple[str, list[str]]:
    """Find the first object with a nonempty reply, otherwise preserve the text."""
    decoder = json.JSONDecoder()
    index = 0
    while (index := output.find("{", index)) != -1:
        try:
            obj, end = decoder.raw_decode(output, index)
        except ValueError:
            index += 1
            continue
        index = end
        if not isinstance(obj, dict) or not isinstance(obj.get("reply"), str):
            continue
        reply = obj["reply"].strip()
        if not reply or reply == "<what Coach says>":
            continue
        remember = obj.get("remember", [])
        if not isinstance(remember, list):
            remember = []
        return reply, new_facts(remember)
    return output.strip(), []
