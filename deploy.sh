#!/bin/bash
set -euo pipefail

echo "--- START DEPLOY (YARN + DOCKER COMPOSE) ---"

echo "[1] Git pull code mới nhất..."
git pull --rebase || true

echo "[3] Build & chạy docker-compose.prod.yml với Docker Compose V2..."
sudo -E docker compose -f docker-compose.prod.yml up -d --build

echo "--- DEPLOY DONE ---"

