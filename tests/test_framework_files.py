from pathlib import Path

from dave_codes.framework_files import read_framework_patterns, resolve_framework_files


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_read_patterns_and_resolve_framework_files(tmp_path: Path) -> None:
    repo = tmp_path
    _write(
        repo / ".dave-framework-files",
        """
# comment

.claude/agents/*.md
.claude/dave/**
.agent/README.md
""".strip()
        + "\n",
    )
    _write(repo / ".claude/agents/dave-architect.md", "agent")
    _write(repo / ".claude/agents/not-managed.txt", "skip")
    _write(repo / ".claude/dave/workflows/init.md", "workflow")
    _write(repo / ".claude/dave/process/checker.md", "process")
    _write(repo / ".agent/README.md", "agent readme")

    patterns = read_framework_patterns(repo)
    assert patterns == [
        ".claude/agents/*.md",
        ".claude/dave/**",
        ".agent/README.md",
    ]

    files = resolve_framework_files(repo)
    assert files == [
        ".agent/README.md",
        ".claude/agents/dave-architect.md",
        ".claude/dave/process/checker.md",
        ".claude/dave/workflows/init.md",
    ]
