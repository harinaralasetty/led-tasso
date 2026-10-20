# Led Tasso implementation report

## What works

The baseline `make test` run passed all 78 tests. After all fixes and the documentation
check, the expanded offline suite passed all 102 tests, both from the repository and from `/tmp`.
Actual `make test` output:

```text
.venv/bin/python -m pytest -q
........................................................................ [ 70%]
..............................                                           [100%]
102 passed in 0.30s
```

From `/tmp`, using the virtual environment's Python:

```sh
'./.venv/bin/python' -m pytest './tests' -q
```

```text
........................................................................ [ 70%]
..............................                                           [100%]
102 passed in 0.29s
```

These runs cover parsing, memory bounds and sanitation, private atomic storage, command
handling, chat recovery, backend argv, subprocess isolation, process-group timeout cleanup,
absolute overrides, and fake-backend integration. The test harness blocks unmocked CLI
processes and socket connections; the integration test permits only Python with `--backend fake`.

`make demo` output:

```text
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
1. User's name is Rowan.
2. User is training for a 5K.
```

The second question contains neither the name nor goal; the reply uses both from stored memory.
The demo runs offline in an automatically removed temporary home.

## What is faked

The fake backend is a deterministic local fixture: it recognizes one name token after
“My name is” and a goal after “I am training for”, then uses those facts in a short template.
Its crisis-keyword branch exercises caring output without jokes; it is not a general classifier.
Claude/Codex subprocesses in tests are mocked, including final-message files and errors.

## Manager live check (2026-10-20)

The manager supplied this record in the review brief:

both real backends (Claude Code CLI 2.1.304 and Codex CLI 0.163.0-alpha.10.2 via `LED_TASSO_CODEX_BIN`) answered two turns in character and stored the user's name plus one goal/worry each.

## What failed or is flaky

Temporarily removing the runtime fixes produced the expected regression failures:

| Reverted behavior | Observed result |
| --- | --- |
| Memory fact bounds and sanitation | 3 failed, 1 passed |
| Protocol fact bounds and sanitation | 3 failed |
| Parser object selection | 2 failed |
| Chat backend-error recovery | 1 failed |
| Process-group kill | 2 failed, 27 deselected |
| New process session | 2 failed |
| Absolute binary-override validation | 10 failed |
| Directory chmod on save | 1 failed |
| Package-relative persona lookup, tested from `/tmp` | 1 failed |
| Original README restored | 1 failed |
| Original REPORT restored | 1 failed |

Each regression run returned exit status 1, and the verification scripts restored the fixed
files in `finally` blocks. The empty-fact case already passed before sanitation was fixed.
The cwd regression failed with `FileNotFoundError` for `led_tasso/persona.md`, as expected.

Temporary working directories and CLI read-only settings do not provide OS-level read
isolation for absolute paths. Durable-fact extraction by real models remains instructed by
the persona rather than semantically validated. The manager live check above covers two
turns per real backend; the worker's verification remains offline.

## Next steps

The manager can review and commit the changes. No new features or runtime dependencies
were added.

## Review round 1 resolution

1. **Fixed: memory limits.** `test_fifty_junk_facts_keep_earlier_real_fact`,
   `test_record_sanitizes_facts[100KB]`, `test_record_sanitizes_facts[newlines]`,
   `test_record_sanitizes_facts[empty]`, `test_reply_facts_are_limited_to_five`, and
   `test_reply_facts_are_sanitized` cover the five-fact limit, 200-character limit,
   collapsed whitespace, and dropped empty facts.
2. **Fixed: parser object selection.** `test_nested_reply_in_invalid_outer_object_is_not_used`,
   `test_template_echo_followed_by_real_reply`, and `test_first_valid_outer_reply_wins`
   cover skipping decoded objects and ignoring the persona placeholder.
3. **Fixed: chat recovery.** `test_chat_backend_failure_then_success_keeps_memory`
   checks continued input, one-line error output, and unchanged disk/context for the failed turn.
4. **Fixed: timeout process groups.** `test_backend_errors[timeout-claude]`,
   `test_backend_errors[timeout-codex]`, `test_cli_execution_isolated_and_cleanup`, and
   `test_timeout_reaps_when_process_group_already_exited` check new sessions, SIGKILL to
   the process group, reaping, timeout errors, and unchanged argv/stdin/cwd/env behavior.
5. **Fixed: absolute binary overrides.** `test_binary_override_must_be_absolute` tests
   both backends with bare names, relative paths, tilde paths, and empty overrides;
   `test_exact_argv_and_overrides` retains absolute-path coverage. README states the rule.
