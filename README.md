# Led Tasso

A chat with Coach Led Tasso, an original, encouraging small-town coach who remembers you, in your browser or terminal.

## Try the website

```sh
git clone https://github.com/harinaralasetty/led-tasso.git && cd led-tasso
python3 -m led_tasso --backend fake serve     # offline demo, open http://127.0.0.1:8765
python3 -m led_tasso --backend claude serve   # real replies through your Claude Code CLI
```

Needs only Python 3.11+. Real replies need the `claude` (Claude Code) or `codex` CLI installed and logged in;
the `fake` backend works with neither. The page runs on your own computer only.

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

Global options go before the command; `serve` also accepts `--backend` and `--timeout` after it.
In chat, `/memory` lists facts; `/quit` or Ctrl-D exits.
Backend failures print one friendly stderr line and leave memory unchanged; chat continues for another turn.
`--backend` overrides `LED_TASSO_BACKEND`, which defaults to `claude`. `--timeout` is a positive number
of seconds, default 120. Outside chat's backend-error recovery, expected failures print one friendly
stderr line and return exit status 1.

Install and log into the chosen CLI separately. Binary defaults are `claude` and `codex` on PATH;
`LED_TASSO_CLAUDE_BIN` and `LED_TASSO_CODEX_BIN` override the executable path (one executable, no embedded arguments).
Overrides must be absolute paths; relative paths (including `~/...`) and empty values are rejected.
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
A timeout kills the whole subprocess group and reaps the process before reporting the error.
Claude has tools, customizations, MCP servers, and session persistence disabled. Codex uses a read-only
sandbox, ignores user config/rules, and uses an ephemeral session; only its final-message file is read.
Fresh working directories avoid project discovery; they are not an OS-level guarantee against reading
absolute paths elsewhere. The persona tells the model not to use tools. The manager checked both real
backends on 2026-10-20; each answered two turns in character and stored the user's name plus one
goal/worry (see REPORT.md for CLI versions). The offline test suite uses mocked CLI processes.
Real backends send the provided conversation context to their CLI provider using the CLI's existing
authentication.

`fake` is deterministic and offline. It recognizes “My name is …” (one name token) and
“I am training for …”, remembers those statements, and uses them in later replies. It returns JSON
through the same prompt/parsing/storage pipeline. It is a limited demo fixture, not a general language model.

## Web UI

```sh
make serve
# Or, from the checkout (no installation needed):
python3 -m led_tasso --backend fake serve --port 8799
# After installation, either option position works:
led-tasso serve --backend fake --host 127.0.0.1 --port 8765 --timeout 120
```

`make serve` uses the offline fake backend at **http://127.0.0.1:8765**. The second command
uses **http://127.0.0.1:8799**. Open the printed URL in your browser; Ctrl-C stops the server.
Choose `claude` or `codex` to use an installed, logged-in CLI. The web chat calls the same
`ask` pipeline as the terminal and uses the same memory home. The fake demo recognizes
“My name is Rowan” and “I am training for a 5K” and remembers them for the next message.

An original SVG coach waves hello, thinks while waiting, and talks as replies appear.
The page supports light/dark system themes, phones from 360 px, keyboard controls,
screen-reader reply announcements, and reduced motion (immediate replies, static coach).
Enter sends; Shift+Enter adds a newline. Open **What Coach remembers** to forget a fact
or clear all memory after confirming. Forget/clear also reset recent conversation context.
The visible conversation remains until you reload. The page loads no external resources.

The default host is `127.0.0.1`; all other `--host` values require `--allow-remote`.
Requests must use `127.0.0.1:<port>` or `localhost:<port>` in their Host header unless
remote access is enabled. JSON POST requests must come from the same origin when an
Origin header is present. With `--allow-remote`, a startup warning explains that there
is **no login: anyone who can reach the server can read the memory**. Browser origin
checks remain enabled. Use remote access only on a network you trust.

Screenshot placeholder: desktop coach stage beside the conversation, with the memory drawer open.

## Memory

Memory lives at `$LED_TASSO_HOME/memory.json`, default `~/.led_tasso/memory.json`. Home directories
are created with mode 0700 and tightened to 0700 on every save; atomic writes use a private
temporary file in the same directory and `os.replace`. The JSON contains at most 50
case-insensitively deduplicated facts with UTC `added_at`
timestamps and the last 10 user/coach exchanges. Each reply accepts at most five nonempty facts;
whitespace is collapsed to single spaces and each fact is truncated to 200 characters.
The persona, facts, recent exchanges, and current message are sent on every turn.
The prompt requires facts explicitly stated by the user;
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
- `web.py` and `web/`: local threaded HTTP server, original SVG coach, accessible offline page.
- `tests/`: offline protocol, storage, command, mocked subprocess, and end-to-end checks.
- `Makefile`: cwd-independent tests, temporary-home demo, and offline web server.
