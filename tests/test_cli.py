from pathlib import Path

from typer.testing import CliRunner

from dave_codes.cli import app


runner = CliRunner()


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _create_source_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "dave-codes"
    repo.mkdir()
    _write(repo / ".dave-framework-files", ".claude/agents/*.md\n.agent/README.md\n")
    _write(repo / ".claude/agents/dave-architect.md", "source-v1")
    _write(repo / ".agent/README.md", "framework-readme")
    return repo


def test_cli_install_and_status(monkeypatch, tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    monkeypatch.chdir(repo)

    install_result = runner.invoke(app, ["install", str(project)])
    assert install_result.exit_code == 0
    assert "Copied files: 2" in install_result.stdout

    status_result = runner.invoke(app, ["status", str(project)])
    assert status_result.exit_code == 0
    assert "Project:" in status_result.stdout
    assert "In sync: 2" in status_result.stdout


def test_cli_uninstall_keep_modified(monkeypatch, tmp_path: Path) -> None:
    repo = _create_source_repo(tmp_path)
    project = tmp_path / "project"
    project.mkdir()

    monkeypatch.chdir(repo)
    runner.invoke(app, ["install", str(project)])

    _write(project / ".claude/agents/dave-architect.md", "local-edit")

    uninstall_result = runner.invoke(app, ["uninstall", str(project), "--keep-modified"])
    assert uninstall_result.exit_code == 0
    assert "Skipped modified files: 1" in uninstall_result.stdout
    assert (project / ".claude/agents/dave-architect.md").exists()
