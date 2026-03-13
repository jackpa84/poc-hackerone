#!/usr/bin/env bash
# deploy/update.sh — Atualiza a plataforma na EC2 sem downtime
# Uso: ./deploy/update.sh

set -euo pipefail

PATH_APP="${HOME}/bugbounty-platform"
cd "$PATH_APP"

echo "[1/4] Puxando atualizações do repositório..."
git pull --ff-only

echo "[2/4] Rebuild das imagens..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend frontend

echo "[3/4] Rolling restart (backend e workers sem downtime do Nginx)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps backend worker frontend

echo "[4/4] Limpando imagens antigas..."
docker image prune -f

echo ""
echo "Update concluído. Versões rodando:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
