from pathlib import Path

from typer.testing import CliRunner

from dave_codes.cli import app


runner = CliRunner()


def test_cli_install_and_status(monkeypatch, source_repo: Path, tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()

    monkeypatch.chdir(source_repo)

    install_result = runner.invoke(app, ["install", str(project)])
    assert install_result.exit_code == 0
    assert "Copied files: 1" in install_result.stdout

    status_result = runner.invoke(app, ["status", str(project)])
    assert status_result.exit_code == 0
    assert "Project:" in status_result.stdout
    assert "In sync: 1" in status_result.stdout


def test_cli_install_resolves_path_conflicts(monkeypatch, source_repo: Path, tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()

    (project / ".claude").mkdir()
    (project / ".claude/agents").write_text("legacy placeholder", encoding="utf-8")

    monkeypatch.chdir(source_repo)
    install_result = runner.invoke(app, ["install", str(project)])

    assert install_result.exit_code == 0
    assert "Resolved path conflicts: 1" in install_result.stdout
    assert (project / ".claude/agents.pre-dave-codes.bak").exists()
    assert (project / ".claude/agents/dave-architect.md").exists()


def test_cli_uninstall_keep_modified(monkeypatch, source_repo: Path, tmp_path: Path, write_file) -> None:
    project = tmp_path / "project"
    project.mkdir()

    monkeypatch.chdir(source_repo)
    runner.invoke(app, ["install", str(project)])

    write_file(project / ".claude/agents/dave-architect.md", "local-edit")

    uninstall_result = runner.invoke(app, ["uninstall", str(project), "--keep-modified"])
    assert uninstall_result.exit_code == 0
    assert "Skipped modified files: 1" in uninstall_result.stdout
    assert (project / ".claude/agents/dave-architect.md").exists()
