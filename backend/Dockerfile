# ─── Imagem final ───────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Dependências do sistema
RUN apt-get update && apt-get install -y \
    curl wget git nmap libpcap-dev ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

# ─── Ferramentas de segurança (binários pré-compilados) ──────────────────────
# Detecta arquitetura automaticamente (amd64 ou arm64)
RUN set -e; \
    ARCH=$(uname -m); \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then GOARCH="arm64"; else GOARCH="amd64"; fi; \
    echo "Instalando ferramentas para $ARCH ($GOARCH)..."; \
    \
    # subfinder — enumeração de subdomínios
    wget -q "https://github.com/projectdiscovery/subfinder/releases/download/v2.6.6/subfinder_2.6.6_linux_${GOARCH}.zip" \
        -O /tmp/subfinder.zip \
    && unzip -q /tmp/subfinder.zip -d /tmp/subfinder \
    && mv /tmp/subfinder/subfinder /usr/local/bin/ \
    && rm -rf /tmp/subfinder.zip /tmp/subfinder \
    && echo "✓ subfinder"; \
    \
    # httpx — HTTP probe (versão CLI Go, diferente do pip httpx)
    wget -q "https://github.com/projectdiscovery/httpx/releases/download/v1.6.10/httpx_1.6.10_linux_${GOARCH}.zip" \
        -O /tmp/httpx.zip \
    && unzip -q /tmp/httpx.zip -d /tmp/httpx \
    && mv /tmp/httpx/httpx /usr/local/bin/httpx-cli \
    && rm -rf /tmp/httpx.zip /tmp/httpx \
    && echo "✓ httpx-cli"; \
    \
    # gau — coleta URLs históricas (Wayback + Common Crawl)
    wget -q "https://github.com/lc/gau/releases/download/v2.2.4/gau_2.2.4_linux_${GOARCH}.tar.gz" \
        -O /tmp/gau.tar.gz \
    && tar xzf /tmp/gau.tar.gz -C /tmp gau \
    && mv /tmp/gau /usr/local/bin/ \
    && rm /tmp/gau.tar.gz \
    && echo "✓ gau"; \
    \
    # nuclei — scanner de vulnerabilidades baseado em templates
    wget -q "https://github.com/projectdiscovery/nuclei/releases/download/v3.3.9/nuclei_3.3.9_linux_${GOARCH}.zip" \
        -O /tmp/nuclei.zip \
    && unzip -q /tmp/nuclei.zip -d /tmp/nuclei \
    && mv /tmp/nuclei/nuclei /usr/local/bin/ \
    && rm -rf /tmp/nuclei.zip /tmp/nuclei \
    && echo "✓ nuclei"; \
    \
    # naabu — port scanner rápido
    wget -q "https://github.com/projectdiscovery/naabu/releases/download/v2.3.3/naabu_2.3.3_linux_${GOARCH}.zip" \
        -O /tmp/naabu.zip \
    && unzip -q /tmp/naabu.zip -d /tmp/naabu \
    && mv /tmp/naabu/naabu /usr/local/bin/ \
    && rm -rf /tmp/naabu.zip /tmp/naabu \
    && echo "✓ naabu"; \
    \
    # dnsx — resolução DNS multi-propósito
    wget -q "https://github.com/projectdiscovery/dnsx/releases/download/v1.2.1/dnsx_1.2.1_linux_${GOARCH}.zip" \
        -O /tmp/dnsx.zip \
    && unzip -q /tmp/dnsx.zip -d /tmp/dnsx \
    && mv /tmp/dnsx/dnsx /usr/local/bin/ \
    && rm -rf /tmp/dnsx.zip /tmp/dnsx \
    && echo "✓ dnsx"; \
    \
    # katana — web crawler moderno
    wget -q "https://github.com/projectdiscovery/katana/releases/download/v1.1.2/katana_1.1.2_linux_${GOARCH}.zip" \
        -O /tmp/katana.zip \
    && unzip -q /tmp/katana.zip -d /tmp/katana \
    && mv /tmp/katana/katana /usr/local/bin/ \
    && rm -rf /tmp/katana.zip /tmp/katana \
    && echo "✓ katana"

# Sobrescreve httpx do pip pela versão CLI do Go (renomeia para evitar conflito)
# Workers usam "httpx" para se referir ao CLI do Go
RUN ln -sf /usr/local/bin/httpx-cli /usr/local/bin/httpx-go

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Script de inicialização
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 8000
