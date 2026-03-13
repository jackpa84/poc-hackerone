"""
config.py — Configurações globais da aplicação

Pydantic-settings lê automaticamente do arquivo .env ou variáveis de ambiente.
Acesse em qualquer lugar com: from app.config import settings
"""
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # MongoDB
    MONGO_URI: str = "mongodb://admin:changeme@localhost:27017/bugbounty?authSource=admin"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    ENABLE_CACHING: bool = True

    # JWT — segurança de autenticação
    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24

    # Claude (Anthropic) — fallback se Ollama não estiver disponível
    ANTHROPIC_API_KEY: str = ""

    # Ollama — modelo local (prioridade sobre Claude)
    OLLAMA_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "xploiter/the-xploiter:latest"
    OLLAMA_TIMEOUT: int = 30  # segundos antes de fazer fallback para Claude

    # HackerOne API (aceita ambos os nomes de variável)
    HACKERONE_USERNAME: str = ""      # compatibilidade legada
    HACKERONE_API_USERNAME: str = ""  # nome preferido
    HACKERONE_API_TOKEN: str = ""

    # Recon — APIs opcionais para ampliar descoberta de subdomínios/URLs
    URLSCAN_API_KEY: str = ""          # urlscan.io (sem key: 100 resultados; com key: mais)
    OTX_API_KEY: str = ""              # AlienVault OTX (sem key funciona com rate limit)
    SHODAN_API_KEY: str = ""           # Shodan (subfinder)
    CENSYS_API_ID: str = ""            # Censys API ID (subfinder)
    CENSYS_API_SECRET: str = ""        # Censys API Secret (subfinder)
    CHAOS_API_KEY: str = ""            # ProjectDiscovery Chaos
    VIRUSTOTAL_API_KEY: str = ""       # VirusTotal (subfinder)
    SECURITYTRAILS_TOKEN: str = ""     # SecurityTrails (subfinder)

    # Worker — número máximo de jobs concorrentes por instância
    MAX_JOBS: int = 10

    # Rate limiting — requisições por minuto por IP
    RATE_LIMIT_PER_MINUTE: int = 120

    @property
    def h1_username(self) -> str:
        return self.HACKERONE_API_USERNAME or self.HACKERONE_USERNAME

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def validate_security(self) -> None:
        """Loga avisos para configurações inseguras ou incompletas."""
        weak_jwt = "dev-secret-change-in-production"
        if self.JWT_SECRET == weak_jwt or len(self.JWT_SECRET) < 32:
            logger.warning(
                "[SECURITY] JWT_SECRET fraco ou padrão! Defina um segredo forte (>=32 chars) no .env"
            )
        if not self.ANTHROPIC_API_KEY:
            logger.warning(
                "[CONFIG] ANTHROPIC_API_KEY não configurada. "
                "Geração de relatórios com IA usará apenas Ollama."
            )
        if not self.HACKERONE_API_TOKEN:
            logger.warning(
                "[CONFIG] HACKERONE_API_TOKEN não configurada. "
                "Integração com HackerOne estará indisponível."
            )


# Instância única importada por todo o projeto
settings = Settings()
settings.validate_security()
