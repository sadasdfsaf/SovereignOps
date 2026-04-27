from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
from types import MappingProxyType
from typing import Any, Iterable, Mapping, Optional, Sequence, Set, Tuple, Union

from .citation import Citation, CitationRange

PathInput = Union[str, "os.PathLike[str]"]

DEFAULT_IGNORED_DIRS = frozenset(
    {
        ".codex-private",
        ".git",
        ".venv",
        "__pycache__",
        "build",
        "dist",
        "node_modules",
        "target",
    }
)
DEFAULT_MAX_TEXT_BYTES = 5 * 1024 * 1024

_CHECKSUM_CHUNK_BYTES = 1024 * 1024
_MEDIA_TYPES_BY_SUFFIX: Mapping[str, str] = MappingProxyType(
    {
        ".cfg": "text/plain",
        ".css": "text/css",
        ".csv": "text/csv",
        ".htm": "text/html",
        ".html": "text/html",
        ".ini": "text/plain",
        ".js": "text/javascript",
        ".json": "application/json",
        ".jsonl": "application/x-ndjson",
        ".jsx": "text/javascript",
        ".log": "text/plain",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".py": "text/x-python",
        ".rst": "text/x-rst",
        ".svg": "image/svg+xml",
        ".toml": "application/toml",
        ".ts": "text/typescript",
        ".tsx": "text/typescript",
        ".txt": "text/plain",
        ".xml": "application/xml",
        ".yaml": "application/yaml",
        ".yml": "application/yaml",
    }
)
_TEXT_LIKE_MEDIA_TYPES = frozenset(
    {
        "application/json",
        "application/toml",
        "application/xml",
        "application/x-ndjson",
        "application/yaml",
        "image/svg+xml",
    }
)


class RepositoryConnectorError(ValueError):
    pass


@dataclass(frozen=True)
class RepositoryRecord:
    source_uri: str
    relative_path: str
    media_type: str
    size_bytes: int
    checksum: str
    citation: Citation
    metadata: Mapping[str, Any] = field(default_factory=dict)
    content: Optional[str] = None

    def __post_init__(self) -> None:
        if not self.source_uri:
            raise ValueError("source_uri is required")
        if not self.relative_path:
            raise ValueError("relative_path is required")
        if self.size_bytes < 0:
            raise ValueError("size_bytes must be non-negative")
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))

    @property
    def untrusted(self) -> bool:
        return self.citation.untrusted


class RepositoryConnector:
    def __init__(
        self,
        root: PathInput,
        include_paths: Optional[Sequence[PathInput]] = None,
        ignored_dirs: Iterable[str] = DEFAULT_IGNORED_DIRS,
        max_text_bytes: int = DEFAULT_MAX_TEXT_BYTES,
        trusted: bool = False,
    ) -> None:
        self.root = root
        self.include_paths = include_paths
        self.ignored_dirs = tuple(ignored_dirs)
        self.max_text_bytes = max_text_bytes
        self.trusted = trusted

    def scan(self) -> Tuple[RepositoryRecord, ...]:
        return scan_repository(
            self.root,
            include_paths=self.include_paths,
            ignored_dirs=self.ignored_dirs,
            max_text_bytes=self.max_text_bytes,
            trusted=self.trusted,
        )


def scan_repository(
    root: PathInput,
    include_paths: Optional[Sequence[PathInput]] = None,
    ignored_dirs: Iterable[str] = DEFAULT_IGNORED_DIRS,
    max_text_bytes: int = DEFAULT_MAX_TEXT_BYTES,
    trusted: bool = False,
) -> Tuple[RepositoryRecord, ...]:
    if max_text_bytes < 0:
        raise RepositoryConnectorError("max_text_bytes must be non-negative")

    root_path = _resolve_root(root)
    ignored = frozenset(ignored_dirs)
    files = _included_files(root_path, include_paths, ignored)
    return tuple(
        _record_for_file(
            root_path=root_path,
            file_path=file_path,
            max_text_bytes=max_text_bytes,
            trusted=trusted,
        )
        for file_path in files
    )


def detect_media_type(path: PathInput) -> str:
    path_text = os.fspath(path)
    suffix = Path(path_text).suffix.lower()
    if suffix in _MEDIA_TYPES_BY_SUFFIX:
        return _MEDIA_TYPES_BY_SUFFIX[suffix]

    guessed, _encoding = mimetypes.guess_type(path_text)
    if guessed:
        return guessed
    return "application/octet-stream"


def is_text_like_media_type(media_type: str) -> bool:
    return media_type.startswith("text/") or media_type in _TEXT_LIKE_MEDIA_TYPES


def is_path_inside_root(root: PathInput, path: PathInput) -> bool:
    root_path = Path(root).expanduser().resolve(strict=False)
    candidate = Path(path).expanduser().resolve(strict=False)
    return _is_relative_to(candidate, root_path)


def _resolve_root(root: PathInput) -> Path:
    root_path = Path(root).expanduser().resolve(strict=True)
    if not root_path.is_dir():
        raise RepositoryConnectorError(f"repository root is not a directory: {root_path}")
    return root_path


