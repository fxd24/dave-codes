from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Mapping

from .framework_files import FRAMEWORK_LIST_FILENAME, resolve_framework_files
from .manifest import (
    build_manifest,
    file_record,
    manifest_path,
    read_manifest,
    sha256_file,
    utc_timestamp,
    write_manifest,
)

INSTALLS_FILENAME = ".dave-installs.json"
LOCAL_PATCHES_RELATIVE_DIR = Path(".claude/dave-local-patches")


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / FRAMEWORK_LIST_FILENAME).is_file():
            return candidate
    raise FileNotFoundError(
        f"Could not find {FRAMEWORK_LIST_FILENAME}. Run this command from the dave-codes repo or a subdirectory."
    )


def detect_source_repo(repo_root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "config", "--get", "remote.origin.url"],
            check=True,
            capture_output=True,
            text=True,
        )
        remote = result.stdout.strip()
        if remote:
            return remote
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return str(repo_root)


def installs_path(repo_root: Path) -> Path:
    return repo_root / INSTALLS_FILENAME


def read_installs(repo_root: Path) -> dict[str, dict[str, str]]:
    path = installs_path(repo_root)
    if not path.exists():
        return {}

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Installs file must be an object: {path}")

    installs = data.get("installs", {})
    if not isinstance(installs, dict):
        raise ValueError(f"'installs' must be an object: {path}")

    result: dict[str, dict[str, str]] = {}
    for project_path, values in installs.items():
        if isinstance(project_path, str) and isinstance(values, dict):
            result[project_path] = {
                key: value
                for key, value in values.items()
                if isinstance(key, str) and isinstance(value, str)
            }
    return result


