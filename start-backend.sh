#!/bin/bash
cd /home/ubuntu/Github/ccash/backend
exec /home/ubuntu/Github/ccash/backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8831 --workers 4
