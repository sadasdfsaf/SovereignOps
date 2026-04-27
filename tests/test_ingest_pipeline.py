from __future__ import annotations

import unittest

from services.ingest.src.sovereignops_ingest import IngestItem, normalize_item


class IngestPipelineTests(unittest.TestCase):
    def test_normalize_item_trims_lines_and_marks_untrusted(self) -> None:
        result = normalize_item(IngestItem(source_uri="file://note.md", content="Alpha  \r\nBeta\n"))

        self.assertEqual(result.normalized_text, "Alpha\nBeta")
        self.assertTrue(result.untrusted)
        self.assertEqual(len(result.checksum), 64)


if __name__ == "__main__":
    unittest.main()