def write_installs(repo_root: Path, installs: Mapping[str, Mapping[str, str]]) -> Path:
    path = installs_path(repo_root)
    payload = {
        "installs": {
            project_path: dict(values) for project_path, values in sorted(installs.items())
        }
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def list_registered_projects(repo_root: Path) -> list[Path]:
    installs = read_installs(repo_root)
    return [Path(project) for project in sorted(installs)]


def register_project(repo_root: Path, project_root: Path, *, installed_at: str, last_sync: str) -> None:
    installs = read_installs(repo_root)
    key = str(project_root.resolve())
    previous = installs.get(key, {})
    installs[key] = {
        "installed_at": previous.get("installed_at", installed_at),
        "last_sync": last_sync,
    }
    write_installs(repo_root, installs)


def deregister_project(repo_root: Path, project_root: Path) -> None:
    installs = read_installs(repo_root)
    installs.pop(str(project_root.resolve()), None)
    write_installs(repo_root, installs)


def update_project_last_sync(repo_root: Path, project_root: Path, *, last_sync: str) -> None:
    installs = read_installs(repo_root)
    key = str(project_root.resolve())
    previous = installs.get(key, {})
    installs[key] = {
        "installed_at": previous.get("installed_at", last_sync),
        "last_sync": last_sync,
    }
    write_installs(repo_root, installs)


def install_project(
    repo_root: Path,
    project_root: Path,
    *,
    source_repo: str | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    timestamp = now or utc_timestamp()
    source = source_repo or detect_source_repo(repo_root)
    project = project_root.resolve()

    existing_manifest: dict[str, Any] | None = None
    try:
        existing_manifest = read_manifest(project)
    except FileNotFoundError:
        existing_manifest = None

    existing_files = set((existing_manifest or {}).get("files", {}).keys())

    copied: list[str] = []
    skipped_unmanaged: list[str] = []
    for rel_path in resolve_framework_files(repo_root):
        src = repo_root / rel_path
        dst = project / rel_path
        if dst.exists() and rel_path not in existing_files:
            skipped_unmanaged.append(rel_path)
            continue
        _copy_file(src, dst)
        copied.append(rel_path)

    manifest_files = {
        rel_path: file_record(project / rel_path)
        for rel_path in copied
        if (project / rel_path).exists()
    }

    installed_at = (
        existing_manifest.get("installed_at", timestamp) if existing_manifest else timestamp
    )

    manifest = build_manifest(
        source_repo=source,
        installed_at=installed_at,
        last_sync=timestamp,
        files=manifest_files,
    )
    manifest_file = write_manifest(project, manifest)
    register_project(repo_root, project, installed_at=installed_at, last_sync=timestamp)

    return {
        "project": str(project),
        "copied": sorted(copied),
        "skipped_unmanaged": sorted(skipped_unmanaged),
        "manifest_path": str(manifest_file),
        "timestamp": timestamp,
    }


def uninstall_project(
    repo_root: Path,
    project_root: Path,
    *,
    keep_modified: bool = False,
) -> dict[str, Any]:
    project = project_root.resolve()
    manifest = read_manifest(project)

    removed: list[str] = []
    removed_modified: list[str] = []
    skipped_modified: list[str] = []
    missing: list[str] = []

    manifest_files = manifest.get("files", {})
    for rel_path, record in sorted(manifest_files.items()):
        file_path = project / rel_path
        if not file_path.exists():
            missing.append(rel_path)
            continue

        current_hash = sha256_file(file_path)
        expected_hash = record.get("sha256") if isinstance(record, dict) else None
        modified = current_hash != expected_hash

        if modified and keep_modified:
            skipped_modified.append(rel_path)
            continue

        if modified:
            removed_modified.append(rel_path)

        file_path.unlink()
        _cleanup_empty_parents(file_path.parent, stop_dir=project)
        removed.append(rel_path)

    mpath = manifest_path(project)
    if mpath.exists():
        mpath.unlink()

    deregister_project(repo_root, project)

    return {
        "project": str(project),
        "removed": removed,
        "removed_modified": removed_modified,
        "skipped_modified": skipped_modified,
        "missing": missing,
    }


def status_project(repo_root: Path, project_root: Path) -> dict[str, Any]:
    project = project_root.resolve()
    manifest = read_manifest(project)
    manifest_files = manifest.get("files", {})
    manifest_paths = set(manifest_files.keys())
    source_paths = set(resolve_framework_files(repo_root))

    source_only = sorted(source_paths - manifest_paths)
    manifest_only = sorted(manifest_paths - source_paths)

    source_newer: list[str] = []
    project_newer: list[str] = []
    both_changed: list[str] = []
    in_sync: list[str] = []
    missing_in_project: list[str] = []

    for rel_path in sorted(source_paths & manifest_paths):
        source_file = repo_root / rel_path
        project_file = project / rel_path

        source_hash = sha256_file(source_file)
        expected_hash = manifest_files[rel_path].get("sha256")

        if not project_file.exists():
            project_newer.append(rel_path)
            missing_in_project.append(rel_path)
            continue

        project_hash = sha256_file(project_file)
        source_changed = source_hash != expected_hash
        project_changed = project_hash != expected_hash

        if source_changed and project_changed:
            both_changed.append(rel_path)
        elif source_changed:
            source_newer.append(rel_path)
        elif project_changed:
            project_newer.append(rel_path)
        else:
            in_sync.append(rel_path)

    return {
        "project": str(project),
        "last_sync": manifest.get("last_sync"),
        "installed_at": manifest.get("installed_at"),
        "source_only": source_only,
        "manifest_only": manifest_only,
        "source_newer": source_newer,
        "project_newer": project_newer,
        "both_changed": both_changed,
        "in_sync": in_sync,
        "missing_in_project": missing_in_project,
    }


def sync_project(repo_root: Path, project_root: Path, *, now: str | None = None) -> dict[str, Any]:
    project = project_root.resolve()
    manifest = read_manifest(project)
    previous_files: dict[str, dict[str, Any]] = manifest.get("files", {})

    timestamp = now or utc_timestamp()
    patch_root = project / LOCAL_PATCHES_RELATIVE_DIR / _timestamp_slug(timestamp)

    source_paths = resolve_framework_files(repo_root)
    source_set = set(source_paths)
    previous_set = set(previous_files.keys())

    backed_up: set[str] = set()
    removed: list[str] = []
    updated: list[str] = []
    added: list[str] = []
    skipped_unmanaged: list[str] = []

    for rel_path in sorted(previous_set - source_set):
        project_file = project / rel_path
        if project_file.exists():
            current_hash = sha256_file(project_file)
            expected_hash = previous_files[rel_path].get("sha256")
            if current_hash != expected_hash:
                _backup_file(rel_path, project_file, patch_root)
                backed_up.add(rel_path)
            project_file.unlink()
            _cleanup_empty_parents(project_file.parent, stop_dir=project)
        removed.append(rel_path)

    next_manifest_files: dict[str, dict[str, Any]] = {}
    for rel_path in source_paths:
        source_file = repo_root / rel_path
        project_file = project / rel_path
        source_hash = sha256_file(source_file)

        if project_file.exists() and rel_path not in previous_files:
            skipped_unmanaged.append(rel_path)
            continue

        previous_project_hash: str | None = None
        if project_file.exists():
            previous_project_hash = sha256_file(project_file)

        if rel_path in previous_files and project_file.exists():
            expected_hash = previous_files[rel_path].get("sha256")
            if previous_project_hash != expected_hash:
                _backup_file(rel_path, project_file, patch_root)
                backed_up.add(rel_path)

        _copy_file(source_file, project_file)

        if rel_path in previous_files:
            if previous_project_hash != source_hash:
                updated.append(rel_path)
        else:
            added.append(rel_path)

        next_manifest_files[rel_path] = {
            "sha256": source_hash,
            "size": source_file.stat().st_size,
        }

    new_manifest = build_manifest(
        source_repo=manifest.get("source_repo") or detect_source_repo(repo_root),
        installed_at=manifest.get("installed_at") or timestamp,
        last_sync=timestamp,
        files=next_manifest_files,
    )

    write_manifest(project, new_manifest)
    update_project_last_sync(repo_root, project, last_sync=timestamp)

    return {
        "project": str(project),
        "timestamp": timestamp,
        "updated": sorted(updated),
        "added": sorted(added),
        "removed": sorted(removed),
        "backed_up": sorted(backed_up),
        "skipped_unmanaged": sorted(skipped_unmanaged),
    }


def push_project(repo_root: Path, project_root: Path) -> dict[str, Any]:
    project = project_root.resolve()
    manifest = read_manifest(project)
    manifest_files = manifest.get("files", {})

    changed: list[dict[str, Any]] = []
    missing_in_project: list[str] = []

    for rel_path in sorted(manifest_files):
        project_file = project / rel_path
        if not project_file.exists():
            missing_in_project.append(rel_path)
            continue

        source_file = repo_root / rel_path
        source_hash = sha256_file(source_file) if source_file.exists() else None
        project_hash = sha256_file(project_file)

        if source_hash == project_hash:
            continue

        _copy_file(project_file, source_file)
        changed.append(
            {
                "path": rel_path,
                "size": project_file.stat().st_size,
            }
        )

    return {
        "project": str(project),
        "changed": changed,
        "missing_in_project": sorted(missing_in_project),
    }


def _copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _backup_file(rel_path: str, source_path: Path, backup_root: Path) -> Path:
    destination = backup_root / rel_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, destination)
    return destination


def _cleanup_empty_parents(start_dir: Path, *, stop_dir: Path) -> None:
    current = start_dir
    while current != stop_dir and current.is_dir():
        try:
            next(current.iterdir())
            break
        except StopIteration:
            current.rmdir()
            current = current.parent


def _timestamp_slug(timestamp: str) -> str:
    return timestamp.replace("-", "").replace(":", "")
