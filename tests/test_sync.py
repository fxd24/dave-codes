import json
from pathlib import Path

from dave_codes.manifest import read_manifest
from dave_codes.sync import (
    install_project,
    push_project,
    sync_project,
    uninstall_project,
)


def test_install_creates_manifest_and_registers_project(source_repo: Path, tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()

    result = install_project(source_repo, project, source_repo="local://dave-codes")

    assert result["copied"] == [".claude/agents/dave-architect.md"]

    manifest = read_manifest(project)
    assert set(manifest["files"].keys()) == {".claude/agents/dave-architect.md"}

    installs = json.loads((source_repo / ".dave-installs.json").read_text(encoding="utf-8"))
    assert str(project.resolve()) in installs["installs"]


def test_install_resolves_file_to_directory_conflicts(source_repo: Path, tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()

    (project / ".claude").mkdir()
    (project / ".claude/agents").write_text("legacy placeholder", encoding="utf-8")

    result = install_project(source_repo, project, source_repo="local://dave-codes")

    assert result["path_conflicts_resolved"] == [
        {
            "path": str(project / ".claude/agents"),
            "backup": str(project / ".claude/agents.pre-dave-codes.bak"),
        }
    ]
    assert (project / ".claude/agents.pre-dave-codes.bak").read_text(encoding="utf-8") == "legacy placeholder"
    assert (project / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "source-v1"


def test_sync_backs_up_local_changes_and_updates_project(source_repo: Path, tmp_path: Path, write_file) -> None:
    project = tmp_path / "project"
    project.mkdir()

    install_project(source_repo, project, source_repo="local://dave-codes")

    write_file(project / ".claude/agents/dave-architect.md", "project-local-change")
    write_file(source_repo / ".claude/agents/dave-architect.md", "source-v2")

    result = sync_project(source_repo, project, now="2026-02-18T16:00:00Z")

    assert result["updated"] == [".claude/agents/dave-architect.md"]
    assert (project / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "source-v2"

    backups = list((project / ".claude/dave-local-patches").rglob("dave-architect.md"))
    assert len(backups) == 1
    assert backups[0].read_text(encoding="utf-8") == "project-local-change"


def test_push_copies_project_changes_back_to_source(source_repo: Path, tmp_path: Path, write_file) -> None:
    project = tmp_path / "project"
    project.mkdir()

    install_project(source_repo, project, source_repo="local://dave-codes")
    write_file(project / ".claude/agents/dave-architect.md", "project-improvement")

    result = push_project(source_repo, project)

    assert result["changed"] == [
        {
            "path": ".claude/agents/dave-architect.md",
            "size": len("project-improvement"),
        }
    ]
    assert (source_repo / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "project-improvement"


def test_push_updates_manifest(source_repo: Path, tmp_path: Path, write_file) -> None:
    """After push, manifest should reflect the pushed state so status shows in-sync."""
    project = tmp_path / "project"
    project.mkdir()

    install_project(source_repo, project, source_repo="local://dave-codes")
    write_file(project / ".claude/agents/dave-architect.md", "project-improvement")

    push_project(source_repo, project)

    manifest = read_manifest(project)
    from dave_codes.manifest import sha256_file
    assert manifest["files"][".claude/agents/dave-architect.md"]["sha256"] == sha256_file(
        project / ".claude/agents/dave-architect.md"
    )


def test_uninstall_keep_modified_preserves_local_edits(source_repo: Path, tmp_path: Path, write_file) -> None:
    project = tmp_path / "project"
    project.mkdir()

    install_project(source_repo, project, source_repo="local://dave-codes")
    write_file(project / ".claude/agents/dave-architect.md", "local-edit")

    result = uninstall_project(source_repo, project, keep_modified=True)

    assert result["skipped_modified"] == [".claude/agents/dave-architect.md"]
    assert not (project / ".claude/dave-manifest.json").exists()
    assert (project / ".claude/agents/dave-architect.md").read_text(encoding="utf-8") == "local-edit"
