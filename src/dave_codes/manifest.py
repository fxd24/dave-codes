from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

MANIFEST_VERSION = "1.0.0"
MANIFEST_RELATIVE_PATH = Path(".claude/dave-manifest.json")


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        while True:
            chunk = file_handle.read(8192)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "sha256": sha256_file(path),
        "size": stat.st_size,
    }


def manifest_path(project_root: Path) -> Path:
    return project_root / MANIFEST_RELATIVE_PATH


def read_manifest(project_root: Path) -> dict[str, Any]:
    path = manifest_path(project_root)
    if not path.exists():
        raise FileNotFoundError(f"Project manifest not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Manifest must be an object: {path}")
    files = data.get("files")
    if not isinstance(files, dict):
        raise ValueError(f"Manifest 'files' must be an object: {path}")
    return data


def write_manifest(project_root: Path, data: Mapping[str, Any]) -> Path:
    path = manifest_path(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def build_manifest(
    *,
    source_repo: str,
    installed_at: str,
    last_sync: str,
    files: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    normalized_files = {path: dict(record) for path, record in sorted(files.items())}
    return {
        "version": MANIFEST_VERSION,
        "source_repo": source_repo,
        "installed_at": installed_at,
        "last_sync": last_sync,
        "files": normalized_files,
    }
