"""Build the context and tolerate CLI prose around the reply protocol."""

import json
from pathlib import Path


CONTEXT_MARKER = "\nConversation data (JSON):\n"


def build_prompt(memory: dict, message: str) -> str:
    persona = Path(__file__).with_name("persona.md").read_text(encoding="utf-8")
    context = {"facts": memory["facts"], "turns": memory["turns"], "user": message}
    return persona + CONTEXT_MARKER + json.dumps(context, ensure_ascii=False)


def parse_reply(output: str) -> tuple[str, list[str]]:
    """Find the first object with a nonempty reply, otherwise preserve the text."""
    decoder = json.JSONDecoder()
    for index, char in enumerate(output):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(output, index)
        except ValueError:
            continue
        if not isinstance(obj, dict) or not isinstance(obj.get("reply"), str):
            continue
        reply = obj["reply"].strip()
        if not reply:
            continue
        remember = obj.get("remember", [])
        if not isinstance(remember, list):
            remember = []
        facts = [fact.strip() for fact in remember if isinstance(fact, str) and fact.strip()]
        return reply, facts
    return output.strip(), []
