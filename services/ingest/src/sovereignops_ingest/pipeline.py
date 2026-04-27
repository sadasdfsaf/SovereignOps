from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256


@dataclass(frozen=True)
class IngestItem:
    source_uri: str
    content: str
    media_type: str = "text/plain"


@dataclass(frozen=True)
class IngestResult:
    source_uri: str
    checksum: str
    normalized_text: str
    untrusted: bool


def normalize_item(item: IngestItem) -> IngestResult:
    normalized = "\n".join(line.rstrip() for line in item.content.replace("\r\n", "\n").split("\n")).strip()
    return IngestResult(
        source_uri=item.source_uri,
        checksum=sha256(item.content.encode("utf-8")).hexdigest(),
        normalized_text=normalized,
        untrusted=True,
    )

