#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN=python
elif command -v python.exe >/dev/null 2>&1; then
  PYTHON_BIN=python.exe
else
  echo "No Python interpreter found for smoke check" >&2
  exit 1
fi

"${PYTHON_BIN}" "${ROOT}/scripts/smoke.py" --root "${ROOT}"
