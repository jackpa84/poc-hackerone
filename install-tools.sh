#!/bin/bash
# install-tools.sh — Instala as novas ferramentas nos workers em execução
# Execute com: bash install-tools.sh

set -e

echo "=== Instalando ferramentas nos workers ==="

# Detecta containers worker em execução
WORKERS=$(docker ps --format "{{.Names}}" | grep "worker")
if [ -z "$WORKERS" ]; then
  echo "❌ Nenhum worker encontrado. Execute: docker-compose up -d"
  exit 1
fi

install_in_container() {
  local CONTAINER=$1
  echo ""
  echo "--- Instalando em: $CONTAINER ---"

  docker exec "$CONTAINER" bash -c '
    ARCH=$(uname -m)
    [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ] && GOARCH=arm64 || GOARCH=amd64
    echo "Arch: $ARCH / $GOARCH"

    # Dalfox — scanner XSS
    if ! command -v dalfox &>/dev/null; then
      wget -q "https://github.com/hahwul/dalfox/releases/download/v2.9.2/dalfox_linux_${GOARCH}.tar.gz" -O /tmp/dalfox.tar.gz \
        && tar xzf /tmp/dalfox.tar.gz -C /tmp \
        && mv /tmp/dalfox /usr/local/bin/ \
        && rm -f /tmp/dalfox.tar.gz \
        && echo "✓ dalfox $(dalfox version 2>&1 | head -1)" \
        || echo "✗ dalfox failed"
    else
      echo "✓ dalfox já instalado"
    fi

    # Gitleaks — detector de secrets em Git
    if ! command -v gitleaks &>/dev/null; then
      wget -q "https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_${GOARCH}.tar.gz" -O /tmp/gitleaks.tar.gz \
        && tar xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks \
        && mv /tmp/gitleaks /usr/local/bin/ \
        && rm -f /tmp/gitleaks.tar.gz \
        && echo "✓ gitleaks $(gitleaks version 2>&1 | head -1)" \
        || echo "✗ gitleaks failed"
    else
      echo "✓ gitleaks já instalado"
    fi

    # SQLMap — SQL Injection
    if [ ! -f /usr/local/bin/sqlmap/sqlmap.py ]; then
      git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /usr/local/bin/sqlmap 2>&1 | tail -2 \
        && echo "✓ sqlmap instalado" \
        || echo "✗ sqlmap failed"
    else
      echo "✓ sqlmap já instalado"
    fi

    # Arjun — descoberta de parâmetros HTTP
    if ! python3 -m arjun --help &>/dev/null 2>&1; then
      pip install --no-cache-dir arjun -q \
        && echo "✓ arjun $(python3 -m arjun --version 2>&1 | head -1)" \
        || echo "✗ arjun failed"
    else
      echo "✓ arjun já instalado"
    fi

    # Kiterunner — descoberta de rotas de API
    if ! command -v kr &>/dev/null; then
      wget -q "https://github.com/assetnote/kiterunner/releases/download/v1.0.2/kiterunner_1.0.2_linux_${GOARCH}.tar.gz" -O /tmp/kr.tar.gz \
        && tar xzf /tmp/kr.tar.gz -C /tmp \
        && mv /tmp/kr /usr/local/bin/ \
        && rm -f /tmp/kr.tar.gz \
        && echo "✓ kiterunner $(kr version 2>&1 | head -1)" \
        || echo "✗ kiterunner failed"
    else
      echo "✓ kiterunner já instalado"
    fi

    # Kiterunner wordlist (pequena)
    if [ ! -f /usr/local/share/kiterunner/routes-small.kite ]; then
      mkdir -p /usr/local/share/kiterunner
      wget -q "https://wordlists-cdn.assetnote.io/data/kiterunner/routes-small.kite" \
        -O /usr/local/share/kiterunner/routes-small.kite \
        && echo "✓ kiterunner wordlist" \
        || echo "⚠ kiterunner wordlist não disponível (opcional)"
    fi
  '
}

# Instala em todos os workers
for CONTAINER in $WORKERS; do
  install_in_container "$CONTAINER"
done

echo ""
echo "=== Verificando instalações ==="
FIRST_WORKER=$(echo "$WORKERS" | head -1)
docker exec "$FIRST_WORKER" bash -c '
  echo "dalfox:    $(command -v dalfox && dalfox version 2>&1 | head -1 || echo "NÃO INSTALADO")"
  echo "gitleaks:  $(command -v gitleaks && gitleaks version || echo "NÃO INSTALADO")"
  echo "sqlmap:    $([ -f /usr/local/bin/sqlmap/sqlmap.py ] && echo "OK (/usr/local/bin/sqlmap/sqlmap.py)" || echo "NÃO INSTALADO")"
  echo "arjun:     $(python3 -m arjun --version 2>&1 | head -1 || echo "NÃO INSTALADO")"
  echo "kiterunner:$(command -v kr && kr version 2>&1 | head -1 || echo "NÃO INSTALADO")"
'

echo ""
echo "✅ Instalação concluída! Os novos jobs já estão disponíveis."
echo ""
echo "Novos tipos de job disponíveis:"
echo "  - xss_scan        → Dalfox (XSS)"
echo "  - sqli_scan       → SQLMap (SQL Injection)"
echo "  - param_discovery → Arjun (parâmetros ocultos)"
echo "  - js_analysis     → LinkFinder + SecretFinder custom (JavaScript)"
echo "  - secret_scan     → Gitleaks (secrets em Git)"
echo "  - api_scan        → Kiterunner + Nuclei (rotas de API)"
