#!/bin/bash
# Celery worker + embedded beat. Without this process every send_email_notification
# .delay() call queues to RabbitMQ with no consumer, so registration and login
# OTP emails are never delivered.
cd /home/ubuntu/Github/ccash/backend
exec /home/ubuntu/Github/ccash/backend/.venv/bin/python -m celery \
  -A app.tasks.celery_app:celery_app worker \
  --beat --loglevel=info --concurrency=2
