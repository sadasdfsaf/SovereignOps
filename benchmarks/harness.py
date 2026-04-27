from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple


BenchmarkFunction = Callable[[], Mapping[str, Any]]
Clock = Callable[[], float]


class BenchmarkError(ValueError):
    """Raised when a benchmark case or run configuration is invalid."""


@dataclass(frozen=True)
class BenchmarkCase:
    name: str
    func: BenchmarkFunction
    description: str = ""


@dataclass(frozen=True)
class BenchmarkResult:
    name: str
    repeats: int
    operations: int
    checksum: str
    metadata: Mapping[str, Any]
    elapsed_seconds: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "checksum": self.checksum,
            "metadata": self.metadata,
            "name": self.name,
            "operations": self.operations,
            "repeats": self.repeats,
        }
        if self.elapsed_seconds is not None:
            payload["elapsedSeconds"] = self.elapsed_seconds
        return payload


@dataclass(frozen=True)
class BenchmarkRunSummary:
    dry_run: bool
    repeats: int
    results: Tuple[BenchmarkResult, ...]
    schema_version: str = "sovereignops.benchmarks.v1"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "caseCount": len(self.results),
            "cases": [result.to_dict() for result in self.results],
            "dryRun": self.dry_run,
            "repeats": self.repeats,
            "schemaVersion": self.schema_version,
        }


class BenchmarkRegistry:
    def __init__(self) -> None:
        self._cases: Dict[str, BenchmarkCase] = {}

    def register(
        self,
        name: str,
        func: Optional[BenchmarkFunction] = None,
        *,
        description: str = "",
    ) -> Callable[[BenchmarkFunction], BenchmarkFunction]:
        clean_name = name.strip()
        if not clean_name:
            raise BenchmarkError("benchmark name must not be empty")
        if clean_name in self._cases:
            raise BenchmarkError(f"duplicate benchmark name: {clean_name}")

        def decorator(candidate: BenchmarkFunction) -> BenchmarkFunction:
            if clean_name in self._cases:
                raise BenchmarkError(f"duplicate benchmark name: {clean_name}")
            self._cases[clean_name] = BenchmarkCase(
                name=clean_name,
                func=candidate,
                description=description,
            )
            return candidate

        if func is not None:
            return decorator(func)
        return decorator

    def get(self, name: str) -> BenchmarkCase:
        try:
            return self._cases[name]
        except KeyError as exc:
            raise BenchmarkError(f"unknown benchmark case: {name}") from exc

    def names(self) -> List[str]:
        return sorted(self._cases)

    def cases(self, selected: Optional[Iterable[str]] = None) -> List[BenchmarkCase]:
        names = self.names() if selected is None else sorted(selected)
        return [self.get(name) for name in names]


DEFAULT_REGISTRY = BenchmarkRegistry()


def register_benchmark(
    name: str,
    func: Optional[BenchmarkFunction] = None,
    *,
    description: str = "",
) -> Callable[[BenchmarkFunction], BenchmarkFunction]:
    return DEFAULT_REGISTRY.register(name, func, description=description)


def stable_digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return sha256(encoded.encode("utf-8")).hexdigest()[:16]


def _json_normalize(value: Any) -> Any:
    encoded = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return json.loads(encoded)


def _normalize_sample(case: BenchmarkCase, sample: Mapping[str, Any]) -> Dict[str, Any]:
    if not isinstance(sample, Mapping):
        raise BenchmarkError(f"{case.name} returned {type(sample).__name__}, expected mapping")

    operations = int(sample.get("operations", 1))
    if operations < 0:
        raise BenchmarkError(f"{case.name} returned negative operation count")

    metadata = _json_normalize(sample.get("metadata", {}))
    checksum = str(sample.get("checksum", stable_digest(sample)))

    return {
        "checksum": checksum,
        "metadata": metadata,
        "operations": operations,
    }


def _run_case(
    case: BenchmarkCase,
    *,
    repeats: int,
    dry_run: bool,
    clock: Clock,
) -> BenchmarkResult:
    started = None if dry_run else clock()
    samples = [_normalize_sample(case, case.func()) for _ in range(repeats)]
    elapsed = None if started is None else round(clock() - started, 9)

    first = samples[0]
    for sample in samples[1:]:
        if sample != first:
            raise BenchmarkError(f"{case.name} produced non-deterministic samples")

    return BenchmarkResult(
        name=case.name,
        repeats=repeats,
        operations=sum(int(sample["operations"]) for sample in samples),
        checksum=stable_digest(samples),
        metadata=first["metadata"],
        elapsed_seconds=elapsed,
    )


def run_benchmarks(
    registry: BenchmarkRegistry,
    *,
    repeats: int = 5,
    selected: Optional[Iterable[str]] = None,
    dry_run: bool = False,
    clock: Optional[Clock] = None,
) -> BenchmarkRunSummary:
    if repeats < 1:
        raise BenchmarkError("repeats must be at least 1")

    timer = time.perf_counter if clock is None else clock
    results = tuple(
        _run_case(case, repeats=repeats, dry_run=dry_run, clock=timer)
        for case in registry.cases(selected)
    )
    return BenchmarkRunSummary(dry_run=dry_run, repeats=repeats, results=results)


def render_json(summary: BenchmarkRunSummary) -> str:
    return json.dumps(summary.to_dict(), ensure_ascii=True, indent=2, sort_keys=True) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run SovereignOps Python benchmark cases.")
    parser.add_argument(
        "--case",
        action="append",
        dest="cases",
        help="Benchmark case to run. May be passed more than once.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run cases without collecting elapsed time for deterministic JSON output.",
    )
    parser.add_argument(
        "--repeat",
        default=5,
        type=int,
        help="Number of times to invoke each benchmark case.",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    from . import cases as _cases  # noqa: F401

    args = build_parser().parse_args(argv)
    try:
        summary = run_benchmarks(
            DEFAULT_REGISTRY,
            repeats=args.repeat,
            selected=args.cases,
            dry_run=args.dry_run,
        )
    except BenchmarkError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(render_json(summary), end="")
    return 0
