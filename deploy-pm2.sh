#!/bin/bash
set -e

echo "=== CCash PM2 Deployment ==="

# Create logs directory
mkdir -p logs

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
pip install -r requirements.txt --upgrade
cd ..

# Build frontend
echo "Building frontend..."
cd frontend
npm ci --omit=dev || npm install
npm run build
cd ..

# Start with PM2
echo "Starting services with PM2..."
pm2 start ecosystem.config.js || pm2 reload ecosystem.config.js

# Save PM2 process list
pm2 save

echo ""
echo "=== Deployment complete ==="
echo "Frontend: http://localhost:8830"
echo "Backend:  http://localhost:8831/graphql"
echo ""
pm2 status
