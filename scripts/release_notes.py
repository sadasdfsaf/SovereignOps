#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

FIELD_SEPARATOR = "\x1f"
RECORD_SEPARATOR = "\x1e"

SECTION_ORDER = (
    "Breaking Changes",
    "Added",
    "Fixed",
    "Changed",
    "Documentation",
    "Testing",
    "Build",
    "Maintenance",
    "Other",
)

TYPE_TO_SECTION = {
    "build": "Build",
    "chore": "Maintenance",
    "ci": "Build",
    "docs": "Documentation",
    "feat": "Added",
    "fix": "Fixed",
    "perf": "Changed",
    "refactor": "Changed",
    "test": "Testing",
}

CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[A-Za-z]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<summary>.+)$"
)


@dataclass(frozen=True)
class Commit:
    commit_hash: str
    subject: str
    body: str = ""
    author_date: str = ""


@dataclass(frozen=True)
class Note:
    section: str
    summary: str
    scope: str
    commit_hash: str


def _as_text(value: Any) -> str:
    return "" if value is None else str(value)


def load_commits_from_json(path: Path) -> list[Commit]:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_commits = data.get("commits", data) if isinstance(data, dict) else data
    if not isinstance(raw_commits, list):
        raise ValueError("release notes JSON must be a list or an object with a commits list")

    commits: list[Commit] = []
    for index, item in enumerate(raw_commits):
        if not isinstance(item, dict):
            raise ValueError(f"commit entry {index} must be an object")
        message = _as_text(item.get("message"))
        subject = _as_text(item.get("subject"))
        if not subject and message:
            subject = message.splitlines()[0]
        body = _as_text(item.get("body"))
        if not body and message:
            body = "\n".join(message.splitlines()[1:]).strip()
        if not subject:
            raise ValueError(f"commit entry {index} is missing subject or message")
        commits.append(
            Commit(
                commit_hash=_as_text(item.get("hash") or item.get("commit_hash")),
                subject=subject.strip(),
                body=body,
                author_date=_as_text(item.get("date") or item.get("author_date")),
            )
        )
    return commits


def git_revision_spec(from_ref: str | None, to_ref: str, revision_range: str | None) -> str:
    if revision_range:
        return revision_range
    if from_ref:
        return f"{from_ref}..{to_ref}"
    return to_ref


def load_commits_from_git(
    root: Path,
    *,
    from_ref: str | None = None,
    to_ref: str = "HEAD",
    revision_range: str | None = None,
) -> list[Commit]:
    revision_spec = git_revision_spec(from_ref, to_ref, revision_range)
    pretty = f"%H%x1f%ad%x1f%s%x1f%b%x1e"
    command = [
        "git",
        "-C",
        str(root),
        "log",
        "--no-merges",
        "--reverse",
        "--date=short",
        f"--pretty=format:{pretty}",
        revision_spec,
        "--",
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git log failed")

    commits: list[Commit] = []
    for record in completed.stdout.split(RECORD_SEPARATOR):
        record = record.strip()
        if not record:
            continue
        fields = record.split(FIELD_SEPARATOR, 3)
        while len(fields) < 4:
            fields.append("")
        commit_hash, author_date, subject, body = fields
        commits.append(
            Commit(
                commit_hash=commit_hash.strip(),
                author_date=author_date.strip(),
                subject=subject.strip(),
                body=body.strip(),
            )
        )
    return commits


def has_breaking_marker(subject: str, body: str) -> bool:
    match = CONVENTIONAL_RE.match(subject)
    return bool(match and match.group("breaking")) or "BREAKING CHANGE:" in body


def note_from_commit(commit: Commit) -> Note:
    match = CONVENTIONAL_RE.match(commit.subject)
    if match:
        commit_type = match.group("type").lower()
        section = TYPE_TO_SECTION.get(commit_type, "Other")
        scope = (match.group("scope") or "").strip()
        summary = match.group("summary").strip()
    else:
        section = "Other"
        scope = ""
        summary = commit.subject.strip()

    if has_breaking_marker(commit.subject, commit.body):
        section = "Breaking Changes"

    return Note(
        section=section,
        summary=summary,
        scope=scope,
        commit_hash=commit.commit_hash[:12],
    )


def group_notes(commits: Sequence[Commit]) -> dict[str, list[Note]]:
    grouped = {section: [] for section in SECTION_ORDER}
    for commit in commits:
        note = note_from_commit(commit)
        grouped.setdefault(note.section, []).append(note)
    return grouped


def render_release_notes(
    commits: Sequence[Commit],
    *,
    version: str = "Unreleased",
    release_date: str | None = None,
    source: str | None = None,
) -> str:
    lines = [f"# Release Notes - {version}"]
    metadata: list[str] = []
    if release_date:
        metadata.append(f"Date: {release_date}")
    if source:
        metadata.append(f"Source: `{source}`")
    if metadata:
        lines.extend(["", *metadata])

    grouped = group_notes(commits)
    wrote_section = False
    for section in SECTION_ORDER:
        notes = grouped.get(section, [])
        if not notes:
            continue
        wrote_section = True
        lines.extend(["", f"## {section}"])
        for note in notes:
            scope = f"{note.scope}: " if note.scope else ""
            suffix = f" (`{note.commit_hash}`)" if note.commit_hash else ""
            lines.append(f"- {scope}{note.summary}{suffix}")

    if not wrote_section:
        lines.extend(["", "No notable changes."])

    return "\n".join(lines) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic release notes.")
    parser.add_argument("--root", default=".", help="Repository root for git log input.")
    parser.add_argument("--input-json", help="Read commits from a JSON fixture instead of git.")
    parser.add_argument("--from", dest="from_ref", help="Start revision for git log.")
    parser.add_argument("--to", dest="to_ref", default="HEAD", help="End revision for git log.")
    parser.add_argument("--range", dest="revision_range", help="Complete git revision range.")
    parser.add_argument("--version", default="Unreleased", help="Release version label.")
    parser.add_argument("--date", dest="release_date", help="Release date to print.")
    parser.add_argument("--source-label", help="Source label to print in the notes.")
    parser.add_argument("--output", help="Write notes to this file instead of stdout.")
    args = parser.parse_args(argv)

    if args.input_json:
        commits = load_commits_from_json(Path(args.input_json))
        source = args.source_label
    else:
        root = Path(args.root).resolve()
        commits = load_commits_from_git(
            root,
            from_ref=args.from_ref,
            to_ref=args.to_ref,
            revision_range=args.revision_range,
        )
        source = args.source_label or git_revision_spec(args.from_ref, args.to_ref, args.revision_range)

    notes = render_release_notes(
        commits,
        version=args.version,
        release_date=args.release_date,
        source=source,
    )
    if args.output:
        Path(args.output).write_text(notes, encoding="utf-8")
    else:
        print(notes, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
