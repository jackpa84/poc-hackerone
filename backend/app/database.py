"""
database.py — Conexão com MongoDB via Beanie e Redis

Beanie é um ODM (Object Document Mapper) assíncrono para MongoDB.
Funciona como um ORM, mas para documentos JSON ao invés de tabelas SQL.

Como funciona:
1. Definimos classes Python que herdam de Document (em models/)
2. Beanie converte automaticamente entre objetos Python e documentos MongoDB
3. A conexão é inicializada uma vez no startup da aplicação
"""
import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.config import settings
from app.models.user import User
from app.models.target import Target
from app.models.job import Job
from app.models.finding import Finding
from app.models.report import Report

# Global Redis client
redis_client: redis.Redis = None

async def init_db():
    """
    Inicializa a conexão com MongoDB e registra todos os modelos no Beanie.
    Chamado no startup da aplicação FastAPI (ver main.py).
    """
    global redis_client

    # Inicializar Redis
    redis_client = redis.Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True
    )

    # Inicializar MongoDB
    client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(
        database=client.bugbounty,
        document_models=[User, Target, Job, Finding, Report],
    )
