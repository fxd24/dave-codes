from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def write_file():
    def _write(path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    return _write


@pytest.fixture()
def source_repo(tmp_path: Path, write_file) -> Path:
    repo = tmp_path / "dave-codes"
    repo.mkdir()
    write_file(repo / ".dave-framework-files", ".claude/agents/*.md\n")
    write_file(repo / ".claude/agents/dave-architect.md", "source-v1")
    return repo
