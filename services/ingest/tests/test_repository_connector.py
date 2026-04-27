from __future__ import annotations

import hashlib
import os
import tempfile
import unittest
from pathlib import Path

from services.ingest.src.sovereignops_ingest.citation import Citation
from services.ingest.src.sovereignops_ingest.repository import (
    RepositoryConnector,
    RepositoryConnectorError,
    RepositoryRecord,
    detect_media_type,
    is_path_inside_root,
    scan_repository,
)


class RepositoryConnectorTests(unittest.TestCase):
    def test_walks_files_in_deterministic_relative_path_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "zeta.txt", b"z")
            self.write_bytes(root / "alpha.txt", b"a")
            self.write_bytes(root / "notes" / "beta.txt", b"b")
            self.write_bytes(root / "notes" / "alpha.txt", b"a2")

            records = scan_repository(root)

        self.assertEqual(
            [record.relative_path for record in records],
            ["alpha.txt", "notes/alpha.txt", "notes/beta.txt", "zeta.txt"],
        )

    def test_include_paths_reject_absolute_and_parent_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "safe.txt", b"ok")

            bad_paths = [str(root / "safe.txt"), "../safe.txt", "nested/../safe.txt"]
            for include_path in bad_paths:
                with self.subTest(include_path=include_path):
                    with self.assertRaises(RepositoryConnectorError):
                        scan_repository(root, include_paths=(include_path,))

    def test_include_paths_can_limit_scan_to_relative_files_and_dirs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "keep.txt", b"keep")
            self.write_bytes(root / "skip.txt", b"skip")
            self.write_bytes(root / "nested" / "item.txt", b"item")

            records = RepositoryConnector(
                root,
                include_paths=("nested", "keep.txt"),
            ).scan()

        self.assertEqual(
            [record.relative_path for record in records],
            ["keep.txt", "nested/item.txt"],
        )

    def test_ignores_generated_and_private_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "visible" / "keep.txt", b"keep")
            self.write_bytes(root / ".git" / "hidden.txt", b"skip")
            self.write_bytes(root / ".codex-private" / "hidden.txt", b"skip")
            self.write_bytes(root / "node_modules" / "hidden.txt", b"skip")
            self.write_bytes(root / "target" / "hidden.txt", b"skip")
            self.write_bytes(root / "__pycache__" / "hidden.pyc", b"skip")
            self.write_bytes(root / ".venv" / "hidden.txt", b"skip")
            self.write_bytes(root / "dist" / "hidden.txt", b"skip")
            self.write_bytes(root / "build" / "hidden.txt", b"skip")

            records = scan_repository(root)

        self.assertEqual([record.relative_path for record in records], ["visible/keep.txt"])

    def test_detects_media_types(self) -> None:
        self.assertEqual(detect_media_type("notes.md"), "text/markdown")
        self.assertEqual(detect_media_type("items.json"), "application/json")
        self.assertEqual(detect_media_type("table.csv"), "text/csv")
        self.assertEqual(detect_media_type("archive.unknownext"), "application/octet-stream")

    def test_records_checksum_size_source_uri_and_citation_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            payload = b"alpha\nbeta\n"
            self.write_bytes(root / "notes.txt", payload)

            record = scan_repository(root)[0]

        self.assertIsInstance(record, RepositoryRecord)
        self.assertIsInstance(record.citation, Citation)
        self.assertEqual(record.relative_path, "notes.txt")
        self.assertEqual(record.media_type, "text/plain")
        self.assertEqual(record.size_bytes, len(payload))
        self.assertEqual(record.checksum, hashlib.sha256(payload).hexdigest())
        self.assertEqual(record.citation.source_uri, record.source_uri)
        self.assertEqual(record.citation.range.path, "notes.txt")
        self.assertEqual(record.metadata["relative_path"], "notes.txt")
        self.assertTrue(record.source_uri.startswith("file://"))

    def test_text_files_are_read_with_utf8_replacement_behavior(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "bad.txt", b"alpha \xff omega")

            record = scan_repository(root)[0]

        self.assertEqual(record.content, "alpha " + chr(0xFFFD) + " omega")
        self.assertTrue(record.metadata["content_included"])
        self.assertTrue(record.metadata["had_text_decode_errors"])
        self.assertEqual(record.metadata["text_decode_errors"], "replace")

    def test_text_files_over_size_limit_keep_metadata_without_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            self.write_bytes(root / "large.txt", b"abcdef")

            record = scan_repository(root, max_text_bytes=3)[0]

        self.assertIsNone(record.content)
        self.assertFalse(record.metadata["content_included"])
        self.assertEqual(record.metadata["content_skipped_reason"], "size_limit")

    def test_binary_files_keep_checksum_without_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            payload = b"\x00\x01\x02"
            self.write_bytes(root / "payload.bin", payload)

            record = scan_repository(root)[0]

        self.assertEqual(record.media_type, "application/octet-stream")
        self.assertEqual(record.checksum, hashlib.sha256(payload).hexdigest())
        self.assertIsNone(record.content)
        self.assertEqual(record.metadata["content_skipped_reason"], "non_text")

    def test_path_boundary_helper_rejects_paths_outside_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            inside = root / "inside.txt"
            outside = root.parent / "outside.txt"

            self.assertTrue(is_path_inside_root(root, inside))
            self.assertFalse(is_path_inside_root(root, outside))

    def test_external_file_links_are_not_read_when_supported(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            outside = Path(temp_dir) / "outside"
            root.mkdir()
            outside.mkdir()
            self.write_bytes(root / "inside.txt", b"inside")
            self.write_bytes(outside / "secret.txt", b"outside")
            link = root / "linked.txt"
            try:
                os.symlink(outside / "secret.txt", link)
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"file links are unavailable: {exc}")

            records = scan_repository(root)

        self.assertEqual([record.relative_path for record in records], ["inside.txt"])

    @staticmethod
    def write_bytes(path: Path, payload: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)


if __name__ == "__main__":
    unittest.main()
