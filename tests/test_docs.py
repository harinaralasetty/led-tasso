from pathlib import Path


def test_review_round_one_documentation():
    root = Path(__file__).resolve().parents[1]
    readme = (root / "README.md").read_text()
    report = (root / "REPORT.md").read_text()
    assert "Overrides must be absolute paths" in readme
    assert "No live backend was exercised" not in readme
    assert "no real model backend was run" not in report
    assert "## Manager live check (2026-10-20)" in report
    assert ("both real backends (Claude Code CLI 2.1.304 and Codex CLI "
            "0.163.0-alpha.10.2 via `LED_TASSO_CODEX_BIN`) answered two turns "
            "in character and stored the user's name plus one goal/worry each.") in report
    assert "## Review round 1 resolution" in report
