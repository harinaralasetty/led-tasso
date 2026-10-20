# Led Tasso implementation report

## What works

The final acceptance commands below all exited 0. Output is pasted from actual runs on this workspace;
pytest elapsed time will vary on a fresh run.

`make test`:

```text
.venv/bin/python -m pytest -q
........................................................................ [ 92%]
......                                                                   [100%]
78 passed in 0.58s
```

The 78 offline tests cover JSON/fenced/surrounded/fallback parsing; prompt contents; memory dedupe,
bounds, atomic replacement/failure cleanup, unreadable/corrupt recovery, forgetting/clearing;
command validation, confirmation, chat/EOF, backend selection; exact argv, isolation/cleanup,
missing binaries, nonzero exits, timeouts, missing/empty final output; and fake ask end to end.
The test harness blocks unmocked subprocess calls and socket connections. The end-to-end test
explicitly permits only Python running the fake backend in a temporary memory home.

`make demo`:

```text
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
Good to see you, Rowan. For a 5K, pick one small practice step you can manage today. Even a muddy field gets crossed one boot at a time.
1. User's name is Rowan.
2. User is training for a 5K.
```

The second question is “What should I work on today?” and contains neither Rowan's name nor the
5K goal. Both facts reach that reply through saved memory. The demo uses an automatically removed
temporary home and no model CLI.

The requested module command, with the virtual environment activated only to provide the
`python` executable and memory redirected inside the workspace:

```sh
. .venv/bin/activate
LED_TASSO_HOME=.verification/module-home python -m led_tasso --backend fake ask "hi"
```

```text
Glad you stopped by. Pick one small next step you can manage today. Even a muddy field gets crossed one boot at a time.
```

Packaging verification also succeeded: installed the console script with
`.venv/bin/python -m pip install --no-index --no-build-isolation --no-deps -e .`,
built a wheel with
`.venv/bin/python -m pip wheel --no-index --no-build-isolation --no-deps --wheel-dir .verification/wheels .`,
and installed that wheel into a separate target directory. A Python verification command copied
the source package into an isolated checkout directory, ran the module with `-S` (site packages
disabled), ran the installed console script from that directory, ran the installed wheel with
`-S`, checked each saved exchange, and inspected the wheel archive. Its actual output was:

```text
Clean source, standard library only (-S):
Glad you stopped by. Pick one small next step you can manage today. Even a muddy field gets crossed one boot at a time.
Installed console script:
Glad you stopped by. Pick one small next step you can manage today. Even a muddy field gets crossed one boot at a time.
Installed wheel, standard library only (-S):
Glad you stopped by. Pick one small next step you can manage today. Even a muddy field gets crossed one boot at a time.
Wheel includes runtime persona.md.
```

An AST comparison of the README's two argv lists against `backend_argv` printed:

```text
README argv matches both backend implementations.
```

`python3 -m compileall -q led_tasso tests` and `git diff --check` exited 0 without output.

## What is faked

The fake backend is a deterministic local fixture. It extracts a single name token after
“My name is” and a goal after “I am training for”, then uses supported facts in a short template.
It does not understand arbitrary conversation. A small crisis-keyword branch exercises caring,
joke-free output, but is not a general crisis classifier. The runtime persona contains the full
voice, honesty, memory-extraction, and crisis-care instructions for the real models.

All Claude/Codex generation in tests is mocked, including final-message files and errors.
Only the CLI help commands were run against real binaries; no real model backend was run.

## What failed or is flaky

The default Python initially lacked pytest (`python3 -m pytest --version` reported
`No module named pytest`). An initial offline uv setup failed because its shared cache was
outside the writable sandbox. A local `.venv` was created with Python's venv module; cached
pure-Python pytest, its dependencies, and setuptools were copied into it without network access.
Pip's first packaging commands warned that its shared cache was unwritable, then succeeded;
the wheel-target install used `--no-cache-dir`.

No application or test failure was observed in the final offline acceptance run.
Live CLI authentication, provider availability, and model adherence remain unverified as required
by the worker brief. Codex help exited 0 with a PATH-alias permissions warning. Fresh temporary
working directories and read-only mode do not provide full OS-level read isolation for absolute
paths; README states that boundary. Real-model durable-fact extraction is instructed by the
persona, not semantically validated by the app.

## Next steps

The manager can perform the live Claude/Codex checks after logging into those CLIs and reviewing
the documented argv. Review live persona behavior and fact extraction with representative inputs.
No commits were made.

