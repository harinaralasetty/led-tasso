import json
from pathlib import Path

import pytest

from led_tasso.protocol import CONTEXT_MARKER, build_prompt, parse_reply


@pytest.mark.parametrize("output", [
    '{"reply":"Nice work. Take a breather.","remember":["User likes hiking."]}',
    '```json\n{"reply":"Nice work. Take a breather.","remember":["User likes hiking."]}\n```',
    'Here you go: {"reply":"Nice work. Take a breather.","remember":["User likes hiking."]} Cheers!',
    '{invalid} {"other": 1} {"reply":"Nice work. Take a breather.","remember":["User likes hiking."]}',
])
def test_reply_wrappers(output):
    assert parse_reply(output) == ("Nice work. Take a breather.", ["User likes hiking."])


@pytest.mark.parametrize("output", [" garbage \n", "```broken```", "", '{"other": 1}',
                                         '{"reply": false}', '{"reply":" "}'])
def test_unstructured_fallback(output):
    assert parse_reply(output) == (output.strip(), [])


@pytest.mark.parametrize("remember, expected", [
    (None, []), ("not a list", []), ({"fact": "x"}, []),
    ([" trimmed ", "", " ", 1, None, {}], ["trimmed"]),
])
def test_remember_types(remember, expected):
    assert parse_reply(json.dumps({"reply": " Hello ", "remember": remember})) == ("Hello", expected)


def test_reply_escaping_and_missing_remember():
    assert parse_reply('{"reply": "A brace { and a \\"quote\\"."}') == ('A brace { and a "quote".', [])


def test_prompt_contains_persona_facts_turns_and_current_message():
    data = {"facts": [{"text": "User likes hiking.", "added_at": "today"}],
            "turns": [{"user": "Last question", "coach": "Earlier reply"}]}
    message = 'Current question: "what next?"\nWith another line.'
    prompt = build_prompt(data, message)
    persona = Path("led_tasso/persona.md").read_text()
    assert prompt.startswith(persona)
    context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
    assert context == {**data, "user": message}
    assert "self-harm" in persona
    assert "emergency services" in persona
    assert "medical, legal" in persona
    assert "USER explicitly stated" in persona
