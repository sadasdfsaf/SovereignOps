#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


class QueueError(ValueError):
    """Raised when a task queue file is missing, malformed, or ambiguous."""


@dataclass(frozen=True)
class Task:
    id: str
    order: int
    phase: str
    title: str
    estimated_minutes: int
    prompt: str
    suggested_files: tuple[str, ...]
    acceptance: tuple[str, ...]

    @classmethod
    def from_json(cls, payload: dict[str, Any], *, line_number: int) -> "Task":
        missing = [field for field in ("id", "order", "phase", "title") if field not in payload]
        if missing:
            raise QueueError(f"line {line_number}: missing required fields: {', '.join(missing)}")
        return cls(
            id=str(payload["id"]),
            order=int(payload["order"]),
            phase=str(payload["phase"]),
            title=str(payload["title"]),
            estimated_minutes=int(payload.get("estimated_minutes", 0)),
            prompt=str(payload.get("prompt", "")),
            suggested_files=tuple(str(item) for item in payload.get("suggested_files", [])),
            acceptance=tuple(str(item) for item in payload.get("acceptance", [])),
        )


def load_tasks(path: Path) -> list[Task]:
    if not path.exists():
        raise QueueError(f"queue file does not exist: {path}")
    if path.is_dir():
        raise QueueError(f"queue path is a directory, expected JSONL file: {path}")

    tasks: list[Task] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise QueueError(f"line {line_number}: invalid JSON: {exc.msg}") from exc
            if not isinstance(payload, dict):
                raise QueueError(f"line {line_number}: task entry must be a JSON object")
            tasks.append(Task.from_json(payload, line_number=line_number))
    if not tasks:
        raise QueueError(f"queue file contains no tasks: {path}")
    return sorted(tasks, key=lambda task: (task.order, task.id))


def filter_tasks(tasks: Iterable[Task], *, phase: str | None = None, query: str | None = None) -> list[Task]:
    query_text = query.lower() if query else None
    filtered: list[Task] = []
    for task in tasks:
        if phase and task.phase != phase:
            continue
        if query_text and query_text not in f"{task.id} {task.title} {task.prompt}".lower():
            continue
        filtered.append(task)
    return filtered


def render_status(tasks: list[Task]) -> dict[str, Any]:
    by_phase: dict[str, int] = {}
    total_minutes = 0
    for task in tasks:
        by_phase[task.phase] = by_phase.get(task.phase, 0) + 1
        total_minutes += task.estimated_minutes
    return {
        "tasks": len(tasks),
        "estimated_minutes_total": total_minutes,
        "estimated_hours_total": round(total_minutes / 60, 2),
        "phases": dict(sorted(by_phase.items())),
        "first_id": tasks[0].id,
        "last_id": tasks[-1].id,
    }


def render_prompt(task: Task) -> str:
    files = "\n".join(f"- {item}" for item in task.suggested_files) or "- Choose appropriate files."
    acceptance = "\n".join(f"- {item}" for item in task.acceptance) or "- Add validation for the behavior."
    return "\n".join(
        [
            f"Task id: {task.id}",
            f"Phase: {task.phase}",
            f"Title: {task.title}",
            f"Estimated minutes: {task.estimated_minutes}",
            "",
            "Prompt:",
            task.prompt,
            "",
            "Suggested files:",
            files,
            "",
            "Acceptance:",
            acceptance,
        ]
    )


def find_task(tasks: Iterable[Task], task_id: str) -> Task:
    for task in tasks:
        if task.id == task_id:
            return task
    raise QueueError(f"unknown task id: {task_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect JSONL task queues without storing private queues.")
    parser.add_argument("--queue", required=True, type=Path, help="Path to a JSONL task queue.")
    parser.add_argument("--phase", help="Filter by phase, for example P00.")
    parser.add_argument("--query", help="Case-insensitive search across id, title, and prompt.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Print queue counts and estimated duration.")
    sub.add_parser("list", help="List matching task ids and titles.")

    prompt_parser = sub.add_parser("prompt", help="Print one task prompt.")
    prompt_parser.add_argument("--id", required=True, help="Task id to render.")

    args = parser.parse_args()
    try:
        tasks = filter_tasks(load_tasks(args.queue), phase=args.phase, query=args.query)
        if not tasks:
            raise QueueError("no tasks matched the provided filters")

        if args.command == "status":
            print(json.dumps(render_status(tasks), indent=2, sort_keys=True))
        elif args.command == "list":
            for task in tasks:
                print(f"{task.id}\t{task.phase}\t{task.title}")
        elif args.command == "prompt":
            print(render_prompt(find_task(tasks, args.id)))
    except QueueError as exc:
        raise SystemExit(f"task queue error: {exc}") from exc
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

