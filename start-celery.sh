#!/bin/bash
# Celery worker + embedded beat. Without this process every send_email_notification
# .delay() call queues to RabbitMQ with no consumer, so registration and login
# OTP emails are never delivered.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"
PYTHON_BIN="$DIR/backend/.venv/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi
exec "$PYTHON_BIN" -m celery \
  -A app.tasks.celery_app:celery_app worker \
  --beat --loglevel=info --concurrency=2

