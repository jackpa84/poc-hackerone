#!/usr/bin/env bash
# deploy/setup-ec2.sh — Setup completo da EC2 para bugbounty-platform
#
# Uso:
#   chmod +x deploy/setup-ec2.sh
#   ./deploy/setup-ec2.sh --domain bugbounty.exemplo.com --email seu@email.com
#
# Pré-requisitos:
#   - EC2 Ubuntu 22.04 ou 24.04 (t3.xlarge recomendado: 4 vCPU, 16GB RAM)
#   - Security Group com inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS)
#   - DNS apontando para o IP da EC2 ANTES de rodar esse script
#   - Repositório clonado em ~/bugbounty-platform (ou PATH_APP)

set -euo pipefail

# ── Variáveis ────────────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
PATH_APP="${HOME}/bugbounty-platform"
COMPOSE_CMD="docker compose"

# ── Parse de argumentos ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    --path)   PATH_APP="$2"; shift 2 ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Uso: $0 --domain SEU_DOMINIO --email SEU_EMAIL"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  BugBounty Platform — EC2 Setup                      ║"
echo "║  Domínio : $DOMAIN"
echo "║  Email   : $EMAIL"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Atualizar sistema e instalar dependências ──────────────────────────────
echo "[1/7] Atualizando sistema..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq curl git ufw

# ── 2. Instalar Docker ────────────────────────────────────────────────────────
echo "[2/7] Instalando Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker instalado. NOTA: Se necessário, faça logout/login para aplicar grupo docker."
else
  echo "  Docker já instalado: $(docker --version)"
fi

# Verifica Docker Compose V2
if ! docker compose version &>/dev/null; then
  echo "  Instalando Docker Compose plugin..."
  sudo apt-get install -y docker-compose-plugin
fi
echo "  Docker Compose: $(docker compose version)"

# ── 3. Configurar firewall (UFW) ──────────────────────────────────────────────
echo "[3/7] Configurando firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw --force enable
echo "  UFW ativo. Status:"
sudo ufw status verbose

# ── 4. Configurar .env ────────────────────────────────────────────────────────
echo "[4/7] Configurando variáveis de ambiente..."
cd "$PATH_APP"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "  ATENÇÃO: .env criado a partir do .env.example."
  echo "  Edite o arquivo AGORA antes de continuar:"
  echo ""
  echo "    nano $PATH_APP/.env"
  echo ""
  echo "  Variáveis obrigatórias:"
  echo "    MONGO_PASSWORD    — senha forte para o MongoDB"
  echo "    JWT_SECRET        — string aleatória de 256 bits"
  echo "    ANTHROPIC_API_KEY — sua chave da Anthropic"
  echo ""
  read -rp "  Pressione ENTER após editar o .env para continuar..."
else
  echo "  .env já existe, mantendo."
fi

# Atualiza NEXT_PUBLIC_API_URL para o domínio real
sed -i "s|NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=https://${DOMAIN}/api|g" .env
echo "  NEXT_PUBLIC_API_URL=https://${DOMAIN}/api"

# ── 5. Configurar domínio no Nginx ────────────────────────────────────────────
echo "[5/7] Configurando domínio no Nginx..."
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" nginx/conf.d/app.conf
echo "  Substituído YOUR_DOMAIN → ${DOMAIN} em nginx/conf.d/app.conf"

# ── 6. Primeira subida (HTTP apenas) para obter certificado ──────────────────
echo "[6/7] Subindo stack em modo HTTP para emitir certificado SSL..."

# Sobe sem HTTPS para que o certbot possa fazer o desafio HTTP
$COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml up -d nginx mongodb redis backend frontend

echo "  Aguardando Nginx iniciar..."
sleep 10

# Emite o certificado
echo "  Emitindo certificado Let's Encrypt para ${DOMAIN}..."
$COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

echo "  Certificado emitido com sucesso."

# ── 7. Reiniciar com SSL ──────────────────────────────────────────────────────
echo "[7/7] Reiniciando stack completa com SSL..."
$COMPOSE_CMD -f docker-compose.yml -f docker-compose.prod.yml up -d

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Deploy concluído!                                   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Frontend : https://${DOMAIN}"
echo "║  API      : https://${DOMAIN}/api"
echo "║  API Docs : https://${DOMAIN}/docs"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Comandos úteis:                                     ║"
echo "║  Logs     : docker compose logs -f --tail=100        ║"
echo "║  Workers  : docker compose logs -f worker            ║"
echo "║  Restart  : docker compose restart backend           ║"
echo "║  Update   : ./deploy/update.sh                       ║"
echo "╚══════════════════════════════════════════════════════╝"