def _included_files(
    root_path: Path,
    include_paths: Optional[Sequence[PathInput]],
    ignored_dirs: Set[str],
) -> Tuple[Path, ...]:
    targets = (
        (root_path,)
        if include_paths is None
        else tuple(_resolve_include_path(root_path, include_path) for include_path in include_paths)
    )
    files_by_relative_path = {}

    for target in targets:
        if _has_ignored_directory(root_path, target, ignored_dirs):
            continue
        if target.is_dir():
            for file_path in _walk_files(root_path, target, ignored_dirs):
                relative_path = _relative_path(root_path, file_path)
                files_by_relative_path[relative_path] = file_path
            continue
        if target.is_file():
            if _file_stays_inside_root(root_path, target):
                files_by_relative_path[_relative_path(root_path, target)] = target

    return tuple(
        files_by_relative_path[relative_path] for relative_path in sorted(files_by_relative_path)
    )


def _resolve_include_path(root_path: Path, include_path: PathInput) -> Path:
    include = Path(include_path)
    if include.is_absolute() or include.drive:
        raise RepositoryConnectorError(f"include path must be relative: {include_path}")
    if any(part == os.pardir for part in include.parts):
        raise RepositoryConnectorError(f"include path cannot contain parent traversal: {include_path}")

    try:
        candidate = (root_path / include).resolve(strict=True)
    except OSError as exc:
        raise RepositoryConnectorError(f"include path does not exist: {include_path}") from exc
    if not _is_relative_to(candidate, root_path):
        raise RepositoryConnectorError(f"include path escapes repository root: {include_path}")
    return candidate


def _walk_files(root_path: Path, start_path: Path, ignored_dirs: Set[str]) -> Iterable[Path]:
    for current_root, dirnames, filenames in os.walk(start_path, topdown=True, followlinks=False):
        current_path = Path(current_root)
        dirnames[:] = [
            dirname
            for dirname in sorted(dirnames)
            if dirname not in ignored_dirs
            and _is_relative_to((current_path / dirname).resolve(strict=False), root_path)
        ]
        for filename in sorted(filenames):
            file_path = current_path / filename
            if _has_ignored_directory(root_path, file_path, ignored_dirs):
                continue
            if file_path.is_file() and _file_stays_inside_root(root_path, file_path):
                yield file_path


def _record_for_file(
    root_path: Path,
    file_path: Path,
    max_text_bytes: int,
    trusted: bool,
) -> RepositoryRecord:
    stat = file_path.stat()
    relative_path = _relative_path(root_path, file_path)
    source_uri = file_path.as_uri()
    media_type = detect_media_type(relative_path)
    checksum = _checksum_file(file_path)
    content, text_metadata = _read_text_content(file_path, stat.st_size, media_type, max_text_bytes)
    citation = Citation(
        source_uri=source_uri,
        range=CitationRange(path=relative_path),
        trusted=trusted,
    )
    metadata = {
        "connector": "repository",
        "root_uri": root_path.as_uri(),
        "relative_path": relative_path,
        "file_name": file_path.name,
        "extension": file_path.suffix.lower(),
        "content_included": content is not None,
    }
    metadata.update(text_metadata)

    return RepositoryRecord(
        source_uri=source_uri,
        relative_path=relative_path,
        media_type=media_type,
        size_bytes=stat.st_size,
        checksum=checksum,
        citation=citation,
        metadata=metadata,
        content=content,
    )


def _checksum_file(file_path: Path) -> str:
    digest = sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(_CHECKSUM_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_text_content(
    file_path: Path,
    size_bytes: int,
    media_type: str,
    max_text_bytes: int,
) -> Tuple[Optional[str], Mapping[str, object]]:
    text_like = is_text_like_media_type(media_type)
    metadata = {
        "text_like": text_like,
        "text_encoding": "utf-8" if text_like else None,
        "text_decode_errors": "replace" if text_like else None,
        "had_text_decode_errors": False,
        "content_skipped_reason": None,
    }
    if not text_like:
        metadata["content_skipped_reason"] = "non_text"
        return None, metadata
    if size_bytes > max_text_bytes:
        metadata["content_skipped_reason"] = "size_limit"
        return None, metadata

    with file_path.open("rb") as handle:
        data = handle.read(max_text_bytes + 1)
    if len(data) > max_text_bytes:
        metadata["content_skipped_reason"] = "size_limit"
        return None, metadata

    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError:
        content = data.decode("utf-8", errors="replace")
        metadata["had_text_decode_errors"] = True
    return content, metadata


def _file_stays_inside_root(root_path: Path, file_path: Path) -> bool:
    try:
        resolved = file_path.resolve(strict=True)
    except OSError:
        return False
    return _is_relative_to(resolved, root_path)


def _has_ignored_directory(root_path: Path, path: Path, ignored_dirs: Set[str]) -> bool:
    try:
        parts = path.relative_to(root_path).parts
    except ValueError:
        return True
    directory_parts = parts if path.is_dir() else parts[:-1]
    return any(part in ignored_dirs for part in directory_parts)


def _relative_path(root_path: Path, file_path: Path) -> str:
    return file_path.relative_to(root_path).as_posix()


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