6. **Fixed: existing directory privacy.** `test_save_tightens_existing_directory_every_time`
   checks that each save tightens a 0755 directory to 0700.
7. **Fixed: cwd-independent tests.** `test_prompt_contains_persona_facts_turns_and_current_message`
   resolves the persona relative to the installed package; the full suite was run from `/tmp`.
8. **Fixed: documentation.** `test_review_round_one_documentation` checks the absolute-path
   rule, removal of obsolete live-check claims, the manager's supplied live-check facts,
   and this resolution section.

## Round 3: web UI

Added `serve` with loopback defaults, remote opt-in warning, strict Host/Origin/JSON checks,
bounded request bodies and messages, fixed static-file routes, and serialized memory operations.
Web chat calls `cli.ask` directly, preserving prompt building, parsing, backend handling,
and memory rules. Access logs redact unknown paths and queries and contain only method,
safe path, and status. Backend errors return a friendly one-line JSON error with HTTP 502.

The page has an original inline SVG coach with idle/thinking/talking/cheer states,
light/dark themes, reduced-motion handling, text-node rendering, one full-reply live
announcement, and memory controls with an explicit clear confirmation. Added `make serve`,
cwd-independent Make targets, package data for the assets, and the README Web UI section.

### Offline verification

`make test` (exit 0):

```text
cd '.' && './.venv/bin/python' -m pytest -q
........................................................................ [ 27%]
..............................ssss....ssssssssssss............s.sssssss. [ 54%]
......s.ssssss......s.ssss....s.ssss....sssssssssssssss...............s. [ 81%]
sss...s.ss..s.s.s.sssssss.......s.s.....s........                        [100%]
189 passed, 76 skipped in 0.62s
```

All 102 existing tests are retained. The added tests run the HTTP handlers using both
an ephemeral port-0 threaded server and an in-memory HTTP transport. In this worker's
sandbox, binding sockets raises `PermissionError: [Errno 1] Operation not permitted`.
Only the 76 socket cases are skipped on EPERM/EACCES; their in-memory counterparts run.
There are no skips for other binding errors. The 87 passing new cases cover static files
and types, traversal, state, chat through `cli.ask`, remembered facts and deduplication,
message/body limits, malformed JSON, security headers, duplicate headers, backend failure,
memory controls, concurrent turns, private logs, remote opt-in, CLI options, clean shutdown,
local-only assets, safe text rendering, and both themes' text contrast of at least 4.5:1.

From `/private/tmp`, both commands below also returned exit 0:

```sh
make -f './Makefile' test
'./.venv/bin/python' -m pytest './tests' -q
```

Their respective summary output:

```text
189 passed, 76 skipped in 0.63s
189 passed, 76 skipped in 0.64s
```

`make demo` (exit 0):

```text
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
1. User's name is Rowan.
2. User is training for a 5K.
```

`node --check led_tasso/web/app.js` and `git diff --check` returned exit 0 with no output.
A temporary Node VM harness using built-in modules and simulated DOM/fetch objects ran
`app.js` without network access (`node /private/tmp/led-tasso-web-ui-check.cjs`, exit 0):

```text
Frontend behavior checks passed: text-only rendering, thinking/talking/cheer, busy controls, reduced motion, single reply announcement, forget, clear confirmation/cancel, and server error display.
```

This harness is supplemental; it is not a real browser integration test or a required
test dependency. The application still needs only Python's standard library at runtime.

Built a wheel offline with
`.venv/bin/python -m pip wheel . --no-deps --no-build-isolation --wheel-dir /private/tmp/led-tasso-wheel-check`
(exit 0). The build command's concluding output was:

```text
Successfully built led-tasso
```

A Python `zipfile.ZipFile` check asserted that the wheel contains `led_tasso/web.py`,
`led_tasso/web/index.html`, `led_tasso/web/app.js`, and `led_tasso/web/style.css` (exit 0):

```text
Wheel contains web server and all three static assets.
```

### Environment limitation and remaining manager check

The required launch command was attempted:

```sh
python3 -m led_tasso --backend fake serve --port 8799
```

It exited 1 because this sandbox forbids socket binding; the friendly output was:

```text
Coach hit a snag: Can't start the local server; check socket permissions and port availability.
```

The live loopback HTTP cases and real-browser chat acceptance remain for the manager
outside this sandbox. No real Claude/Codex commands were invoked in this round, and
no commits were made.
