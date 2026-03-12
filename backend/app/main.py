"""
main.py — Ponto de entrada da aplicação FastAPI

Responsabilidades:
  1. Cria a instância do FastAPI
  2. Configura CORS (permite o frontend chamar a API)
  3. Configura rate limiting via slowapi
  4. Inicializa o MongoDB no startup via lifespan
  5. Registra todas as rotas
  6. Fornece endpoint de healthcheck
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import init_db
from app.api.router import router
from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Rate limiter — usa o IP do cliente como chave
limiter = Limiter(key_func=get_remote_address, default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Executado uma vez quando a API inicia."""
    logger.info("[startup] Inicializando banco de dados...")
    await init_db()
    logger.info("[startup] MongoDB e Redis prontos.")
    yield
    logger.info("[shutdown] API encerrada.")


app = FastAPI(
    title="Bug Bounty Platform",
    description="Plataforma de gerenciamento de bug bounty com IA",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — permite que o frontend (localhost:3000) acesse a API (localhost:8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://0.0.0.0:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    """Endpoint usado pelo Docker para verificar se a API está respondendo."""
    return {"status": "ok", "service": "bugbounty-api"}
