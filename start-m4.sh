#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  BugBounty Platform — Launcher otimizado para Apple Silicon M4
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Cores do terminal ──────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()  { echo -e "${CYAN}[INFO]${RESET} $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()  { echo -e "${RED}[ERRO]${RESET} $*" >&2; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          BugBounty Platform — Apple M4 Launcher         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ── Diretório do projeto ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Pré-requisitos ──────────────────────────────────────────────────────────
log "Verificando pré-requisitos..."

command -v docker >/dev/null 2>&1 || die "Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop"

# Verifica se o Docker daemon está rodando
if ! docker info >/dev/null 2>&1; then
  die "Docker Desktop não está rodando. Abra o Docker Desktop e tente novamente."
fi

# Verifica docker compose v2
docker compose version >/dev/null 2>&1 || die "docker compose v2 não encontrado. Atualize o Docker Desktop."

ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ── 2. Arquitetura ─────────────────────────────────────────────────────────────
ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
  warn "Arquitetura detectada: $ARCH (esperado arm64). O script foi feito para Apple Silicon."
fi

# ── 3. Detectar recursos do M4 ────────────────────────────────────────────────
log "Detectando recursos do sistema..."

# Núcleos físicos e lógicos
TOTAL_CORES=$(sysctl -n hw.logicalcpu 2>/dev/null || echo 8)
PERF_CORES=$(sysctl -n hw.perflevel0.logicalcpu 2>/dev/null || echo 4)
EFF_CORES=$(sysctl -n hw.perflevel1.logicalcpu 2>/dev/null || echo 4)

# RAM total em GB
TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo $((16 * 1024 * 1024 * 1024)))
TOTAL_RAM_GB=$(( TOTAL_RAM_BYTES / 1024 / 1024 / 1024 ))

ok "CPU: ${TOTAL_CORES} cores (${PERF_CORES}P + ${EFF_CORES}E)"
ok "RAM: ${TOTAL_RAM_GB} GB"

# ── 4. Calcular alocação ótima ────────────────────────────────────────────────
# Reserva ~20% da RAM para o macOS e outros processos
USABLE_RAM_GB=$(( TOTAL_RAM_GB * 80 / 100 ))

# MongoDB: máximo de 25% da RAM utilizável para o WiredTiger cache
MONGO_CACHE_GB=$(( USABLE_RAM_GB / 4 ))
MONGO_CACHE_GB=$(( MONGO_CACHE_GB < 1 ? 1 : MONGO_CACHE_GB ))
MONGO_MEM_MB=$(( (MONGO_CACHE_GB + 2) * 1024 ))
MONGO_CPUS=$(( TOTAL_CORES > 4 ? 4 : TOTAL_CORES ))

# Redis: 10% da RAM, mínimo 512 MB
REDIS_MEM_MB=$(( USABLE_RAM_GB * 1024 / 10 ))
REDIS_MEM_MB=$(( REDIS_MEM_MB < 512 ? 512 : REDIS_MEM_MB ))
REDIS_MEM_MAX="${REDIS_MEM_MB}mb"
REDIS_IO_THREADS=$(( PERF_CORES > 4 ? 4 : PERF_CORES ))

# Backend: uvicorn workers = núcleos de performance * 2 + 1
WEB_CONCURRENCY=$(( PERF_CORES * 2 + 1 ))
WEB_CONCURRENCY=$(( WEB_CONCURRENCY > 16 ? 16 : WEB_CONCURRENCY ))
BACKEND_MEM_MB=$(( WEB_CONCURRENCY * 256 ))
BACKEND_CPUS=$(( PERF_CORES > 6 ? 6 : PERF_CORES ))

# Workers ARQ: 1 réplica por núcleo de performance (mín 4, máx 12)
WORKER_REPLICAS=$(( PERF_CORES > 4 ? PERF_CORES : 4 ))
WORKER_REPLICAS=$(( WORKER_REPLICAS > 12 ? 12 : WORKER_REPLICAS ))
WORKER_MEM_MB=4096
WORKER_CPUS=$(( TOTAL_CORES / WORKER_REPLICAS ))
WORKER_CPUS=$(( WORKER_CPUS < 1 ? 1 : WORKER_CPUS ))

# Frontend: fixo (serviço leve)
FRONTEND_MEM_MB=512
FRONTEND_CPUS=2

