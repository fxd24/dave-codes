from pathlib import Path

from dave_codes.framework_files import read_framework_patterns, resolve_framework_files


def test_read_patterns_and_resolve_framework_files(tmp_path: Path, write_file) -> None:
    repo = tmp_path
    write_file(
        repo / ".dave-framework-files",
        "# comment\n\n.claude/agents/*.md\n.claude/dave/**\n",
    )
    write_file(repo / ".claude/agents/dave-architect.md", "agent")
    write_file(repo / ".claude/agents/not-managed.txt", "skip")
    write_file(repo / ".claude/dave/workflows/init.md", "workflow")
    write_file(repo / ".claude/dave/process/checker.md", "process")

    patterns = read_framework_patterns(repo)
    assert patterns == [
        ".claude/agents/*.md",
        ".claude/dave/**",
    ]

    files = resolve_framework_files(repo)
    assert files == [
        ".claude/agents/dave-architect.md",
        ".claude/dave/process/checker.md",
        ".claude/dave/workflows/init.md",
    ]
