import json
from pathlib import Path

from dave_codes.manifest import read_manifest
from dave_codes.sync import (
    install_project,
    push_project,
    sync_project,
    uninstall_project,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _create_source_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "dave-codes"
    repo.mkdir()
    _write(
        repo / ".dave-framework-files",
        ".claude/agents/*.md\n.agent/README.md\n",
    )
    _write(repo / ".claude/agents/dave-architect.md", "source-v1")
    _write(repo / ".agent/README.md", "framework-readme")
    return repo


def test_install_creates_manifest_and_registers_project(tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    result = install_project(repo, project, source_repo="local://dave-codes")

    assert sorted(result["copied"]) == [
        ".agent/README.md",
        ".claude/agents/dave-architect.md",
    ]

    manifest = read_manifest(project)
    assert set(manifest["files"].keys()) == {
        ".agent/README.md",
        ".claude/agents/dave-architect.md",
    }

    installs = json.loads((repo / ".dave-installs.json").read_text(encoding="utf-8"))
    assert str(project.resolve()) in installs["installs"]


def test_sync_backs_up_local_changes_and_updates_project(tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    install_project(repo, project, source_repo="local://dave-codes")

    _write(project / ".claude/agents/dave-architect.md", "project-local-change")
    _write(repo / ".claude/agents/dave-architect.md", "source-v2")

    result = sync_project(repo, project, now="2026-02-18T16:00:00Z")

    assert result["updated"] == [".claude/agents/dave-architect.md"]
    assert (project / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "source-v2"

    backups = list((project / ".claude/dave-local-patches").rglob("dave-architect.md"))
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == "project-local-change"


def test_push_copies_project_changes_back_to_source(tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    install_project(repo, project, source_repo="local://dave-codes")
    _write(project / ".claude/agents/dave-architect.md", "project-improvement")

    result = push_project(repo, project)

    assert result["changed"] == [
        {
            "path": ".claude/agents/dave-architect.md",
            "size": len("project-improvement"),
        }
    ]
    assert (repo / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "project-improvement"


def test_uninstall_keep_modified_preserves_local_edits(tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    install_project(repo, project, source_repo="local://dave-codes")
    _write(project / ".claude/agents/dave-architect.md", "local-edit")

    result = uninstall_project(repo, project, keep_modified=True)

    assert result["skipped_modified"] == [".claude/agents/dave-architect.md"]
    assert not (project / ".claude/dave-manifest.json").exists()
    assert (project / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "local-edit"
