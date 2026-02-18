from __future__ import annotations

from pathlib import Path

FRAMEWORK_LIST_FILENAME = ".dave-framework-files"


def framework_list_path(repo_root: Path) -> Path:
    return repo_root / FRAMEWORK_LIST_FILENAME


def read_framework_patterns(repo_root: Path) -> list[str]:
    path = framework_list_path(repo_root)
    if not path.exists():
        raise FileNotFoundError(f"Framework file list not found: {path}")

    patterns: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        patterns.append(stripped)
    return patterns


def resolve_framework_files(repo_root: Path, patterns: list[str] | None = None) -> list[str]:
    active_patterns = patterns if patterns is not None else read_framework_patterns(repo_root)
    matches: set[str] = set()

    for pattern in active_patterns:
        glob_pattern = _normalize_pattern(pattern)
        if _has_glob(glob_pattern):
            candidates = repo_root.glob(glob_pattern)
        else:
            candidates = [repo_root / glob_pattern]

        for candidate in candidates:
            if not candidate.is_file():
                continue
            try:
                rel_path = candidate.relative_to(repo_root)
            except ValueError:
                continue
            matches.add(rel_path.as_posix())

    return sorted(matches)


def _has_glob(pattern: str) -> bool:
    return any(ch in pattern for ch in "*?[]")


def _normalize_pattern(pattern: str) -> str:
    # pathlib's glob('dir/**') does not include files in all environments.
    if pattern.endswith("/**"):
        return f"{pattern}/*"
    return pattern
