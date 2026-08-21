#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"
PYTHON_BIN="$DIR/backend/.venv/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi
exec "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port 8831 --workers 4

