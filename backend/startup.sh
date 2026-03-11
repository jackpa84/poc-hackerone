#!/bin/bash
# startup.sh — Script de inicialização dos containers
#
# Responsabilidades:
#   1. Aguarda MongoDB e Redis ficarem prontos (evita crash na inicialização)
#   2. Baixa wordlists do SecLists se ainda não existirem
#   3. Atualiza templates do Nuclei (base de dados de vulnerabilidades)
#   4. Executa o comando passado como argumento ($@)

set -e

echo "╔══════════════════════════════════════╗"
echo "║    BugBounty Platform — Startup      ║"
echo "╚══════════════════════════════════════╝"

# ── 1. Aguarda MongoDB ───────────────────────────────────────────────────────
echo "[startup] Aguardando MongoDB..."
until python3 -c "
import pymongo, os, sys
try:
    pymongo.MongoClient(os.environ['MONGO_URI'], serverSelectionTimeoutMS=2000).admin.command('ping')
    sys.exit(0)
except:
    sys.exit(1)
" 2>/dev/null; do
    echo "[startup]   MongoDB não disponível ainda, aguardando 3s..."
    sleep 3
done
echo "[startup] ✓ MongoDB pronto."

# ── 2. Aguarda Redis ─────────────────────────────────────────────────────────
echo "[startup] Aguardando Redis..."
until python3 -c "
import redis, os, sys
try:
    redis.from_url(os.environ['REDIS_URL']).ping()
    sys.exit(0)
except:
    sys.exit(1)
" 2>/dev/null; do
    echo "[startup]   Redis não disponível ainda, aguardando 3s..."
    sleep 3
done
echo "[startup] ✓ Redis pronto."

# ── 3. Wordlists do SecLists ─────────────────────────────────────────────────
WORDLIST_DIR="/app/tools/wordlists"
mkdir -p "$WORDLIST_DIR"

SECLISTS_BASE="https://raw.githubusercontent.com/danielmiessler/SecLists/master"

if [ ! -f "$WORDLIST_DIR/dirs.txt" ] || [ "$(wc -l < "$WORDLIST_DIR/dirs.txt")" -lt 100 ]; then
    echo "[startup] Baixando wordlist de diretórios (SecLists common.txt)..."
    wget -q --timeout=30 \
        "$SECLISTS_BASE/Discovery/Web-Content/common.txt" \
        -O "$WORDLIST_DIR/dirs.txt" \
        && echo "[startup] ✓ dirs.txt ($(wc -l < "$WORDLIST_DIR/dirs.txt") palavras)" \
        || echo "[startup] ⚠ Falha ao baixar dirs.txt, usando wordlist embutida"
fi

if [ ! -f "$WORDLIST_DIR/subdomains.txt" ]; then
    echo "[startup] Baixando wordlist de subdomínios..."
    wget -q --timeout=30 \
        "$SECLISTS_BASE/Discovery/DNS/subdomains-top1million-5000.txt" \
        -O "$WORDLIST_DIR/subdomains.txt" \
        && echo "[startup] ✓ subdomains.txt ($(wc -l < "$WORDLIST_DIR/subdomains.txt") palavras)" \
        || echo "[startup] ⚠ Falha ao baixar subdomains.txt"
fi

if [ ! -f "$WORDLIST_DIR/params.txt" ]; then
    echo "[startup] Baixando wordlist de parâmetros..."
    wget -q --timeout=30 \
        "$SECLISTS_BASE/Discovery/Web-Content/burp-parameter-names.txt" \
        -O "$WORDLIST_DIR/params.txt" \
        && echo "[startup] ✓ params.txt ($(wc -l < "$WORDLIST_DIR/params.txt") palavras)" \
        || echo "[startup] ⚠ Falha ao baixar params.txt"
fi

if [ ! -f "$WORDLIST_DIR/api-paths.txt" ]; then
    echo "[startup] Baixando wordlist de endpoints de API..."
    wget -q --timeout=30 \
        "$SECLISTS_BASE/Discovery/Web-Content/api/api-endpoints.txt" \
        -O "$WORDLIST_DIR/api-paths.txt" \
        && echo "[startup] ✓ api-paths.txt" \
        || echo "[startup] ⚠ Falha ao baixar api-paths.txt"
fi

# ── 4. Templates do Nuclei ───────────────────────────────────────────────────
if command -v nuclei &>/dev/null; then
    NUCLEI_TEMPLATES_DIR="$HOME/.local/nuclei-templates"
    if [ ! -d "$NUCLEI_TEMPLATES_DIR" ]; then
        echo "[startup] Baixando templates do Nuclei (primeira vez)..."
        nuclei -update-templates -silent 2>/dev/null \
            && echo "[startup] ✓ Templates do Nuclei instalados" \
            || echo "[startup] ⚠ Falha ao instalar templates do Nuclei"
    else
        echo "[startup] ✓ Templates do Nuclei já presentes, verificando atualizações..."
        nuclei -update-templates -silent 2>/dev/null || true
    fi
fi

# ── 5. Verifica ferramentas disponíveis ──────────────────────────────────────
echo "[startup] Ferramentas disponíveis:"
for tool in subfinder httpx gau nuclei naabu dnsx katana nmap; do
    if command -v "$tool" &>/dev/null; then
        echo "[startup]   ✓ $tool"
    else
        echo "[startup]   ✗ $tool (não encontrado)"
    fi
done

echo "[startup] ══════════════════════════════════════"
echo "[startup] Iniciando: $@"
echo "[startup] ══════════════════════════════════════"

# Executa o comando passado (uvicorn ou arq)
exec "$@"
