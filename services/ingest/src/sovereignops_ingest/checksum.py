from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Dict, Iterable, List, Optional, Set


def checksum_bytes(data: bytes) -> str:
    return sha256(data).hexdigest()


def checksum_text(text: str, encoding: str = "utf-8") -> str:
    return checksum_bytes(text.encode(encoding))


@dataclass(frozen=True)
class DeduplicationResult:
    checksum: str
    source_uri: Optional[str]
    is_duplicate: bool
    duplicate_of: Optional[str] = None


class ChecksumIndex:
    def __init__(self) -> None:
        self._first_source_by_checksum: Dict[str, Optional[str]] = {}

    def add_checksum(
        self,
        checksum: str,
        source_uri: Optional[str] = None,
    ) -> DeduplicationResult:
        first_source = self._first_source_by_checksum.get(checksum)
        if checksum in self._first_source_by_checksum:
            return DeduplicationResult(
                checksum=checksum,
                source_uri=source_uri,
                is_duplicate=True,
                duplicate_of=first_source,
            )

        self._first_source_by_checksum[checksum] = source_uri
        return DeduplicationResult(
            checksum=checksum,
            source_uri=source_uri,
            is_duplicate=False,
        )

    def add_bytes(
        self,
        data: bytes,
        source_uri: Optional[str] = None,
    ) -> DeduplicationResult:
        return self.add_checksum(checksum_bytes(data), source_uri=source_uri)

    def add_text(
        self,
        text: str,
        source_uri: Optional[str] = None,
        encoding: str = "utf-8",
    ) -> DeduplicationResult:
        return self.add_bytes(text.encode(encoding), source_uri=source_uri)

    def seen_checksum(self, checksum: str) -> bool:
        return checksum in self._first_source_by_checksum

    def seen_text(self, text: str, encoding: str = "utf-8") -> bool:
        return self.seen_checksum(checksum_text(text, encoding=encoding))


def deduplicate_texts(texts: Iterable[str]) -> List[str]:
    index = ChecksumIndex()
    unique: List[str] = []
    for text in texts:
        result = index.add_text(text)
        if not result.is_duplicate:
            unique.append(text)
    return unique


def duplicate_checksums(checksums: Iterable[str]) -> Set[str]:
    seen: Set[str] = set()
    duplicates: Set[str] = set()
    for value in checksums:
        if value in seen:
            duplicates.add(value)
        else:
            seen.add(value)
    return duplicates
