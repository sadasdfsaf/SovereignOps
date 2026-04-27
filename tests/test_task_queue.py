from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.task_queue import QueueError, filter_tasks, load_tasks, render_prompt, render_status


QUEUE = "\n".join(
    [
        '{"id":"P00-002","order":2,"phase":"P00","title":"Status","estimated_minutes":5,"prompt":"Add status."}',
        '{"id":"P01-001","order":9,"phase":"P01","title":"Ids","estimated_minutes":7,"prompt":"Parse ids."}',
    ]
)


class TaskQueueTests(unittest.TestCase):
    def test_loads_sorts_and_summarizes_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "queue.jsonl"
            path.write_text(QUEUE, encoding="utf-8")

            tasks = load_tasks(path)

        self.assertEqual([task.id for task in tasks], ["P00-002", "P01-001"])
        self.assertEqual(render_status(tasks)["estimated_minutes_total"], 12)

    def test_filters_by_phase_and_query(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "queue.jsonl"
            path.write_text(QUEUE, encoding="utf-8")
            tasks = load_tasks(path)

        filtered = filter_tasks(tasks, phase="P01", query="ids")

        self.assertEqual(len(filtered), 1)
        self.assertIn("Parse ids", render_prompt(filtered[0]))

    def test_reports_malformed_json_with_line_number(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "queue.jsonl"
            path.write_text('{"id": "P00"\n', encoding="utf-8")

            with self.assertRaises(QueueError) as raised:
                load_tasks(path)

        self.assertIn("line 1", str(raised.exception))


if __name__ == "__main__":
    unittest.main()

