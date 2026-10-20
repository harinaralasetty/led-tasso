import json
from pathlib import Path

import pytest

import led_tasso
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


def test_nested_reply_in_invalid_outer_object_is_not_used():
    output = '{"meta":{"reply":"inner"},"reply":5}'
    assert parse_reply(output) == (output, [])


def test_template_echo_followed_by_real_reply():
    template = '{"reply":"<what Coach says>","remember":["<fact>"]}'
    real = '{"reply":"Take one small step.","remember":["User likes walks."]}'
    assert parse_reply(template + "\n" + real) == ("Take one small step.", ["User likes walks."])


def test_first_valid_outer_reply_wins():
    output = '{"meta":{"reply":"inner"},"reply":"outer"} {"reply":"later"}'
    assert parse_reply(output) == ("outer", [])


def test_reply_facts_are_limited_to_five():
    facts = ["", " \n ", None, *[f"Fact {i}" for i in range(50)]]
    assert parse_reply(json.dumps({"reply": "Hello", "remember": facts}))[1] == facts[3:8]


@pytest.mark.parametrize("fact, expected", [
    ("x" * (100 * 1024), "x" * 200),
    ("  User\n likes\t long   walks.\r\n", "User likes long walks."),
], ids=["100KB", "newlines"])
def test_reply_facts_are_sanitized(fact, expected):
    assert parse_reply(json.dumps({"reply": "Hello", "remember": [fact]})) == ("Hello", [expected])


def test_prompt_contains_persona_facts_turns_and_current_message():
    data = {"facts": [{"text": "User likes hiking.", "added_at": "today"}],
            "turns": [{"user": "Last question", "coach": "Earlier reply"}]}
    message = 'Current question: "what next?"\nWith another line.'
    prompt = build_prompt(data, message)
    persona = Path(led_tasso.__file__).with_name("persona.md").read_text()
    assert prompt.startswith(persona)
    context = json.loads(prompt.split(CONTEXT_MARKER, 1)[1])
    assert context == {**data, "user": message}
    assert "self-harm" in persona
    assert "emergency services" in persona
    assert "medical, legal" in persona
    assert "USER explicitly stated" in persona