echo ""
log "Configuração calculada para este M4:"
printf "  %-20s %s\n" "MongoDB cache:"   "${MONGO_CACHE_GB} GB / ${MONGO_MEM_MB} MB RAM / ${MONGO_CPUS} CPUs"
printf "  %-20s %s\n" "Redis:"           "${REDIS_MEM_MB} MB RAM / io-threads=${REDIS_IO_THREADS}"
printf "  %-20s %s\n" "Backend:"         "${BACKEND_MEM_MB} MB RAM / ${BACKEND_CPUS} CPUs / uvicorn=${WEB_CONCURRENCY} workers"
printf "  %-20s %s\n" "ARQ Workers:"     "${WORKER_REPLICAS} réplicas × ${WORKER_MEM_MB} MB RAM / ${WORKER_CPUS} CPUs cada"
printf "  %-20s %s\n" "Frontend:"        "${FRONTEND_MEM_MB} MB RAM / ${FRONTEND_CPUS} CPUs"
echo ""

# ── 5. Verificar .env ─────────────────────────────────────────────────────────
log "Verificando configuração .env..."

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    warn ".env criado a partir do .env.example — edite as variáveis antes de continuar."
    warn "Variáveis obrigatórias: MONGO_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY"
    exit 1
  else
    die ".env não encontrado e .env.example também não existe."
  fi
fi

# Carrega .env para verificar variáveis críticas
set -o allexport
# shellcheck disable=SC1091
source .env
set +o allexport

MISSING_VARS=()
[[ -z "${MONGO_PASSWORD:-}" || "$MONGO_PASSWORD" == "changeme" ]] && MISSING_VARS+=("MONGO_PASSWORD")
[[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == *"change-this"* ]] && MISSING_VARS+=("JWT_SECRET")
[[ -z "${ANTHROPIC_API_KEY:-}" || "$ANTHROPIC_API_KEY" == "your-key-here" ]] && MISSING_VARS+=("ANTHROPIC_API_KEY")

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  warn "As seguintes variáveis no .env precisam ser configuradas:"
  for v in "${MISSING_VARS[@]}"; do
    warn "  - $v"
  done
  echo ""
  read -r -p "Continuar mesmo assim? [s/N] " confirm
  [[ "$confirm" == "s" || "$confirm" == "S" ]] || exit 1
fi

ok ".env carregado"

# ── 6. Gerar override do docker-compose para M4 ───────────────────────────────
M4_OVERRIDE="docker-compose.m4.yml"
log "Gerando ${M4_OVERRIDE}..."

cat > "$M4_OVERRIDE" <<OVERRIDE
# Gerado automaticamente por start-m4.sh — não edite manualmente
# Otimizado para: ${TOTAL_CORES} cores / ${TOTAL_RAM_GB} GB RAM (Apple M4)
services:

  mongodb:
    platform: linux/arm64
    command: >
      mongod
        --wiredTigerCacheSizeGB ${MONGO_CACHE_GB}
        --setParameter wiredTigerConcurrentReadTransactions=512
        --setParameter wiredTigerConcurrentWriteTransactions=256
        --setParameter diagnosticDataCollectionEnabled=false
        --setParameter maxTransactionLockRequestTimeoutMillis=5000
        --setParameter transactionLifetimeLimitSeconds=120
    deploy:
      resources:
        limits:
          memory: ${MONGO_MEM_MB}M
          cpus: "${MONGO_CPUS}.0"

  redis:
    platform: linux/arm64
    command: >
      redis-server
        --appendonly yes
        --maxmemory ${REDIS_MEM_MAX}
        --maxmemory-policy allkeys-lru
        --tcp-backlog 1024
        --hz 100
        --io-threads ${REDIS_IO_THREADS}
        --io-threads-do-reads yes
        --lazyfree-lazy-eviction yes
        --lazyfree-lazy-expire yes
        --save ""
    deploy:
      resources:
        limits:
          memory: ${REDIS_MEM_MB}M
          cpus: "2.0"

  backend:
    platform: linux/arm64
    environment:
      WEB_CONCURRENCY: "${WEB_CONCURRENCY}"
      PYTHONOPTIMIZE: "2"
      MALLOC_ARENA_MAX: "2"
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-delay 1 --workers 1
    deploy:
      resources:
        limits:
          memory: ${BACKEND_MEM_MB}M
          cpus: "${BACKEND_CPUS}.0"

  worker:
    platform: linux/arm64
    environment:
      PYTHONOPTIMIZE: "2"
      MALLOC_ARENA_MAX: "4"
    deploy:
      replicas: ${WORKER_REPLICAS}
      resources:
        limits:
          memory: ${WORKER_MEM_MB}M
          cpus: "${WORKER_CPUS}.0"
    ulimits:
      nofile:
        soft: 131072
        hard: 131072

  frontend:
    platform: linux/arm64
    environment:
      NODE_OPTIONS: "--max-old-space-size=512"
      NEXT_TELEMETRY_DISABLED: "1"
    deploy:
      resources:
        limits:
          memory: ${FRONTEND_MEM_MB}M
          cpus: "${FRONTEND_CPUS}.0"
