# Makefile — Automação da BugBounty Platform
#
# Comandos principais:
#   make setup    — configura o ambiente pela primeira vez
#   make build    — constrói todas as imagens Docker
#   make up       — sobe tudo
#   make down     — para tudo
#   make scan     — dispara recon manual em todos os targets ativos

.PHONY: setup build up up-logs down logs restart clean \
        scan scan-now status tools-check \
        logs-api logs-worker logs-frontend \
        dev-backend dev-worker dev-frontend shell-backend shell-worker \
        prod prod-build prod-down prod-logs

# ── Configuração inicial ──────────────────────────────────────────────────────

# Primeira vez: copia o .env e constrói as imagens
setup:
	@[ -f .env ] || cp .env.example .env
	@echo "╔═══════════════════════════════════════════════╗"
	@echo "║  Edite o arquivo .env com suas chaves antes   ║"
	@echo "║  de continuar. Depois rode: make build        ║"
	@echo "╚═══════════════════════════════════════════════╝"
	@echo ""
	@echo "Variáveis obrigatórias no .env:"
	@echo "  MONGO_PASSWORD    — senha do MongoDB"
	@echo "  JWT_SECRET        — chave secreta do JWT (min 32 chars)"
	@echo "  ANTHROPIC_API_KEY — chave da API do Claude (para relatórios com IA)"

# Constrói todas as imagens (necessário após mudar Dockerfile ou requirements.txt)
build:
	docker compose build

# Constrói sem cache (após mudanças em dependências)
build-clean:
	docker compose build --no-cache

# ── Ciclo de vida ─────────────────────────────────────────────────────────────

# Sobe todos os serviços em background
up:
	docker compose up -d
	@echo ""
	@echo "Serviços iniciados:"
	@echo "  API:          http://localhost:8000"
	@echo "  Frontend:     http://localhost:3000"
	@echo "  Mongo UI:     http://localhost:8081"
	@echo "  API Docs:     http://localhost:8000/docs"
	@echo ""
	@echo "Acompanhe os logs: make logs"

# Sobe com logs ao vivo (ctrl+c para parar)
up-logs:
	docker compose up

# Para todos os serviços
down:
	docker compose down

# Remove tudo incluindo volumes (CUIDADO: apaga dados do MongoDB!)
clean:
	@echo "⚠ Isso vai apagar todos os dados do MongoDB. Confirma? [y/N]"
	@read confirm && [ "$$confirm" = "y" ] && docker compose down -v || echo "Cancelado."

# Reinicia um serviço específico
# uso: make restart SERVICE=worker
restart:
	docker compose restart $(SERVICE)

# ── Status e saúde ───────────────────────────────────────────────────────────

# Status de todos os containers com healthcheck
status:
	@docker compose ps
	@echo ""
	@echo "Healthchecks:"
	@docker inspect --format='{{.Name}}: {{.State.Health.Status}}' \
		$$(docker compose ps -q) 2>/dev/null || true

# Verifica quais ferramentas de segurança estão instaladas no container
tools-check:
	@echo "Ferramentas no worker:"
	@docker compose exec worker sh -c '\
		for t in subfinder httpx gau nuclei naabu dnsx katana nmap curl wget; do \
			if command -v $$t >/dev/null 2>&1; then \
				echo "  ✓ $$t ($$($$t -version 2>&1 | head -1))"; \
			else \
				echo "  ✗ $$t (não instalado)"; \
			fi; \
		done'

# Mostra wordlists disponíveis
wordlists:
	@echo "Wordlists em ./tools/wordlists:"
	@ls -lh tools/wordlists/ 2>/dev/null || echo "  Nenhuma wordlist encontrada"

# ── Logs ─────────────────────────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f worker

logs-frontend:
	docker compose logs -f frontend

# ── Scanner automático ────────────────────────────────────────────────────────

# Dispara o scheduler manualmente (enfileira recon em todos os targets ativos)
# O scheduler também roda automaticamente às 06:00 e 18:00 UTC via cron
scan-now:
	@echo "Disparando scanner automático..."
	@docker compose exec worker python3 -c "\
import asyncio; \
from arq import create_pool; \
from arq.connections import RedisSettings; \
from app.config import settings; \
async def run(): \
    redis = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL)); \
    await redis.enqueue_job('task_auto_scheduler'); \
    await redis.aclose(); \
    print('Scheduler enfileirado. Veja os jobs em http://localhost:3000/jobs'); \
asyncio.run(run())"

# Mostra próximas execuções do cron
cron-info:
	@echo "Cron jobs configurados:"
	@echo "  task_auto_scheduler → 06:00 UTC e 18:00 UTC (recon em todos os targets ativos)"
	@echo ""
	@echo "Para disparar manualmente: make scan-now"

# ── Desenvolvimento local (sem Docker) ───────────────────────────────────────

dev-backend:
	cd backend && pip install -r requirements.txt && \
		uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-worker:
	cd backend && arq app.workers.settings.WorkerSettings

dev-frontend:
	cd frontend && npm install && npm run dev

# ── Shells interativos ────────────────────────────────────────────────────────

shell-backend:
	docker compose exec backend bash

shell-worker:
	docker compose exec worker bash

# ── Build e deploy ────────────────────────────────────────────────────────────

# Rebuild completo + restart (usar após mudar Dockerfile ou requirements.txt)
redeploy:
	docker compose build --no-cache backend worker
	docker compose up -d --force-recreate backend worker
	@echo "Redeploy concluído. Acompanhe: make logs"

# ── Produção ──────────────────────────────────────────────────────────────────

# Sobe em modo produção (sem hot-reload, portas internas fechadas)
prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
	@echo ""
	@echo "Produção iniciada:"
	@echo "  Frontend: http://localhost:3000"
	@echo "  API:      http://localhost:8000"
	@echo ""
	@echo "Acompanhe: make prod-logs"

# Build de produção
prod-build:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache

# Para produção
prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Logs de produção
prod-logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
