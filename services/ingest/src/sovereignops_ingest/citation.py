from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional, Union

ColumnRef = Union[int, str]


@dataclass(frozen=True)
class CitationRange:
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    path: Optional[str] = None
    row: Optional[int] = None
    column: Optional[ColumnRef] = None

    def __post_init__(self) -> None:
        if self.start_line is not None and self.start_line < 1:
            raise ValueError("start_line must be positive")
        if self.end_line is not None and self.end_line < 1:
            raise ValueError("end_line must be positive")
        if (
            self.start_line is not None
            and self.end_line is not None
            and self.end_line < self.start_line
        ):
            raise ValueError("end_line must be greater than or equal to start_line")
        if self.row is not None and self.row < 1:
            raise ValueError("row must be positive")

    @classmethod
    def lines(cls, start_line: int, end_line: Optional[int] = None) -> "CitationRange":
        return cls(start_line=start_line, end_line=end_line or start_line)

    @classmethod
    def json_path(cls, path: str) -> "CitationRange":
        return cls(path=path)

    @classmethod
    def table_cell(cls, row: int, column: ColumnRef) -> "CitationRange":
        return cls(row=row, column=column)

    def as_dict(self) -> Dict[str, object]:
        data: Dict[str, object] = {}
        if self.start_line is not None:
            data["start_line"] = self.start_line
        if self.end_line is not None:
            data["end_line"] = self.end_line
        if self.path is not None:
            data["path"] = self.path
        if self.row is not None:
            data["row"] = self.row
        if self.column is not None:
            data["column"] = self.column
        return data


@dataclass(frozen=True)
class Citation:
    source_uri: str
    range: CitationRange = field(default_factory=CitationRange)
    trusted: bool = False

    def __post_init__(self) -> None:
        if not self.source_uri:
            raise ValueError("source_uri is required")

    @property
    def untrusted(self) -> bool:
        return not self.trusted

    def as_dict(self) -> Dict[str, object]:
        return {
            "source_uri": self.source_uri,
            "range": self.range.as_dict(),
            "trusted": self.trusted,
        }
