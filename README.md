# Led Tasso

A terminal chat with Coach Led Tasso, an original, encouraging small-town coach who remembers you.

**Not affiliated:** This is an original character, not connected to any TV show, studio, or streaming service.

## Quickstart (Python 3.11+, three commands)

```sh
python3 -m venv .venv && . .venv/bin/activate
python -m pip install -e '.[dev]'
led-tasso --backend fake chat
```

The app has no third-party runtime dependencies. From a clean checkout, without installing anything:
`python3 -m led_tasso --backend fake ask "hi"`.
Run `make test` for the offline pytest suite and `make demo` for two offline questions and a memory listing.
Make uses `.venv/bin/python` if available, otherwise `python3`; override with `make PYTHON=/path/to/python test`.

## Commands and backends

```sh
led-tasso --backend fake ask "My name is Rowan. I am training for a 5K."
led-tasso --backend fake ask "What should I work on today?"
led-tasso --backend claude --timeout 120 chat
led-tasso memory list
led-tasso memory forget 1
led-tasso memory clear
led-tasso memory clear --yes
```

Global options go before the command. In chat, `/memory` lists facts; `/quit` or Ctrl-D exits.
`--backend` overrides `LED_TASSO_BACKEND`, which defaults to `claude`. `--timeout` is a positive number
of seconds, default 120. Expected failures print one friendly stderr line and return exit status 1.

Install and log into the chosen CLI separately. Binary defaults are `claude` and `codex` on PATH;
`LED_TASSO_CLAUDE_BIN` and `LED_TASSO_CODEX_BIN` override the executable path (one executable, no embedded arguments).
For the bundled Codex on this machine, set:

```sh
export LED_TASSO_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex
```

The exact argv lists below match `backend_argv` in `led_tasso/backends.py`. `CLAUDE_BIN` and `CODEX_BIN`
mean the resolved executable names above; `OUTPUT_FILE` is an absolute temporary final-message path.
The complete prompt is passed as subprocess stdin, never shell-interpolated or included in argv.
These flags were checked against the installed `claude --help` and `<codex binary> exec --help`.

```python
[CLAUDE_BIN, "-p", "--output-format", "text", "--safe-mode", "--tools", "",
 "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
 "--setting-sources", "", "--no-session-persistence", "--permission-mode", "dontAsk"]

[CODEX_BIN, "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral",
 "--ignore-user-config", "--ignore-rules", "--output-last-message", OUTPUT_FILE, "-"]
```

Each real invocation runs in a fresh, empty temporary working directory that is removed afterward.
Claude has tools, customizations, MCP servers, and session persistence disabled. Codex uses a read-only
sandbox, ignores user config/rules, and uses an ephemeral session; only its final-message file is read.
Fresh working directories avoid project discovery; they are not an OS-level guarantee against reading
absolute paths elsewhere. The persona tells the model not to use tools. No live backend was exercised
in development; the CLI wrappers were tested with mocked processes. Real backends send the provided
conversation context to their CLI provider using the CLI's existing authentication.

`fake` is deterministic and offline. It recognizes “My name is …” (one name token) and
“I am training for …”, remembers those statements, and uses them in later replies. It returns JSON
through the same prompt/parsing/storage pipeline. It is a limited demo fixture, not a general language model.

## Memory

Memory lives at `$LED_TASSO_HOME/memory.json`, default `~/.led_tasso/memory.json`. Newly created home
directories have mode 0700; atomic writes use a private temporary file in the same directory and
`os.replace`. The JSON contains at most 50 case-insensitively deduplicated facts with UTC `added_at`
timestamps and the last 10 user/coach exchanges. The persona, facts, recent exchanges, and current
message are sent on every turn. The prompt requires facts explicitly stated by the user;
the model is responsible for extracting them correctly.

`memory list` prints numbered facts. `memory forget <n>` removes the numbered fact and resets recent
exchanges so it cannot remain in conversation context. `memory clear` removes facts and exchanges,
asking for confirmation; `--yes` skips the question. Corrupt/unreadable memory is moved to
`memory.json.bak-<UTC timestamp>` with a warning and a fresh memory starts. Backups remain on disk
for manual recovery; clear/forget affect active memory only. Memory is local plain text.

## Architecture

- `cli.py`: argparse commands, chat loop, friendly errors, shared ask pipeline.
- `persona.md`: runtime-loaded original voice, honesty, crisis-care, and fact-extraction rules.
- `protocol.py`: persona/context prompt assembly and tolerant JSON reply parsing.
- `backends.py`: isolated subprocess wrappers and deterministic fake JSON generator.
- `memory.py`: schema validation, bounded history/facts, atomic saves, and recovery.
- `tests/`: offline protocol, storage, command, mocked subprocess, and end-to-end checks.
- `Makefile`: reproducible test and temporary-home demo commands.
