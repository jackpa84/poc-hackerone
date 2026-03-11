"""
config.py — Configurações globais da aplicação

Pydantic-settings lê automaticamente do arquivo .env ou variáveis de ambiente.
Acesse em qualquer lugar com: from app.config import settings
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    ANTHROPIC_API_KEY: str = "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"

    # Ollama — modelo local (prioridade sobre Claude)
    OLLAMA_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "xploiter/the-xploiter:latest"

    # HackerOne API (aceita ambos os nomes de variável)
    HACKERONE_USERNAME: str = ""      # compatibilidade legada
    HACKERONE_API_USERNAME: str = ""  # nome preferido
    HACKERONE_API_TOKEN: str = ""

    @property
    def h1_username(self) -> str:
        return self.HACKERONE_API_USERNAME or self.HACKERONE_USERNAME

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# Instância única importada por todo o projeto
settings = Settings()