OVERRIDE

ok "${M4_OVERRIDE} gerado"

# ── 7. Verificar modo de operação ─────────────────────────────────────────────
MODE="${1:-dev}"
case "$MODE" in
  dev)
    COMPOSE_CMD="docker compose -f docker-compose.yml -f $M4_OVERRIDE"
    log "Modo: DESENVOLVIMENTO (hot-reload ativo)"
    ;;
  prod)
    COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f $M4_OVERRIDE"
    log "Modo: PRODUÇÃO (sem hot-reload, otimizado)"
    ;;
  *)
    die "Modo inválido: '$MODE'. Use: ./start-m4.sh [dev|prod]"
    ;;
esac

# ── 8. Build das imagens ───────────────────────────────────────────────────────
echo ""
log "Construindo imagens Docker para arm64..."
log "Usando buildkit paralelo — isso pode demorar alguns minutos na primeira vez."

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export BUILDKIT_PROGRESS=plain

# Detecta se as imagens já existem (build incremental)
if $COMPOSE_CMD images -q backend 2>/dev/null | grep -q .; then
  log "Imagens existentes encontradas — rebuild incremental (mais rápido)."
  $COMPOSE_CMD build --parallel
else
  log "Primeira build — pode demorar 5-10 minutos (instalando ferramentas de segurança)..."
  $COMPOSE_CMD build --parallel
fi

ok "Build concluído"

# ── 9. Subir serviços ─────────────────────────────────────────────────────────
echo ""
log "Iniciando serviços..."
$COMPOSE_CMD up -d

# ── 10. Aguardar healthchecks ─────────────────────────────────────────────────
echo ""
log "Aguardando serviços ficarem saudáveis..."

wait_healthy() {
  local service="$1"
  local max_wait="${2:-120}"
  local elapsed=0
  local interval=3

  while [[ $elapsed -lt $max_wait ]]; do
    local status
    status=$($COMPOSE_CMD ps "$service" --format json 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health','unknown') if isinstance(d,dict) else [x.get('Health','unknown') for x in d][0])" 2>/dev/null \
      || echo "unknown")

    case "$status" in
      healthy)
        ok "  $service está saudável"
        return 0
        ;;
      starting)
        printf "\r  Aguardando %-15s [%ds]..." "$service" "$elapsed"
        ;;
      unhealthy)
        echo ""
        warn "  $service reportou unhealthy — veja os logs: docker compose logs $service"
        return 1
        ;;
      *)
        printf "\r  Aguardando %-15s [%ds]..." "$service" "$elapsed"
        ;;
    esac

    sleep $interval
    elapsed=$(( elapsed + interval ))
  done

  echo ""
  warn "  $service não ficou saudável em ${max_wait}s"
  return 1
}

wait_healthy mongodb 120
wait_healthy redis    60
wait_healthy backend  180

echo ""

# ── 11. Status final ───────────────────────────────────────────────────────────
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                  Plataforma no ar!                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  %-20s %s\n" "Frontend:"  "http://localhost:3000             ║"
printf "║  %-20s %s\n" "API REST:"  "http://localhost:8000             ║"
printf "║  %-20s %s\n" "API Docs:"  "http://localhost:8000/docs        ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  ARQ Workers ativos:   %-34s ║\n" "$WORKER_REPLICAS réplicas"
printf "║  Uvicorn workers:      %-34s ║\n" "$WEB_CONCURRENCY"
printf "║  MongoDB WiredTiger:   %-34s ║\n" "${MONGO_CACHE_GB} GB cache"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

echo "Comandos úteis:"
echo "  make logs          — logs de todos os serviços"
echo "  make logs-worker   — logs dos workers (scans)"
echo "  make status        — status dos containers"
echo "  make tools-check   — verificar ferramentas de segurança"
echo "  make scan-now      — disparar scan manualmente"
echo "  make down          — parar tudo"
echo ""
echo "  Para parar: Ctrl+C ou 'make down'"
echo ""

# ── 12. Tail de logs (opcional) ───────────────────────────────────────────────
if [[ "${LOGS:-0}" == "1" ]]; then
  log "Exibindo logs (Ctrl+C para sair sem parar os serviços)..."
  $COMPOSE_CMD logs -f
fi
