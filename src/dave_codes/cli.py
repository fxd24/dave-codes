from __future__ import annotations

from pathlib import Path
from typing import Iterable

import typer

from .sync import (
    detect_source_repo,
    find_repo_root,
    install_project,
    list_registered_projects,
    push_project,
    status_project,
    sync_project,
    uninstall_project,
)

app = typer.Typer(help="Sync Dave framework files between dave-codes and local projects.")


def _repo_root() -> Path:
    try:
        return find_repo_root()
    except FileNotFoundError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc


def _resolve_project_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if not path.exists():
        raise typer.BadParameter(f"Project path does not exist: {path}")
    if not path.is_dir():
        raise typer.BadParameter(f"Project path must be a directory: {path}")
    return path.resolve()


def _print_list(label: str, items: Iterable[str], *, show_if_empty: bool = False) -> None:
    item_list = list(items)
    if not item_list and not show_if_empty:
        return
    typer.echo(f"  {label}: {len(item_list)}")
    for item in item_list:
        typer.echo(f"    {item}")


def _print_conflicts(path_conflicts: list[dict[str, str]]) -> None:
    if not path_conflicts:
        return
    typer.echo(f"Resolved path conflicts: {len(path_conflicts)}")
    for conflict in path_conflicts:
        typer.echo(f"  {conflict['path']} -> {conflict['backup']}")


@app.command()
def install(project_path: str = typer.Argument(..., help="Path to a local project repo.")) -> None:
    """First-time setup for a project and registration in .dave-installs.json."""
    repo_root = _repo_root()
    project = _resolve_project_path(project_path)

    try:
        result = install_project(repo_root, project, source_repo=detect_source_repo(repo_root))
    except (FileNotFoundError, ValueError) as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc

    typer.echo(f"Installed framework into {result['project']}")
    typer.echo(f"Manifest: {result['manifest_path']}")
    typer.echo(f"Copied files: {len(result['copied'])}")
    typer.echo(f"Skipped existing unmanaged files: {len(result['skipped_unmanaged'])}")
    _print_conflicts(result["path_conflicts_resolved"])


@app.command()
def uninstall(
    project_path: str = typer.Argument(..., help="Path to a local project repo."),
    keep_modified: bool = typer.Option(
        False,
        "--keep-modified",
        help="Keep locally modified framework files instead of deleting them.",
    ),
) -> None:
    """Remove all manifest-tracked framework files and deregister the project."""
    repo_root = _repo_root()
    project = _resolve_project_path(project_path)

    try:
        result = uninstall_project(repo_root, project, keep_modified=keep_modified)
    except (FileNotFoundError, ValueError) as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc

    typer.echo(f"Uninstalled framework from {result['project']}")
    typer.echo(f"Removed files: {len(result['removed'])}")
    typer.echo(f"Skipped modified files: {len(result['skipped_modified'])}")
    typer.echo(f"Missing files: {len(result['missing'])}")

    if result["removed_modified"]:
        typer.echo("Deleted locally modified files:")
        for rel_path in result["removed_modified"]:
            typer.echo(f"  {rel_path}")


@app.command()
def status(
    project_path: str | None = typer.Argument(
        None,
        help="Optional project path. If omitted, show status for all registered projects.",
    )
) -> None:
    """Show drift between dave-codes and one or all projects."""
    repo_root = _repo_root()

    if project_path:
        projects = [_resolve_project_path(project_path)]
    else:
        projects = [path.resolve() for path in list_registered_projects(repo_root)]

    if not projects:
        typer.echo("No registered projects found in .dave-installs.json")
        return

    had_error = False
    for index, project in enumerate(projects):
        try:
            report = status_project(repo_root, project)
        except (FileNotFoundError, ValueError) as exc:
            had_error = True
            typer.echo(f"{project}: {exc}", err=True)
            continue

        if index:
            typer.echo("")

        typer.echo(f"Project: {report['project']}")
        typer.echo(f"  Last sync: {report.get('last_sync') or '<never>'}")
        _print_list("Only in source", report["source_only"])
        _print_list("Only in project manifest", report["manifest_only"])
        _print_list("Source newer", report["source_newer"])
        _print_list("Project newer", report["project_newer"])
        _print_list("Both changed", report["both_changed"])
        _print_list("Deleted in project", report["missing_in_project"])
        _print_list("In sync", report["in_sync"], show_if_empty=True)

    if had_error:
        raise typer.Exit(code=1)


@app.command()
def sync(
    project_path: str | None = typer.Argument(
        None,
        help="Optional project path. If omitted, sync all registered projects.",
    )
) -> None:
    """Sync framework files from dave-codes to one or all projects."""
    repo_root = _repo_root()

    if project_path:
        projects = [_resolve_project_path(project_path)]
    else:
        projects = [path.resolve() for path in list_registered_projects(repo_root)]

    if not projects:
        typer.echo("No registered projects found in .dave-installs.json")
        return

    had_error = False
    for index, project in enumerate(projects):
        try:
            result = sync_project(repo_root, project)
        except (FileNotFoundError, ValueError) as exc:
            had_error = True
            typer.echo(f"{project}: {exc}", err=True)
            continue

        if index:
            typer.echo("")

        typer.echo(f"Synced: {result['project']}")
        typer.echo(f"  Updated: {len(result['updated'])}")
        typer.echo(f"  Added: {len(result['added'])}")
        typer.echo(f"  Removed: {len(result['removed'])}")
        typer.echo(f"  Backed up local changes: {len(result['backed_up'])}")
        typer.echo(f"  Skipped unmanaged files: {len(result['skipped_unmanaged'])}")
        _print_conflicts(result["path_conflicts_resolved"])

    if had_error:
        raise typer.Exit(code=1)


@app.command()
def push(project_path: str = typer.Argument(..., help="Path to a local project repo.")) -> None:
    """Copy changed framework files from a project back into dave-codes."""
    repo_root = _repo_root()
    project = _resolve_project_path(project_path)

    try:
        result = push_project(repo_root, project)
    except (FileNotFoundError, ValueError) as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc

    typer.echo(f"Copied {len(result['changed'])} changed file(s) to dave-codes")
    for entry in result["changed"]:
        typer.echo(f"  {entry['path']} ({entry['size']} bytes)")

    if result["missing_in_project"]:
        typer.echo(f"Missing in project: {len(result['missing_in_project'])}")
        for rel_path in result["missing_in_project"]:
            typer.echo(f"  {rel_path}")

    _print_conflicts(result["path_conflicts_resolved"])


if __name__ == "__main__":
    app()
