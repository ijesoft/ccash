#!/usr/bin/env bash
# Deploy a feature branch to the local Docker stack (ccash-backend,
# celery, ccash-frontend) and run pending migrations inside the backend
# container. Usage: ./scripts/deploy-docker.sh [branch]  (default: current branch)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BRANCH="${1:-$(git branch --show-current)}"

echo "==> Merging $BRANCH into main"
git checkout -q main
git merge --ff-only "$BRANCH"
git log --oneline -3

echo "==> Rebuilding images"
docker compose build backend celery-worker celery-beat frontend

echo "==> Recreating containers"
docker compose up -d backend celery-worker celery-beat frontend nginx

echo "==> Waiting for backend to listen on :8000"
for i in $(seq 1 30); do
  if docker exec ccash-backend python -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:8000/metrics', timeout=5)" \
    >/dev/null 2>&1; then
    echo "backend up after ${i}0s"; break
  fi
  sleep 10
done

echo "==> Running migrations inside ccash-backend"
docker cp backend/migrations ccash-backend:/app/migrations
docker exec -w /app ccash-backend alembic -c migrations/alembic.ini upgrade head
docker exec -w /app ccash-backend alembic -c migrations/alembic.ini current

# nginx resolves the `backend` hostname once at startup and caches it, so a
# recreated backend gets 502s until nginx restarts. Always restart it here.
echo "==> Restarting nginx (fresh upstream DNS)"
docker compose restart nginx >/dev/null
sleep 5

echo "==> Verifying GraphQL via nginx"
python3 -c "
import json, urllib.request
req = urllib.request.Request('http://localhost:80/api/graphql', method='POST',
    data=json.dumps({'query': '{ __typename }'}).encode(),
    headers={'Content-Type': 'application/json'})
print(json.load(urllib.request.urlopen(req)))
"

echo "==> Verifying frontend bundle + SPA"
if ! docker exec ccash-frontend grep -rl "passwordRecoveryRequests" /usr/share/nginx/html/assets/ | head -1; then
  echo "NOTE: passwordRecoveryRequests not found in bundle (expected only for recovery deploys)"
fi
curl -s -o /dev/null -w "SPA index: %{http_code}\n" http://localhost:80/

echo "DEPLOY DONE ($BRANCH -> main, live in docker)"
