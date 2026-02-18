import hashlib
from pathlib import Path

from dave_codes.manifest import (
    build_manifest,
    file_record,
    manifest_path,
    read_manifest,
    sha256_file,
    write_manifest,
)


def test_sha256_and_file_record(tmp_path: Path) -> None:
    file_path = tmp_path / "example.txt"
    file_path.write_text("hello", encoding="utf-8")

    assert sha256_file(file_path) == hashlib.sha256(b"hello").hexdigest()

    record = file_record(file_path)
    assert record["sha256"] == hashlib.sha256(b"hello").hexdigest()
    assert record["size"] == 5


def test_write_and_read_manifest(tmp_path: Path) -> None:
    project = tmp_path / "project"
    project.mkdir()

    manifest = build_manifest(
        source_repo="git@github.com:fxd24/dave-codes.git",
        installed_at="2026-02-18T12:00:00Z",
        last_sync="2026-02-18T15:30:00Z",
        files={
            ".claude/agents/dave-architect.md": {
                "sha256": "abc123",
                "size": 42,
            }
        },
    )

    write_manifest(project, manifest)

    loaded = read_manifest(project)
    assert loaded == manifest
    assert manifest_path(project).exists()
