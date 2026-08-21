#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================="
echo "   🚀 Starting CCash Full Stack"
echo "========================================="

# 1. Start Docker Infrastructure (Postgres, Redis, RabbitMQ, Mailpit)
echo "📦 1. Starting infrastructure containers..."
docker compose -f docker-compose.infra.yml up -d

# 2. Setup logs directory
mkdir -p logs

# 3. Backend setup & virtual environment
echo "🐍 2. Setting up backend & database..."
cd "$DIR/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install -q -r requirements.txt

# Run migrations and seed data
./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head
./.venv/bin/python -m app.seed || true
cd "$DIR"

# 4. Frontend build
echo "⚛️  3. Building frontend..."
cd "$DIR/frontend"
npm install --silent
npm run build
cd "$DIR"

# 5. Start/Restart services via PM2
echo "⚡ 4. Starting PM2 processes (backend, celery, frontend)..."
pm2 start ecosystem.config.js || pm2 restart ecosystem.config.js
pm2 save

echo ""
echo "========================================="
echo "   ✅ CCash is UP and RUNNING!"
echo "========================================="
echo " 🌐 Frontend:  http://localhost:8830"
echo " 🔗 GraphQL:   http://localhost:8830/api/graphql"
echo " 📧 Mailpit:   http://localhost:8025"
echo "========================================="
echo ""
pm2 status

